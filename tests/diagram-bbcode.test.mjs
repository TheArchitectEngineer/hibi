import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { electron } from './electron.mjs'
import { pressShortcut } from './keyboard.mjs'

test('Mermaid and BBCode edit, preview, and export without executing content', {
  timeout: 90000,
}, async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'hibi-diagrams-'))
  const profile = join(temp, 'profile')
  await mkdir(profile)
  await writeFile(
    join(profile, 'addons.json'),
    JSON.stringify({ mermaid: true, bbcode: true }),
  )
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${profile}`],
  })
  t.after(async () => {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 })
    })
    await app.close()
    await rm(temp, { recursive: true, force: true })
  })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => console.error(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text())
  })
  page.setDefaultTimeout(15000)
  await page
    .getByRole('textbox', { name: 'Document editor', exact: true })
    .waitFor({ timeout: 30000 })
    .catch(async (error) => {
      const body = await page
        .locator('body')
        .innerText()
        .catch(() => '')
      console.error(body.slice(0, 1000))
      throw error
    })
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  const open = async (name, source, label) => {
    const path = join(temp, name)
    await writeFile(path, source)
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path],
      })
    }, path)
    await pressShortcut(app, `${mod}+o`)
    if (label !== 'Markdown')
      await page
        .getByRole('textbox', { name: `${label} editor`, exact: true })
        .waitFor()
    await page
      .getByRole('button', { name: /^side-by-side$/i })
      .click()
      .catch(async (error) => {
        console.error((await page.locator('body').innerText()).slice(-4000))
        throw error
      })
    await page
      .getByRole('textbox', { name: `${label} editor`, exact: true })
      .waitFor()
  }
  await open('diagram.mmd', 'flowchart LR\n  A[Start] --> B[Finish]', 'Mermaid')
  const diagram = page.locator('.format-content img')
  await diagram.waitFor()
  assert.match(await diagram.getAttribute('src'), /^data:image\/svg\+xml,/)
  assert.ok(
    await diagram.evaluate((image) => image.complete && image.naturalWidth > 0),
  )
  assert.equal(
    await page.getByRole('button', { name: /^normal$/i }).isDisabled(),
    true,
  )
  const exported = join(temp, 'diagram.html')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, exported)
  await page.getByRole('button', { name: /^Export HTML$/i }).click()
  await page.waitForFunction(
    () => !document.querySelector('.format-preview button')?.disabled,
  )
  for (let attempt = 0; attempt < 50; attempt++) {
    if (
      await readFile(exported).then(
        () => true,
        () => false,
      )
    )
      break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.deepEqual(
    await page.locator('.format-preview .document-notice').allTextContents(),
    [],
  )
  assert.match(await readFile(exported, 'utf8'), /data:image\/svg\+xml/)
  await open(
    'post.bbcode',
    '[b]bold [i]nested[/i][/b]\n[code][b]literal[/b][/code]\n[url=javascript:alert(1)]unsafe[/url]\n<img src=x onerror="window.compromised=true">',
    'BBCode',
  )
  await page.locator('.bbcode-content strong em').waitFor()
  assert.equal(
    await page.locator('.bbcode-content strong').innerText(),
    'bold nested',
  )
  assert.equal(
    await page.locator('.bbcode-content pre').innerText(),
    '[b]literal[/b]',
  )
  assert.equal(
    await page.locator('.bbcode-content a').getAttribute('href'),
    null,
  )
  assert.equal(await page.locator('.bbcode-content img').count(), 0)
  assert.equal(await page.evaluate(() => window.compromised), undefined)
  await writeFile(
    join(temp, 'image.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA3sAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await open('images.bbcode', '[img]image.png[/img]', 'BBCode')
  await page.locator('.bbcode-content img[src^="data:image/png"]').waitFor()
  await page.getByRole('button', { name: /^bold$/i, exact: true }).waitFor()
  await open('notes.md', '```mermaid\nflowchart LR\n  A --> B\n```', 'Markdown')
  await page.getByRole('button', { name: /^normal$/i }).click()
  await page.locator('.mermaid-block img').waitFor()
  await page.getByRole('button', { name: /Edit Mermaid diagram/i }).click()
  await page
    .getByLabel('Mermaid source', { exact: true })
    .fill('sequenceDiagram\n  Alice->>Bob: Hello')
  await page.getByRole('button', { name: /^Apply$/i }).click()
  await page.locator('.mermaid-block img').waitFor()
  await page
    .getByRole('button', { name: /^source view$/i, exact: true })
    .click()
  assert.match(
    await page.locator('.cm-content').innerText(),
    /Alice->>Bob: Hello/,
  )
})
