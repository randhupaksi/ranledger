import { spawn } from "node:child_process";
import path from "node:path";
const children = [];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
function start(script, args = []) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!closing) stop(code ?? 1);
  });
}
start(path.join("node_modules", "tsx", "dist", "cli.mjs"), ["server/index.ts"]);
start(
  path.join("node_modules", "vite", "bin", "vite.js"),
  process.argv.slice(2),
);
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
