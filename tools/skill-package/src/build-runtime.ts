import { cp } from "node:fs/promises";
import { build } from "esbuild";

await cp("project-version.json", "skill/project-version.json");
await build({
  entryPoints: ["tools/copilot/src/context-cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "skill/scripts/context-runtime.mjs",
  banner: {
    js: "import { createRequire } from \"node:module\"; const require = createRequire(import.meta.url);"
  },
  logLevel: "info"
});
