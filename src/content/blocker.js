import { serializeFingerprint } from '../shared/storage.js'

export const SESSION_BLOCKED = new Set()

const BLOCKED_PAGE_URL = chrome.runtime.getURL('dist/src/blocked.html')

export function replaceWithBlockedPage(el) {
  if (!el || el.dataset.adsniperBlocked) return

  el.dataset.adsniperBlocked = 'true'

  if (el.tagName === 'IFRAME') {
    // Freeze src so ad SDK can't reassign it
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')
    el.dataset.adsniperOrigSrc = el.src
    descriptor.set.call(el, BLOCKED_PAGE_URL)

    Object.defineProperty(el, 'src', {
      get: () => BLOCKED_PAGE_URL,
      set: () => {},           // silently ignore reassignment attempts
      configurable: true,
    })
  } else {
    // ins or other container: collapse and show placeholder
    el.style.setProperty('display', 'flex', 'important')
    el.style.setProperty('align-items', 'center', 'important')
    el.style.setProperty('justify-content', 'center', 'important')
    el.style.setProperty('background', '#f8f8f8', 'important')
    el.style.setProperty('color', '#aaa', 'important')
    el.style.setProperty('font-size', '11px', 'important')
    el.style.setProperty('min-height', '40px', 'important')
    el.innerHTML = '🚫 광고가 차단되었습니다'
  }
}

export function lockSlot(el) {
  let container = el
  for (let i = 0; i < 3; i++) {
    if (!container.parentElement || container.parentElement === document.body) break
    container = container.parentElement
  }
  container.dataset.adsniperSlotLocked = 'true'
  replaceWithBlockedPage(container.tagName === 'IFRAME' || container.tagName === 'INS'
    ? container
    : el)
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
  SESSION_BLOCKED.add(serializeFingerprint(fp))
  const iframe = el.tagName === 'IFRAME' ? el : el.querySelector('iframe')
  if (iframe) {
    replaceWithBlockedPage(iframe)
  } else {
    replaceWithBlockedPage(el)
  }
  // Mark the container slot so re-injected children are also caught
  const container = iframe?.parentElement || el
  if (container && container !== document.body) {
    container.dataset.adsniperSlotLocked = 'true'
  }
}

export function isSessionBlocked(fpKey) {
  return SESSION_BLOCKED.has(fpKey)
}
