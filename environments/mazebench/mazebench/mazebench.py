from __future__ import annotations

import json
import os
import re
import select
import signal
import shlex
import subprocess
from functools import lru_cache
from importlib.resources import files
from pathlib import Path
from string import Template
from typing import Any

from datasets import Dataset

import verifiers as vf
from verifiers.utils.message_utils import concat_messages, normalize_messages


DEFAULT_GAME_ID = "maze"
DEFAULT_START_LEVEL_ID = "level_HxI"
DEFAULT_VIEW = "top-diagonal"
DEFAULT_YAW = 0
DEFAULT_NODE_BIN = "node"
DEFAULT_TIMEOUT_SECONDS = 20
DEFAULT_MAX_TURNS = 40
DEFAULT_TARGET_GEMS = 0
DEFAULT_MEMORY_COMPACTION_TOKEN_RATIO = 0.9
DEFAULT_MEMORY_COMPACTION_MAX_TOKENS = 1024
DEFAULT_MODEL_CONTEXT_TOKENS = 128_000
GAME_WON_GEM_COUNT = 100
ROOM_EXPLORATION_REWARD_WEIGHT = 0.1
REPO_ROOT_ENV = "MAZEBENCH_REPO_ROOT"
INFO_KEY = "mazebench"

DEATH_MESSAGE = "The player died, you must now undo or reset or go to a level."
ALIVE_ALLOWED_COMMANDS = (
    "up",
    "down",
    "left",
    "right",
    "rotate camera up",
    "rotate camera down",
    "rotate camera left",
    "rotate camera right",
    "undo",
    "reset",
    "go to level X Y",
    "quit",
)
DEAD_ALLOWED_COMMANDS = (
    "undo",
    "reset",
    "go to level X Y",
)

PROMPT_DIR = "prompts"
MULTITURN_SYSTEM_PROMPT_FILE = "multiturn_system.txt"
MULTITURN_USER_PROMPT_FILE = "multiturn_user.txt"
MEMORY_COMPACTION_SYSTEM_PROMPT = """You maintain compact memory for Mazebench.
Summarize the transcript for the same model to keep playing later. Return only
the memory summary, not a game command.

The returned memory replaces the older transcript. It must cover both the
existing memory summary and the gameplay since that summary.

Keep:
- objective and win condition
- current room, player position, view, yaw, gems collected, visited rooms
- useful map facts, routes, blockers, failed moves, and successful moves
- current plan and next likely action

Forget:
- repeated ASCII screens unless a detail matters
- invalid empty responses or formatting mistakes
- generic instructions already present in the system prompt"""
ROW_FIELD_NAMES = {
    "example_id",
    "game_id",
    "game_won_gem_count",
    "level_id",
    "node_bin",
    "observation",
    "repo_root",
    "target_gems",
    "timeout_seconds",
    "view",
    "yaw",
}
INFO_ROW_FIELD_NAMES = {
    "game_won_gem_count",
    "level_id",
    "node_bin",
    "repo_root",
    "target_gems",
    "timeout_seconds",
    "view",
    "yaw",
}
MODEL_CONTEXT_TOKEN_LIMITS: tuple[tuple[str, int], ...] = (
    (r"(^|/)gpt-4\.1(?:-|$)", 1_047_576),
    (r"(^|/)gpt-5(?:[.-]\d+)?(?:-|$|/)", 400_000),
    (r"(^|/)gpt-4o(?:-|$)", 128_000),
    (r"(^|/)gpt-4\.5(?:-|$)", 128_000),
    (r"(^|/)o[134](?:-|$)", 200_000),
    (r"claude", 200_000),
    (r"gemini", 1_048_576),
    (r"qwen3", 262_144),
    (r"qwen", 128_000),
    (r"deepseek", 128_000),
    (r"glm", 128_000),
)


def reasoning_value_to_text(value: object) -> str | None:
    if value is None:
        return None

    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None

    if hasattr(value, "model_dump"):
        try:
            return reasoning_value_to_text(value.model_dump())
        except Exception:
            return str(value)

    if isinstance(value, list):
        parts = [reasoning_value_to_text(item) for item in value]
        text = "\n".join(part for part in parts if part)
        if text.strip():
            return text.strip()
        try:
            return json.dumps(value, ensure_ascii=False)
        except TypeError:
            return str(value)

    if isinstance(value, dict):
        preferred_keys = (
            "text",
            "content",
            "reasoning",
            "reasoning_content",
            "summary",
            "message",
            "data",
        )
        parts = [
            reasoning_value_to_text(value[key])
            for key in preferred_keys
            if key in value
        ]
        text = "\n".join(part for part in parts if part)
        if text.strip():
            return text.strip()
        try:
            return json.dumps(value, ensure_ascii=False)
        except TypeError:
            return str(value)

    return str(value)


def install_reasoning_content_parser_patch() -> None:
    try:
        from verifiers.clients import openai_chat_completions_client as chat_client
    except Exception:
        return

    if getattr(chat_client, "_mazebench_reasoning_parser_patch", False):
        return

    def parse_reasoning_content(message: Any) -> str | None:
        try:
            message_dict = message.model_dump()
        except Exception:
            message_dict = dict(message) if isinstance(message, dict) else {}

        if not isinstance(message_dict, dict):
            return None

        for field in chat_client.DEFAULT_REASONING_FIELDS:
            text = reasoning_value_to_text(message_dict.get(field))
            if text:
                return text

        return None

    chat_client.parse_reasoning_content = parse_reasoning_content
    chat_client._mazebench_reasoning_parser_patch = True


install_reasoning_content_parser_patch()


def read_prompt_file(filename: str) -> str:
    return (
        files(__package__ or "mazebench")
        .joinpath(PROMPT_DIR, filename)
        .read_text(encoding="utf8")
        .rstrip()
    )


def render_prompt_file(filename: str, **values: object) -> str:
    return Template(read_prompt_file(filename)).substitute(
        {key: str(value) for key, value in values.items()}
    )


MULTITURN_SYSTEM_PROMPT = read_prompt_file(MULTITURN_SYSTEM_PROMPT_FILE)

LEVEL_ID_PATTERN = re.compile(r"^(?:level_)?([A-Z])x([A-Z])$")


def normalize_level_id(value: str | None) -> str:
    level_id = str(value or DEFAULT_START_LEVEL_ID).strip()
    match = LEVEL_ID_PATTERN.fullmatch(level_id)

    if not match:
        return level_id

    return f"level_{match.group(1)}x{match.group(2)}"


def parse_level_ids(
    level_ids: str | list[str] | tuple[str, ...] | None,
    start_level_id: str,
) -> list[str]:
    if level_ids is None:
        return [normalize_level_id(start_level_id)]

    if isinstance(level_ids, str):
        values = [
            part.strip()
            for part in re.split(r"[,\\s]+", level_ids)
            if part.strip()
        ]
    else:
        values = [str(part).strip() for part in level_ids if str(part).strip()]

    return [normalize_level_id(value) for value in values] or [
        normalize_level_id(start_level_id)
    ]


def has_terminal_runner(root: Path) -> bool:
    return (root / "scripts" / "maze-terminal.js").is_file()


def has_bridge_runner(root: Path) -> bool:
    return (root / "scripts" / "maze-bridge.js").is_file()


def find_repo_root(configured_root: str | None = None) -> Path:
    candidates: list[Path] = []

    if configured_root:
        candidates.append(Path(configured_root).expanduser())

    env_root = os.environ.get(REPO_ROOT_ENV)
    if env_root:
        candidates.append(Path(env_root).expanduser())

    candidates.append(Path.cwd())
    candidates.append(Path(__file__).resolve().parent / "runtime")
    candidates.extend(Path(__file__).resolve().parents)

    for candidate in candidates:
        resolved = candidate.resolve()
        for root in (resolved, *resolved.parents):
            if has_terminal_runner(root):
                return root

    raise RuntimeError(
        "Could not locate scripts/maze-terminal.js. Run from the PixelGameTest repo "
        f"or set {REPO_ROOT_ENV}=/path/to/PixelGameTest."
    )


def find_bridge_root(configured_root: str | None = None) -> Path:
    root = find_repo_root(configured_root)

    if has_bridge_runner(root):
        return root

    raise RuntimeError(
        "Could not locate scripts/maze-bridge.js. Run from the PixelGameTest repo "
        f"or set {REPO_ROOT_ENV}=/path/to/PixelGameTest."
    )


def run_terminal_json(
    *,
    level_id: str,
    node_bin: str,
    repo_root: Path,
    timeout_seconds: int,
    view: str,
    yaw: int,
) -> dict[str, Any]:
    script_path = repo_root / "scripts" / "maze-terminal.js"
    command = [
        node_bin,
        str(script_path),
        "--level",
        normalize_level_id(level_id),
        "--view",
        view,
        "--yaw",
        str(int(yaw)),
        "--json",
    ]

    result = subprocess.run(
        command,
        cwd=repo_root,
        capture_output=True,
        check=False,
        encoding="utf8",
        timeout=timeout_seconds,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "maze-terminal.js failed with exit code "
            f"{result.returncode}: {(result.stderr or result.stdout).strip()}"
        )

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"maze-terminal.js returned invalid JSON: {result.stdout[:500]}"
        ) from error


def target_text_for_row(row: dict[str, Any]) -> str:
    target_gems = int(row.get("target_gems") or 0)
    if target_gems > 0:
        return (
            f"Collect at least {target_gems} unique gem"
            f"{'' if target_gems == 1 else 's'}."
        )

    game_won_gem_count = int(row.get("game_won_gem_count") or GAME_WON_GEM_COUNT)
    return (
        f"Collect {game_won_gem_count} unique gem"
        f"{'' if game_won_gem_count == 1 else 's'} to win."
    )


def player_fields(player: dict[str, Any] | None) -> dict[str, object]:
    player = player or {}
    return {
        "player_elevation": player.get("elevation", "?"),
        "player_x": player.get("x", "?"),
        "player_y": player.get("y", "?"),
    }


def status_player_dead(status: dict[str, Any]) -> bool:
    return bool(status.get("player_dead"))


def allowed_commands_for_status(status: dict[str, Any]) -> tuple[str, ...]:
    raw_commands = status.get("allowed_commands")
    if isinstance(raw_commands, list) and raw_commands:
        return tuple(str(command) for command in raw_commands)
    return DEAD_ALLOWED_COMMANDS if status_player_dead(status) else ALIVE_ALLOWED_COMMANDS


def allowed_commands_text(status: dict[str, Any]) -> str:
    return "\n".join(f"- {command}" for command in allowed_commands_for_status(status))


def death_text(status: dict[str, Any]) -> str:
    return DEATH_MESSAGE if status_player_dead(status) else ""


def terminal_note_text(status: dict[str, Any]) -> str:
    return "" if status_player_dead(status) else "Typing quit ends the run as a loss."


def response_instruction(status: dict[str, Any]) -> str:
    if status_player_dead(status):
        return "Respond with exactly one command line: `undo`, `reset`, or `go to level H I`."
    return (
        "Respond with exactly one command line, such as `up`, `down`, "
        "`rotate camera left`, `go to level H I`, or `quit`."
    )


def render_multiturn_user_prompt(
    *,
    status: dict[str, Any],
    target_text: str,
    result_text: str,
) -> str:
    visited_rooms = status.get("visited_levels") or []
    return render_prompt_file(
        MULTITURN_USER_PROMPT_FILE,
        allowed_commands=allowed_commands_text(status),
        current_room=status.get("current_room") or status.get("level_id") or "?",
        current_view=status.get("current_view") or status.get("view") or "?",
        death_text=death_text(status),
        gem_count=status.get("gem_count", 0),
        level=status.get("level") or status.get("observation") or "",
        response_instruction=response_instruction(status),
        result_text=result_text,
        target_text=target_text,
        terminal_note=terminal_note_text(status),
        visited_rooms=", ".join(str(room) for room in visited_rooms) or "(none)",
        yaw=status.get("yaw", 0),
        **player_fields(status.get("player")),
    )


def build_multiturn_prompt(row: dict[str, Any]) -> list[dict[str, str]]:
    status = {
        "current_room": row["level_id"],
        "current_view": row["view"],
        "gem_count": 0,
        "level": row["observation"],
        "player": None,
        "visited_levels": [row["level_id"]],
        "yaw": row["yaw"],
    }
    return [
        {
            "role": "user",
            "content": render_multiturn_user_prompt(
                status=status,
                target_text=target_text_for_row(row),
                result_text="Start of run.",
            ),
        }
    ]


def row_mapping(value: object) -> dict[str, Any]:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return row_mapping(parsed)

    if isinstance(value, dict):
        return dict(value)

    if hasattr(value, "keys"):
        try:
            return {str(key): value[key] for key in value.keys()}
        except Exception:
            return {}

    return {}


def message_text(message: object) -> str:
    if isinstance(message, dict):
        content = message.get("content", "")
    else:
        content = getattr(message, "content", "")

    if isinstance(content, list):
        return "\n".join(
            str(part.get("text") or part.get("content") or "")
            if isinstance(part, dict)
            else str(part)
            for part in content
        )

    return str(content or "")


def message_role(message: object) -> str:
    if isinstance(message, dict):
        return str(message.get("role") or "")
    return str(getattr(message, "role", "") or "")


def prompt_text(value: object) -> str:
    if isinstance(value, str):
        return value

    if isinstance(value, list):
        return "\n".join(message_text(message) for message in value)

    return ""


def row_from_prompt(value: object) -> dict[str, Any]:
    text = prompt_text(value)
    if not text:
        return {}

    row: dict[str, Any] = {}
    objective_match = re.search(
        r"Objective:\s*Collect(?: at least)?\s+(\d+)\s+unique gem",
        text,
        re.IGNORECASE,
    )
    if objective_match:
        row["game_won_gem_count"] = int(objective_match.group(1))

    room_match = re.search(r"Current room:\s*`?([A-Za-z0-9_]+x[A-Za-z])`?", text)
    if room_match:
        row["level_id"] = normalize_level_id(room_match.group(1))

    view_match = re.search(r"Current view:\s*([A-Za-z-]+)", text)
    if view_match:
        row["view"] = view_match.group(1)

    yaw_match = re.search(r"Yaw:\s*(-?\d+)", text)
    if yaw_match:
        row["yaw"] = int(yaw_match.group(1))

    return row


def row_from_info(value: object) -> dict[str, Any]:
    info = row_mapping(value)
    if not info:
        return {}

    for key in (INFO_KEY, "maze_row"):
        row = row_mapping(info.get(key))
        if any(field in row for field in ROW_FIELD_NAMES):
            return row

    return {
        field: info[field]
        for field in INFO_ROW_FIELD_NAMES
        if field in info
    }


def row_from_state(state: vf.State) -> dict[str, Any]:
    for key in ("maze_row", "input", "task"):
        row = row_mapping(state.get(key))
        info_row = row_from_info(row.get("info"))
        if info_row:
            row = {**row, **info_row}

        if any(field in row for field in ROW_FIELD_NAMES):
            return row

    info_row = row_from_info(state.get("info"))
    if info_row:
        return info_row

    row = {
        field: state.get(field)
        for field in ROW_FIELD_NAMES
        if state.get(field) is not None
    }
    if any(field in row for field in ROW_FIELD_NAMES):
        return row

    return row_from_prompt(state.get("prompt"))


def compacted_memory_prompt_messages(
    state: vf.State,
    env_response: vf.Messages,
) -> vf.Messages:
    prompt = state.get("prompt") or []
    system_messages = [
        message
        for message in prompt
        if message_role(message) == "system"
    ]
    memory = str(state.get("maze_memory") or "").strip()
    memory_messages = (
        [
            vf.UserMessage(
                content=(
                    "Model memory summary from earlier transcript:\n"
                    f"{memory}"
                )
            )
        ]
        if memory
        else []
    )
    return normalize_messages(
        sanitize_prompt_messages(
            [*system_messages, *memory_messages, *env_response]
        ),
        field_name="prompt_messages",
    )


def normalize_model_name(model: object) -> str:
    return str(model or "").strip().lower()


def known_model_context_tokens(model: object) -> int:
    model_name = normalize_model_name(model)
    for pattern, token_limit in MODEL_CONTEXT_TOKEN_LIMITS:
        if re.search(pattern, model_name):
            return token_limit
    return DEFAULT_MODEL_CONTEXT_TOKENS


@lru_cache(maxsize=32)
def tokenizer_encoding_name(model: str) -> str | None:
    try:
        import tiktoken
    except Exception:
        return None

    model_name = normalize_model_name(model).split("/")[-1]
    try:
        encoding = tiktoken.encoding_for_model(model_name)
    except Exception:
        try:
            encoding = tiktoken.get_encoding("o200k_base")
        except Exception:
            return None
    return str(encoding.name)


@lru_cache(maxsize=32)
def tokenizer_for_encoding(encoding_name: str):
    import tiktoken

    return tiktoken.get_encoding(encoding_name)


def estimate_text_tokens(text: str, model: object = "") -> int:
    if not text:
        return 0

    encoding_name = tokenizer_encoding_name(normalize_model_name(model))
    if encoding_name:
        try:
            return len(tokenizer_for_encoding(encoding_name).encode(text))
        except Exception:
            pass

    # Conservative-ish fallback for providers without an installed tokenizer.
    return max(1, (len(text) + 3) // 4)


def estimate_messages_tokens(messages: vf.Messages, model: object = "") -> int:
    total = 3
    for message in messages:
        total += 4
        total += estimate_text_tokens(message_role(message), model)
        total += estimate_text_tokens(message_content(message), model)
    return total


def transcript_for_memory(messages: vf.Messages) -> str:
    parts: list[str] = []
    for message in messages:
        role = message_role(message) or "message"
        content = message_content(message).strip()
        if not content:
            content = "(empty)"
        parts.append(f"{role}:\n{content}")
    return "\n\n---\n\n".join(parts)


def current_state_messages(messages: vf.Messages) -> vf.Messages:
    for message in reversed(messages):
        if message_role(message) == "user":
            return [message]
    return []


def make_row(
    *,
    example_id: int,
    game_won_gem_count: int,
    level_id: str,
    node_bin: str,
    repo_root: Path,
    target_gems: int,
    timeout_seconds: int,
    view: str,
    yaw: int,
) -> dict[str, Any]:
    payload = run_terminal_json(
        level_id=level_id,
        node_bin=node_bin,
        repo_root=repo_root,
        timeout_seconds=timeout_seconds,
        view=view,
        yaw=yaw,
    )
    row = {
        "example_id": example_id,
        "game_id": DEFAULT_GAME_ID,
        "game_won_gem_count": int(game_won_gem_count),
        "level_id": str(payload["levelId"]),
        "node_bin": node_bin,
        "observation": str(payload["observation"]),
        "repo_root": str(repo_root),
        "target_gems": int(target_gems),
        "timeout_seconds": int(timeout_seconds),
        "view": str(payload["view"]),
        "yaw": int(payload["yaw"]),
    }
    row["info"] = json.dumps(
        {
            INFO_KEY: {
                field: row[field]
                for field in INFO_ROW_FIELD_NAMES
                if field in row
            }
        }
    )
    row["prompt"] = build_multiturn_prompt(row)
    return row


def build_rows(
    *,
    count: int,
    game_won_gem_count: int,
    level_ids: list[str],
    node_bin: str,
    repo_root: Path,
    target_gems: int,
    timeout_seconds: int,
    view: str,
    yaw: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    safe_count = max(0, int(count))

    for index in range(safe_count):
        level_id = level_ids[index % len(level_ids)]
        rows.append(
            make_row(
                example_id=index,
                game_won_gem_count=game_won_gem_count,
                level_id=level_id,
                node_bin=node_bin,
                repo_root=repo_root,
                target_gems=target_gems,
                timeout_seconds=timeout_seconds,
                view=view,
                yaw=yaw,
            )
        )

    return rows


class MazeSession:
    def __init__(
        self,
        *,
        game_won_gem_count: int,
        level_id: str,
        node_bin: str,
        repo_root: str,
        timeout_seconds: int,
        view: str,
        yaw: int,
    ) -> None:
        self.repo_root = Path(repo_root)
        self.timeout_seconds = int(timeout_seconds)
        self.process = subprocess.Popen(
            [
                node_bin,
                str(self.repo_root / "scripts" / "maze-bridge.js"),
                "--game-won-gem-count",
                str(int(game_won_gem_count)),
                "--level",
                normalize_level_id(level_id),
                "--view",
                view,
                "--yaw",
                str(int(yaw)),
            ],
            cwd=self.repo_root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf8",
        )

    def request(self, command: str, **kwargs: Any) -> dict[str, Any]:
        if self.process.poll() is not None:
            raise RuntimeError("maze bridge process is not running")

        if self.process.stdin is None or self.process.stdout is None:
            raise RuntimeError("maze bridge pipes are unavailable")

        payload = {"command": command, **kwargs}
        self.process.stdin.write(json.dumps(payload) + "\n")
        self.process.stdin.flush()

        ready, _, _ = select.select(
            [self.process.stdout], [], [], self.timeout_seconds
        )
        if not ready:
            self.close(kill=True)
            raise TimeoutError(f"maze bridge timed out waiting for {command!r}")

        line = self.process.stdout.readline()
        if not line:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            raise RuntimeError(f"maze bridge closed unexpectedly: {stderr.strip()}")

        result = json.loads(line)
        if not result.get("ok"):
            raise RuntimeError(str(result.get("error") or "maze bridge command failed"))

        return result

    def close(self, kill: bool = False) -> None:
        if self.process.poll() is not None:
            return

        try:
            if kill:
                self.process.send_signal(signal.SIGTERM)
            else:
                try:
                    self.request("close")
                except Exception:
                    self.process.terminate()
        finally:
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()


def gem_score(state, target_gems: int = DEFAULT_TARGET_GEMS, **kwargs) -> float:
    del kwargs
    status = state.get("maze_status") or {}
    gem_count = int(status.get("gem_count") or 0)
    target = int(target_gems or 0)

    if target <= 0:
        return float(gem_count)

    return min(1.0, gem_count / target)


def collected_gems(state, **kwargs) -> float:
    del kwargs
    status = state.get("maze_status") or {}
    return float(status.get("gem_count") or 0)


def current_level_solved(state, **kwargs) -> float:
    del kwargs
    status = state.get("maze_status") or {}
    return 1.0 if status.get("solved") else 0.0


def visited_level_count(state, **kwargs) -> float:
    del kwargs
    status = state.get("maze_status") or {}
    return float(len(status.get("visited_levels") or []))


def room_exploration_score(state, **kwargs) -> float:
    del kwargs
    status = state.get("maze_status") or {}
    return float(max(0, len(status.get("visited_levels") or []) - 1))


COMMAND_ALIASES = {
    "close": "quit",
    "go_to_level": "goto_level",
    "goto": "goto_level",
    "goto_level": "goto_level",
    "move": "move",
    "quit": "quit",
    "reset": "reset_level",
    "reset_level": "reset_level",
    "rotate": "rotate_camera",
    "rotate_camera": "rotate_camera",
    "undo": "undo",
}
DIRECTIONS = {"up", "down", "left", "right"}


def message_content(message: object) -> str:
    if isinstance(message, dict):
        content = message.get("content", "")
    else:
        content = getattr(message, "content", "")

    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                parts.append(str(part.get("text") or part.get("content") or ""))
            else:
                parts.append(str(part))
        return "\n".join(parts)

    return str(content or "")


def sanitize_assistant_message(message: object) -> object:
    if isinstance(message, dict):
        role = message.get("role")
        content = message.get("content")
        tool_calls = message.get("tool_calls")
    else:
        role = getattr(message, "role", None)
        content = getattr(message, "content", None)
        tool_calls = getattr(message, "tool_calls", None)

    if role != "assistant":
        return message

    if isinstance(message, dict):
        return vf.AssistantMessage(
            content="" if content is None and not tool_calls else content,
            tool_calls=tool_calls,
        )

    if content is None:
        content = ""

    should_sanitize = (
        getattr(message, "reasoning_content", None) is not None
        or getattr(message, "thinking_blocks", None) is not None
        or getattr(message, "content", None) is None
    )
    if not should_sanitize:
        return message

    return vf.AssistantMessage(content=content, tool_calls=tool_calls)


def sanitize_prompt_messages(messages: vf.Messages) -> vf.Messages:
    return [sanitize_assistant_message(message) for message in messages]


def append_conversation_log(state: vf.State, messages: vf.Messages) -> None:
    state.setdefault("maze_conversation_log", []).extend(messages)


def strip_code_fence(text: str) -> str:
    stripped = text.strip()
    fence = re.fullmatch(r"```(?:\w+)?\s*(.*?)\s*```", stripped, re.DOTALL)
    return fence.group(1).strip() if fence else stripped


def parse_json_action(value: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    if "command" in value:
        return normalize_action(str(value["command"]), value)

    function_value = value.get("function") or value.get("function_call") or {}
    name = value.get("name") or value.get("tool") or function_value.get("name")
    raw_args = value.get("arguments") or value.get("args") or function_value.get("arguments") or {}

    if isinstance(raw_args, str):
        raw_args = json.loads(raw_args) if raw_args.strip().startswith("{") else {}

    if not isinstance(raw_args, dict):
        raw_args = {}

    return normalize_action(str(name or ""), raw_args)


def parse_key_value_args(text: str) -> dict[str, str]:
    args: dict[str, str] = {}
    positional: list[str] = []

    for part in [part.strip() for part in text.split(",") if part.strip()]:
        key, separator, value = part.partition("=")
        if not separator:
            key, separator, value = part.partition(":")

        if separator:
            args[key.strip()] = value.strip().strip("\"'")
        else:
            positional.extend(shlex.split(part))

    if positional:
        args["_positional"] = positional

    return args


def normalize_action(command: str, args: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    raw_command = str(command or "").strip().lower().replace(" ", "_")
    if raw_command in DIRECTIONS:
        return "move", {"direction": raw_command}

    normalized = COMMAND_ALIASES.get(raw_command)
    positional = list(args.get("_positional") or [])

    if not normalized:
        raise ValueError(f"unknown command: {command}")

    if normalized in {"move", "rotate_camera"}:
        direction = str(args.get("direction") or (positional[0] if positional else "")).lower()
        if direction not in DIRECTIONS:
            raise ValueError(
                f"{normalized} requires direction: up, down, left, or right"
            )
        return normalized, {"direction": direction}

    if normalized in {"undo", "reset_level", "quit"}:
        return normalized, {}

    x = str(args.get("x") or (positional[0] if len(positional) >= 1 else "")).upper()
    y = str(args.get("y") or (positional[1] if len(positional) >= 2 else "")).upper()
    if not re.fullmatch(r"[A-Z]", x) or not re.fullmatch(r"[A-Z]", y):
        raise ValueError("go to level requires two world coordinate letters, e.g. go to level H I")

    return normalized, {"x": x, "y": y}


def parse_text_action(text: str) -> tuple[str, dict[str, Any]]:
    cleaned = strip_code_fence(text)
    first_line = next((line.strip() for line in cleaned.splitlines() if line.strip()), "")

    if not first_line:
        raise ValueError("empty response")

    if first_line.startswith("{"):
        parsed = json.loads(first_line)
        if not isinstance(parsed, dict):
            raise ValueError("JSON action must be an object")
        return parse_json_action(parsed)

    function_match = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)", first_line)
    if function_match:
        return normalize_action(function_match.group(1), parse_key_value_args(function_match.group(2)))

    tokens = shlex.split(first_line)
    if not tokens:
        raise ValueError("empty response")

    lowered = [token.lower() for token in tokens]
    if len(tokens) == 1 and lowered[0] in DIRECTIONS:
        return "move", {"direction": lowered[0]}

    if len(tokens) >= 3 and lowered[:2] == ["rotate", "camera"]:
        return normalize_action("rotate_camera", {"_positional": tokens[2:]})

    if len(tokens) >= 5 and lowered[:3] == ["go", "to", "level"]:
        return normalize_action("goto_level", {"_positional": tokens[3:]})

    args: dict[str, Any] = {}
    positional: list[str] = []
    for token in tokens[1:]:
        key, separator, value = token.partition("=")
        if separator:
            args[key] = value.strip("\"'")
        else:
            positional.append(token.strip("\"'"))

    if positional:
        args["_positional"] = positional

    return normalize_action(tokens[0], args)


def scorecard_text(status: dict[str, Any]) -> str:
    return json.dumps(status.get("scorecard") or {}, indent=2)


def action_result_text(
    *,
    command: str | None = None,
    error: str | None = None,
    status: dict[str, Any] | None = None,
) -> str:
    if error:
        return f"Previous response was invalid: {error}"

    status = status or {}
    action = status.get("action") or command or "action"
    details = [f"Previous action: {action}."]

    if "direction" in status:
        details.append(f"Direction: {status['direction']}.")
    if "moved" in status:
        details.append(f"Moved: {str(bool(status['moved'])).lower()}.")
    if status.get("room_changed"):
        details.append(f"Entered room: {status.get('current_room')}.")
    if status.get("destination_room"):
        details.append(f"Jumped to room: {status.get('destination_room')}.")
    if status.get("collected_this_action"):
        details.append(
            "Collected gems: "
            + ", ".join(str(gem) for gem in status["collected_this_action"])
            + "."
        )
    if status_player_dead(status):
        details.append(DEATH_MESSAGE)
    is_terminal = status.get("quit") or status.get("game_lost") or status.get("game_won")
    if is_terminal and status.get("scorecard"):
        details.append("Final scorecard:\n" + scorecard_text(status))

    return " ".join(details)


def canonical_command_text(command: str, args: dict[str, Any]) -> str:
    if command == "move":
        return str(args.get("direction") or "")
    if command == "rotate_camera":
        return f"rotate camera {args.get('direction') or ''}".strip()
    if command == "goto_level":
        return f"go to level {args.get('x') or ''} {args.get('y') or ''}".strip()
    if command == "reset_level":
        return "reset"
    if command in {"undo", "quit"}:
        return command
    return command


def slim_status(status: dict[str, Any] | None) -> dict[str, Any]:
    status = status or {}
    keys = (
        "action",
        "action_count",
        "allowed_commands",
        "collected_gems",
        "collected_this_action",
        "current_room",
        "current_view",
        "death_message",
        "destination_room",
        "game_lost",
        "game_won",
        "gem_count",
        "moved",
        "player",
        "player_dead",
        "quit",
        "room_changed",
        "solved",
        "visited_levels",
        "yaw",
    )
    return {key: status[key] for key in keys if key in status}


def record_maze_action(
    state: vf.State,
    *,
    action_args: dict[str, Any] | None = None,
    command: str | None = None,
    error: str | None = None,
    raw_response: str = "",
    status: dict[str, Any] | None = None,
) -> None:
    action_args = action_args or {}
    record = {
        "turn": len(state.get("maze_actions") or []) + 1,
        "valid": error is None,
        "raw_response": raw_response.strip(),
        "command": (
            canonical_command_text(command, action_args)
            if command is not None and error is None
            else None
        ),
        "normalized_action": command,
        "args": action_args,
        "error": error,
        "status": slim_status(status),
    }
    state.setdefault("maze_actions", []).append(record)


def set_maze_scorecard(state: vf.State, scorecard: dict[str, Any] | None) -> None:
    if not isinstance(scorecard, dict):
        return

    state["maze_scorecard"] = scorecard
    replay = state.get("maze_replay")
    if isinstance(replay, dict):
        replay["scorecard"] = scorecard


class MazeTextEnv(vf.MultiTurnEnv):
    def __init__(
        self,
        *,
        max_turns: int = DEFAULT_MAX_TURNS,
        memory_compaction: bool = True,
        memory_compaction_token_ratio: float = DEFAULT_MEMORY_COMPACTION_TOKEN_RATIO,
        memory_compaction_max_tokens: int = DEFAULT_MEMORY_COMPACTION_MAX_TOKENS,
        model_context_tokens: int | None = None,
        rubric: vf.Rubric | None = None,
        **kwargs,
    ) -> None:
        super().__init__(max_turns=-1, rubric=rubric, **kwargs)
        self.maze_max_turns = int(max_turns)
        self.memory_compaction = bool(memory_compaction)
        self.memory_compaction_token_ratio = min(
            1.0,
            max(0.0, float(memory_compaction_token_ratio)),
        )
        self.memory_compaction_max_tokens = int(memory_compaction_max_tokens)
        self.model_context_tokens = (
            int(model_context_tokens) if model_context_tokens is not None else None
        )

    async def get_prompt_messages(self, state: vf.State) -> vf.Messages:
        if len(state["trajectory"]) == 0:
            return normalize_messages(
                sanitize_prompt_messages(state["prompt"]),
                field_name="prompt_messages",
            )

        prev_turn_prompt = state["trajectory"][-1]["prompt"]
        prev_turn_completion = state["trajectory"][-1]["completion"]
        messages = concat_messages([prev_turn_prompt, prev_turn_completion])
        env_response = await self.env_response(messages, state)
        env_response = normalize_messages(env_response, field_name="env_response")
        append_conversation_log(state, env_response)

        prompt_messages = normalize_messages(
            sanitize_prompt_messages(concat_messages([messages, env_response])),
            field_name="prompt_messages",
        )
        return await self.maybe_compact_memory(state, prompt_messages)

    async def render_completion(self, state: vf.State) -> None:
        log = state.get("maze_conversation_log")
        if log is not None:
            state["completion"] = normalize_messages(
                log,
                field_name="maze_conversation_log",
            )
            return

        await super().render_completion(state)

    async def add_model_response(
        self,
        state: vf.State,
        prompt_messages: vf.Messages,
        response: vf.Response,
    ) -> None:
        await super().add_model_response(state, prompt_messages, response)
        if state["trajectory"]:
            completion = state["trajectory"][-1]["completion"]
            append_conversation_log(state, completion)

            assistant_message = completion[-1] if completion else None
            reasoning_content = getattr(assistant_message, "reasoning_content", None)
            diagnostic = {
                "turn": len(state["trajectory"]),
                "content_len": len(message_content(assistant_message)),
                "reasoning_len": len(reasoning_content or ""),
                "finish_reason": getattr(response.message, "finish_reason", None),
                "response_id": response.id,
            }
            state.setdefault("maze_response_diagnostics", []).append(diagnostic)
            if not reasoning_content:
                state.setdefault("maze_missing_reasoning_turns", []).append(
                    diagnostic["turn"]
                )
                self.logger.info(
                    "Assistant turn %s had no exposed reasoning_content in the "
                    "parsed provider response.",
                    diagnostic["turn"],
                )

    async def maybe_compact_memory(
        self,
        state: vf.State,
        prompt_messages: vf.Messages,
    ) -> vf.Messages:
        if not self.memory_compaction or state.get("final_env_response") is not None:
            return prompt_messages

        model = state.get("model")
        context_tokens = (
            self.model_context_tokens
            or state.get("model_context_tokens")
            or self.max_seq_len
            or known_model_context_tokens(model)
        )
        context_tokens = int(context_tokens)
        prompt_tokens = estimate_messages_tokens(prompt_messages, model)
        sampling_args = state.get("sampling_args") or {}
        output_reserve_tokens = int(
            sampling_args.get("max_tokens")
            or sampling_args.get("max_completion_tokens")
            or 0
        )
        compaction_threshold_tokens = int(
            max(1, context_tokens) * self.memory_compaction_token_ratio
        )
        state["maze_prompt_tokens_estimate"] = prompt_tokens
        state["maze_model_context_tokens"] = context_tokens
        state["maze_memory_compaction_threshold_tokens"] = compaction_threshold_tokens

        if prompt_tokens + output_reserve_tokens < compaction_threshold_tokens:
            return prompt_messages

        state["maze_last_memory_compaction_prompt_tokens"] = prompt_tokens

        summary = await self.generate_memory_summary(state, prompt_messages)
        if not summary:
            state["maze_memory_compaction_error"] = "model returned empty memory summary"
            return prompt_messages

        state["maze_memory"] = summary
        state["maze_memory_compaction_count"] = (
            int(state.get("maze_memory_compaction_count") or 0) + 1
        )
        env_response = current_state_messages(prompt_messages)
        return compacted_memory_prompt_messages(
            state,
            env_response=env_response,
        )

    async def generate_memory_summary(
        self,
        state: vf.State,
        prompt_messages: vf.Messages,
    ) -> str:
        existing_memory = str(state.get("maze_memory") or "").strip()
        user_content = (
            "Existing memory summary:\n"
            f"{existing_memory or '(none)'}\n\n"
            "Full transcript to compact:\n"
            f"{transcript_for_memory(prompt_messages)}\n\n"
            "Return only the updated memory summary."
        )
        sampling_args = dict(state.get("sampling_args") or {})
        current_max_tokens = int(sampling_args.get("max_tokens") or 0)
        sampling_args["max_tokens"] = max(
            current_max_tokens,
            self.memory_compaction_max_tokens,
        )
        sampling_args.setdefault("temperature", 0)
        try:
            response = await super().get_model_response(
                state,
                [
                    vf.SystemMessage(content=MEMORY_COMPACTION_SYSTEM_PROMPT),
                    vf.UserMessage(content=user_content),
                ],
                sampling_args=sampling_args,
            )
        except Exception as error:
            state["maze_memory_compaction_error"] = str(error)
            return ""

        return str(response.message.content or "").strip()

    async def get_model_response(
        self,
        state: vf.State,
        prompt: vf.Messages,
        client: Any | None = None,
        model: str | None = None,
        tool_defs: list[Any] | None = None,
        sampling_args: dict[str, Any] | None = None,
    ) -> vf.Response:
        try:
            return await super().get_model_response(
                state,
                prompt,
                client=client,
                model=model,
                tool_defs=tool_defs,
                sampling_args=sampling_args,
            )
        except vf.EmptyModelResponseError:
            state["maze_empty_model_responses"] = (
                int(state.get("maze_empty_model_responses") or 0) + 1
            )
            return vf.Response(
                id="",
                created=0,
                model=str(model or state.get("model") or ""),
                usage=None,
                message=vf.ResponseMessage(
                    content="",
                    finish_reason="stop",
                    is_truncated=False,
                    reasoning_content=None,
                    tool_calls=None,
                ),
            )

    async def setup_state(self, state: vf.State, **kwargs: Any) -> None:
        del kwargs
        state["maze_actions"] = []
        state["maze_conversation_log"] = []
        state["maze_scorecard"] = {}
        row = row_from_state(state)
        state["maze_row"] = row
        session = MazeSession(
            game_won_gem_count=int(row.get("game_won_gem_count") or GAME_WON_GEM_COUNT),
            level_id=str(row.get("level_id") or DEFAULT_START_LEVEL_ID),
            node_bin=str(row.get("node_bin") or DEFAULT_NODE_BIN),
            repo_root=str(row.get("repo_root") or find_bridge_root()),
            timeout_seconds=int(row.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS),
            view=str(row.get("view") or DEFAULT_VIEW),
            yaw=int(row.get("yaw") or DEFAULT_YAW),
        )
        state["maze_session"] = session
        state["maze_status"] = session.request("observe")
        state["maze_replay"] = {
            "game_id": row.get("game_id") or DEFAULT_GAME_ID,
            "game_won_gem_count": int(
                row.get("game_won_gem_count") or GAME_WON_GEM_COUNT
            ),
            "initial": slim_status(state["maze_status"]),
            "start_level_id": str(row.get("level_id") or DEFAULT_START_LEVEL_ID),
            "target_gems": int(row.get("target_gems") or DEFAULT_TARGET_GEMS),
            "actions": state["maze_actions"],
            "scorecard": None,
        }

    async def env_response(
        self, messages: vf.Messages, state: vf.State, **kwargs: Any
    ) -> vf.Messages:
        del kwargs
        last_message = messages[-1]
        session = state.get("maze_session")
        row = row_from_state(state)
        result_text = ""

        if isinstance(session, MazeSession):
            try:
                raw_response = message_content(last_message)
                command, action_args = parse_text_action(raw_response)
                status = session.request(command, **action_args)
                state["maze_status"] = status
                record_maze_action(
                    state,
                    action_args=action_args,
                    command=command,
                    raw_response=raw_response,
                    status=status,
                )
                result_text = action_result_text(command=command, status=status)
            except Exception as error:
                state["maze_status_error"] = str(error)
                try:
                    status = session.request("observe")
                    state["maze_status"] = status
                except Exception:
                    status = state.get("maze_status") or {}
                record_maze_action(
                    state,
                    error=str(error),
                    raw_response=message_content(last_message),
                    status=status,
                )
                result_text = action_result_text(error=str(error))
        else:
            status = state.get("maze_status") or {}
            record_maze_action(
                state,
                error="maze session is not available",
                raw_response=message_content(last_message),
                status=status,
            )
            result_text = action_result_text(error="maze session is not available")

        state["game_lost"] = bool(status.get("game_lost") or status.get("quit"))
        state["game_won"] = bool(
            status.get("game_won")
            or int(status.get("gem_count") or 0)
            == int(row.get("game_won_gem_count") or GAME_WON_GEM_COUNT)
        )

        if (
            (state["game_lost"] or state["game_won"])
            and not status.get("scorecard")
            and isinstance(session, MazeSession)
        ):
            status = session.request("scorecard")
            state["maze_status"] = status
            set_maze_scorecard(state, status.get("scorecard"))

        set_maze_scorecard(state, status.get("scorecard"))

        if state["game_lost"] or state["game_won"]:
            response = [
                vf.UserMessage(
                    content="Final scorecard:\n```json\n"
                    + scorecard_text(status)
                    + "\n```"
                )
            ]
        else:
            response = [
                vf.UserMessage(
                    content=render_multiturn_user_prompt(
                        status=status,
                        target_text=target_text_for_row(row),
                        result_text=result_text,
                    )
                )
            ]

        turn_count = len(state.get("trajectory") or [])
        budget_reached = self.maze_max_turns > 0 and turn_count >= self.maze_max_turns

        if state["game_lost"] or state["game_won"] or budget_reached:
            state["final_env_response"] = response

        return response

    @vf.stop(priority=50)
    async def game_lost(self, state: vf.State) -> bool:
        status = state.get("maze_status") or {}
        return bool(state.get("game_lost") or status.get("quit"))

    @vf.stop(priority=40)
    async def game_won(self, state: vf.State) -> bool:
        status = state.get("maze_status") or {}
        return bool(
            state.get("game_won")
            or int(status.get("gem_count") or 0)
            == int(row_from_state(state).get("game_won_gem_count") or GAME_WON_GEM_COUNT)
        )

    @vf.cleanup
    async def close_maze_session(self, state: vf.State) -> None:
        session = state.get("maze_session")
        if isinstance(session, MazeSession):
            try:
                scorecard_status = session.request("scorecard")
                state["maze_status"] = scorecard_status
                set_maze_scorecard(state, scorecard_status.get("scorecard"))
            except Exception:
                try:
                    state["maze_status"] = session.request("observe")
                except Exception:
                    pass
            session.close()


def load_environment(
    num_train_examples: int = 1,
    num_eval_examples: int = 1,
    level_ids: str | list[str] | None = None,
    start_level_id: str = DEFAULT_START_LEVEL_ID,
    view: str = DEFAULT_VIEW,
    yaw: int = DEFAULT_YAW,
    game_won_gem_count: int = GAME_WON_GEM_COUNT,
    max_turns: int = DEFAULT_MAX_TURNS,
    memory_compaction: bool = True,
    memory_compaction_token_ratio: float = DEFAULT_MEMORY_COMPACTION_TOKEN_RATIO,
    memory_compaction_max_tokens: int = DEFAULT_MEMORY_COMPACTION_MAX_TOKENS,
    model_context_tokens: int | None = None,
    node_bin: str = DEFAULT_NODE_BIN,
    repo_root: str | None = None,
    target_gems: int = DEFAULT_TARGET_GEMS,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    system_prompt: str | None = None,
    **kwargs,
) -> vf.Environment:
    """Load the JS-backed ASCII maze benchmark."""
    resolved_repo_root = find_bridge_root(repo_root)
    normalized_level_ids = parse_level_ids(level_ids, start_level_id)
    row_options = {
        "game_won_gem_count": int(game_won_gem_count),
        "level_ids": normalized_level_ids,
        "node_bin": node_bin,
        "repo_root": resolved_repo_root,
        "target_gems": int(target_gems),
        "timeout_seconds": int(timeout_seconds),
        "view": view,
        "yaw": int(yaw),
    }
    dataset = Dataset.from_list(build_rows(count=num_train_examples, **row_options))
    eval_dataset = Dataset.from_list(build_rows(count=num_eval_examples, **row_options))

    rubric = vf.Rubric()
    rubric.add_reward_func(gem_score)
    rubric.add_reward_func(
        room_exploration_score, weight=ROOM_EXPLORATION_REWARD_WEIGHT
    )
    rubric.add_metric(collected_gems)
    rubric.add_metric(current_level_solved)
    rubric.add_metric(visited_level_count)

    return MazeTextEnv(
        dataset=dataset,
        eval_dataset=eval_dataset,
        system_prompt=system_prompt or MULTITURN_SYSTEM_PROMPT,
        max_turns=int(max_turns),
        memory_compaction=bool(memory_compaction),
        memory_compaction_token_ratio=float(memory_compaction_token_ratio),
        memory_compaction_max_tokens=int(memory_compaction_max_tokens),
        model_context_tokens=model_context_tokens,
        rubric=rubric,
        **kwargs,
    )
