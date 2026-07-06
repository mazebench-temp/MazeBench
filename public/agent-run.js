(() => {
  const initial = window.__AGENT_RUN__ || {};
  const runId = initial.id;
  const statusEl = document.getElementById("run-status");
  const boardEl = document.getElementById("run-board");
  const turnsEl = document.getElementById("run-turns");
  const logEl = document.getElementById("run-log");
  const stopButton = document.getElementById("stop-run");
  const state = { afterTurn: 0, logOffset: 0, run: initial, timer: null, reasoningShown: false };

  function setStatus(message, isError = false) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function escapeText(value) {
    const el = document.createElement("span");
    el.textContent = String(value ?? "");
    return el.innerHTML;
  }

  function describeRun(run) {
    document.getElementById("run-title").textContent =
      `${run.model}${run.model_name ? ` (${run.model_name})` : ""} on ${run.game_title || run.game_id}`;
    const bits = [
      `run ${run.id}`,
      `level ${String(run.level_id || "").replace(/^level_/, "")}`,
      `${run.moves} move budget`,
      run.mode,
      run.kind === "local" ? (run.container ? "container" : "host") : "prime verifiers",
      run.note || ""
    ].filter(Boolean);
    document.getElementById("run-meta").textContent = bits.join(" · ");
  }

  function renderStats(run) {
    const chips = [
      ["status", run.status],
      ["moves", `${run.turns}/${run.moves}`],
      ["gems", String(run.gem_count ?? 0)],
      ["room", String(run.current_room || "").replace(/^level_/, "")],
      run.solved ? ["result", "SOLVED"] : null
    ].filter(Boolean);
    document.getElementById("run-stats").innerHTML = chips
      .map(
        ([label, value]) =>
          `<span class="agent-stat"><span class="agent-stat__label">${escapeText(label)}</span> ${escapeText(value)}</span>`
      )
      .join("");
    const running = run.status === "running" || run.status === "stopping";
    stopButton.hidden = !running;
  }

  function appendTurns(actions) {
    for (const action of actions) {
      const flags = [
        action.moved === false ? "blocked" : null,
        action.player_dead ? "died" : null,
        action.solved ? "SOLVED" : null
      ]
        .filter(Boolean)
        .join(", ");
      const row = document.createElement("div");
      row.className = "agent-turn";
      row.innerHTML = `<span class="agent-turn__num">${escapeText(action.turn)}</span>
        <span class="agent-turn__action">${escapeText(action.command_text)}</span>
        <span class="agent-turn__info">${escapeText(String(action.current_room || "").replace(/^level_/, ""))} · ${escapeText(action.gem_count ?? 0)} gems${flags ? ` · ${escapeText(flags)}` : ""}</span>`;
      turnsEl.appendChild(row);
      if (action.level) {
        boardEl.textContent = action.level;
      }
      state.afterTurn = Math.max(state.afterTurn, Number(action.turn) || 0);
    }
    if (actions.length) {
      turnsEl.scrollTop = turnsEl.scrollHeight;
    }
  }

  function showReasoning(reasoning) {
    if (state.reasoningShown || !Array.isArray(reasoning) || reasoning.length === 0) return;
    state.reasoningShown = true;
    const section = document.getElementById("run-reasoning-section");
    const host = document.getElementById("run-reasoning");
    section.hidden = false;
    host.innerHTML = reasoning
      .map(
        (entry) => `<div class="agent-turn">
          <span class="agent-turn__num">${escapeText(entry.move)}</span>
          <span class="agent-turn__action">${escapeText(entry.action)}</span>
          <span class="agent-turn__info">${escapeText(entry.reasoning || "")}</span>
        </div>`
      )
      .join("");
  }

  function showVideoIfReady(run) {
    if (!run.has_video) return;
    const section = document.getElementById("run-video-section");
    if (!section.hidden) return;
    section.hidden = false;
    document.getElementById("run-video").src = `/agent-runs/${encodeURIComponent(runId)}/files/maze_replay.mp4`;
  }

  async function poll() {
    try {
      const response = await fetch(
        `/api/agent/runs/${encodeURIComponent(runId)}/progress?after_turn=${state.afterTurn}&log_offset=${state.logOffset}`,
        { headers: { accept: "application/json" } }
      );
      if (!response.ok) throw new Error(`progress failed (${response.status})`);
      const progress = await response.json();

      state.run = progress.run;
      describeRun(progress.run);
      renderStats(progress.run);
      appendTurns(progress.actions || []);
      if (progress.log_chunk) {
        logEl.textContent += progress.log_chunk;
        logEl.scrollTop = logEl.scrollHeight;
      }
      state.logOffset = progress.log_offset;
      showReasoning(progress.reasoning);
      showVideoIfReady(progress.run);

      const running = progress.run.status === "running" || progress.run.status === "stopping";
      const waitingForArtifacts = !running && progress.run.status === "finished" && !progress.run.has_video && progress.run.video;
      if (running) {
        setStatus(progress.run.status === "stopping" ? "Stopping…" : "Live — agent is playing.");
        state.timer = setTimeout(poll, 1500);
      } else if (waitingForArtifacts) {
        setStatus("Run finished — rendering replay video…");
        state.timer = setTimeout(poll, 3000);
      } else {
        setStatus(
          progress.run.status === "finished"
            ? `Finished — ${progress.run.gem_count ?? 0} gems in ${progress.run.turns} moves${progress.run.solved ? " (solved!)" : ""}.`
            : `Run ${progress.run.status}.`,
          progress.run.status === "failed"
        );
      }
    } catch (error) {
      setStatus(error.message, true);
      state.timer = setTimeout(poll, 4000);
    }
  }

  stopButton?.addEventListener("click", async () => {
    try {
      await fetch(`/api/agent/runs/${encodeURIComponent(runId)}/stop`, { method: "POST" });
      setStatus("Stopping…");
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  describeRun(initial);
  renderStats(initial);
  poll();
})();
