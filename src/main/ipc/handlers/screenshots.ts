import { dialog, ipcMain } from 'electron'
import { IPC, fail, ok } from '@shared/contract/ipc'
import {
  copyScreenshotPath,
  deleteScreenshot,
  getScreenshotFolder,
  detectScreenshotFolder,
  listScreenshots,
  revealScreenshot,
  setScreenshotFolder
} from '../../services/screenshot-service'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function folderInfo(): { folder: string | null; detected: string | null } {
  return { folder: getScreenshotFolder(), detected: detectScreenshotFolder() }
}

export function registerScreenshotHandlers(): void {
  ipcMain.handle(IPC.screenshots.list, async () => {
    try {
      return ok(await listScreenshots())
    } catch (error) {
      return fail('SCREENSHOTS_LIST_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.screenshots.getFolder, () => ok(folderInfo()))

  ipcMain.handle(IPC.screenshots.chooseFolder, async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Choose screenshots folder'
      })
      if (result.canceled || result.filePaths.length === 0) return ok(folderInfo())
      setScreenshotFolder(result.filePaths[0])
      return ok(folderInfo())
    } catch (error) {
      return fail('SCREENSHOTS_FOLDER_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.screenshots.reveal, async (_event, filePath: unknown) => {
    try {
      if (typeof filePath !== 'string') return fail('INVALID_PATH', 'A file path is required.')
      await revealScreenshot(filePath)
      return ok(true as const)
    } catch (error) {
      return fail('SCREENSHOTS_REVEAL_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.screenshots.copyPath, async (_event, filePath: unknown) => {
    try {
      if (typeof filePath !== 'string') return fail('INVALID_PATH', 'A file path is required.')
      await copyScreenshotPath(filePath)
      return ok(true as const)
    } catch (error) {
      return fail('SCREENSHOTS_COPY_FAILED', toMessage(error))
    }
  })

  ipcMain.handle(IPC.screenshots.delete, async (_event, filePath: unknown) => {
    try {
      if (typeof filePath !== 'string') return fail('INVALID_PATH', 'A file path is required.')
      await deleteScreenshot(filePath)
      return ok(true as const)
    } catch (error) {
      return fail('SCREENSHOTS_DELETE_FAILED', toMessage(error))
    }
  })
}
