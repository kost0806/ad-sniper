import { getBlockedFingerprints, getDisabledHosts, serializeFingerprint } from '../shared/storage.js'
import { getFingerprint, matchesFingerprint } from '../shared/fingerprint.js'
import { replaceWithBlockedPage, blockWithFingerprint, isLocked, SESSION_BLOCKED } from './blocker.js'

let blockedFingerprints = []
let lastContextTarget = null

async function init() {
  const disabledHosts = await getDisabledHosts()
  if (disabledHosts.includes(location.hostname)) return

  blockedFingerprints = await getBlockedFingerprints()
  blockedFingerprints.forEach(fp => SESSION_BLOCKED.add(serializeFingerprint(fp)))

  applyStoredBlocks()

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue
        if (isLocked(node)) {
          replaceWithBlockedPage(node)
          continue
        }
        checkElement(node)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function applyStoredBlocks() {
  const candidates = document.querySelectorAll('iframe, ins')
  candidates.forEach(checkElement)
}

function checkElement(el) {
  if (el.dataset.adsniperBlocked) return
  for (const fp of blockedFingerprints) {
    if (matchesFingerprint(el, fp)) {
      replaceWithBlockedPage(el)
      return
    }
  }
}

// --- Context menu gating ---

function findAdEl(el) {
  let node = el
  for (let i = 0; i < 4; i++) {
    if (!node) return null
    if (node.tagName === 'IFRAME' || node.tagName === 'INS') return node
    node = node.parentElement
  }
  return null
}

// Main-frame right-click: enable menu only on iframe/ins targets
document.addEventListener('contextmenu', e => {
  lastContextTarget = e.target
  const adEl = findAdEl(e.target)
  chrome.runtime.sendMessage({ type: 'UPDATE_MENU', enabled: !!adEl })
})

// Pre-enable menu when hovering over an iframe so that right-clicking
// INSIDE a cross-origin iframe also shows the enabled menu item
document.addEventListener('mouseover', e => {
  if (e.target.tagName === 'IFRAME') {
    chrome.runtime.sendMessage({ type: 'UPDATE_MENU', enabled: true })
  }
}, true)

// --- Block handler ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'BLOCK_TARGET') return

  let el = null

  if (msg.frameId && msg.frameId > 0 && msg.frameUrl) {
    el = findIframeByUrl(msg.frameUrl)
  } else {
    el = findAdEl(lastContextTarget)
  }

  if (!el) return

  const fp = getFingerprint(el)
  blockWithFingerprint(el, fp)
  chrome.runtime.sendMessage({ type: 'BLOCK', fingerprint: fp })
  blockedFingerprints.push(fp)
})

function findIframeByUrl(frameUrl) {
  try {
    const targetHostname = new URL(frameUrl).hostname
    for (const iframe of document.querySelectorAll('iframe[src]')) {
      try {
        if (new URL(iframe.src).hostname === targetHostname) {
          return iframe.closest('[id*="google_ads"], [id*="__container__"]') || iframe
        }
      } catch (_) {}
    }
  } catch (_) {}
  return null
}

init()
