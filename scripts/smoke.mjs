import { execFileSync } from "node:child_process";

const commands = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "test:unit"]],
  ["npm", ["run", "test:integration"]],
  ["npm", ["run", "test:e2e"]]
];

for (const [command, args] of commands) {
  execFileSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
}

console.log("FairTurn smoke flow completed.");
