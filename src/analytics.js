/* Abaku GA4: opt-in only, using the same GA4 property as iOS Hub.
   No Google Analytics request is made before explicit consent. */
(() => {
  'use strict';
  const MEASUREMENT_ID = 'G-SZTERTRTCE';
  const CONSENT_KEY = 'abaku-analytics-consent-v1';
  const TITLE = String(document.querySelector('meta[name="analytics-page-title"]')?.content || document.title || 'Číselná aréna').trim();
  // Stable page paths distinguish /Abaku/ from other sites in the same GA4
  // property without sending potentially sensitive URL query parameters.
  const LOCATION = window.location.origin + window.location.pathname;
  let loaded = false;
  let banner = null;

  function readConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
  }
  function saveConsent(choice) {
    try { localStorage.setItem(CONSENT_KEY, choice); } catch {}
  }
  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }
  function enableAnalytics() {
    if (loaded || document.querySelector('script[data-abaku-analytics]')) return;
    loaded = true;
    window.gtag = gtag;
    gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
      page_title: TITLE,
      page_location: LOCATION,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
    const script = document.createElement('script');
    script.async = true;
    script.dataset.abakuAnalytics = 'true';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.append(script);
  }
  function disableAnalytics() {
    if (window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
    }
    // Removing a previous GA cookie makes a withdrawn consent effective.
    // Both root and /Abaku/ are cleared; local Google login is untouched.
    for (const name of ['_ga', '_ga_SZTERTRTCE']) {
      for (const path of ['/', '/Abaku/']) {
        document.cookie = name + '=; Max-Age=0; path=' + path + '; SameSite=Lax';
      }
    }
  }
  function closeBanner() {
    if (banner) { banner.remove(); banner = null; }
  }
  function choose(choice) {
    saveConsent(choice);
    if (choice === 'granted') enableAnalytics();
    else disableAnalytics();
    closeBanner();
  }
  function showBanner(force = false) {
    if (banner || (!force && readConsent() !== null)) return;
    banner = document.createElement('section');
    banner.className = 'abaku-consent';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Nastavení analytických cookies');

    const copy = document.createElement('div');
    copy.className = 'abaku-consent-copy';
    const heading = document.createElement('strong');
    heading.textContent = 'Analytické cookies';
    const description = document.createElement('span');
    description.textContent = 'Číselná aréna používá Google Analytics jen s tvým souhlasem. Bez souhlasu se analytika nenačítá.';
    copy.append(heading, description);
    const actions = document.createElement('div');
    actions.className = 'abaku-consent-actions';
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.textContent = 'Přijmout analytiku';
    accept.className = 'abaku-consent-accept';
    accept.addEventListener('click', () => choose('granted'));
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = 'Odmítnout';
    reject.className = 'abaku-consent-reject';
    reject.addEventListener('click', () => choose('denied'));
    const details = document.createElement('a');
    details.textContent = 'Soukromí a cookies';
    details.href = './privacy.html';
    actions.append(accept, reject, details);
    banner.append(copy, actions);
    document.body.append(banner);
  }
  function init() {
    for (const button of document.querySelectorAll('[data-cookie-settings]')) {
      button.addEventListener('click', event => {
        event.preventDefault();
        // Consent controls live outside modal dialogs; close settings first
        // so the user can interact with the consent banner.
        const dialog = button.closest('dialog');
        if (dialog?.open) dialog.close();
        showBanner(true);
      });
    }
    const consent = readConsent();
    if (consent === 'granted') enableAnalytics();
    else if (consent !== 'denied') showBanner();
  }
  // Only on-site consent is stored. Never log Google ID tokens, nicknames,
  // friend IDs, game boards, chat text or account statistics to GA4.
  window.abakuAnalytics = Object.freeze({
    consent: readConsent,
    showSettings: () => showBanner(true)
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();