export const COLUMN_TYPES = ['text', 'number', 'checkbox', 'date', 'select', 'url'] as const

export type ColumnType = (typeof COLUMN_TYPES)[number]

export const SELECT_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const

export type SelectColor = (typeof SELECT_COLORS)[number]

export type SelectOption = {
  n: string
  c: SelectColor
}

export type ColumnSpec = {
  t: ColumnType
  o?: SelectOption[]
}

export const COLUMN_TYPE_LABEL: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  checkbox: 'Checkbox',
  date: 'Date',
  select: 'Select',
  url: 'URL',
}

const COLUMN_TYPE_SET = new Set<string>(COLUMN_TYPES)
const SELECT_COLOR_SET = new Set<string>(SELECT_COLORS)

export function isColumnType(value: unknown): value is ColumnType {
  return typeof value === 'string' && COLUMN_TYPE_SET.has(value)
}

export function isSelectColor(value: unknown): value is SelectColor {
  return typeof value === 'string' && SELECT_COLOR_SET.has(value)
}

export function nextSelectColor(options: SelectOption[]): SelectColor {
  return SELECT_COLORS[options.length % SELECT_COLORS.length]
}

export function selectOptions(value: unknown): SelectOption[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const options: SelectOption[] = []
  for (const item of value) {
    let name = ''
    let color: SelectColor | null = null
    if (typeof item === 'string') {
      name = item.trim()
    } else if (item && typeof item === 'object') {
      const record = item as { n?: unknown; c?: unknown }
      if (typeof record.n === 'string') name = record.n.trim()
      if (isSelectColor(record.c)) color = record.c
    }
    if (!name || seen.has(name)) continue
    seen.add(name)
    options.push({ n: name, c: color ?? SELECT_COLORS[options.length % SELECT_COLORS.length] })
  }
  return options
}

export function columnSpecFromAttrs(attrs: { colType?: unknown; options?: unknown } | null | undefined): ColumnSpec {
  const type = isColumnType(attrs?.colType) ? attrs.colType : 'text'
  if (type !== 'select') return { t: type }
  const options = selectOptions(attrs?.options)
  return options.length > 0 ? { t: type, o: options } : { t: type }
}

export function specsNeedComment(specs: ColumnSpec[]): boolean {
  return specs.some((spec) => spec.t !== 'text')
}

/** HTML comments cannot contain `--`, so hyphens in the JSON are unicode-escaped. */
export function encodeColumnComment(specs: ColumnSpec[]): string {
  const json = JSON.stringify(specs).replace(/-/g, '\\u002d')
  return `<!-- dira-cols: ${json} -->`
}

export function parseColumnSpecs(json: string): ColumnSpec[] | null {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.map((item) => {
      if (!item || typeof item !== 'object') return { t: 'text' as const }
      const record = item as { t?: unknown; o?: unknown }
      const type = isColumnType(record.t) ? record.t : 'text'
      if (type !== 'select') return { t: type }
      const options = selectOptions(record.o)
      return options.length > 0 ? { t: type, o: options } : { t: type }
    })
  } catch {
    return null
  }
}

export function takeColumnComment(src: string): { json: string; raw: string; rest: string } | null {
  const prefix = '<!-- dira-cols:'
  if (!src.startsWith(prefix)) return null
  const end = src.indexOf('-->')
  if (end === -1) return null
  const json = src.slice(prefix.length, end).trim()
  let restAt = end + 3
  if (src[restAt] === '\r') restAt += 1
  if (src[restAt] !== '\n') return null
  restAt += 1
  return { json, raw: src.slice(0, restAt), rest: src.slice(restAt) }
}

export function isCheckedText(text: string): boolean {
  const value = text.trim().toLowerCase()
  return value === 'x' || value === 'true' || value === 'yes'
}

export function isNumberText(text: string): boolean {
  return text.trim() === '' || /^-?\d+(\.\d+)?$/.test(text.trim())
}

export function isIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text.trim())
}

export function hrefFromCell(text: string): string | null {
  const value = text.trim()
  if (/^https?:\/\/\S+$/i.test(value)) return value
  if (/^www\.\S+$/i.test(value)) return `https://${value}`
  return null
}
