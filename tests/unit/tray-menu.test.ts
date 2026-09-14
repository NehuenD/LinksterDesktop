import { describe, expect, it, vi } from 'vitest'
import { buildTrayMenuTemplate } from '../../src/main/services/tray-menu'

describe('buildTrayMenuTemplate', () => {
  it('exposes Show, a separator and Quit in order', () => {
    const template = buildTrayMenuTemplate({ show: vi.fn(), quit: vi.fn() })
    expect(template.map((item) => item.label ?? item.type)).toEqual([
      'Show Linkster',
      'separator',
      'Quit'
    ])
  })

  it('invokes the supplied handlers', () => {
    const show = vi.fn()
    const quit = vi.fn()
    const template = buildTrayMenuTemplate({ show, quit })

    template[0].click?.()
    template[2].click?.()

    expect(show).toHaveBeenCalledOnce()
    expect(quit).toHaveBeenCalledOnce()
  })
})
