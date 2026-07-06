(() => {
  const data = window.__AGENT_DATA__ || { worlds: [], apiUrl: "/api/agent/runs", environment: {}, remote: {} };
  const statusEl = document.getElementById("agent-status");
  const runsEl = document.getElementById("agent-runs");
  const worldSelect = document.getElementById("run-world");
  const levelSelect = document.getElementById("run-level");
  const modelSelect = document.getElementById("run-model");
  const onlinePicker = document.getElementById("online-picker");
  const onlineWorldsEl = document.getElementById("online-worlds");

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  async function api(path, options = {}) {
    const response = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  function escapeText(value) {
    const el = document.createElement("span");
    el.textContent = String(value ?? "");
    return el.innerHTML;
  }

  function fillWorldOptions() {
    worldSelect.innerHTML = data.worlds
      .map((world) => `<option value="${escapeText(world.id)}">${escapeText(world.title)}</option>`)
      .join("");
    fillLevelOptions();
  }

  function fillLevelOptions() {
    const world = data.worlds.find((entry) => entry.id === worldSelect.value) || data.worlds[0];
    if (!world) return;
    levelSelect.innerHTML = world.level_ids
      .map(
        (levelId) =>
          `<option value="${escapeText(levelId)}"${levelId === world.default_level_id ? " selected" : ""}>${escapeText(
            levelId.replace(/^level_/, "")
          )}</option>`
      )
      .join("");
  }

  function syncModelSections() {
    const model = modelSelect.value;
    document.querySelectorAll("[data-codex-only]").forEach((el) => {
      el.hidden = model !== "codex";
    });
    document.querySelectorAll("[data-prime-only]").forEach((el) => {
      el.hidden = model !== "prime";
    });
    const localOnly = ["run-world", "run-level", "run-moves", "run-mode"];
    localOnly.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.closest("label, .field")?.classList.toggle("is-disabled", model === "prime");
      if (el) el.disabled = model === "prime";
    });
  }

  function describeEnvironment() {
    const env = data.environment || {};
    const found = [];
    const missing = [];
    [["codex", "Codex CLI"], ["claude", "Claude Code"], ["docker", "Docker"], ["prime", "Prime CLI"]].forEach(
      ([key, label]) => (env[key] ? found : missing).push(label)
    );
    const parts = [];
    if (found.length) parts.push(`Available: ${found.join(", ")}.`);
    if (missing.length) parts.push(`Not on PATH: ${missing.join(", ")}.`);
    if (!env.docker) parts.push("Without Docker, uncheck Container to run on the host sandbox.");
    document.getElementById("agent-environment").textContent = parts.join(" ");
  }

  function runCard(run) {
    const statusClass =
      run.status === "running" || run.status === "stopping"
        ? "agent-chip--running"
        : run.status === "finished"
          ? "agent-chip--done"
          : "agent-chip--failed";
    const summary = [
      run.model_name || run.model,
      `${escapeText(run.game_title || run.game_id)} / ${escapeText(String(run.level_id || "").replace(/^level_/, ""))}`,
      `${run.turns}/${run.moves} moves`,
      `${run.gem_count ?? 0} gems${run.solved ? " — solved!" : ""}`
    ].join(" &middot; ");

    return `<article class="build-card agent-run-card" data-run-id="${escapeText(run.id)}">
      <div class="build-card__head">
        <h3><span class="agent-chip ${statusClass}">${escapeText(run.status)}</span> ${escapeText(run.model)} on ${escapeText(run.game_title || run.game_id)}</h3>
        <p class="author-panel__copy">${summary}<br>${escapeText(new Date(run.created_at).toLocaleString())}</p>
      </div>
      <div class="build-card__links">
        <a class="back-link" href="${escapeText(run.url)}">Watch</a>
        ${run.has_video ? `<a class="back-link" href="/agent-runs/${encodeURIComponent(run.id)}/files/maze_replay.mp4">Video</a>` : ""}
        ${run.status === "running" ? '<button class="tool-button tool-button--danger" type="button" data-action="stop">Stop</button>' : ""}
      </div>
    </article>`;
  }

  let refreshTimer = null;

  async function refreshRuns() {
    try {
      const payload = await api(data.apiUrl);
      const runs = payload.runs || [];
      runsEl.innerHTML = runs.length
        ? runs.map(runCard).join("")
        : '<p class="author-panel__copy">No runs yet. Launch one above — you can watch it live.</p>';
      runsEl.querySelectorAll('[data-action="stop"]').forEach((button) => {
        button.addEventListener("click", async (event) => {
          const runId = event.target.closest(".agent-run-card").dataset.runId;
          try {
            await api(`${data.apiUrl}/${encodeURIComponent(runId)}/stop`, { method: "POST" });
            setStatus(`Stopping ${runId}…`);
            refreshRuns();
          } catch (error) {
            setStatus(error.message, true);
          }
        });
      });
      const anyRunning = runs.some((run) => run.status === "running" || run.status === "stopping");
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshRuns, anyRunning ? 3000 : 15000);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  document.getElementById("launch-run")?.addEventListener("click", async () => {
    const model = modelSelect.value;
    const body =
      model === "prime"
        ? {
            kind: "prime",
            model_name: document.getElementById("run-model-name").value.trim(),
            n: Number(document.getElementById("run-prime-n").value) || 1,
            r: Number(document.getElementById("run-prime-r").value) || 1,
            max_turns: Number(document.getElementById("run-prime-turns").value) || 8
          }
        : {
            kind: "local",
            model,
            game_id: worldSelect.value,
            level_id: levelSelect.value,
            moves: Number(document.getElementById("run-moves").value) || 20,
            mode: document.getElementById("run-mode").value,
            model_name: document.getElementById("run-model-name").value.trim(),
            reasoning: document.getElementById("run-reasoning").value,
            codex_fast: document.getElementById("run-codex-fast").checked,
            container: document.getElementById("run-container").checked,
            video: document.getElementById("run-video").checked,
            tools: document.getElementById("run-tools").checked
          };

    try {
      setStatus("Launching…");
      const payload = await api(data.apiUrl, { method: "POST", body: JSON.stringify(body) });
      setStatus(payload.message);
      window.location.href = payload.run.url;
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  document.getElementById("add-online-world")?.addEventListener("click", async () => {
    onlinePicker.hidden = !onlinePicker.hidden;
    if (onlinePicker.hidden) return;
    document.getElementById("online-origin").textContent = (data.remote && data.remote.origin) || "mazebench.com";
    onlineWorldsEl.innerHTML = '<p class="author-panel__copy">Loading community worlds…</p>';

    try {
      const payload = await api("/api/remote/worlds?view=community");
      const worlds = payload.worlds || [];
      onlineWorldsEl.innerHTML = worlds.length
        ? worlds
            .map(
              (world) => `<article class="build-card" data-remote-id="${escapeText(world.id)}">
                <div class="build-card__head">
                  <h3>${escapeText(world.title)}</h3>
                  <p class="author-panel__copy">${world.world_width && world.world_height ? `${world.world_width}&times;${world.world_height} world &middot; ` : ""}${world.creator ? `by ${escapeText(world.creator)}` : ""}</p>
                </div>
                <div class="build-card__links">
                  <button class="tool-button" type="button" data-action="pull">Download for Agent Runs</button>
                </div>
              </article>`
            )
            .join("")
        : '<p class="author-panel__copy">No community worlds found.</p>';
      onlineWorldsEl.querySelectorAll('[data-action="pull"]').forEach((button) => {
        button.addEventListener("click", async (event) => {
          const remoteId = event.target.closest("[data-remote-id]").dataset.remoteId;
          try {
            setStatus("Downloading world…");
            const result = await api(`/api/remote/worlds/${encodeURIComponent(remoteId)}/pull`, {
              method: "POST",
              body: JSON.stringify({ kind: "online" })
            });
            setStatus(`${result.message} It is now available in the World picker.`);
            window.location.reload();
          } catch (error) {
            setStatus(error.message, true);
          }
        });
      });
    } catch (error) {
      onlineWorldsEl.innerHTML = `<p class="author-panel__copy">${escapeText(error.message)}</p>`;
    }
  });

  worldSelect.addEventListener("change", fillLevelOptions);
  modelSelect.addEventListener("change", syncModelSections);

  fillWorldOptions();
  syncModelSections();
  describeEnvironment();
  refreshRuns();
})();
