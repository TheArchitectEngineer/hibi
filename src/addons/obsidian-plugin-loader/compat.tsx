import type { Extension } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import type { Editor as RichEditor } from '@tiptap/core'
import { Puzzle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { AddonContext } from '../api'
import type { ObsidianPluginManifest } from './package'

type ObsidianElement = HTMLElement & {
  empty: () => void
  setText: (value: string) => ObsidianElement
}

function element(tag: string): ObsidianElement {
  const node = document.createElement(tag) as ObsidianElement
  node.empty = () => node.replaceChildren()
  node.setText = (value) => {
    node.textContent = value
    return node
  }
  return node
}

export type EditorBridge = {
  source: EditorView | null
  rich: RichEditor | null
  last: 'source' | 'rich'
}

export function registerEditorBridge(context: AddonContext): EditorBridge {
  const bridge: EditorBridge = { source: null, rich: null, last: 'rich' }
  context.editor.registerSource({
    id: 'obsidian-source',
    create: () =>
      ViewPlugin.fromClass(
        class {
          constructor(readonly view: EditorView) {
            bridge.source = view
            view.dom.addEventListener('focusin', this.focus)
          }
          focus = () => {
            bridge.last = 'source'
          }
          destroy() {
            this.view.dom.removeEventListener('focusin', this.focus)
            if (bridge.source === this.view) bridge.source = null
          }
        },
      ) as Extension,
  })
  context.editor.registerRich({
    id: 'obsidian-rich',
    attach(editor) {
      bridge.rich = editor
      const focus = () => {
        bridge.last = 'rich'
      }
      editor.on('focus', focus)
      return () => {
        editor.off('focus', focus)
        if (bridge.rich === editor) bridge.rich = null
      }
    },
  })
  return bridge
}

function currentEditor(bridge: EditorBridge) {
  const source = bridge.source
  const rich = bridge.rich
  if (bridge.last === 'source' && source?.dom.isConnected) return source
  if (rich && !rich.isDestroyed) return rich
  return source?.dom.isConnected ? source : null
}

function editorApi(context: AddonContext, bridge: EditorBridge) {
  return {
    getValue: () => context.editor.getDocument()?.markdown ?? '',
    setValue: (value: string) => context.editor.updateMarkdown(() => value),
    getSelection() {
      const editor = currentEditor(bridge)
      if (!editor) return ''
      if (editor instanceof EditorView) {
        const { from, to } = editor.state.selection.main
        return editor.state.doc.sliceString(from, to)
      }
      const { from, to } = editor.state.selection
      return editor.state.doc.textBetween(from, to)
    },
    replaceSelection(value: string) {
      const editor = currentEditor(bridge)
      if (!editor) throw new Error('Open a note before running this command.')
      if (editor instanceof EditorView) {
        const { from, to } = editor.state.selection.main
        editor.dispatch({ changes: { from, to, insert: value } })
      } else editor.chain().focus().insertContent(value).run()
    },
  }
}

function ElementMount({
  node,
  onMount,
}: {
  node: HTMLElement
  onMount: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    host.current?.append(node)
    onMount()
    return () => node.remove()
  }, [node, onMount])
  return <div ref={host} />
}

export function createObsidianApi(
  context: AddonContext,
  manifest: ObsidianPluginManifest,
  bridge: EditorBridge,
  onSettings: (
    tab: {
      containerEl: HTMLElement
      display: () => void
      hide: () => void
    } | null,
  ) => void,
) {
  const editor = editorApi(context, bridge)
  const pluginId = manifest.id.replace(/[^a-z0-9-]/g, '-')
  let nextItem = 0

  class Component {
    private cleanups: (() => void)[] = []
    onload(): void | Promise<void> {}
    onunload(): void {}
    register(callback: () => void) {
      this.cleanups.push(callback)
    }
    registerDomEvent(
      target: EventTarget,
      type: string,
      listener: EventListener,
    ) {
      target.addEventListener(type, listener)
      this.register(() => target.removeEventListener(type, listener))
    }
    registerInterval(timer: number) {
      this.register(() => clearInterval(timer))
      return timer
    }
    unload() {
      try {
        this.onunload()
      } finally {
        for (const cleanup of this.cleanups.reverse()) cleanup()
        this.cleanups = []
      }
    }
  }

  class Notice {
    constructor(message: string) {
      context.notify(String(message))
    }
    hide() {}
  }

  class MarkdownView {
    editor = editor
    getViewType() {
      return 'markdown'
    }
  }

  const app = {
    workspace: {
      getActiveViewOfType(type: unknown) {
        return type === MarkdownView && context.editor.getDocument()
          ? new MarkdownView()
          : null
      },
      getActiveFile: () => {
        const name = context.editor.getDocument()?.name
        return name ? { name, path: name } : null
      },
      openLinkText: (link: string) => context.workspace.openFile(link),
    },
  }

  class Modal extends Component {
    app = app
    contentEl = element('div')
    titleEl = element('h2')
    private closeDialog: (() => void) | null = null
    constructor(_app: typeof app) {
      super()
    }
    onOpen(): void | Promise<void> {}
    onClose(): void {}
    open() {
      const dialog = context.dialogs.open({
        title: manifest.name,
        content: () => (
          <ElementMount
            node={this.contentEl}
            onMount={() => void this.onOpen()}
          />
        ),
      })
      this.closeDialog = () => dialog.close(null)
      void dialog.result.then(() => {
        this.onClose()
        this.closeDialog = null
      })
    }
    close() {
      this.closeDialog?.()
    }
  }

  class PluginSettingTab {
    app = app
    containerEl = element('div')
    constructor(
      _app: typeof app,
      readonly plugin: Plugin,
    ) {}
    display(): void {}
    hide(): void {}
  }

  class TextComponent {
    constructor(readonly inputEl: HTMLInputElement) {}
    setPlaceholder(value: string) {
      this.inputEl.placeholder = value
      return this
    }
    setValue(value: string) {
      this.inputEl.value = value
      return this
    }
    getValue() {
      return this.inputEl.value
    }
    onChange(callback: (value: string) => void | Promise<void>) {
      this.inputEl.addEventListener(
        'input',
        () => void callback(this.inputEl.value),
      )
      return this
    }
  }

  class Setting {
    private row = element('div')
    private label = element('label')
    private description = element('p')
    constructor(container: HTMLElement) {
      this.row.className = 'obsidian-plugin-setting'
      this.row.append(this.label, this.description)
      container.append(this.row)
    }
    setName(value: string) {
      this.label.setText(value)
      return this
    }
    setDesc(value: string) {
      this.description.setText(value)
      return this
    }
    addText(callback: (component: TextComponent) => void) {
      const input = document.createElement('input')
      input.type = 'text'
      input.id = `obsidian-${pluginId}-setting-${nextItem++}`
      this.label.setAttribute('for', input.id)
      this.row.append(input)
      callback(new TextComponent(input))
      return this
    }
  }

  class Plugin extends Component {
    app = app
    manifest = manifest
    constructor(_app: typeof app, _manifest: ObsidianPluginManifest) {
      super()
    }
    addCommand(command: {
      id: string
      name: string
      callback?: () => void | Promise<void>
      editorCallback?: (
        editor: ReturnType<typeof editorApi>,
        view: MarkdownView,
      ) => void
      checkCallback?: (checking: boolean) => boolean
    }) {
      if (!/^[a-z0-9_-]{1,80}$/.test(command.id) || !command.name)
        throw new Error('This plugin has an invalid command.')
      const cleanup = context.commands.register({
        id: `plugin-${pluginId}-${command.id.replaceAll('_', '-')}`,
        label: `${manifest.name}: ${command.name}`,
        run: async () => {
          if (command.checkCallback) {
            if (command.checkCallback(true)) command.checkCallback(false)
          } else if (command.editorCallback)
            command.editorCallback(editor, new MarkdownView())
          else await command.callback?.()
        },
      })
      this.register(cleanup)
      return command
    }
    addRibbonIcon(
      icon: string,
      title: string,
      callback: (event: MouseEvent) => void,
    ) {
      const button = element('button')
      button.title = title
      const handle = context.toolbar.register({
        id: `plugin-${pluginId}-ribbon-${nextItem++}`,
        label: title,
        icon: Puzzle,
        tooltip: `${manifest.name}: ${icon}`,
        onClick: () => callback(new MouseEvent('click')),
      })
      this.register(() => handle.dispose())
      return button
    }
    addStatusBarItem() {
      const node = element('span')
      const handle = context.statusBar.register({
        id: `plugin-${pluginId}-status-${nextItem++}`,
        label: '',
      })
      const setText = node.setText
      node.setText = (value) => {
        handle.update({ label: value, verbatim: true })
        return setText(value)
      }
      this.register(() => handle.dispose())
      return node
    }
    addSettingTab(tab: PluginSettingTab) {
      onSettings(tab)
      this.register(() => onSettings(null))
    }
    registerEditorExtension(extension: Extension) {
      const remove = context.editor.registerSource({
        id: `plugin-${pluginId}-editor-${nextItem++}`,
        create: () => extension,
      })
      this.register(remove)
    }
    loadData() {
      return context.native.query('data', { id: manifest.id })
    }
    saveData(value: unknown) {
      return context.native.invoke('saveData', { id: manifest.id, value })
    }
  }

  return {
    app,
    api: {
      Component,
      Plugin,
      Notice,
      Modal,
      MarkdownView,
      PluginSettingTab,
      Setting,
    },
  }
}

export function showPluginSettings(
  context: AddonContext,
  tab: {
    containerEl: HTMLElement
    display: () => void
    hide: () => void
  },
  title: string,
) {
  const dialog = context.dialogs.open({
    title,
    content: () => (
      <ElementMount node={tab.containerEl} onMount={() => tab.display()} />
    ),
  })
  void dialog.result.then(() => tab.hide())
}
