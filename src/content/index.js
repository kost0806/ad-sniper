import { getBlockedFingerprints, getDisabledHosts, serializeFingerprint } from '../shared/storage.js'
import { getFingerprint, matchesFingerprint } from '../shared/fingerprint.js'
import { hideElement, blockWithFingerprint, isLocked, SESSION_BLOCKED } from './blocker.js'

let blockedFingerprints = []
let lastContextTarget = null

async function init() {
  // Check if extension is disabled on this host
  const disabledHosts = await getDisabledHosts()
  if (disabledHosts.includes(location.hostname)) return

  blockedFingerprints = await getBlockedFingerprints()

  // Populate session set from storage
  blockedFingerprints.forEach(fp => SESSION_BLOCKED.add(serializeFingerprint(fp)))

  // Initial scan
  scanAll()

  // Watch for dynamically injected ads
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue
        if (isLocked(node)) {
          hideElement(node)
          continue
        }
        checkElement(node)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function scanAll() {
  const candidates = document.querySelectorAll('iframe, ins, [id*="ad"], [class*="ad"], [id*="banner"], [class*="banner"]')
  candidates.forEach(checkElement)
}

function checkElement(el) {
  if (el.dataset.adsniperBlocked) return
  for (const fp of blockedFingerprints) {
    if (matchesFingerprint(el, fp)) {
      hideElement(el)
      return
    }
  }
}

// Track last right-clicked element
document.addEventListener('contextmenu', e => {
  lastContextTarget = e.target
})

// Listen for BLOCK_TARGET message from service worker (via context menu)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'BLOCK_TARGET') {
    const el = lastContextTarget
    if (!el || el === document.body || el === document.documentElement) return

    const fp = getFingerprint(el)
    blockWithFingerprint(el, fp)

    // Persist and add network rule
    chrome.runtime.sendMessage({ type: 'BLOCK', fingerprint: fp })

    // Update local list for this session
    blockedFingerprints.push(fp)
  }
})

init()
