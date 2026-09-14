# linkster-clipboard-listener

Native, event-driven clipboard listener used by Linkster's main process.

## API

```js
const listener = require('./build/Release/linkster_clipboard_listener.node')

listener.start((text) => {
  // called with new clipboard text
})

listener.stop()
```

`start` throws on platforms where the listener is unsupported.

## Platform support

| Platform | Mechanism | Status |
|---|---|---|
| Windows | `AddClipboardFormatListener` + message-only window (`WM_CLIPBOARDUPDATE`) | Implemented |
| macOS | `NSPasteboard.changeCount` polling on a worker thread | Implemented |
| Linux | Not implementable portably (X11 needs XFixes; Wayland has no global clipboard) | Stub returns `false`; JS falls back to polling |

Linkster's `createNativeWatcher` only attempts to load this addon on
`win32`/`darwin`; everywhere else the polling watcher is used.

## Building

```bash
npm run native:build
```

Requires a C++ toolchain: on Windows the VS Build Tools, on macOS Xcode CLT,
plus Python for node-gyp. Prebuilt binaries should be produced per OS/arch in
CI and shipped alongside the app (see `electron-builder.yml` `asarUnpack`).
