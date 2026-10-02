import { Extension, type JSONContent } from '@tiptap/core'
import { Table, TableHeader, renderTableToMarkdown } from '@tiptap/extension-table'
import type { MarkdownToken } from '@tiptap/core'
import {
  columnSpecFromAttrs,
  isColumnType,
  selectOptions,
  parseColumnSpecs,
  specsNeedComment,
  takeColumnComment,
  type ColumnSpec,
  encodeColumnComment,
} from './columnTypes'
import { columnTypePlugin } from './columnControls'

type TableToken = MarkdownToken & {
  diraCols?: ColumnSpec[]
  header?: unknown
  rows?: unknown
  align?: unknown
  raw?: string
}

function specsFromTable(node: JSONContent): ColumnSpec[] {
  const header = node.content?.[0]
  if (!header?.content) return []
  return header.content.map((cell) => {
    if (cell.type !== 'tableHeader') return { t: 'text' }
    return columnSpecFromAttrs(cell.attrs)
  })
}

function applySpecs(node: JSONContent, specs: ColumnSpec[]): JSONContent {
  const header = node.content?.[0]
  if (!header?.content) return node
  header.content = header.content.map((cell, index) => {
    if (cell.type !== 'tableHeader') return cell
    const spec = specs[index]
    if (!spec || spec.t === 'text') return cell
    return {
      ...cell,
      attrs: {
        ...(cell.attrs ?? {}),
        colType: spec.t,
        options: spec.t === 'select' ? (spec.o ?? []) : (cell.attrs?.options ?? null),
      },
    }
  })
  return node
}

export const TypedTable = Table.extend({
  parseMarkdown(token, helpers) {
    const parsed = this.parent?.(token, helpers) ?? { type: 'table' }
    if (Array.isArray(parsed) || !('type' in parsed)) return parsed
    const specs = (token as TableToken).diraCols
    if (!specs?.length) return parsed
    return applySpecs(parsed, specs)
  },

  renderMarkdown(node, helpers, ctx) {
    const markdown = this.parent?.(node, helpers, ctx) ?? renderTableToMarkdown(node, helpers)
    if (!markdown) return markdown
    const specs = specsFromTable(node)
    if (!specsNeedComment(specs)) return markdown
    return `${encodeColumnComment(specs)}\n${markdown.replace(/^\n+/, '')}`
  },
}).configure({ resizable: false })

export const TypedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colType: {
        default: 'text',
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute('data-col-type')
          return isColumnType(value) ? value : 'text'
        },
        renderHTML: (attributes: { colType?: unknown }) => {
          if (!isColumnType(attributes.colType) || attributes.colType === 'text') return {}
          return { 'data-col-type': attributes.colType }
        },
      },
      options: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute('data-col-options')
          if (!raw) return null
          try {
            return selectOptions(JSON.parse(raw) as unknown)
          } catch {
            return null
          }
        },
        renderHTML: (attributes: { options?: unknown }) => {
          const options = selectOptions(attributes.options)
          if (options.length === 0) return {}
          return { 'data-col-options': JSON.stringify(options) }
        },
      },
    }
  },
})

export const ColumnTypeMarkdown = Extension.create({
  name: 'columnTypeMarkdown',

  addProseMirrorPlugins() {
    return [columnTypePlugin()]
  },

  markdownTokenizer: {
    name: 'diraCols',
    level: 'block',
    start(src) {
      const inSlice = src.indexOf('<!-- dira-cols:')
      if (inSlice >= 0) return inSlice
      // Marked asks start() for the text after the first character.
      if (src.startsWith('!-- dira-cols:')) return 0
      return -1
    },
    tokenize(src, _tokens, helper) {
      const taken = takeColumnComment(src)
      if (!taken) return undefined
      const blank = /^(?:[ \t]*\n)+/.exec(taken.rest)
      const gap = blank?.[0] ?? ''
      const blocks = helper.blockTokens(taken.rest.slice(gap.length)) as TableToken[]
      const table = blocks[0]
      if (!table || table.type !== 'table' || typeof table.raw !== 'string' || table.raw.length === 0) return undefined
      const specs = parseColumnSpecs(taken.json)
      if (!specs) return undefined
      return {
        type: 'table',
        raw: taken.raw + gap + table.raw,
        header: table.header,
        align: table.align,
        rows: table.rows,
        diraCols: specs,
      }
    },
  },
})
