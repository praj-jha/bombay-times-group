// Bombay Times Group — progressive enhancements. The site works fully without this file.
(function () {
  'use strict';
  var root = document.documentElement;
  var TZ = 'Asia/Kolkata';

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  // ---- Theme ----
  function currentTheme() {
    var set = root.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('btg-theme', next); } catch (e) {}
  }

  // ---- Date & IST clock ----
  var dateEl = document.getElementById('today-date');
  var clockEl = document.getElementById('ist-clock');
  function tick() {
    var now = new Date();
    try {
      if (dateEl) dateEl.textContent = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
      if (clockEl) clockEl.textContent = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(now).toUpperCase() + ' IST';
    } catch (e) {}
  }
  tick(); setInterval(tick, 30000);

  // ---- Live Mumbai weather (Open-Meteo, no key) ----
  var weatherEl = document.getElementById('weather');
  if (weatherEl && window.fetch) {
    var codes = { 0: 'Clear skies', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
    fetch('https://api.open-meteo.com/v1/forecast?latitude=19.076&longitude=72.8777&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FKolkata&forecast_days=1')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.current) return;
        var txt = 'Mumbai ' + Math.round(d.current.temperature_2m) + '°C · ' + (codes[d.current.weather_code] || 'Weather');
        if (d.daily) txt += ', ' + Math.round(d.daily.temperature_2m_min[0]) + '–' + Math.round(d.daily.temperature_2m_max[0]) + '°C today';
        weatherEl.textContent = txt;
      })
      .catch(function () {});
  }

  // ---- Search overlay ----
  var overlay = document.getElementById('search-overlay');
  function openSearch(open) {
    if (!overlay) return;
    overlay.hidden = !open;
    if (open) { var i = overlay.querySelector('input'); if (i) i.focus(); }
  }
  if (overlay) overlay.addEventListener('click', function (e) { if (e.target === overlay) openSearch(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') openSearch(false);
    if (e.key === '/' && !/input|textarea/i.test((document.activeElement || {}).tagName)) { e.preventDefault(); openSearch(true); }
  });

  // ---- Delegated actions ----
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'theme') toggleTheme();
    else if (action === 'search') openSearch(true);
    else if (action === 'search-close') openSearch(false);
    else if (action === 'copy') {
      var url = el.getAttribute('data-url');
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) { navigator.share({ title: document.title, url: url }).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .then(function () { toast('Link copied'); }, function () { prompt('Copy this link:', url); });
    }
  });

  // ---- Newsletter: posts to the configured provider, else opens an email draft ----
  document.querySelectorAll('.nl-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (form.getAttribute('action') && form.getAttribute('action') !== '#') return;
      e.preventDefault();
      var email = form.querySelector('input[type=email]').value;
      var to = form.getAttribute('data-fallback');
      location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Subscribe: The Morning Briefing') + '&body=' + encodeURIComponent('Please add ' + email + ' to The Morning Briefing.');
    });
  });

  // ---- Search page ----
  var results = document.getElementById('search-results');
  if (results) {
    var q = new URLSearchParams(location.search).get('q') || '';
    var input = document.getElementById('sp-q');
    if (input) input.value = q;
    if (q.trim()) {
      fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (items) {
        var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
        var scored = items.map(function (it) {
          var title = it.t.toLowerCase(), hay = (it.t + ' ' + it.d + ' ' + it.c + ' ' + it.k).toLowerCase(), s = 0;
          terms.forEach(function (t) { if (hay.indexOf(t) > -1) s += 1; if (title.indexOf(t) > -1) s += 2; });
          return { it: it, s: s };
        }).filter(function (x) { return x.s >= terms.length; }).sort(function (a, b) { return b.s - a.s; });
        var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
        results.innerHTML = '<p class="meta">' + scored.length + ' result' + (scored.length === 1 ? '' : 's') + ' for “' + esc(q) + '”</p>' +
          scored.slice(0, 50).map(function (x) {
            var it = x.it;
            return '<div class="sr-item"><div><div class="kicker">' + esc(it.c) + ' · ' + esc(it.p) + '</div><h2><a href="' + it.u + '">' + esc(it.t) + '</a></h2><p>' + esc(it.d) + '</p></div>' + (it.i ? '<a href="' + it.u + '" tabindex="-1" aria-hidden="true"><img src="' + it.i + '" alt="" loading="lazy" width="140" height="79"></a>' : '') + '</div>';
          }).join('');
      });
    }
  }
})();
