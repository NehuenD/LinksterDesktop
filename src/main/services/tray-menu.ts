export interface TrayMenuHandlers {
  show: () => void
  quit: () => void
}

export interface TrayMenuItem {
  label?: string
  type?: 'separator'
  click?: () => void
}

export function buildTrayMenuTemplate(handlers: TrayMenuHandlers): TrayMenuItem[] {
  return [
    { label: 'Show Linkster', click: handlers.show },
    { type: 'separator' },
    { label: 'Quit', click: handlers.quit }
  ]
}
