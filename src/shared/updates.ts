export const UPDATE_CHANNELS = {
  get: 'updates:get',
  channel: 'updates:channel',
  startup: 'updates:startup',
  check: 'updates:check',
  download: 'updates:download',
  install: 'updates:install',
  changed: 'updates:changed',
} as const

export type UpdateChannel = 'nightly-green' | 'nightly'
export type UpdateState = {
  channel: UpdateChannel
  checkOnStartup: boolean
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  supported: boolean
  version?: string | undefined
  broken?: boolean | undefined
  progress?: number | undefined
  message: string
}
type UpdateAsset = { name: string; sha512: string; size: number }
export type UpdateRelease = {
  tag: string
  version: string
  status: 'nightly-green' | 'nightly-broken'
  assets: Record<string, UpdateAsset & { zip?: UpdateAsset }>
}
export const UPDATE_URL =
  'https://github.com/schmayterling/hibi/releases/download/'

export function updateChannel(input: unknown): UpdateChannel {
  if (input !== 'nightly-green' && input !== 'nightly')
    throw new Error('Choose a valid update channel.')
  return input
}

export function updateRelease(
  input: unknown,
  channel: UpdateChannel,
): UpdateRelease {
  const release = input as UpdateRelease
  if (
    !release ||
    !/^nightly-(?:broken-)?\d{4}-\d{2}-\d{2}-[a-f0-9]{7}-\d+-\d+$/.test(
      release.tag,
    ) ||
    !/^\d+\.\d+\.\d+-nightly\.\d{8}\.g[a-f0-9]{7}\.\d+\.\d+$/.test(
      release.version,
    ) ||
    !['nightly-green', 'nightly-broken'].includes(release.status) ||
    release.tag.startsWith('nightly-broken-') !==
      (release.status === 'nightly-broken') ||
    (channel === 'nightly-green' && release.status !== 'nightly-green') ||
    !release.assets ||
    typeof release.assets !== 'object'
  )
    throw new Error('The update feed is invalid. Try again later.')
  for (const [platform, asset] of Object.entries(release.assets)) {
    if (
      !asset ||
      typeof asset.name !== 'string' ||
      !/^hibi-[a-zA-Z0-9._-]+\.(exe|AppImage|dmg)$/.test(asset.name) ||
      !asset.name.startsWith(`hibi-${release.version}-`) ||
      !/^[A-Za-z0-9+/]{86}==$/.test(asset.sha512) ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0
    )
      throw new Error('The update download is invalid. Try again later.')
    if (
      asset.zip !== undefined &&
      (!asset.zip ||
        !/^darwin-(arm64|x64)$/.test(platform) ||
        typeof asset.zip.name !== 'string' ||
        asset.zip.name !==
          `hibi-${release.version}-mac-${platform.slice(7)}.zip` ||
        !/^[A-Za-z0-9+/]{86}==$/.test(asset.zip.sha512) ||
        !Number.isSafeInteger(asset.zip.size) ||
        asset.zip.size <= 0)
    )
      throw new Error('The update download is invalid. Try again later.')
  }
  return release
}

// Nightly run numbers order builds; commit hashes do not.
export function newerUpdate(next: string, current: string): boolean {
  const parts = (version: string) => {
    const match =
      /^(\d+)\.(\d+)\.(\d+)(?:-nightly\.(\d{8})\.g?[a-f0-9]{7}(?:\.(\d+)\.(\d+))?)?$/.exec(
        version,
      )
    return match?.slice(1).map((part) => Number(part ?? 0))
  }
  const candidate = parts(next),
    installed = parts(current)
  if (!candidate || !installed) return false
  for (let i = 0; i < candidate.length; i++) {
    const nextPart = candidate[i] ?? 0
    const currentPart = installed[i] ?? 0
    if (nextPart !== currentPart) return nextPart > currentPart
  }
  return false
}
