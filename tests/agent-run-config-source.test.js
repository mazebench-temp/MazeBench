const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pages = fs.readFileSync(path.join(root, "server", "pages.js"), "utf8");
const runScript = fs.readFileSync(path.join(root, "public", "agent-run.js"), "utf8");
const siteTheme = fs.readFileSync(path.join(root, "public", "local-site.css"), "utf8");

assert.match(pages, /id="run-meta" class="run-config" aria-label="Launch configuration"/);
assert.match(runScript, /function runConfiguration\(run\)/);
assert.match(runScript, /run\.launch_params && typeof run\.launch_params === "object"/);
for (const label of [
  "Provider",
  "Model",
  "World",
  "Start room",
  "Budget",
  "Observation",
  "Reasoning",
  "Allow quit",
  "Fast mode",
  "Isolation",
  "Tool use",
  "Orchestration"
]) {
  assert.match(runScript, new RegExp(`\\["${label}"`), `missing ${label} launch parameter`);
}
assert.match(runScript, /run\.model === "codex" && Object\.prototype\.hasOwnProperty\.call\(params, "codex_fast"\)/);
assert.doesNotMatch(runScript, /`run \$\{run\.id\}`/);
assert.match(runScript, /class="run-config__item\$\{active \? " is-active" : ""\}"/);
assert.match(siteTheme, /\.run-config__list \{/);
assert.match(siteTheme, /\.run-config__item\.is-active \{/);

console.log("agent-run-config-source: OK — saved launch choices render as structured configuration pills.");
