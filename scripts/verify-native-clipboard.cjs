const { app, clipboard } = require('electron')
const path = require('node:path')

const addonPath = path.join(
  __dirname,
  '..',
  'native',
  'clipboard-listener',
  'build',
  'Release',
  'linkster_clipboard_listener.node'
)

app.whenReady().then(async () => {
  let listener
  try {
    listener = require(addonPath)
  } catch (error) {
    console.error('FAILED to load addon:', error.message)
    app.exit(1)
    return
  }

  let received = null
  listener.start((text) => {
    received = text
  })

  const marker = `https://example.com/native-${Date.now()}`
  await clipboard.writeText(marker)

  setTimeout(() => {
    listener.stop()
    if (received === marker) {
      console.log('OK native clipboard event received:', received)
      app.exit(0)
    } else {
      console.error('FAILED expected:', marker, 'received:', received)
      app.exit(1)
    }
  }, 1500)
})
