// Confort : bandeau défilant des favoris, visite guidée du premier lancement, état de la connexion (hors ligne).
// Préférences gardées sur l'appareil (marches:ticker, marches:tourDone) ; aucune donnée envoyée.

export function createComfort(ctx) {
  const { t, esc, store } = ctx;

  /* ---------- Bandeau défilant des cours des favoris ---------- */
  const tickerOn = () => store.get('ticker') !== false; // activé par défaut, désactivable
  let tickerKeys = '';
  function renderTicker() {
    const box = document.getElementById('ticker');
    if (!box) return;
    const items = tickerOn() ? ctx.tickerItems().slice(0, 20) : [];
    box.hidden = !items.length;
    if (!items.length) { tickerKeys = ''; box.innerHTML = ''; return; }
    const keys = items.map((x) => x.key).join('|');
    const one = (x) => `<span class="tk-i" data-k="${esc(x.key)}"><b>${esc(x.label)}</b> <span class="tk-p">${x.price}</span> <span class="tk-c ${x.cls}">${x.pct}</span></span>`;
    if (keys !== tickerKeys) {
      tickerKeys = keys;
      // Deux copies à la suite : la boucle de défilement est continue (−50 % = une copie).
      box.innerHTML = `<div class="tk-track" style="--tk-dur:${Math.max(20, items.length * 5)}s"><div class="tk-set">${items.map(one).join('')}</div><div class="tk-set" aria-hidden="true">${items.map(one).join('')}</div></div>`;
      box.setAttribute('aria-label', t('tk.label'));
      return;
    }
    // Mêmes favoris : on met à jour les cours sans recréer le bandeau (l'animation continue).
    for (const x of items) {
      for (const el of box.querySelectorAll(`.tk-i[data-k="${CSS.escape(x.key)}"]`)) {
        el.querySelector('.tk-p').innerHTML = x.price;
        const c = el.querySelector('.tk-c'); c.innerHTML = x.pct; c.className = `tk-c ${x.cls}`;
      }
    }
  }
  function bindTicker() {
    const box = document.getElementById('ticker');
    box?.addEventListener('click', (e) => { const i = e.target.closest('.tk-i'); if (i) ctx.openKey(i.dataset.k); });
  }
  function setTicker(on) { store.set('ticker', !!on); tickerKeys = ''; renderTicker(); }

  /* ---------- Visite guidée (5 étapes) ---------- */
  const STEPS = [
    { sel: '.tabbar [data-tab="accueil"]', key: 'tour.s1' },
    { sel: '.tabbar [data-tab="crypto"]', key: 'tour.s2' },
    { sel: '.tabbar [data-tab="indices"]', key: 'tour.s3' },
    { sel: '.tabbar [data-tab="favoris"]', key: 'tour.s4' },
    { sel: '.tabbar [data-tab="compte"]', key: 'tour.s5' },
  ];
  let tourEl = null, step = 0, lastFocus = null;
  function startTour() {
    if (tourEl) return;
    step = 0;
    lastFocus = document.activeElement;
    tourEl = document.createElement('div');
    tourEl.className = 'tour';
    tourEl.setAttribute('role', 'dialog');
    tourEl.setAttribute('aria-modal', 'true');
    tourEl.setAttribute('aria-labelledby', 'tour-title');
    document.body.append(tourEl);
    window.addEventListener('resize', drawStep);
    drawStep();
  }
  function drawStep() {
    if (!tourEl) return;
    const s = STEPS[step];
    const target = document.querySelector(s.sel);
    const r = target?.getBoundingClientRect();
    const z = parseFloat(document.documentElement.style.zoom || '1') || 1; // taille du texte (zoom de l'interface)
    const hole = r ? `<div class="tour-hole" style="left:${r.left / z - 4}px;top:${r.top / z - 4}px;width:${r.width / z + 8}px;height:${r.height / z + 8}px"></div>` : '<div class="tour-dim"></div>';
    tourEl.innerHTML = `${hole}<div class="tour-card">
      <p class="tour-step">${t('tour.step', { n: step + 1, m: STEPS.length })}</p>
      <h2 id="tour-title">${esc(t(`${s.key}.t`))}</h2><p>${esc(t(`${s.key}.d`))}</p>
      <div class="snap-actions"><button type="button" class="btn" data-tour="skip">${t(step === STEPS.length - 1 ? 'snap.close' : 'tour.skip')}</button>
        ${step < STEPS.length - 1 ? `<button type="button" class="btn btn-primary" data-tour="next">${t('tour.next')}</button>` : `<button type="button" class="btn btn-primary" data-tour="end">${t('tour.end')}</button>`}</div></div>`;
    tourEl.querySelector('[data-tour="skip"]').addEventListener('click', endTour);
    tourEl.querySelector('[data-tour="next"]')?.addEventListener('click', () => { step++; drawStep(); });
    tourEl.querySelector('[data-tour="end"]')?.addEventListener('click', endTour);
    (tourEl.querySelector('[data-tour="next"]') || tourEl.querySelector('[data-tour="end"]')).focus();
  }
  function endTour() {
    if (!tourEl) return;
    tourEl.remove(); tourEl = null;
    window.removeEventListener('resize', drawStep);
    store.set('tourDone', true);
    lastFocus?.focus?.();
  }
  /** Premier lancement : visite proposée une fois, quand aucun autre écran n'est ouvert. */
  function maybeTour() {
    if (store.get('tourDone')) return;
    setTimeout(() => {
      if (store.get('tourDone') || document.querySelector('.snap:not([hidden]), #chart:not([hidden]), body.tv')) return;
      startTour();
    }, 1200);
  }

  /* ---------- Connexion : hors ligne / rétablie ---------- */
  function bindNetwork() {
    window.addEventListener('offline', () => { ctx.toast(t('off.lost'), 'neg'); ctx.onNetwork(false); });
    window.addEventListener('online', () => { ctx.toast(t('off.back')); ctx.onNetwork(true); });
  }

  return { renderTicker, bindTicker, setTicker, tickerOn, startTour, maybeTour, tourOpen: () => !!tourEl, endTour, bindNetwork };
}
