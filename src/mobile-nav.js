(function () {
  'use strict';

  // Why this exists: every page hides its navigation below 768px with
  // "hidden md:flex" and offers nothing in its place. On a phone the header
  // was a logo and a button, and the only route to Our Story or Contact was
  // the footer, four screens down.
  //
  // Why a script rather than markup in eleven files: the pages carry slightly
  // different link sets and different relative paths (the home page links to
  // "#shop", the others to "./index.html#shop"). Reading the links that are
  // already in the header keeps the phone menu identical to the desktop one
  // by construction, including on any page added later.

  var BREAKPOINT = 767;

  function init() {
    var header = document.querySelector('header');
    if (!header) return;

    var nav = header.querySelector('nav');
    if (!nav) return;

    var links = [].slice.call(nav.querySelectorAll('a'));
    if (!links.length) return;

    // The action on the right differs per page -- "Cart (n)" on the shop,
    // "Back to Shop" elsewhere. It stays in the bar; only the nav moves.
    injectStyles();

    var panel = document.createElement('div');
    panel.id = 'mp-mobile-nav';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Menu');
    panel.hidden = true;

    var list = document.createElement('nav');
    list.className = 'mp-mn-list';
    links.forEach(function (a) {
      var copy = document.createElement('a');
      copy.href = a.getAttribute('href');
      copy.textContent = (a.textContent || '').trim();
      list.appendChild(copy);
    });

    // Two destinations that matter on a phone and are otherwise buried.
    var extra = document.createElement('div');
    extra.className = 'mp-mn-extra';
    extra.innerHTML =
      '<a href="./faq.html">FAQ</a>' +
      '<a href="./shipping.html">Shipping</a>';
    list.appendChild(extra);

    panel.appendChild(list);

    var button = document.createElement('button');
    button.id = 'mp-mn-toggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Open menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span></span><span></span><span></span>';

    // Sits to the left of whatever the page already has on the right.
    var bar = nav.parentNode;
    bar.insertBefore(button, nav.nextSibling);
    document.body.appendChild(panel);

    function open() {
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      button.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      var first = panel.querySelector('a');
      if (first) first.focus();
    }

    function close() {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      button.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    button.addEventListener('click', function () {
      if (panel.hidden) { open(); } else { close(); }
    });

    panel.addEventListener('click', function (e) {
      // Any link closes it; so does the backdrop, which is the panel itself
      // outside the list.
      if (e.target === panel || e.target.tagName === 'A') close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) close();
    });

    // Rotating a phone into landscape can cross the breakpoint. Leaving the
    // panel open there would cover a page whose own navigation is back.
    window.addEventListener('resize', function () {
      if (window.innerWidth > BREAKPOINT && !panel.hidden) close();
    });
  }

  function injectStyles() {
    if (document.getElementById('mp-mn-style')) return;
    var css = document.createElement('style');
    css.id = 'mp-mn-style';
    css.textContent = [
      '#mp-mn-toggle{display:none;background:none;border:0;padding:8px;margin-left:auto;',
      'margin-right:12px;cursor:pointer;width:40px;height:40px;flex-direction:column;',
      'justify-content:center;gap:5px;align-items:center;}',
      '#mp-mn-toggle span{display:block;width:22px;height:2px;background:#1C2541;',
      'border-radius:2px;transition:transform .18s ease,opacity .18s ease;}',
      '#mp-mn-toggle.is-open span:nth-child(1){transform:translateY(7px) rotate(45deg);}',
      '#mp-mn-toggle.is-open span:nth-child(2){opacity:0;}',
      '#mp-mn-toggle.is-open span:nth-child(3){transform:translateY(-7px) rotate(-45deg);}',
      '@media (max-width:767px){#mp-mn-toggle{display:flex;}}',
      // The panel starts below the sticky header so the logo and the close
      // control stay visible while it is open.
      '#mp-mobile-nav{position:fixed;inset:72px 0 0 0;z-index:2147482000;',
      'background:rgba(16,24,46,.45);backdrop-filter:blur(2px);}',
      '#mp-mobile-nav .mp-mn-list{background:#fff;border-top:1px solid #ECE7DA;',
      'padding:8px 0 16px;box-shadow:0 18px 40px rgba(0,0,0,.18);}',
      '#mp-mobile-nav a{display:block;padding:15px 24px;font-size:16px;font-weight:600;',
      'color:#1C2541;text-decoration:none;border-bottom:1px solid #F3F0E8;',
      "font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;}",
      '#mp-mobile-nav a:last-child{border-bottom:0;}',
      '#mp-mobile-nav a:active{background:#FDFBF5;}',
      '#mp-mobile-nav .mp-mn-extra a{font-weight:500;color:#4B5563;font-size:15px;}',
      '@media (min-width:768px){#mp-mobile-nav{display:none;}}'
    ].join('');
    document.head.appendChild(css);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
