import { FileDown } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { errorMessage } from '../../shared/errors'
import { Button } from '../../ui/Controls'
import { DocumentNotice } from '../../ui/DocumentNotice'
import { PreviewActions } from '../../ui/PreviewActions'
import type {
  AddonContext,
  DocumentPreviewProps,
  RenderedMarkdown,
} from '../api'

export function localRender(
  context: AddonContext,
  render: (source: string, documentId?: string) => string | Promise<string>,
  css: string | (() => string),
) {
  return async (
    source: string,
    documentId?: string,
  ): Promise<RenderedMarkdown> => ({
    html: context.editor.isSyntaxEnabled('preview')
      ? await render(source, documentId)
      : `<pre>${source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre>`,
    css: typeof css === 'function' ? css() : css,
  })
}

/** The renderer must return sanitized HTML. Stale renders never replace newer input. */
export function localPreview(
  context: AddonContext,
  render: (source: string, documentId?: string) => Promise<RenderedMarkdown>,
  css?: () => string,
) {
  return function Preview({ value, document, toolbar }: DocumentPreviewProps) {
    const [result, setResult] = useState<RenderedMarkdown | null>(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const host = useRef<HTMLDivElement>(null)
    const enabled = useSyncExternalStore(context.editor.onSyntaxChange, () =>
      context.editor.isSyntaxEnabled('preview'),
    )
    useEffect(() => {
      let active = true
      setResult(null)
      setError('')
      const timer = setTimeout(() => {
        if (enabled)
          void render(value, document.id)
            .then((next) => {
              if (active) setResult(next)
            })
            .catch((reason) => {
              if (active) setError(errorMessage(reason))
            })
      }, 200)
      return () => {
        active = false
        clearTimeout(timer)
      }
    }, [value, enabled, document.id])
    useEffect(() => {
      if (host.current) host.current.innerHTML = result?.html ?? ''
    }, [result])
    return (
      <div className="format-preview">
        <PreviewActions target={toolbar}>
          <Button
            disabled={!result || busy}
            onClick={async () => {
              if (!result) return
              setBusy(true)
              try {
                await context.native.invoke('export', {
                  html: result.html,
                  css: css?.() ?? result.css,
                  name: document.name,
                })
              } catch (reason) {
                setError(errorMessage(reason))
              } finally {
                setBusy(false)
              }
            }}
          >
            <FileDown size={14} aria-hidden />
            Export HTML
          </Button>
        </PreviewActions>
        {!enabled ? (
          <DocumentNotice
            title="Preview disabled"
            message="Enable this format’s preview in Settings → Syntax."
          />
        ) : error ? (
          <DocumentNotice title="Preview unavailable" message={error} />
        ) : !result ? (
          <DocumentNotice title="Rendering preview…" busy />
        ) : null}
        <div ref={host} className="format-content" />
      </div>
    )
  }
}
