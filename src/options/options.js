import { getBlockedFingerprints, removeFingerprint, clearAll, serializeFingerprint } from '../shared/storage.js'
import { t } from '../shared/i18n.js'

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n
    const val = t(key)
    if (typeof val === 'string') el.innerHTML = val
  })
  document.title = t('options_page_title')
}

async function render() {
  const list = await getBlockedFingerprints()
  const ul = document.getElementById('list')
  document.getElementById('count').textContent = t('options_count')(list.length)

  ul.innerHTML = ''

  if (list.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = t('options_empty')
    ul.appendChild(li)
    return
  }

  list.forEach(fp => {
    const li = document.createElement('li')

    const info = document.createElement('div')
    info.className = 'fp-info'

    const typeEl = document.createElement('span')
    typeEl.className = 'fp-type'
    typeEl.textContent = fp.type === 'hostname'
      ? t('fp_type_hostname')
      : fp.type === 'id'
        ? t('fp_type_id')
        : t('fp_type_selector')

    const valEl = document.createElement('span')
    valEl.className = 'fp-value'
    valEl.textContent = fp.value
    valEl.title = fp.value

    info.append(typeEl, valEl)

    const btn = document.createElement('button')
    btn.className = 'delete-btn'
    btn.textContent = t('options_delete')
    btn.addEventListener('click', async () => {
      await removeFingerprint(fp)
      if (fp.type === 'hostname') {
        chrome.runtime.sendMessage({ type: 'UNBLOCK', fingerprint: fp })
      }
      render()
    })

    li.append(info, btn)
    ul.appendChild(li)
  })
}

document.getElementById('clear-all').addEventListener('click', async () => {
  if (!confirm(t('options_delete_confirm'))) return
  const list = await getBlockedFingerprints()
  for (const fp of list) {
    if (fp.type === 'hostname') {
      await chrome.runtime.sendMessage({ type: 'UNBLOCK', fingerprint: fp })
    }
  }
  await clearAll()
  render()
})

applyI18n()
render()
