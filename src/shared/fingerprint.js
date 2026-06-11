/**
 * Computes a stable fingerprint from a DOM element.
 * Priority: iframe src hostname > element id > stable CSS selector
 */
export function getFingerprint(el) {
  // Walk up to find the most meaningful ad container
  const target = findAdRoot(el)

  // 1. iframe with src → use hostname
  const iframe = target.tagName === 'IFRAME' ? target : target.querySelector('iframe[src]')
  if (iframe && iframe.src) {
    try {
      const url = new URL(iframe.src)
      if (url.hostname && url.hostname !== location.hostname) {
        return { type: 'hostname', value: url.hostname }
      }
    } catch (_) {}
  }

  // 2. Element with a stable id containing "ad"
  if (target.id && /ad|banner|sponsor/i.test(target.id)) {
    return { type: 'id', value: target.id }
  }

  // 3. CSS selector path (up to 3 ancestors)
  return { type: 'selector', value: buildSelector(target) }
}

export function matchesFingerprint(el, fp) {
  const target = findAdRoot(el)

  if (fp.type === 'hostname') {
    const iframe = target.tagName === 'IFRAME' ? target : target.querySelector('iframe[src]')
    if (iframe && iframe.src) {
      try {
        return new URL(iframe.src).hostname === fp.value
      } catch (_) {}
    }
    return false
  }

  if (fp.type === 'id') {
    return target.id === fp.value
  }

  if (fp.type === 'selector') {
    try {
      return document.querySelector(fp.value) === target || target.matches(fp.value)
    } catch (_) {
      return false
    }
  }

  return false
}

function findAdRoot(el) {
  // Walk up max 4 levels to find a containing ad wrapper
  let node = el
  for (let i = 0; i < 4; i++) {
    if (!node.parentElement || node.parentElement === document.body) break
    const parent = node.parentElement
    const pid = parent.id || ''
    const pcls = parent.className || ''
    if (/ad|banner|sponsor|promoted/i.test(pid) || /ad|banner|sponsor|promoted/i.test(pcls)) {
      node = parent
    } else {
      break
    }
  }
  return node
}

function buildSelector(el) {
  const parts = []
  let node = el
  for (let i = 0; i < 3 && node && node !== document.body; i++) {
    let part = node.tagName.toLowerCase()
    if (node.id) {
      part += `#${CSS.escape(node.id)}`
    } else if (node.className && typeof node.className === 'string') {
      const cls = node.className.trim().split(/\s+/).slice(0, 2).map(c => `.${CSS.escape(c)}`).join('')
      part += cls
    }
    parts.unshift(part)
    node = node.parentElement
  }
  return parts.join(' > ')
}
