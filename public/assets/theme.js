// Thème de l'interface : « auto » (réglage de l'appareil), sombre ou clair.
// Chargé de façon bloquante dans <head> pour appliquer le thème avant l'affichage (pas de flash).
// Préférence gardée sur l'appareil (localStorage marches:theme) ; aucune donnée envoyée.
(function () {
  var KEY = 'marches:theme';
  var MODES = ['auto', 'dark', 'light'];
  var BG = { dark: '#0b0f14', light: '#f4f6f9' };
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); return MODES.indexOf(v) >= 0 ? v : 'auto'; } catch (e) { return 'auto'; }
  }
  var pref = read();
  function resolved() { return pref === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : pref; }
  function apply() {
    var r = resolved(), root = document.documentElement;
    if (root.dataset.theme === r && root.dataset.themePref === pref) return;
    root.dataset.theme = r;
    root.dataset.themePref = pref;
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', BG[r]);
    var cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.setAttribute('content', r);
    window.dispatchEvent(new CustomEvent('marches-theme', { detail: { theme: r, pref: pref } }));
  }
  function set(v) {
    pref = MODES.indexOf(v) >= 0 ? v : 'auto';
    try { if (pref === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* stockage indisponible */ }
    apply();
  }
  if (mq) {
    var onChange = function () { if (pref === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  window.addEventListener('storage', function (e) { if (e.key === KEY) { pref = read(); apply(); } });
  apply();
  // Taille du texte choisie dans l'app (zoom de l'interface), appliquée avant l'affichage.
  try { var z = JSON.parse(localStorage.getItem('marches:textScale')); if ([0.9, 1.15, 1.3].indexOf(z) >= 0) document.documentElement.style.zoom = String(z); } catch (e) { /* défaut */ }
  window.marchesTheme = { modes: MODES, pref: function () { return pref; }, resolved: resolved, set: set };
})();
