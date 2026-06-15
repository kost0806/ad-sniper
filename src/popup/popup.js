import { getBlockedFingerprints } from '../shared/storage.js'

const CONTENT_SCRIPT_ID = 'adsniper-content'

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url || !tab.id) return

  let origin
  try {
    const u = new URL(tab.url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      showUnsupported()
      return
    }
    origin = `${u.protocol}//${u.hostname}/*`
    document.getElementById('site-name').textContent = u.hostname
  } catch {
    showUnsupported()
    return
  }

  const list = await getBlockedFingerprints()
  document.getElementById('block-count').textContent = list.length

  const isActive = await chrome.permissions.contains({ origins: [origin] })
  const toggle = document.getElementById('site-toggle')
  toggle.checked = isActive

  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      await enable(origin, tab)
    } else {
      await disable(origin, tab)
    }
  })

  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage()
  })
}

async function enable(origin, tab) {
  const granted = await chrome.permissions.request({ origins: [origin] })
  if (!granted) {
    document.getElementById('site-toggle').checked = false
    return
  }

  // Register content script for this origin (persists across sessions)
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] }).catch(() => [])
  const currentMatches = existing[0]?.matches ?? []
  const newMatches = currentMatches.includes(origin)
    ? currentMatches
    : [...currentMatches, origin]

  await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] }).catch(() => {})
  await chrome.scripting.registerContentScripts([{
    id: CONTENT_SCRIPT_ID,
    matches: newMatches,
    js: ['dist/content.js'],
    runAt: 'document_idle',
    allFrames: true,
  }])

  // Inject immediately into the current tab without requiring reload
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: ['dist/content.js'],
  }).catch(() => {})
}

async function disable(origin, tab) {
  // Remove this origin from the registered content script matches
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] }).catch(() => [])
  const currentMatches = existing[0]?.matches ?? []
  const newMatches = currentMatches.filter(m => m !== origin)

  await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] }).catch(() => {})
  if (newMatches.length > 0) {
    await chrome.scripting.registerContentScripts([{
      id: CONTENT_SCRIPT_ID,
      matches: newMatches,
      js: ['dist/content.js'],
      runAt: 'document_idle',
      allFrames: true,
    }])
  }

  await chrome.permissions.remove({ origins: [origin] })

  // Reload so injected script is removed
  if (tab?.id) chrome.tabs.reload(tab.id)
}

function showUnsupported() {
  document.getElementById('site-name').textContent = '지원되지 않는 페이지'
  document.getElementById('site-toggle').disabled = true
}

init()
