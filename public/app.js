'use strict';
(function () {
  // Light / dark mode
  var toggle = document.getElementById('themeToggle');
  function current() { return document.documentElement.dataset.theme || 'light'; }
  function paint() {
    if (toggle) toggle.textContent = current() === 'dark' ? '☀️' : '🌙';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', current() === 'dark' ? '#0d1620' : '#0a4a8a');
  }
  paint();
  if (toggle) toggle.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pt-theme', next); } catch (e) {}
    paint();
  });

  // Cookie notice
  var banner = document.getElementById('cookieBanner');
  var accept = document.getElementById('cookieAccept');
  function hasAccepted() {
    try { return document.cookie.split(';').some(function (c) { return c.trim().indexOf('pt_cookies=1') === 0; }); }
    catch (e) { return true; }
  }
  if (banner && !hasAccepted()) banner.hidden = false;
  if (accept) accept.addEventListener('click', function () {
    document.cookie = 'pt_cookies=1; Path=/; Max-Age=31536000; SameSite=Lax';
    if (banner) banner.hidden = true;
  });

  // Copy booking code
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    function done() {
      var old = btn.textContent;
      btn.textContent = '✓';
      setTimeout(function () { btn.textContent = old; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {});
    } else {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (err) {}
      document.body.removeChild(ta);
    }
  });

  // Confirm before leaving a request while unconfirmed (gentle nudge)
  var step2 = document.querySelector('.step.locked');
  if (step2) step2.setAttribute('title', 'Waiting for owner confirmation');
}());
