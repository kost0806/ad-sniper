import { getBlockedFingerprints, getDisabledHosts, serializeFingerprint } from '../shared/storage.js'
import { getFingerprint, matchesFingerprint } from '../shared/fingerprint.js'
import { replaceWithBlockedPage, blockWithFingerprint, isLocked, SESSION_BLOCKED } from './blocker.js'

const isSubframe = window !== window.top

let blockedFingerprints = []
let lastContextTarget = null
let lastHoveredIframe = null  // fallback when frameUrl matching fails

async function init() {
  const disabledHosts = await getDisabledHosts()
  if (disabledHosts.includes(location.hostname)) return

  // Subframes only need the context menu gating — blocking is handled by main frame
  if (isSubframe) {
    document.addEventListener('contextmenu', () => {
      chrome.runtime.sendMessage({ type: 'UPDATE_MENU', enabled: true })
    })
    return
  }

  blockedFingerprints = await getBlockedFingerprints()
  blockedFingerprints.forEach(fp => SESSION_BLOCKED.add(serializeFingerprint(fp)))

  applyStoredBlocks()

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue
        if (isLocked(node)) { replaceWithBlockedPage(node); continue }
        checkElement(node)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  setupContextMenuGating()
  setupBlockHandler()
}

function applyStoredBlocks() {
  document.querySelectorAll('iframe, ins').forEach(checkElement)
}

function checkElement(el) {
  if (el.dataset.adsniperBlocked) return
  for (const fp of blockedFingerprints) {
    if (matchesFingerprint(el, fp)) { replaceWithBlockedPage(el); return }
  }
}

function findAdEl(el) {
  let node = el
  for (let i = 0; i < 4; i++) {
    if (!node) return null
    if (node.tagName === 'IFRAME' || node.tagName === 'INS') return node
    node = node.parentElement
  }
  return null
}

function setupContextMenuGating() {
  // Main-frame right-click: enable menu only when on iframe/ins
  document.addEventListener('contextmenu', e => {
    lastContextTarget = e.target
    const adEl = findAdEl(e.target)
    chrome.runtime.sendMessage({ type: 'UPDATE_MENU', enabled: !!adEl })
  })

  // Track the last iframe the mouse entered — used as fallback when frameUrl
  // matching fails (e.g. about:blank iframes with ad content)
  document.addEventListener('mouseover', e => {
    if (e.target.tagName === 'IFRAME') {
      lastHoveredIframe = e.target
      chrome.runtime.sendMessage({ type: 'UPDATE_MENU', enabled: true })
    }
  }, true)
}

function setupBlockHandler() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'BLOCK_TARGET') return

    let el = null

    if (msg.frameId && msg.frameId > 0) {
      // Right-click was inside an iframe: find it by frameUrl hostname or fall
      // back to the last iframe the user hovered (covers about:blank ad iframes)
      el = (msg.frameUrl && findIframeByUrl(msg.frameUrl)) || lastHoveredIframe
    } else {
      el = findAdEl(lastContextTarget)
    }

    if (!el) return

    const fp = getFingerprint(el)
    blockWithFingerprint(el, fp)
    chrome.runtime.sendMessage({ type: 'BLOCK', fingerprint: fp })
    blockedFingerprints.push(fp)
  })
}

function findIframeByUrl(frameUrl) {
  try {
    const targetHostname = new URL(frameUrl).hostname
    if (!targetHostname) return null
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
