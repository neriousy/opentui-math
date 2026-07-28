import { DEFAULT_MAX_SOURCE_LENGTH, resolvePositiveInteger } from "./limits.js"
import { parseLatex } from "./parser.js"
import type { ParseOptions } from "./types.js"

export interface LatexStreamTarget {
  content: string
  whenGraphicsReady?(): Promise<boolean>
}

export interface LatexStreamOptions {
  /**
   * Quiet period used to coalesce token deltas. Set to `0` to apply on the
   * next turn of the event loop.
   */
  updateIntervalMs?: number
  /** Maximum accumulated stream length. */
  maxBufferLength?: number
  /** Options used to decide whether an intermediate prefix is renderable. */
  validationOptions?: ParseOptions
  /**
   * Optional completeness check. Return `false` or throw to retain the last
   * renderable frame. The default uses the tolerant cell parser.
   */
  validate?: (source: string) => boolean | void
  /**
   * `"retain"` keeps the previous good formula. `"apply"` forwards an
   * incomplete prefix so a target configured with `fallback: "source"` can
   * show the raw LaTeX while tokens are still arriving.
   */
  incompletePolicy?: "retain" | "apply"
  /**
   * Produce a temporary renderable source for an incomplete prefix. The
   * original accumulator is never modified.
   */
  preview?: (source: string) => string | undefined
}

export interface LatexStreamResult {
  source: string
  /** Temporary source assigned to the target when a preview was used. */
  renderedSource?: string
  /** Whether this source was assigned to the target. */
  applied: boolean
  /** Whether the completeness check accepted this source. */
  complete: boolean
  /** Present for graphical targets after an explicit flush or finish. */
  graphicsReady?: boolean
  error?: Error
}

/**
 * Coalesces token deltas from an AI or network stream and keeps incomplete
 * LaTeX prefixes from replacing the last renderable frame.
 */
export class LatexStreamController<T extends LatexStreamTarget = LatexStreamTarget> {
  public readonly target: T

  private readonly updateIntervalMs: number
  private readonly maxBufferLength: number
  private readonly validationOptions: ParseOptions
  private readonly validateSource: (source: string) => boolean | void
  private readonly incompletePolicy: "retain" | "apply"
  private readonly previewSource: ((source: string) => string | undefined) | undefined
  private buffer: string
  private timer: ReturnType<typeof setTimeout> | undefined
  private finished = false
  private latestResult: LatexStreamResult

  constructor(target: T, options: LatexStreamOptions = {}) {
    this.target = target
    this.updateIntervalMs = nonNegativeInteger(options.updateIntervalMs, 75, "updateIntervalMs")
    this.maxBufferLength = resolvePositiveInteger(
      options.maxBufferLength,
      DEFAULT_MAX_SOURCE_LENGTH,
      "maxBufferLength",
    )
    this.validationOptions = options.validationOptions ?? {}
    this.incompletePolicy = options.incompletePolicy ?? "retain"
    this.previewSource = options.preview
    this.validateSource =
      options.validate ??
      ((source) => {
        parseLatex(source, {
          ...this.validationOptions,
          strict: this.validationOptions.strict ?? false,
          maxSourceLength: Math.min(
            this.validationOptions.maxSourceLength ?? this.maxBufferLength,
            this.maxBufferLength,
          ),
        })
      })
    this.buffer = target.content
    this.assertBufferLength(this.buffer)
    this.latestResult = {
      source: this.buffer,
      applied: true,
      complete: true,
    }
  }

  public get content(): string {
    return this.buffer
  }

  public get isFinished(): boolean {
    return this.finished
  }

  public get lastResult(): Readonly<LatexStreamResult> {
    return this.latestResult
  }

  /** Append a delta exactly as received from the stream. */
  public append(chunk: string): void {
    this.assertOpen()
    this.assertBufferLength(this.buffer, chunk.length)
    this.buffer += chunk
    this.schedule()
  }

  /** Replace the accumulator when an SDK yields the full text-so-far. */
  public replace(source: string): void {
    this.assertOpen()
    this.assertBufferLength(source)
    this.buffer = source
    this.schedule()
  }

  /**
   * Apply the current prefix only when it is structurally renderable, then
   * wait for the latest graphical rasterization when applicable.
   */
  public async flush(): Promise<LatexStreamResult> {
    this.clearTimer()
    return this.apply(false, true)
  }

  /**
   * End the stream and apply the final source even when it is invalid, so the
   * target's configured fallback or error policy remains authoritative.
   */
  public async finish(): Promise<LatexStreamResult> {
    this.assertOpen()
    this.finished = true
    this.clearTimer()
    return this.apply(true, true)
  }

  /** Stop pending work without applying the buffered source. */
  public dispose(): void {
    this.finished = true
    this.clearTimer()
  }

  private schedule(): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.apply(false, false)
    }, this.updateIntervalMs)
  }

  private async apply(force: boolean, waitForGraphics: boolean): Promise<LatexStreamResult> {
    const source = this.buffer
    let renderedSource = source
    let validationError: Error | undefined
    try {
      if (this.validateSource(source) === false) {
        throw new Error("The streamed LaTeX prefix is incomplete")
      }
    } catch (error) {
      validationError = asError(error)
    }

    if (validationError && !force && this.previewSource) {
      try {
        const preview = this.previewSource(source)
        if (preview !== undefined) {
          if (this.validateSource(preview) === false) {
            throw new Error("The streamed LaTeX preview is incomplete")
          }
          renderedSource = preview
        }
      } catch {
        renderedSource = source
      }
    }

    if (
      validationError &&
      !force &&
      renderedSource === source &&
      this.incompletePolicy === "retain"
    ) {
      return this.remember({
        source,
        applied: false,
        complete: false,
        error: validationError,
      })
    }

    try {
      this.target.content = renderedSource
      const graphicsReady =
        waitForGraphics && this.target.whenGraphicsReady
          ? await this.target.whenGraphicsReady()
          : undefined
      return this.remember({
        source,
        ...(renderedSource !== source ? { renderedSource } : {}),
        applied: true,
        complete: !validationError,
        ...(graphicsReady !== undefined ? { graphicsReady } : {}),
        ...(validationError ? { error: validationError } : {}),
      })
    } catch (error) {
      return this.remember({
        source,
        applied: false,
        complete: !validationError,
        error: asError(error),
      })
    }
  }

  private remember(result: LatexStreamResult): LatexStreamResult {
    this.latestResult = result
    return result
  }

  private assertBufferLength(value: string, addedLength = 0): void {
    if (value.length + addedLength > this.maxBufferLength) {
      throw new RangeError(`LaTeX stream exceeds the ${this.maxBufferLength}-character limit`)
    }
  }

  private assertOpen(): void {
    if (this.finished) throw new Error("Cannot update a finished LaTeX stream")
  }

  private clearTimer(): void {
    if (this.timer === undefined) return
    clearTimeout(this.timer)
    this.timer = undefined
  }
}

/**
 * Build a temporary preview by closing open groups, `\left` constructs, and
 * environments. Returns `undefined` when the prefix cannot be repaired
 * confidently.
 */
export function completeLatexPrefix(
  source: string,
  validationOptions: ParseOptions = {},
): string | undefined {
  type OpenConstruct =
    | { kind: "group" }
    | { kind: "left" }
    | { kind: "environment"; name: string }

  const stack: OpenConstruct[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]!
    if (char === "%") {
      const newline = source.indexOf("\n", index + 1)
      if (newline < 0) break
      index = newline + 1
      continue
    }
    if (char === "\\") {
      const commandStart = index
      index++
      if (index >= source.length) break
      if (!/[A-Za-z@]/.test(source[index]!)) {
        index++
        continue
      }
      while (index < source.length && /[A-Za-z@]/.test(source[index]!)) index++
      const command = source.slice(commandStart + 1, index)
      if (command === "begin" || command === "end") {
        const environment = readEnvironmentToken(source, index)
        if (environment) {
          index = environment.end
          if (command === "begin") {
            stack.push({ kind: "environment", name: environment.name })
          } else {
            popConstruct(
              stack,
              (entry) => entry.kind === "environment" && entry.name === environment.name,
            )
          }
        }
      } else if (command === "left") {
        stack.push({ kind: "left" })
      } else if (command === "right") {
        popConstruct(stack, (entry) => entry.kind === "left")
      }
      continue
    }
    if (char === "{") stack.push({ kind: "group" })
    else if (char === "}") popConstruct(stack, (entry) => entry.kind === "group")
    index++
  }

  let candidate = source
  for (let openIndex = stack.length - 1; openIndex >= 0; openIndex--) {
    const entry = stack[openIndex]!
    candidate +=
      entry.kind === "group"
        ? "}"
        : entry.kind === "left"
          ? String.raw`\right.`
          : String.raw`\end{${entry.name}}`
  }
  let changed = candidate !== source

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      parseLatex(candidate, {
        ...validationOptions,
        strict: validationOptions.strict ?? false,
      })
      return changed ? candidate : undefined
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Expected an argument")) {
        return undefined
      }
      candidate += "{}"
      changed = true
    }
  }
  return undefined
}

function readEnvironmentToken(
  source: string,
  offset: number,
): { name: string; end: number } | undefined {
  while (offset < source.length && /\s/.test(source[offset]!)) offset++
  if (source[offset] !== "{") return undefined
  const end = source.indexOf("}", offset + 1)
  if (end < 0) return undefined
  const name = source.slice(offset + 1, end)
  return name ? { name, end: end + 1 } : undefined
}

function popConstruct<T>(
  stack: T[],
  matches: (entry: T) => boolean,
): void {
  for (let index = stack.length - 1; index >= 0; index--) {
    if (!matches(stack[index]!)) continue
    stack.splice(index, 1)
    return
  }
}

function nonNegativeInteger(value: number | undefined, fallback: number, optionName: string): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${optionName} must be a non-negative safe integer`)
  }
  return value
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
