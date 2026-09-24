import DOMPurify from 'dompurify'

let sequence = 0
let initialized: Promise<typeof import('mermaid')['default']> | undefined
export async function renderDiagram(source: string) {
  if (source.length > 50000)
    throw new Error('This diagram exceeds the 50,000 character limit.')
  if (!source.trim()) return ''
  initialized ??= import('mermaid')
    .then(({ default: engine }) => {
      engine.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        maxTextSize: 50000,
        maxEdges: 500,
        htmlLabels: false,
        theme: 'neutral',
        secure: [
          'secure',
          'securityLevel',
          'startOnLoad',
          'maxTextSize',
          'maxEdges',
          'suppressErrorRendering',
          'htmlLabels',
          'themeCSS',
        ],
      })
      return engine
    })
    .catch((error) => {
      initialized = undefined
      throw error
    })
  const mermaid = await initialized
  const { svg } = await mermaid.render(`hibi-diagram-${++sequence}`, source)
  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'a', 'image'],
  })
  return `<img class="mermaid-diagram" alt="Mermaid diagram" src="data:image/svg+xml,${encodeURIComponent(clean)}">`
}
