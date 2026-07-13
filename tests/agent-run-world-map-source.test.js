const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pages = fs.readFileSync(path.join(root, "server", "pages.js"), "utf8");
const runScript = fs.readFileSync(path.join(root, "public", "agent-run.js"), "utf8");
const siteTheme = fs.readFileSync(path.join(root, "public", "local-site.css"), "utf8");

assert.match(pages, /id="run-rooms-map-button"[^>]+aria-haspopup="dialog"/);
assert.match(pages, /id="run-rooms-map-dialog"[^>]+role="dialog"[^>]+aria-modal="true"/);
assert.match(pages, /window\.__AGENT_RUN_WORLD__ = \$\{serializeForScript\(runWorld\)\}/);
assert.match(runScript, /function visitedRoomIds\(\)/);
assert.match(runScript, /function renderRunWorldMap\(\{ force = false \} = \{\}\)/);
assert.match(runScript, /cell\.classList\.toggle\("is-visited", isVisited\)/);
assert.match(runScript, /cell\.classList\.toggle\("is-current", isCurrent\)/);
assert.match(runScript, /event\.key === "Escape" && roomsMapDialog\?\.hidden === false/);
assert.match(siteTheme, /\.run-rooms-map-button \{/);
assert.match(siteTheme, /\.run-world-map__cell\.is-visited \{/);
assert.match(siteTheme, /\.run-world-map__cell\.is-current \{/);

console.log("agent-run-world-map-source: OK — run exploration exposes the visited-room world map.");
