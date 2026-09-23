import { useSyncExternalStore } from 'react'
import { AddonViewContent } from './AddonViewContent'
import { addonViews } from './addon-views'

export function AddonTab({ hidden }: { hidden: boolean }) {
  const state = useSyncExternalStore(addonViews.subscribe, addonViews.snapshot)
  const entries = state.instances.filter(
    (entry) => entry.definition.location === 'tab',
  )
  const active = entries.find((entry) => entry.id === state.activeTab)
  return (
    <section
      className="addon-tab-panel"
      id="addon-tab-panel"
      role="tabpanel"
      aria-labelledby={active ? `addon-tab-${active.id}` : undefined}
      hidden={hidden || !active}
    >
      {entries.map((entry) => (
        <AddonViewContent
          key={entry.id}
          entry={entry}
          visible={!hidden && entry.id === active?.id}
        />
      ))}
    </section>
  )
}
