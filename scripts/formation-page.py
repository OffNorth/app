"""Génère la page « Formation Trading, TradingView & NAS100 » (FR, EN, ZH) :
public/formation.html, public/en/formation.html, public/zh/formation.html.
Contenu : document de @Max (17 novembre 2026), version originale en français (public/docs/formation-nas100.pdf) ;
traductions anglaise et chinoise fournies pour faciliter la lecture, la version française fait foi.
Le contenu est dans scripts/formation/content_<langue>.py (même structure dans les trois langues).
Usage : python3 scripts/formation-page.py
"""
import html
import importlib.util
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent / "public"
HTML_LANG = {"fr": "fr", "en": "en", "zh": "zh-CN"}
PREFIX = {"fr": "", "en": "/en", "zh": "/zh"}


def load(lang):
    spec = importlib.util.spec_from_file_location(f"content_{lang}", HERE / "formation" / f"content_{lang}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.C


def inline(s):
    """Texte → HTML : échappement, puis **gras** et `code`."""
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s


def attr(s):
    return html.escape(s, quote=True)


class Ctx:
    """Compteurs partagés : les identifiants des cases à cocher sont identiques dans les trois langues."""

    def __init__(self, ui):
        self.ui = ui
        self.ids = []

    def check(self, key, label):
        self.ids.append(key)
        return f'<li><label class="fm-check"><input type="checkbox" data-fk="{key}"> <span>{inline(label)}</span></label></li>'


def calc_size(ui):
    u = ui["calc_size"]
    f = lambda k, v, suf="": f'<label><span>{u[k]}</span><span class="fm-in"><input type="text" inputmode="decimal" data-cs="{k}" value="{v}">{suf}</span></label>'
    return f"""<form class="fm-calc" data-calc="size" novalidate>
      <h4>{u['title']}</h4>
      <div class="fm-grid">{f('cap', u['d_cap'])}{f('risk', u['d_risk'], '<i>%</i>')}{f('stop', u['d_stop'])}{f('pv', u['d_pv'])}</div>
      <output class="fm-out" data-out="size" aria-live="polite"></output>
      <p class="fm-small">{u['note']}</p>
    </form>"""


def calc_exp(ui):
    u = ui["calc_exp"]
    f = lambda k, v, suf="": f'<label><span>{u[k]}</span><span class="fm-in"><input type="text" inputmode="decimal" data-ce="{k}" value="{v}">{suf}</span></label>'
    return f"""<form class="fm-calc" data-calc="exp" novalidate>
      <h4>{u['title']}</h4>
      <div class="fm-grid">{f('win', u['d_win'], '<i>%</i>')}{f('gain', u['d_gain'], '<i>R</i>')}{f('loss', u['d_loss'], '<i>R</i>')}{f('n', u['d_n'])}{f('amt', u['d_amt'])}</div>
      <output class="fm-out" data-out="exp" aria-live="polite"></output>
      <p class="fm-small">{u['note']}</p>
    </form>"""


def block(b, cx):
    kind = b[0]
    ui = cx.ui
    if kind == "h3":
        return f"<h3>{inline(b[1])}</h3>"
    if kind == "p":
        return f"<p>{inline(b[1])}</p>"
    if kind == "ul":
        return "<ul>" + "".join(f"<li>{inline(x)}</li>" for x in b[1]) + "</ul>"
    if kind == "ol":
        return "<ol>" + "".join(f"<li>{inline(x)}</li>" for x in b[1]) + "</ol>"
    if kind == "table":
        head, rows = b[1], b[2]
        th = "".join(f'<th scope="col">{inline(h)}</th>' for h in head)
        trs = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows)
        return f'<div class="table-wrap" tabindex="0" role="region" aria-label="{attr(b[3] if len(b) > 3 else head[0])}"><table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div>'
    if kind == "ex":
        return f'<div class="fm-ex"><b>{ui["exercise"]}</b> {inline(b[1])}</div>'
    if kind == "warn":
        return f'<div class="fm-warn" role="note">{inline(b[1])}</div>'
    if kind == "rule":
        return f'<p class="fm-rule">{inline(b[1])}</p>'
    if kind == "formula":
        return f'<p class="fm-formula">{inline(b[1])}</p>'
    if kind == "src":
        return f'<p class="fm-small">{inline(b[1])}</p>'
    if kind == "code":
        return f"""<div class="fm-code"><button type="button" class="btn btn-sm" data-copy aria-label="{attr(ui['copy_aria'])}">{ui['copy']}</button><pre tabindex="0" aria-label="Pine Script"><code>{html.escape(b[1])}</code></pre></div>"""
    if kind == "calc":
        return calc_size(ui) if b[1] == "size" else calc_exp(ui)
    if kind == "app":
        links = "".join(f'<a class="btn btn-sm" href="/?go={attr(go)}">{inline(lbl)}</a>' for go, lbl in b[1])
        return f'<div class="fm-app"><b>{ui["in_app"]}</b><div>{links}</div></div>'
    if kind == "week":
        _, title, key, items = b
        return f"<h4>{inline(title)}</h4><ul class=\"fm-checks\">" + "".join(cx.check(f"{key}-{i + 1}", x) for i, x in enumerate(items)) + "</ul>"
    raise ValueError(kind)


def module(m, i, cx):
    ui = cx.ui
    body = "\n      ".join(block(b, cx) for b in m["blocks"])
    key = f"m{i}"
    cx.ids.append(key)
    return f"""
    <details class="fm-mod" id="{key}">
      <summary><span class="fm-num">{i}</span><span class="fm-st">{inline(m['title'])}</span><span class="fm-tick" aria-hidden="true">✓</span></summary>
      <div class="fm-body">
      <p class="lead">{inline(m['intro'])}</p>
      {body}
      <label class="fm-done"><input type="checkbox" data-fk="{key}" data-mod> {ui['done']}</label>
      </div>
    </details>"""


def page(lang):
    C = load(lang)
    ui = C["ui"]
    cx = Ctx(ui)
    mods = "".join(module(m, i + 1, cx) for i, m in enumerate(C["modules"]))
    toc = "".join(f'<li><a href="#m{i + 1}">{inline(m["title"])}</a></li>' for i, m in enumerate(C["modules"]))
    plan_rows = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in C["plan"]["rows"])
    plan_th = "".join(f'<th scope="col">{inline(h)}</th>' for h in C["plan"]["head"])
    checklist = "".join(cx.check(f"c-{i + 1}", x) for i, x in enumerate(C["checklist"]["items"]))
    gloss = "".join(f"<dt>{inline(t)}</dt><dd>{inline(d)}</dd>" for t, d in C["glossary"]["items"])
    sources = "".join(f'<li><a href="{attr(u)}" target="_blank" rel="noopener">{inline(t)}</a></li>' for u, t in C["sources"]["items"])
    switch = " · ".join(
        f'<a href="{PREFIX[l]}/formation.html" hreflang="{HTML_LANG[l]}" data-setlang="{l}"{" aria-current=\"true\"" if l == lang else ""}>{lbl}</a>'
        for l, lbl in (("fr", "FR"), ("en", "EN"), ("zh", "中文")))
    alternates = "\n  ".join(f'<link rel="alternate" hreflang="{HTML_LANG[l]}" href="{PREFIX[l]}/formation.html">' for l in ("fr", "en", "zh"))
    prevail = f'<p class="fm-small">{inline(ui["prevail"])}</p>' if ui["prevail"] else ""
    return cx.ids, f"""<!doctype html>
<html lang="{HTML_LANG[lang]}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{attr(C['title'])} — {ui['app']}</title>
  <meta name="description" content="{attr(C['desc'])}">
  <meta name="theme-color" content="#0b0f14">
  <meta name="color-scheme" content="dark">
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <script src="/assets/theme.js"></script>
  {alternates}
</head>
<body class="doc fm">
  <header class="topbar"><div class="topbar-row"><a class="back" href="/">{ui['back']}</a><nav class="lang-switch" aria-label="Langue / Language / 语言">{switch}</nav></div></header>
  <main id="main">
    <h1>{inline(C['title'])}</h1>
    <p class="updated">{inline(C['byline'])}</p>
    {prevail}
    <div class="fm-actions">
      <a class="btn" href="/docs/formation-nas100.pdf" download>{ui['pdf']}</a>
    </div>

    <h2>{inline(C['before']['title'])}</h2>
    <p>{inline(C['before']['intro'])}</p>
    <div class="fm-warn" role="note">{inline(C['before']['warn'])}</div>
    <div class="table-wrap" tabindex="0" role="region" aria-label="{attr(C['plan']['head'][0])}"><table><thead><tr>{plan_th}</tr></thead><tbody>{plan_rows}</tbody></table></div>
    <p>{inline(C['before']['prereq'])}</p>

    <nav class="card fm-toc" aria-labelledby="fm-toc-h">
      <h2 id="fm-toc-h">{ui['toc']}</h2>
      <div class="fm-progress"><progress max="7" value="0" data-fprog-bar aria-labelledby="fm-prog-txt"></progress><span id="fm-prog-txt" data-fprog>{ui['progress'].replace('{n}', '0')}</span></div>
      <ol>{toc}<li><a href="#checklist">{inline(C['checklist']['title'])}</a></li><li><a href="#glossaire">{inline(C['glossary']['title'])}</a></li></ol>
      <p class="fm-small">{ui['saved']}</p>
    </nav>
    {mods}

    <section class="card fm-sec" id="checklist">
      <h2>{inline(C['checklist']['title'])}</h2>
      <p class="fm-rule">{inline(C['checklist']['intro'])}</p>
      <ul class="fm-checks">{checklist}</ul>
      <button type="button" class="btn btn-sm" data-freset="c">{ui['reset']}</button>
    </section>

    <section class="fm-sec" id="glossaire">
      <h2>{inline(C['glossary']['title'])}</h2>
      <dl class="fm-gloss">{gloss}</dl>
    </section>

    <section class="fm-sec" id="sources">
      <h2>{inline(C['sources']['title'])}</h2>
      <ul>{sources}</ul>
      <p class="fm-small">{inline(C['sources']['check'])}</p>
    </section>

    <p class="fm-foot">{ui['foot']}</p>
  </main>
  <script src="/assets/legal.js" type="module"></script>
  <script src="/assets/formation.js" type="module"></script>
</body>
</html>
"""


ref = None
for lang in ("fr", "en", "zh"):
    ids, out = page(lang)
    if ref is None:
        ref = ids
    assert ids == ref, f"{lang} : cases à cocher différentes de la version française ({len(ids)} / {len(ref)})"
    d = ROOT if lang == "fr" else ROOT / lang
    d.mkdir(parents=True, exist_ok=True)
    (d / "formation.html").write_text(out, encoding="utf-8")
print(f"formation générée (fr, en, zh) : {len(ref)} cases à cocher")
