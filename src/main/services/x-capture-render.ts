import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { buildFallbackCardHtml } from './x-card-html'
import type { XPostData } from './x-embed'

const EMBED_BASE = 'https://platform.twitter.com/embed/Tweet.html'
const WINDOW_WIDTH = 550
const INITIAL_HEIGHT = 900
const MIN_HEIGHT = 140
const MAX_HEIGHT = 5000
const SETTLE_MS = 600
const MAX_WAIT_MS = 12_000
const MIN_PNG_BYTES = 1024
const LOAD_TIMEOUT_MS = 20_000
const EVAL_TIMEOUT_MS = 5_000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Bounds any renderer promise: a stalled navigation or a remote page blocking
 * its main thread would otherwise hang the serialized capture queue forever.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout()
      reject(new Error('Render step timed out.'))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/** Timeout variant that resolves a fallback instead of rejecting. */
function withTimeoutFallback<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return withTimeout(promise, ms, () => undefined).catch(() => fallback)
}

/**
 * Hidden, hardened render window. The partition has no `persist:` prefix, so
 * the session is in-memory: no X cookies ever touch disk, and each render is
 * isolated from the user's browsing state.
 */
function createRenderWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: INITIAL_HEIGHT,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      partition: 'x-capture'
    }
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.setAudioMuted(true)
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-redirect', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })
  // Request-denial alone is not enough: permission *checks* default to granted
  // when no check handler is installed.
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.webContents.session.setDevicePermissionHandler(() => false)

  return window
}

async function measureContentHeight(window: BrowserWindow): Promise<number> {
  try {
    const height = (await withTimeoutFallback(
      window.webContents.executeJavaScript(
        'Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0)'
      ) as Promise<unknown>,
      EVAL_TIMEOUT_MS,
      0
    )) as unknown
    return typeof height === 'number' && Number.isFinite(height) ? height : 0
  } catch {
    return 0
  }
}

/** Waits until a tweet card exists and every image has settled (bounded). */
async function waitForCardReady(window: BrowserWindow): Promise<boolean> {
  const deadline = Date.now() + MAX_WAIT_MS

  while (Date.now() < deadline) {
    let hasContent = false
    try {
      // A positive "card rendered" signal is required: error/login/protected
      // pages often carry plenty of text but no tweet card, and must degrade to
      // a failed capture (visible Retry) instead of a placeholder screenshot.
      const contentReady = Boolean(
        await withTimeoutFallback(
          window.webContents.executeJavaScript(
            `(() => {
            const text = document.body ? document.body.innerText : ''
            const blocked = /(log in|sign in|something went wrong|doesn't exist|not available|account suspended|post is unavailable|is protected|no longer available)/i.test(text)
            const hasCard = Boolean(document.querySelector('article, .twitter-tweet, blockquote.twitter-tweet'))
            return hasCard && !blocked
          })()`
          ),
          EVAL_TIMEOUT_MS,
          false
        )
      )
      const imagesSettled = Boolean(
        await withTimeoutFallback(
          window.webContents.executeJavaScript(
            'Array.from(document.images).every((image) => image.complete)'
          ),
          EVAL_TIMEOUT_MS,
          false
        )
      )
      hasContent = contentReady && imagesSettled
    } catch {
      // Page still loading; retry until the deadline.
    }

    if (hasContent) return true
    await delay(SETTLE_MS)
  }

  return false
}

/** Clears the shared render partition before tearing the window down. */
async function destroyRenderWindow(window: BrowserWindow): Promise<void> {
  try {
    await window.webContents.session.clearStorageData()
  } catch {
    // Partition cleanup is best-effort; the window is destroyed regardless.
  }
  window.destroy()
}

async function captureWindow(window: BrowserWindow): Promise<Buffer> {
  const height = Math.min(
    MAX_HEIGHT,
    Math.max(MIN_HEIGHT, Math.ceil(await measureContentHeight(window)))
  )
  window.setContentSize(WINDOW_WIDTH, height)
  await delay(250)

  const image = await window.webContents.capturePage()
  if (image.isEmpty()) throw new Error('Capture image is empty.')

  const png = image.toPNG()
  if (png.length < MIN_PNG_BYTES) throw new Error('Capture image looks blank.')
  return png
}

async function captureEmbed(tweetId: string, theme: 'light' | 'dark'): Promise<Buffer> {
  const window = createRenderWindow()
  try {
    const url = `${EMBED_BASE}?id=${encodeURIComponent(tweetId)}&theme=${theme}&dnt=true`
    await withTimeout(window.loadURL(url), LOAD_TIMEOUT_MS, () => {
      try {
        window.webContents.stop()
      } catch {
        // Window already gone; the destroy in finally handles cleanup.
      }
    })
    if (!(await waitForCardReady(window))) {
      throw new Error('Tweet embed did not render.')
    }
    return await captureWindow(window)
  } finally {
    await destroyRenderWindow(window)
  }
}

async function captureFallbackCard(
  tweetId: string,
  post: XPostData | null,
  tempDirectory: string
): Promise<Buffer> {
  mkdirSync(tempDirectory, { recursive: true })
  // A tampered persisted job could carry a path-like tweetId; the filename is
  // derived only from a strict numeric allowlist.
  const safeId = /^[1-9]\d*$/.test(tweetId) ? tweetId : 'unknown'
  const tempFile = join(tempDirectory, `render-${safeId}.html`)
  const window = createRenderWindow()
  try {
    writeFileSync(
      tempFile,
      buildFallbackCardHtml({
        authorName: post?.authorName ?? null,
        authorHandle: post?.authorHandle ?? null,
        text: post?.text ?? null,
        postedAt: post?.postedAt ?? null,
        url: `https://x.com/i/status/${safeId}`
      }),
      'utf8'
    )
    await withTimeout(window.loadFile(tempFile), LOAD_TIMEOUT_MS, () => {
      try {
        window.webContents.stop()
      } catch {
        // Window cleanup happens in finally.
      }
    })
    await delay(SETTLE_MS)
    return await captureWindow(window)
  } finally {
    await destroyRenderWindow(window)
    try {
      rmSync(tempFile, { force: true })
    } catch {
      // Temp render file cleanup is best-effort.
    }
  }
}

export interface RenderCaptureOptions {
  theme?: 'light' | 'dark'
  tempDirectory: string
}

/**
 * Renders a tweet screenshot: the official embed first, then a locally built
 * card from oEmbed data. When oEmbed metadata is unavailable (deleted,
 * protected or suspended post) there is nothing trustworthy to render, so the
 * capture fails with a retryable error instead of saving a placeholder image.
 */
export async function renderTweetCapture(
  tweetId: string,
  post: XPostData | null,
  options: RenderCaptureOptions
): Promise<Buffer> {
  try {
    return await captureEmbed(tweetId, options.theme ?? 'light')
  } catch (error) {
    if (!post) throw error
  }

  return captureFallbackCard(tweetId, post, options.tempDirectory)
}
