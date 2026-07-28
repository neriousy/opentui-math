import { writeFile } from "node:fs/promises"
import { renderLatexToPng } from "../src/graphics/index.js"

const source = process.argv[2] ?? String.raw`\frac{x\sqrt{3}}{(x-3)^2}`
const output = process.argv[3] ?? "latex-preview.png"
const image = await renderLatexToPng(source, {
  foregroundColor: "#111111",
  backgroundColor: "#ffffff",
  fontSize: 48,
  pixelRatio: 2,
})

await writeFile(output, image.png)
console.log(`Rendered ${image.width}×${image.height}px to ${output}`)
