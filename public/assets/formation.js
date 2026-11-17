// Page « Formation NAS100 » : progression enregistrée sur l'appareil (marches:formation), modules repliables,
// bouton « Copier » du script Pine, calculatrices du module 6 (taille de position, espérance).
// Aucune donnée envoyée : tout reste dans le navigateur.

const KEY = 'marches:formation';
const lang = document.documentElement.lang.startsWith('zh') ? 'zh' : document.documentElement.lang.startsWith('en') ? 'en' : 'fr';
const T = {
  fr: { progress: '{n} / 7 modules terminés', copied: 'Copié', copy: 'Copier', fail: 'Copie impossible : sélectionne le texte', invalid: 'Renseigne des nombres positifs.',
    size: 'Risque : <b>{amt}</b>. Taille = {amt} ÷ ({stop} × {pv}) = <b>{size}</b> lot(s) ; arrondie à l’inférieur : <b>{down}</b>.',
    exp: 'Espérance : <b>{e}</b> par trade. Sur {n} trades à {amt} de risque : environ <b>{total}</b>, avant frais.' },
  en: { progress: '{n} / 7 modules completed', copied: 'Copied', copy: 'Copy', fail: 'Could not copy: please select the text', invalid: 'Enter positive numbers.',
    size: 'Risk: <b>{amt}</b>. Size = {amt} ÷ ({stop} × {pv}) = <b>{size}</b> lot(s); rounded down: <b>{down}</b>.',
    exp: 'Expectancy: <b>{e}</b> per trade. Over {n} trades risking {amt}: about <b>{total}</b>, before costs.' },
  zh: { progress: '已完成 {n} / 7 个模块', copied: '已复制', copy: '复制', fail: '无法复制：请手动选择文本', invalid: '请输入正数。',
    size: '风险：<b>{amt}</b>。仓位 = {amt} ÷（{stop} × {pv}）= <b>{size}</b> 手；向下取整：<b>{down}</b>。',
    exp: '期望值：每笔 <b>{e}</b>。{n} 笔交易、每笔风险 {amt}：约 <b>{total}</b>（未计费用）。' },
}[lang];
const LOCALE = { fr: 'fr-FR', en: 'en-US', zh: 'zh-CN' }[lang];
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);

/* ---------- Progression ---------- */
function read() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function write(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* stockage indisponible : la page fonctionne sans */ }
}
const boxes = [...document.querySelectorAll('input[data-fk]')];
function syncProgress() {
  const done = boxes.filter((b) => b.hasAttribute('data-mod') && b.checked).length;
  const bar = document.querySelector('[data-fprog-bar]');
  if (bar) bar.value = done;
  const txt = document.querySelector('[data-fprog]');
  if (txt) txt.textContent = fill(T.progress, { n: done });
  for (const b of boxes) if (b.hasAttribute('data-mod')) b.closest('details')?.classList.toggle('is-done', b.checked);
}
{
  const saved = read();
  for (const b of boxes) b.checked = saved[b.dataset.fk] === true;
  syncProgress();
}
document.addEventListener('change', (e) => {
  const b = e.target.closest?.('input[data-fk]');
  if (!b) return;
  const v = read();
  if (b.checked) v[b.dataset.fk] = true; else delete v[b.dataset.fk];
  write(v);
  syncProgress();
});
document.querySelectorAll('[data-freset]').forEach((btn) => btn.addEventListener('click', () => {
  const p = `${btn.dataset.freset}-`;
  const v = read();
  for (const b of boxes) if (b.dataset.fk.startsWith(p)) { b.checked = false; delete v[b.dataset.fk]; }
  write(v);
}));

/* ---------- Modules : ouverture depuis le sommaire ou un lien direct (#m3) ---------- */
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const el = id && document.getElementById(id);
  if (el?.tagName === 'DETAILS') { el.open = true; el.scrollIntoView({ block: 'start' }); }
}
window.addEventListener('hashchange', openFromHash);
openFromHash();

/* ---------- Copier le script Pine ---------- */
document.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
  const code = btn.parentElement.querySelector('code')?.textContent || '';
  try {
    await navigator.clipboard.writeText(code);
    btn.textContent = T.copied;
  } catch {
    const r = document.createRange();
    r.selectNodeContents(btn.parentElement.querySelector('code'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    btn.textContent = T.fail;
  }
  setTimeout(() => { btn.textContent = T.copy; }, 2000);
}));

/* ---------- Calculatrices du module 6 ---------- */
const num = (s) => {
  const v = Number(String(s).replace(/\s| | /g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
};
const fmt = (v, d = 2) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d }).format(v);
const signed = (v, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), d)}`;

function calcSize(form) {
  const g = (k) => num(form.querySelector(`[data-cs="${k}"]`).value);
  const cap = g('cap'), risk = g('risk'), stop = g('stop'), pv = g('pv');
  const out = form.querySelector('[data-out="size"]');
  if (![cap, risk, stop, pv].every((v) => v > 0)) { out.textContent = T.invalid; return; }
  const amt = (cap * risk) / 100;
  const size = amt / (stop * pv);
  const down = Math.floor(size * 10 + 1e-9) / 10; // arrondi à l'inférieur au dixième, comme l'exemple du module (1,25 → 1,2)
  out.innerHTML = fill(T.size, { amt: fmt(amt), stop: fmt(stop), pv: fmt(pv), size: fmt(size, 4), down: fmt(down, 1) });
}
function calcExp(form) {
  const g = (k) => num(form.querySelector(`[data-ce="${k}"]`).value);
  const win = g('win'), gain = g('gain'), loss = g('loss'), n = g('n'), amt = g('amt');
  const out = form.querySelector('[data-out="exp"]');
  if (!(win >= 0 && win <= 100) || ![gain, loss, n, amt].every((v) => v > 0)) { out.textContent = T.invalid; return; }
  const p = win / 100;
  const e = p * gain - (1 - p) * loss;
  out.innerHTML = fill(T.exp, { e: `${signed(e)}R`, n: fmt(n, 0), amt: fmt(amt), total: signed(e * n * amt, 0) });
}
document.querySelectorAll('form[data-calc]').forEach((form) => {
  const run = () => (form.dataset.calc === 'size' ? calcSize(form) : calcExp(form));
  form.addEventListener('input', run);
  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  run();
});
