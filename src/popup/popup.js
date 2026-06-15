import { getBlockedFingerprints, isSiteDisabled, disableSite, enableSite } from '../shared/storage.js'

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url || !tab.id) {
    showUnsupported()
    return
  }

  let hostname
  try {
    const u = new URL(tab.url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      showUnsupported()
      return
    }
    hostname = u.hostname
    document.getElementById('site-name').textContent = hostname
  } catch {
    showUnsupported()
    return
  }

  const list = await getBlockedFingerprints()
  document.getElementById('block-count').textContent = list.length

  const disabled = await isSiteDisabled(hostname)
  const toggle = document.getElementById('site-toggle')
  toggle.checked = !disabled

  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      await enableSite(hostname)
    } else {
      await disableSite(hostname)
    }
    chrome.tabs.reload(tab.id)
  })

  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage()
  })
}

function showUnsupported() {
  document.getElementById('site-name').textContent = '지원되지 않는 페이지'
  document.getElementById('site-toggle').disabled = true
}

init()
