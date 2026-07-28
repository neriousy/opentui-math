# opentui-math

Beautiful LaTeX math for [OpenTUI](https://opentui.com/), with both a universal cell renderer and a
high-resolution graphics renderer.

The universal renderer parses LaTeX into a baseline-aware box tree and paints it directly into OpenTUI's native cell
buffer. The graphics renderer uses MathJax's New Computer Modern vector glyphs, rasterizes them with resvg, and places
the antialiased image through the Kitty graphics protocol. It automatically falls back to the cell renderer when
graphics are unavailable.

```text
           ╭────────
     -b ± √ b² - 4ac
x = ─────────────────
           2a
```

## Install

```sh
bun add opentui-math @opentui/core
```

The package name is reserved for the standalone community package; it is not part of the official OpenTUI
monorepo. The repositories are siblings during development:

```text
programming/
├── opentui/
└── opentui-latex/
```

## High-resolution graphics

Use this renderer for textbook-quality curves and spacing like a browser or PDF:

```ts
import { createCliRenderer } from "@opentui/core"
import { GraphicalLatexRenderable } from "opentui-math/graphics"

const renderer = await createCliRenderer()
const formula = new GraphicalLatexRenderable(renderer, {
  content: String.raw`\frac{x\sqrt{3}}{(x-3)^2}`,
  foregroundColor: "#f4f4f5",
  fontSize: 36,
})

renderer.root.add(formula)
```

`graphicsMode: "auto"` is the default. It uses high-resolution output when OpenTUI detects Kitty graphics and no
terminal multiplexer is in the way; otherwise the same component renders its Unicode fallback. Set
`graphicsMode: "cells"` to force the fallback or `"kitty"` to force graphics when capability detection is
unavailable.

For React, register `<latexImage>` from the graphics entry point:

```tsx
import { createRoot } from "@opentui/react"
import { registerGraphicalLatex } from "opentui-math/graphics/react"

registerGraphicalLatex()

createRoot(renderer).render(
  <latexImage
    content={String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`}
    fontSize={32}
    foregroundColor="#cdd6f4"
  />,
)
```

The Solid entry point is `opentui-math/graphics/solid` and registers the same `<latexImage>` element.

You can also create SVG or PNG output without a TUI:

```ts
import { renderLatexToPng, renderLatexToSvg } from "opentui-math/graphics"

const svg = await renderLatexToSvg(String.raw`E = mc^2`)
const { png, width, height } = await renderLatexToPng(String.raw`E = mc^2`, {
  fontSize: 48,
  pixelRatio: 2,
})
```

Kitty images use a stable cell footprint. When the terminal font is zoomed, the same placement cells become physically
larger and the formula grows with them. `pixelRatio` controls raster sharpness without changing that logical footprint.

## Streaming AI output

AI responses arrive as incomplete prefixes, so assigning every token directly to `content` causes parse-error flicker
and can start far more image renders than necessary. `LatexStreamController` accumulates deltas, coalesces updates for
75 ms by default, rejects incomplete intermediate prefixes, and waits for the newest graphical render when you flush
or finish:

```ts
import {
  GraphicalLatexRenderable,
  LatexStreamController,
} from "opentui-math/graphics"

const formula = new GraphicalLatexRenderable(renderer, {
  content: "",
  fallback: "source",
  foregroundColor: "#a6e3a1",
})
renderer.root.add(formula)

const stream = new LatexStreamController(formula)
for await (const latexDelta of latexDeltas) {
  stream.append(latexDelta)
}

const result = await stream.finish()
if (!result.applied) console.error(result.error)
```

The default `incompletePolicy: "retain"` keeps the last valid formula visible. `completeLatexPrefix` can instead build a
temporary preview by closing open arguments, `\left` delimiters, and environments. It never changes the accumulated
source. Prefixes that cannot be repaired can still appear as raw text by combining `incompletePolicy: "apply"` with
`fallback: "source"`:

```ts
import { completeLatexPrefix } from "opentui-math/graphics"

const stream = new LatexStreamController(formula, {
  incompletePolicy: "apply",
  preview: completeLatexPrefix,
  updateIntervalMs: 25,
  validationOptions: { strict: true },
})
```

Run `bun run demo:stream` to see a fast stream grow from an invalid `\beg` fragment into an aligned matrix,
determinant, derivative, and limit. Repairable partial expressions render immediately; the exact final LaTeX replaces
the preview when complete. Feed the controller only the LaTeX payload; if a model returns prose or Markdown fences,
extract the contents of `$...$`, `$$...$$`, `\(...\)`, or `\[...\]` first.

## Universal cell renderer

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

The renderable has intrinsic Yoga dimensions. Set `width` or `height` when you want a larger centered region.
Changing `formula.content` reparses, remeasures, and repaints it.

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

## Solid

```tsx
import { render } from "@opentui/solid"
import { registerLatex } from "opentui-math/solid"

registerLatex()

render(() => <latex content={String.raw`\int_0^\infty e^{-x}\,dx = 1`} />, renderer)
```

## Pure renderer

The parser and layout engine are useful without a running TUI:

```ts
import { renderLatexToString } from "opentui-math"

console.log(renderLatexToString(String.raw`\begin{pmatrix}a & b \\ c & d\end{pmatrix}`))
```

```text
⎛a b⎞
⎜   ⎟
⎝c d⎠
```

`renderLatex()` returns `{ width, height, baseline, cells, toString() }` for testing or custom composition.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `content` | `""` | LaTeX math source |
| `foregroundColor` | `#e8e8f0` | Formula color |
| `backgroundColor` | transparent | Formula background |
| `displayMode` | `true` | Put limits above/below large operators |
| `compactScripts` | `true` | Use Unicode super/subscripts when exact glyphs exist |
| `macros` | `{}` | Expand simple command macros before parsing |
| `maxSourceLength` | `100000` | Reject unexpectedly large formulas |
| `maxExpandedLength` | `maxSourceLength` | Bound output produced by user macros |
| `maxDepth` | `256` | Bound nested groups and commands |
| `strict` | `false` | Throw on unknown commands |
| `fallback` | `"message"` | On errors: `"message"`, `"source"`, or `"throw"` |
| `errorColor` | `#ff6b6b` | Fallback error color |

The graphical component adds:

| Option | Default | Purpose |
| --- | --- | --- |
| `graphicsMode` | `"auto"` | Choose `"auto"`, `"kitty"`, or `"cells"` |
| `fontSize` | `32` | Math font size in pixels |
| `pixelRatio` | `1` | Raster output scale |
| `maxRasterWidth` | `8192` | Maximum allocated bitmap width |
| `maxRasterHeight` | `8192` | Maximum allocated bitmap height |
| `maxRasterPixels` | `16777216` | Maximum bitmap area; oversized formulas scale down |
| `graphicsForegroundColor` | `foregroundColor` | CSS color used for the image |
| `graphicsZIndex` | `1` | Kitty placement stacking order |

The stream controller adds:

| Option | Default | Purpose |
| --- | --- | --- |
| `updateIntervalMs` | `75` | Quiet period used to coalesce token deltas |
| `maxBufferLength` | `100000` | Maximum accumulated stream length |
| `incompletePolicy` | `"retain"` | Keep the last valid frame or apply raw incomplete source |
| `validationOptions` | `{}` | Parser options used for intermediate completeness checks |
| `validate` | tolerant parser | Optional custom completeness check |
| `preview` | none | Build a temporary renderable source without changing the stream |

## Supported LaTeX

- Fractions, binomials, roots, superscripts, and subscripts
- Greek letters, relations, arrows, binary operators, and large operators
- `\left ... \right` with stretching parentheses, brackets, braces, bars, floors, and ceilings
- `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, `Vmatrix`, `smallmatrix`, `cases`, `array`,
  `aligned`, `align`, and `gathered` (including starred alignment forms)
- Accents including `\hat`, `\bar`, `\vec`, `\tilde`, `\dot`, `\ddot`, `\overline`, and `\underline`
- `\text`, named operators, `\operatorname`, `\overset`, `\underset`, and colors
- Lightweight user macros

The cell backend is a math-mode renderer, not a full TeX engine: it does not compile documents, execute arbitrary TeX
macros, load packages, or render TikZ. The graphics backend accepts the TeX input supported by MathJax. Neither backend
shells out to a TeX installation.

## Publishing

```sh
bun install
bun run prepublishOnly
npm pack --dry-run
npm publish
```

The built tarball contains only ESM JavaScript, declarations, the README, and the license.
