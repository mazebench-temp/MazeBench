#!/usr/bin/env node

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let event = {};
  try {
    event = JSON.parse(input);
  } catch (_error) {
    process.stderr.write("Restricted game mode rejected an unreadable tool request.\n");
    process.exitCode = 2;
    return;
  }

  if (event.tool_name === "exec") {
    process.stderr.write("External tools are disabled for this run; use only the direct game controls.\n");
    process.exitCode = 2;
  }
});
