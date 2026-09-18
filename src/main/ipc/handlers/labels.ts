import { secureHandle } from '../guard'
import { IPC, LabelColorSchema, fail, ok } from '@shared/contract/ipc'
import {
  createLabel,
  deleteLabel,
  listLabels,
  mergeLabels,
  renameLabel
} from '../../data/label-repository'
import { getLabelColors, setLabelColor } from '../../services/label-color-service'

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireString(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  return value
}

export function registerLabelHandlers(): void {
  secureHandle(IPC.labels.list, async () => {
    try {
      return ok(await listLabels())
    } catch (error) {
      return fail('LABELS_LIST_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.labels.create, async (_event, name: unknown) => {
    try {
      const value = requireString(name)
      if (value === null) return fail('INVALID_NAME', 'A label name is required.')
      return ok(await createLabel(value))
    } catch (error) {
      return fail('LABELS_CREATE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.labels.rename, async (_event, oldName: unknown, newName: unknown) => {
    try {
      const from = requireString(oldName)
      const to = requireString(newName)
      if (from === null || to === null) {
        return fail('INVALID_NAME', 'Both the current and new label names are required.')
      }
      return ok(await renameLabel(from, to))
    } catch (error) {
      return fail('LABELS_RENAME_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.labels.merge, async (_event, source: unknown, target: unknown) => {
    try {
      const from = requireString(source)
      const to = requireString(target)
      if (from === null || to === null) {
        return fail('INVALID_NAME', 'Both the source and target labels are required.')
      }
      return ok(await mergeLabels(from, to))
    } catch (error) {
      return fail('LABELS_MERGE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.labels.delete, async (_event, name: unknown) => {
    try {
      const value = requireString(name)
      if (value === null) return fail('INVALID_NAME', 'A label name is required.')
      return ok(await deleteLabel(value))
    } catch (error) {
      return fail('LABELS_DELETE_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.labels.getColors, async () => {
    try {
      return ok(await getLabelColors())
    } catch (error) {
      return fail('LABELS_COLORS_FAILED', toMessage(error))
    }
  })

  secureHandle(IPC.labels.setColor, async (_event, name: unknown, color: unknown) => {
    try {
      const value = requireString(name)
      if (value === null) return fail('INVALID_NAME', 'A label name is required.')

      let resolvedColor: string | null = null
      if (color !== null) {
        const parsed = LabelColorSchema.safeParse(color)
        if (!parsed.success) {
          return fail('INVALID_COLOR', 'A label color must be a 6-digit hex value.')
        }
        resolvedColor = parsed.data
      }
      return ok(await setLabelColor(value, resolvedColor))
    } catch (error) {
      return fail('LABELS_SET_COLOR_FAILED', toMessage(error))
    }
  })
}
