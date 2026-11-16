// Mon portefeuille réel : lignes saisies à la main (actif, quantité, prix moyen d'achat), valorisées aux cours de l'app.
// Aucun lien avec un courtier ; tout reste sur l'appareil (localStorage marches:portfolio). Information, pas un conseil financier.
// Valeur et plus-values en dollars (ou en euros selon le réglage), au taux de change du moment.

const KEY = 'portfolio';
const MAX_LINES = 100;

export function createPortfolio(ctx) {
  const { t, store, esc, isNum } = ctx;
  let pf = load();
  let editId = null;

  function load() {
    const d = store.get(KEY);
    const ok = (h) => h && ['c', 's', 'i', 'm'].includes(h.kind) && typeof h.assetId === 'string' && isNum(h.qty) && h.qty > 0 && isNum(h.cost) && h.cost >= 0;
    return { v: 1, holdings: Array.isArray(d?.holdings) ? d.holdings.filter(ok).slice(0, MAX_LINES) : [] };
  }
  const save = () => store.set(KEY, pf);

  /** Valorisation d'une ligne : cours actuel, valeur et coût en dollars (taux actuel), variation du jour. */
  function value(h) {
    const q = ctx.quote(h);
    const fx = ctx.usdPer(q.ccy || h.ccy);
    const price = isNum(q.price) ? q.price : null;
    const val = price != null && fx != null ? h.qty * price * fx : null;
    const cost = fx != null ? h.qty * h.cost * fx : null;
    const day = val != null && isNum(q.chg) ? val - val / (1 + q.chg / 100) : null;
    return { q, price, val, cost, day, pnl: val != null && cost != null ? val - cost : null };
  }
  const money = (usd) => ctx.money(usd);
  const signed = (v) => (isNum(v) ? `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${ctx.money(Math.abs(v))}` : ctx.ND);
  const cls = (v) => (!isNum(v) || Math.abs(v) < 0.005 ? '' : v > 0 ? 'pos' : 'neg');
  const KIND = { c: 'fav.crypto', s: 'fav.stock', i: 'fav.index', m: 'macro.kind' };

  function render(el) {
    const rows = pf.holdings.map((h) => ({ h, ...value(h) }));
    const valued = rows.filter((r) => r.val != null);
    const total = valued.reduce((s, r) => s + r.val, 0);
    const cost = valued.reduce((s, r) => s + (r.cost ?? 0), 0);
    const day = valued.reduce((s, r) => s + (r.day ?? 0), 0);
    const missing = rows.length - valued.length;
    const byKind = {};
    for (const r of valued) byKind[r.h.kind] = (byKind[r.h.kind] || 0) + r.val;
    const colors = { c: 'var(--warn)', s: 'var(--accent)', i: '#b48cff', m: 'var(--up)' };
    el.innerHTML = `
      <div class="pt-summary card">
        <div class="pt-eq-label">${t('pf.value')}${missing ? ` <span class="pt-note">${t('pf.partial', { n: missing })}</span>` : ''}</div>
        <div class="pt-eq">${rows.length ? money(total) : ctx.ND}</div>
        ${rows.length ? `<div class="pt-perf ${cls(total - cost)}">${signed(total - cost)} (${cost > 0 ? ctx.pct((total / cost - 1) * 100) : ctx.ND}) <span>${t('pf.sinceCost')}</span></div>
        <div class="pt-perf ${cls(day)}">${signed(day)} <span>${t('pf.today')}</span></div>` : ''}
        ${total > 0 ? `<div class="pf-bar" role="img" aria-label="${esc(t('pf.alloc'))}">${Object.entries(byKind).map(([k, v]) => `<i style="width:${(v / total) * 100}%;background:${colors[k]}"></i>`).join('')}</div>
          <div class="pt-bench">${Object.entries(byKind).map(([k, v]) => `<span class="pt-bench-i"><i class="sw" style="background:${colors[k]}"></i>${t(KIND[k])} <b>${ctx.NF1().format((v / total) * 100)}${ctx.pctSign()}</b></span>`).join('')}</div>` : ''}
        <div class="pt-top-actions"><button type="button" class="btn btn-primary" data-pf="add">${t('pf.add')}</button>
          ${rows.length ? `<button type="button" class="btn btn-sm" data-pf="csv">${t('pf.csv')}</button>` : ''}</div>
      </div>
      <h2 class="pt-h">${t('pf.lines')} <span>${rows.length}</span></h2>
      ${rows.length ? `<ul class="pt-list">${rows.sort((a, b) => (b.val ?? -1) - (a.val ?? -1)).map((r) => `<li class="pt-pos">
        <div class="pt-row1">${ctx.logo(r.h, 22)}<strong>${esc(r.h.label)}</strong><span class="pt-badge">${t(KIND[r.h.kind])}</span>
          <span class="pt-pnl ${cls(r.pnl)}">${signed(r.pnl)} <small>${r.cost > 0 && r.pnl != null ? ctx.pct((r.pnl / r.cost) * 100) : ''}</small></span></div>
        <div class="pt-row2">${ctx.qty(r.h.qty)} × ${ctx.price(r.h.cost, r.h.kind, r.q.ccy || r.h.ccy)} → ${t('pt.nowShort')} ${r.price != null ? ctx.price(r.price, r.h.kind, r.q.ccy || r.h.ccy) : ctx.ND}</div>
        <div class="pt-row3">${t('pf.lineValue')} ${r.val != null ? money(r.val) : ctx.ND}${total > 0 && r.val != null ? ` · ${ctx.NF1().format((r.val / total) * 100)}${ctx.pctSign()} ${t('pf.ofTotal')}` : ''}${r.day != null ? ` · <span class="${cls(r.day)}">${signed(r.day)} ${t('pf.todayShort')}</span>` : ''}</div>
        ${r.h.note ? `<div class="pt-notetext">${esc(r.h.note)}</div>` : ''}
        <div class="pt-actions"><button type="button" class="btn btn-sm" data-pf-edit="${esc(r.h.id)}">${t('pf.edit')}</button>
          <button type="button" class="btn btn-sm" data-pf-del="${esc(r.h.id)}">${t('pf.delete')}</button></div></li>`).join('')}</ul>`
        : `<p class="pt-empty">${t('pf.empty')}</p>`}
      <p class="consent-small pt-disc">${t('pf.note')}</p>`;
    el.querySelector('[data-pf="add"]').addEventListener('click', () => openForm(null, el));
    el.querySelector('[data-pf="csv"]')?.addEventListener('click', () => exportCSV(rows));
    el.querySelectorAll('[data-pf-edit]').forEach((b) => b.addEventListener('click', () => openForm(b.dataset.pfEdit, el)));
    el.querySelectorAll('[data-pf-del]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(t('pf.deleteConfirm'))) return;
      pf.holdings = pf.holdings.filter((h) => h.id !== b.dataset.pfDel);
      save(); render(el);
    }));
  }

  /* Fenêtre d'ajout / de modification d'une ligne */
  const dlg = document.createElement('div');
  dlg.className = 'snap'; dlg.id = 'pf-dlg'; dlg.hidden = true;
  dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'pf-title');
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  function close() { dlg.hidden = true; editId = null; document.body.style.overflow = ''; }

  function openForm(id, el) {
    editId = id;
    const cur = id ? pf.holdings.find((h) => h.id === id) : null;
    const list = ctx.assets();
    const opts = (f = '') => {
      const s = f.trim().toLowerCase();
      return list.filter((a) => !s || a.label.toLowerCase().includes(s) || (a.name || '').toLowerCase().includes(s)).slice(0, 150)
        .map((a) => `<option value="${esc(`${a.kind}:${a.assetId}`)}"${cur && cur.kind === a.kind && cur.assetId === a.assetId ? ' selected' : ''}>${esc(a.label)} · ${esc(a.name || '')}</option>`).join('');
    };
    dlg.innerHTML = `<div class="snap-card alert-card"><h2 id="pf-title">${t(cur ? 'pf.editTitle' : 'pf.addTitle')}</h2>
      ${cur ? `<p class="alert-now">${esc(cur.label)} · ${esc(cur.name || '')}</p>` : `<div class="alert-input"><input id="pf-q" type="search" placeholder="${esc(t('pt.search'))}" autocomplete="off"></div>
        <select id="pf-asset" class="lang-select dca-select" size="6">${opts()}</select>
        <p class="consent-small">${t('pf.searchHint')}</p>`}
      <label for="pf-qty">${t('pf.qty')}</label><div class="alert-input"><input id="pf-qty" type="text" inputmode="decimal" value="${cur ? esc(ctx.fmtInput(cur.qty)) : ''}"></div>
      <label for="pf-cost">${t('pf.cost')}</label><div class="alert-input"><input id="pf-cost" type="text" inputmode="decimal" value="${cur ? esc(ctx.fmtInput(cur.cost)) : ''}"><span id="pf-unit"></span></div>
      <label for="pf-note">${t('pt.note')}</label><div class="alert-input"><input id="pf-note" type="text" maxlength="200" value="${esc(cur?.note || '')}"></div>
      <p class="alert-msg" id="pf-msg" hidden></p>
      <div class="snap-actions"><button type="button" class="btn" data-x>${t('snap.close')}</button><button type="button" class="btn btn-primary" data-ok>${t(cur ? 'pf.saveLine' : 'pf.add')}</button></div></div>`;
    const sel = dlg.querySelector('#pf-asset');
    const pick = () => (cur ? cur : list.find((a) => `${a.kind}:${a.assetId}` === sel?.value));
    const unit = () => {
      const a = pick(); const u = dlg.querySelector('#pf-unit');
      if (!a) { u.textContent = ''; return; }
      const q = ctx.quote(a); u.textContent = ctx.unit(a.kind, q.ccy || a.ccy);
      const costIn = dlg.querySelector('#pf-cost');
      if (!cur && !costIn.value && isNum(q.price)) costIn.placeholder = ctx.fmtInput(q.price);
    };
    dlg.querySelector('#pf-q')?.addEventListener('input', (e) => { sel.innerHTML = opts(e.target.value); if (sel.options.length) sel.selectedIndex = 0; unit(); });
    sel?.addEventListener('change', unit);
    if (sel && sel.options.length && sel.selectedIndex < 0) sel.selectedIndex = 0;
    unit();
    dlg.querySelector('[data-x]').addEventListener('click', close);
    dlg.querySelector('[data-ok]').addEventListener('click', () => {
      const a = pick();
      const qty = ctx.parse(dlg.querySelector('#pf-qty').value);
      const costRaw = dlg.querySelector('#pf-cost').value.trim();
      const q = a ? ctx.quote(a) : null;
      const cost = costRaw ? ctx.parse(costRaw) : q?.price;
      const msg = dlg.querySelector('#pf-msg');
      const err = !a ? t('pf.errAsset') : !(isNum(qty) && qty > 0) ? t('pf.errQty') : !(isNum(cost) && cost >= 0) ? t('pf.errCost') : !cur && pf.holdings.length >= MAX_LINES ? t('pf.errMax', { n: MAX_LINES }) : '';
      if (err) { msg.textContent = err; msg.hidden = false; return; }
      const note = dlg.querySelector('#pf-note').value.trim().slice(0, 200) || undefined;
      if (cur) Object.assign(cur, { qty, cost, note });
      else {
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        pf.holdings.push({ id, kind: a.kind, assetId: a.assetId, label: a.label, name: a.name, logo: a.logo, logoSmall: a.logoSmall, symbol: a.symbol, ccy: q?.ccy || a.ccy || null, qty, cost, note });
      }
      save(); close(); render(el);
      ctx.toast(t('pf.saved'));
    });
    dlg.hidden = false;
    document.body.style.overflow = 'hidden';
    (dlg.querySelector('#pf-q') || dlg.querySelector('#pf-qty')).focus();
  }

  function exportCSV(rows) {
    const fr = ctx.lang() === 'fr', sep = fr ? ';' : ',';
    const n = (v) => (isNum(v) ? (fr ? String(Number(v.toPrecision(10))).replace('.', ',') : String(Number(v.toPrecision(10)))) : '');
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['symbol', 'name', 'type', 'quantity', 'avg_cost', 'currency', 'price', 'value_usd', 'pnl_usd', 'note'].join(sep),
      ...rows.map((r) => [q(r.h.label), q(r.h.name), r.h.kind, n(r.h.qty), n(r.h.cost), r.q.ccy || r.h.ccy || '', n(r.price), n(r.val), n(r.pnl), q(r.h.note)].join(sep))];
    const blob = new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `marches-portefeuille-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  return { render, isOpen: () => !dlg.hidden, close, count: () => pf.holdings.length };
}
