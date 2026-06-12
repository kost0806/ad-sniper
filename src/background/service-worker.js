import { addFingerprint, removeFingerprint, getBlockedFingerprints, serializeFingerprint } from '../shared/storage.js'

const MENU_ID = 'adsniper-block'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: '🚫 이 광고 차단',
    contexts: ['all'],
    enabled: false,
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return
  chrome.tabs.sendMessage(tab.id, {
    type: 'BLOCK_TARGET',
    frameId: info.frameId ?? 0,
    frameUrl: info.frameUrl ?? null,
  })
  // Reset menu to disabled after use
  chrome.contextMenus.update(MENU_ID, { enabled: false })
})

// Enable menu when right-clicking inside any subframe (cross-origin iframe)
// Content script handles the main-frame ins/iframe case via UPDATE_MENU
chrome.webNavigation?.onCommitted.addListener(() => {})  // keep service worker alive hint

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'UPDATE_MENU') {
    chrome.contextMenus.update(MENU_ID, { enabled: msg.enabled })
    return
  }
  if (msg.type === 'BLOCK') {
    handleBlock(msg.fingerprint).then(() => sendResponse({ ok: true }))
    return true // async response
  }
  if (msg.type === 'UNBLOCK') {
    handleUnblock(msg.fingerprint).then(() => sendResponse({ ok: true }))
    return true
  }
  if (msg.type === 'GET_BLOCKED') {
    getBlockedFingerprints().then(list => sendResponse({ list }))
    return true
  }
})

async function handleBlock(fp) {
  await addFingerprint(fp)

  if (fp.type === 'hostname') {
    await addNetworkRule(fp.value)
  }
}

async function handleUnblock(fp) {
  await removeFingerprint(fp)

  if (fp.type === 'hostname') {
    await removeNetworkRule(fp.value)
  }
}

// --- declarativeNetRequest helpers ---

async function getNextRuleId() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  if (existing.length === 0) return 1
  return Math.max(...existing.map(r => r.id)) + 1
}

async function addNetworkRule(hostname) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules()

  // Avoid duplicate rules
  if (existing.some(r => r.condition.urlFilter === `||${hostname}^`)) return

  const id = await getNextRuleId()

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [{
      id,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `||${hostname}^`,
        resourceTypes: ['sub_frame', 'script', 'image', 'xmlhttprequest', 'media'],
      },
    }],
  })
}

async function removeNetworkRule(hostname) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  const rule = existing.find(r => r.condition.urlFilter === `||${hostname}^`)
  if (!rule) return

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [rule.id],
  })
}
