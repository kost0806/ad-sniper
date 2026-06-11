import { getBlockedFingerprints, removeFingerprint, clearAll, serializeFingerprint } from '../shared/storage.js'

async function render() {
  const list = await getBlockedFingerprints()
  const ul = document.getElementById('list')
  document.getElementById('count').textContent = `${list.length}개 차단 중`

  ul.innerHTML = ''

  if (list.length === 0) {
    ul.innerHTML = '<li class="empty">차단된 광고가 없습니다.</li>'
    return
  }

  list.forEach(fp => {
    const li = document.createElement('li')

    const info = document.createElement('div')
    info.className = 'fp-info'

    const typeEl = document.createElement('span')
    typeEl.className = 'fp-type'
    typeEl.textContent = fp.type === 'hostname' ? '도메인 차단' : fp.type === 'id' ? 'ID 차단' : '선택자 차단'

    const valEl = document.createElement('span')
    valEl.className = 'fp-value'
    valEl.textContent = fp.value
    valEl.title = fp.value

    info.append(typeEl, valEl)

    const btn = document.createElement('button')
    btn.className = 'delete-btn'
    btn.textContent = '삭제'
    btn.addEventListener('click', async () => {
      await removeFingerprint(fp)
      // Also remove network rule if hostname type
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
  if (!confirm('모든 차단 패턴을 삭제할까요?')) return
  // Remove all network rules too
  const list = await getBlockedFingerprints()
  for (const fp of list) {
    if (fp.type === 'hostname') {
      await chrome.runtime.sendMessage({ type: 'UNBLOCK', fingerprint: fp })
    }
  }
  await clearAll()
  render()
})

render()
