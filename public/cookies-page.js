// Page « Gestion des cookies » : consulter, donner, refuser ou retirer son consentement (FR, EN, ZH).
import { clearConsent, getConsent, getRecord, setConsent } from './consent.js';

const lang = (document.documentElement.lang || 'fr').slice(0, 2);
const T = {
  fr: { on: 'Accepté', off: 'Refusé', none: 'Aucun choix (graphiques non chargés)', rec: (d, v) => `Choix enregistré le ${d} (version ${v} du mécanisme de consentement), valable 6 mois.`, norec: 'Aucun choix enregistré sur cet appareil.',
    purpose: 'Afficher les graphiques interactifs des cryptos, indices et actions. Données : adresse IP, informations techniques sur l’appareil et le navigateur, interactions avec le graphique ; écriture de données dans le stockage local de l’appareil.', loc: 'fr-FR' },
  en: { on: 'Accepted', off: 'Declined', none: 'No choice (charts not loaded)', rec: (d, v) => `Choice recorded on ${d} (consent mechanism version ${v}), valid for 6 months.`, norec: 'No choice recorded on this device.',
    purpose: 'Display interactive charts for cryptos, indices and stocks. Data: IP address, technical information about the device and browser, chart interactions; data written to the device’s local storage.', loc: 'en-US' },
  zh: { on: '已接受', off: '已拒绝', none: '尚未选择（图表不会加载）', rec: (d, v) => `选择记录于 ${d}（同意机制版本 ${v}），有效期 6 个月。`, norec: '此设备上没有记录任何选择。',
    purpose: '显示加密货币、指数和股票的交互式图表。数据：IP 地址、设备和浏览器技术信息、图表交互；在设备本地存储中写入数据。', loc: 'zh-CN' },
};
const L = T[lang] || T.fr;

const $ = (s) => document.querySelector(s);
const dateFmt = new Intl.DateTimeFormat(L.loc || 'fr-FR', { dateStyle: 'long', timeStyle: 'short' });

function render() {
  const c = getConsent('tradingview');
  const status = $('#tv-status');
  status.textContent = c === true ? L.on : c === false ? L.off : L.none;
  status.className = `status ${c === true ? 'on' : c === false ? 'off' : ''}`;
  $('#tv-accept').setAttribute('aria-pressed', String(c === true));
  $('#tv-refuse').setAttribute('aria-pressed', String(c === false));
  const r = getRecord();
  $('#tv-record').textContent = r ? L.rec(dateFmt.format(new Date(r.date)), r.v) : L.norec;
}

$('#tv-purpose').textContent = L.purpose;
$('#tv-accept').addEventListener('click', () => { setConsent('tradingview', true); render(); });
$('#tv-refuse').addEventListener('click', () => { setConsent('tradingview', false); render(); });
$('#consent-reset').addEventListener('click', () => { clearConsent(); render(); });
window.addEventListener('storage', render); // choix modifié dans un autre onglet
render();
