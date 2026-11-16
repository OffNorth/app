// Image PNG d'une heatmap (cryptos ou entreprises), dessinée dans un <canvas>.
// Tout est local : les logos passent par le relais /api/logo du site (même origine,
// donc le canvas reste exportable) et aucune donnée n'est envoyée à un tiers.

const W = 1080, H = 1350, P = 44;
const C = { bg: '#0b0f14', surface: '#121921', border: '#232d39', text: '#e8eef4', muted: '#8d9aab', up: '#22c55e', down: '#f05252' };
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
const font = (weight, size) => `${weight} ${Math.round(size)}px ${FONT}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const colorOf = (cls) => (cls === 'pos' ? C.up : cls === 'neg' ? C.down : null);

function loadImage(src, timeout = 3500) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => { clearTimeout(timer); resolve(ok ? img : null); };
    const timer = setTimeout(() => done(false), timeout);
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Écrit un texte en réduisant la police s'il dépasse maxW ; renvoie la taille utilisée. */
function fitText(ctx, text, x, y, maxW, weight, size, min = 9) {
  ctx.font = font(weight, size);
  const w = ctx.measureText(text).width;
  if (w > maxW && w > 0) {
    size = Math.max(min, size * (maxW / w));
    ctx.font = font(weight, size);
  }
  ctx.fillText(text, x, y);
  return size;
}

/** Texte en segments colorés (ex. « ▲ 12 · ▼ 13 »), aligné à gauche. */
function drawSegments(ctx, segs, x, y, maxW, weight, size) {
  ctx.font = font(weight, size);
  const total = segs.reduce((s, g) => s + ctx.measureText(g.text).width, 0);
  if (total > maxW) { size *= maxW / total; ctx.font = font(weight, size); }
  for (const g of segs) {
    ctx.fillStyle = colorOf(g.cls) || C.text;
    ctx.fillText(g.text, x, y);
    x += ctx.measureText(g.text).width;
  }
}

function drawLogo(ctx, img, cx, cy, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

function drawTile(ctx, r, img, pctText, priceText) {
  const base = Math.sqrt(r.w * r.h);
  const label = r.label || '';
  let sym = clamp(base / 4.2, 13, 64);
  sym = Math.min(sym, (r.w - 10) / (Math.max(label.length, 2) * 0.68));
  const pct = clamp(sym * 0.62, 12, 36);
  const px = clamp(sym * 0.5, 11, 28);
  const maxW = r.w - 10;
  const cx = r.x + r.w / 2;
  const lines = [];
  let logo = 0;

  if (r.w >= 110 && r.h >= 95) {
    lines.push({ text: label, w: 800, s: sym }, { text: pctText, w: 600, s: pct }, { text: priceText, w: 500, s: px, a: 0.82 });
  } else if (r.w >= 64 && r.h >= 54) {
    lines.push({ text: label, w: 800, s: Math.min(sym, 26) }, { text: pctText, w: 600, s: Math.min(pct, 18) });
  } else if (img && Math.min(r.w, r.h) >= 22) {
    logo = Math.round(Math.min(Math.min(r.w, r.h) * 0.62, 44));
  } else if (r.w >= 38 && r.h >= 22) {
    lines.push({ text: label, w: 800, s: clamp(sym, 10, 16) });
  }
  const textH = lines.reduce((s, l) => s + l.s * 1.18, 0);
  if (img && lines.length) {
    const room = r.h - textH - 22;
    const want = Math.min(84, lines[0].s * 1.25, r.w * 0.4);
    if (room >= 22) logo = Math.round(Math.min(want, room));
  }
  const gap = logo && lines.length ? 8 : 0;
  let y = r.y + (r.h - (textH + logo + gap)) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  if (logo) { drawLogo(ctx, img, cx, y + logo / 2, logo); y += logo + gap; }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of lines) {
    ctx.globalAlpha = l.a || 1;
    ctx.fillStyle = '#fff';
    fitText(ctx, l.text, cx, y + (l.s * 1.18) / 2, maxW, l.w, l.s, 8);
    y += l.s * 1.18;
  }
  ctx.restore();
}

/**
 * Dessine l'image et renvoie un Blob PNG.
 * opts : { title, subtitle, when, stats:[{label, value, sub, cls}], items, layout, color, fmtPct, priceText,
 *          legend:[{color, text}], note, sources, disclaimer, site }
 */
export async function makeSnapshot(opts) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // En-tête
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.text;
  ctx.font = font(800, 46);
  ctx.fillText(opts.title, P, P + 42);
  const titleW = ctx.measureText(opts.title).width;
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'right';
  fitText(ctx, opts.when, W - P, P + 40, W - 2 * P - titleW - 30, 600, 24, 14);
  ctx.textAlign = 'left';
  fitText(ctx, opts.subtitle, P, P + 84, W - 2 * P, 500, 26, 14);

  // Statistiques
  const sy = P + 112, sh = 116, gap = 14;
  const n = opts.stats.length;
  const sw = (W - 2 * P - gap * (n - 1)) / n;
  opts.stats.forEach((s, i) => {
    const x = P + i * (sw + gap);
    roundRect(ctx, x, sy, sw, sh, 16);
    ctx.fillStyle = C.surface; ctx.fill();
    ctx.strokeStyle = C.border; ctx.lineWidth = 2; ctx.stroke();
    const inner = sw - 32;
    ctx.fillStyle = C.muted;
    fitText(ctx, String(s.label).toUpperCase(), x + 16, sy + 32, inner, 600, 17, 11);
    const segs = Array.isArray(s.value) ? s.value : [{ text: String(s.value) }];
    drawSegments(ctx, segs, x + 16, sy + 72, inner, 700, 32);
    ctx.fillStyle = colorOf(s.cls) || C.muted;
    if (s.sub) fitText(ctx, s.sub, x + 16, sy + 101, inner, 600, 19, 11);
  });

  // Heatmap
  const tx = P, ty = sy + sh + 22, tw = W - 2 * P, th = H - ty - 156;
  let sorted = opts.items.filter((c) => Number.isFinite(c.marketCap) && c.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((c) => ({ ...c, value: c.marketCap }));
  if (opts.resize) sorted = opts.resize(sorted);
  const rects = opts.layout(sorted, tx, ty, tw, th);
  const imgs = await Promise.all(rects.map((r) => {
    const raw = r.logo || r.logoSmall;
    return raw ? loadImage(`/api/logo?u=${encodeURIComponent(raw)}`) : null;
  }));
  ctx.save();
  roundRect(ctx, tx, ty, tw, th, 18);
  ctx.clip();
  ctx.fillStyle = C.bg;
  ctx.fillRect(tx, ty, tw, th);
  rects.forEach((r, i) => {
    ctx.fillStyle = opts.color(r.changePct);
    ctx.fillRect(r.x + 1, r.y + 1, Math.max(0, r.w - 2), Math.max(0, r.h - 2));
    drawTile(ctx, r, imgs[i], opts.fmtPct(r), opts.priceText(r));
  });
  ctx.restore();

  // Légende
  let lx = P, ly = ty + th + 34;
  ctx.textBaseline = 'middle';
  ctx.font = font(500, 20);
  for (const l of opts.legend) {
    roundRect(ctx, lx, ly - 10, 20, 20, 4);
    ctx.fillStyle = l.color; ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.fillText(l.text, lx + 28, ly);
    lx += 28 + ctx.measureText(l.text).width + 22;
  }
  if (opts.note) fitText(ctx, opts.note, lx, ly, W - P - lx, 500, 20, 12);

  // Pied : sources, avertissement, adresse du site
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.muted;
  fitText(ctx, opts.sources, P, H - P - 34, W - 2 * P, 500, 18, 11);
  ctx.fillStyle = C.text;
  ctx.font = font(600, 19);
  ctx.fillText(opts.disclaimer, P, H - P);
  const dw = ctx.measureText(opts.disclaimer).width;
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'right';
  fitText(ctx, opts.site, W - P, H - P, W - 2 * P - dw - 30, 600, 19, 11);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
}
