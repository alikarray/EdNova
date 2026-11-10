// Offline build: JSX -> frontend/dist/app.js (esbuild) and Tailwind -> frontend/dist/styles.css.
// Run:  node build.mjs   (needs: npm i react react-dom esbuild tailwindcss)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "src");
const dist = path.join(here, "dist");
mkdirSync(dist, { recursive: true });

const nodePaths = [path.join(here, "node_modules"), "/opt/npm-tools/node_modules"].filter(existsSync);
const req = createRequire(path.join(nodePaths[0], "x.js"));
const esbuild = await import(pathToFileURL(req.resolve("esbuild")).href);
const { build } = esbuild;

await build({
  entryPoints: [path.join(src, "app.jsx")], bundle: true, minify: true, format: "iife", outfile: path.join(dist, "app.js"),
  jsx: "automatic", nodePaths, define: { "process.env.NODE_ENV": '"production"' }, loader: { ".js": "jsx" }, logLevel: "warning",
});

// Tailwind v4: compile with candidates scraped from the sources.
const tw = await import(pathToFileURL(req.resolve("tailwindcss")).href);
const twDir = path.dirname(req.resolve("tailwindcss/package.json"));
const files = readdirSync(src).filter((f) => /\.(jsx?|html)$/.test(f));
const cand = new Set();
for (const f of [...files.map((f) => path.join(src, f)), path.join(here, "index.html")])
  for (const w of readFileSync(f, "utf8").split(/[\s"'`<>{}(),;]+/)) if (w) cand.add(w);
const css = readFileSync(path.join(src, "styles.css"), "utf8");
const compiler = await (tw.compile || tw.default.compile)(css, {
  base: twDir,
  loadStylesheet: async (id, base) => {
    const p = id === "tailwindcss" ? path.join(twDir, "index.css") : id.startsWith("tailwindcss/") ? path.join(twDir, id.slice(12) + (id.endsWith(".css") ? "" : ".css")) : path.resolve(base, id);
    return { path: p, base: path.dirname(p), content: readFileSync(p, "utf8") };
  },
});
const out = compiler.build([...cand]);
const min = await esbuild.transform(out, { loader: "css", minify: true });
writeFileSync(path.join(dist, "styles.css"), min.code);
console.log("built", path.join(dist, "app.js"), path.join(dist, "styles.css"));
