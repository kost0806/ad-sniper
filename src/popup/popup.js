import { getBlockedFingerprints, getDisabledHosts, toggleHost } from '../shared/storage.js'

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const hostname = tab?.url ? new URL(tab.url).hostname : null

  if (hostname) {
    document.getElementById('site-name').textContent = hostname
  }

  const [list, disabledHosts] = await Promise.all([
    getBlockedFingerprints(),
    getDisabledHosts(),
  ])

  document.getElementById('block-count').textContent = list.length

  const toggle = document.getElementById('site-toggle')
  if (hostname && disabledHosts.includes(hostname)) {
    toggle.checked = false
  }

  toggle.addEventListener('change', async () => {
    if (!hostname) return
    await toggleHost(hostname)
    // Reload the current tab so the content script re-evaluates
    if (tab?.id) chrome.tabs.reload(tab.id)
  })

  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage()
  })
}

init()
