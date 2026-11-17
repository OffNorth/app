// Fonction Edge Supabase « agents » — agents IA (Claude) qui tradent des comptes de DÉMONSTRATION (argent fictif)
// sur tous les marchés de l'app Marchés, avec un classement public.
//
// Actions (POST JSON ou ?action=) :
//   board                                   → public, lecture seule : agents, comptes, positions, dernières décisions
//   tick     (en-tête x-agents-secret)      → tâche planifiée (5 min) : récupère les lots terminés, applique les décisions,
//                                              envoie un nouveau lot pour les agents dont c'est l'heure
//   setup    (secret)                       → crée les agents et leurs comptes (100 000 $ fictifs) s'ils n'existent pas
//   preview  (secret) { slug }              → instantané + consignes d'un agent, sans appel facturé (+ nombre de jetons si une clé existe)
//   run      (secret) { force: true }       → envoie tout de suite un lot pour tous les agents actifs (appel facturé)
//
// Sécurité : la clé Anthropic est le secret ANTHROPIC_API_KEY de la fonction (jamais dans le code) ; le secret de la tâche
// planifiée est dans Supabase Vault. Garde-fous : rules.js (vérifiés côté serveur, quoi que réponde le modèle).
// Interrupteurs : AGENTS_ENABLED=true pour activer les envois planifiés ; AGENTS_MONTHLY_BUDGET_USD (30 par défaut).
import postgres from 'npm:postgres@3.4.5';
import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';
import { newAccount, normalize, recordEquity, summary } from './paper-engine.js';
import { applyDecision, DECISION_SCHEMA, LIMITS } from './rules.js';
import { buildAssets, buildSnapshot, quoteFrom, techOf, techTargets } from './snapshot.js';
import { AGENTS, systemFor } from './prompts.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20 });
const APP_URL = Deno.env.get('APP_URL') || 'https://marches-eight.vercel.app';
const DEFAULT_MODEL = 'claude-opus-5-5';
const CAPITAL = 100_000;
const ENABLED = () => Deno.env.get('AGENTS_ENABLED') === 'true';
const BUDGET = () => { const v = Number(Deno.env.get('AGENTS_MONTHLY_BUDGET_USD')); return Number.isFinite(v) && v >= 0 ? v : 30; };
// Prix par million de jetons (API Batches : −50 %). Modèle inconnu → tarif Opus 5.5 (estimation prudente).
const PRICE: Record<string, { in: number; out: number; cacheW: number; cacheR: number }> = {
  'claude-opus-5-5': { in: 2, out: 10, cacheW: 2.5, cacheR: 0.1 },
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

async function vaultGet(name: string): Promise<string | null> {
  const [row] = await sql`select decrypted_secret from vault.decrypted_secrets where name = ${name}`;
  return row?.decrypted_secret ?? null;
}
const client = () => {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  return key ? new Anthropic({ apiKey: key }) : null;
};

async function getJSON(path: string) {
  const res = await fetch(`${APP_URL}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return res.json();
}
const settled = async <T>(p: Promise<T>) => { try { return await p; } catch { return null; } };

/** Données de marché du site (une fois par passage) : registre des actifs, cours, contexte macro. */
async function marketData(accounts: Record<string, any>[]) {
  const [crypto, stocks, indices, macro, fx, rates, sentiment, calendar] = await Promise.all([
    settled(getJSON('/api/crypto')), settled(getJSON('/api/stocks?n=100')), settled(getJSON('/api/indices')), settled(getJSON('/api/macro')),
    settled(getJSON('/api/fx')), settled(getJSON('/api/rates')), settled(getJSON('/api/sentiment')), settled(getJSON('/api/calendar')),
  ]);
  const assets = buildAssets({ crypto, stocks, indices, macro });
  // Actifs détenus mais sortis des classements : cours via /api/quote (cryptos et actions).
  for (const kind of ['c', 's']) {
    const missing = [...new Set(accounts.flatMap((a) => (a.positions || []).filter((p: any) => p.kind === kind && !assets.has(`${kind}:${p.assetId}`)).map((p: any) => p.assetId)))];
    if (!missing.length) continue;
    const d = await settled(getJSON(`/api/quote?kind=${kind}&ids=${missing.slice(0, 30).map(encodeURIComponent).join(',')}`));
    for (const x of d?.items || []) {
      assets.set(`${kind}:${x.id}`, { kind, assetId: x.id, label: x.symbol || x.label || x.id, name: x.name, price: x.price, chg: x.changePct, ccy: kind === 'c' ? 'USD' : x.currency || null, closed: kind === 's' && x.state !== 'open' });
    }
  }
  const stale = { c: !crypto || !!crypto.stale, s: !stocks || !!stocks.stale, i: !indices || !!indices.stale, m: !macro || !!macro.stale };
  const quote = quoteFrom(assets, { fx, stale });
  return { assets, quote, rates, sentiment, calendar, fx };
}

/** Indicateurs journaliers des actifs ciblés (bougies réelles du site), partagés entre agents. */
async function techFor(list: any[], quote: (a: any) => any) {
  const out: Record<string, unknown> = {};
  await Promise.all(list.map(async (a) => {
    const symbol = a.kind === 'c' ? a.label : a.kind === 's' ? a.assetId : a.symbol;
    if (!symbol) return;
    const q = new URLSearchParams({ kind: a.kind, symbol, tf: '1d' });
    if (a.kind === 'c') { q.set('id', a.assetId); const p = quote(a).price; if (isNum(p)) q.set('ref', String(p)); }
    const d = await settled(getJSON(`/api/candles?${q}`));
    out[`${a.kind}:${a.assetId}`] = d?.candles ? techOf(d.candles) : null;
  }));
  return out;
}

const agentDef = (slug: string) => AGENTS.find((a) => a.slug === slug);

/* ---------- Mise en place ---------- */
async function setup() {
  let created = 0;
  for (const a of AGENTS) {
    const [exists] = await sql`select id from marches.ai_agents where slug = ${a.slug}`;
    if (exists) continue;
    const acct = newAccount(CAPITAL);
    const [acc] = await sql`insert into marches.paper_accounts (token_hash, data, pseudo, is_agent, equity, pnl_pct, stale)
      values (${`agent:${a.slug}`}, ${sql.json(acct)}, ${a.name}, true, ${CAPITAL}, 0, false)
      on conflict (token_hash) do update set is_agent = true returning id`;
    // Décisions étalées dans le temps (une toutes les ~70 min) pour lisser les appels.
    await sql`insert into marches.ai_agents (slug, name, model, effort, cadence_min, enabled, account_id, next_run_at)
      values (${a.slug}, ${a.name}, ${DEFAULT_MODEL}, 'medium', 360, true, ${acc.id}, now() + ${`${created * 70} minutes`}::interval)`;
    created++;
  }
  return json({ ok: true, created });
}

/* ---------- Envoi d'un lot ---------- */
async function monthCost() {
  const [r] = await sql`select coalesce(sum(cost_usd), 0)::float as c from marches.ai_decisions where at >= date_trunc('month', now())`;
  return r.c as number;
}

async function submit(agents: Record<string, any>[], market: Awaited<ReturnType<typeof marketData>>, accounts: Map<string, any>) {
  const c = client();
  if (!c) throw new Error('clé ANTHROPIC_API_KEY absente');
  const targets = new Map<string, any>();
  for (const ag of agents) for (const a of techTargets(market.assets, accounts.get(ag.id))) targets.set(`${a.kind}:${a.assetId}`, a);
  const tech = await techFor([...targets.values()], market.quote);
  const requests = [];
  const ids: Record<string, string> = {};
  for (const ag of agents) {
    const def = agentDef(ag.slug);
    if (!def) continue;
    const acct = accounts.get(ag.id);
    const recent = await sql`select at, summary, rejected from marches.ai_decisions where agent_id = ${ag.id} and status = 'applied' order by at desc limit 10`;
    const snapshot = buildSnapshot({ assets: market.assets, rates: market.rates, sentiment: market.sentiment, calendar: market.calendar, tech }, acct, market.quote, recent.reverse());
    const [dec] = await sql`insert into marches.ai_decisions (agent_id, status, model, prompt_chars) values (${ag.id}, 'submitted', ${ag.model}, ${snapshot.length}) returning id`;
    ids[ag.slug] = dec.id;
    requests.push({
      custom_id: ag.slug,
      params: {
        model: ag.model,
        max_tokens: 16000,
        system: [{ type: 'text' as const, text: systemFor(def), cache_control: { type: 'ephemeral' as const } }],
        messages: [{ role: 'user' as const, content: snapshot }],
        output_config: { effort: ag.effort, format: { type: 'json_schema' as const, schema: DECISION_SCHEMA } },
      },
    });
  }
  if (!requests.length) return { submitted: 0 };
  const batch = await c.messages.batches.create({ requests });
  for (const ag of agents) {
    if (!ids[ag.slug]) continue;
    await sql`update marches.ai_agents set pending_batch_id = ${batch.id}, last_error = null,
      next_run_at = greatest(next_run_at, now()) + make_interval(mins => cadence_min) where id = ${ag.id}`;
    await sql`update marches.ai_decisions set batch_id = ${batch.id} where id = ${ids[ag.slug]}`;
  }
  return { submitted: requests.length, batch: batch.id };
}

/* ---------- Récupération d'un lot terminé et application des décisions ---------- */
function costOf(model: string, u: any) {
  const p = PRICE[model] || PRICE[DEFAULT_MODEL];
  return ((u?.input_tokens || 0) * p.in + (u?.output_tokens || 0) * p.out + (u?.cache_creation_input_tokens || 0) * p.cacheW + (u?.cache_read_input_tokens || 0) * p.cacheR) / 1e6;
}

async function collect(batchId: string, market: () => Promise<Awaited<ReturnType<typeof marketData>>>) {
  const c = client();
  if (!c) throw new Error('clé ANTHROPIC_API_KEY absente');
  const b = await c.messages.batches.retrieve(batchId);
  if (b.processing_status !== 'ended') return { batch: batchId, status: b.processing_status, applied: 0 };
  const m = await market();
  let applied = 0;
  for await (const r of await c.messages.batches.results(batchId)) {
    const [ag] = await sql`select * from marches.ai_agents where slug = ${r.custom_id} and pending_batch_id = ${batchId}`;
    if (!ag) continue;
    const [dec] = await sql`select id from marches.ai_decisions where agent_id = ${ag.id} and batch_id = ${batchId} order by at desc limit 1`;
    const done = async (fields: Record<string, unknown>) => {
      if (dec) await sql`update marches.ai_decisions set ${sql(fields)} where id = ${dec.id}`;
      await sql`update marches.ai_agents set pending_batch_id = null, last_error = ${(fields.status === 'error' ? fields.summary : null) as string | null} where id = ${ag.id}`;
    };
    if (r.result.type !== 'succeeded') { await done({ status: 'error', summary: `Lot : ${r.result.type}` }); continue; }
    const msg = r.result.message;
    const usage = msg.usage;
    const base = { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: costOf(ag.model, usage) };
    if (msg.stop_reason === 'refusal') { await done({ ...base, status: 'refused', summary: 'Le modèle a refusé de répondre : aucun ordre.' }); continue; }
    if (msg.stop_reason === 'max_tokens') { await done({ ...base, status: 'error', summary: 'Réponse tronquée (limite de longueur) : aucun ordre.' }); continue; }
    const text = msg.content.find((x: any) => x.type === 'text') as { text: string } | undefined;
    let decision: any = null;
    try { decision = JSON.parse(text?.text || ''); } catch { /* illisible */ }
    if (!decision || !Array.isArray(decision.orders)) { await done({ ...base, status: 'error', summary: 'Réponse illisible : aucun ordre.' }); continue; }
    // Application avec contrôle de révision (la tâche « alerts » peut modifier le compte en même temps).
    let result: any = null;
    for (let i = 0; i < 3 && !result; i++) {
      const [row] = await sql`select id, data, rev from marches.paper_accounts where id = ${ag.account_id}`;
      const acct = normalize(row.data);
      if (!acct) break;
      const def = agentDef(ag.slug);
      const r2 = applyDecision(acct, decision, { quote: m.quote, asset: (k: string, id: string) => m.assets.get(`${k}:${id}`) || null }, { ...LIMITS, maxLev: Math.min(LIMITS.maxLev, def?.maxLev ?? 1) });
      recordEquity(acct, m.quote, Date.now());
      const s = summary(acct, m.quote);
      const [ok] = await sql`update marches.paper_accounts set data = ${sql.json(acct)}, rev = rev + 1, trades = ${acct.history.length},
        equity = ${s.valued ? s.equity : null}, pnl_pct = ${s.valued ? s.pnlPct : null}, updated_at = now(), last_seen = now()
        where id = ${row.id} and rev = ${row.rev} returning id`;
      if (ok) result = r2;
    }
    if (!result) { await done({ ...base, status: 'error', summary: 'Compte modifié pendant l’application : décision ignorée.' }); continue; }
    await done({ ...base, status: 'applied', summary: String(decision.summary || '').slice(0, 400), orders: sql.json(decision.orders.slice(0, 20)),
      executed: sql.json(result.executed), rejected: sql.json(result.rejected) });
    applied++;
  }
  return { batch: batchId, status: 'ended', applied };
}

async function loadAgents() {
  const agents = await sql`select a.*, p.data from marches.ai_agents a join marches.paper_accounts p on p.id = a.account_id order by a.slug`;
  const accounts = new Map<string, any>();
  for (const a of agents) accounts.set(a.id, normalize(a.data));
  return { agents, accounts };
}

async function tick(force = false) {
  // Les comptes des agents restent « utilisés » (la tâche alerts supprime les comptes inactifs depuis 1 an).
  await sql`update marches.paper_accounts set last_seen = now() where is_agent`;
  const { agents, accounts } = await loadAgents();
  let cache: Awaited<ReturnType<typeof marketData>> | null = null;
  const market = async () => (cache ||= await marketData([...accounts.values()]));
  const out: Record<string, unknown> = { enabled: ENABLED() };
  // 1. Lots terminés
  const pending = [...new Set(agents.filter((a) => a.pending_batch_id).map((a) => a.pending_batch_id as string))];
  out.collected = [];
  for (const id of pending) {
    try { (out.collected as unknown[]).push(await collect(id, market)); }
    catch (err) { (out.collected as unknown[]).push({ batch: id, error: String((err as Error).message || err) }); }
  }
  // 2. Nouveaux envois
  if (!ENABLED() && !force) return json({ ...out, submitted: 0, reason: 'désactivé (AGENTS_ENABLED)' });
  const spent = await monthCost();
  out.monthCostUsd = Math.round(spent * 100) / 100;
  if (spent >= BUDGET()) return json({ ...out, submitted: 0, reason: 'plafond mensuel atteint' });
  const fresh = await loadAgents();
  const due = fresh.agents.filter((a) => a.enabled && !a.pending_batch_id && (force || new Date(a.next_run_at).getTime() <= Date.now()));
  if (!due.length) return json({ ...out, submitted: 0 });
  try { Object.assign(out, await submit(due, await market(), fresh.accounts)); }
  catch (err) {
    out.error = String((err as Error).message || err);
    for (const a of due) await sql`update marches.ai_agents set last_error = ${out.error as string} where id = ${a.id}`;
  }
  return json(out);
}

/* ---------- Aperçu (sans appel facturé) ---------- */
async function preview(slug: string) {
  const { agents, accounts } = await loadAgents();
  const ag = agents.find((a) => a.slug === slug) || agents[0];
  if (!ag) return json({ error: 'aucun agent : lancez setup' }, 404);
  const m = await marketData([...accounts.values()]);
  const tech = await techFor(techTargets(m.assets, accounts.get(ag.id)), m.quote);
  const snapshot = buildSnapshot({ assets: m.assets, rates: m.rates, sentiment: m.sentiment, calendar: m.calendar, tech }, accounts.get(ag.id), m.quote, []);
  const system = systemFor(agentDef(ag.slug)!);
  let tokens: number | null = null;
  const c = client();
  if (c) {
    try {
      tokens = (await c.messages.countTokens({ model: ag.model, system, messages: [{ role: 'user', content: snapshot }],
        output_config: { format: { type: 'json_schema', schema: DECISION_SCHEMA } } } as any)).input_tokens;
    } catch { /* comptage indisponible */ }
  }
  return json({ slug: ag.slug, assets: m.assets.size, chars: snapshot.length, tokens, system, snapshot });
}

/* ---------- Classement public ---------- */
async function board() {
  const rows = await sql`select a.slug, a.name, a.model, a.enabled, a.next_run_at, a.pending_batch_id, a.last_error,
      p.data, p.equity, p.pnl_pct, p.month_key, p.month_equity, p.updated_at
    from marches.ai_agents a join marches.paper_accounts p on p.id = a.account_id`;
  const month = new Date().toISOString().slice(0, 7);
  const agents = [];
  for (const r of rows) {
    const def = agentDef(r.slug);
    const acct = normalize(r.data);
    const decisions = await sql`select d.at, d.status, d.summary, d.executed, d.rejected from marches.ai_decisions d
      join marches.ai_agents a on a.id = d.agent_id where a.slug = ${r.slug} and d.status <> 'submitted' order by d.at desc limit 20`;
    agents.push({
      slug: r.slug, name: r.name, strategy: def?.strategy || '', maxLev: def?.maxLev ?? 1, model: r.model, enabled: r.enabled,
      equity: r.equity, pnlPct: r.pnl_pct, initial: acct?.initial ?? CAPITAL, cash: acct?.cash ?? null,
      monthPct: r.month_key === month && r.month_equity > 0 && isNum(r.equity) ? (r.equity / r.month_equity - 1) * 100 : null,
      positions: (acct?.positions || []).map((p: any) => ({ kind: p.kind, assetId: p.assetId, label: p.label, name: p.name, symbol: p.symbol, side: p.side, lev: p.lev, qty: p.qty, entry: p.entry, margin: p.margin, ccy: p.ccy, fxOpen: p.fxOpen, tp: p.tp, sl: p.sl, openedAt: p.openedAt })),
      orders: (acct?.orders || []).length,
      trades: (acct?.history || []).length,
      equityCurve: (acct?.equity || []).slice(-200),
      nextRunAt: r.enabled ? r.next_run_at : null, thinking: !!r.pending_batch_id, updatedAt: r.updated_at,
      decisions: decisions.map((d: any) => ({ at: d.at, status: d.status, summary: d.summary, executed: d.executed || [], rejected: (d.rejected || []).map((x: any) => ({ why: x.why, label: x.order?.assetId || null, action: x.order?.action || null })) })),
    });
  }
  agents.sort((a, b) => (b.pnlPct ?? -1e9) - (a.pnlPct ?? -1e9));
  return json({ agents, capital: CAPITAL, limits: LIMITS, enabled: ENABLED(), fetchedAt: Date.now() });
}

Deno.serve(async (req) => {
  let body: Record<string, any> = {};
  if (req.method === 'POST') {
    try { const t = await req.text(); body = t ? JSON.parse(t) : {}; } catch { return json({ error: 'JSON invalide' }, 400); }
  }
  const action = new URL(req.url).searchParams.get('action') || body.action || 'board';
  try {
    if (action === 'board') return await board();
    const secret = await vaultGet('agents_cron_secret');
    if (!secret || req.headers.get('x-agents-secret') !== secret) return json({ error: 'non autorisé' }, 401);
    if (action === 'tick') return await tick(false);
    if (action === 'setup') return await setup();
    if (action === 'preview') return await preview(String(body.slug || ''));
    if (action === 'run' && body.force === true) return await tick(true);
    return json({ error: 'action inconnue' }, 400);
  } catch (err) {
    console.error(action, err);
    return json({ error: 'erreur interne' }, 500);
  }
});
