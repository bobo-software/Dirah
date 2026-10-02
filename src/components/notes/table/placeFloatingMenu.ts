export function placeFloatingMenu(menu: HTMLElement, anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.left)}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  const box = menu.getBoundingClientRect();
  if (box.bottom > window.innerHeight - 8) {
    menu.style.top = `${Math.max(8, rect.top - box.height - 4)}px`;
  }
  const placed = menu.getBoundingClientRect();
  if (placed.right > window.innerWidth - 8) {
    menu.style.left = `${Math.max(8, window.innerWidth - placed.width - 8)}px`;
  }
}
