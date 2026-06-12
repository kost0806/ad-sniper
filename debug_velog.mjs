import { chromium } from 'playwright'

// Load WITHOUT extension first — inspect ad DOM structure
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--ignore-certificate-errors'],
})

const page = await browser.newPage()
page.on('console', msg => {
  if (['error', 'warn'].includes(msg.type())) console.log(`[${msg.type().toUpperCase()}]`, msg.text())
})

const url = 'https://velog.io/@whereami2048/%EA%B3%84%EC%B8%B5-%EB%B3%84-%EB%8C%80%ED%91%9C-%ED%94%84%EB%A1%9C%ED%86%A0%EC%BD%9C%EA%B3%BC-%EA%B5%AC%EC%84%B1-%EA%B8%B0%EA%B8%B0'
console.log('Navigating...')

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
await page.waitForTimeout(3000)

// 1. Find all iframes
const iframes = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('iframe')).map(f => ({
    src: f.src,
    id: f.id,
    className: typeof f.className === 'string' ? f.className.slice(0, 80) : '',
    width: f.offsetWidth,
    height: f.offsetHeight,
    visible: f.offsetWidth > 0 && f.offsetHeight > 0,
    parentId: f.parentElement?.id,
    parentClass: typeof f.parentElement?.className === 'string' ? f.parentElement.className.slice(0, 80) : '',
  }))
})
console.log('\n=== IFRAMES ===')
iframes.forEach(f => console.log(JSON.stringify(f)))

// 2. Find ad-like containers
const adContainers = await page.evaluate(() => {
  const results = []
  document.querySelectorAll('ins, [id*="ad"], [class*="ad"], [id*="adsense"], [id*="kakao"]').forEach(el => {
    if (el.tagName === 'HTML' || el.tagName === 'BODY') return
    results.push({
      tag: el.tagName,
      id: el.id,
      className: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
      visible: el.offsetWidth > 0 && el.offsetHeight > 0,
      hasIframe: !!el.querySelector('iframe'),
      iframeSrc: el.querySelector('iframe')?.src || null,
      outerSlice: el.outerHTML.slice(0, 120),
    })
  })
  return results.slice(0, 20)
})
console.log('\n=== AD-LIKE CONTAINERS ===')
adContainers.forEach(e => console.log(JSON.stringify(e)))

// 3. Simulate what getFingerprint would do for each candidate
const fingerprintSim = await page.evaluate(() => {
  const results = []
  document.querySelectorAll('ins, [id*="ad"], [class*="ad"]').forEach(el => {
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return
    if (el.tagName === 'HTML' || el.tagName === 'BODY') return

    const iframe = el.tagName === 'IFRAME' ? el : el.querySelector('iframe[src]')
    if (iframe && iframe.src) {
      try {
        const url = new URL(iframe.src)
        if (url.hostname !== location.hostname) {
          results.push({ el: el.tagName + '#' + el.id, fp: { type: 'hostname', value: url.hostname } })
          return
        }
      } catch (_) {}
    }
    if (el.id && /ad|banner|sponsor/i.test(el.id)) {
      results.push({ el: el.tagName + '#' + el.id, fp: { type: 'id', value: el.id } })
      return
    }
    results.push({ el: el.tagName, fp: { type: 'selector', value: 'no-stable-id' } })
  })
  return results.slice(0, 15)
})
console.log('\n=== FINGERPRINT SIMULATION ===')
fingerprintSim.forEach(e => console.log(JSON.stringify(e)))

// 4. Check for cross-origin ad frames (key diagnostic)
console.log('\n=== CROSS-ORIGIN AD IFRAMES ===')
iframes.filter(f => {
  try { return new URL(f.src).hostname !== 'velog.io' } catch { return false }
}).forEach(f => console.log(JSON.stringify(f)))

// 5. Check if ads are in shadow DOM
const shadowCheck = await page.evaluate(() => {
  let count = 0
  document.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot) count++
  })
  return count
})
console.log('\n=== Shadow DOM elements:', shadowCheck)

await browser.close()
console.log('\nDone.')
