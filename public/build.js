(() => {
  const data = window.__BUILD_DATA__ || { worlds: [], master: null, apiUrl: "/api/build/worlds" };
  const statusEl = document.getElementById("build-status");
  const masterEl = document.getElementById("build-master");
  const worldsEl = document.getElementById("build-worlds");
  const remoteSection = document.getElementById("build-remote-section");
  const remoteEl = document.getElementById("build-remote");

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { "content-type": "application/json" },
      ...options
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }

    return payload;
  }

  async function refreshWorlds() {
    const payload = await api(data.apiUrl);
    data.worlds = payload.worlds || [];
    renderWorlds();
  }

  function linkList(links) {
    return links
      .filter(([, href]) => Boolean(href))
      .map(([label, href]) => `<a class="back-link" href="${href}">${label}</a>`)
      .join("");
  }

  function escapeText(value) {
    const el = document.createElement("span");
    el.textContent = String(value ?? "");
    return el.innerHTML;
  }

  function formatWhen(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
  }

  function renderMaster() {
    if (!masterEl) return;

    if (!data.master) {
      masterEl.innerHTML = `<p class="author-panel__copy">Master world not found.</p>`;
      return;
    }

    masterEl.innerHTML = `
      <article class="build-card">
        <div class="build-card__head">
          <h3>${escapeText(data.master.name)} <span class="author-panel__badge">master</span></h3>
          <p class="author-panel__copy">${data.master.level_count} levels &middot; the world agents are benchmarked on</p>
        </div>
        <div class="build-card__links">${linkList([
          ["Play", data.master.play_url],
          ["Edit Levels", data.master.author_url],
          ["World Map", data.master.world_map_url],
          ["Flyover", data.master.flyover_url]
        ])}</div>
      </article>`;
  }

  function worldCard(world) {
    const remoteBadge = world.remote_id
      ? `<span class="author-panel__badge" title="Linked to ${escapeText(world.remote_id)} on mazebench.com">synced</span>`
      : "";
    const kindBadge = world.kind === "online" ? `<span class="author-panel__badge">online copy</span>` : "";

    return `
      <article class="build-card" data-world-id="${escapeText(world.id)}">
        <div class="build-card__head">
          <h3 class="build-card__title" data-role="title">${escapeText(world.title)} ${kindBadge} ${remoteBadge}</h3>
          <p class="author-panel__copy">${world.world_width}&times;${world.world_height} world &middot; ${world.level_count} level${world.level_count === 1 ? "" : "s"}${world.updated_at ? ` &middot; updated ${escapeText(formatWhen(world.updated_at))}` : ""}</p>
        </div>
        <div class="build-card__links">${linkList([
          ["Play", world.play_url],
          ["Edit Levels", world.author_url],
          ["World Map", world.world_map_url],
          ["Flyover", world.flyover_url]
        ])}</div>
        <div class="build-card__actions">
          <button class="tool-button" type="button" data-action="rename">Rename</button>
          <a class="tool-button" href="${world.export_url}" download="${escapeText(world.title || world.id)}.json">Export JSON</a>
          <span data-role="sync-actions"></span>
          <button class="tool-button tool-button--danger" type="button" data-action="delete">Delete</button>
        </div>
      </article>`;
  }

  function renderWorlds() {
    if (!worldsEl) return;

    if (!data.worlds.length) {
      worldsEl.innerHTML = `<p class="author-panel__copy">No local worlds yet. Create one below, copy the master world, or import a JSON export.</p>`;
      return;
    }

    worldsEl.innerHTML = data.worlds.map(worldCard).join("");

    worldsEl.querySelectorAll(".build-card").forEach((card) => {
      const worldId = card.dataset.worldId;
      const world = data.worlds.find((entry) => entry.id === worldId);

      card.querySelector('[data-action="rename"]').addEventListener("click", async () => {
        const title = window.prompt("New world title:", world.title);
        if (!title || !title.trim()) return;

        try {
          const payload = await api(`${data.apiUrl}/${encodeURIComponent(worldId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title: title.trim() })
          });
          setStatus(payload.message);
          await refreshWorlds();
        } catch (error) {
          setStatus(error.message, true);
        }
      });

      card.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        if (!window.confirm(`Delete "${world.title}"? This removes the local files.`)) return;

        try {
          const payload = await api(`${data.apiUrl}/${encodeURIComponent(worldId)}`, { method: "DELETE" });
          setStatus(payload.message);
          await refreshWorlds();
        } catch (error) {
          setStatus(error.message, true);
        }
      });

      const syncHost = card.querySelector('[data-role="sync-actions"]');
      if (syncHost && data.remote && data.remote.connected) {
        const pushButton = document.createElement("button");
        pushButton.type = "button";
        pushButton.className = "tool-button";
        pushButton.textContent = world.remote_id ? "Push Update" : "Push to Site";
        pushButton.addEventListener("click", async () => {
          try {
            setStatus(`Pushing ${world.title}…`);
            const payload = await api("/api/remote/push", {
              method: "POST",
              body: JSON.stringify({ game_id: world.id })
            });
            setStatus(payload.message);
            await refreshWorlds();
          } catch (error) {
            setStatus(error.message, true);
          }
        });
        syncHost.appendChild(pushButton);

        if (world.remote_id) {
          const pullButton = document.createElement("button");
          pullButton.type = "button";
          pullButton.className = "tool-button";
          pullButton.textContent = "Pull Latest";
          pullButton.addEventListener("click", async () => {
            if (!window.confirm(`Overwrite the local copy of "${world.title}" with the site version?`)) return;
            try {
              setStatus(`Pulling ${world.title}…`);
              const payload = await api(`/api/remote/worlds/${encodeURIComponent(world.remote_id)}/pull`, {
                method: "POST",
                body: JSON.stringify({})
              });
              setStatus(payload.message);
              await refreshWorlds();
            } catch (error) {
              setStatus(error.message, true);
            }
          });
          syncHost.appendChild(pullButton);
        }
      }
    });
  }

  function renderRemotePanel() {
    if (!remoteSection || !remoteEl) return;
    remoteSection.hidden = false;
    const remote = data.remote || {};

    if (!remote.connected) {
      remoteEl.innerHTML = `
        <p class="author-panel__copy">Connect your ${escapeText(remote.origin || "mazebench.com")} account to sync drafts both ways. Drafts stay private — publishing is a separate step on the site.</p>
        <div class="author-control-row">
          <button id="remote-link" class="tool-button tool-button--primary" type="button">Connect via Browser</button>
        </div>
        <details>
          <summary class="author-panel__copy">Or paste a session token manually</summary>
          <div class="author-control-row">
            <label class="field"><span>Session token (mazebench_session cookie)</span><input id="remote-token" type="password" autocomplete="off"></label>
            <button id="remote-connect" class="tool-button" type="button">Connect</button>
          </div>
          <p class="author-panel__copy">On ${escapeText(remote.origin || "the site")}, sign in, open DevTools &rarr; Application &rarr; Cookies, and copy the <code>mazebench_session</code> value.</p>
        </details>`;

      document.getElementById("remote-link")?.addEventListener("click", async () => {
        try {
          const payload = await api("/api/remote/link/start");
          window.open(payload.url, "_blank");
          setStatus("Approve the link on the site tab; this page will pick it up when you return. (If the site does not support device links yet, use the manual token instead.)");
        } catch (error) {
          setStatus(error.message, true);
        }
      });

      document.getElementById("remote-connect")?.addEventListener("click", async () => {
        try {
          const token = document.getElementById("remote-token")?.value || "";
          setStatus("Verifying token…");
          const status = await api("/api/remote/connect", { method: "POST", body: JSON.stringify({ token }) });
          data.remote = status;
          setStatus(`Connected as ${status.user?.display_name || status.user?.name || "your account"}.`);
          renderRemotePanel();
          renderWorlds();
        } catch (error) {
          setStatus(error.message, true);
        }
      });
      return;
    }

    remoteEl.innerHTML = `
      <p class="author-panel__copy">Connected to ${escapeText(remote.origin)} as <strong>${escapeText(
        remote.user?.display_name || remote.user?.name || remote.user?.mazebench_user_id || "you"
      )}</strong>.</p>
      <div class="author-control-row">
        <button id="remote-refresh" class="tool-button" type="button">Show My Site Drafts</button>
        <button id="remote-disconnect" class="tool-button tool-button--danger" type="button">Disconnect</button>
      </div>
      <div id="remote-worlds" class="build-card-list"></div>`;

    document.getElementById("remote-disconnect")?.addEventListener("click", async () => {
      try {
        data.remote = await api("/api/remote/disconnect", { method: "POST" });
        setStatus("Disconnected.");
        renderRemotePanel();
        renderWorlds();
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    document.getElementById("remote-refresh")?.addEventListener("click", async () => {
      const host = document.getElementById("remote-worlds");
      host.innerHTML = '<p class="author-panel__copy">Loading…</p>';
      try {
        const payload = await api("/api/remote/worlds?view=drafts");
        const linkedRemoteIds = new Set(data.worlds.map((world) => world.remote_id).filter(Boolean));
        const worlds = payload.worlds || [];
        host.innerHTML = worlds.length
          ? worlds
              .map(
                (world) => `<article class="build-card" data-remote-id="${escapeText(world.id)}">
                  <div class="build-card__head">
                    <h3>${escapeText(world.title)} ${linkedRemoteIds.has(world.id) ? '<span class="author-panel__badge">linked</span>' : ""}</h3>
                    <p class="author-panel__copy">${world.world_width && world.world_height ? `${world.world_width}&times;${world.world_height} world &middot; ` : ""}${world.updated_at ? `updated ${escapeText(formatWhen(world.updated_at))}` : ""}</p>
                  </div>
                  <div class="build-card__links">
                    <button class="tool-button" type="button" data-action="pull">${linkedRemoteIds.has(world.id) ? "Pull Latest" : "Pull to Local"}</button>
                  </div>
                </article>`
              )
              .join("")
          : '<p class="author-panel__copy">No drafts on the site yet. Push a local world up!</p>';
        host.querySelectorAll('[data-action="pull"]').forEach((button) => {
          button.addEventListener("click", async (event) => {
            const remoteId = event.target.closest("[data-remote-id]").dataset.remoteId;
            try {
              setStatus("Pulling…");
              const result = await api(`/api/remote/worlds/${encodeURIComponent(remoteId)}/pull`, {
                method: "POST",
                body: JSON.stringify({})
              });
              setStatus(result.message);
              await refreshWorlds();
            } catch (error) {
              setStatus(error.message, true);
            }
          });
        });
      } catch (error) {
        host.innerHTML = `<p class="author-panel__copy">${escapeText(error.message)}</p>`;
      }
    });
  }

  async function createWorld(body) {
    try {
      const payload = await api(data.apiUrl, { method: "POST", body: JSON.stringify(body) });
      setStatus(payload.message);
      await refreshWorlds();
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  document.getElementById("create-world")?.addEventListener("click", () => {
    createWorld({
      title: document.getElementById("new-world-title")?.value || "",
      world_width: Number(document.getElementById("new-world-width")?.value || 3),
      world_height: Number(document.getElementById("new-world-height")?.value || 3)
    });
  });

  document.getElementById("copy-master")?.addEventListener("click", () => {
    createWorld({ source_game_id: "maze", title: "" });
  });

  const importInput = document.getElementById("import-world-file");
  document.getElementById("import-world")?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = "";
    if (!file) return;

    try {
      const editorState = JSON.parse(await file.text());
      await createWorld({ editor_state: editorState, title: editorState.title || "" });
    } catch (error) {
      setStatus(`Import failed: ${error.message}`, true);
    }
  });

  const query = new URLSearchParams(window.location.search);
  if (query.get("linked") === "1") {
    setStatus("Account linked successfully.");
  } else if (query.get("link_error")) {
    setStatus(`Account link failed: ${query.get("link_error")}`, true);
  }

  renderMaster();
  renderWorlds();
  renderRemotePanel();
})();
