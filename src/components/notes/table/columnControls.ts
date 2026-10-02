import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { mountColumnTypeButton, mountColumnTypeMenu, mountSelectValueMenu } from './columnMenuMount'
import { dismiss, exclusive, release } from './menuDismiss'
import {
  columnSpecFromAttrs,
  hrefFromCell,
  isCheckedText,
  isIsoDate,
  isNumberText,
  nextSelectColor,
  selectOptions,
  type ColumnSpec,
  type ColumnType,
  type SelectOption,
} from './columnTypes'

const columnTypeKey = new PluginKey('noteColumnTypes')

function iconSvg(type: ColumnType): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const paths: Record<ColumnType, string> = {
    text: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    number: '<path d="M8 5l-2 14M18 5l-2 14M5 9h15M4 15h15"/>',
    checkbox: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    date: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5v3M16 3.5v3M4 10h16"/>',
    select: '<path d="M5 7h14M5 12h14M5 17h8"/><path d="M17 15l2 2 2-2"/>',
    url: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  }
  svg.innerHTML = paths[type]
  return svg
}

function headerSpecs(table: ProseNode): ColumnSpec[] {
  const row = table.firstChild
  if (!row) return []
  const specs: ColumnSpec[] = []
  row.forEach((cell) => {
    specs.push(cell.type.name === 'tableHeader' ? columnSpecFromAttrs(cell.attrs) : { t: 'text' })
  })
  return specs
}

function setHeaderAttrs(view: EditorView, pos: number, patch: { colType?: ColumnType; options?: SelectOption[] | null }) {
  const node = view.state.doc.nodeAt(pos)
  if (!node) return
  const next = { ...node.attrs, ...patch }
  if (next.colType === node.attrs.colType && sameOptions(next.options, node.attrs.options)) return
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, next))
}

function sameOptions(left: unknown, right: unknown): boolean {
  const a = selectOptions(left)
  const b = selectOptions(right)
  return a.length === b.length && a.every((item, index) => item.n === b[index]?.n && item.c === b[index]?.c)
}

function replaceCellText(view: EditorView, cellPos: number, text: string) {
  const cell = view.state.doc.nodeAt(cellPos)
  if (!cell || cell.textContent === text) return
  const paragraph = view.state.schema.nodes.paragraph?.create(
    null,
    text ? view.state.schema.text(text) : undefined,
  )
  if (!paragraph) return
  const from = cellPos + 1
  const to = cellPos + cell.nodeSize - 1
  view.dispatch(view.state.tr.replaceWith(from, to, paragraph))
}

function openColumnMenu(view: EditorView, anchor: HTMLElement, headerPos: number) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let currentAnchor = anchor
  let menu: ReturnType<typeof mountColumnTypeMenu> | null = null

  const close = () => {
    menu?.unmount()
    menu = null
    host.remove()
    currentAnchor.setAttribute('aria-expanded', 'false')
    release(close)
  }
  exclusive(close)
  anchor.setAttribute('aria-expanded', 'true')

  const onTypeChange = (type: ColumnType) => {
    if (!view.editable) return
    setHeaderAttrs(view, headerPos, { colType: type })
    paint()
  }
  const onOptionsChange = (options: SelectOption[]) => {
    if (!view.editable) return
    setHeaderAttrs(view, headerPos, { options })
    paint()
  }

  const paint = () => {
    const node = view.state.doc.nodeAt(headerPos)
    if (!node) {
      close()
      return
    }
    const refreshed = document.querySelector(`[data-col-pos="${headerPos}"]`)
    if (refreshed instanceof HTMLElement && refreshed !== currentAnchor) {
      currentAnchor.setAttribute('aria-expanded', 'false')
      currentAnchor = refreshed
      currentAnchor.setAttribute('aria-expanded', 'true')
    }
    const spec = columnSpecFromAttrs(node.attrs)
    menu ??= mountColumnTypeMenu(host)
    menu.update({
      anchor: currentAnchor,
      type: spec.t,
      options: spec.o ?? [],
      editable: view.editable,
      onTypeChange,
      onOptionsChange,
      onClose: close,
    })
  }

  paint()
}

function openSelectMenu(view: EditorView, anchor: HTMLElement, cellPos: number, headerPos: number) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  let currentAnchor = anchor
  let menu: ReturnType<typeof mountSelectValueMenu> | null = null

  const close = () => {
    menu?.unmount()
    menu = null
    host.remove()
    release(close)
  }
  exclusive(close)

  const paint = () => {
    const refreshed = document.querySelector(`[data-cell-pos="${cellPos}"]`)
    if (refreshed instanceof HTMLElement) currentAnchor = refreshed
    const header = view.state.doc.nodeAt(headerPos)
    const cell = view.state.doc.nodeAt(cellPos)
    const options = columnSpecFromAttrs(header?.attrs).o ?? []
    const current = cell?.textContent ?? ''
    menu ??= mountSelectValueMenu(host)
    menu.update({
      anchor: currentAnchor,
      value: current,
      options,
      editable: view.editable,
      onSelect: (value) => {
        if (!view.editable) return
        replaceCellText(view, cellPos, value)
        close()
      },
      onClear: () => {
        if (!view.editable) return
        replaceCellText(view, cellPos, '')
        close()
      },
      onCreate: (name) => {
        if (!view.editable) return
        const label = name.trim()
        if (!label) return
        const existing = options.find((option) => option.n === label)
        if (!existing) {
          setHeaderAttrs(view, headerPos, {
            options: [...options, { n: label, c: nextSelectColor(options) }],
          })
        }
        replaceCellText(view, cellPos, label)
        close()
      },
      onRecolor: (name, color) => {
        if (!view.editable) return
        setHeaderAttrs(view, headerPos, {
          options: options.map((option) => (option.n === name ? { ...option, c: color } : option)),
        })
        paint()
      },
      onClose: close,
    })
  }

  paint()
}

type WidgetHost = HTMLElement & { unmountWidget?: () => void }

function headerButton(view: EditorView, cellPos: number, spec: ColumnSpec): HTMLElement {
  const host: WidgetHost = document.createElement('span')
  host.className = 'note-col-widget'
  host.unmountWidget = mountColumnTypeButton(host, {
    type: spec.t,
    colPos: cellPos,
    onClick: (button) => {
      if (button.getAttribute('aria-expanded') === 'true') {
        dismiss()
        return
      }
      openColumnMenu(view, button, cellPos)
    },
  })
  return host
}

function checkboxControl(view: EditorView, cellPos: number, text: string): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = isCheckedText(text) ? 'note-cell-control note-check on' : 'note-cell-control note-check'
  button.setAttribute('aria-pressed', isCheckedText(text) ? 'true' : 'false')
  button.setAttribute('aria-label', isCheckedText(text) ? 'Checked' : 'Not checked')
  const mark = iconSvg('checkbox')
  if (isCheckedText(text)) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M8 12.5l2.5 2.5L16 9')
    mark.append(path)
  }
  button.append(mark)
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', () => {
    if (!view.editable) return
    const cell = view.state.doc.nodeAt(cellPos)
    if (!cell) return
    replaceCellText(view, cellPos, isCheckedText(cell.textContent) ? '' : 'x')
  })
  return button
}

function dateControl(view: EditorView, cellPos: number, text: string): HTMLElement {
  const input = document.createElement('input')
  input.type = 'date'
  input.className = 'note-cell-control note-date'
  input.setAttribute('aria-label', 'Date')
  input.value = isIsoDate(text) ? text.trim() : ''
  input.addEventListener('pointerdown', (event) => {
    if (!view.editable) event.preventDefault()
  })
  input.addEventListener('change', () => {
    if (!view.editable) {
      const cell = view.state.doc.nodeAt(cellPos)
      input.value = cell && isIsoDate(cell.textContent) ? cell.textContent.trim() : ''
      return
    }
    replaceCellText(view, cellPos, input.value)
  })
  return input
}

function selectControl(
  view: EditorView,
  cellPos: number,
  headerPos: number | undefined,
  text: string,
  options: SelectOption[],
): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'note-cell-control note-select'
  const current = text.trim()
  const match = options.find((option) => option.n === current)
  button.textContent = current || 'Empty'
  if (!current) button.classList.add('empty')
  else if (match) button.classList.add(`note-select-${match.c}`)
  button.dataset.cellPos = String(cellPos)
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', () => {
    if (headerPos == null) return
    openSelectMenu(view, button, cellPos, headerPos)
  })
  return button
}

function urlControl(text: string): HTMLElement | null {
  const href = hrefFromCell(text)
  if (!href) return null
  const link = document.createElement('a')
  link.className = 'note-cell-control note-url-open'
  link.href = href
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = 'Open'
  return link
}

function controlsStop(event: Event): boolean {
  const target = event.target
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('.note-col-type, .note-cell-control, .note-col-menu'))
}

function buildDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return
    const specs = headerSpecs(node)
    const headerPosByCol: number[] = []
    let rowOffset = pos + 1
    node.forEach((row, _rowOffset, rowIndex) => {
      let cellPos = rowOffset + 1
      row.forEach((cell, _cellOffset, cellIndex) => {
        const at = cellPos
        if (rowIndex === 0 && cell.type.name === 'tableHeader') headerPosByCol[cellIndex] = at
        const spec = specs[cellIndex] ?? { t: 'text' as const }
        if (cell.type.name === 'tableHeader') {
          const headerAttrs = cell.attrs
          decorations.push(
            Decoration.widget(at + 1, (view) => headerButton(view, at, columnSpecFromAttrs(headerAttrs)), {
              side: -1,
              ignoreSelection: true,
              stopEvent: controlsStop,
              destroy(node) {
                ;(node as WidgetHost).unmountWidget?.()
              },
            }),
          )
        } else if (rowIndex > 0 && spec.t !== 'text') {
          decorations.push(Decoration.node(at, at + cell.nodeSize, { class: `note-cell-${spec.t}` }))
          const text = cell.textContent
          const options = spec.o ?? []
          const widget =
            spec.t === 'checkbox'
              ? (view: EditorView) => checkboxControl(view, at, text)
              : spec.t === 'date'
                ? (view: EditorView) => dateControl(view, at, text)
                : spec.t === 'select'
                  ? (view: EditorView) => selectControl(view, at, headerPosByCol[cellIndex], text, options)
                  : spec.t === 'url'
                    ? () => urlControl(text) ?? document.createElement('span')
                    : null
          if (widget && !(spec.t === 'url' && !hrefFromCell(text))) {
            const widgetPos = spec.t === 'url' ? at + cell.nodeSize - 1 : at + 1
            decorations.push(
              Decoration.widget(widgetPos, widget, {
                side: -1,
                ignoreSelection: true,
                stopEvent: controlsStop,
              }),
            )
          }
        }
        cellPos += cell.nodeSize
      })
      rowOffset += row.nodeSize
    })
    return false
  })
  return DecorationSet.create(doc, decorations)
}

function cellFromElement(view: EditorView, element: Element): { pos: number; node: ProseNode } | null {
  try {
    const pos = view.posAtDOM(element, 0)
    const $pos = view.state.doc.resolve(pos)
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const node = $pos.node(depth)
      if (node.type.name === 'tableCell') return { pos: $pos.before(depth), node }
    }
  } catch {
    return null
  }
  return null
}

export function columnTypePlugin(): Plugin {
  return new Plugin({
    key: columnTypeKey,
    state: {
      init(_config, state) {
        return buildDecorations(state.doc)
      },
      apply(tr, old, _oldState, newState) {
        if (!tr.docChanged) return old
        return buildDecorations(newState.doc)
      },
    },
    props: {
      decorations(state) {
        return columnTypeKey.getState(state) as DecorationSet
      },
      handleDOMEvents: {
        focusout(view, event) {
          if (!view.editable) return false
          const target = event.target
          if (!(target instanceof Element)) return false
          const cell = target.closest('td.note-cell-number')
          if (!cell) return false
          const next = event.relatedTarget
          if (next instanceof Node && cell.contains(next)) return false
          const found = cellFromElement(view, cell)
          if (!found) return false
          const text = found.node.textContent
          if (isNumberText(text)) {
            const trimmed = text.trim()
            if (trimmed !== text) replaceCellText(view, found.pos, trimmed)
            return false
          }
          replaceCellText(view, found.pos, '')
          return false
        },
      },
    },
  })
}
