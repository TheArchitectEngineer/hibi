import { _electron } from 'playwright'

// Local tests never take desktop focus. Hosted runners use their isolated desktop
// so Linux compositors keep painting frames and delivering native keyboard input.
export const electron = {
  async launch(options) {
    const application = await _electron.launch({
      ...options,
      args: [...options.args, '--hibi-test'],
    })
    const close = application.close.bind(application)
    application.close = async () => {
      let timer
      try {
        await Promise.race([
          close(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              application.process().kill('SIGKILL')
              reject(new Error('Electron test cleanup exceeded 20 seconds'))
            }, 20000)
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    }
    if (process.env.GITHUB_ACTIONS === 'true') {
      await application.firstWindow()
      await application.evaluate(({ app, BrowserWindow }) => {
        const show = (window) => {
          if (window.webContents.getURL().startsWith('hibi-analysis:')) return
          window.setFocusable(true)
          window.show()
          window.focus()
        }
        app.on('browser-window-created', (_event, window) => {
          window.once('ready-to-show', () => show(window))
        })
        for (const window of BrowserWindow.getAllWindows()) show(window)
      })
    }
    return application
  },
}

function startupEntries() {
  const doc = globalThis.document
  const editor = doc?.querySelector('.editor-page')
  return {
    dom: doc && {
      readyState: doc.readyState,
      editorBusy: editor?.getAttribute('aria-busy'),
      editorInert: editor?.inert,
      loading: doc.querySelectorAll('.loading-screen').length,
      editable: doc.querySelectorAll('.tiptap[contenteditable="true"]').length,
    },
    stages: performance
      .getEntries()
      .filter((entry) => entry.name.startsWith('hibi:'))
      .slice(-24)
      .map((entry) => ({
        name: entry.name.slice(5, 85),
        at: Math.round(entry.startTime),
        ms: Math.round(entry.duration),
        status: entry.detail?.status,
      })),
  }
}

// Use only after a readiness failure. Keep the original assertion error intact.
export async function startupDiagnostics(application, page) {
  const bounded = async (request) => {
    let timer
    try {
      return await Promise.race([
        request.catch(() => ({ unavailable: true })),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve({ unavailable: true }), 1000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  const [renderer, main] = await Promise.all([
    bounded(page.evaluate(startupEntries)),
    bounded(application.evaluate(startupEntries)),
  ])
  return { renderer, main }
}

export async function waitForDocumentEditor(application, page) {
  try {
    await page
      .getByRole('textbox', { name: 'Document editor', exact: true })
      .waitFor()
  } catch (error) {
    try {
      console.error(
        'document editor startup:',
        JSON.stringify(await startupDiagnostics(application, page)),
      )
    } catch {
      // Preserve the original Playwright failure if diagnostics cannot run.
    }
    throw error
  }
}

export async function crashAndReload(application) {
  // Drain pending locator disposal before replacing Playwright's debug target.
  await (await application.firstWindow()).evaluate(() => undefined)
  await application.evaluate(async ({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    })
    const contents = BrowserWindow.getAllWindows()[0].webContents
    const loaded = new Promise((resolve) =>
      contents.once('did-finish-load', resolve),
    )
    // forcefullyCrashRenderer can hang under Linux's debugger/crash handler.
    if (process.platform === 'linux')
      process.kill(contents.getOSProcessId(), 'SIGKILL')
    else contents.forcefullyCrashRenderer()
    await loaded
  })
}
