import { getBlockedFingerprints, serializeFingerprint } from '../shared/storage.js'
import { getFingerprint, matchesFingerprint } from '../shared/fingerprint.js'
import { replaceWithBlockedPage, blockWithFingerprint, isLocked, SESSION_BLOCKED } from './blocker.js'

const isSubframe = window !== window.top

let blockedFingerprints = []
let hoverOverlay = null
let activeMenu = null

// Build scope cursor as PNG via Canvas (more reliable than SVG data URL for CSS cursor)
function buildScopeCursorURL() {
  try {
    const c = document.createElement('canvas')
    c.width = 32; c.height = 32
    const ctx = c.getContext('2d')
    const RED = '#ff2222'

    // Outer circle
    ctx.strokeStyle = RED; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9
    ctx.beginPath(); ctx.arc(16, 16, 13, 0, Math.PI * 2); ctx.stroke()

    // Inner circle
    ctx.lineWidth = 0.7; ctx.globalAlpha = 0.5
    ctx.beginPath(); ctx.arc(16, 16, 7, 0, Math.PI * 2); ctx.stroke()

    // Crosshairs (gap around center)
    ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.moveTo(16, 0);  ctx.lineTo(16, 10)
    ctx.moveTo(16, 22); ctx.lineTo(16, 32)
    ctx.moveTo(0,  16); ctx.lineTo(10, 16)
    ctx.moveTo(22, 16); ctx.lineTo(32, 16)
    ctx.stroke()

    // Center dot
    ctx.fillStyle = RED; ctx.globalAlpha = 0.95
    ctx.beginPath(); ctx.arc(16, 16, 1.5, 0, Math.PI * 2); ctx.fill()

    return c.toDataURL('image/png')
  } catch (_) {
    return null
  }
}

const SCOPE_CURSOR_URL = buildScopeCursorURL()
// cursor CSS value — hotspot at (16,16), fallback to crosshair
const SCOPE_CURSOR_CSS = SCOPE_CURSOR_URL
  ? `url("${SCOPE_CURSOR_URL}") 16 16, crosshair`
  : 'crosshair'

async function init() {
  if (isSubframe) return

  blockedFingerprints = await getBlockedFingerprints()
  blockedFingerprints.forEach(fp => SESSION_BLOCKED.add(serializeFingerprint(fp)))

  applyStoredBlocks()
  injectStyles()

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue
        if (node.dataset.adsniperOwned) continue
        if (isLocked(node)) { replaceWithBlockedPage(node); continue }
        checkElement(node)
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  setupAdInteraction()
  setupUnblockHandler()
}

function injectStyles() {
  const style = document.createElement('style')
  style.dataset.adsniperOwned = 'true'
  style.textContent = `
    .adsniper-scope-cursor,
    .adsniper-scope-cursor * {
      cursor: ${SCOPE_CURSOR_CSS} !important;
    }
    .adsniper-hover-overlay {
      position: fixed !important;
      z-index: 2147483646 !important;
      pointer-events: all !important;
      /* Near-zero alpha ensures hit-testing works on transparent overlays */
      background: rgba(255, 0, 0, 0.01) !important;
      display: none !important;
    }
    .adsniper-menu {
      position: fixed !important;
      z-index: 2147483647 !important;
      background: #1c1c1e !important;
      border: 1px solid #2c2c2e !important;
      border-radius: 12px !important;
      padding: 12px !important;
      min-width: 200px !important;
      box-shadow: 0 8px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      user-select: none !important;
      pointer-events: all !important;
    }
    .adsniper-menu-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      margin-bottom: 10px !important;
    }
    .adsniper-menu-title {
      font-size: 12px !important;
      font-weight: 600 !important;
      color: #ebebf5 !important;
      letter-spacing: 0.02em !important;
    }
    .adsniper-menu-close {
      background: none !important;
      border: none !important;
      color: #636366 !important;
      cursor: pointer !important;
      font-size: 14px !important;
      padding: 0 2px !important;
      line-height: 1 !important;
    }
    .adsniper-menu-close:hover { color: #aeaeb2 !important; }
    .adsniper-block-btn {
      display: block !important;
      width: 100% !important;
      padding: 12px 16px !important;
      background: #ef4444 !important;
      color: #fff !important;
      border: none !important;
      border-radius: 8px !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      text-align: center !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      letter-spacing: 0.01em !important;
      box-sizing: border-box !important;
    }
    .adsniper-block-btn:hover { background: #dc2626 !important; }
    .adsniper-block-btn:active { background: #b91c1c !important; }
    .adsniper-divider {
      border: none !important;
      border-top: 1px solid #2c2c2e !important;
      margin: 8px 0 4px !important;
    }
    .adsniper-view-btn {
      display: block !important;
      width: 100% !important;
      padding: 5px 16px !important;
      background: none !important;
      color: #48484a !important;
      border: none !important;
      font-size: 11px !important;
      cursor: pointer !important;
      text-align: center !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      box-sizing: border-box !important;
    }
    .adsniper-view-btn:hover { color: #636366 !important; }
  `
  document.head.appendChild(style)
}

function applyStoredBlocks() {
  document.querySelectorAll('iframe, ins').forEach(el => checkElement(el))
}

function checkElement(el) {
  if (el.dataset.adsniperBlocked) return
  for (const fp of blockedFingerprints) {
    if (matchesFingerprint(el, fp)) {
      replaceWithBlockedPage(el, fp)
      return
    }
  }
}

function setupAdInteraction() {
  // iframe: show overlay with scope cursor on hover
  document.addEventListener('mouseover', e => {
    const el = e.target
    if (el.tagName === 'IFRAME' && !el.dataset.adsniperBlocked) {
      showHoverOverlay(el)
    }
  }, true)

  // ins: apply scope cursor class on hover
  document.addEventListener('mouseover', e => {
    const ins = e.target.closest?.('ins')
    if (ins && !ins.dataset.adsniperBlocked) {
      ins.classList.add('adsniper-scope-cursor')
    }
  })

  document.addEventListener('mouseout', e => {
    const ins = e.target.closest?.('ins')
    if (!ins || ins.dataset.adsniperBlocked) return
    if (!ins.contains(e.relatedTarget)) {
      ins.classList.remove('adsniper-scope-cursor')
    }
  })

  // ins left-click: show block menu
  document.addEventListener('click', e => {
    if (e.target.dataset?.adsniperAction === 'unblock') return
    if (activeMenu?.contains(e.target)) return
    const ins = e.target.closest?.('ins')
    if (ins && !ins.dataset.adsniperBlocked) {
      e.preventDefault()
      e.stopPropagation()
      showBlockMenu(e.clientX, e.clientY, ins)
    }
  }, true)

  // Dismiss menu on outside click
  document.addEventListener('click', e => {
    if (activeMenu && !activeMenu.contains(e.target)) closeMenu()
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu()
  })
}

function showHoverOverlay(iframe) {
  if (!hoverOverlay) {
    hoverOverlay = document.createElement('div')
    hoverOverlay.className = 'adsniper-hover-overlay adsniper-scope-cursor'
    hoverOverlay.dataset.adsniperOwned = 'true'
    hoverOverlay.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      showBlockMenu(e.clientX, e.clientY, hoverOverlay._adEl)
    })
    hoverOverlay.addEventListener('mouseleave', () => {
      hoverOverlay.style.setProperty('display', 'none', 'important')
    })
    document.body.appendChild(hoverOverlay)
  }

  const rect = iframe.getBoundingClientRect()
  if (!rect.width || !rect.height) return  // skip zero-size iframes

  hoverOverlay._adEl = iframe
  hoverOverlay.style.setProperty('left',   rect.left   + 'px', 'important')
  hoverOverlay.style.setProperty('top',    rect.top    + 'px', 'important')
  hoverOverlay.style.setProperty('width',  rect.width  + 'px', 'important')
  hoverOverlay.style.setProperty('height', rect.height + 'px', 'important')
  hoverOverlay.style.setProperty('display', 'block', 'important')
}

function showBlockMenu(x, y, adEl) {
  closeMenu()

  const menu = document.createElement('div')
  menu.className = 'adsniper-menu'
  menu.dataset.adsniperOwned = 'true'
  activeMenu = menu

  menu.innerHTML = `
    <div class="adsniper-menu-header">
      <span class="adsniper-menu-title">🎯 Ad Sniper</span>
      <button class="adsniper-menu-close" title="닫기">✕</button>
    </div>
    <button class="adsniper-block-btn">🚫 광고 차단하기</button>
    <hr class="adsniper-divider"/>
    <button class="adsniper-view-btn">광고 보기</button>
  `

  menu.querySelector('.adsniper-menu-close').onclick = () => closeMenu()

  menu.querySelector('.adsniper-block-btn').onclick = () => {
    const fp = getFingerprint(adEl)
    blockWithFingerprint(adEl, fp)
    chrome.runtime.sendMessage({ type: 'BLOCK', fingerprint: fp })
    blockedFingerprints.push(fp)
    if (hoverOverlay) hoverOverlay.style.setProperty('display', 'none', 'important')
    closeMenu()
  }

  menu.querySelector('.adsniper-view-btn').onclick = () => closeMenu()

  document.body.appendChild(menu)
  menu.style.setProperty('left', x + 'px', 'important')
  menu.style.setProperty('top',  y + 'px', 'important')

  requestAnimationFrame(() => {
    if (!activeMenu) return
    const r = menu.getBoundingClientRect()
    const margin = 8
    if (r.right  > window.innerWidth  - margin) menu.style.setProperty('left', (window.innerWidth  - r.width  - margin) + 'px', 'important')
    if (r.bottom > window.innerHeight - margin) menu.style.setProperty('top',  (y - r.height - margin) + 'px', 'important')
  })
}

function closeMenu() {
  activeMenu?.remove()
  activeMenu = null
}

function setupUnblockHandler() {
  document.addEventListener('click', e => {
    if (e.target.dataset?.adsniperAction !== 'unblock') return
    e.stopPropagation()
    const container = e.target.closest('[data-adsniper-fp]')
    handleUnblock(container)
  }, true)
}

async function handleUnblock(container) {
  const fpKey = container?.dataset?.adsniperFp

  if (fpKey) {
    const fp = blockedFingerprints.find(f => serializeFingerprint(f) === fpKey)
    if (fp) {
      await chrome.runtime.sendMessage({ type: 'UNBLOCK', fingerprint: fp })
      blockedFingerprints = blockedFingerprints.filter(f => serializeFingerprint(f) !== fpKey)
      SESSION_BLOCKED.delete(fpKey)
    }
  }

  location.reload()
}

init()
