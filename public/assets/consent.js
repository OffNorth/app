// Gestion du consentement aux traceurs tiers (recommandations CNIL, art. 82 loi Informatique et Libertés).
//
// Le site lui-même ne dépose aucun cookie et n'utilise que du stockage local strictement nécessaire
// (exempté de consentement). Le seul service soumis à consentement est le widget de graphiques
// TradingView, qui collecte des données (adresse IP, informations sur l'appareil, interactions)
// et écrit dans le stockage local de l'appareil.
//
// Règles appliquées :
// - rien n'est chargé chez TradingView avant un choix explicite (aucun consentement implicite) ;
// - « Refuser » est aussi simple et visible qu'« Accepter » ;
// - le choix (accord OU refus) est conservé 6 mois, puis redemandé ;
// - il peut être modifié ou retiré à tout moment (page « Gestion des cookies ») ;
// - preuve du consentement : enregistrement horodaté sur l'appareil (date, version, choix),
//   le code de ce mécanisme étant versionné dans le dépôt Git du site.

export const CONSENT_VERSION = 1;
const KEY = 'marches:consent';
const MAX_AGE_MS = 182 * 24 * 3600 * 1000; // ≈ 6 mois (durée recommandée par la CNIL)

export const SERVICES = {
  tradingview: {
    name: 'TradingView',
    purpose: 'Afficher les graphiques interactifs des cryptos, indices et actions.',
    data: 'Adresse IP, informations techniques sur l’appareil et le navigateur, interactions avec le graphique ; écriture de données dans le stockage local de l’appareil.',
    controller: 'TradingView (responsable de traitement indépendant), États-Unis',
    policy: 'https://www.tradingview.com/privacy-policy/',
  },
};

function read() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (!c || c.v !== CONSENT_VERSION || !c.date) return null;
    if (Date.now() - Date.parse(c.date) > MAX_AGE_MS) return null; // expiré : on redemande
    return c;
  } catch {
    return null;
  }
}

/** true = accepté, false = refusé, undefined = pas (ou plus) de choix valable. */
export function getConsent(service) {
  const c = read();
  return c && typeof c.choices?.[service] === 'boolean' ? c.choices[service] : undefined;
}

export function getRecord() {
  return read();
}

/** Enregistre le choix (preuve horodatée) et prévient les autres onglets/pages. */
export function setConsent(service, value) {
  const prev = read();
  const record = {
    v: CONSENT_VERSION,
    date: new Date().toISOString(),
    choices: { ...(prev?.choices || {}), [service]: !!value },
    via: typeof location !== 'undefined' ? location.pathname : '',
  };
  try { localStorage.setItem(KEY, JSON.stringify(record)); } catch { /* stockage indisponible : le choix vaut pour la session */ }
  window.dispatchEvent(new CustomEvent('consentchange', { detail: record }));
  return record;
}

export function clearConsent() {
  try { localStorage.removeItem(KEY); } catch { /* rien */ }
  window.dispatchEvent(new CustomEvent('consentchange', { detail: null }));
}
