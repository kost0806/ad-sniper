import { serializeFingerprint } from '../shared/storage.js'

// In-memory set of serialized fingerprints blocked this session
export const SESSION_BLOCKED = new Set()

export function hideElement(el) {
  if (!el || el.dataset.adsniperBlocked) return
  el.style.setProperty('display', 'none', 'important')
  el.dataset.adsniperBlocked = 'true'
}

export function lockSlot(el) {
  // Find nearest ancestor that is the ad slot container
  let container = el
  for (let i = 0; i < 3; i++) {
    if (!container.parentElement || container.parentElement === document.body) break
    container = container.parentElement
  }
  container.dataset.adsniperSlotLocked = 'true'
  hideElement(container)
}

export function isLocked(el) {
  let node = el
  while (node && node !== document.body) {
    if (node.dataset.adsniperSlotLocked === 'true') return true
    node = node.parentElement
  }
  return false
}

export function blockWithFingerprint(el, fp) {
  const key = serializeFingerprint(fp)
  SESSION_BLOCKED.add(key)
  lockSlot(el)
}

export function isSessionBlocked(fpKey) {
  return SESSION_BLOCKED.has(fpKey)
}
