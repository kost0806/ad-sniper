/**
 * Playwright test: verify scope cursor overlay and block menu on iframe hover
 * Uses mocked chrome APIs to inject content script directly into the page.
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const TARGET = 'https://velog.io/@whereami2048/%EA%B3%84%EC%B8%B5-%EB%B3%84-%EB%8C%80%ED%91%9C-%ED%94%84%EB%A1%9C%ED%86%A0%EC%BD%9C%EA%B3%BC-%EA%B5%AC%EC%84%B1-%EA%B8%B0%EA%B8%B0'
const CONTENT_JS = fs.readFileSync(path.join(ROOT, 'dist/content.js'), 'utf-8')

fs.mkdirSync('test-screenshots', { recursive: true })

const context = await chromium.launchPersistentContext('', {
  headless: false,
  channel: 'chromium',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--ignore-certificate-errors',
  ],
  viewport: { width: 1280, height: 900 },
})

const page = await context.newPage()

// ── Inject chrome API mock BEFORE page scripts run ───────────────────────────
await page.addInitScript(() => {
  const store = {}
  window.chrome = {
    storage: {
      local: {
        get: (key) => Promise.resolve(store[key] !== undefined ? { [key]: store[key] } : {}),
        set: (items) => { Object.assign(store, items); return Promise.resolve() },
      },
    },
    runtime: {
      sendMessage: () => Promise.resolve({ ok: true }),
      getURL: (p) => `chrome-extension://adsniper-mock/${p}`,
      onMessage: { addListener: () => {} },
    },
  }
})

// ── Navigate ─────────────────────────────────────────────────────────────────
console.log('Navigating to:', TARGET)
await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30_000 })
await page.waitForTimeout(4000)   // wait for ads to load

// ── Inject debug listener BEFORE content script ───────────────────────────────
await page.evaluate(() => {
  window.__adsniperDbg = []
  document.addEventListener('mouseover', e => {
    window.__adsniperDbg.push({ tag: e.target.tagName, src: (e.target.src || '').slice(0, 50) })
  }, true)
})

// ── Inject content script (runs as IIFE, uses window.chrome mock) ─────────────
console.log('Injecting content script...')
await page.evaluate(CONTENT_JS)
await page.waitForTimeout(1500)   // let init() finish

// ── Verify style injection ────────────────────────────────────────────────────
const styleInfo = await page.evaluate(() => {
  const el = document.querySelector('style[data-adsniper-owned]')
  if (!el) return null
  const text = el.textContent
  // Look for scope cursor class and hover overlay class
  return {
    hasScopeCursor: text.includes('adsniper-scope-cursor'),
    hasHoverOverlay: text.includes('adsniper-hover-overlay'),
    cursorSnippet: (text.match(/cursor:[^;]+/) || [''])[0].slice(0, 120),
  }
})
console.log('\n── Style injection ──────────────────────────')
console.log(styleInfo ?? 'STYLE NOT FOUND')

// ── Enumerate iframes/ins ─────────────────────────────────────────────────────
const adElements = await page.evaluate(() => {
  const items = []
  for (const el of document.querySelectorAll('iframe, ins')) {
    const box = el.getBoundingClientRect()
    items.push({
      tag: el.tagName,
      src: el.src?.slice(0, 60) ?? '',
      blocked: !!el.dataset.adsniperBlocked,
      width: Math.round(box.width),
      height: Math.round(box.height),
      x: Math.round(box.x),
      y: Math.round(box.y),
    })
  }
  return items
})
console.log('\n── Ad elements ──────────────────────────────')
adElements.forEach((el, i) => console.log(`  [${i}] ${el.tag} ${el.width}×${el.height} @ (${el.x},${el.y}) blocked=${el.blocked} src="${el.src}"`))

await page.screenshot({ path: 'test-screenshots/01-loaded.png', fullPage: false })

// ── Find a visible, unblocked iframe ─────────────────────────────────────────
const target = adElements.find(el => el.tag === 'IFRAME' && el.width > 10 && el.height > 10 && !el.blocked)
  ?? adElements.find(el => el.tag === 'INS'    && el.width > 10 && el.height > 10 && !el.blocked)

if (!target) {
  console.log('\nNo visible ad elements found — cannot test hover.')
  await context.close()
  process.exit(0)
}

console.log('\n── Hovering over:', target)

// Scroll element into view
await page.evaluate(({ x, y }) => window.scrollTo({ top: Math.max(0, y - 200), behavior: 'instant' }), target)
await page.waitForTimeout(500)

// Calculate viewport-relative center
const scrollY = await page.evaluate(() => window.scrollY)
const cx = target.x + target.width / 2
const cy = target.y + target.height / 2 - scrollY
console.log(`  viewport coords: (${Math.round(cx)}, ${Math.round(cy)}), scrollY=${scrollY}`)

// Approach 1: Playwright native mouse move
await page.mouse.move(cx, cy)
await page.waitForTimeout(600)

// Approach 2: Dispatch event directly on the iframe (simulate mouseover in JS)
const dispatchResult = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y)
  if (!el) return { error: `no element at (${x},${y})` }

  // Dispatch mouseover directly on the element (bubbles through capture phase)
  el.dispatchEvent(new MouseEvent('mouseover', {
    bubbles: true, cancelable: true, view: window, clientX: x, clientY: y,
  }))

  const overlay = document.querySelector('[data-adsniper-owned].adsniper-hover-overlay')
  return {
    elementTag: el.tagName,
    elementId: el.id?.slice(0, 60),
    overlayCreated: !!overlay,
    overlayDisplay: overlay?.style.display,
  }
}, { x: cx, y: cy })
console.log('  dispatchEvent result:', dispatchResult)

await page.waitForTimeout(400)
await page.screenshot({ path: 'test-screenshots/02-hover.png', fullPage: false })

// ── Check overlay ─────────────────────────────────────────────────────────────
const overlayInfo = await page.evaluate(() => {
  const el = document.querySelector('[data-adsniper-owned]')
  if (!el) return { found: false }
  const all = [...document.querySelectorAll('[data-adsniper-owned]')]
  return {
    found: true,
    count: all.length,
    // Find the hover overlay specifically
    overlay: (() => {
      const ov = all.find(e => e.classList.contains('adsniper-hover-overlay'))
      if (!ov) return null
      const s = ov.style
      return {
        display: s.display,
        left: s.left,
        top: s.top,
        width: s.width,
        height: s.height,
        classes: ov.className,
        cursor: getComputedStyle(ov).cursor.slice(0, 80),
      }
    })(),
  }
})
console.log('\n── Overlay check ────────────────────────────')
console.log(JSON.stringify(overlayInfo, null, 2))

// ── Check scope cursor on ins ─────────────────────────────────────────────────
if (target.tag === 'INS') {
  const insCursor = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return 'no element at point'
    const ins = el.closest('ins')
    if (!ins) return `element at point: ${el.tagName} (no ins parent)`
    return {
      insClass: ins.className,
      hasScopeCursor: ins.classList.contains('adsniper-scope-cursor'),
      cursor: getComputedStyle(ins).cursor.slice(0, 80),
    }
  }, { x: cx, y: cy })
  console.log('\n── INS cursor check ─────────────────────────')
  console.log(JSON.stringify(insCursor, null, 2))
}

// ── mouseover event log ───────────────────────────────────────────────────────
const mouseoverLog = await page.evaluate(() => window.__adsniperDbg)
console.log('\n── mouseover events (last 20) ───────────────')
console.log(JSON.stringify(mouseoverLog?.slice(-20), null, 2))

// What element is actually at the mouse position?
const elemAtPoint = await page.evaluate(({ x, y }) => {
  const scrollY = window.scrollY
  const el = document.elementFromPoint(x, y - scrollY)
  if (!el) return 'nothing'
  return { tag: el.tagName, id: el.id, cls: el.className?.slice?.(0, 60), src: el.src?.slice?.(0, 60) ?? '' }
}, { x: cx, y: cy + (await page.evaluate(() => window.scrollY)) })
console.log('\n── Element at cursor position ────────────────')
console.log(JSON.stringify(elemAtPoint, null, 2))

// ── Click to show block menu ──────────────────────────────────────────────────
console.log('\n── Clicking overlay ─────────────────────────')
await page.mouse.click(cx, cy)
await page.waitForTimeout(800)

await page.screenshot({ path: 'test-screenshots/03-after-click.png', fullPage: false })

const menuInfo = await page.evaluate(() => {
  const menu = document.querySelector('.adsniper-menu')
  if (!menu) return null
  return {
    visible: menu.style.display !== 'none',
    text: menu.textContent.replace(/\s+/g, ' ').trim(),
    blockBtnText: menu.querySelector('.adsniper-block-btn')?.textContent?.trim(),
    viewBtnText: menu.querySelector('.adsniper-view-btn')?.textContent?.trim(),
  }
})
console.log('\n── Block menu ────────────────────────────────')
console.log(JSON.stringify(menuInfo, null, 2))

console.log('\n── Screenshots saved in test-screenshots/ ───')
await page.waitForTimeout(2000)
await context.close()
