(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const STORAGE_KEY = "blockedFingerprints";
const DISABLED_HOSTS_KEY = "disabledHosts";
async function getBlockedFingerprints() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}
async function removeFingerprint(fp) {
  const list = await getBlockedFingerprints();
  const key = serializeFingerprint(fp);
  const filtered = list.filter((f) => serializeFingerprint(f) !== key);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}
async function clearAll() {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}
async function getDisabledHosts() {
  const result = await chrome.storage.local.get(DISABLED_HOSTS_KEY);
  return result[DISABLED_HOSTS_KEY] || [];
}
async function toggleHost(host) {
  const list = await getDisabledHosts();
  const idx = list.indexOf(host);
  if (idx === -1) list.push(host);
  else list.splice(idx, 1);
  await chrome.storage.local.set({ [DISABLED_HOSTS_KEY]: list });
  return idx === -1;
}
function serializeFingerprint(fp) {
  return `${fp.type}:${fp.value}`;
}
export {
  getDisabledHosts as a,
  clearAll as c,
  getBlockedFingerprints as g,
  removeFingerprint as r,
  toggleHost as t
};
