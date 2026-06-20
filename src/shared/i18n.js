const messages = {
  ko: {
    menu_title: '🎯 Ad Sniper',
    block_ad: '🚫 광고 차단하기',
    view_ad: '광고 보기',
    ad_blocked: '광고가 차단되었습니다',
    unblock: '다시 보기',
    popup_subtitle: '보기 싫은 광고만 차단',
    popup_this_site: '이 사이트',
    popup_blocked_suffix: '개 광고 차단됨',
    popup_manage: '차단 목록 관리',
    popup_hint: '광고 위에 마우스를 올리고 <strong>클릭</strong>하여 차단하세요.',
    popup_unsupported: '지원되지 않는 페이지',
    options_page_title: 'Ad Sniper — 차단 목록',
    options_title: '🚫 Ad Sniper — 차단 목록',
    options_desc: '우클릭으로 차단한 광고 패턴 목록입니다.',
    options_count: (n) => `${n}개 차단 중`,
    options_reset: '전체 초기화',
    options_empty: '차단된 광고가 없습니다.',
    options_delete: '삭제',
    options_delete_confirm: '모든 차단 패턴을 삭제할까요?',
    fp_type_hostname: '도메인 차단',
    fp_type_id: 'ID 차단',
    fp_type_selector: '선택자 차단',
  },
  en: {
    menu_title: '🎯 Ad Sniper',
    block_ad: '🚫 Block this ad',
    view_ad: 'View ad',
    ad_blocked: 'Ad blocked',
    unblock: 'Show again',
    popup_subtitle: 'Block only unwanted ads',
    popup_this_site: 'This site',
    popup_blocked_suffix: ' ads blocked',
    popup_manage: 'Manage blocklist',
    popup_hint: 'Hover over an ad and <strong>click</strong> to block it.',
    popup_unsupported: 'Unsupported page',
    options_page_title: 'Ad Sniper — Blocklist',
    options_title: '🚫 Ad Sniper — Blocklist',
    options_desc: 'Ad patterns you have blocked.',
    options_count: (n) => `${n} blocked`,
    options_reset: 'Reset all',
    options_empty: 'No blocked ads.',
    options_delete: 'Delete',
    options_delete_confirm: 'Delete all blocked patterns?',
    fp_type_hostname: 'Domain block',
    fp_type_id: 'ID block',
    fp_type_selector: 'Selector block',
  },
}

const lang = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()?.startsWith('ko'))
  ? 'ko'
  : 'en'

export const t = (key) => messages[lang][key] ?? messages['en'][key] ?? key
export const currentLang = lang
