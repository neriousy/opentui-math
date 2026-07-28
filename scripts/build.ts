import { mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const dist = resolve(root, "dist")

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

const result = await Bun.build({
  entrypoints: [
    resolve(root, "src/index.ts"),
    resolve(root, "src/react.ts"),
    resolve(root, "src/solid.ts"),
    resolve(root, "src/graphics/index.ts"),
    resolve(root, "src/graphics/react.ts"),
    resolve(root, "src/graphics/solid.ts"),
  ],
  outdir: dist,
  target: "bun",
  format: "esm",
  splitting: true,
  sourcemap: "linked",
  external: [
    "@opentui/core",
    "@opentui/core/yoga",
    "@opentui/react",
    "@opentui/solid",
    "@opentui/solid/components",
    "mathjax",
    "@resvg/resvg-js",
  ],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

const declarations = Bun.spawnSync(["bunx", "tsc", "-p", resolve(root, "tsconfig.build.json")], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
})
if (declarations.exitCode !== 0) process.exit(declarations.exitCode)

console.log("Built opentui-math in dist/")
