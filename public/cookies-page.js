// Page « Gestion des cookies » : consulter, donner, refuser ou retirer son consentement.
import { clearConsent, getConsent, getRecord, setConsent, SERVICES } from './consent.js';

const $ = (s) => document.querySelector(s);
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

function render() {
  const c = getConsent('tradingview');
  const status = $('#tv-status');
  status.textContent = c === true ? 'Accepté' : c === false ? 'Refusé' : 'Aucun choix (graphiques non chargés)';
  status.className = `status ${c === true ? 'on' : c === false ? 'off' : ''}`;
  $('#tv-accept').setAttribute('aria-pressed', String(c === true));
  $('#tv-refuse').setAttribute('aria-pressed', String(c === false));
  const r = getRecord();
  $('#tv-record').textContent = r
    ? `Choix enregistré le ${dateFmt.format(new Date(r.date))} (version ${r.v} du mécanisme de consentement), valable 6 mois.`
    : 'Aucun choix enregistré sur cet appareil.';
}

$('#tv-purpose').textContent = `${SERVICES.tradingview.purpose} Données : ${SERVICES.tradingview.data}`;
$('#tv-accept').addEventListener('click', () => { setConsent('tradingview', true); render(); });
$('#tv-refuse').addEventListener('click', () => { setConsent('tradingview', false); render(); });
$('#consent-reset').addEventListener('click', () => { clearConsent(); render(); });
window.addEventListener('storage', render); // choix modifié dans un autre onglet
render();
