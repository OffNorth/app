// Traductions de l'application : français (par défaut), anglais, chinois simplifié.
// Le choix est mémorisé sur l'appareil (préférence d'affichage, exemptée de consentement).

export const LANGS = ['fr', 'en', 'zh'];
export const LANG_LABELS = { fr: 'FR', en: 'EN', zh: '中文' };
export const LOCALES = { fr: 'fr-FR', en: 'en-US', zh: 'zh-CN' };
export const HTML_LANG = { fr: 'fr', en: 'en', zh: 'zh-CN' };
export const TV_LOCALE = { fr: 'fr', en: 'en', zh: 'zh_CN' };
const KEY = 'marches:lang';

function detect() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (LANGS.includes(saved)) return saved;
  } catch { /* stockage indisponible */ }
  for (const l of navigator.languages || [navigator.language || '']) {
    const code = String(l).slice(0, 2).toLowerCase();
    if (LANGS.includes(code)) return code;
  }
  return 'fr';
}

let lang = detect();
export const getLang = () => lang;
export function setLang(l) {
  if (!LANGS.includes(l)) return;
  lang = l;
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* rien */ }
}

/** Préfixe des pages juridiques selon la langue ('' pour le français). */
export const legalPrefix = (l = lang) => (l === 'fr' ? '' : `/${l}`);

const D = {
  fr: {
    'snap.btn': 'Télécharger l’image', 'snap.making': 'Création de l’image…', 'snap.failed': 'Échec, réessayez', 'snap.title': 'Image de la heatmap',
    'snap.hint': 'Sur téléphone, vous pouvez aussi appuyer longuement sur l’image pour l’enregistrer.', 'snap.close': 'Fermer', 'snap.share': 'Partager', 'snap.save': 'Télécharger',
    'snap.noteCrypto': '· taille = capitalisation · hors stablecoins', 'snap.noteStocks': '· taille = capitalisation',
    'snap.srcCrypto': 'Source : {s} · cours en dollars US', 'snap.srcStocks': 'Sources : classement companiesmarketcap.com · cours Yahoo Finance (différés)',
    appName: 'Marchés', loading: 'Chargement…', refresh: 'Rafraîchir', language: 'Langue', back: 'Retour', hide: 'Masquer',
    'tab.crypto': 'Crypto', 'tab.actions': 'Actions', 'tab.ameriques': 'Amériques', 'tab.europe': 'Europe', 'tab.asie': 'Asie', 'tab.afrique': 'Afrique',
    'title.crypto': 'Top 25 cryptos hors stablecoins · 24 h', 'title.actions': 'Top 25 entreprises mondiales · séance',
    'title.ameriques': 'Indices Amériques', 'title.europe': 'Indices Europe', 'title.asie': 'Indices Asie-Pacifique', 'title.afrique': 'Indices Afrique & Moyen-Orient',
    updatedShort: 'MAJ',
    'legend.down24': 'Baisse 24 h', 'legend.flat': 'Stable', 'legend.up24': 'Hausse 24 h',
    'legend.cryptoTail': '· taille = capitalisation · hors stablecoins · touchez une tuile pour son graphique',
    'legend.down': 'Baisse', 'legend.upSession': 'Hausse sur la séance', 'legend.stocksTail': '· taille = capitalisation · touchez une tuile pour son graphique',
    'legend.index': 'Touchez un indice pour ouvrir son graphique TradingView.',
    disclaimer: 'Information, pas un conseil financier.',
    'legal.mentions': 'Mentions légales', 'legal.privacy': 'Confidentialité', 'legal.cookies': 'Gestion des cookies', 'legal.terms': 'CGU', 'legal.nav': 'Informations légales',
    openTV: 'Ouvrir dans TradingView ↗',
    totalCap: 'Capitalisation totale', over24h: 'sur 24 h', btcDom: 'Dominance BTC', ofCap: 'de la capitalisation',
    upDown: 'Hausse / baisse', inTop25: 'sur le top 25', updated: 'Mise à jour', stale: 'ancien',
    top25cap: 'Capitalisation top 25', hourly: 'mise à jour horaire', wallStreet: 'Wall Street', noData: 'Données n/d',
    period24h: 'sur 24 h', periodSession: 'sur la séance', priceWord: 'prix',
    price: 'Prix', quote: 'Cours', cap: 'Capitalisation', share: 'Part top 25', level: 'Niveau', change: 'Variation', prevClose: 'Clôture préc.',
    rank: 'rang {n}', change24: 'variation 24 h', openChart: 'Ouvrir le graphique',
    chartLoading: 'Chargement du graphique…', chartUnavailable: 'Graphique indisponible pour le moment{off}.<br>Réessayez dans un instant.', offlineSuffix: ' (hors ligne)',
    missCrypto: 'Graphique TradingView n/d pour {s} :<br>cette crypto n’y est pas cotée.',
    missStock: 'Graphique n/d ici pour {s} :<br>TradingView n’autorise pas cette place de cotation dans ce widget.<br>Il reste consultable sur leur site.',
    missIndex: 'Graphique n/d ici pour {s} :<br>TradingView ne l’autorise pas dans ce widget.<br>Il reste consultable sur leur site.',
    'consent.title': 'Ce graphique est fourni par TradingView.',
    'consent.body': 'S’il est affiché, TradingView recevra votre adresse IP et des informations techniques sur votre appareil, pourra mesurer votre utilisation du graphique et enregistrer des données sur votre appareil (traceurs).',
    'consent.refuse': 'Refuser', 'consent.accept': 'Accepter',
    'consent.small': 'Choix conservé 6 mois, modifiable à tout moment dans {link}.', 'consent.tvPolicy': 'Politique de TradingView', 'consent.ourPolicy': 'Notre politique de confidentialité',
    'consent.refused': 'Graphique désactivé : vous avez refusé le service <strong>TradingView</strong>.', 'consent.allow': 'Autoriser TradingView', 'consent.manage': 'Gérer mes choix',
    'st.open': 'Ouvert', 'st.openFoot': 'Cours de {t} · différé', 'st.break': 'Pause', 'st.breakFoot': 'Dernier cours {t}',
    'st.outdated': 'Données anciennes', 'st.outdatedFoot': 'Dernière donnée : {d}', 'st.closed': 'Fermé', 'st.closedFoot': 'Clôture {d}',
    'st.unknown': 'Statut n/d', 'st.quoteOf': 'Cours du {d}', 'st.dateNA': 'Date n/d', sparkNA: 'Courbe de séance n/d',
    offlineData: 'Hors ligne ou source injoignable — dernières données du {d} à {t}.', offlineNone: 'Hors ligne — aucune donnée en cache pour le moment.',
    staleBanner: 'Source momentanément indisponible — données de {t}.',
    sources: 'Sources', 'src.crypto': 'Crypto', fallback: '(repli)', 'src.indices': 'Indices', delayed: '(cours différés)',
    'src.companies': 'Entreprises : classement {a}, cours Yahoo Finance', 'src.charts': 'Graphiques',
    installIOS: 'Installer l’app : touchez <strong>Partager</strong> puis <strong>« Sur l’écran d’accueil »</strong>.',
    installPrompt: 'Installez Marchés sur votre écran d’accueil.', installBtn: 'Installer',
    cfd: 'Graphique : CFD qui suit le {name} (l’indice officiel n’est pas disponible dans ce widget). Le niveau peut différer légèrement.',
    etf: 'Graphique : {what} (l’indice officiel n’est pas disponible dans ce widget). Prix de l’ETF en $, pas le niveau de l’indice.',
    'etf.ixic': 'ETF Fidelity ONEQ qui réplique le Nasdaq Composite', 'etf.nifty': 'ETF iShares India 50 qui réplique le Nifty 50',
    'note.kospi': 'Graphique : ETF qui suit le KOSPI 200 (indice voisin du KOSPI, non disponible dans ce widget). Prix de l’ETF, pas le niveau de l’indice.',
  },
  en: {
    'snap.btn': 'Download image', 'snap.making': 'Creating image…', 'snap.failed': 'Failed, try again', 'snap.title': 'Heatmap image',
    'snap.hint': 'On a phone, you can also long-press the image to save it.', 'snap.close': 'Close', 'snap.share': 'Share', 'snap.save': 'Download',
    'snap.noteCrypto': '· size = market cap · excl. stablecoins', 'snap.noteStocks': '· size = market cap',
    'snap.srcCrypto': 'Source: {s} · prices in US dollars', 'snap.srcStocks': 'Sources: ranking companiesmarketcap.com · prices Yahoo Finance (delayed)',
    appName: 'Markets', loading: 'Loading…', refresh: 'Refresh', language: 'Language', back: 'Back', hide: 'Hide',
    'tab.crypto': 'Crypto', 'tab.actions': 'Stocks', 'tab.ameriques': 'Americas', 'tab.europe': 'Europe', 'tab.asie': 'Asia', 'tab.afrique': 'Africa',
    'title.crypto': 'Top 25 cryptos excl. stablecoins · 24h', 'title.actions': 'Top 25 global companies · session',
    'title.ameriques': 'Americas indices', 'title.europe': 'European indices', 'title.asie': 'Asia-Pacific indices', 'title.afrique': 'Africa & Middle East indices',
    updatedShort: 'Updated',
    'legend.down24': '24h down', 'legend.flat': 'Flat', 'legend.up24': '24h up',
    'legend.cryptoTail': '· size = market cap · excl. stablecoins · tap a tile for its chart',
    'legend.down': 'Down', 'legend.upSession': 'Up on the session', 'legend.stocksTail': '· size = market cap · tap a tile for its chart',
    'legend.index': 'Tap an index to open its TradingView chart.',
    disclaimer: 'Information only, not financial advice.',
    'legal.mentions': 'Legal notice', 'legal.privacy': 'Privacy', 'legal.cookies': 'Cookie settings', 'legal.terms': 'Terms of use', 'legal.nav': 'Legal information',
    openTV: 'Open in TradingView ↗',
    totalCap: 'Total market cap', over24h: 'over 24h', btcDom: 'BTC dominance', ofCap: 'of total market cap',
    upDown: 'Up / down', inTop25: 'in the top 25', updated: 'Updated', stale: 'stale',
    top25cap: 'Top 25 market cap', hourly: 'updated hourly', wallStreet: 'Wall Street', noData: 'Data unavailable',
    period24h: 'over 24h', periodSession: 'on the session', priceWord: 'price',
    price: 'Price', quote: 'Price', cap: 'Market cap', share: 'Top-25 share', level: 'Level', change: 'Change', prevClose: 'Prev. close',
    rank: 'rank {n}', change24: '24h change', openChart: 'Open chart',
    chartLoading: 'Loading chart…', chartUnavailable: 'Chart unavailable for now{off}.<br>Please try again shortly.', offlineSuffix: ' (offline)',
    missCrypto: 'No TradingView chart for {s}:<br>this crypto is not listed there.',
    missStock: 'Chart unavailable here for {s}:<br>TradingView does not allow this exchange in this widget.<br>It is still available on their website.',
    missIndex: 'Chart unavailable here for {s}:<br>TradingView does not allow it in this widget.<br>It is still available on their website.',
    'consent.title': 'This chart is provided by TradingView.',
    'consent.body': 'If it is displayed, TradingView will receive your IP address and technical information about your device, may measure how you use the chart and may store data on your device (trackers).',
    'consent.refuse': 'Decline', 'consent.accept': 'Accept',
    'consent.small': 'Your choice is kept for 6 months and can be changed at any time in {link}.', 'consent.tvPolicy': 'TradingView policy', 'consent.ourPolicy': 'Our privacy policy',
    'consent.refused': 'Chart disabled: you declined the <strong>TradingView</strong> service.', 'consent.allow': 'Allow TradingView', 'consent.manage': 'Manage my choices',
    'st.open': 'Open', 'st.openFoot': 'Price at {t} · delayed', 'st.break': 'Break', 'st.breakFoot': 'Last price {t}',
    'st.outdated': 'Stale data', 'st.outdatedFoot': 'Last data: {d}', 'st.closed': 'Closed', 'st.closedFoot': 'Close {d}',
    'st.unknown': 'Status n/a', 'st.quoteOf': 'Price of {d}', 'st.dateNA': 'Date n/a', sparkNA: 'Session chart n/a',
    offlineData: 'Offline or source unreachable — last data from {d} at {t}.', offlineNone: 'Offline — no cached data yet.',
    staleBanner: 'Source temporarily unavailable — data from {t}.',
    sources: 'Sources', 'src.crypto': 'Crypto', fallback: '(fallback)', 'src.indices': 'Indices', delayed: '(delayed)',
    'src.companies': 'Companies: ranking {a}, prices Yahoo Finance', 'src.charts': 'Charts',
    installIOS: 'Install the app: tap <strong>Share</strong>, then <strong>“Add to Home Screen”</strong>.',
    installPrompt: 'Install Markets on your home screen.', installBtn: 'Install',
    cfd: 'Chart: CFD tracking the {name} (the official index is not available in this widget). The level may differ slightly.',
    etf: 'Chart: {what} (the official index is not available in this widget). ETF price in $, not the index level.',
    'etf.ixic': 'the Fidelity ONEQ ETF, which replicates the Nasdaq Composite', 'etf.nifty': 'the iShares India 50 ETF, which replicates the Nifty 50',
    'note.kospi': 'Chart: ETF tracking the KOSPI 200 (close to the KOSPI, which is not available in this widget). ETF price, not the index level.',
  },
  zh: {
    'snap.btn': '下载图片', 'snap.making': '正在生成图片…', 'snap.failed': '失败，请重试', 'snap.title': '热力图图片',
    'snap.hint': '在手机上，也可以长按图片进行保存。', 'snap.close': '关闭', 'snap.share': '分享', 'snap.save': '下载',
    'snap.noteCrypto': '· 面积 = 市值 · 不含稳定币', 'snap.noteStocks': '· 面积 = 市值',
    'snap.srcCrypto': '来源：{s} · 价格以美元计', 'snap.srcStocks': '来源：排名 companiesmarketcap.com · 价格 Yahoo Finance（延迟）',
    appName: '市场行情', loading: '加载中…', refresh: '刷新', language: '语言', back: '返回', hide: '隐藏',
    'tab.crypto': '加密货币', 'tab.actions': '股票', 'tab.ameriques': '美洲', 'tab.europe': '欧洲', 'tab.asie': '亚洲', 'tab.afrique': '非洲',
    'title.crypto': '前25大加密货币（不含稳定币）· 24小时', 'title.actions': '全球市值前25大公司 · 当日',
    'title.ameriques': '美洲指数', 'title.europe': '欧洲指数', 'title.asie': '亚太指数', 'title.afrique': '非洲和中东指数',
    updatedShort: '更新于',
    'legend.down24': '24小时下跌', 'legend.flat': '持平', 'legend.up24': '24小时上涨',
    'legend.cryptoTail': '· 面积 = 市值 · 不含稳定币 · 点击方块查看图表',
    'legend.down': '下跌', 'legend.upSession': '当日上涨', 'legend.stocksTail': '· 面积 = 市值 · 点击方块查看图表',
    'legend.index': '点击指数即可打开 TradingView 图表。',
    disclaimer: '仅供参考，不构成投资建议。',
    'legal.mentions': '法律声明', 'legal.privacy': '隐私政策', 'legal.cookies': 'Cookie 设置', 'legal.terms': '使用条款', 'legal.nav': '法律信息',
    openTV: '在 TradingView 中打开 ↗',
    totalCap: '总市值', over24h: '24小时', btcDom: '比特币市值占比', ofCap: '占总市值',
    upDown: '上涨 / 下跌', inTop25: '前25名中', updated: '更新时间', stale: '旧数据',
    top25cap: '前25名总市值', hourly: '每小时更新', wallStreet: '华尔街', noData: '暂无数据',
    period24h: '24小时', periodSession: '当日', priceWord: '价格',
    price: '价格', quote: '股价', cap: '市值', share: '前25占比', level: '点位', change: '涨跌', prevClose: '前收盘',
    rank: '第{n}名', change24: '24小时涨跌', openChart: '打开图表',
    chartLoading: '图表加载中…', chartUnavailable: '图表暂时无法显示{off}。<br>请稍后重试。', offlineSuffix: '（离线）',
    missCrypto: '{s} 暂无 TradingView 图表：<br>该加密货币未在其上线。',
    missStock: '此处无法显示 {s} 的图表：<br>TradingView 不允许在此小组件中显示该交易所。<br>仍可在其网站上查看。',
    missIndex: '此处无法显示 {s} 的图表：<br>TradingView 不允许在此小组件中显示。<br>仍可在其网站上查看。',
    'consent.title': '此图表由 TradingView 提供。',
    'consent.body': '若显示该图表，TradingView 将获得您的 IP 地址和设备技术信息，可能统计您对图表的使用情况，并在您的设备上存储数据（跟踪器）。',
    'consent.refuse': '拒绝', 'consent.accept': '接受',
    'consent.small': '您的选择将保留 6 个月，可随时在{link}中修改。', 'consent.tvPolicy': 'TradingView 隐私政策', 'consent.ourPolicy': '我们的隐私政策',
    'consent.refused': '图表已停用：您已拒绝 <strong>TradingView</strong> 服务。', 'consent.allow': '允许 TradingView', 'consent.manage': '管理我的选择',
    'st.open': '交易中', 'st.openFoot': '{t} 报价 · 延迟', 'st.break': '午间休市', 'st.breakFoot': '最新报价 {t}',
    'st.outdated': '数据过旧', 'st.outdatedFoot': '最后数据：{d}', 'st.closed': '已收盘', 'st.closedFoot': '收盘 {d}',
    'st.unknown': '状态未知', 'st.quoteOf': '{d} 报价', 'st.dateNA': '日期未知', sparkNA: '暂无日内走势',
    offlineData: '离线或数据源不可用——最后数据：{d} {t}。', offlineNone: '离线——暂无缓存数据。',
    staleBanner: '数据源暂时不可用——数据时间 {t}。',
    sources: '数据来源', 'src.crypto': '加密货币', fallback: '（备用）', 'src.indices': '指数', delayed: '（延迟报价）',
    'src.companies': '公司：排名 {a}，股价 Yahoo Finance', 'src.charts': '图表',
    installIOS: '安装应用：点击<strong>分享</strong>，然后选择<strong>“添加到主屏幕”</strong>。',
    installPrompt: '将“市场行情”安装到主屏幕。', installBtn: '安装',
    cfd: '图表：跟踪{name}的差价合约（CFD）（此小组件不提供官方指数），点位可能略有差异。',
    etf: '图表：{what}（此小组件不提供官方指数）。显示的是 ETF 的美元价格，而非指数点位。',
    'etf.ixic': '复制纳斯达克综合指数的 Fidelity ONEQ ETF', 'etf.nifty': '复制 Nifty 50 指数的 iShares India 50 ETF',
    'note.kospi': '图表：跟踪 KOSPI 200 的 ETF（与 KOSPI 相近；此小组件不提供 KOSPI）。显示的是 ETF 价格，而非指数点位。',
  },
};

/** Texte traduit ; {var} est remplacé par vars.var. Repli sur le français si la clé manque. */
export function t(key, vars = {}) {
  const s = D[lang]?.[key] ?? D.fr[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

// Pays : noms reçus en français (indices) ou en anglais (classement des entreprises).
const COUNTRIES = [
  ['États-Unis', 'United States', '美国'], ['Canada', 'Canada', '加拿大'], ['Brésil', 'Brazil', '巴西'], ['Mexique', 'Mexico', '墨西哥'],
  ['Argentine', 'Argentina', '阿根廷'], ['Zone euro', 'Eurozone', '欧元区'], ['France', 'France', '法国'], ['Allemagne', 'Germany', '德国'],
  ['Royaume-Uni', 'United Kingdom', '英国'], ['Espagne', 'Spain', '西班牙'], ['Italie', 'Italy', '意大利'], ['Pays-Bas', 'Netherlands', '荷兰'],
  ['Suisse', 'Switzerland', '瑞士'], ['Belgique', 'Belgium', '比利时'], ['Portugal', 'Portugal', '葡萄牙'], ['Autriche', 'Austria', '奥地利'],
  ['Suède', 'Sweden', '瑞典'], ['Norvège', 'Norway', '挪威'], ['Pologne', 'Poland', '波兰'], ['Turquie', 'Turkey', '土耳其'],
  ['Chine', 'China', '中国'], ['Hong Kong', 'Hong Kong', '中国香港'], ['Japon', 'Japan', '日本'], ['Corée du Sud', 'South Korea', '韩国'],
  ['Taïwan', 'Taiwan', '中国台湾'], ['Inde', 'India', '印度'], ['Singapour', 'Singapore', '新加坡'], ['Indonésie', 'Indonesia', '印度尼西亚'],
  ['Malaisie', 'Malaysia', '马来西亚'], ['Thaïlande', 'Thailand', '泰国'], ['Australie', 'Australia', '澳大利亚'], ['Nouvelle-Zélande', 'New Zealand', '新西兰'],
  ['Arabie saoudite', 'Saudi Arabia', '沙特阿拉伯'], ['Israël', 'Israel', '以色列'], ['Afrique du Sud', 'South Africa', '南非'], ['Égypte', 'Egypt', '埃及'],
  ['Danemark', 'Denmark', '丹麦'], ['Irlande', 'Ireland', '爱尔兰'], ['Russie', 'Russia', '俄罗斯'], ['Émirats arabes unis', 'United Arab Emirates', '阿联酋'],
];
const COUNTRY_MAP = new Map();
for (const row of COUNTRIES) for (const name of row.slice(0, 2)) COUNTRY_MAP.set(name.toLowerCase(), row);

export function country(name) {
  if (!name) return '';
  const row = COUNTRY_MAP.get(String(name).toLowerCase());
  return row ? row[{ fr: 0, en: 1, zh: 2 }[lang]] : name;
}

// Noms usuels des indices en chinois (les noms anglais/français servent pour fr et en).
const INDEX_ZH = {
  spx: '标普500', ixic: '纳斯达克综合指数', dji: '道琼斯工业指数', rut: '罗素2000', tsx: '多伦多综合指数', ibov: '巴西IBOVESPA指数',
  ipc: '墨西哥IPC指数', merval: '阿根廷MERVAL指数', sx5e: '欧洲斯托克50', cac: '法国CAC 40', dax: '德国DAX', ftse: '英国富时100',
  ibex: '西班牙IBEX 35', ftsemib: '意大利富时MIB', aex: '荷兰AEX', smi: '瑞士SMI', bel20: '比利时BEL 20', psi: '葡萄牙PSI',
  atx: '奥地利ATX', omx: '瑞典OMX 30', osebx: '奥斯陆基准指数', wig20: '波兰WIG20', xu100: '土耳其BIST 100',
  sse: '上证综指', szse: '深证成指', csi300: '沪深300', hsi: '恒生指数', n225: '日经225', kospi: '韩国综合指数',
  taiex: '台湾加权指数', nifty: '印度Nifty 50', sensex: '孟买Sensex', sti: '海峡时报指数', jkse: '雅加达综合指数',
  klci: '吉隆坡综合指数', set: '泰国SET指数', asx200: '澳洲标普/ASX 200', nz50: '新西兰NZX 50',
  tasi: '沙特TASI指数', ta125: '特拉维夫TA-125', jse40: '南非JSE 40', egx30: '埃及EGX 30',
};
export const indexName = (ix) => (lang === 'zh' && INDEX_ZH[ix.id]) || ix.name;
