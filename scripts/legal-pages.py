"""Génère les pages juridiques (FR, EN, ZH) dans public/, public/en/, public/zh/.
Une seule source pour la structure ; la version française fait foi.
Usage : python3 scripts/legal-pages.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "public"
UPDATED = {"fr": "17 novembre 2026", "en": "17 November 2026", "zh": "2026年11月17日"}
HTML_LANG = {"fr": "fr", "en": "en", "zh": "zh-CN"}
PREFIX = {"fr": "", "en": "/en", "zh": "/zh"}
PAGES = ["mentions-legales", "confidentialite", "cookies", "cgu"]

UI = {
    "fr": {"back": "← Retour à Marchés", "updated": "Dernière mise à jour", "nav": "Informations légales",
           "links": ["Mentions légales", "Confidentialité", "Gestion des cookies", "CGU"], "app": "Marchés", "prevail": ""},
    "en": {"back": "← Back to Markets", "updated": "Last updated", "nav": "Legal information",
           "links": ["Legal notice", "Privacy", "Cookie settings", "Terms of use"], "app": "Markets",
           "prevail": "This translation is provided for convenience. In case of discrepancy, the French version prevails."},
    "zh": {"back": "← 返回市场行情", "updated": "最后更新", "nav": "法律信息",
           "links": ["法律声明", "隐私政策", "Cookie 设置", "使用条款"], "app": "市场行情",
           "prevail": "本译文仅供参考。如有歧义，以法文版本为准。"},
}

TV_PRIV = "https://www.tradingview.com/privacy-policy/"
TV_COOK = "https://www.tradingview.com/cookies-policy/"
VERCEL_PRIV = "https://vercel.com/legal/privacy-notice"
CNIL_PLAINTE = "https://www.cnil.fr/fr/adresser-une-plainte"
SUPA_PRIV = "https://supabase.com/privacy"
SUPA_DPA = "https://supabase.com/legal/dpa"
SUPA_ADDR = "65 Chulia Street #38-02/03, OCBC Centre, Singapore 049513"

EDITOR_COMMENT = """<!--
      Éditeur (à ajouter par l'éditeur ; ne publier que des informations exactes) :
      - Éditeur professionnel : nom ou dénomination, statut, adresse, téléphone, e-mail, SIREN/RCS ou RNE,
        capital et TVA intracommunautaire le cas échéant, nom du directeur de la publication.
      - Particulier (non professionnel) : peut rester anonyme (LCEN art. 1-1 II) à condition d'avoir
        communiqué son identité à l'hébergeur ; l'indiquer alors ici.
    -->"""

def a(href, text, ext=True):
    return f'<a href="{href}"{" target=\"_blank\" rel=\"noopener\"" if ext else ""}>{text}</a>'

def L(lang, page):
    return f"{PREFIX[lang]}/{page}.html"

# ---------------------------------------------------------------- contenus
def mentions(lang):
    if lang == "fr":
        return "Mentions légales", "Mentions légales du site Marchés.", f"""
    <h1>Mentions légales</h1>
    <p class="lead">Informations fournies en application de l’article 1-1 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique (LCEN).</p>
    {{UPDATED}}
    {EDITOR_COMMENT}

    <h2>Hébergeur</h2>
    <dl>
      <dt>Dénomination</dt><dd>Vercel Inc.</dd>
      <dt>Adresse</dt><dd>440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis</dd>
      <dt>Site web</dt><dd>{a("https://vercel.com", "vercel.com")}</dd>
      <dt>Contact données personnelles</dt><dd>privacy@vercel.com</dd>
    </dl>
    <h3>Hébergement des alertes de prix</h3>
    <dl>
      <dt>Dénomination</dt><dd>Supabase Pte. Ltd.</dd>
      <dt>Adresse</dt><dd>{SUPA_ADDR}</dd>
      <dt>Site web</dt><dd>{a("https://supabase.com", "supabase.com")}</dd>
      <dt>Contact données personnelles</dt><dd>privacy@supabase.com</dd>
      <dt>Lieu d’hébergement des données</dt><dd>Union européenne (région Paris, eu-west-3)</dd>
    </dl>

    <h2>Droit de réponse</h2>
    <p>Toute personne nommée ou désignée sur le site dispose d’un droit de réponse auprès du directeur de la publication (article 1-1 III de la LCEN).</p>

    <h2>Nature du service</h2>
    <p>Marchés est une application web gratuite d’information sur les marchés financiers (cryptomonnaies, indices boursiers, grandes entreprises cotées). Elle ne propose ni compte utilisateur, ni vente, ni publicité, ni service d’investissement.</p>
    <p><strong>Les informations affichées sont fournies à titre purement informatif. Elles ne constituent ni un conseil en investissement, ni une recommandation d’achat ou de vente, ni une sollicitation.</strong> Les cours des indices et des actions sont différés et peuvent être incomplets ou inexacts.</p>

    <h2>Sources des données et crédits</h2>
    <ul>
      <li>Cryptomonnaies : {a("https://www.coingecko.com/", "CoinGecko")} (« Powered by CoinGecko »), repli {a("https://coinpaprika.com/", "CoinPaprika")}.</li>
      <li>Indices et cours des actions : Yahoo Finance (cours différés).</li>
      <li>Taux de change EUR/USD (affichage en euros) : Yahoo Finance, repli {a("https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.fr.html", "Banque centrale européenne")}.</li>
      <li>Classement des entreprises par capitalisation : {a("https://companiesmarketcap.com/", "companiesmarketcap.com")}. Secteurs d’activité : classement de Yahoo Finance.</li>
      <li>Matières premières, devises et recherche d’actions : Yahoo Finance ; recherche de cryptomonnaies : CoinGecko.</li>
      <li>Agenda : dates de réunion publiées par la {a("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "Réserve fédérale (FOMC)")} et la {a("https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", "Banque centrale européenne")} ; publications de résultats : calendrier {a("https://www.nasdaq.com/market-activity/earnings", "Nasdaq")}.</li>
      <li>Actualités : Yahoo Finance (titres et liens vers les articles de leurs éditeurs). Sentiment : indice Fear &amp; Greed de {a("https://alternative.me/crypto/fear-and-greed-index/", "alternative.me")}, VIX (CBOE) via Yahoo Finance. Catégories de cryptomonnaies : CoinGecko. Calendrier économique et dividendes : {a("https://www.nasdaq.com/market-activity/economic-calendar", "Nasdaq")}.</li>
      <li>Taux d’intérêt américains : indices de rendement du Trésor américain du CBOE (^IRX, ^FVX, ^TNX, ^TYX) via Yahoo Finance. Réseau Bitcoin (hauteur de bloc, difficulté, frais, puissance de calcul) : {a("https://mempool.space/", "mempool.space")}. Historique des dividendes : Yahoo Finance ; dates de publication des résultats passés : {a("https://www.nasdaq.com/market-activity/earnings", "Nasdaq")}.</li>
      <li>Agents IA : décisions générées par le modèle Claude d’{a("https://www.anthropic.com/", "Anthropic")}, à partir des données de marché ci-dessus.</li>
      <li>Carte du monde : données {a("https://www.naturalearthdata.com/", "Natural Earth")} (domaine public), via le paquet {a("https://github.com/topojson/world-atlas", "world-atlas")} (licence ISC).</li>
      <li>Jours fériés des bourses : bibliothèque open source {a("https://github.com/gerrymanoim/exchange_calendars", "exchange_calendars")} (licence Apache 2.0), à titre indicatif ; horaires de séance : Yahoo Finance.</li>
      <li>Graphiques interactifs et logos des indices : {a("https://www.tradingview.com/", "TradingView")} (graphiques affichés uniquement avec votre accord).</li>
      <li>Graphique du mode « Trading (démo) » : TradingView Lightweight Charts™, Copyright © 2026 TradingView, Inc., {a("https://www.tradingview.com/", "tradingview.com")}, sous licence Apache 2.0 ({a("/vendor/lightweight-charts/LICENSE.txt", "texte de la licence", False)}) ; bibliothèque servie par le site, sans appel à TradingView. Bougies : Yahoo Finance, repli CoinGecko.</li>
    </ul>

    <h2>Propriété intellectuelle</h2>
    <p>La structure, le code et la présentation du site sont la propriété de l’éditeur, sauf mention contraire. Les noms, marques et logos des cryptomonnaies, entreprises, indices, bourses et fournisseurs de données cités appartiennent à leurs titulaires respectifs ; ils sont reproduits uniquement pour identifier les actifs et sources concernés, sans affiliation ni partenariat.</p>

    <h2>Données personnelles et cookies</h2>
    <p>Voir la {a(L(lang, "confidentialite"), "politique de confidentialité", False)} et la page {a(L(lang, "cookies"), "gestion des cookies", False)}.</p>"""
    if lang == "en":
        return "Legal notice", "Legal notice of the Markets website.", f"""
    <h1>Legal notice</h1>
    <p class="lead">Information provided pursuant to Article 1-1 of French Law No. 2004-575 of 21 June 2004 on confidence in the digital economy (LCEN).</p>
    {{UPDATED}}

    <h2>Hosting provider</h2>
    <dl>
      <dt>Company</dt><dd>Vercel Inc.</dd>
      <dt>Address</dt><dd>440 N Barranca Avenue #4133, Covina, CA 91723, United States</dd>
      <dt>Website</dt><dd>{a("https://vercel.com", "vercel.com")}</dd>
      <dt>Data protection contact</dt><dd>privacy@vercel.com</dd>
    </dl>
    <h3>Hosting of price alerts</h3>
    <dl>
      <dt>Company</dt><dd>Supabase Pte. Ltd.</dd>
      <dt>Address</dt><dd>{SUPA_ADDR}</dd>
      <dt>Website</dt><dd>{a("https://supabase.com", "supabase.com")}</dd>
      <dt>Data protection contact</dt><dd>privacy@supabase.com</dd>
      <dt>Data location</dt><dd>European Union (Paris region, eu-west-3)</dd>
    </dl>

    <h2>Right of reply</h2>
    <p>Any person named or referred to on the website has a right of reply, to be addressed to the publication director (Article 1-1 III of the LCEN).</p>

    <h2>Nature of the service</h2>
    <p>Markets is a free web application providing information on financial markets (cryptocurrencies, stock market indices, large listed companies). It offers no user account, no sales, no advertising and no investment service.</p>
    <p><strong>The information displayed is provided for information purposes only. It does not constitute investment advice, a recommendation to buy or sell, or a solicitation.</strong> Index and stock prices are delayed and may be incomplete or inaccurate.</p>

    <h2>Data sources and credits</h2>
    <ul>
      <li>Cryptocurrencies: {a("https://www.coingecko.com/", "CoinGecko")} (“Powered by CoinGecko”), fallback {a("https://coinpaprika.com/", "CoinPaprika")}.</li>
      <li>Indices and stock prices: Yahoo Finance (delayed prices).</li>
      <li>EUR/USD exchange rate (display in euros): Yahoo Finance, fallback {a("https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html", "European Central Bank")}.</li>
      <li>Ranking of companies by market capitalisation: {a("https://companiesmarketcap.com/", "companiesmarketcap.com")}. Business sectors: Yahoo Finance classification.</li>
      <li>Commodities, currencies and stock search: Yahoo Finance; cryptocurrency search: CoinGecko.</li>
      <li>Calendar: meeting dates published by the {a("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "Federal Reserve (FOMC)")} and the {a("https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", "European Central Bank")}; earnings reports: {a("https://www.nasdaq.com/market-activity/earnings", "Nasdaq")} calendar.</li>
      <li>News: Yahoo Finance (headlines and links to their publishers’ articles). Sentiment: {a("https://alternative.me/crypto/fear-and-greed-index/", "alternative.me")} Fear &amp; Greed Index, VIX (Cboe) via Yahoo Finance. Cryptocurrency categories: CoinGecko. Economic calendar and dividends: {a("https://www.nasdaq.com/market-activity/economic-calendar", "Nasdaq")}.</li>
      <li>US interest rates: Cboe US Treasury yield indices (^IRX, ^FVX, ^TNX, ^TYX) via Yahoo Finance. Bitcoin network (block height, difficulty, fees, hashrate): {a("https://mempool.space/", "mempool.space")}. Dividend history: Yahoo Finance; past earnings report dates: {a("https://www.nasdaq.com/market-activity/earnings", "Nasdaq")}.</li>
      <li>AI agents: decisions generated by the Claude model from {a("https://www.anthropic.com/", "Anthropic")}, based on the market data above.</li>
      <li>World map: {a("https://www.naturalearthdata.com/", "Natural Earth")} data (public domain), via the {a("https://github.com/topojson/world-atlas", "world-atlas")} package (ISC licence).</li>
      <li>Exchange holidays: open-source {a("https://github.com/gerrymanoim/exchange_calendars", "exchange_calendars")} library (Apache 2.0 licence), for information; session hours: Yahoo Finance.</li>
      <li>Interactive charts and index logos: {a("https://www.tradingview.com/", "TradingView")} (charts displayed only with your consent).</li>
      <li>“Trading (demo)” chart: TradingView Lightweight Charts™, Copyright © 2026 TradingView, Inc., {a("https://www.tradingview.com/", "tradingview.com")}, licensed under Apache 2.0 ({a("/vendor/lightweight-charts/LICENSE.txt", "license text", False)}); library served by the website, with no call to TradingView. Candles: Yahoo Finance, fallback CoinGecko.</li>
    </ul>

    <h2>Intellectual property</h2>
    <p>The structure, code and presentation of the website belong to the publisher unless stated otherwise. The names, trademarks and logos of the cryptocurrencies, companies, indices, exchanges and data providers mentioned belong to their respective owners; they are reproduced solely to identify the assets and sources concerned, without any affiliation or partnership.</p>

    <h2>Personal data and cookies</h2>
    <p>See the {a(L(lang, "confidentialite"), "privacy policy", False)} and the {a(L(lang, "cookies"), "cookie settings", False)} page.</p>"""
    return "法律声明", "市场行情网站法律声明。", f"""
    <h1>法律声明</h1>
    <p class="lead">依据法国2004年6月21日第2004-575号《数字经济信任法》（LCEN）第1-1条提供的信息。</p>
    {{UPDATED}}

    <h2>托管服务商</h2>
    <dl>
      <dt>公司名称</dt><dd>Vercel Inc.</dd>
      <dt>地址</dt><dd>440 N Barranca Avenue #4133, Covina, CA 91723, 美国</dd>
      <dt>网站</dt><dd>{a("https://vercel.com", "vercel.com")}</dd>
      <dt>个人数据联系方式</dt><dd>privacy@vercel.com</dd>
    </dl>
    <h3>价格提醒的托管</h3>
    <dl>
      <dt>公司名称</dt><dd>Supabase Pte. Ltd.</dd>
      <dt>地址</dt><dd>{SUPA_ADDR}</dd>
      <dt>网站</dt><dd>{a("https://supabase.com", "supabase.com")}</dd>
      <dt>个人数据联系方式</dt><dd>privacy@supabase.com</dd>
      <dt>数据存放地</dt><dd>欧盟（巴黎区域，eu-west-3）</dd>
    </dl>

    <h2>答辩权</h2>
    <p>在本网站上被点名或提及的任何人，均可向出版负责人行使答辩权（LCEN第1-1条第III款）。</p>

    <h2>服务性质</h2>
    <p>市场行情是一款免费的金融市场信息网络应用（加密货币、股票指数、大型上市公司）。本应用不提供用户账户、销售、广告或任何投资服务。</p>
    <p><strong>所显示的信息仅供参考，不构成投资建议、买卖推荐或任何招揽。</strong>指数和股票价格为延迟报价，可能不完整或不准确。</p>

    <h2>数据来源与致谢</h2>
    <ul>
      <li>加密货币：{a("https://www.coingecko.com/", "CoinGecko")}（“Powered by CoinGecko”），备用来源 {a("https://coinpaprika.com/", "CoinPaprika")}。</li>
      <li>指数与股价：Yahoo Finance（延迟报价）。</li>
      <li>欧元/美元汇率（以欧元显示时）：Yahoo Finance，备用来源{a("https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html", "欧洲中央银行")}。</li>
      <li>公司市值排名：{a("https://companiesmarketcap.com/", "companiesmarketcap.com")}。行业分类：Yahoo Finance。</li>
      <li>大宗商品、外汇和股票搜索：Yahoo Finance；加密货币搜索：CoinGecko。</li>
      <li>日程：{a("https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", "美联储（FOMC）")}和{a("https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html", "欧洲中央银行")}公布的会议日期；财报：{a("https://www.nasdaq.com/market-activity/earnings", "Nasdaq")} 日程。</li>
      <li>新闻：Yahoo Finance（标题及指向发布方文章的链接）。情绪：{a("https://alternative.me/crypto/fear-and-greed-index/", "alternative.me")} 恐惧与贪婪指数，VIX（芝加哥期权交易所）经 Yahoo Finance。加密货币类别：CoinGecko。经济日历和股息：{a("https://www.nasdaq.com/market-activity/economic-calendar", "Nasdaq")}。</li>
      <li>美国利率：芝加哥期权交易所美国国债收益率指数（^IRX、^FVX、^TNX、^TYX），经 Yahoo Finance。比特币网络（区块高度、难度、手续费、算力）：{a("https://mempool.space/", "mempool.space")}。股息历史：Yahoo Finance；过往财报发布日期：{a("https://www.nasdaq.com/market-activity/earnings", "Nasdaq")}。</li>
      <li>AI 智能体：决策由 {a("https://www.anthropic.com/", "Anthropic")} 的 Claude 模型根据上述市场数据生成。</li>
      <li>世界地图：{a("https://www.naturalearthdata.com/", "Natural Earth")} 数据（公有领域），经 {a("https://github.com/topojson/world-atlas", "world-atlas")} 包（ISC 许可）。</li>
      <li>交易所节假日：开源库 {a("https://github.com/gerrymanoim/exchange_calendars", "exchange_calendars")}（Apache 2.0 许可），仅供参考；交易时段：Yahoo Finance。</li>
      <li>交互式图表与指数标志：{a("https://www.tradingview.com/", "TradingView")}（仅在您同意后显示图表）。</li>
      <li>“模拟交易图表”：TradingView Lightweight Charts™，Copyright © 2026 TradingView, Inc.，{a("https://www.tradingview.com/", "tradingview.com")}，采用 Apache 2.0 许可（{a("/vendor/lightweight-charts/LICENSE.txt", "许可文本", False)}）；该库由本网站提供，不调用 TradingView。K线：Yahoo Finance，备用 CoinGecko。</li>
    </ul>

    <h2>知识产权</h2>
    <p>除另有说明外，本网站的结构、代码和界面归发布者所有。文中提及的加密货币、公司、指数、交易所及数据提供商的名称、商标和标志归其各自所有者所有，仅用于标识相关资产和来源，并不表示任何隶属或合作关系。</p>

    <h2>个人数据与 Cookie</h2>
    <p>请参阅{a(L(lang, "confidentialite"), "隐私政策", False)}和{a(L(lang, "cookies"), "Cookie 设置", False)}页面。</p>"""


DEMO = {
    "fr": ("Compte de démonstration synchronisé et classement", [
        "La synchronisation est facultative : sans elle, le compte de démonstration reste uniquement sur votre appareil. Si vous l’activez, votre appareil génère un <strong>code secret aléatoire</strong> ; le serveur n’en conserve que l’empreinte (SHA-256) et y associe le contenu du compte (argent fictif). Le serveur exécute alors vos ordres, TP et SL environ toutes les 5 minutes, même application fermée, avec les mêmes règles que l’application ; si vous l’avez demandé, il vous en prévient par notification (voir {alertes}).",
        "<strong>Toute personne qui connaît le code peut consulter et modifier le compte</strong> : gardez-le pour vous. Aucune donnée d’identité n’est demandée ; le pseudo est facultatif et visible des membres des groupes que vous rejoignez, avec votre performance (%) et votre nombre de trades : choisissez un pseudo qui ne vous identifie pas. Le classement est purement ludique.",
        "Vous pouvez arrêter la synchronisation (le compte reste sur le serveur et peut être retrouvé avec le code) ou supprimer définitivement le compte synchronisé depuis l’onglet Compte. Un compte inutilisé pendant 1 an est supprimé automatiquement."]),
    "en": ("Synced demo account and leaderboard", [
        "Sync is optional: without it, the demo account stays only on your device. If you turn it on, your device generates a <strong>random secret code</strong>; the server keeps only its fingerprint (SHA-256) together with the account content (play money). The server then executes your orders, TP and SL about every 5 minutes, even when the app is closed, with the same rules as the app; if you asked for it, it notifies you (see {alertes}).",
        "<strong>Anyone who knows the code can view and change the account</strong>: keep it to yourself. No identity data is requested; the nickname is optional and visible to members of the groups you join, together with your performance (%) and number of trades: choose a nickname that does not identify you. The leaderboard is just for fun.",
        "You can stop sync (the account stays on the server and can be recovered with the code) or permanently delete the synced account from the Account tab. An account unused for 1 year is deleted automatically."]),
    "zh": ("同步模拟账户与排行榜", [
        "同步为可选功能：不开启时，模拟账户仅保存在您的设备上。开启后，您的设备会生成一个<strong>随机密码</strong>；服务器只保存其指纹（SHA-256）及账户内容（虚拟资金）。服务器将约每 5 分钟按与应用相同的规则执行您的订单、止盈和止损，即使应用已关闭；如您要求，还会发送通知（见{alertes}）。",
        "<strong>任何知道该密码的人都可以查看和修改账户</strong>：请妥善保管。我们不要求任何身份信息；昵称为可选项，您加入的群组成员可以看到昵称、收益率（%）和交易次数：请选择无法识别您身份的昵称。排行榜仅供娱乐。",
        "您可以在“账户”标签页停止同步（账户仍保留在服务器上，可凭密码找回）或永久删除同步账户。1 年未使用的账户将被自动删除。"]),
}
for _l, _lbl in (("fr", "alertes"), ("en", "alerts"), ("zh", "提醒")):
    DEMO[_l] = (DEMO[_l][0], [x.replace("{alertes}", f'<a href="#alertes">{_lbl}</a>') for x in DEMO[_l][1]])


RESUME = {
    "fr": ("Résumés, rappels, forts mouvements et alertes techniques", [
        "Les rappels du calendrier sont facultatifs : si vous les activez (onglet « En bref »), l’appareil envoie son fuseau horaire et les symboles des actions de vos favoris (30 au plus) ; la veille d’une décision de taux de la Fed ou de la BCE, ou de la publication de résultats d’une de ces actions (entreprises de plus de 20 Md$ du calendrier Nasdaq), le serveur vous envoie une notification à partir de 18 h (heure de l’appareil) et garde la liste des rappels envoyés pendant 14 jours.",
        "Le résumé de la semaine est facultatif : si vous l’activez, l’appareil envoie son fuseau horaire et la liste de vos favoris (30 au plus, avec le symbole de cotation des indices et matières premières) ; le samedi à partir de 10 h, le serveur calcule la variation sur 7 jours de chaque favori à partir des bougies journalières publiques et vous envoie une notification ; il garde la date du dernier envoi.",
        "Le résumé quotidien est facultatif. Si vous l’activez (onglet « En bref »), l’appareil envoie au serveur l’heure choisie, son fuseau horaire et la liste de vos favoris au moment de l’activation (30 au plus). Une fois par jour, après cette heure, le serveur vous envoie une notification avec les variations de vos favoris et, si cet appareil est relié à un compte démo synchronisé, sa performance. Vous pouvez le désactiver à tout moment au même endroit.",
        "Les alertes de forts mouvements sont facultatives : si vous les activez (onglet « En bref »), l’appareil envoie le seuil choisi et la liste de vos favoris ; le serveur vous prévient au plus une fois par jour et par actif quand la variation dépasse ce seuil, et garde la date du dernier envoi pour chacun.",
        "Les alertes techniques (RSI, croisement de moyennes mobiles, volume) sont calculées par le serveur à partir des bougies journalières publiques de l’actif : seuls l’actif, son symbole de cotation et votre seuil sont enregistrés, avec les autres données d’alerte décrites ci-dessus."]),
    "en": ("Summaries, reminders, big moves and technical alerts", [
        "Calendar reminders are optional: if you turn them on (Overview tab), the device sends its time zone and the symbols of the stocks in your favorites (at most 30); the day before a Fed or ECB rate decision, or an earnings report of one of these stocks (companies over $20B in the Nasdaq calendar), the server sends you a notification from 6 pm (device time) and keeps the list of reminders sent for 14 days.",
        "The weekly summary is optional: if you turn it on, the device sends its time zone and the list of your favorites (at most 30, with the quote symbol of indices and commodities); on Saturday from 10 am, the server computes each favorite’s 7-day change from public daily candles and sends you a notification; it keeps the date of the last sending.",
        "The daily summary is optional. If you turn it on (Overview tab), the device sends the server the chosen time, its time zone and the list of your favorites at the time you turn it on (at most 30). Once a day, after that time, the server sends you a notification with the changes of your favorites and, if this device is linked to a synced demo account, its performance. You can turn it off at any time in the same place.",
        "Big move alerts are optional: if you turn them on (Overview tab), the device sends the chosen threshold and the list of your favorites; the server notifies you at most once per day and per asset when the change exceeds the threshold, and keeps the date of the last sending for each.",
        "Technical alerts (RSI, moving average crossover, volume) are computed by the server from the asset’s public daily candles: only the asset, its quote symbol and your threshold are stored, with the other alert data described above."]),
    "zh": ("摘要、日程提醒、大幅波动与技术提醒", [
        "日程提醒为可选功能：如您在“概览”标签页开启，设备会发送其时区以及自选中股票的代码（最多 30 个）；在美联储或欧洲央行利率决议、或上述股票（纳斯达克日历中市值超过 200 亿美元的公司）发布财报的前一天，服务器会在设备时间 18 点后向您发送通知，并将已发送的提醒列表保存 14 天。",
        "每周回顾为可选功能：如您开启，设备会发送其时区以及您的自选列表（最多 30 个，指数和大宗商品附带报价代码）；每周六 10 点后，服务器根据公开的日K线计算每个自选近 7 天的涨跌并向您发送通知，并保存最后发送日期。",
        "每日摘要为可选功能。如您在“概览”标签页开启，设备会向服务器发送所选时间、设备时区以及开启时的自选列表（最多 30 个）。服务器每天在该时间之后向您发送一条通知，内容为自选的涨跌，以及（如该设备已关联同步模拟账户）账户收益率。您可随时在同一位置关闭。",
        "大幅波动提醒为可选功能：如您在“概览”标签页开启，设备会发送所选阈值和自选列表；当涨跌超过阈值时，服务器每天每项资产最多通知一次，并保存每项资产的最后发送日期。",
        "技术提醒（RSI、均线交叉、成交量）由服务器根据资产公开的日K线计算：仅保存资产、其报价代码和您设定的数值，以及上文所述的其他提醒数据。"]),
}


def privacy(lang):
    if lang == "fr":
        rows = [
            ("Hébergement et journaux techniques", "Adresse IP, date et heure, page ou ressource demandée, navigateur (user-agent), réponse du serveur", "Afficher le site, assurer son fonctionnement et sa sécurité", "Intérêt légitime de l’éditeur à fournir un service sécurisé (art. 6.1.f RGPD)", "Journaux d’exécution consultables par l’éditeur : 1 heure (offre Hobby de Vercel, selon la documentation de l’hébergeur)"),
            ("Stockage local sur votre appareil", f"Dernières données de marché et dernier taux EUR/USD, langue, onglet et réglages affichés (période, top, devise), favoris, compte de démonstration (papertrading) et, si vous l’activez, son code de synchronisation, thème d’affichage, indicateurs du graphique, choix relatif aux cookies, masquage de l’aide à l’installation ; identifiant aléatoire de l’appareil si vous créez une alerte (voir {a(L(lang,'cookies'),'détail',False)})", "Afficher l’application hors ligne, mémoriser vos préférences, vos favoris et vos choix ; gérer vos alertes", "Traceurs strictement nécessaires au service demandé, exemptés de consentement (art. 82 loi Informatique et Libertés)", "Jusqu’à effacement par vous ; choix relatif aux cookies : 6 mois"),
            ("Graphiques TradingView (uniquement si vous l’acceptez)", "Adresse IP, informations sur l’appareil et le navigateur, interactions avec le graphique ; données enregistrées sur votre appareil par TradingView", "Afficher les graphiques interactifs ; TradingView indique collecter aussi des informations analytiques via ses widgets", "Votre consentement (art. 6.1.a RGPD et art. 82 loi Informatique et Libertés), retirable à tout moment", f"Selon la {a(TV_PRIV,'politique de TradingView')} ; votre choix est conservé 6 mois sur votre appareil"),
            ("Alertes de prix (uniquement si vous en créez)", "Adresse d’abonnement aux notifications attribuée par le service push de votre navigateur et clés de chiffrement associées ; empreinte (SHA-256) de l’identifiant aléatoire de l’appareil ; langue ; alertes (actif, type : prix, variation ou indicateur technique, seuil, sens, symbole de cotation, dernier côté observé des moyennes mobiles, dates de création et de déclenchement, valeur au déclenchement) ; date de dernière utilisation", "Vérifier les cours et vous envoyer les notifications d’alerte que vous avez demandées", "Exécution du service que vous demandez (art. 6.1.b RGPD) ; l’envoi de notifications nécessite en outre votre autorisation dans le navigateur, révocable à tout moment", "Alertes actives : jusqu’à leur suppression par vous ; alertes déclenchées : 30 jours ; appareil : supprimé dès que vous choisissez « Tout supprimer », si le service push signale l’abonnement comme expiré, ou après 90 jours d’inactivité sans alerte active ni résumé, rappel ou alertes de forts mouvements activés"),
            ("Résumé quotidien (uniquement si vous l’activez)", "Heure choisie, fuseau horaire de l’appareil, liste de vos favoris (type d’actif, identifiant, nom ; 30 au plus), date du dernier envoi ; données d’abonnement aux notifications de l’appareil (voir la ligne précédente)", "Vous envoyer chaque jour, à l’heure choisie, les variations de vos favoris et de votre compte démo synchronisé", "Exécution du service que vous demandez (art. 6.1.b RGPD) ; autorisation des notifications dans le navigateur", "Jusqu’à sa désactivation, « Tout supprimer » ou l’expiration de l’abonnement aux notifications signalée par le service push"),
            ("Alertes de forts mouvements (uniquement si vous les activez)", "Seuil choisi, liste de vos favoris (type d’actif, identifiant, nom ; 30 au plus), dernière date d’envoi par actif ; données d’abonnement aux notifications de l’appareil", "Vous prévenir quand un de vos favoris varie plus que le seuil (une fois par actif et par jour)", "Exécution du service que vous demandez (art. 6.1.b RGPD) ; autorisation des notifications dans le navigateur", "Jusqu’à leur désactivation, « Tout supprimer » ou l’expiration de l’abonnement aux notifications signalée par le service push"),
            ("Rappels du calendrier et résumé de la semaine (uniquement si vous les activez)", "Fuseau horaire de l’appareil ; symboles des actions de vos favoris (rappels) ou liste de vos favoris avec leur symbole de cotation (résumé ; 30 au plus) ; rappels déjà envoyés et date du dernier résumé ; données d’abonnement aux notifications de l’appareil", "Vous prévenir la veille des décisions de la Fed et de la BCE et des résultats de vos actions ; vous envoyer le samedi la variation sur 7 jours de vos favoris", "Exécution du service que vous demandez (art. 6.1.b RGPD) ; autorisation des notifications dans le navigateur", "Jusqu’à leur désactivation, « Tout supprimer » ou l’expiration de l’abonnement aux notifications signalée par le service push ; rappels envoyés : 14 jours"),
            ("Compte de démonstration synchronisé et classement (uniquement si vous l’activez)", "Empreinte (SHA-256) du code de synchronisation ; contenu du compte de démonstration (argent fictif : solde, positions, ordres, historique, courbe de valeur) ; pseudo facultatif ; groupes de classement rejoints ; performance (%), valeur du compte au début du mois (défi mensuel) et nombre de trades ; appareils reliés pour les notifications d’exécution ; dates de mise à jour et de dernière utilisation", "Retrouver le compte sur vos appareils, exécuter ordres, TP et SL même application fermée et vous en notifier si vous le demandez, afficher le classement de vos groupes", "Exécution du service que vous demandez (art. 6.1.b RGPD)", "Jusqu’à suppression par vous (« Supprimer le compte en ligne ») ou après 1 an sans utilisation ; groupe : supprimé quand il n’a plus de membre"),
            ("Échanges avec l’éditeur (si vous le contactez)", "Coordonnées et contenu du message", "Répondre à votre demande, y compris l’exercice de vos droits", "Intérêt légitime à répondre aux demandes (art. 6.1.f) ; obligation légale pour les demandes d’exercice de droits (art. 6.1.c)", "Le temps nécessaire au traitement de la demande"),
        ]
        head = ("Traitement", "Données", "Finalité", "Base légale", "Durée")
        T = dict(h1="Politique de confidentialité", desc="Politique de confidentialité et protection des données personnelles du site Marchés.",
            lead="Informations délivrées en application des articles 12 à 14 du règlement (UE) 2016/679 (RGPD) et de la loi n° 78-17 du 6 janvier 1978 « Informatique et Libertés ».",
            brief="En bref", bullets=["Pas de compte, pas d’inscription, pas de publicité, pas de mesure d’audience : <strong>le site ne vous demande ni nom, ni adresse e-mail, ni aucune donnée d’identité</strong>.", f"Le site ne dépose <strong>aucun cookie</strong>. Vos favoris, réglages et votre compte de démonstration restent sur votre appareil, sauf si vous activez la synchronisation du compte de démonstration ({a('#demo','détails',False)}).", "Les données de marché, les actualités et les logos sont récupérés par notre serveur : votre adresse IP n’est pas transmise aux fournisseurs de données ni aux sites d’où proviennent les logos. Si vous ouvrez un article d’actualité, vous quittez le site pour celui de son éditeur. Votre portefeuille réel, vos tracés et vos réglages restent sur votre appareil. Les agents IA reçoivent uniquement des données de marché publiques et le contenu de leurs propres comptes fictifs : aucune donnée vous concernant n’est envoyée à Anthropic.", "Le <strong>graphique TradingView</strong>, si vous l’acceptez, transmet des données à un tiers. Sans votre accord, il n’est pas chargé.", f"Si vous créez une <strong>alerte de prix</strong>, l’adresse d’abonnement aux notifications de votre navigateur et vos alertes sont enregistrées sur un serveur situé dans l’Union européenne, uniquement pour vous prévenir. Vous pouvez tout supprimer à tout moment ({a('#alertes','détails',False)})."],
            ctrl="Responsable du traitement", ctrl_p=f"Le responsable du traitement est l’éditeur du site (voir les {a(L(lang,'mentions-legales'),'mentions légales',False)}). L’éditeur n’est pas tenu de désigner un délégué à la protection des données (DPO) au regard de l’article 37 du RGPD.",
            proc="Données traitées, finalités, bases légales et durées", after="Aucune décision automatisée ni aucun profilage n’est réalisé par l’éditeur. Les données de marché (cours, indices, classements) ne sont pas des données personnelles.",
            dest="Destinataires", dest_li=[f"<strong>Vercel Inc.</strong> (hébergeur), en qualité de sous-traitant de l’éditeur pour l’hébergement. Vercel peut aussi traiter certaines données techniques pour ses propres besoins, conformément à sa {a(VERCEL_PRIV,'politique de confidentialité')}.", f"<strong>Supabase Pte. Ltd.</strong>, en qualité de sous-traitant de l’éditeur, pour le stockage et la vérification des alertes de prix et des comptes de démonstration synchronisés (données hébergées dans l’Union européenne, région Paris). Voir son {a(SUPA_DPA,'accord de traitement des données')} et sa {a(SUPA_PRIV,'politique de confidentialité')}.", "<strong>Le service push de votre navigateur</strong> (par exemple Google pour Chrome et Android, Apple pour Safari et iPhone, Mozilla pour Firefox, Microsoft pour Edge), uniquement si vous créez une alerte : il achemine la notification jusqu’à votre appareil. Son contenu est chiffré de bout en bout (RFC 8291) : ce service ne peut pas le lire.", f"<strong>TradingView</strong>, uniquement si vous acceptez l’affichage des graphiques, en qualité de responsable de traitement indépendant ({a(TV_PRIV,'politique de TradingView')})."],
            dest_p="Aucune donnée n’est vendue, louée ou cédée à des fins commerciales ou publicitaires.",
            transfer="Transferts hors de l’Union européenne", transfer_li=["<strong>Vercel Inc.</strong> est établie aux États-Unis. Elle déclare adhérer au cadre de protection des données UE–États-Unis (<em>EU-U.S. Data Privacy Framework</em>), qui bénéficie d’une décision d’adéquation de la Commission européenne du 10 juillet 2023 (art. 45 RGPD).", "<strong>TradingView</strong> (si vous l’acceptez) est établi notamment aux États-Unis ; les garanties applicables à ses transferts sont décrites dans sa politique de confidentialité.", f"<strong>Supabase Pte. Ltd.</strong> est établie à Singapour. Les données des alertes et des comptes synchronisés sont hébergées dans l’Union européenne ; pour les transferts hors de l’Union, son {a(SUPA_DPA,'accord de traitement des données')} prévoit les clauses contractuelles types de la Commission européenne (décision d’exécution (UE) 2021/914, art. 46 RGPD).", "<strong>Les services push des navigateurs</strong> peuvent être situés hors de l’Union européenne ; ils ne reçoivent que l’adresse d’abonnement et des notifications chiffrées."],
            rights="Vos droits", rights_p=["Vous disposez des droits d’accès, de rectification, d’effacement, de limitation du traitement, d’opposition, de portabilité, ainsi que du droit de retirer votre consentement à tout moment et de définir des directives relatives au sort de vos données après votre décès (art. 15 à 22 RGPD, art. 85 loi Informatique et Libertés).", "Pour les exercer, adressez votre demande à l’éditeur du site. Une réponse vous sera apportée dans un délai d’un mois, prolongeable de deux mois si nécessaire (art. 12 RGPD). Le site ne gérant aucun compte, l’éditeur ne dispose en général d’aucune donnée permettant de vous identifier (art. 11 RGPD).", "Pour vos alertes de prix, vous pouvez à tout moment les consulter et les supprimer vous-même dans l’onglet Favoris, ou tout supprimer (alertes et appareil) avec le bouton « Tout supprimer et désactiver les notifications ». Vous pouvez aussi retirer l’autorisation des notifications dans les réglages de votre navigateur.", f"Le retrait du consentement à TradingView se fait en un clic sur la page {a(L(lang,'cookies'),'Gestion des cookies',False)}. Les données stockées sur votre appareil peuvent être effacées depuis les réglages de votre navigateur (données du site)."],
            cnil="Réclamation auprès de la CNIL", cnil_p="Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la Commission nationale de l’informatique et des libertés (CNIL) :",
            cnil_dl=[("Adresse", "CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07"), ("Téléphone", "01 53 73 22 22"), ("Plainte en ligne", a(CNIL_PLAINTE, "cnil.fr/fr/adresser-une-plainte"))],
            sec="Sécurité", sec_p="Le site est servi exclusivement en HTTPS (HSTS activé), avec une politique de sécurité du contenu (CSP) restrictive. Il ne comporte ni compte ni mot de passe. Les interfaces de programmation (API) du site sont en lecture seule, à l’exception du relais des alertes de prix et du compte de démonstration synchronisé, et ne sont pas accessibles depuis des sites tiers. Pour les alertes, l’appareil est reconnu par un identifiant aléatoire dont seule l’empreinte est conservée sur le serveur ; les notifications sont chiffrées de bout en bout ; les secrets du service sont conservés dans un coffre chiffré (Supabase Vault).",
            minors="Mineurs", minors_p="Le site ne collecte aucune donnée nécessitant un consentement parental. L’affichage des graphiques TradingView, soumis à consentement, est destiné aux personnes de 15 ans et plus, ou autorisées par le titulaire de l’autorité parentale (art. 45 loi Informatique et Libertés).",
            mod="Modifications", mod_p="Cette politique peut évoluer. La date de dernière mise à jour figure en haut de la page.")
        T["alerts_h"], T["alerts_p"] = "Alertes de prix", ["Les alertes sont facultatives : aucune donnée n’est envoyée au serveur d’alertes tant que vous n’en créez pas. À la création de votre première alerte, votre navigateur vous demande l’autorisation d’afficher des notifications, puis crée une adresse d’abonnement propre au site ; cette adresse, les clés de chiffrement associées et vos alertes sont enregistrées pour que le serveur puisse vérifier les cours (environ toutes les 5 minutes) et vous prévenir.", "Une alerte est unique : elle se désactive après l’envoi de la notification. L’envoi n’est pas garanti (sources parfois différées, service push du navigateur) ; une alerte n’est jamais un conseil financier."]
    elif lang == "en":
        rows = [
            ("Hosting and technical logs", "IP address, date and time, page or resource requested, browser (user-agent), server response", "Display the website, ensure its operation and security", "Legitimate interest of the publisher in providing a secure service (Art. 6(1)(f) GDPR)", "Runtime logs available to the publisher: 1 hour (Vercel Hobby plan, according to the host’s documentation)"),
            ("Local storage on your device", f"Latest market data and latest EUR/USD rate, display language, tab and settings (period, top, currency), favorites, demo account (paper trading) and, if you turn it on, its sync code, display theme, chart indicators, cookie choice, dismissal of the install hint; random device identifier if you create an alert (see {a(L(lang,'cookies'),'details',False)})", "Display the app offline, remember your preferences, favorites and choices; manage your alerts", "Trackers strictly necessary for the service requested, exempt from consent (Art. 82 French Data Protection Act)", "Until you delete them; cookie choice: 6 months"),
            ("TradingView charts (only if you accept)", "IP address, device and browser information, chart interactions; data stored on your device by TradingView", "Display interactive charts; TradingView states that it also collects analytics information through its widgets", "Your consent (Art. 6(1)(a) GDPR and Art. 82 French Data Protection Act), which may be withdrawn at any time", f"According to the {a(TV_PRIV,'TradingView policy')}; your choice is kept for 6 months on your device"),
            ("Price alerts (only if you create any)", "Notification subscription address assigned by your browser’s push service and the associated encryption keys; fingerprint (SHA-256) of the device’s random identifier; language; alerts (asset, type: price, change or technical indicator, threshold, direction, quote symbol, last observed side of the moving averages, creation and trigger dates, value when triggered); date of last use", "Check prices and send you the alert notifications you requested", "Performance of the service you request (Art. 6(1)(b) GDPR); sending notifications also requires your permission in the browser, which you can revoke at any time", "Active alerts: until you delete them; triggered alerts: 30 days; device: deleted as soon as you choose “Delete everything”, if the push service reports the subscription as expired, or after 90 days of inactivity without an active alert daily summary or big move alerts"),
            ("Daily summary (only if you turn it on)", "Chosen time, device time zone, list of your favorites (asset type, identifier, name; at most 30), date of the last sending; the device’s notification subscription data (see the previous row)", "Send you every day, at the chosen time, the changes of your favorites and of your synced demo account", "Performance of the service you request (Art. 6(1)(b) GDPR); notification permission in the browser", "Until you turn it off, “Delete everything”, or the push service reports the notification subscription as expired"),
            ("Calendar reminders and weekly summary (only if you turn them on)", "Device time zone; symbols of the stocks in your favorites (reminders) or list of your favorites with their quote symbol (summary; at most 30); reminders already sent and date of the last summary; the device’s notification subscription data", "Notify you the day before Fed and ECB decisions and your stocks’ earnings; send you on Saturday the 7-day change of your favorites", "Performance of the service you request (Art. 6(1)(b) GDPR); notification permission in the browser", "Until you turn them off, “Delete everything”, or the push service reports the notification subscription as expired; reminders sent: 14 days"),
            ("Big move alerts (only if you turn them on)", "Chosen threshold, list of your favorites (asset type, identifier, name; at most 30), last sending date per asset; the device’s notification subscription data", "Notify you when one of your favorites moves more than the threshold (once per asset per day)", "Performance of the service you request (Art. 6(1)(b) GDPR); notification permission in the browser", "Until you turn them off, “Delete everything”, or the push service reports the notification subscription as expired"),
            ("Synced demo account and leaderboard (only if you turn it on)", "Fingerprint (SHA-256) of the sync code; demo account content (play money: balance, positions, orders, history, value curve); optional nickname; leaderboard groups joined; performance (%), account value at the start of the month (monthly challenge) and number of trades; devices linked for execution notifications; update and last-use dates", "Access the account from your devices, execute orders, TP and SL even when the app is closed and notify you if you ask, show your groups’ leaderboard", "Performance of the service you request (Art. 6(1)(b) GDPR)", "Until you delete it (“Delete the online account”) or after 1 year without use; group: deleted when it has no members left"),
            ("Exchanges with the publisher (if you contact them)", "Contact details and content of the message", "Answer your request, including the exercise of your rights", "Legitimate interest in answering requests (Art. 6(1)(f)); legal obligation for rights requests (Art. 6(1)(c))", "As long as necessary to handle the request"),
        ]
        head = ("Processing", "Data", "Purpose", "Legal basis", "Retention")
        T = dict(h1="Privacy policy", desc="Privacy policy and personal data protection of the Markets website.",
            lead="Information provided pursuant to Articles 12 to 14 of Regulation (EU) 2016/679 (GDPR) and French Law No. 78-17 of 6 January 1978 (“Informatique et Libertés”).",
            brief="In short", bullets=["No account, no registration, no advertising, no audience measurement: <strong>the website does not ask for your name, email address or any identity data</strong>.", f"The website sets <strong>no cookies</strong>. Your favorites, settings and demo account stay on your device, unless you turn on demo account sync ({a('#demo','details',False)}).", "Market data, news and logos are fetched by our server: your IP address is not sent to the data providers or to the websites the logos come from. If you open a news article, you leave the website for its publisher’s. Your real portfolio, drawings and settings stay on your device. The AI agents receive only public market data and the content of their own fictitious accounts: no data about you is sent to Anthropic.", "The <strong>TradingView chart</strong>, if you accept it, sends data to a third party. Without your consent, it is not loaded.", f"If you create a <strong>price alert</strong>, your browser’s notification subscription address and your alerts are stored on a server located in the European Union, solely to notify you. You can delete everything at any time ({a('#alertes','details',False)})."],
            ctrl="Data controller", ctrl_p=f"The data controller is the website publisher (see the {a(L(lang,'mentions-legales'),'legal notice',False)}). The publisher is not required to appoint a data protection officer (DPO) under Article 37 GDPR.",
            proc="Data processed, purposes, legal bases and retention", after="The publisher carries out no automated decision-making and no profiling. Market data (prices, indices, rankings) is not personal data.",
            dest="Recipients", dest_li=[f"<strong>Vercel Inc.</strong> (host), acting as the publisher’s processor for hosting. Vercel may also process certain technical data for its own purposes, in accordance with its {a(VERCEL_PRIV,'privacy notice')}.", f"<strong>Supabase Pte. Ltd.</strong>, acting as the publisher’s processor, to store and check price alerts and synced demo accounts (data hosted in the European Union, Paris region). See its {a(SUPA_DPA,'data processing agreement')} and its {a(SUPA_PRIV,'privacy policy')}.", "<strong>Your browser’s push service</strong> (for example Google for Chrome and Android, Apple for Safari and iPhone, Mozilla for Firefox, Microsoft for Edge), only if you create an alert: it delivers the notification to your device. Its content is end-to-end encrypted (RFC 8291): the push service cannot read it.", f"<strong>TradingView</strong>, only if you accept the display of charts, acting as an independent controller ({a(TV_PRIV,'TradingView policy')})."],
            dest_p="No data is sold, rented or transferred for commercial or advertising purposes.",
            transfer="Transfers outside the European Union", transfer_li=["<strong>Vercel Inc.</strong> is established in the United States. It states that it participates in the EU-U.S. Data Privacy Framework, covered by an adequacy decision of the European Commission of 10 July 2023 (Art. 45 GDPR).", "<strong>TradingView</strong> (if you accept it) is established in particular in the United States; the safeguards applicable to its transfers are described in its privacy policy.", f"<strong>Supabase Pte. Ltd.</strong> is established in Singapore. Alert and synced account data is hosted in the European Union; for transfers outside the Union, its {a(SUPA_DPA,'data processing agreement')} provides for the European Commission’s standard contractual clauses (Implementing Decision (EU) 2021/914, Art. 46 GDPR).", "<strong>Browser push services</strong> may be located outside the European Union; they only receive the subscription address and encrypted notifications."],
            rights="Your rights", rights_p=["You have the rights of access, rectification, erasure, restriction of processing, objection and portability, as well as the right to withdraw your consent at any time and to set instructions regarding your data after your death (Art. 15 to 22 GDPR, Art. 85 French Data Protection Act).", "To exercise them, send your request to the website publisher. You will receive an answer within one month, which may be extended by two months if necessary (Art. 12 GDPR). As the website manages no accounts, the publisher generally holds no data that would allow you to be identified (Art. 11 GDPR).", "For your price alerts, you can view and delete them yourself at any time in the Favorites tab, or delete everything (alerts and device) with the “Delete everything and turn off notifications” button. You can also revoke notification permission in your browser settings.", f"You can withdraw your consent to TradingView in one click on the {a(L(lang,'cookies'),'Cookie settings',False)} page. Data stored on your device can be deleted from your browser settings (site data)."],
            cnil="Complaint to the CNIL", cnil_p="If you consider that your rights are not respected, you may lodge a complaint with the French data protection authority (CNIL):",
            cnil_dl=[("Address", "CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France"), ("Phone", "+33 1 53 73 22 22"), ("Online complaint", a(CNIL_PLAINTE, "cnil.fr/fr/adresser-une-plainte"))],
            sec="Security", sec_p="The website is served exclusively over HTTPS (HSTS enabled), with a restrictive content security policy (CSP). It has no accounts or passwords. The website’s APIs are read-only, except for the price alert and synced demo account relay, and cannot be used from third-party websites. For alerts, the device is recognised by a random identifier of which only a fingerprint is kept on the server; notifications are end-to-end encrypted; the service’s secrets are kept in an encrypted vault (Supabase Vault).",
            minors="Minors", minors_p="The website collects no data requiring parental consent. The display of TradingView charts, which requires consent, is intended for persons aged 15 or over, or authorised by the holder of parental authority (Art. 45 French Data Protection Act).",
            mod="Changes", mod_p="This policy may change. The date of the last update is shown at the top of the page.")
        T["alerts_h"], T["alerts_p"] = "Price alerts", ["Alerts are optional: no data is sent to the alert server until you create one. When you create your first alert, your browser asks for permission to show notifications, then creates a subscription address specific to the website; this address, the associated encryption keys and your alerts are stored so that the server can check prices (about every 5 minutes) and notify you.", "An alert fires once: it is switched off after the notification is sent. Delivery is not guaranteed (sources sometimes delayed, browser push service); an alert is never financial advice."]
    else:
        rows = [
            ("托管与技术日志", "IP 地址、日期和时间、请求的页面或资源、浏览器（user-agent）、服务器响应", "显示网站，保障其运行与安全", "发布者提供安全服务的正当利益（GDPR 第6(1)(f)条）", "发布者可查看的运行日志：1 小时（据托管商文档，Vercel Hobby 方案）"),
            ("您设备上的本地存储", f"最新市场数据和欧元/美元汇率、显示语言、标签页和设置（时间段、排名数量、货币）、自选、模拟账户（模拟交易）及其同步码（如您开启）、显示主题、图表指标、Cookie 选择、安装提示的关闭状态；如您创建提醒，还包括设备的随机标识符（见{a(L(lang,'cookies'),'详情',False)}）", "离线显示应用，记住您的偏好、自选和选择；管理您的提醒", "所请求服务严格必需的跟踪器，无需同意（法国《信息与自由法》第82条）", "直至您删除；Cookie 选择：6 个月"),
            ("TradingView 图表（仅在您接受时）", "IP 地址、设备和浏览器信息、图表交互；TradingView 在您设备上存储的数据", "显示交互式图表；TradingView 表示其还会通过小组件收集分析信息", "您的同意（GDPR 第6(1)(a)条及《信息与自由法》第82条），可随时撤回", f"依据 {a(TV_PRIV,'TradingView 隐私政策')}；您的选择在设备上保留 6 个月"),
            ("价格提醒（仅在您创建时）", "浏览器推送服务分配的通知订阅地址及相关加密密钥；设备随机标识符的指纹（SHA-256）；语言；提醒内容（资产、类型：价格、涨跌幅或技术指标、数值、方向、报价代码、均线最后观察到的位置、创建和触发日期、触发时数值）；最后使用日期", "检查价格并向您发送您所设置的提醒通知", "履行您所请求的服务（GDPR 第6(1)(b)条）；发送通知还需您在浏览器中授权，可随时撤销", "有效提醒：直至您删除；已触发提醒：30 天；设备：在您选择“全部删除”时、推送服务报告订阅失效时，或在无有效提醒、未开启每日摘要或大幅波动提醒且 90 天未使用后删除"),
            ("每日摘要（仅在您开启时）", "所选时间、设备时区、您的自选列表（资产类型、标识符、名称；最多 30 个）、最后发送日期；设备的通知订阅数据（见上一行）", "每天在所选时间向您发送自选和同步模拟账户的涨跌", "履行您所请求的服务（GDPR 第6(1)(b)条）；浏览器中的通知授权", "直至您关闭、选择“全部删除”，或推送服务报告通知订阅失效"),
            ("日程提醒与每周回顾（仅在您开启时）", "设备时区；自选中股票的代码（日程提醒）或自选列表及其报价代码（每周回顾；最多 30 个）；已发送的提醒和最后一次回顾的日期；设备的通知订阅数据", "在美联储和欧洲央行决议及您的股票发布财报的前一天通知您；每周六发送您自选近 7 天的涨跌", "履行您所请求的服务（GDPR 第6(1)(b)条）；浏览器中的通知授权", "直至您关闭、选择“全部删除”，或推送服务报告通知订阅失效；已发送提醒：14 天"),
            ("大幅波动提醒（仅在您开启时）", "所选阈值、您的自选列表（资产类型、标识符、名称；最多 30 个）、每项资产最后发送日期；设备的通知订阅数据", "当您的某个自选涨跌超过阈值时通知您（每项资产每天一次）", "履行您所请求的服务（GDPR 第6(1)(b)条）；浏览器中的通知授权", "直至您关闭、选择“全部删除”，或推送服务报告通知订阅失效"),
            ("同步模拟账户与排行榜（仅在您开启时）", "同步码的指纹（SHA-256）；模拟账户内容（虚拟资金：余额、持仓、订单、历史、价值曲线）；可选昵称；加入的排行榜群组；收益率（%）、月初账户价值（月度挑战）和交易次数；用于成交通知的关联设备；更新和最后使用日期", "在您的设备间使用同一账户，即使应用关闭也执行订单、止盈和止损并按您的要求通知您，显示群组排行榜", "履行您所请求的服务（GDPR 第6(1)(b)条）", "直至您删除（“删除在线账户”）或 1 年未使用后；群组：无成员时删除"),
            ("与发布者的往来（如您联系发布者）", "联系方式和消息内容", "答复您的请求，包括行使您的权利", "答复请求的正当利益（第6(1)(f)条）；权利请求的法定义务（第6(1)(c)条）", "处理请求所需的时间"),
        ]
        head = ("处理活动", "数据", "目的", "法律依据", "保存期限")
        T = dict(h1="隐私政策", desc="市场行情网站的隐私政策与个人数据保护。",
            lead="依据欧盟第2016/679号条例（GDPR）第12至14条及法国1978年1月6日第78-17号《信息与自由法》提供的信息。",
            brief="简要说明", bullets=["无账户、无注册、无广告、无访问统计：<strong>本网站不会要求您提供姓名、电子邮件或任何身份信息</strong>。", f"本网站<strong>不设置任何 Cookie</strong>。您的自选、设置和模拟账户保存在您的设备上，除非您开启模拟账户同步（{a('#demo','详情',False)}）。", "市场数据、新闻和标志由我们的服务器获取：您的 IP 地址不会发送给数据提供商或标志来源网站。打开新闻文章时，您将离开本网站前往发布方网站。您的真实投资组合、画线和设置保存在您的设备上。AI 智能体仅接收公开的市场数据及其自身虚拟账户的内容：不会向 Anthropic 发送任何与您有关的数据。", "在您接受的情况下，<strong>TradingView 图表</strong>会向第三方传输数据。未经您同意，图表不会加载。", f"如您创建<strong>价格提醒</strong>，浏览器的通知订阅地址和您的提醒将存储在位于欧盟的服务器上，仅用于通知您。您可随时全部删除（{a('#alertes','详情',False)}）。"],
            ctrl="数据控制者", ctrl_p=f"数据控制者为本网站发布者（见{a(L(lang,'mentions-legales'),'法律声明',False)}）。根据 GDPR 第37条，发布者无须指定数据保护官（DPO）。",
            proc="处理的数据、目的、法律依据与保存期限", after="发布者不进行任何自动化决策或用户画像。市场数据（价格、指数、排名）不属于个人数据。",
            dest="接收方", dest_li=[f"<strong>Vercel Inc.</strong>（托管商），作为发布者的托管处理者。Vercel 也可能根据其{a(VERCEL_PRIV,'隐私声明')}为自身目的处理部分技术数据。", f"<strong>Supabase Pte. Ltd.</strong>，作为发布者的处理者，用于存储和检查价格提醒及同步模拟账户（数据存放于欧盟巴黎区域）。见其{a(SUPA_DPA,'数据处理协议')}及{a(SUPA_PRIV,'隐私政策')}。", "<strong>您浏览器的推送服务</strong>（例如 Chrome 和 Android 使用 Google，Safari 和 iPhone 使用 Apple，Firefox 使用 Mozilla，Edge 使用 Microsoft），仅在您创建提醒时：负责将通知送达您的设备。通知内容经端到端加密（RFC 8291），推送服务无法读取。", f"<strong>TradingView</strong>，仅在您接受显示图表时，作为独立的数据控制者（{a(TV_PRIV,'TradingView 隐私政策')}）。"],
            dest_p="任何数据都不会出于商业或广告目的出售、出租或转让。",
            transfer="向欧盟以外地区的传输", transfer_li=["<strong>Vercel Inc.</strong> 位于美国，声明已加入欧盟—美国数据隐私框架（EU-U.S. Data Privacy Framework），该框架获欧盟委员会2023年7月10日充分性决定认可（GDPR 第45条）。", "<strong>TradingView</strong>（如您接受）主要位于美国；其传输所适用的保障措施见其隐私政策。", f"<strong>Supabase Pte. Ltd.</strong> 位于新加坡。提醒和同步账户数据存放于欧盟；对于向欧盟以外的传输，其{a(SUPA_DPA,'数据处理协议')}规定适用欧盟委员会标准合同条款（第(EU) 2021/914号实施决定，GDPR 第46条）。", "<strong>浏览器推送服务</strong>可能位于欧盟以外；它们只接收订阅地址和加密通知。"],
            rights="您的权利", rights_p=["您享有访问、更正、删除、限制处理、反对处理和数据可携带的权利，以及随时撤回同意、并就您身后的数据处置作出指示的权利（GDPR 第15至22条，《信息与自由法》第85条）。", "如需行使上述权利，请向本网站发布者提出请求。我们将在一个月内答复，必要时可延长两个月（GDPR 第12条）。由于本网站不管理任何账户，发布者通常不持有可识别您身份的数据（GDPR 第11条）。", "对于价格提醒，您可随时在“自选”标签页中自行查看和删除，或通过“全部删除并关闭通知”按钮删除全部内容（提醒和设备）。您也可以在浏览器设置中撤销通知权限。", f"您可在{a(L(lang,'cookies'),'Cookie 设置',False)}页面一键撤回对 TradingView 的同意。存储在您设备上的数据可通过浏览器设置（网站数据）删除。"],
            cnil="向 CNIL 投诉", cnil_p="如您认为自己的权利未获尊重，可向法国国家信息与自由委员会（CNIL）提出投诉：",
            cnil_dl=[("地址", "CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France"), ("电话", "+33 1 53 73 22 22"), ("在线投诉", a(CNIL_PLAINTE, "cnil.fr/fr/adresser-une-plainte"))],
            sec="安全", sec_p="本网站仅通过 HTTPS 提供服务（已启用 HSTS），并采用严格的内容安全策略（CSP）。网站没有账户或密码。除价格提醒和同步模拟账户中转接口外，网站的 API 均为只读，且无法被第三方网站调用。对于提醒，设备通过随机标识符识别，服务器只保存其指纹；通知经端到端加密；服务密钥保存在加密保险库（Supabase Vault）中。",
            minors="未成年人", minors_p="本网站不收集任何需要父母同意的数据。需征得同意的 TradingView 图表面向15岁及以上人士，或经监护人授权者（《信息与自由法》第45条）。",
            mod="修改", mod_p="本政策可能会更新，最后更新日期见页面顶部。")
    if lang == "zh":
        T["alerts_h"], T["alerts_p"] = "价格提醒", ["提醒为可选功能：在您创建提醒之前，不会向提醒服务器发送任何数据。创建第一个提醒时，浏览器会请求显示通知的权限，然后为本网站创建专用的订阅地址；该地址、相关加密密钥和您的提醒会被存储，以便服务器检查价格（约每 5 分钟一次）并通知您。", "每个提醒只触发一次：发送通知后即停用。通知送达无法保证（数据源有时延迟，取决于浏览器推送服务）；提醒绝不构成投资建议。"]
    table = "".join(f"<tr>{''.join(f'<td>{c}</td>' for c in r)}</tr>\n          " for r in rows)
    body = f"""
    <h1>{T['h1']}</h1>
    <p class="lead">{T['lead']}</p>
    {{UPDATED}}

    <h2>{T['brief']}</h2>
    <div class="card"><ul>{''.join(f'<li>{b}</li>' for b in T['bullets'])}</ul></div>

    <h2>{T['ctrl']}</h2>
    <p>{T['ctrl_p']}</p>

    <h2>{T['proc']}</h2>
    <div class="table-wrap"><table>
      <thead><tr>{''.join(f'<th>{h}</th>' for h in head)}</tr></thead>
      <tbody>
          {table}</tbody>
    </table></div>
    <p>{T['after']}</p>

    <h2 id="alertes">{T['alerts_h']}</h2>
    {''.join(f'<p>{x}</p>' for x in T['alerts_p'])}

    <h2 id="demo">{DEMO[lang][0]}</h2>
    {''.join(f'<p>{x}</p>' for x in DEMO[lang][1])}

    <h2 id="resume">{RESUME[lang][0]}</h2>
    {''.join(f'<p>{x}</p>' for x in RESUME[lang][1])}

    <h2>{T['dest']}</h2>
    <ul>{''.join(f'<li>{x}</li>' for x in T['dest_li'])}</ul>
    <p>{T['dest_p']}</p>

    <h2>{T['transfer']}</h2>
    <ul>{''.join(f'<li>{x}</li>' for x in T['transfer_li'])}</ul>

    <h2>{T['rights']}</h2>
    {''.join(f'<p>{x}</p>' for x in T['rights_p'])}

    <h2>{T['cnil']}</h2>
    <p>{T['cnil_p']}</p>
    <dl>{''.join(f'<dt>{k}</dt><dd>{v}</dd>' for k, v in T['cnil_dl'])}</dl>

    <h2>{T['sec']}</h2>
    <p>{T['sec_p']}</p>

    <h2>{T['minors']}</h2>
    <p>{T['minors_p']}</p>

    <h2>{T['mod']}</h2>
    <p>{T['mod_p']}</p>"""
    return T["h1"], T["desc"], body


def cookies(lang):
    S = {
        "fr": dict(h1="Cookies et traceurs", desc="Cookies, traceurs et gestion de vos choix sur le site Marchés.",
            lead="Conformément à l’article 82 de la loi « Informatique et Libertés » et aux lignes directrices et recommandations de la CNIL sur les cookies et autres traceurs.",
            choices="Vos choix", tv="Graphiques TradingView", refuse="Refuser", accept="Accepter", reset="Effacer mes choix (ils seront redemandés)",
            note="Sans choix de votre part, aucun graphique TradingView n’est chargé. Votre choix, accord comme refus, est conservé 6 mois sur votre appareil, puis vous sera redemandé. La simple navigation sur le site ne vaut jamais accord.",
            own="Ce que dépose le site", own_p="<strong>Le site ne dépose aucun cookie.</strong> Il utilise uniquement le stockage local de votre navigateur, pour des usages strictement nécessaires au service que vous demandez. Ces usages sont exemptés de consentement :",
            th=("Nom", "Finalité", "Durée"),
            rows=[("<code>marches:crypto</code>, <code>marches:indices</code>, <code>marches:stocks</code>", "Dernières données de marché, pour un affichage immédiat et hors connexion", "Jusqu’à la prochaine mise à jour ou effacement"),
                  ("<code>marches:fx</code>", "Dernier taux EUR/USD, pour l’affichage en euros", "Jusqu’à la prochaine mise à jour ou effacement"),
                  ("<code>marches:tab</code>, <code>marches:lang</code>, <code>marches:prefs</code>", "Mémoriser l’onglet, la langue et les réglages affichés (période, top, devise, type de graphique, unité de temps)", "Jusqu’à effacement"),
                  ("<code>marches:favs</code>, <code>marches:favLists</code>, <code>marches:favView</code>", "Mémoriser vos favoris, vos listes de favoris et le tri choisi", "Jusqu’à effacement"),
                  ("<code>marches:paperAccounts</code>, <code>marches:paperActive</code>, <code>marches:paper:…</code>, <code>marches:paperSync:…</code>", "Uniquement si vous créez plusieurs comptes de démonstration : liste et noms des comptes, compte affiché, contenu et synchronisation de chacun", "Jusqu’à la suppression du compte ou effacement"),
                  ("<code>marches:paper</code>", "Uniquement si vous ouvrez le compte de démonstration : solde fictif, positions, ordres et historique du papertrading", "Jusqu’à « Réinitialiser le compte » ou effacement"),
                  ("<code>marches:alertsToken</code>, abonnement aux notifications du navigateur", "Uniquement si vous créez une alerte de prix : identifiant aléatoire de l’appareil pour gérer vos alertes, et abonnement permettant de recevoir les notifications", "Jusqu’à « Tout supprimer et désactiver les notifications » ou effacement"),
                  ("<code>marches:paperSync</code>", "Uniquement si vous activez la synchronisation du compte de démonstration : code secret du compte, révision et choix des notifications", "Jusqu’à l’arrêt de la synchronisation ou effacement"),
                  ("<code>marches:macro</code>", "Dernières données des matières premières et devises, pour l’affichage hors connexion", "Jusqu’à la prochaine mise à jour ou effacement"),
                  ("<code>marches:theme</code>, <code>marches:tcInd</code>, <code>marches:textScale</code>, <code>marches:screen</code>, <code>marches:tvRotate</code>", "Mémoriser le thème, la taille du texte, les indicateurs du graphique, les filtres d’actions et le choix du mode plein écran", "Jusqu’à effacement"),
                  ("<code>marches:portfolio</code>", "Uniquement si vous l’utilisez : lignes de votre portefeuille réel (actif, quantité, prix moyen d’achat, date d’achat facultative, note)", "Jusqu’à leur suppression ou effacement"),
                  ("<code>marches:tcDraw</code>", "Uniquement si vous tracez sur un graphique : lignes horizontales, tendances et niveaux de Fibonacci, par actif", "Jusqu’à « Effacer » ou effacement"),
                  ("<code>marches:plans</code>", "Uniquement si vous l’utilisez : votre plan par actif (note, objectif, invalidation ; 100 actifs au plus)", "Jusqu’à leur suppression ou effacement"),
                  ("<code>marches:ticker</code>, <code>marches:tourDone</code>, <code>marches:simPrefs</code>, <code>marches:calcPos</code>, <code>marches:calcMode</code>, <code>marches:pfEvo</code>", "Mémoriser l’affichage du bandeau des favoris, la fin de la visite guidée et les derniers réglages du simulateur, des calculatrices et de l’évolution du portefeuille", "Jusqu’à effacement"),
                  ("<code>marches:installDismissed</code>", "Ne plus afficher l’aide à l’installation de l’application", "Jusqu’à effacement"),
                  ("<code>marches:consent</code>", "Mémoriser votre choix relatif à TradingView (date, version, choix), qui sert aussi de preuve de ce choix", "6 mois"),
                  ("Cache du service worker (<code>marches-*</code>)", "Fonctionnement de l’application installée et hors connexion (pages, styles, logos, dernières données)", "Jusqu’à la prochaine version de l’application ou effacement")],
            third="Traceurs tiers soumis à votre accord", th3=("Service", "Finalité", "Données et traceurs", "Politique"),
            third_row=("TradingView (graphiques)", "Afficher les graphiques interactifs ; TradingView indique collecter des informations analytiques via ses widgets", "Adresse IP, informations sur l’appareil et le navigateur, interactions ; écriture dans le stockage local (clés « tradingview-widget.* » observées)", f"{a(TV_PRIV,'Confidentialité')} · {a(TV_COOK,'Cookies')}"),
            none="Aucun traceur publicitaire ni outil de mesure d’audience n’est utilisé sur ce site.",
            erase="Effacer les données de votre appareil", erase_p="Retirer votre accord empêche tout nouveau chargement de TradingView. Les données déjà enregistrées par TradingView ou par le site sur votre appareil s’effacent depuis les réglages de votre navigateur : par exemple, « Effacer les données de navigation » sur Chrome (Android), ou Réglages → Safari → Avancé → Données de sites web sur iPhone."),
        "en": dict(h1="Cookies and trackers", desc="Cookies, trackers and management of your choices on the Markets website.",
            lead="In accordance with Article 82 of the French Data Protection Act and the CNIL guidelines and recommendations on cookies and other trackers.",
            choices="Your choices", tv="TradingView charts", refuse="Decline", accept="Accept", reset="Clear my choices (you will be asked again)",
            note="Without a choice from you, no TradingView chart is loaded. Your choice, whether acceptance or refusal, is kept for 6 months on your device and you will then be asked again. Simply browsing the website never counts as consent.",
            own="What the website stores", own_p="<strong>The website sets no cookies.</strong> It only uses your browser’s local storage, for purposes strictly necessary for the service you request. These uses are exempt from consent:",
            th=("Name", "Purpose", "Duration"),
            rows=[("<code>marches:crypto</code>, <code>marches:indices</code>, <code>marches:stocks</code>", "Latest market data, for instant and offline display", "Until the next update or deletion"),
                  ("<code>marches:fx</code>", "Latest EUR/USD rate, for display in euros", "Until the next update or deletion"),
                  ("<code>marches:tab</code>, <code>marches:lang</code>, <code>marches:prefs</code>", "Remember the tab, language and settings displayed (period, top, currency, chart type, timeframe)", "Until deletion"),
                  ("<code>marches:favs</code>, <code>marches:favLists</code>, <code>marches:favView</code>", "Remember your favorites, your favorite lists and the chosen sort order", "Until deletion"),
                  ("<code>marches:paperAccounts</code>, <code>marches:paperActive</code>, <code>marches:paper:…</code>, <code>marches:paperSync:…</code>", "Only if you create several demo accounts: list and names of the accounts, account displayed, content and sync of each", "Until the account is deleted or deletion"),
                  ("<code>marches:paper</code>", "Only if you open the demo account: play-money balance, positions, orders and paper trading history", "Until “Reset account” or deletion"),
                  ("<code>marches:alertsToken</code>, browser notification subscription", "Only if you create a price alert: random device identifier to manage your alerts, and subscription used to receive notifications", "Until “Delete everything and turn off notifications” or deletion"),
                  ("<code>marches:paperSync</code>", "Only if you turn on demo account sync: the account’s secret code, revision and notification choice", "Until sync is stopped or deletion"),
                  ("<code>marches:macro</code>", "Latest data for commodities and currencies, for offline display", "Until the next update or deletion"),
                  ("<code>marches:theme</code>, <code>marches:tcInd</code>, <code>marches:textScale</code>, <code>marches:screen</code>, <code>marches:tvRotate</code>", "Remember the theme, text size, chart indicators, stock filters and full-screen mode choice", "Until deletion"),
                  ("<code>marches:portfolio</code>", "Only if you use it: lines of your real portfolio (asset, quantity, average purchase price, optional purchase date, note)", "Until you delete them or deletion"),
                  ("<code>marches:tcDraw</code>", "Only if you draw on a chart: horizontal lines, trend lines and Fibonacci levels, per asset", "Until “Clear” or deletion"),
                  ("<code>marches:plans</code>", "Only if you use it: your plan per asset (note, target, invalidation; at most 100 assets)", "Until you delete them or deletion"),
                  ("<code>marches:ticker</code>, <code>marches:tourDone</code>, <code>marches:simPrefs</code>, <code>marches:calcPos</code>, <code>marches:calcMode</code>, <code>marches:pfEvo</code>", "Remember whether the favorites ticker is shown, that the guided tour was completed, and the latest settings of the simulator, calculators and portfolio chart", "Until deletion"),
                  ("<code>marches:installDismissed</code>", "Stop showing the app install hint", "Until deletion"),
                  ("<code>marches:consent</code>", "Remember your TradingView choice (date, version, choice), which also serves as proof of that choice", "6 months"),
                  ("Service worker cache (<code>marches-*</code>)", "Operation of the installed app and offline mode (pages, styles, logos, latest data)", "Until the next app version or deletion")],
            third="Third-party trackers requiring your consent", th3=("Service", "Purpose", "Data and trackers", "Policy"),
            third_row=("TradingView (charts)", "Display interactive charts; TradingView states that it collects analytics information through its widgets", "IP address, device and browser information, interactions; writes to local storage (“tradingview-widget.*” keys observed)", f"{a(TV_PRIV,'Privacy')} · {a(TV_COOK,'Cookies')}"),
            none="No advertising tracker or audience measurement tool is used on this website.",
            erase="Delete data from your device", erase_p="Withdrawing your consent prevents any further loading of TradingView. Data already stored on your device by TradingView or by the website can be deleted from your browser settings: for example, “Clear browsing data” in Chrome (Android), or Settings → Safari → Advanced → Website Data on iPhone."),
        "zh": dict(h1="Cookie 与跟踪器", desc="市场行情网站的 Cookie、跟踪器及您的选择管理。",
            lead="依据法国《信息与自由法》第82条及 CNIL 关于 Cookie 和其他跟踪器的指南与建议。",
            choices="您的选择", tv="TradingView 图表", refuse="拒绝", accept="接受", reset="清除我的选择（将再次询问）",
            note="在您作出选择之前，不会加载任何 TradingView 图表。无论接受还是拒绝，您的选择都会在设备上保留 6 个月，之后将再次询问。单纯浏览本网站绝不视为同意。",
            own="本网站存储的内容", own_p="<strong>本网站不设置任何 Cookie。</strong>它仅使用浏览器的本地存储，用于您所请求服务严格必需的用途，这些用途无需征得同意：",
            th=("名称", "用途", "期限"),
            rows=[("<code>marches:crypto</code>、<code>marches:indices</code>、<code>marches:stocks</code>", "最新市场数据，用于即时和离线显示", "直至下次更新或删除"),
                  ("<code>marches:fx</code>", "最新欧元/美元汇率，用于以欧元显示", "直至下次更新或删除"),
                  ("<code>marches:tab</code>、<code>marches:lang</code>、<code>marches:prefs</code>", "记住所显示的标签页、语言和设置（时间段、排名数量、货币、图表类型、时间周期）", "直至删除"),
                  ("<code>marches:favs</code>、<code>marches:favLists</code>、<code>marches:favView</code>", "记住您的自选、自选列表和所选排序", "直至删除"),
                  ("<code>marches:paperAccounts</code>、<code>marches:paperActive</code>、<code>marches:paper:…</code>、<code>marches:paperSync:…</code>", "仅在您创建多个模拟账户时：账户列表和名称、当前显示的账户、各账户的内容和同步信息", "直至删除账户或清除数据"),
                  ("<code>marches:paper</code>", "仅在您开设模拟账户时：虚拟余额、持仓、订单和模拟交易历史", "直至“重置账户”或删除"),
                  ("<code>marches:alertsToken</code>、浏览器通知订阅", "仅在您创建价格提醒时：用于管理提醒的设备随机标识符，以及接收通知所需的订阅", "直至“全部删除并关闭通知”或删除"),
                  ("<code>marches:paperSync</code>", "仅在您开启模拟账户同步时：账户密码、版本号和通知选择", "直至停止同步或删除"),
                  ("<code>marches:macro</code>", "大宗商品和外汇的最新数据，用于离线显示", "直至下次更新或删除"),
                  ("<code>marches:theme</code>、<code>marches:tcInd</code>、<code>marches:textScale</code>、<code>marches:screen</code>、<code>marches:tvRotate</code>", "记住主题、文字大小、图表指标、股票筛选条件和全屏模式选择", "直至删除"),
                  ("<code>marches:portfolio</code>", "仅在您使用时：您真实投资组合的持仓（资产、数量、平均买入价、可选的买入日期、备注）", "直至您删除或清除数据"),
                  ("<code>marches:tcDraw</code>", "仅在您在图表上画线时：各资产的水平线、趋势线和斐波那契水平", "直至“清除”或清除数据"),
                  ("<code>marches:plans</code>", "仅在您使用时：各资产的交易计划（笔记、目标、失效点；最多 100 个资产）", "直至您删除或清除数据"),
                  ("<code>marches:ticker</code>、<code>marches:tourDone</code>、<code>marches:simPrefs</code>、<code>marches:calcPos</code>、<code>marches:calcMode</code>、<code>marches:pfEvo</code>", "记住是否显示自选滚动条、是否已完成功能导览，以及模拟器、计算器和投资组合走势的最近设置", "直至删除"),
                  ("<code>marches:installDismissed</code>", "不再显示应用安装提示", "直至删除"),
                  ("<code>marches:consent</code>", "记住您对 TradingView 的选择（日期、版本、选择），同时作为该选择的证明", "6 个月"),
                  ("Service worker 缓存（<code>marches-*</code>）", "已安装应用及离线模式的运行（页面、样式、标志、最新数据）", "直至应用下一版本或删除")],
            third="需征得您同意的第三方跟踪器", th3=("服务", "用途", "数据与跟踪器", "政策"),
            third_row=("TradingView（图表）", "显示交互式图表；TradingView 表示其会通过小组件收集分析信息", "IP 地址、设备和浏览器信息、交互；写入本地存储（观察到“tradingview-widget.*”键）", f"{a(TV_PRIV,'隐私')} · {a(TV_COOK,'Cookie')}"),
            none="本网站不使用任何广告跟踪器或访问统计工具。",
            erase="删除您设备上的数据", erase_p="撤回同意后将不再加载 TradingView。TradingView 或本网站已存储在您设备上的数据，可通过浏览器设置删除：例如 Chrome（Android）中的“清除浏览数据”，或 iPhone 上的 设置 → Safari → 高级 → 网站数据。"),
    }[lang]
    rows = "".join(f"<tr>{''.join(f'<td>{c}</td>' for c in r)}</tr>\n          " for r in S["rows"])
    body = f"""
    <h1>{S['h1']}</h1>
    <p class="lead">{S['lead']}</p>
    {{UPDATED}}

    <h2>{S['choices']}</h2>
    <div class="card">
      <h3 style="margin-top:0">{S['tv']}</h3>
      <p id="tv-purpose" style="margin:0"></p>
      <span id="tv-status" class="status" aria-live="polite">…</span>
      <div class="consent-actions">
        <button type="button" class="btn" id="tv-refuse">{S['refuse']}</button>
        <button type="button" class="btn" id="tv-accept">{S['accept']}</button>
      </div>
      <p class="consent-small" id="tv-record"></p>
      <p class="consent-small"><button type="button" class="btn" id="consent-reset" style="min-height:36px;font-size:13px">{S['reset']}</button></p>
    </div>
    <p>{S['note']}</p>

    <h2>{S['own']}</h2>
    <p>{S['own_p']}</p>
    <div class="table-wrap"><table>
      <thead><tr>{''.join(f'<th>{h}</th>' for h in S['th'])}</tr></thead>
      <tbody>
          {rows}</tbody>
    </table></div>

    <h2>{S['third']}</h2>
    <div class="table-wrap"><table>
      <thead><tr>{''.join(f'<th>{h}</th>' for h in S['th3'])}</tr></thead>
      <tbody><tr>{''.join(f'<td>{c}</td>' for c in S['third_row'])}</tr></tbody>
    </table></div>
    <p>{S['none']}</p>

    <h2>{S['erase']}</h2>
    <p>{S['erase_p']}</p>"""
    return S["h1"], S["desc"], body


def cgu(lang):
    if lang == "fr":
        h1, desc = "Conditions générales d’utilisation", "Conditions générales d’utilisation du site Marchés."
        secs = [
            ("1. Objet", f"Les présentes conditions générales d’utilisation (CGU) encadrent l’accès au site et à l’application web « Marchés » (le « Service »), édités par la personne identifiée dans les {a(L(lang,'mentions-legales'),'mentions légales',False)} (l’« Éditeur »). L’utilisation du Service implique l’acceptation des présentes CGU."),
            ("2. Description du Service", "Le Service affiche gratuitement des informations de marché : cryptomonnaies, indices boursiers, plus grandes entreprises cotées, ainsi que des graphiques fournis par des tiers. Il permet aussi d’enregistrer des favoris sur l’appareil, de créer des alertes de prix et d’utiliser un compte de démonstration en argent fictif. Il ne nécessite aucune inscription. Il ne propose ni vente, ni abonnement payant, ni service d’investissement, ni conservation ou échange d’actifs."),
            ("3. Accès", "Le Service est accessible gratuitement à toute personne disposant d’un accès à Internet ; les frais de connexion restent à la charge de l’utilisateur. L’Éditeur s’efforce d’assurer la disponibilité du Service, sans obligation de résultat. Il peut le suspendre, le modifier ou l’interrompre, notamment pour maintenance ou en cas d’indisponibilité des sources de données."),
            ("4. Nature des informations — absence de conseil en investissement", "<strong>Les informations sont fournies à titre purement informatif et général. Elles ne constituent ni un conseil en investissement, ni une recommandation personnalisée, ni une incitation à acheter ou vendre un instrument financier ou un actif numérique.</strong></p><p>Les données proviennent de sources tierces (voir les mentions légales). Elles peuvent être différées, incomplètes ou erronées, ou ne plus être mises à jour par leur source. Lorsqu’une donnée est indisponible ou douteuse, le Service affiche « n/d » ou « Données anciennes ». Certains graphiques reposent sur des instruments qui suivent un indice (CFD, ETF) plutôt que sur l’indice lui-même ; cela est alors signalé à l’écran.</p><p>Investir comporte des risques, dont celui de perte en capital ; les actifs numériques sont particulièrement volatils. Toute décision d’investissement relève de la seule responsabilité de l’utilisateur."),
            ("5. Responsabilité", "Dans les limites autorisées par la loi, l’Éditeur ne saurait être tenu responsable des décisions prises sur la base des informations affichées ou des alertes reçues, ni des erreurs, retards ou interruptions des sources de données tierces, des hébergeurs ou des services de notification. Rien dans les présentes CGU n’exclut une responsabilité qui ne peut légalement être exclue."),
            ("6. Contenus et services tiers", "Le Service intègre, avec votre accord, des graphiques fournis par TradingView. Il contient aussi des liens vers des sites tiers, notamment les actualités : ce sont des titres publiés par des tiers, avec un lien vers l’article de leur éditeur ; l’Éditeur n’en est pas l’auteur et n’en garantit ni l’exactitude ni l’actualité. Ces services sont régis par leurs propres conditions et politiques, sur lesquelles l’Éditeur n’a aucun contrôle."),
            ("6 bis. Alertes de prix", f"Le Service permet de créer gratuitement des alertes de prix envoyées par notification, sous réserve d’autoriser les notifications dans le navigateur. Les cours sont vérifiés environ toutes les 5 minutes à partir des mêmes sources que le Service, qui peuvent être différées : <strong>l’envoi, le délai et l’exactitude des alertes ne sont pas garantis</strong>, et une alerte ne constitue jamais un conseil en investissement. Chaque appareil peut avoir au plus 20 alertes actives, dont 10 alertes techniques (RSI, croisement de moyennes mobiles, volume), calculées sur des bougies journalières dont la dernière peut être incomplète. Le résumé quotidien facultatif suit les mêmes réserves : son envoi et son heure exacte ne sont pas garantis. Vous pouvez supprimer vos alertes à tout moment ; leur traitement est décrit dans la {a(L(lang,'confidentialite') + '#alertes','politique de confidentialité',False)}."),
            ("6 ter. Compte de démonstration (papertrading)", "Le Service propose un compte de démonstration permettant de simuler des achats et des ventes, y compris à découvert et avec effet de levier, <strong>avec de l’argent fictif</strong>. Aucun ordre n’est transmis à un intermédiaire ou à un marché, aucun dépôt n’est possible et aucun gain ni aucune perte réels ne peuvent en résulter. Les ordres sont exécutés au cours affiché lors des vérifications de l’application (environ toutes les 60 secondes quand elle est ouverte), avec des frais simulés de 0,1 % et sans spread, glissement ni frais de financement ; quand l’application était fermée, ils s’exécutent à sa réouverture au cours du moment, ou environ toutes les 5 minutes sur le serveur si vous avez activé la synchronisation du compte. Lorsque le marché d’une action ou d’un indice est fermé, un ordre au marché est exécuté au dernier cours connu. Le compte est tenu en dollars US : les actifs cotés dans une autre devise sont convertis au taux de change du moment ; pour un indice, une unité correspond à un point valorisé dans la devise de l’indice. Ces conditions diffèrent de celles d’un marché réel : <strong>les performances simulées ne préjugent pas de résultats réels</strong> et ne constituent pas un conseil en investissement. Sauf si la synchronisation est activée, le compte est stocké uniquement sur l’appareil de l’utilisateur ; il peut être perdu si les données du navigateur sont effacées. Le classement (y compris le défi mensuel) est purement ludique. L’app propose aussi plusieurs comptes de démonstration, des ordres liés (OCO), un stop suiveur et un simulateur d’achats programmés : ce sont des simulations à but pédagogique, calculées sur des cours passés ou différés, qui ne préjugent pas des résultats réels. Le « portefeuille réel » est une simple saisie manuelle, sans lien avec un courtier : ses valeurs sont indicatives (cours parfois différés, taux de change actuel, sans frais ni impôts). Les alertes de forts mouvements, les rappels du calendrier et le résumé de la semaine suivent les mêmes réserves que les autres alertes. La saisonnalité, le simulateur d’investissement régulier, les calculatrices (taille de position, intérêts composés), les corrélations et la date estimée du halving de Bitcoin sont des outils pédagogiques calculés sur des données passées ou des hypothèses affichées : ils ne prédisent pas l’avenir et ne constituent pas un conseil en investissement. L’évolution du portefeuille réel et les dividendes reçus sont des estimations (quantités actuelles, taux de change actuel, montants bruts avant impôts)."),
            ("6 quater. Agents IA", "Le Service présente des agents d’intelligence artificielle qui gèrent chacun un compte de démonstration <strong>avec de l’argent fictif</strong>. Leurs décisions (ordres et explications) sont <strong>générées automatiquement par un modèle d’IA</strong> (Claude, d’Anthropic) à partir des données de marché affichées par le Service, puis contrôlées par des règles fixes (taille des positions, levier, stop loss) avant d’être exécutées par le moteur de démonstration. Elles peuvent être erronées, incomplètes ou fondées sur des données différées, et ne reflètent ni l’avis de l’éditeur ni celui d’Anthropic. Elles sont publiées à titre pédagogique et de divertissement : elles ne constituent pas une recommandation d’investissement, une analyse financière ni un conseil, et les performances de ces comptes fictifs ne préjugent pas de résultats réels. Aucun ordre n’est transmis à un marché. L’éditeur peut suspendre ou modifier les agents à tout moment."),
            ("7. Propriété intellectuelle", "La structure, le code et la présentation du Service appartiennent à l’Éditeur, sauf mention contraire. Toute reproduction ou réutilisation substantielle sans autorisation est interdite. Les marques, noms et logos de tiers appartiennent à leurs titulaires ; ils sont affichés uniquement à des fins d’identification."),
            ("8. Usage acceptable", "Il est interdit de perturber le fonctionnement du Service, notamment par des requêtes automatisées massives sur ses interfaces de programmation, ou de tenter d’accéder à ses systèmes sans autorisation."),
            ("9. Données personnelles", f"Le traitement des données personnelles est décrit dans la {a(L(lang,'confidentialite'),'politique de confidentialité',False)} et la page {a(L(lang,'cookies'),'gestion des cookies',False)}."),
            ("10. Langues", "Le Service et ses documents juridiques sont proposés en français, en anglais et en chinois. En cas de divergence, la version française fait foi."),
            ("11. Modification des CGU", "L’Éditeur peut modifier les présentes CGU. La version applicable est celle publiée sur le site au moment de l’utilisation ; sa date figure en haut de la page."),
            ("12. Droit applicable et litiges", "Les présentes CGU sont régies par le droit français. En cas de litige, une solution amiable sera recherchée en priorité en contactant l’Éditeur. À défaut, les tribunaux français sont compétents, sous réserve des règles impératives protégeant le consommateur."),
        ]
    elif lang == "en":
        h1, desc = "Terms of use", "Terms of use of the Markets website."
        secs = [
            ("1. Purpose", f"These terms of use govern access to the “Markets” website and web application (the “Service”), published by the person identified in the {a(L(lang,'mentions-legales'),'legal notice',False)} (the “Publisher”). Using the Service implies acceptance of these terms."),
            ("2. Description of the Service", "The Service displays market information free of charge: cryptocurrencies, stock market indices, the largest listed companies, as well as charts provided by third parties. It also lets you save favorites on your device, create price alerts and use a demo account with play money. No registration is required. It offers no sales, no paid subscription, no investment service and no custody or exchange of assets."),
            ("3. Access", "The Service is freely accessible to anyone with Internet access; connection costs are borne by the user. The Publisher endeavours to keep the Service available, without any guarantee of result. It may suspend, modify or discontinue it, in particular for maintenance or if data sources are unavailable."),
            ("4. Nature of the information — no investment advice", "<strong>The information is provided for general information purposes only. It does not constitute investment advice, a personalised recommendation, or an incentive to buy or sell any financial instrument or digital asset.</strong></p><p>The data comes from third-party sources (see the legal notice). It may be delayed, incomplete or inaccurate, or no longer updated by its source. When data is unavailable or doubtful, the Service displays “n/a” or “Stale data”. Some charts are based on instruments that track an index (CFDs, ETFs) rather than the index itself; this is then indicated on screen.</p><p>Investing involves risks, including the risk of capital loss; digital assets are particularly volatile. Any investment decision is the sole responsibility of the user."),
            ("5. Liability", "To the extent permitted by law, the Publisher cannot be held liable for decisions made on the basis of the information displayed or of alerts received, nor for errors, delays or interruptions of third-party data sources, hosts or notification services. Nothing in these terms excludes any liability that cannot legally be excluded."),
            ("6. Third-party content and services", "With your consent, the Service embeds charts provided by TradingView. It also contains links to third-party websites, including news: these are headlines published by third parties, with a link to the publisher’s article; the Publisher is not their author and does not guarantee their accuracy or timeliness. These services are governed by their own terms and policies, over which the Publisher has no control."),
            ("6a. Price alerts", f"The Service lets you create free price alerts sent by notification, provided you allow notifications in your browser. Prices are checked about every 5 minutes using the same sources as the Service, which may be delayed: <strong>the delivery, timing and accuracy of alerts are not guaranteed</strong>, and an alert never constitutes investment advice. Each device may have at most 20 active alerts, including 10 technical alerts (RSI, moving average crossover, volume), computed on daily candles of which the last may be incomplete. The optional daily summary is subject to the same reservations: its sending and exact time are not guaranteed. You can delete your alerts at any time; their processing is described in the {a(L(lang,'confidentialite') + '#alertes','privacy policy',False)}."),
            ("6b. Demo account (paper trading)", "The Service offers a demo account for simulating purchases and sales, including short selling and leverage, <strong>with play money</strong>. No order is sent to any intermediary or market, no deposit is possible and no real gain or loss can result. Orders are executed at the price displayed when the app checks prices (about every 60 seconds while it is open), with simulated fees of 0.1% and no spread, slippage or financing costs; if the app was closed, they execute when it is reopened at the price at that moment, or about every 5 minutes on the server if you turned on account sync. When the market of a stock or index is closed, a market order executes at the last known price. The account is kept in US dollars: assets quoted in another currency are converted at the current exchange rate; for an index, one unit corresponds to one point valued in the index currency. These conditions differ from those of a real market: <strong>simulated performance is no indication of real results</strong> and does not constitute investment advice. Unless sync is turned on, the account is stored only on the user’s device and may be lost if browser data is deleted. The leaderboard (including the monthly challenge) is just for fun. The app also offers several demo accounts, linked orders (OCO), a trailing stop and a recurring investment simulator: these are educational simulations computed on past or delayed prices, which do not predict real results. The “real portfolio” is a simple manual entry, with no link to any broker: its values are indicative (prices sometimes delayed, current exchange rate, no fees or taxes). Big move alerts, calendar reminders and the weekly summary are subject to the same reservations as other alerts. Seasonality, the recurring investment simulator, the calculators (position size, compound interest), correlations and the estimated Bitcoin halving date are educational tools computed on past data or displayed assumptions: they do not predict the future and do not constitute investment advice. The real portfolio’s history and dividends received are estimates (current quantities, current exchange rate, gross amounts before tax)."),
            ("6c. AI agents", "The Service shows artificial intelligence agents that each manage a demo account <strong>with play money</strong>. Their decisions (orders and explanations) are <strong>generated automatically by an AI model</strong> (Claude, by Anthropic) from the market data shown by the Service, then checked against fixed rules (position size, leverage, stop loss) before being executed by the demo engine. They may be wrong, incomplete or based on delayed data, and reflect the views of neither the Publisher nor Anthropic. They are published for educational and entertainment purposes: they are not an investment recommendation, financial analysis or advice, and the performance of these fictitious accounts is no indication of real results. No order is sent to any market. The Publisher may suspend or change the agents at any time."),
            ("7. Intellectual property", "The structure, code and presentation of the Service belong to the Publisher unless stated otherwise. Any substantial reproduction or reuse without permission is prohibited. Third-party trademarks, names and logos belong to their owners and are displayed for identification purposes only."),
            ("8. Acceptable use", "It is forbidden to disrupt the operation of the Service, in particular through massive automated requests to its APIs, or to attempt to access its systems without authorisation."),
            ("9. Personal data", f"The processing of personal data is described in the {a(L(lang,'confidentialite'),'privacy policy',False)} and on the {a(L(lang,'cookies'),'cookie settings',False)} page."),
            ("10. Languages", "The Service and its legal documents are available in French, English and Chinese. In case of discrepancy, the French version prevails."),
            ("11. Changes to the terms", "The Publisher may amend these terms. The applicable version is the one published on the website at the time of use; its date is shown at the top of the page."),
            ("12. Governing law and disputes", "These terms are governed by French law. In the event of a dispute, an amicable solution will first be sought by contacting the Publisher. Failing that, the French courts have jurisdiction, subject to mandatory consumer protection rules."),
        ]
    else:
        h1, desc = "使用条款", "市场行情网站使用条款。"
        secs = [
            ("1. 目的", f"本使用条款规范对“市场行情”网站及网络应用（以下简称“本服务”）的访问。本服务由{a(L(lang,'mentions-legales'),'法律声明',False)}中所列之人（以下简称“发布者”）发布。使用本服务即表示接受本条款。"),
            ("2. 服务说明", "本服务免费显示市场信息：加密货币、股票指数、最大的上市公司，以及由第三方提供的图表，并可在设备上保存自选、创建价格提醒及使用虚拟资金的模拟账户。无需注册。本服务不提供销售、付费订阅、投资服务，亦不提供资产托管或交易。"),
            ("3. 访问", "任何能够访问互联网的人均可免费使用本服务；网络费用由用户自行承担。发布者尽力保证本服务的可用性，但不作结果保证，并可因维护或数据来源不可用等原因暂停、修改或终止本服务。"),
            ("4. 信息性质——不构成投资建议", "<strong>所提供的信息仅供一般参考，不构成投资建议、个性化推荐，亦不构成买卖任何金融工具或数字资产的诱导。</strong></p><p>数据来自第三方来源（见法律声明），可能存在延迟、不完整或错误，或已不再由其来源更新。当数据不可用或存疑时，本服务会显示“n/d”或“数据过旧”。部分图表基于跟踪指数的工具（差价合约、ETF）而非指数本身，届时会在屏幕上注明。</p><p>投资存在风险，包括本金损失的风险；数字资产波动尤其剧烈。任何投资决定均由用户自行负责。"),
            ("5. 责任", "在法律允许的范围内，发布者不对基于所显示信息或所收到提醒作出的决定负责，亦不对第三方数据来源、托管商或通知服务的错误、延迟或中断负责。本条款不排除任何依法不得排除的责任。"),
            ("6. 第三方内容与服务", "经您同意，本服务会嵌入 TradingView 提供的图表，并包含指向第三方网站的链接，包括新闻：这些是第三方发布的标题，并附有指向发布方文章的链接；发布者不是其作者，也不保证其准确性或时效性。这些服务受其自身条款和政策约束，发布者对此无控制权。"),
            ("6之二. 价格提醒", f"本服务可免费创建通过通知发送的价格提醒，前提是您在浏览器中允许通知。系统约每 5 分钟使用与本服务相同的数据源（可能延迟）检查一次价格：<strong>提醒的发送、时效和准确性均不作保证</strong>，提醒亦绝不构成投资建议。每台设备最多可有 20 个有效提醒，其中技术提醒（RSI、均线交叉、成交量）最多 10 个，基于日K线计算，最后一根K线可能不完整。可选的每日摘要同样如此：不保证发送及准确时间。您可随时删除提醒；其处理方式见{a(L(lang,'confidentialite') + '#alertes','隐私政策',False)}。"),
            ("6之三. 模拟账户（模拟交易）", "本服务提供模拟账户，可<strong>使用虚拟资金</strong>模拟买入和卖出，包括做空和使用杠杆。任何订单都不会发送给中介或市场，无法入金，也不会产生任何真实盈亏。订单按应用检查价格时（应用打开时约每 60 秒）显示的价格执行，模拟手续费为 0.1%，不含点差、滑点或融资费用；若应用关闭，则在重新打开时按当时价格执行；如您开启了账户同步，则由服务器约每 5 分钟执行一次。股票或指数收盘期间，市价单按最后已知价格成交。账户以美元计：以其他货币计价的资产按当时汇率换算；指数的 1 单位对应以指数货币计价的 1 点。上述条件与真实市场不同：<strong>模拟业绩不代表真实结果</strong>，亦不构成投资建议。除非开启同步，账户仅保存在用户设备上，清除浏览器数据后可能丢失。排行榜（包括月度挑战）仅供娱乐。应用还提供多个模拟账户、关联订单（OCO）、移动止损和定投模拟器：这些都是基于历史或延迟价格的教学模拟，不代表真实结果。“真实投资组合”仅为手动输入，不连接任何券商：其数值仅供参考（价格可能延迟，按当前汇率计算，不含费用和税费）。大幅波动提醒、日程提醒和每周回顾与其他提醒适用相同的保留条款。季节性、定投模拟器、计算器（仓位大小、复利）、相关性以及比特币减半的预计日期均为基于历史数据或所示假设计算的教学工具：它们不能预测未来，亦不构成投资建议。真实投资组合的走势和已收股息均为估算（按当前数量、当前汇率计算，税前总额）。"),
            ("6之四. AI 智能体", "本服务展示若干人工智能体，各自管理一个<strong>使用虚拟资金</strong>的模拟账户。其决策（订单及说明）由<strong>人工智能模型自动生成</strong>（Anthropic 的 Claude），依据本服务显示的市场数据，并在由模拟引擎执行前经过固定规则（仓位大小、杠杆、止损）校验。这些决策可能有误、不完整或基于延迟数据，既不代表发布者的观点，也不代表 Anthropic 的观点。其发布仅用于教学和娱乐：不构成投资建议、财务分析或任何建议，这些虚拟账户的表现不代表真实结果。任何订单都不会发送到市场。发布者可随时暂停或修改智能体。"),
            ("7. 知识产权", "除另有说明外，本服务的结构、代码和界面归发布者所有。未经许可，禁止实质性复制或再利用。第三方商标、名称和标志归其所有者所有，仅用于标识目的。"),
            ("8. 合理使用", "禁止干扰本服务的运行，特别是对其 API 发起大量自动化请求，或试图未经授权访问其系统。"),
            ("9. 个人数据", f"个人数据的处理方式见{a(L(lang,'confidentialite'),'隐私政策',False)}和{a(L(lang,'cookies'),'Cookie 设置',False)}页面。"),
            ("10. 语言", "本服务及其法律文件提供法文、英文和中文版本。如有歧义，以法文版本为准。"),
            ("11. 条款修改", "发布者可修改本条款。适用版本为使用时网站上发布的版本，其日期见页面顶部。"),
            ("12. 适用法律与争议", "本条款受法国法律管辖。如发生争议，应首先联系发布者寻求友好解决；协商不成的，由法国法院管辖，但不影响保护消费者的强制性规定。"),
        ]
    body = f"""
    <h1>{h1}</h1>
    {{UPDATED}}
""" + "".join(f"""
    <h2>{t}</h2>
    <p>{p}</p>
""" for t, p in secs)
    return h1, desc, body


BUILDERS = {"mentions-legales": mentions, "confidentialite": privacy, "cookies": cookies, "cgu": cgu}

def page(lang, name):
    ui = UI[lang]
    title, desc, body = BUILDERS[name](lang)
    body = body.replace("{UPDATED}", f'<p class="updated">{ui["updated"]} : {UPDATED[lang]}</p>' if lang == "fr" else f'<p class="updated">{ui["updated"]}: {UPDATED[lang]}</p>')
    prevail = f'\n    <p class="lead">{ui["prevail"]}</p>' if ui["prevail"] else ""
    switch = " · ".join(
        f'<a href="{L(l, name)}" hreflang="{HTML_LANG[l]}" data-setlang="{l}"{" aria-current=\"true\"" if l == lang else ""}>{lbl}</a>'
        for l, lbl in (("fr", "FR"), ("en", "EN"), ("zh", "中文")))
    alternates = "\n  ".join(f'<link rel="alternate" hreflang="{HTML_LANG[l]}" href="{L(l, name)}">' for l in ("fr", "en", "zh"))
    links = "\n      ".join(
        f'<a href="{L(lang, p)}"{" aria-current=\"page\"" if p == name else ""}>{lbl}</a>' for p, lbl in zip(PAGES, ui["links"]))
    script = '\n  <script src="/assets/cookies-page.js" type="module"></script>' if name == "cookies" else ""
    return f"""<!doctype html>
<html lang="{HTML_LANG[lang]}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{title} — {ui['app']}</title>
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="#0b0f14">
  <meta name="color-scheme" content="dark">
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
  <link rel="stylesheet" href="/assets/styles.css">
  <script src="/assets/theme.js"></script>
  {alternates}
</head>
<body class="doc">
  <header class="topbar"><div class="topbar-row"><a class="back" href="/">{ui['back']}</a><nav class="lang-switch" aria-label="Langue / Language / 语言">{switch}</nav></div></header>
  <main id="main">{body}{prevail}

    <nav class="legal-links" aria-label="{ui['nav']}">
      {links}
    </nav>
  </main>
  <script src="/assets/legal.js" type="module"></script>{script}
</body>
</html>
"""

for lang in ("fr", "en", "zh"):
    out = ROOT if lang == "fr" else ROOT / lang
    out.mkdir(parents=True, exist_ok=True)
    for name in PAGES:
        (out / f"{name}.html").write_text(page(lang, name), encoding="utf-8")
print("pages juridiques générées (fr, en, zh)")
