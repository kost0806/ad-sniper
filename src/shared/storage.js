const STORAGE_KEY = 'blockedFingerprints'
const DISABLED_HOSTS_KEY = 'disabledHosts'

export async function getBlockedFingerprints() {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return result[STORAGE_KEY] || []
}

export async function addFingerprint(fp) {
  const list = await getBlockedFingerprints()
  const key = serializeFingerprint(fp)
  if (list.some(f => serializeFingerprint(f) === key)) return
  list.push(fp)
  await chrome.storage.local.set({ [STORAGE_KEY]: list })
}

export async function removeFingerprint(fp) {
  const list = await getBlockedFingerprints()
  const key = serializeFingerprint(fp)
  const filtered = list.filter(f => serializeFingerprint(f) !== key)
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered })
}

export async function clearAll() {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] })
}

export async function getDisabledHosts() {
  const result = await chrome.storage.local.get(DISABLED_HOSTS_KEY)
  return result[DISABLED_HOSTS_KEY] || []
}

export async function toggleHost(host) {
  const list = await getDisabledHosts()
  const idx = list.indexOf(host)
  if (idx === -1) list.push(host)
  else list.splice(idx, 1)
  await chrome.storage.local.set({ [DISABLED_HOSTS_KEY]: list })
  return idx === -1 // true = now disabled
}

export function serializeFingerprint(fp) {
  return `${fp.type}:${fp.value}`
}
