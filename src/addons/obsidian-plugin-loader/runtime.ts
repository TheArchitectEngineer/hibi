import type { AddonContext } from '../api'
import {
  createObsidianApi,
  type EditorBridge,
  registerEditorBridge,
  showPluginSettings,
} from './compat'
import type { InstalledObsidianPlugin, ObsidianVaultFile } from './package'

type PluginInstance = {
  onload: () => void | Promise<void>
  unload: () => void
}

type ActivePlugin = {
  instance: PluginInstance
  script: HTMLScriptElement
  stylesheet: HTMLLinkElement | null
  settingTab: {
    containerEl: HTMLElement
    display: () => void
    hide: () => void
  } | null
}

type PluginGlobals = typeof globalThis & {
  __hibiObsidianApiFor?: (identity: string) => unknown
  __hibiObsidianLoaded?: (identity: string, exports: unknown) => void
  activeDocument?: unknown
}

export class ObsidianPluginRuntime {
  private active = new Map<string, ActivePlugin>()
  private errors = new Map<string, string>()
  private bridge: EditorBridge
  private globals = globalThis as PluginGlobals
  private api = new Map<string, unknown>()
  private exports = new Map<string, unknown>()
  private stopped = false
  private priorActiveDocument: unknown

  constructor(private context: AddonContext) {
    this.bridge = registerEditorBridge(context)
    this.globals.__hibiObsidianApiFor = (identity) => {
      const api = this.api.get(identity)
      if (!api) throw new Error('This Obsidian plugin is no longer enabled.')
      return api
    }
    this.globals.__hibiObsidianLoaded = (identity, exported) => {
      this.exports.set(identity, exported)
    }
    this.priorActiveDocument = this.globals.activeDocument
    this.globals.activeDocument = document
  }

  async start() {
    const plugins = await this.list()
    for (const plugin of plugins) {
      if (this.stopped) return
      if (!plugin.enabled) continue
      try {
        await this.load(plugin)
      } catch (error) {
        this.context.notify(
          `${plugin.manifest.name}: ${error instanceof Error ? error.message : 'could not load plugin'}`,
        )
      }
    }
  }

  list() {
    return this.context.native.query<InstalledObsidianPlugin[]>('list')
  }

  error(id: string) {
    return this.errors.get(id) ?? null
  }

  async load(plugin: InstalledObsidianPlugin) {
    if (this.stopped) throw new Error('Obsidian plugin loader is disabled.')
    if (this.active.has(plugin.manifest.id)) return
    if (!plugin.enabled) throw new Error('Enable this plugin first.')
    const identity = `${plugin.manifest.id}:${plugin.hash}`
    let settingTab: ActivePlugin['settingTab'] = null
    const workspace = await this.context.workspace.get()
    const files = workspace?.id
      ? await this.context.native.query<ObsidianVaultFile[]>('vaultList', {
          workspaceId: workspace.id,
        })
      : []
    const { app, api } = createObsidianApi(
      this.context,
      plugin.manifest,
      this.bridge,
      workspace?.name ?? '',
      workspace?.id ?? null,
      files,
      (tab) => {
        settingTab = tab
        const active = this.active.get(plugin.manifest.id)
        if (active) active.settingTab = tab
      },
    )
    this.api.set(identity, api)
    const script = document.createElement('script')
    script.src = plugin.url
    const stylesheet = plugin.styleUrl ? document.createElement('link') : null
    if (stylesheet && plugin.styleUrl) {
      stylesheet.rel = 'stylesheet'
      stylesheet.href = plugin.styleUrl
      document.head.append(stylesheet)
    }
    try {
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve()
        script.onerror = () =>
          reject(new Error('Could not load plugin script.'))
        document.head.append(script)
      })
      if (this.stopped) throw new Error('Obsidian plugin loader was disabled.')
      const exported = this.exports.get(identity) as
        | { default?: new (app: unknown, manifest: unknown) => PluginInstance }
        | (new (
            app: unknown,
            manifest: unknown,
          ) => PluginInstance)
        | undefined
      const PluginClass =
        typeof exported === 'function' ? exported : exported?.default
      if (typeof PluginClass !== 'function')
        throw new Error('main.js must export a plugin class.')
      const instance = new PluginClass(app, plugin.manifest)
      if (
        typeof instance.onload !== 'function' ||
        typeof instance.unload !== 'function'
      )
        throw new Error('The plugin must extend Obsidian Plugin.')
      this.active.set(plugin.manifest.id, {
        instance,
        script,
        stylesheet,
        settingTab,
      })
      try {
        await instance.onload()
        this.errors.delete(plugin.manifest.id)
      } catch (error) {
        this.unload(plugin.manifest.id)
        throw error
      }
    } catch (error) {
      script.remove()
      stylesheet?.remove()
      this.errors.set(
        plugin.manifest.id,
        error instanceof Error ? error.message : 'Could not load plugin.',
      )
      throw error
    } finally {
      this.api.delete(identity)
      this.exports.delete(identity)
    }
  }

  unload(id: string) {
    const plugin = this.active.get(id)
    if (!plugin) return
    this.active.delete(id)
    try {
      plugin.instance.unload()
    } finally {
      plugin.script.remove()
      plugin.stylesheet?.remove()
    }
  }

  showSettings(id: string, title: string) {
    const tab = this.active.get(id)?.settingTab
    if (!tab) return false
    showPluginSettings(this.context, tab, title)
    return true
  }

  stop() {
    this.stopped = true
    for (const id of [...this.active.keys()]) {
      try {
        this.unload(id)
      } catch (error) {
        this.context.notify(
          `Could not unload ${id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      }
    }
    delete this.globals.__hibiObsidianApiFor
    delete this.globals.__hibiObsidianLoaded
    if (this.priorActiveDocument === undefined)
      delete this.globals.activeDocument
    else this.globals.activeDocument = this.priorActiveDocument
    this.api.clear()
    this.exports.clear()
  }
}
