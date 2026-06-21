import { getBlockedFingerprints, serializeFingerprint, isSiteDisabled } from '../shared/storage.js'
import { getFingerprint, matchesFingerprint, isAdIframe } from '../shared/fingerprint.js'
import { replaceWithBlockedPage, blockWithFingerprint, isLocked, SESSION_BLOCKED } from './blocker.js'
import { t } from '../shared/i18n.js'

const isSubframe = window !== window.top

let blockedFingerprints = []
let hoverOverlay = null
let activeMenu = null
let fakeCursor = null   // DOM-based scope cursor (immune to page CSP)

async function init() {
  if (isSubframe) return

  console.debug('[AdSniper] content script loaded on', location.hostname)

  if (await isSiteDisabled(location.hostname)) {
    console.debug('[AdSniper] disabled for this site')
    return
  }

  blockedFingerprints = await getBlockedFingerprints()
  blockedFingerprints.forEach(fp => SESSION_BLOCKED.add(serializeFingerprint(fp)))

  applyStoredBlocks()
  injectStyles()
  createFakeCursor()

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
    .adsniper-hover-overlay {
      position: fixed !important;
      z-index: 2147483646 !important;
      pointer-events: all !important;
      /* Near-zero alpha ensures hit-testing works on transparent overlays */
      background: rgba(255, 0, 0, 0.01) !important;
      display: none !important;
      cursor: none !important;
    }
    .adsniper-scope-ins {
      cursor: none !important;
    }
    .adsniper-fake-cursor {
      position: fixed !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      display: none !important;
      transform: translate(-50%, -50%) !important;
      width: 64px !important;
      height: 64px !important;
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

function createFakeCursor() {
  fakeCursor = document.createElement('div')
  fakeCursor.className = 'adsniper-fake-cursor'
  fakeCursor.dataset.adsniperOwned = 'true'
  // Scope crosshair SVG — inline, bypasses any img-src CSP
  fakeCursor.innerHTML = `
    <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <!-- outer ring -->
      <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(255,60,60,0.9)" stroke-width="2"/>
      <!-- inner ring -->
      <circle cx="32" cy="32" r="12" fill="none" stroke="rgba(255,60,60,0.7)" stroke-width="1.2"/>
      <!-- center dot -->
      <circle cx="32" cy="32" r="2.5" fill="rgba(255,60,60,1)"/>
      <!-- crosshairs: top -->
      <line x1="32" y1="2"  x2="32" y2="16" stroke="rgba(255,60,60,0.9)" stroke-width="2" stroke-linecap="round"/>
      <!-- crosshairs: bottom -->
      <line x1="32" y1="48" x2="32" y2="62" stroke="rgba(255,60,60,0.9)" stroke-width="2" stroke-linecap="round"/>
      <!-- crosshairs: left -->
      <line x1="2"  y1="32" x2="16" y2="32" stroke="rgba(255,60,60,0.9)" stroke-width="2" stroke-linecap="round"/>
      <!-- crosshairs: right -->
      <line x1="48" y1="32" x2="62" y2="32" stroke="rgba(255,60,60,0.9)" stroke-width="2" stroke-linecap="round"/>
      <!-- tick marks on outer ring (12, 3, 6, 9 o'clock gaps already covered by crosshairs) -->
      <!-- range finder lines at 45° -->
      <line x1="16" y1="16" x2="20" y2="20" stroke="rgba(255,60,60,0.4)" stroke-width="1" stroke-linecap="round"/>
      <line x1="48" y1="16" x2="44" y2="20" stroke="rgba(255,60,60,0.4)" stroke-width="1" stroke-linecap="round"/>
      <line x1="16" y1="48" x2="20" y2="44" stroke="rgba(255,60,60,0.4)" stroke-width="1" stroke-linecap="round"/>
      <line x1="48" y1="48" x2="44" y2="44" stroke="rgba(255,60,60,0.4)" stroke-width="1" stroke-linecap="round"/>
    </svg>
  `
  fakeCursor.style.setProperty('display', 'none', 'important')
  document.body.appendChild(fakeCursor)
}

function showFakeCursor(x, y) {
  if (!fakeCursor) return
  fakeCursor.style.setProperty('left', x + 'px', 'important')
  fakeCursor.style.setProperty('top',  y + 'px', 'important')
  fakeCursor.style.setProperty('display', 'block', 'important')
}

function hideFakeCursor() {
  if (!fakeCursor) return
  fakeCursor.style.setProperty('display', 'none', 'important')
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
  // iframe: show overlay + fake cursor on hover (ad iframes only)
  document.addEventListener('mouseover', e => {
    const el = e.target
    if (el.tagName === 'IFRAME' && !el.dataset.adsniperBlocked && isAdIframe(el)) {
      showHoverOverlay(el)
    }
  }, true)

  // ins: show fake cursor on hover
  document.addEventListener('mouseover', e => {
    const ins = e.target.closest?.('ins')
    if (ins && !ins.dataset.adsniperBlocked) {
      ins.classList.add('adsniper-scope-ins')
      showFakeCursor(e.clientX, e.clientY)
    }
  })

  document.addEventListener('mousemove', e => {
    if (fakeCursor && fakeCursor.style.display !== 'none') {
      showFakeCursor(e.clientX, e.clientY)
    }
    if (hoverOverlay && hoverOverlay.style.display !== 'none') {
      showFakeCursor(e.clientX, e.clientY)
    }
  }, true)

  document.addEventListener('mouseout', e => {
    const ins = e.target.closest?.('ins')
    if (!ins || ins.dataset.adsniperBlocked) return
    if (!ins.contains(e.relatedTarget)) {
      ins.classList.remove('adsniper-scope-ins')
      hideFakeCursor()
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
    hoverOverlay.className = 'adsniper-hover-overlay'
    hoverOverlay.dataset.adsniperOwned = 'true'
    hoverOverlay.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      showBlockMenu(e.clientX, e.clientY, hoverOverlay._adEl)
    })
    hoverOverlay.addEventListener('mousemove', e => {
      showFakeCursor(e.clientX, e.clientY)
    })
    hoverOverlay.addEventListener('mouseleave', () => {
      hoverOverlay.style.setProperty('display', 'none', 'important')
      hideFakeCursor()
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
  hideFakeCursor()

  const menu = document.createElement('div')
  menu.className = 'adsniper-menu'
  menu.dataset.adsniperOwned = 'true'
  activeMenu = menu

  menu.innerHTML = `
    <div class="adsniper-menu-header">
      <span class="adsniper-menu-title">${t('menu_title')}</span>
      <button class="adsniper-menu-close">✕</button>
    </div>
    <button class="adsniper-block-btn">${t('block_ad')}</button>
    <hr class="adsniper-divider"/>
    <button class="adsniper-view-btn">${t('view_ad')}</button>
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

  menu.querySelector('.adsniper-view-btn').onclick = () => {
    const iframe = adEl.tagName === 'IFRAME' ? adEl : adEl.querySelector('iframe[src]')
    const url = iframe?.src
    closeMenu()
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

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

init().catch(err => console.error('[AdSniper] init failed:', err))
