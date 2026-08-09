/**
 * Cookie consent — Google Consent Mode v2 for Google Analytics 4.
 *
 * The shop needs its analytics, so this is deliberately NOT a blunt on/off
 * switch. It is Google's own consent-mode arrangement:
 *
 *   Before a choice is made  -> gtag loads, but `analytics_storage` is DENIED.
 *                               No cookie is written, no client ID is kept.
 *                               GA still receives a cookieless ping, which is
 *                               what lets Google model the visitors it cannot
 *                               identify, so the reports do not simply lose
 *                               everyone who ignores the banner.
 *   Accept                   -> analytics_storage granted, normal GA4 from
 *                               that moment on, choice remembered.
 *   Decline                  -> stays denied for good, and the _ga cookies
 *                               already on the device are deleted.
 *
 * Ad storage, ad user data and ad personalisation are denied permanently —
 * the shop runs no advertising and asking for it would be dishonest.
 *
 * Include on every page, before </body>:
 *   <script src="./cookie-consent.js?v=20260809"></script>
 *
 * The privacy policy links to window.openCookieSettings() so a visitor can
 * change their mind later.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'mp-cookie-consent';   // 'granted' | 'denied'
  var GA_ID = 'G-4EY5857B0X';

  function read() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function write(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* private mode */ }
  }

  // ---------------------------------------------------------------------
  // gtag bootstrap. The consent default MUST be pushed before the GA library
  // is requested, otherwise the first hit is sent under the old rules.
  // ---------------------------------------------------------------------
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  var initialChoice = read();

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: initialChoice === 'granted' ? 'granted' : 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });

  gtag('js', new Date());
  gtag('config', GA_ID, {
    anonymize_ip: true,
    // Without consent GA has no cookie to read, so it cannot stitch page
    // views into a session on its own. url_passthrough keeps campaign
    // attribution alive across an internal click in that state.
    url_passthrough: true
  });

  (function loadGtagLibrary() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    (document.head || document.documentElement).appendChild(s);
  })();

  /**
   * Clears the GA cookies this domain can see. Google sets _ga and
   * _ga_<container> on the registrable domain; removing them is what makes
   * "withdraw consent" mean something rather than just stopping new hits.
   */
  function clearAnalyticsCookies() {
    var host = location.hostname.replace(/^www\./, '');
    document.cookie.split(';').forEach(function (raw) {
      var name = raw.split('=')[0].trim();
      if (name.indexOf('_ga') !== 0 && name.indexOf('_gid') !== 0) return;
      ['/', location.pathname].forEach(function (path) {
        [host, '.' + host, location.hostname].forEach(function (domain) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + path + '; domain=' + domain;
        });
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + path;
      });
    });
  }

  // ---------------------------------------------------------------------
  // Banner
  // ---------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('mp-cookie-style')) return;
    var css = document.createElement('style');
    css.id = 'mp-cookie-style';
    css.textContent = [
      '#mp-cookie-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;',
      'background:#10182E;color:#fff;border-radius:18px;padding:20px 22px;',
      'box-shadow:0 20px 50px rgba(0,0,0,.35);max-width:760px;margin:0 auto;',
      "font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;",
      'display:flex;gap:20px;align-items:center;flex-wrap:wrap;}',
      '#mp-cookie-banner p{margin:0;font-size:13.5px;line-height:1.55;color:rgba(255,255,255,.78);flex:1 1 320px;}',
      '#mp-cookie-banner strong{display:block;color:#fff;font-size:15px;margin-bottom:4px;font-weight:700;}',
      '#mp-cookie-banner a{color:#C9A961;text-decoration:underline;}',
      '#mp-cookie-actions{display:flex;gap:10px;flex:0 0 auto;}',
      '#mp-cookie-banner button{font:inherit;font-size:13.5px;font-weight:600;border-radius:999px;',
      'padding:11px 22px;cursor:pointer;border:1px solid transparent;transition:background .15s,border-color .15s;white-space:nowrap;}',
      '#mp-cookie-accept{background:#C9A961;color:#1C2541;}',
      '#mp-cookie-accept:hover{background:#D9BC7C;}',
      '#mp-cookie-decline{background:transparent;color:#fff;border-color:rgba(255,255,255,.4);}',
      '#mp-cookie-decline:hover{border-color:#fff;}',
      '@media (max-width:560px){#mp-cookie-banner{padding:18px;}#mp-cookie-actions{width:100%;}',
      '#mp-cookie-banner button{flex:1;padding:12px 10px;}}',
      // Keep the banner clear of the chat launcher in the same corner.
      '@media (min-width:900px){#mp-cookie-banner{right:110px;}}'
    ].join('');
    document.head.appendChild(css);
  }

  function hide() {
    var el = document.getElementById('mp-cookie-banner');
    if (el) el.remove();
  }

  function show() {
    if (document.getElementById('mp-cookie-banner')) return;
    injectStyles();

    var bar = document.createElement('div');
    bar.id = 'mp-cookie-banner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-label', 'Cookie choice');
    bar.innerHTML =
      '<p><strong>May we count your visit?</strong>' +
      'We use Google Analytics to see which pages people find useful. Saying yes lets it remember ' +
      'your device with a cookie; saying no means nothing is stored on your device at all. ' +
      'Either way the shop and your cart work the same. ' +
      '<a href="./privacy.html">Privacy Policy</a></p>' +
      '<div id="mp-cookie-actions">' +
      '<button type="button" id="mp-cookie-decline">Decline</button>' +
      '<button type="button" id="mp-cookie-accept">Accept</button>' +
      '</div>';

    document.body.appendChild(bar);

    document.getElementById('mp-cookie-accept').addEventListener('click', function () {
      write('granted');
      hide();
      gtag('consent', 'update', { analytics_storage: 'granted' });
    });

    document.getElementById('mp-cookie-decline').addEventListener('click', function () {
      write('denied');
      hide();
      gtag('consent', 'update', { analytics_storage: 'denied' });
      clearAnalyticsCookies();
    });
  }

  // Lets the privacy policy offer a way back in after a decision was made.
  window.openCookieSettings = function () {
    hide();
    show();
  };

  function start() {
    if (read()) return;   // already decided, in either direction
    show();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
