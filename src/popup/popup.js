import { getBlockedFingerprints, isSiteDisabled, disableSite, enableSite } from '../shared/storage.js'
import { t } from '../shared/i18n.js'

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n
    const val = t(key)
    if (typeof val === 'string') el.innerHTML = val
  })
  document.getElementById('popup-hint').innerHTML = t('popup_hint')
}

async function init() {
  applyI18n()

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
  document.getElementById('site-name').textContent = t('popup_unsupported')
  document.getElementById('site-toggle').disabled = true
}

init()
