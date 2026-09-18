import { dialog } from 'electron'
import { secureHandle } from '../guard'
import {
  BackupCreateOptionsSchema,
  ExportFormatSchema,
  ImportOptionsSchema,
  IPC,
  RestoreModeSchema,
  fail,
  ok
} from '@shared/contract/ipc'
import {
  createBackup,
  pickBackupFile,
  previewRestore,
  runRestore
} from '../../services/backup-service'
import { copyAllLinks, exportLinks } from '../../services/data-export-service'
import {
  cancelImport,
  pickImportFile,
  previewImport,
  runImport
} from '../../services/import-service'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Only paths the user picked through a native dialog may be read. Without this,
// a compromised renderer could read arbitrary local files through the parsers.
const MAX_PICKED_PATHS = 8
const pickedImportPaths = new Set<string>()
const pickedRestorePaths = new Set<string>()

function rememberPath(store: Set<string>, path: string): void {
  store.add(path)
  if (store.size > MAX_PICKED_PATHS) {
    const oldest = store.values().next().value
    if (oldest !== undefined) store.delete(oldest)
  }
}

function isPicked(store: ReadonlySet<string>, path: string): boolean {
  return store.has(path)
}

export function registerDataHandlers(): void {
  secureHandle(IPC.data.export, async (_event, format: unknown) => {
    try {
      const parsed = ExportFormatSchema.parse(format)
      return ok(await exportLinks(parsed))
    } catch (error) {
      return fail('EXPORT_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.data.copyAll, async () => {
    try {
      return ok(await copyAllLinks())
    } catch (error) {
      return fail('COPY_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.data.importPick, async () => {
    try {
      const path = await pickImportFile()
      if (path) rememberPath(pickedImportPaths, path)
      return ok(path ? { path } : null)
    } catch (error) {
      return fail('IMPORT_PICK_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.data.importPreview, async (_event, path: unknown) => {
    try {
      if (typeof path !== 'string' || !isPicked(pickedImportPaths, path)) {
        return fail('INVALID_PATH', 'Choose the import file through the file picker.')
      }
      return ok(await previewImport(path))
    } catch (error) {
      return fail('IMPORT_PREVIEW_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.data.importRun, async (_event, path: unknown, options: unknown) => {
    try {
      if (typeof path !== 'string' || !isPicked(pickedImportPaths, path)) {
        return fail('INVALID_PATH', 'Choose the import file through the file picker.')
      }
      return ok(await runImport(path, ImportOptionsSchema.parse(options ?? {})))
    } catch (error) {
      return fail('IMPORT_RUN_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.data.importCancel, () => {
    cancelImport()
    return ok(true as const)
  })

  secureHandle(IPC.data.backupCreate, async (_event, options: unknown) => {
    try {
      return ok(await createBackup(BackupCreateOptionsSchema.parse(options ?? {})))
    } catch (error) {
      return fail('BACKUP_CREATE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.data.backupPickFolder, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Choose backup folder',
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return ok(null)
      return ok({ path: result.filePaths[0] })
    } catch (error) {
      return fail('BACKUP_PICK_FOLDER_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.data.backupRestorePick, async () => {
    try {
      const path = await pickBackupFile()
      if (path) rememberPath(pickedRestorePaths, path)
      return ok(path ? { path } : null)
    } catch (error) {
      return fail('BACKUP_PICK_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.data.backupRestorePreview, async (_event, path: unknown) => {
    try {
      if (typeof path !== 'string' || !isPicked(pickedRestorePaths, path)) {
        return fail('INVALID_PATH', 'Choose the backup file through the file picker.')
      }
      return ok(await previewRestore(path))
    } catch (error) {
      return fail('BACKUP_PREVIEW_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.data.backupRestore, async (_event, path: unknown, mode: unknown) => {
    try {
      if (typeof path !== 'string' || !isPicked(pickedRestorePaths, path)) {
        return fail('INVALID_PATH', 'Choose the backup file through the file picker.')
      }
      return ok(await runRestore(path, RestoreModeSchema.parse(mode)))
    } catch (error) {
      return fail('BACKUP_RESTORE_FAILED', toMessage(error))
    }
  })
}
