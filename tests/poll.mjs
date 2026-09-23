import { setTimeout } from 'node:timers/promises'

// This Playwright build treats Promise-valued waitForFunction predicates as
// truthy before they resolve. Evaluate and await async checks in the host.
export async function waitForAsync(page, predicate, arg) {
  const started = performance.now()
  const deadline = started + 7000
  let attempts = 0
  do {
    attempts++
    if (await page.evaluate(predicate, arg)) return
    await setTimeout(30)
  } while (performance.now() < deadline)
  throw new Error(
    `async condition did not settle after ${Math.round(performance.now() - started)} ms (${attempts} checks): ${predicate}`,
  )
}
