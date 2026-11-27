import { build } from "esbuild";
await build({
  entryPoints: ["apps/api/src/main.ts", "apps/api/src/worker.ts"],
  outdir: "dist/api",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node22",
  sourcemap: false,
});
