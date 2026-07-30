# opentui-math

[![npm](https://img.shields.io/npm/v/opentui-math?color=cb3837)](https://www.npmjs.com/package/opentui-math)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/neriousy/opentui-math/blob/main/LICENSE)
[![OpenTUI](https://img.shields.io/badge/OpenTUI-%3E%3D0.4.5-8b5cf6)](https://opentui.com/)

https://github.com/user-attachments/assets/9990a327-514b-4121-8a1e-888d8adba330


Beautiful LaTeX math rendering for [OpenTUI](https://opentui.com/).

`opentui-math` includes two complementary renderers:

- A universal Unicode cell renderer that works in every terminal supported by OpenTUI.
- A high-resolution MathJax renderer for Kitty-compatible terminal graphics, with automatic cell fallback.

It supports intrinsic Yoga layout, live updates, React and Solid elements, standalone string/SVG/PNG rendering, and
partial LaTeX arriving from an AI or network stream.

```text
           ╭────────
     -b ± √ b² - 4ac
x = ─────────────────
           2a
```

## Installation

Install the package with OpenTUI:

```sh
npm install opentui-math @opentui/core
```

```sh
bun add opentui-math @opentui/core
```

```sh
pnpm add opentui-math @opentui/core
```

Requires OpenTUI 0.4.5 or newer. React and Solid integrations use the matching optional `@opentui/react` or
`@opentui/solid` peer dependency.

## Quick start

```ts
import { createCliRenderer } from "@opentui/core"
import { LatexRenderable } from "opentui-math"

const renderer = await createCliRenderer()
const formula = new LatexRenderable(renderer, {
  content: String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
  foregroundColor: "#cdd6f4",
  displayMode: true,
})

renderer.root.add(formula)
```

The renderable measures itself through Yoga. Changing `formula.content` reparses, remeasures, and repaints the same
component:

```ts
formula.content = String.raw`\lim_{n\to\infty}\left(1+\frac{1}{n}\right)^n=e`
```

## High-resolution graphics

Use `GraphicalLatexRenderable` for antialiased New Computer Modern glyphs and browser-quality math spacing:

```ts
import { createCliRenderer } from "@opentui/core"
import { GraphicalLatexRenderable } from "opentui-math/graphics"

const renderer = await createCliRenderer()
const formula = new GraphicalLatexRenderable(renderer, {
  content: String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`,
  foregroundColor: "#f4f4f5",
  fontSize: 36,
})

renderer.root.add(formula)
await formula.whenGraphicsReady()
```

The default `graphicsMode: "auto"` uses Kitty graphics when supported and falls back to Unicode cells everywhere else.
Use `"kitty"` to force graphics or `"cells"` to force the universal renderer.

Known compatible graphics terminals include:

| Terminal | High-resolution mode |
| --- | --- |
| Ghostty | Yes |
| Kitty | Yes |
| WezTerm | Yes |
| Other terminals | Automatic cell fallback |
| tmux, Zellij, or GNU Screen | Cell fallback |

Kitty images retain a stable cell footprint. Zooming the terminal font therefore enlarges the formula along with the
rest of the interface. `pixelRatio` increases raster sharpness without changing that logical size.

### SVG and PNG output

The graphics entry point can render without a TUI:

```ts
import { writeFile } from "node:fs/promises"
import { renderLatexToPng, renderLatexToSvg } from "opentui-math/graphics"

const svg = await renderLatexToSvg(String.raw`E = mc^2`)
const image = await renderLatexToPng(String.raw`\sqrt{x^2+y^2}`, {
  fontSize: 48,
  pixelRatio: 2,
})

await writeFile("formula.png", image.png)
```

## Streaming partial LaTeX

AI responses and network streams often contain temporarily invalid prefixes. Assigning each token directly can cause
parse-error flicker and unnecessary image renders.

`LatexStreamController` coalesces deltas and can temporarily close open arguments, `\left` delimiters, and environments
without altering the accumulated source:

```ts
import {
  completeLatexPrefix,
  GraphicalLatexRenderable,
  LatexStreamController,
} from "opentui-math/graphics"

const formula = new GraphicalLatexRenderable(renderer, {
  content: "",
  fallback: "source",
  strict: true,
  foregroundColor: "#a6e3a1",
})
renderer.root.add(formula)

const stream = new LatexStreamController(formula, {
  incompletePolicy: "apply",
  preview: completeLatexPrefix,
  updateIntervalMs: 25,
  validationOptions: { strict: true },
})

for await (const latexDelta of latexDeltas) {
  stream.append(latexDelta)
}

const result = await stream.finish()
if (!result.applied) console.error(result.error)
```

An unrepairable fragment such as `\beg` is shown as source. A repairable prefix such as `\frac{1}{` is rendered using a
temporary `\frac{1}{}` preview. Once the stream is complete, the exact received LaTeX replaces the preview.

The default `incompletePolicy: "retain"` keeps the previous valid formula instead of displaying raw invalid source.

## React

Register the intrinsic element once before rendering:

```tsx
import { createRoot } from "@opentui/react"
import { registerLatex } from "opentui-math/react"

registerLatex()

createRoot(renderer).render(
  <latex
    content={String.raw`\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}`}
    foregroundColor="#89b4fa"
  />,
)
```

For high-resolution React output, import `registerGraphicalLatex` from `opentui-math/graphics/react` and render
`<latexImage>`.

## Solid

```tsx
import { render } from "@opentui/solid"
import { registerLatex } from "opentui-math/solid"

registerLatex()

render(() => <latex content={String.raw`\int_0^\infty e^{-x}\,dx = 1`} />, renderer)
```

The high-resolution Solid entry point is `opentui-math/graphics/solid`.

## Pure cell renderer

The parser and layout engine also work without a running TUI:

```ts
import { renderLatexToString } from "opentui-math"

console.log(
  renderLatexToString(
    String.raw`\begin{pmatrix}a & b \\ c & d\end{pmatrix}`,
  ),
)
```

```text
⎛a b⎞
⎜   ⎟
⎝c d⎠
```

`renderLatex()` returns `{ width, height, baseline, cells, toString() }` for testing and custom composition.

## Package entry points

| Import | Purpose |
| --- | --- |
| `opentui-math` | Cell parser, layout, renderer, renderable, and streaming |
| `opentui-math/react` | React `<latex>` registration |
| `opentui-math/solid` | Solid `<latex>` registration |
| `opentui-math/graphics` | High-resolution renderable and SVG/PNG functions |
| `opentui-math/graphics/react` | React `<latexImage>` registration |
| `opentui-math/graphics/solid` | Solid `<latexImage>` registration |

## Options

### Cell renderer

| Option | Default | Purpose |
| --- | --- | --- |
| `content` | `""` | LaTeX math source |
| `foregroundColor` | `#e8e8f0` | Formula color |
| `backgroundColor` | transparent | Formula background |
| `displayMode` | `true` | Put limits above and below large operators |
| `compactScripts` | `true` | Use Unicode super/subscripts when exact glyphs exist |
| `macros` | `{}` | Expand lightweight user command macros |
| `maxSourceLength` | `100000` | Reject unexpectedly large formulas |
| `maxExpandedLength` | `maxSourceLength` | Bound macro-expanded output |
| `maxDepth` | `256` | Bound nested groups and commands |
| `strict` | `false` | Throw on unknown commands |
| `fallback` | `"message"` | Error behavior: `"message"`, `"source"`, or `"throw"` |
| `errorColor` | `#ff6b6b` | Fallback error color |

### Graphics renderer

| Option | Default | Purpose |
| --- | --- | --- |
| `graphicsMode` | `"auto"` | Choose `"auto"`, `"kitty"`, or `"cells"` |
| `fontSize` | `32` | Math font size in CSS pixels |
| `pixelRatio` | `1` | Raster output scale |
| `maxRasterWidth` | `8192` | Maximum allocated bitmap width |
| `maxRasterHeight` | `8192` | Maximum allocated bitmap height |
| `maxRasterPixels` | `16777216` | Maximum bitmap area |
| `graphicsForegroundColor` | `foregroundColor` | CSS color used for the image |
| `graphicsZIndex` | `1` | Kitty placement stacking order |

### Stream controller

| Option | Default | Purpose |
| --- | --- | --- |
| `updateIntervalMs` | `75` | Quiet period used to coalesce token deltas |
| `maxBufferLength` | `100000` | Maximum accumulated stream length |
| `incompletePolicy` | `"retain"` | Retain the last frame or apply incomplete source |
| `validationOptions` | `{}` | Parser options used for completeness checks |
| `validate` | tolerant parser | Custom completeness check |
| `preview` | none | Build a temporary renderable source without changing the stream |

## Supported LaTeX

- Fractions, binomials, square roots, and indexed roots
- Superscripts, subscripts, Greek letters, relations, arrows, and binary operators
- Integrals, sums, products, limits, derivatives, and common named operators
- Stretching parentheses, brackets, braces, bars, floors, and ceilings
- `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, `Vmatrix`, `smallmatrix`, `cases`, and `array`
- `aligned`, `align`, and `gathered`, including starred alignment forms
- Accents such as `\hat`, `\bar`, `\vec`, `\tilde`, `\dot`, `\ddot`, `\overline`, and `\underline`
- `\text`, `\operatorname`, `\overset`, `\underset`, colors, and lightweight macros

The cell backend is a math-mode renderer rather than a complete TeX engine. It does not compile documents, load
packages, execute arbitrary TeX, or render TikZ. The graphics backend accepts the TeX input supported by MathJax.
Neither backend shells out to a TeX installation.

## Development

```sh
bun install
bun run test
bun run check
bun run build
```

Run the demos in a compatible terminal:

```sh
bun run demo
bun run demo:graphics
bun run demo:stream
```

## License

[MIT](https://github.com/neriousy/opentui-math/blob/main/LICENSE)
