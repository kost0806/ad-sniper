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
  if (msg.type !== 'BLOCK_TARGET') return

  let el = null

  if (msg.frameId && msg.frameId > 0 && msg.frameUrl) {
    // Right-click happened inside a cross-origin iframe — find it by src in the main page
    el = findIframeByUrl(msg.frameUrl)
  } else {
    el = lastContextTarget
  }

  if (!el || el === document.body || el === document.documentElement) return

  const fp = getFingerprint(el)
  blockWithFingerprint(el, fp)

  chrome.runtime.sendMessage({ type: 'BLOCK', fingerprint: fp })
  blockedFingerprints.push(fp)
})

function findIframeByUrl(frameUrl) {
  try {
    const targetHostname = new URL(frameUrl).hostname
    // Find the iframe whose src hostname matches, then walk up to its ad container
    for (const iframe of document.querySelectorAll('iframe[src]')) {
      try {
        if (new URL(iframe.src).hostname === targetHostname) {
          // Prefer the parent container if it has an ad-like id
          const container = iframe.closest('[id*="google_ads"], [id*="__container__"], [id*="ad_"]')
          return container || iframe
        }
      } catch (_) {}
    }
  } catch (_) {}
  return null
}

init()
