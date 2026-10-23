// Theme toggle (remembered per browser), copy buttons, guide TOC highlight.
(function () {
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem('sw-theme');
    if (saved) root.setAttribute('data-theme', saved);
  } catch (e) { /* storage blocked */ }

  var toggle = document.getElementById('theme');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var dark = root.getAttribute('data-theme')
        ? root.getAttribute('data-theme') === 'dark'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('sw-theme', next); } catch (e) { /* ignore */ }
    });
  }

  document.querySelectorAll('.copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-copy'));
      if (!el || !navigator.clipboard) return;
      navigator.clipboard.writeText(el.textContent.trim()).then(function () {
        btn.textContent = 'copied';
        setTimeout(function () { btn.textContent = 'copy'; }, 1400);
      });
    });
  });

  var links = document.querySelectorAll('.toc a[href^="#"]');
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('active'); });
        var a = byId[e.target.id];
        if (a) a.classList.add('active');
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }
})();
