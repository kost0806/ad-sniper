import { serializeFingerprint } from '../shared/storage.js'
import { t } from '../shared/i18n.js'

export const SESSION_BLOCKED = new Set()

let blockedUICounter = 0

// All HTML is static/hardcoded — no user input or remote data is ever inserted
function createBlockedHTML() {
  const id = `adsniper-g${++blockedUICounter}`
  return `
    <svg style="width:72px;height:72px;flex-shrink:0" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="${id}" cx="38%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#3d3d3d"/>
          <stop offset="100%" stop-color="#050505"/>
        </radialGradient>
      </defs>
      <g stroke="#2a2a2a" stroke-linecap="round">
        <line x1="60" y1="60" x2="10" y2="16" stroke-width="1.8"/>
        <line x1="60" y1="60" x2="28" y2="5" stroke-width="1"/>
        <line x1="60" y1="60" x2="108" y2="10" stroke-width="1.5"/>
        <line x1="60" y1="60" x2="114" y2="38" stroke-width="1"/>
        <line x1="60" y1="60" x2="118" y2="66" stroke-width="1.5"/>
        <line x1="60" y1="60" x2="100" y2="108" stroke-width="1"/>
        <line x1="60" y1="60" x2="58" y2="118" stroke-width="1.5"/>
        <line x1="60" y1="60" x2="20" y2="110" stroke-width="1"/>
        <line x1="60" y1="60" x2="5" y2="84" stroke-width="1.5"/>
        <line x1="60" y1="60" x2="12" y2="48" stroke-width="1"/>
      </g>
      <circle cx="60" cy="60" r="26" fill="#0a0a0a" stroke="#222" stroke-width="2.5"/>
      <circle cx="60" cy="60" r="22" fill="url(#${id})"/>
      <ellipse cx="53" cy="52" rx="6" ry="4" fill="#ffffff" opacity="0.04" transform="rotate(-20 53 52)"/>
    </svg>
    <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#555;letter-spacing:0.03em;text-align:center;">${t('ad_blocked')}</span>
    <button data-adsniper-action="unblock" style="background:none;border:1px solid #2a2a2a;color:#444;font-size:10px;padding:4px 14px;border-radius:4px;cursor:pointer;font-family:-apple-system,sans-serif;margin-top:2px;">${t('unblock')}</button>
  `
}

export function replaceWithBlockedPage(el, fp = null) {
  if (!el || el.dataset.adsniperBlocked) return

  el.dataset.adsniperBlocked = 'true'
  const fpKey = fp ? serializeFingerprint(fp) : ''

  if (el.tagName === 'IFRAME') {
    // Stop ad content from loading
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')
    el.dataset.adsniperOrigSrc = el.src
    descriptor.set.call(el, 'about:blank')
    Object.defineProperty(el, 'src', {
      get: () => 'about:blank',
      set: () => {},
      configurable: true,
    })
    el.style.setProperty('visibility', 'hidden', 'important')

    if (!el.parentNode) return

    const w = el.offsetWidth || parseInt(el.getAttribute('width') || '') || 300
    const h = el.offsetHeight || parseInt(el.getAttribute('height') || '') || 250

    const wrapper = document.createElement('div')
    wrapper.dataset.adsniperOwned = 'true'
    wrapper.dataset.adsniperBlocked = 'true'
    wrapper.dataset.adsniperWrapper = 'true'
    if (fpKey) wrapper.dataset.adsniperFp = fpKey
    wrapper.style.cssText = `
      display: inline-block !important;
      position: relative !important;
      width: ${w}px !important;
      height: ${h}px !important;
      overflow: hidden !important;
      vertical-align: top !important;
    `

    el.parentNode.insertBefore(wrapper, el)
    wrapper.appendChild(el)

    const overlay = document.createElement('div')
    overlay.dataset.adsniperOwned = 'true'
    overlay.style.cssText = `
      position: absolute !important;
      inset: 0 !important;
      background: #111 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;
      z-index: 1 !important;
      pointer-events: all !important;
    `
    overlay.innerHTML = createBlockedHTML()
    wrapper.appendChild(overlay)
  } else {
    // ins or other container: replace content
    if (fpKey) el.dataset.adsniperFp = fpKey
    el.style.setProperty('display', 'flex', 'important')
    el.style.setProperty('flex-direction', 'column', 'important')
    el.style.setProperty('align-items', 'center', 'important')
    el.style.setProperty('justify-content', 'center', 'important')
    el.style.setProperty('background', '#111', 'important')
    el.style.setProperty('gap', '8px', 'important')
    el.style.setProperty('min-height', '80px', 'important')
    el.style.setProperty('padding', '16px', 'important')
    el.innerHTML = createBlockedHTML()
  }
}

export function lockSlot(el) {
  let container = el
  for (let i = 0; i < 3; i++) {
    if (!container.parentElement || container.parentElement === document.body) break
    container = container.parentElement
  }
  container.dataset.adsniperSlotLocked = 'true'
  replaceWithBlockedPage(container.tagName === 'IFRAME' || container.tagName === 'INS'
    ? container
    : el)
}

export function isLocked(el) {
  let node = el
  while (node && node !== document.body) {
    if (node.dataset.adsniperSlotLocked === 'true') return true
    node = node.parentElement
  }
  return false
}

export function blockWithFingerprint(el, fp) {
  SESSION_BLOCKED.add(serializeFingerprint(fp))
  const iframe = el.tagName === 'IFRAME' ? el : el.querySelector('iframe')
  const target = iframe || el

  // Save original parent before DOM changes
  const originalParent = target.parentElement

  if (iframe) {
    replaceWithBlockedPage(iframe, fp)
  } else {
    replaceWithBlockedPage(el, fp)
  }

  // Lock the original slot so re-injected elements are caught
  if (originalParent && originalParent !== document.body) {
    originalParent.dataset.adsniperSlotLocked = 'true'
  }
}

export function isSessionBlocked(fpKey) {
  return SESSION_BLOCKED.has(fpKey)
}
