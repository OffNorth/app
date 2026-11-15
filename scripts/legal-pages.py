"""Génère les pages juridiques (FR, EN, ZH) dans public/, public/en/, public/zh/.
Une seule source pour la structure ; la version française fait foi.
Usage : python3 scripts/legal-pages.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "public"
UPDATED = {"fr": "15 novembre 2026", "en": "15 November 2026", "zh": "2026年11月15日"}
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

    <h2>Droit de réponse</h2>
    <p>Toute personne nommée ou désignée sur le site dispose d’un droit de réponse auprès du directeur de la publication (article 1-1 III de la LCEN).</p>

    <h2>Nature du service</h2>
    <p>Marchés est une application web gratuite d’information sur les marchés financiers (cryptomonnaies, indices boursiers, grandes entreprises cotées). Elle ne propose ni compte utilisateur, ni vente, ni publicité, ni service d’investissement.</p>
    <p><strong>Les informations affichées sont fournies à titre purement informatif. Elles ne constituent ni un conseil en investissement, ni une recommandation d’achat ou de vente, ni une sollicitation.</strong> Les cours des indices et des actions sont différés et peuvent être incomplets ou inexacts.</p>

    <h2>Sources des données et crédits</h2>
    <ul>
      <li>Cryptomonnaies : {a("https://www.coingecko.com/", "CoinGecko")} (« Powered by CoinGecko »), repli {a("https://coinpaprika.com/", "CoinPaprika")}.</li>
      <li>Indices et cours des actions : Yahoo Finance (cours différés).</li>
      <li>Classement des entreprises par capitalisation : {a("https://companiesmarketcap.com/", "companiesmarketcap.com")}.</li>
      <li>Graphiques interactifs et logos des indices : {a("https://www.tradingview.com/", "TradingView")} (graphiques affichés uniquement avec votre accord).</li>
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

    <h2>Right of reply</h2>
    <p>Any person named or referred to on the website has a right of reply, to be addressed to the publication director (Article 1-1 III of the LCEN).</p>

    <h2>Nature of the service</h2>
    <p>Markets is a free web application providing information on financial markets (cryptocurrencies, stock market indices, large listed companies). It offers no user account, no sales, no advertising and no investment service.</p>
    <p><strong>The information displayed is provided for information purposes only. It does not constitute investment advice, a recommendation to buy or sell, or a solicitation.</strong> Index and stock prices are delayed and may be incomplete or inaccurate.</p>

    <h2>Data sources and credits</h2>
    <ul>
      <li>Cryptocurrencies: {a("https://www.coingecko.com/", "CoinGecko")} (“Powered by CoinGecko”), fallback {a("https://coinpaprika.com/", "CoinPaprika")}.</li>
      <li>Indices and stock prices: Yahoo Finance (delayed prices).</li>
      <li>Ranking of companies by market capitalisation: {a("https://companiesmarketcap.com/", "companiesmarketcap.com")}.</li>
      <li>Interactive charts and index logos: {a("https://www.tradingview.com/", "TradingView")} (charts displayed only with your consent).</li>
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

    <h2>答辩权</h2>
    <p>在本网站上被点名或提及的任何人，均可向出版负责人行使答辩权（LCEN第1-1条第III款）。</p>

    <h2>服务性质</h2>
    <p>市场行情是一款免费的金融市场信息网络应用（加密货币、股票指数、大型上市公司）。本应用不提供用户账户、销售、广告或任何投资服务。</p>
    <p><strong>所显示的信息仅供参考，不构成投资建议、买卖推荐或任何招揽。</strong>指数和股票价格为延迟报价，可能不完整或不准确。</p>

    <h2>数据来源与致谢</h2>
    <ul>
      <li>加密货币：{a("https://www.coingecko.com/", "CoinGecko")}（“Powered by CoinGecko”），备用来源 {a("https://coinpaprika.com/", "CoinPaprika")}。</li>
      <li>指数与股价：Yahoo Finance（延迟报价）。</li>
      <li>公司市值排名：{a("https://companiesmarketcap.com/", "companiesmarketcap.com")}。</li>
      <li>交互式图表与指数标志：{a("https://www.tradingview.com/", "TradingView")}（仅在您同意后显示图表）。</li>
    </ul>

    <h2>知识产权</h2>
    <p>除另有说明外，本网站的结构、代码和界面归发布者所有。文中提及的加密货币、公司、指数、交易所及数据提供商的名称、商标和标志归其各自所有者所有，仅用于标识相关资产和来源，并不表示任何隶属或合作关系。</p>

    <h2>个人数据与 Cookie</h2>
    <p>请参阅{a(L(lang, "confidentialite"), "隐私政策", False)}和{a(L(lang, "cookies"), "Cookie 设置", False)}页面。</p>"""


def privacy(lang):
    if lang == "fr":
        rows = [
            ("Hébergement et journaux techniques", "Adresse IP, date et heure, page ou ressource demandée, navigateur (user-agent), réponse du serveur", "Afficher le site, assurer son fonctionnement et sa sécurité", "Intérêt légitime de l’éditeur à fournir un service sécurisé (art. 6.1.f RGPD)", "Journaux d’exécution consultables par l’éditeur : 1 heure (offre Hobby de Vercel, selon la documentation de l’hébergeur)"),
            ("Stockage local sur votre appareil", f"Dernières données de marché, langue et onglet affichés, choix relatif aux cookies, masquage de l’aide à l’installation (voir {a(L(lang,'cookies'),'détail',False)})", "Afficher l’application hors ligne, mémoriser vos préférences d’affichage et vos choix", "Traceurs strictement nécessaires au service demandé, exemptés de consentement (art. 82 loi Informatique et Libertés)", "Jusqu’à effacement par vous ; choix relatif aux cookies : 6 mois"),
            ("Graphiques TradingView (uniquement si vous l’acceptez)", "Adresse IP, informations sur l’appareil et le navigateur, interactions avec le graphique ; données enregistrées sur votre appareil par TradingView", "Afficher les graphiques interactifs ; TradingView indique collecter aussi des informations analytiques via ses widgets", "Votre consentement (art. 6.1.a RGPD et art. 82 loi Informatique et Libertés), retirable à tout moment", f"Selon la {a(TV_PRIV,'politique de TradingView')} ; votre choix est conservé 6 mois sur votre appareil"),
            ("Échanges avec l’éditeur (si vous le contactez)", "Coordonnées et contenu du message", "Répondre à votre demande, y compris l’exercice de vos droits", "Intérêt légitime à répondre aux demandes (art. 6.1.f) ; obligation légale pour les demandes d’exercice de droits (art. 6.1.c)", "Le temps nécessaire au traitement de la demande"),
        ]
        head = ("Traitement", "Données", "Finalité", "Base légale", "Durée")
        T = dict(h1="Politique de confidentialité", desc="Politique de confidentialité et protection des données personnelles du site Marchés.",
            lead="Informations délivrées en application des articles 12 à 14 du règlement (UE) 2016/679 (RGPD) et de la loi n° 78-17 du 6 janvier 1978 « Informatique et Libertés ».",
            brief="En bref", bullets=["Pas de compte, pas de formulaire, pas de publicité, pas de mesure d’audience : <strong>le site ne vous demande aucune donnée personnelle</strong>.", "Le site ne dépose <strong>aucun cookie</strong>.", "Les données de marché et les logos sont récupérés par notre serveur : votre adresse IP n’est pas transmise aux fournisseurs de données ni aux sites d’où proviennent les logos.", "Seul le <strong>graphique TradingView</strong>, si vous l’acceptez, transmet des données à un tiers. Sans votre accord, il n’est pas chargé."],
            ctrl="Responsable du traitement", ctrl_p=f"Le responsable du traitement est l’éditeur du site (voir les {a(L(lang,'mentions-legales'),'mentions légales',False)}). L’éditeur n’est pas tenu de désigner un délégué à la protection des données (DPO) au regard de l’article 37 du RGPD.",
            proc="Données traitées, finalités, bases légales et durées", after="Aucune décision automatisée ni aucun profilage n’est réalisé par l’éditeur. Les données de marché (cours, indices, classements) ne sont pas des données personnelles.",
            dest="Destinataires", dest_li=[f"<strong>Vercel Inc.</strong> (hébergeur), en qualité de sous-traitant de l’éditeur pour l’hébergement. Vercel peut aussi traiter certaines données techniques pour ses propres besoins, conformément à sa {a(VERCEL_PRIV,'politique de confidentialité')}.", f"<strong>TradingView</strong>, uniquement si vous acceptez l’affichage des graphiques, en qualité de responsable de traitement indépendant ({a(TV_PRIV,'politique de TradingView')})."],
            dest_p="Aucune donnée n’est vendue, louée ou cédée à des fins commerciales ou publicitaires.",
            transfer="Transferts hors de l’Union européenne", transfer_li=["<strong>Vercel Inc.</strong> est établie aux États-Unis. Elle déclare adhérer au cadre de protection des données UE–États-Unis (<em>EU-U.S. Data Privacy Framework</em>), qui bénéficie d’une décision d’adéquation de la Commission européenne du 10 juillet 2023 (art. 45 RGPD).", "<strong>TradingView</strong> (si vous l’acceptez) est établi notamment aux États-Unis ; les garanties applicables à ses transferts sont décrites dans sa politique de confidentialité."],
            rights="Vos droits", rights_p=["Vous disposez des droits d’accès, de rectification, d’effacement, de limitation du traitement, d’opposition, de portabilité, ainsi que du droit de retirer votre consentement à tout moment et de définir des directives relatives au sort de vos données après votre décès (art. 15 à 22 RGPD, art. 85 loi Informatique et Libertés).", "Pour les exercer, adressez votre demande à l’éditeur du site. Une réponse vous sera apportée dans un délai d’un mois, prolongeable de deux mois si nécessaire (art. 12 RGPD). Le site ne gérant aucun compte, l’éditeur ne dispose en général d’aucune donnée permettant de vous identifier (art. 11 RGPD).", f"Le retrait du consentement à TradingView se fait en un clic sur la page {a(L(lang,'cookies'),'Gestion des cookies',False)}. Les données stockées sur votre appareil peuvent être effacées depuis les réglages de votre navigateur (données du site)."],
            cnil="Réclamation auprès de la CNIL", cnil_p="Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la Commission nationale de l’informatique et des libertés (CNIL) :",
            cnil_dl=[("Adresse", "CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07"), ("Téléphone", "01 53 73 22 22"), ("Plainte en ligne", a(CNIL_PLAINTE, "cnil.fr/fr/adresser-une-plainte"))],
            sec="Sécurité", sec_p="Le site est servi exclusivement en HTTPS (HSTS activé), avec une politique de sécurité du contenu (CSP) restrictive. Il ne comporte ni formulaire, ni compte, ni mot de passe. Les interfaces de programmation (API) du site sont en lecture seule, ne reçoivent aucune donnée personnelle et ne sont pas accessibles depuis des sites tiers.",
            minors="Mineurs", minors_p="Le site ne collecte aucune donnée nécessitant un consentement parental. L’affichage des graphiques TradingView, soumis à consentement, est destiné aux personnes de 15 ans et plus, ou autorisées par le titulaire de l’autorité parentale (art. 45 loi Informatique et Libertés).",
            mod="Modifications", mod_p="Cette politique peut évoluer. La date de dernière mise à jour figure en haut de la page.")
    elif lang == "en":
        rows = [
            ("Hosting and technical logs", "IP address, date and time, page or resource requested, browser (user-agent), server response", "Display the website, ensure its operation and security", "Legitimate interest of the publisher in providing a secure service (Art. 6(1)(f) GDPR)", "Runtime logs available to the publisher: 1 hour (Vercel Hobby plan, according to the host’s documentation)"),
            ("Local storage on your device", f"Latest market data, display language and tab, cookie choice, dismissal of the install hint (see {a(L(lang,'cookies'),'details',False)})", "Display the app offline, remember your display preferences and choices", "Trackers strictly necessary for the service requested, exempt from consent (Art. 82 French Data Protection Act)", "Until you delete them; cookie choice: 6 months"),
            ("TradingView charts (only if you accept)", "IP address, device and browser information, chart interactions; data stored on your device by TradingView", "Display interactive charts; TradingView states that it also collects analytics information through its widgets", "Your consent (Art. 6(1)(a) GDPR and Art. 82 French Data Protection Act), which may be withdrawn at any time", f"According to the {a(TV_PRIV,'TradingView policy')}; your choice is kept for 6 months on your device"),
            ("Exchanges with the publisher (if you contact them)", "Contact details and content of the message", "Answer your request, including the exercise of your rights", "Legitimate interest in answering requests (Art. 6(1)(f)); legal obligation for rights requests (Art. 6(1)(c))", "As long as necessary to handle the request"),
        ]
        head = ("Processing", "Data", "Purpose", "Legal basis", "Retention")
        T = dict(h1="Privacy policy", desc="Privacy policy and personal data protection of the Markets website.",
            lead="Information provided pursuant to Articles 12 to 14 of Regulation (EU) 2016/679 (GDPR) and French Law No. 78-17 of 6 January 1978 (“Informatique et Libertés”).",
            brief="In short", bullets=["No account, no form, no advertising, no audience measurement: <strong>the website does not ask you for any personal data</strong>.", "The website sets <strong>no cookies</strong>.", "Market data and logos are fetched by our server: your IP address is not sent to the data providers or to the websites the logos come from.", "Only the <strong>TradingView chart</strong>, if you accept it, sends data to a third party. Without your consent, it is not loaded."],
            ctrl="Data controller", ctrl_p=f"The data controller is the website publisher (see the {a(L(lang,'mentions-legales'),'legal notice',False)}). The publisher is not required to appoint a data protection officer (DPO) under Article 37 GDPR.",
            proc="Data processed, purposes, legal bases and retention", after="The publisher carries out no automated decision-making and no profiling. Market data (prices, indices, rankings) is not personal data.",
            dest="Recipients", dest_li=[f"<strong>Vercel Inc.</strong> (host), acting as the publisher’s processor for hosting. Vercel may also process certain technical data for its own purposes, in accordance with its {a(VERCEL_PRIV,'privacy notice')}.", f"<strong>TradingView</strong>, only if you accept the display of charts, acting as an independent controller ({a(TV_PRIV,'TradingView policy')})."],
            dest_p="No data is sold, rented or transferred for commercial or advertising purposes.",
            transfer="Transfers outside the European Union", transfer_li=["<strong>Vercel Inc.</strong> is established in the United States. It states that it participates in the EU-U.S. Data Privacy Framework, covered by an adequacy decision of the European Commission of 10 July 2023 (Art. 45 GDPR).", "<strong>TradingView</strong> (if you accept it) is established in particular in the United States; the safeguards applicable to its transfers are described in its privacy policy."],
            rights="Your rights", rights_p=["You have the rights of access, rectification, erasure, restriction of processing, objection and portability, as well as the right to withdraw your consent at any time and to set instructions regarding your data after your death (Art. 15 to 22 GDPR, Art. 85 French Data Protection Act).", "To exercise them, send your request to the website publisher. You will receive an answer within one month, which may be extended by two months if necessary (Art. 12 GDPR). As the website manages no accounts, the publisher generally holds no data that would allow you to be identified (Art. 11 GDPR).", f"You can withdraw your consent to TradingView in one click on the {a(L(lang,'cookies'),'Cookie settings',False)} page. Data stored on your device can be deleted from your browser settings (site data)."],
            cnil="Complaint to the CNIL", cnil_p="If you consider that your rights are not respected, you may lodge a complaint with the French data protection authority (CNIL):",
            cnil_dl=[("Address", "CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France"), ("Phone", "+33 1 53 73 22 22"), ("Online complaint", a(CNIL_PLAINTE, "cnil.fr/fr/adresser-une-plainte"))],
            sec="Security", sec_p="The website is served exclusively over HTTPS (HSTS enabled), with a restrictive content security policy (CSP). It has no forms, accounts or passwords. The website’s APIs are read-only, receive no personal data and cannot be used from third-party websites.",
            minors="Minors", minors_p="The website collects no data requiring parental consent. The display of TradingView charts, which requires consent, is intended for persons aged 15 or over, or authorised by the holder of parental authority (Art. 45 French Data Protection Act).",
            mod="Changes", mod_p="This policy may change. The date of the last update is shown at the top of the page.")
    else:
        rows = [
            ("托管与技术日志", "IP 地址、日期和时间、请求的页面或资源、浏览器（user-agent）、服务器响应", "显示网站，保障其运行与安全", "发布者提供安全服务的正当利益（GDPR 第6(1)(f)条）", "发布者可查看的运行日志：1 小时（据托管商文档，Vercel Hobby 方案）"),
            ("您设备上的本地存储", f"最新市场数据、显示语言和标签页、Cookie 选择、安装提示的关闭状态（见{a(L(lang,'cookies'),'详情',False)}）", "离线显示应用，记住您的显示偏好和选择", "所请求服务严格必需的跟踪器，无需同意（法国《信息与自由法》第82条）", "直至您删除；Cookie 选择：6 个月"),
            ("TradingView 图表（仅在您接受时）", "IP 地址、设备和浏览器信息、图表交互；TradingView 在您设备上存储的数据", "显示交互式图表；TradingView 表示其还会通过小组件收集分析信息", "您的同意（GDPR 第6(1)(a)条及《信息与自由法》第82条），可随时撤回", f"依据 {a(TV_PRIV,'TradingView 隐私政策')}；您的选择在设备上保留 6 个月"),
            ("与发布者的往来（如您联系发布者）", "联系方式和消息内容", "答复您的请求，包括行使您的权利", "答复请求的正当利益（第6(1)(f)条）；权利请求的法定义务（第6(1)(c)条）", "处理请求所需的时间"),
        ]
        head = ("处理活动", "数据", "目的", "法律依据", "保存期限")
        T = dict(h1="隐私政策", desc="市场行情网站的隐私政策与个人数据保护。",
            lead="依据欧盟第2016/679号条例（GDPR）第12至14条及法国1978年1月6日第78-17号《信息与自由法》提供的信息。",
            brief="简要说明", bullets=["无账户、无表单、无广告、无访问统计：<strong>本网站不会要求您提供任何个人数据</strong>。", "本网站<strong>不设置任何 Cookie</strong>。", "市场数据和标志由我们的服务器获取：您的 IP 地址不会发送给数据提供商或标志来源网站。", "只有在您接受的情况下，<strong>TradingView 图表</strong>才会向第三方传输数据。未经您同意，图表不会加载。"],
            ctrl="数据控制者", ctrl_p=f"数据控制者为本网站发布者（见{a(L(lang,'mentions-legales'),'法律声明',False)}）。根据 GDPR 第37条，发布者无须指定数据保护官（DPO）。",
            proc="处理的数据、目的、法律依据与保存期限", after="发布者不进行任何自动化决策或用户画像。市场数据（价格、指数、排名）不属于个人数据。",
            dest="接收方", dest_li=[f"<strong>Vercel Inc.</strong>（托管商），作为发布者的托管处理者。Vercel 也可能根据其{a(VERCEL_PRIV,'隐私声明')}为自身目的处理部分技术数据。", f"<strong>TradingView</strong>，仅在您接受显示图表时，作为独立的数据控制者（{a(TV_PRIV,'TradingView 隐私政策')}）。"],
            dest_p="任何数据都不会出于商业或广告目的出售、出租或转让。",
            transfer="向欧盟以外地区的传输", transfer_li=["<strong>Vercel Inc.</strong> 位于美国，声明已加入欧盟—美国数据隐私框架（EU-U.S. Data Privacy Framework），该框架获欧盟委员会2023年7月10日充分性决定认可（GDPR 第45条）。", "<strong>TradingView</strong>（如您接受）主要位于美国；其传输所适用的保障措施见其隐私政策。"],
            rights="您的权利", rights_p=["您享有访问、更正、删除、限制处理、反对处理和数据可携带的权利，以及随时撤回同意、并就您身后的数据处置作出指示的权利（GDPR 第15至22条，《信息与自由法》第85条）。", "如需行使上述权利，请向本网站发布者提出请求。我们将在一个月内答复，必要时可延长两个月（GDPR 第12条）。由于本网站不管理任何账户，发布者通常不持有可识别您身份的数据（GDPR 第11条）。", f"您可在{a(L(lang,'cookies'),'Cookie 设置',False)}页面一键撤回对 TradingView 的同意。存储在您设备上的数据可通过浏览器设置（网站数据）删除。"],
            cnil="向 CNIL 投诉", cnil_p="如您认为自己的权利未获尊重，可向法国国家信息与自由委员会（CNIL）提出投诉：",
            cnil_dl=[("地址", "CNIL, 3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France"), ("电话", "+33 1 53 73 22 22"), ("在线投诉", a(CNIL_PLAINTE, "cnil.fr/fr/adresser-une-plainte"))],
            sec="安全", sec_p="本网站仅通过 HTTPS 提供服务（已启用 HSTS），并采用严格的内容安全策略（CSP）。网站没有表单、账户或密码。网站的 API 为只读，不接收任何个人数据，且无法被第三方网站调用。",
            minors="未成年人", minors_p="本网站不收集任何需要父母同意的数据。需征得同意的 TradingView 图表面向15岁及以上人士，或经监护人授权者（《信息与自由法》第45条）。",
            mod="修改", mod_p="本政策可能会更新，最后更新日期见页面顶部。")
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
                  ("<code>marches:tab</code>, <code>marches:lang</code>", "Mémoriser l’onglet et la langue affichés", "Jusqu’à effacement"),
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
                  ("<code>marches:tab</code>, <code>marches:lang</code>", "Remember the tab and language displayed", "Until deletion"),
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
                  ("<code>marches:tab</code>、<code>marches:lang</code>", "记住所显示的标签页和语言", "直至删除"),
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
            ("2. Description du Service", "Le Service affiche gratuitement des informations de marché : cryptomonnaies, indices boursiers, plus grandes entreprises cotées, ainsi que des graphiques fournis par des tiers. Il ne nécessite aucune inscription. Il ne propose ni vente, ni abonnement payant, ni service d’investissement, ni conservation ou échange d’actifs."),
            ("3. Accès", "Le Service est accessible gratuitement à toute personne disposant d’un accès à Internet ; les frais de connexion restent à la charge de l’utilisateur. L’Éditeur s’efforce d’assurer la disponibilité du Service, sans obligation de résultat. Il peut le suspendre, le modifier ou l’interrompre, notamment pour maintenance ou en cas d’indisponibilité des sources de données."),
            ("4. Nature des informations — absence de conseil en investissement", "<strong>Les informations sont fournies à titre purement informatif et général. Elles ne constituent ni un conseil en investissement, ni une recommandation personnalisée, ni une incitation à acheter ou vendre un instrument financier ou un actif numérique.</strong></p><p>Les données proviennent de sources tierces (voir les mentions légales). Elles peuvent être différées, incomplètes ou erronées, ou ne plus être mises à jour par leur source. Lorsqu’une donnée est indisponible ou douteuse, le Service affiche « n/d » ou « Données anciennes ». Certains graphiques reposent sur des instruments qui suivent un indice (CFD, ETF) plutôt que sur l’indice lui-même ; cela est alors signalé à l’écran.</p><p>Investir comporte des risques, dont celui de perte en capital ; les actifs numériques sont particulièrement volatils. Toute décision d’investissement relève de la seule responsabilité de l’utilisateur."),
            ("5. Responsabilité", "Dans les limites autorisées par la loi, l’Éditeur ne saurait être tenu responsable des décisions prises sur la base des informations affichées, ni des erreurs, retards ou interruptions des sources de données tierces ou de l’hébergeur. Rien dans les présentes CGU n’exclut une responsabilité qui ne peut légalement être exclue."),
            ("6. Contenus et services tiers", "Le Service intègre, avec votre accord, des graphiques fournis par TradingView. Il contient aussi des liens vers des sites tiers. Ces services sont régis par leurs propres conditions et politiques, sur lesquelles l’Éditeur n’a aucun contrôle."),
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
            ("2. Description of the Service", "The Service displays market information free of charge: cryptocurrencies, stock market indices, the largest listed companies, as well as charts provided by third parties. No registration is required. It offers no sales, no paid subscription, no investment service and no custody or exchange of assets."),
            ("3. Access", "The Service is freely accessible to anyone with Internet access; connection costs are borne by the user. The Publisher endeavours to keep the Service available, without any guarantee of result. It may suspend, modify or discontinue it, in particular for maintenance or if data sources are unavailable."),
            ("4. Nature of the information — no investment advice", "<strong>The information is provided for general information purposes only. It does not constitute investment advice, a personalised recommendation, or an incentive to buy or sell any financial instrument or digital asset.</strong></p><p>The data comes from third-party sources (see the legal notice). It may be delayed, incomplete or inaccurate, or no longer updated by its source. When data is unavailable or doubtful, the Service displays “n/a” or “Stale data”. Some charts are based on instruments that track an index (CFDs, ETFs) rather than the index itself; this is then indicated on screen.</p><p>Investing involves risks, including the risk of capital loss; digital assets are particularly volatile. Any investment decision is the sole responsibility of the user."),
            ("5. Liability", "To the extent permitted by law, the Publisher cannot be held liable for decisions made on the basis of the information displayed, nor for errors, delays or interruptions of third-party data sources or of the host. Nothing in these terms excludes any liability that cannot legally be excluded."),
            ("6. Third-party content and services", "With your consent, the Service embeds charts provided by TradingView. It also contains links to third-party websites. These services are governed by their own terms and policies, over which the Publisher has no control."),
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
            ("2. 服务说明", "本服务免费显示市场信息：加密货币、股票指数、最大的上市公司，以及由第三方提供的图表。无需注册。本服务不提供销售、付费订阅、投资服务，亦不提供资产托管或交易。"),
            ("3. 访问", "任何能够访问互联网的人均可免费使用本服务；网络费用由用户自行承担。发布者尽力保证本服务的可用性，但不作结果保证，并可因维护或数据来源不可用等原因暂停、修改或终止本服务。"),
            ("4. 信息性质——不构成投资建议", "<strong>所提供的信息仅供一般参考，不构成投资建议、个性化推荐，亦不构成买卖任何金融工具或数字资产的诱导。</strong></p><p>数据来自第三方来源（见法律声明），可能存在延迟、不完整或错误，或已不再由其来源更新。当数据不可用或存疑时，本服务会显示“n/d”或“数据过旧”。部分图表基于跟踪指数的工具（差价合约、ETF）而非指数本身，届时会在屏幕上注明。</p><p>投资存在风险，包括本金损失的风险；数字资产波动尤其剧烈。任何投资决定均由用户自行负责。"),
            ("5. 责任", "在法律允许的范围内，发布者不对基于所显示信息作出的决定负责，亦不对第三方数据来源或托管商的错误、延迟或中断负责。本条款不排除任何依法不得排除的责任。"),
            ("6. 第三方内容与服务", "经您同意，本服务会嵌入 TradingView 提供的图表，并包含指向第三方网站的链接。这些服务受其自身条款和政策约束，发布者对此无控制权。"),
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
    script = '\n  <script src="/cookies-page.js" type="module"></script>' if name == "cookies" else ""
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
  <link rel="stylesheet" href="/styles.css">
  {alternates}
</head>
<body class="doc">
  <header class="topbar"><div class="topbar-row"><a class="back" href="/">{ui['back']}</a><nav class="lang-switch" aria-label="Langue / Language / 语言">{switch}</nav></div></header>
  <main id="main">{body}{prevail}

    <nav class="legal-links" aria-label="{ui['nav']}">
      {links}
    </nav>
  </main>
  <script src="/legal.js" type="module"></script>{script}
</body>
</html>
"""

for lang in ("fr", "en", "zh"):
    out = ROOT if lang == "fr" else ROOT / lang
    out.mkdir(parents=True, exist_ok=True)
    for name in PAGES:
        (out / f"{name}.html").write_text(page(lang, name), encoding="utf-8")
print("pages juridiques générées (fr, en, zh)")
