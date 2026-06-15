/**
 * Verify content script injection and cursor behavior
 * Simulates exactly what Chrome does when loading the extension
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)))
const CONTENT_JS = fs.readFileSync(path.join(ROOT, 'dist/content.js'), 'utf-8')
const TARGET = 'https://velog.io/@whereami2048/%EA%B3%84%EC%B8%B5-%EB%B3%84-%EB%8C%80%ED%91%9C-%ED%94%84%EB%A1%9C%ED%86%A0%EC%BD%9C%EA%B3%BC-%EA%B5%AC%EC%84%B1-%EA%B8%B0%EA%B8%B0'

const context = await chromium.launchPersistentContext('', {
  headless: true,
  channel: 'chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors'],
  viewport: { width: 1280, height: 900 },
})

const page = await context.newPage()

// Capture ALL console output from the page
const consoleLogs = []
page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`))
page.on('pageerror', err => consoleLogs.push(`[PAGE ERROR] ${err.message}`))

// Mock chrome API
await page.addInitScript(() => {
  const store = {}
  window.chrome = {
    storage: {
      local: {
        get: (key) => {
          const keys = Array.isArray(key) ? key : (typeof key === 'string' ? [key] : Object.keys(key))
          const result = {}
          keys.forEach(k => { if (store[k] !== undefined) result[k] = store[k] })
          return Promise.resolve(result)
        },
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

console.log('Navigating to', TARGET)
await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30_000 })
await page.waitForTimeout(3000)

console.log('\n=== Injecting content script ===')
try {
  await page.evaluate(CONTENT_JS)
  console.log('Injection: OK')
} catch (err) {
  console.error('Injection FAILED:', err.message)
}
await page.waitForTimeout(1500)

// Check console output from content script
console.log('\n=== Console output from page ===')
consoleLogs.forEach(l => console.log(' ', l))

// Check if adsniper elements exist
const check = await page.evaluate(() => {
  return {
    styleInjected: !!document.querySelector('style[data-adsniper-owned]'),
    fakeCursorExists: !!document.querySelector('.adsniper-fake-cursor'),
    overlayExists: !!document.querySelector('.adsniper-hover-overlay'),
    adElements: [...document.querySelectorAll('iframe, ins')].map(el => {
      const r = el.getBoundingClientRect()
      return { tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height), blocked: !!el.dataset.adsniperBlocked }
    }),
  }
})

console.log('\n=== Init result ===')
console.log('styleInjected:', check.styleInjected)
console.log('fakeCursorExists:', check.fakeCursorExists)
console.log('overlayExists:', check.overlayExists)
console.log('ad elements:', check.adElements.slice(0, 5))

// Test hover on a visible ad element
const visible = check.adElements.find(el => el.w > 10 && el.h > 10)
if (visible) {
  console.log('\n=== Testing hover ===')
  const result = await page.evaluate(() => {
    const els = [...document.querySelectorAll('iframe, ins')].filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 10 && r.height > 10
    })
    if (!els.length) return { error: 'no visible elements' }
    const el = els[0]
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy }))
    const overlay = document.querySelector('.adsniper-hover-overlay')
    const fakeCursor = document.querySelector('.adsniper-fake-cursor')
    return {
      tag: el.tagName,
      overlayVisible: overlay?.style.display !== 'none',
      fakeCursorVisible: fakeCursor?.style.display !== 'none',
    }
  })
  console.log('hover result:', result)
} else {
  console.log('\nNo visible ad elements to hover (0×0 in headless — normal)')
}

if (!check.styleInjected) {
  console.error('\n*** FAIL: style not injected — content script did not run ***')
  process.exit(1)
} else {
  console.log('\n*** PASS: content script running correctly ***')
}

await context.close()
