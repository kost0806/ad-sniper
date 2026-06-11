(function() {
  "use strict";
  const STORAGE_KEY = "blockedFingerprints";
  const DISABLED_HOSTS_KEY = "disabledHosts";
  async function getBlockedFingerprints() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  }
  async function getDisabledHosts() {
    const result = await chrome.storage.local.get(DISABLED_HOSTS_KEY);
    return result[DISABLED_HOSTS_KEY] || [];
  }
  function serializeFingerprint(fp) {
    return `${fp.type}:${fp.value}`;
  }
  function getFingerprint(el) {
    const target = findAdRoot(el);
    const iframe = target.tagName === "IFRAME" ? target : target.querySelector("iframe[src]");
    if (iframe && iframe.src) {
      try {
        const url = new URL(iframe.src);
        if (url.hostname && url.hostname !== location.hostname) {
          return { type: "hostname", value: url.hostname };
        }
      } catch (_) {
      }
    }
    if (target.id && /ad|banner|sponsor/i.test(target.id)) {
      return { type: "id", value: target.id };
    }
    return { type: "selector", value: buildSelector(target) };
  }
  function matchesFingerprint(el, fp) {
    const target = findAdRoot(el);
    if (fp.type === "hostname") {
      const iframe = target.tagName === "IFRAME" ? target : target.querySelector("iframe[src]");
      if (iframe && iframe.src) {
        try {
          return new URL(iframe.src).hostname === fp.value;
        } catch (_) {
        }
      }
      return false;
    }
    if (fp.type === "id") {
      return target.id === fp.value;
    }
    if (fp.type === "selector") {
      try {
        return document.querySelector(fp.value) === target || target.matches(fp.value);
      } catch (_) {
        return false;
      }
    }
    return false;
  }
  function findAdRoot(el) {
    let node = el;
    for (let i = 0; i < 4; i++) {
      if (!node.parentElement || node.parentElement === document.body) break;
      const parent = node.parentElement;
      const pid = parent.id || "";
      const pcls = parent.className || "";
      if (/ad|banner|sponsor|promoted/i.test(pid) || /ad|banner|sponsor|promoted/i.test(pcls)) {
        node = parent;
      } else {
        break;
      }
    }
    return node;
  }
  function buildSelector(el) {
    const parts = [];
    let node = el;
    for (let i = 0; i < 3 && node && node !== document.body; i++) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += `#${CSS.escape(node.id)}`;
      } else if (node.className && typeof node.className === "string") {
        const cls = node.className.trim().split(/\s+/).slice(0, 2).map((c) => `.${CSS.escape(c)}`).join("");
        part += cls;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }
  const SESSION_BLOCKED = /* @__PURE__ */ new Set();
  function hideElement(el) {
    if (!el || el.dataset.adsniperBlocked) return;
    el.style.setProperty("display", "none", "important");
    el.dataset.adsniperBlocked = "true";
  }
  function lockSlot(el) {
    let container = el;
    for (let i = 0; i < 3; i++) {
      if (!container.parentElement || container.parentElement === document.body) break;
      container = container.parentElement;
    }
    container.dataset.adsniperSlotLocked = "true";
    hideElement(container);
  }
  function isLocked(el) {
    let node = el;
    while (node && node !== document.body) {
      if (node.dataset.adsniperSlotLocked === "true") return true;
      node = node.parentElement;
    }
    return false;
  }
  function blockWithFingerprint(el, fp) {
    const key = serializeFingerprint(fp);
    SESSION_BLOCKED.add(key);
    lockSlot(el);
  }
  let blockedFingerprints = [];
  let lastContextTarget = null;
  async function init() {
    const disabledHosts = await getDisabledHosts();
    if (disabledHosts.includes(location.hostname)) return;
    blockedFingerprints = await getBlockedFingerprints();
    blockedFingerprints.forEach((fp) => SESSION_BLOCKED.add(serializeFingerprint(fp)));
    scanAll();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (isLocked(node)) {
            hideElement(node);
            continue;
          }
          checkElement(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  function scanAll() {
    const candidates = document.querySelectorAll('iframe, ins, [id*="ad"], [class*="ad"], [id*="banner"], [class*="banner"]');
    candidates.forEach(checkElement);
  }
  function checkElement(el) {
    if (el.dataset.adsniperBlocked) return;
    for (const fp of blockedFingerprints) {
      if (matchesFingerprint(el, fp)) {
        hideElement(el);
        return;
      }
    }
  }
  document.addEventListener("contextmenu", (e) => {
    lastContextTarget = e.target;
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "BLOCK_TARGET") {
      const el = lastContextTarget;
      if (!el || el === document.body || el === document.documentElement) return;
      const fp = getFingerprint(el);
      blockWithFingerprint(el, fp);
      chrome.runtime.sendMessage({ type: "BLOCK", fingerprint: fp });
      blockedFingerprints.push(fp);
    }
  });
  init();
})();
