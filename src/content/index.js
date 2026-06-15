import { getBlockedFingerprints, serializeFingerprint } from '../shared/storage.js'
import { getFingerprint, matchesFingerprint } from '../shared/fingerprint.js'
import { replaceWithBlockedPage, blockWithFingerprint, isLocked, SESSION_BLOCKED } from './blocker.js'

const isSubframe = window !== window.top

let blockedFingerprints = []
let hoverOverlay = null
let activeMenu = null

// Sniper scope cursor (32×32 SVG, hotspot at center 16,16)
const SCOPE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
  `<circle cx="16" cy="16" r="13" stroke="#ff2222" stroke-width="1.5" fill="none" opacity="0.9"/>` +
  `<circle cx="16" cy="16" r="7" stroke="#ff2222" stroke-width="0.7" fill="none" opacity="0.5"/>` +
  `<line x1="16" y1="0" x2="16" y2="10" stroke="#ff2222" stroke-width="1.5" opacity="0.9"/>` +
  `<line x1="16" y1="22" x2="16" y2="32" stroke="#ff2222" stroke-width="1.5" opacity="0.9"/>` +
  `<line x1="0" y1="16" x2="10" y2="16" stroke="#ff2222" stroke-width="1.5" opacity="0.9"/>` +
  `<line x1="22" y1="16" x2="32" y2="16" stroke="#ff2222" stroke-width="1.5" opacity="0.9"/>` +
  `<circle cx="16" cy="16" r="1.5" fill="#ff2222" opacity="0.9"/>` +
  `</svg>`
)
const SCOPE_CURSOR = `url("data:image/svg+xml,${SCOPE_SVG}") 16 16, crosshair`

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
        if (node.dataset.adsniperOwned) continue  // skip our own injected nodes
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

function findAdEl(el) {
  let node = el
  for (let i = 0; i < 4; i++) {
    if (!node) return null
    if (node.tagName === 'IFRAME' || node.tagName === 'INS') return node
    node = node.parentElement
  }
  return null
}

function setupAdInteraction() {
  // iframe hover: show transparent overlay with scope cursor
  document.addEventListener('mouseover', e => {
    if (e.target.tagName === 'IFRAME' && !e.target.dataset.adsniperBlocked) {
      showHoverOverlay(e.target)
    }
  }, true)

  // ins hover: set scope cursor directly
  document.addEventListener('mouseover', e => {
    const ins = e.target.closest?.('ins')
    if (ins && !ins.dataset.adsniperBlocked) {
      ins.style.setProperty('cursor', SCOPE_CURSOR, 'important')
    }
  })

  // ins hover out: reset cursor
  document.addEventListener('mouseout', e => {
    const ins = e.target.closest?.('ins')
    if (!ins || ins.dataset.adsniperBlocked) return
    if (!ins.contains(e.relatedTarget)) {
      ins.style.removeProperty('cursor')
    }
  })

  // ins left-click: show block menu (capture phase so we intercept before ad receives it)
  document.addEventListener('click', e => {
    if (e.target.dataset?.adsniperAction === 'unblock') return  // let unblock handler take it
    if (activeMenu?.contains(e.target)) return
    const ins = e.target.closest?.('ins')
    if (ins && !ins.dataset.adsniperBlocked) {
      e.preventDefault()
      e.stopPropagation()
      showBlockMenu(e.clientX, e.clientY, ins)
    }
  }, true)

  // Dismiss menu when clicking outside
  document.addEventListener('click', e => {
    if (activeMenu && !activeMenu.contains(e.target)) closeMenu()
  })

  // Dismiss menu on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu()
  })
}

function showHoverOverlay(iframe) {
  if (!hoverOverlay) {
    hoverOverlay = document.createElement('div')
    hoverOverlay.dataset.adsniperOwned = 'true'
    hoverOverlay.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      showBlockMenu(e.clientX, e.clientY, hoverOverlay._adEl)
    })
    hoverOverlay.addEventListener('mouseleave', () => {
      hoverOverlay.style.display = 'none'
    })
    document.body.appendChild(hoverOverlay)
  }

  const rect = iframe.getBoundingClientRect()
  hoverOverlay._adEl = iframe
  hoverOverlay.style.cssText = `
    position: fixed !important;
    z-index: 2147483646 !important;
    pointer-events: all !important;
    background: transparent !important;
    display: block !important;
    left: ${rect.left}px !important;
    top: ${rect.top}px !important;
    width: ${rect.width}px !important;
    height: ${rect.height}px !important;
    cursor: ${SCOPE_CURSOR} !important;
  `
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
    if (hoverOverlay) hoverOverlay.style.display = 'none'
    closeMenu()
  }

  menu.querySelector('.adsniper-view-btn').onclick = () => closeMenu()

  document.body.appendChild(menu)

  // Initial position: place at click point, then clamp into viewport
  menu.style.left = x + 'px'
  menu.style.top = y + 'px'

  requestAnimationFrame(() => {
    if (!activeMenu) return
    const r = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const margin = 8
    if (r.right > vw - margin) menu.style.left = (vw - r.width - margin) + 'px'
    if (r.bottom > vh - margin) menu.style.top = (y - r.height - margin) + 'px'
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
