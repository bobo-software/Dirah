import { createRoot } from 'react-dom/client'
import { TableOptionsMenu, type TableMenuAction } from './TableOptionsMenu'

export function mountTableOptionsMenu(host: HTMLElement) {
  const root = createRoot(host)
  return {
    update: (props: { anchor: HTMLElement; actions: TableMenuAction[]; onClose: () => void }) => {
      root.render(<TableOptionsMenu {...props} />)
    },
    unmount: () => root.unmount(),
  }
}
