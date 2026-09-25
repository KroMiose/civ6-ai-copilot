import { build } from "esbuild";

await build({
  entryPoints: ["tools/copilot/src/context-cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "skill/scripts/context-runtime.mjs",
  banner: {
    js: "#!/usr/bin/env node"
  },
  logLevel: "info"
});
