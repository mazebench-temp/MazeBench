const { escapeHtml, serializeForScript } = require("./support");

function createPageRenderer({
  agentEnvironment,
  buildAuthorPageData,
  buildMazeWorldMapEditorData,
  buildWorlds,
  getGame,
  getLevelState,
  listGames,
  remote,
  worldMaps
}) {
  const defaultLevelIdForGame = (game) => worldMaps.defaultLevelIdForGame(game);
  function renderPage({ title, body, bodyClass = "" }) {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <script type="importmap">{"imports":{"three":"/vendor/three.module.js"}}</script>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="${escapeHtml(bodyClass)}">
    ${body}
  </body>
</html>`;
  }

  function renderHomePage() {
    const otherGames = listGames().filter((game) => !game.worldMap);
    const otherGamesSection = otherGames.length
      ? `<section class="stack home-other-games">
          <h2>Other Games</h2>
          <div class="game-list">${otherGames
            .map(
              (game) => `<a class="game-link" href="/games/${encodeURIComponent(game.id)}">
                <span class="game-link__title">${escapeHtml(game.name)}</span>
              </a>`
            )
            .join("")}</div>
        </section>`
      : "";

    return renderPage({
      title: "MazeBench",
      body: `<main class="shell home-shell">
        <h1>MazeBench</h1>
        <div class="mode-list">
          <a class="mode-card" href="/play">
            <span class="mode-card__title">Play Mode</span>
            <span class="mode-card__copy">Play the master world, your drafts, or worlds from mazebench.com.</span>
          </a>
          <a class="mode-card" href="/build">
            <span class="mode-card__title">Build Mode</span>
            <span class="mode-card__copy">Make and save your own worlds locally, edit the master world, and sync drafts with your account.</span>
          </a>
          <a class="mode-card" href="/agent">
            <span class="mode-card__title">Agent Mode</span>
            <span class="mode-card__copy">Run Codex, Claude Code, or Prime Verifiers on any world and watch the runs live.</span>
          </a>
        </div>
        ${otherGamesSection}
      </main>`
    });
  }

  function renderPlayModePage() {
    const masterGame = getGame("maze");
    const worlds = buildWorlds.listLocalWorlds();
    const masterCard = masterGame
      ? `<article class="build-card">
          <div class="build-card__head">
            <h3>${escapeHtml(masterGame.name)} <span class="author-panel__badge">master</span></h3>
            <p class="author-panel__copy">${masterGame.worldMap?.levels?.length || 0} levels</p>
          </div>
          <div class="build-card__links">
            <a class="back-link" href="/play/maze/${encodeURIComponent(defaultLevelIdForGame(masterGame))}">Play</a>
            <a class="back-link" href="/flyover/maze/${encodeURIComponent(defaultLevelIdForGame(masterGame))}">Flyover</a>
          </div>
        </article>`
      : "";
    const worldCards = worlds
      .map(
        (world) => `<article class="build-card">
          <div class="build-card__head">
            <h3>${escapeHtml(world.title)}${world.kind === "online" ? ' <span class="author-panel__badge">online copy</span>' : ""}</h3>
            <p class="author-panel__copy">${world.world_width}&times;${world.world_height} world &middot; ${world.level_count} level${world.level_count === 1 ? "" : "s"}</p>
          </div>
          <div class="build-card__links">
            <a class="back-link" href="${escapeHtml(world.play_url)}">Play</a>
            <a class="back-link" href="${escapeHtml(world.flyover_url)}">Flyover</a>
          </div>
        </article>`
      )
      .join("");

    return renderPage({
      title: "Play Mode",
      bodyClass: "author-body build-body",
      body: `<main class="shell build-shell">
        <header class="author-header">
          <div class="author-topbar">
            <h1>Play Mode</h1>
            <nav class="page-nav" aria-label="Play navigation">
              <a class="back-link" href="/">Home</a>
              <a class="back-link" href="/build">Build Mode</a>
            </nav>
          </div>
        </header>
        <div class="build-layout">
          <section class="author-panel build-section" aria-label="Master world">
            <h2>Master World</h2>
            <div class="build-card-list">${masterCard}</div>
          </section>
          <section class="author-panel build-section" aria-label="Local worlds">
            <h2>My Worlds</h2>
            <div class="build-card-list">${
              worldCards ||
              '<p class="author-panel__copy">No local worlds yet — create one in <a href="/build">Build Mode</a>.</p>'
            }</div>
          </section>
        </div>
      </main>`
    });
  }

  function renderGamePage(game) {
    const startLevelId = defaultLevelIdForGame(game);
    const startLink = startLevelId
      ? `<a class="back-link" href="/play/${encodeURIComponent(game.id)}/${encodeURIComponent(startLevelId)}">Play</a>`
      : "";
    const authorLink =
      game.worldMap && startLevelId
        ? `<a class="back-link" href="/author/${encodeURIComponent(game.id)}/${encodeURIComponent(startLevelId)}">Author</a>`
        : "";
    const worldMapLink =
      game.worldMap
        ? `<a class="back-link" href="/world-map/${encodeURIComponent(game.id)}">World Map</a>`
        : "";
    const levelsSection =
      game.worldMap
        ? ""
        : `<section class="stack">
          <h2>Levels</h2>
          <ul class="level-list">${game.levels
            .map(
              (level) => `<li><a href="${escapeHtml(level.playUrl)}">${escapeHtml(level.label)}</a></li>`
            )
            .join("")}</ul>
        </section>`;

    return renderPage({
      title: game.name,
      body: `<main class="shell">
        <nav class="page-nav">
          <a class="back-link" href="/">Back</a>
        </nav>
        <h1>${escapeHtml(game.name)}</h1>
        ${startLink}
        ${authorLink}
        ${worldMapLink}
        ${levelsSection}
      </main>`
    });
  }

  function renderPlayPage(game, level) {
    const levelState = getLevelState(game, level);
    const hasBoard = levelState.width > 0 && levelState.height > 0;
    const fuzzyToggleMarkup = hasBoard
      ? `<button
            id="fuzzy-toggle"
            class="effect-toggle is-active"
            type="button"
            aria-pressed="true"
            aria-label="Fuzzy noise"
            title="Fuzzy"
          >
            <span class="effect-icon effect-icon--fuzzy" aria-hidden="true"></span>
            <span class="effect-toggle-track" aria-hidden="true">
              <span class="effect-toggle-thumb"></span>
            </span>
          </button>`
      : "";
    const edgeToggleMarkup = hasBoard
      ? `<button
            id="edge-toggle"
            class="effect-toggle is-active"
            type="button"
            aria-pressed="true"
            aria-label="Black edges"
            title="Black edges"
          >
            <span class="effect-icon effect-icon--edges" aria-hidden="true"></span>
            <span class="effect-toggle-track" aria-hidden="true">
              <span class="effect-toggle-thumb"></span>
            </span>
          </button>`
      : "";
    const cameraModeToggleMarkup = hasBoard
      ? `<button
            id="camera-mode-toggle"
            class="camera-mode-toggle"
            type="button"
            aria-pressed="true"
            title="Switch camera projection"
          >Perspective</button>`
      : "";
    const resetProgressButtonMarkup = hasBoard
      ? `<button
            id="reset-progress"
            class="progress-reset-button"
            type="button"
            title="Reset collected gems"
          >Reset Progress</button>`
      : "";
    const boardMarkup =
      hasBoard
        ? `<section class="play-stage" aria-label="${escapeHtml(game.name)} board">
            <div class="maze-frame">
              <canvas
                id="maze-canvas"
                class="maze-canvas"
                width="${levelState.width * 64}"
                height="${levelState.height * 64}"
                aria-label="${escapeHtml(game.name)} board"
              ></canvas>
            </div>
          </section>
          <script>window.__PLAY_DATA__ = ${serializeForScript(levelState)};</script>
          <script src="/play-rules.js" defer></script>
          <script src="/play-core.js" defer></script>
          <script src="/play-render-effects.js" defer></script>
          <script src="/play-render-terrain.js" defer></script>
          <script src="/play-render-actors.js" defer></script>
          <script src="/play-render-three.js" defer></script>
          <script src="/play-render-compositor.js" defer></script>
          <script src="/play-render.js" defer></script>
          <script src="/maze-engine.js" defer></script>
          <script src="/play-movement.js" defer></script>
          <script src="/play-world-transitions.js" defer></script>
          <script src="/play-gameplay.js" defer></script>
          <script src="/play.js" defer></script>`
        : `<section class="play-stage"><p>This level is empty.</p></section>`;

    return renderPage({
      title: `${game.name} ${level.label}`,
      bodyClass: "play-body",
      body: `<main class="play-shell">
        <header class="play-header">
          <h1>${escapeHtml(game.name)}</h1>
          <div class="play-header-meta">
            <a class="back-link" href="/games/${encodeURIComponent(game.id)}">Back</a>
            <a class="back-link" data-play-author-link href="/author/${encodeURIComponent(game.id)}/${encodeURIComponent(level.id)}">Author</a>
            <a class="back-link" href="/world-map/${encodeURIComponent(game.id)}">World Map</a>
            <p>${escapeHtml(level.label)}</p>
            ${resetProgressButtonMarkup}
            ${cameraModeToggleMarkup}
            ${edgeToggleMarkup}
            ${fuzzyToggleMarkup}
          </div>
        </header>
        ${boardMarkup}
      </main>`
    });
  }

  function renderFlyoverPage(game, level) {
    const levelState = {
      ...getLevelState(game, level),
      flyover: true,
      flyoverRadius: 3
    };
    const hasBoard = levelState.width > 0 && levelState.height > 0;
    const boardMarkup =
      hasBoard
        ? `<section class="play-stage flyover-stage" aria-label="${escapeHtml(game.name)} flyover">
            <div class="maze-frame flyover-frame">
              <canvas
                id="maze-canvas"
                class="maze-canvas"
                width="${levelState.width * 64}"
                height="${levelState.height * 64}"
                aria-label="${escapeHtml(game.name)} flyover"
              ></canvas>
            </div>
            <div class="flyover-hud"></div>
          </section>
          <script>window.__PLAY_DATA__ = ${serializeForScript(levelState)};</script>
          <script src="/play-rules.js" defer></script>
          <script src="/play-core.js" defer></script>
          <script src="/play-render-effects.js" defer></script>
          <script src="/play-render-terrain.js" defer></script>
          <script src="/play-render-actors.js" defer></script>
          <script src="/play-render-three.js" defer></script>
          <script src="/play-render-compositor.js" defer></script>
          <script src="/play-render.js" defer></script>
          <script src="/maze-engine.js" defer></script>
          <script src="/flyover.js" defer></script>`
        : `<section class="play-stage"><p>This level is empty.</p></section>`;

    return renderPage({
      title: `${game.name} Flyover`,
      bodyClass: "play-body flyover-body",
      body: `<main class="play-shell flyover-shell">
        ${boardMarkup}
      </main>`
    });
  }

  function renderAuthorPage(game, level) {
    const authorData = buildAuthorPageData(game, level);
    const worldConfig = worldMaps.worldConfigForGame(game.id);

    return renderPage({
      title: `${game.name} Author`,
      bodyClass: "author-body",
      body: `<main class="shell author-shell">
        <header class="author-header">
          <div class="author-topbar">
            <h1>Editor</h1>
            <nav class="page-nav author-nav" aria-label="Author navigation">
              <a class="back-link" id="author-play-link" href="/play/${encodeURIComponent(game.id)}/${encodeURIComponent(level.id)}">Play</a>
              <a class="back-link" href="/world-map/${encodeURIComponent(game.id)}">World Map</a>
            </nav>
            <button id="undo-level" class="tool-button author-undo-button" type="button" disabled>Undo</button>
            <button id="save-level" class="tool-button tool-button--primary author-save-button" type="button">Save</button>
            <p id="author-status" class="author-status" role="status" aria-live="polite"></p>
            <div id="solver-progress" class="solver-progress" hidden>
              <div
                id="solver-progress-track"
                class="solver-progress__track"
                role="progressbar"
                aria-label="Solver search progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="0"
              >
                <div id="solver-progress-bar" class="solver-progress__bar"></div>
              </div>
              <span id="solver-progress-text" class="solver-progress__text">0 / 1,000,000 states</span>
            </div>
          </div>
        </header>
        <div class="author-layout">
          <aside class="author-sidebar">
            <details class="author-panel author-disclosure author-disclosure--world">
              <summary class="author-disclosure__summary">
                <span>World Slot</span>
              </summary>
              <div class="author-disclosure__body">
                <div id="level-neighbors" class="author-neighbors" aria-label="Neighbor levels">
                  <button class="tool-button author-neighbors__button author-neighbors__button--up" type="button" data-dx="0" data-dy="-1"><span aria-hidden="true">&#8593;</span></button>
                  <button class="tool-button author-neighbors__button author-neighbors__button--left" type="button" data-dx="-1" data-dy="0"><span aria-hidden="true">&#8592;</span></button>
                  <button class="tool-button author-neighbors__button author-neighbors__button--right" type="button" data-dx="1" data-dy="0"><span aria-hidden="true">&#8594;</span></button>
                  <button class="tool-button author-neighbors__button author-neighbors__button--down" type="button" data-dx="0" data-dy="1"><span aria-hidden="true">&#8595;</span></button>
                </div>
              </div>
            </details>
            <details class="author-panel author-disclosure author-panel--palette">
              <summary class="author-disclosure__summary">
                <span>Paint</span>
                <span id="selected-tool-label" class="author-panel__badge"></span>
              </summary>
              <div class="author-disclosure__body">
                <div id="palette" class="palette"></div>
              </div>
            </details>
            <details class="author-panel author-disclosure">
              <summary class="author-disclosure__summary">
                <span>Board</span>
              </summary>
              <div class="author-disclosure__body">
                <div class="author-control-row">
                  <label class="field field--compact">
                    <span>Width</span>
                    <input id="board-width" type="number" min="1" max="${worldConfig.gridWidth}" inputmode="numeric">
                  </label>
                  <label class="field field--compact">
                    <span>Height</span>
                    <input id="board-height" type="number" min="1" max="${worldConfig.gridHeight}" inputmode="numeric">
                  </label>
                  <button id="resize-level" class="tool-button" type="button">Resize</button>
                </div>
                <div class="author-control-row">
                  <button id="clear-level" class="tool-button tool-button--danger" type="button">
                    <span class="tool-button__icon" aria-hidden="true">&#10005;</span>
                    <span>Clear</span>
                  </button>
                  <button id="frame-level" class="tool-button" type="button">
                    <span class="tool-button__icon" aria-hidden="true">&#9633;</span>
                    <span>Frame</span>
                  </button>
                </div>
              </div>
            </details>
            <details class="author-panel author-disclosure">
              <summary class="author-disclosure__summary">
                <span>Transformer</span>
              </summary>
              <div class="author-disclosure__body">
                <div class="author-control-row">
                  <button id="rotate-left" class="tool-button" type="button" title="Rotate level left">
                    <span class="tool-button__icon" aria-hidden="true">&#8634;</span>
                    <span>Rotate Left</span>
                  </button>
                  <button id="rotate-right" class="tool-button" type="button" title="Rotate level right">
                    <span class="tool-button__icon" aria-hidden="true">&#8635;</span>
                    <span>Rotate Right</span>
                  </button>
                  <button id="flip-horizontal" class="tool-button" type="button" title="Mirror level left to right">
                    <span class="tool-button__icon" aria-hidden="true">&#8596;</span>
                    <span>Flip H</span>
                  </button>
                  <button id="flip-vertical" class="tool-button" type="button" title="Mirror level top to bottom">
                    <span class="tool-button__icon" aria-hidden="true">&#8597;</span>
                    <span>Flip V</span>
                  </button>
                </div>
              </div>
            </details>
            <details class="author-panel author-disclosure">
              <summary class="author-disclosure__summary">
                <span>Solver</span>
              </summary>
              <div class="author-disclosure__body">
                <div class="author-control-row">
                  <label class="field">
                    <span>Search states</span>
                    <input id="solver-max-states" type="number" min="1" step="1" value="1000000" inputmode="numeric" aria-label="Solver search state limit">
                  </label>
                  <label class="field">
                    <span>Algorithm</span>
                    <select id="solver-algorithm" aria-label="Solver algorithm">
                      <option value="astar" selected>A*</option>
                      <option value="weighted_astar">Weighted A*</option>
                      <option value="bfs">BFS</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>Hill-Climb</span>
                    <select id="hill-climb-mode" aria-label="Hill-Climb mode">
                      <option value="place_gem" selected>Place Gem</option>
                      <option value="fixed_gem">Fixed Gem</option>
                    </select>
                  </label>
                </div>
                <div class="author-control-row">
                  <button id="place-gem" class="tool-button" type="button">Place Gem</button>
                  <button id="hill-climb" class="tool-button" type="button">Hill-Climb</button>
                  <button id="solver-cancel" class="tool-button" type="button" disabled>Cancel</button>
                  <button id="solve-level" class="tool-button" type="button">Solver</button>
                  <button id="play-solution" class="tool-button" type="button">
                    <span class="tool-button__icon" aria-hidden="true">&#9654;</span>
                    <span>Play Solution</span>
                  </button>
                </div>
                <div class="author-control-row">
                  <button id="hill-climb-prev" class="tool-button" type="button" disabled>Prev Result</button>
                  <button id="hill-climb-next" class="tool-button" type="button" disabled>Next Result</button>
                  <span id="hill-climb-result-label" class="author-panel__copy"></span>
                </div>
              </div>
            </details>
            <details class="author-panel author-disclosure">
              <summary class="author-disclosure__summary">
                <span>Cell</span>
              </summary>
              <div class="author-disclosure__body">
                <p id="selected-cell-label" class="author-panel__copy"></p>
                <label class="field">
                  <span>Raw value</span>
                  <input id="cell-value" type="text" spellcheck="false" aria-label="Selected cell raw value">
                </label>
                <button id="apply-cell-value" class="tool-button" type="button">Apply Cell</button>
              </div>
            </details>
            <details class="author-panel author-disclosure author-output-panel">
              <summary class="author-disclosure__summary">
                <span>Text Output</span>
              </summary>
              <div class="author-disclosure__body">
                <textarea id="raw-output" class="raw-output" readonly spellcheck="false"></textarea>
              </div>
            </details>
          </aside>
          <section class="author-workspace">
            <section class="author-stage" aria-label="Level canvas">
              <section class="author-grid-shell">
                <div id="author-grid" class="author-grid" aria-label="Maze author grid">
                  <canvas id="author-canvas" class="author-grid__canvas"></canvas>
                  <div id="author-hit-grid" class="author-grid__hit-grid"></div>
                </div>
              </section>
            </section>
          </section>
        </div>
        <script>window.__AUTHOR_DATA__ = ${serializeForScript(authorData)};</script>
        <script src="/play-rules.js" defer></script>
        <script src="/play-core.js" defer></script>
        <script src="/play-render-effects.js" defer></script>
        <script src="/play-render-terrain.js" defer></script>
        <script src="/play-render-actors.js" defer></script>
        <script src="/play-render-three.js" defer></script>
        <script src="/play-render-compositor.js" defer></script>
        <script src="/play-render.js" defer></script>
        <script src="/maze-engine.js" defer></script>
        <script src="/play-movement.js" defer></script>
        <script src="/play-world-transitions.js" defer></script>
        <script src="/play-gameplay.js" defer></script>
        <script src="/level-preview.js" defer></script>
        <script src="/author-play-data.js" defer></script>
        <script src="/maze-solver.js" defer></script>
        <script src="/author.js" defer></script>
      </main>`
    });
  }

  function renderWorldMapEditorPage(game) {
    const worldMapData = buildMazeWorldMapEditorData(game);

    return renderPage({
      title: `${game.name} World Editor`,
      bodyClass: "author-body",
      body: `<main class="shell world-map-shell">
        <header class="author-header">
          <div class="author-topbar world-map-topbar">
            <h1>World Editor</h1>
            <a id="world-map-play-link" class="back-link world-map-slot-link is-disabled" href="#" aria-disabled="true">Play Slot</a>
            <a id="world-map-author-link" class="back-link world-map-slot-link is-disabled" href="#" aria-disabled="true">Edit Slot</a>
            <button id="world-map-save" class="tool-button tool-button--primary" type="button">Save</button>
            <button id="world-map-deselect" class="tool-button" type="button">Deselect</button>
            <p id="world-map-status" class="sr-only" role="status" aria-live="polite"></p>
          </div>
        </header>
        <div class="world-map-layout">
          <aside class="author-sidebar world-map-sidebar">
            <details class="author-panel author-disclosure world-map-unmapped-panel">
              <summary class="author-disclosure__summary">
                <span>Unmapped Tiles</span>
              </summary>
              <div class="author-disclosure__body">
                <div id="world-map-unplaced" class="world-map-list"></div>
              </div>
            </details>
          </aside>
          <section class="world-map-workspace">
            <section class="author-grid-shell world-map-grid-shell">
              <div class="world-map-canvas">
                <div id="world-map-grid" class="world-map-grid" aria-label="World map grid"></div>
              </div>
            </section>
          </section>
        </div>
        <script>window.__WORLD_MAP_EDITOR_DATA__ = ${serializeForScript(worldMapData)};</script>
        <script src="/world-map.js" defer></script>
      </main>`
    });
  }

  function renderBuildPage() {
    const masterGame = getGame("maze");
    const masterLevelId = masterGame ? defaultLevelIdForGame(masterGame) : null;
    const buildData = {
      apiUrl: "/api/build/worlds",
      master: masterGame
        ? {
            id: masterGame.id,
            name: masterGame.name,
            level_count: masterGame.worldMap?.levels?.length || 0,
            play_url: `/play/maze/${encodeURIComponent(masterLevelId)}`,
            author_url: `/author/maze/${encodeURIComponent(masterLevelId)}`,
            world_map_url: "/world-map/maze",
            flyover_url: `/flyover/maze/${encodeURIComponent(masterLevelId)}`
          }
        : null,
      worlds: buildWorlds.listLocalWorlds(),
      remote: remote.getStatus()
    };

    return renderPage({
      title: "Build Mode",
      bodyClass: "author-body build-body",
      body: `<main class="shell build-shell">
        <header class="author-header">
          <div class="author-topbar">
            <h1>Build Mode</h1>
            <nav class="page-nav" aria-label="Build navigation">
              <a class="back-link" href="/">Home</a>
            </nav>
            <p id="build-status" class="author-status" role="status" aria-live="polite"></p>
          </div>
        </header>
        <div class="build-layout">
          <section class="author-panel build-section" aria-label="Master world">
            <h2>Master World</h2>
            <div id="build-master" class="build-card-list"></div>
          </section>
          <section class="author-panel build-section" aria-label="My worlds">
            <h2>My Worlds</h2>
            <p class="author-panel__copy">Draft worlds live in this repo under <code>games/</code> and never publish anywhere unless you push them.</p>
            <div id="build-worlds" class="build-card-list"></div>
          </section>
          <section class="author-panel build-section" aria-label="New world">
            <h2>New World</h2>
            <div class="author-control-row">
              <label class="field"><span>Title</span><input id="new-world-title" type="text" placeholder="My World"></label>
              <label class="field field--compact"><span>Columns</span><input id="new-world-width" type="number" min="1" max="26" value="3" inputmode="numeric"></label>
              <label class="field field--compact"><span>Rows</span><input id="new-world-height" type="number" min="1" max="26" value="3" inputmode="numeric"></label>
              <button id="create-world" class="tool-button tool-button--primary" type="button">Create World</button>
            </div>
            <div class="author-control-row">
              <button id="copy-master" class="tool-button" type="button">Copy Master World to Draft</button>
              <button id="import-world" class="tool-button" type="button">Import World JSON</button>
              <input id="import-world-file" type="file" accept="application/json,.json" hidden>
            </div>
          </section>
          <section id="build-remote-section" class="author-panel build-section" aria-label="MazeBench account" hidden>
            <h2>MazeBench.com Account</h2>
            <div id="build-remote"></div>
          </section>
        </div>
        <script>window.__BUILD_DATA__ = ${serializeForScript(buildData)};</script>
        <script src="/build.js" defer></script>
      </main>`
    });
  }

  function agentWorldOption(game) {
    return {
      id: game.id,
      title: game.id === "maze" ? `${game.name} (master)` : game.name,
      level_ids: (game.worldMap?.levels || []).map((level) => level.id),
      default_level_id: defaultLevelIdForGame(game),
      gem_count: game.id === "maze" ? 100 : undefined
    };
  }

  function renderAgentPage() {
    const masterGame = getGame("maze");
    const worlds = [
      ...(masterGame ? [agentWorldOption(masterGame)] : []),
      ...buildWorlds
        .listLocalWorlds()
        .map((world) => getGame(world.id))
        .filter((game) => game && game.worldMap)
        .map(agentWorldOption)
    ];
    const agentData = {
      apiUrl: "/api/agent/runs",
      worlds,
      environment: agentEnvironment(),
      remote: remote.getStatus()
    };

    return renderPage({
      title: "Agent Mode",
      bodyClass: "author-body build-body",
      body: `<main class="shell build-shell agent-shell">
        <header class="author-header">
          <div class="author-topbar">
            <h1>Agent Mode</h1>
            <nav class="page-nav" aria-label="Agent navigation">
              <a class="back-link" href="/">Home</a>
              <a class="back-link" href="/build">Build Mode</a>
            </nav>
            <p id="agent-status" class="author-status" role="status" aria-live="polite"></p>
          </div>
        </header>
        <div class="build-layout">
          <section class="author-panel build-section" aria-label="Launch a run">
            <h2>New Run</h2>
            <div class="author-control-row">
              <label class="field"><span>Agent</span>
                <select id="run-model">
                  <option value="codex">Codex CLI</option>
                  <option value="claude">Claude Code</option>
                  <option value="prime">Prime Verifiers</option>
                </select>
              </label>
              <label class="field"><span>World</span><select id="run-world"></select></label>
              <label class="field"><span>Start level</span><select id="run-level"></select></label>
              <label class="field field--compact"><span>Moves</span><input id="run-moves" type="number" min="1" max="500" value="20" inputmode="numeric"></label>
            </div>
            <div class="author-control-row">
              <label class="field"><span>Observation</span>
                <select id="run-mode">
                  <option value="text">Text (ASCII board)</option>
                  <option value="vision">Vision (rendered PNGs)</option>
                </select>
              </label>
              <label class="field"><span>Model id (optional)</span><input id="run-model-name" type="text" placeholder="agent default"></label>
              <label class="field" data-codex-only><span>Reasoning</span>
                <select id="run-reasoning">
                  <option value="">model default</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="xhigh">xhigh</option>
                </select>
              </label>
            </div>
            <div class="author-control-row agent-toggles">
              <label class="agent-check"><input id="run-container" type="checkbox" checked> Container (isolated)</label>
              <label class="agent-check"><input id="run-video" type="checkbox" checked> Replay video</label>
              <label class="agent-check"><input id="run-tools" type="checkbox"> Full tool access</label>
              <label class="agent-check" data-codex-only><input id="run-codex-fast" type="checkbox"> Codex fast mode</label>
            </div>
            <div class="author-control-row" data-prime-only hidden>
              <label class="field field--compact"><span>Examples (n)</span><input id="run-prime-n" type="number" min="1" max="50" value="1"></label>
              <label class="field field--compact"><span>Rollouts (r)</span><input id="run-prime-r" type="number" min="1" max="10" value="1"></label>
              <label class="field field--compact"><span>Max turns</span><input id="run-prime-turns" type="number" min="1" max="200" value="8"></label>
            </div>
            <div class="author-control-row">
              <button id="launch-run" class="tool-button tool-button--primary" type="button">Launch Run</button>
              <button id="add-online-world" class="tool-button" type="button">Add Online World&hellip;</button>
            </div>
            <p id="agent-environment" class="author-panel__copy"></p>
          </section>
          <section id="online-picker" class="author-panel build-section" aria-label="Online worlds" hidden>
            <h2>Online Worlds</h2>
            <p class="author-panel__copy">Published community worlds from <span id="online-origin"></span>. Picking one downloads a local copy agents can run on.</p>
            <div id="online-worlds" class="build-card-list"></div>
          </section>
          <section class="author-panel build-section" aria-label="Runs">
            <h2>Runs</h2>
            <div id="agent-runs" class="build-card-list"></div>
          </section>
        </div>
        <script>window.__AGENT_DATA__ = ${serializeForScript(agentData)};</script>
        <script src="/agent.js" defer></script>
      </main>`
    });
  }

  function renderAgentRunPage(run) {
    return renderPage({
      title: `Run ${run.id}`,
      bodyClass: "author-body build-body",
      body: `<main class="shell build-shell agent-run-shell">
        <header class="author-header">
          <div class="author-topbar">
            <h1>Agent Run</h1>
            <nav class="page-nav" aria-label="Run navigation">
              <a class="back-link" href="/agent">Agent Mode</a>
              <a class="back-link" href="/">Home</a>
            </nav>
            <button id="stop-run" class="tool-button tool-button--danger" type="button" hidden>Stop Run</button>
            <p id="run-status" class="author-status" role="status" aria-live="polite"></p>
          </div>
        </header>
        <div class="build-layout">
          <section class="author-panel build-section">
            <h2 id="run-title"></h2>
            <p id="run-meta" class="author-panel__copy"></p>
            <div id="run-stats" class="agent-stats"></div>
          </section>
          <section class="author-panel build-section" id="run-video-section" hidden>
            <h2>Replay</h2>
            <video id="run-video" controls playsinline style="max-width:100%"></video>
          </section>
          <section class="author-panel build-section">
            <h2>Board</h2>
            <pre id="run-board" class="agent-board">(waiting for the first action&hellip;)</pre>
          </section>
          <section class="author-panel build-section">
            <h2>Moves</h2>
            <div id="run-turns" class="agent-turns"></div>
          </section>
          <section class="author-panel build-section" id="run-reasoning-section" hidden>
            <h2>Agent Reasoning</h2>
            <div id="run-reasoning" class="agent-turns"></div>
          </section>
          <section class="author-panel build-section">
            <h2>Runner Log</h2>
            <pre id="run-log" class="agent-log"></pre>
          </section>
        </div>
        <script>window.__AGENT_RUN__ = ${serializeForScript(run)};</script>
        <script src="/agent-run.js" defer></script>
      </main>`
    });
  }

  function renderNotFound() {
    return renderPage({
      title: "Not Found",
      body: `<main class="shell">
        <h1>Not Found</h1>
      </main>`
    });
  }

  return {
    renderAgentPage,
    renderAgentRunPage,
    renderAuthorPage,
    renderBuildPage,
    renderFlyoverPage,
    renderGamePage,
    renderHomePage,
    renderNotFound,
    renderPlayModePage,
    renderPlayPage,
    renderWorldMapEditorPage
  };
}

module.exports = {
  createPageRenderer
};
