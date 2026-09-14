import { nativeTheme } from 'electron'
import { ThemeModeSchema, type ThemeMode } from '@shared/contract/ipc'
import { store } from '../store/store'

export function getThemeMode(): ThemeMode {
  return ThemeModeSchema.catch('system').parse(store.get('themeMode'))
}

export function applyThemeMode(mode: ThemeMode): void {
  nativeTheme.themeSource = mode
}

export function setThemeMode(mode: ThemeMode): ThemeMode {
  const parsed = ThemeModeSchema.parse(mode)
  store.set('themeMode', parsed)
  applyThemeMode(parsed)
  return parsed
}
