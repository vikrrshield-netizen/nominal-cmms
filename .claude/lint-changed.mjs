import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const file = (payload.tool_input && payload.tool_input.file_path) || "";
  if (!/\.(tsx?|jsx?)$/.test(file)) process.exit(0);

  const eslintBin = join(projectDir, "node_modules", "eslint", "bin", "eslint.js");
  const result = spawnSync(
    process.execPath,
    [eslintBin, "--no-warn-ignored", file],
    { cwd: projectDir, encoding: "utf8" }
  );

  const output = ((result.stdout || "") + (result.stderr || "")).trim();

  if (result.status && output) {
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          "ESLint nasel problem v souboru, ktery jsi prave upravil:\n\n" +
          output +
          "\n\nOprav prosim tyto chyby a pokracuj.",
      })
    );
  }
  process.exit(0);
});
