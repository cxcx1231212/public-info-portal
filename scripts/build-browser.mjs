import { build } from "esbuild";

await build({
  entryPoints: ["src/browser-loader.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  outfile: "app-loader.js"
});
