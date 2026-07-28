const APC_START = "\u001b_G"
const APC_END = "\u001b\\"
const MAX_CHUNK_SIZE = 4096

export interface KittyPlacement {
  imageId: number
  placementId?: number
  column: number
  row: number
  columns: number
  rows: number
  zIndex?: number
}

export function encodeKittyPng(png: Uint8Array, imageId: number): string {
  const encoded = Buffer.from(png).toString("base64")
  const chunks = encoded.match(new RegExp(`.{1,${MAX_CHUNK_SIZE}}`, "g")) ?? [""]

  return chunks
    .map((chunk, index) => {
      const more = index === chunks.length - 1 ? 0 : 1
      const control = index === 0 ? `a=t,f=100,i=${uint32(imageId)},q=2,m=${more}` : `q=2,m=${more}`
      return `${APC_START}${control};${chunk}${APC_END}`
    })
    .join("")
}

export function encodeKittyPlacement(options: KittyPlacement): string {
  const imageId = uint32(options.imageId)
  const placementId = uint32(options.placementId ?? imageId)
  const column = positiveInteger(options.column)
  const row = positiveInteger(options.row)
  const columns = positiveInteger(options.columns)
  const rows = positiveInteger(options.rows)
  const zIndex = integer(options.zIndex ?? 1)
  const move = `\u001b[${row};${column}H`
  const place =
    `${APC_START}a=p,i=${imageId},p=${placementId},q=2,` +
    `c=${columns},r=${rows},z=${zIndex},C=1;${APC_END}`

  return `\u001b7${move}${place}\u001b8`
}

export function encodeKittyDelete(imageId: number): string {
  return `${APC_START}a=d,d=I,i=${uint32(imageId)},q=2;${APC_END}`
}

function uint32(value: number): number {
  const normalized = Math.floor(value) >>> 0
  if (normalized === 0) throw new RangeError("Kitty image IDs must be positive 32-bit integers")
  return normalized
}

function positiveInteger(value: number): number {
  const normalized = Math.floor(value)
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new RangeError("Kitty placement dimensions and coordinates must be positive integers")
  }
  return normalized
}

function integer(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Kitty z-index must be an integer")
  return Math.floor(value)
}
