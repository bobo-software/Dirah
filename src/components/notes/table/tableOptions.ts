import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { exclusive, release } from './menuDismiss'
import { mountTableOptionsMenu } from './tableMenuMount'
import type { TableMenuAction } from './TableOptionsMenu'

const tableOptionsKey = new PluginKey('noteTableOptions')

function focusedTable(view: EditorView): HTMLElement | null {
  const { $from } = view.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== 'table') continue
    const dom = view.nodeDOM($from.before(depth))
    if (!(dom instanceof HTMLElement)) return null
    return dom.classList.contains('tableWrapper') ? dom : (dom.closest('.tableWrapper') ?? dom)
  }
  return null
}

function optionsIcon(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  for (const cx of ['6', '12', '18']) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    dot.setAttribute('cx', cx)
    dot.setAttribute('cy', '12')
    dot.setAttribute('r', '1.6')
    dot.setAttribute('fill', 'currentColor')
    svg.append(dot)
  }
  return svg
}

class TableOptionsView {
  private view: EditorView
  private readonly editor: Editor
  private readonly button = document.createElement('button')
  private menu: ReturnType<typeof mountTableOptionsMenu> | null = null
  private closeMenu: (() => void) | null = null
  private frame = 0
  private readonly observer: ResizeObserver

  constructor(view: EditorView, editor: Editor) {
    this.view = view
    this.editor = editor
    this.button.type = 'button'
    this.button.className = 'note-table-options'
    this.button.hidden = true
    this.button.setAttribute('aria-label', 'Table options')
    this.button.setAttribute('aria-haspopup', 'menu')
    this.button.setAttribute('aria-expanded', 'false')
    this.button.append(optionsIcon())
    this.button.addEventListener('mousedown', (event) => event.preventDefault())
    this.button.addEventListener('click', () => this.toggle())
    view.dom.parentElement?.append(this.button)
    this.observer = new ResizeObserver(() => this.place())
    this.observer.observe(view.dom)
  }

  update(view: EditorView) {
    this.view = view
    this.place()
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.place())
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.closeMenu?.()
    this.button.remove()
  }

  private place() {
    const table = this.view.editable ? focusedTable(this.view) : null
    if (!table) {
      this.button.hidden = true
      this.closeMenu?.()
      return
    }
    const parent = this.button.offsetParent instanceof HTMLElement ? this.button.offsetParent : this.view.dom.parentElement
    if (!parent) return
    const tableRect = table.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()
    this.button.hidden = false
    const width = this.button.offsetWidth || 26
    const height = this.button.offsetHeight || 26
    this.button.style.top = `${tableRect.top - parentRect.top - height}px`
    this.button.style.left = `${tableRect.right - parentRect.left - width}px`
  }

  private toggle() {
    if (this.button.getAttribute('aria-expanded') === 'true') {
      this.closeMenu?.()
      return
    }
    this.open()
  }

  private open() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const menu = mountTableOptionsMenu(host)
    this.menu = menu
    const close = () => {
      menu.unmount()
      host.remove()
      if (this.menu === menu) {
        this.menu = null
        this.closeMenu = null
      }
      this.button.setAttribute('aria-expanded', 'false')
      release(close)
    }
    this.closeMenu = close
    exclusive(close)
    this.button.setAttribute('aria-expanded', 'true')

    const run = (command: () => boolean) => {
      if (!this.view.editable) return
      this.view.focus()
      command()
      close()
    }
    const actions: TableMenuAction[] = [
      { id: 'row-above', label: 'Add row above', run: () => run(() => this.editor.chain().focus().addRowBefore().run()) },
      { id: 'row-below', label: 'Add row below', run: () => run(() => this.editor.chain().focus().addRowAfter().run()) },
      { id: 'column-left', label: 'Add column left', run: () => run(() => this.editor.chain().focus().addColumnBefore().run()) },
      { id: 'column-right', label: 'Add column right', run: () => run(() => this.editor.chain().focus().addColumnAfter().run()) },
      { id: 'delete-row', label: 'Delete row', run: () => run(() => this.editor.chain().focus().deleteRow().run()) },
      { id: 'delete-column', label: 'Delete column', run: () => run(() => this.editor.chain().focus().deleteColumn().run()) },
      { id: 'delete-table', label: 'Delete table', danger: true, run: () => run(() => this.editor.chain().focus().deleteTable().run()) },
    ]
    menu.update({ anchor: this.button, actions, onClose: close })
  }
}

export function tableOptionsPlugin(editor: Editor): Plugin {
  return new Plugin({
    key: tableOptionsKey,
    view(editorView) {
      return new TableOptionsView(editorView, editor)
    },
  })
}
