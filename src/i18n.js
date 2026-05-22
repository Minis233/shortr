// Bilingual UI strings + tiny client-side i18n bootstrap.
//
// On the server we ship both dictionaries verbatim; the client picks a language
// from (in order): cookie `shortr_lang`, `localStorage.shortr_lang`,
// `navigator.language` (anything starting with "zh" → zh, else en).
//
// HTML markup uses three hooks:
//   <span data-i18n="key">…fallback English…</span>     — replace textContent
//   <input data-i18n-attr="placeholder=key,title=key">  — set attributes
//   <div data-i18n-html="key"></div>                    — replace innerHTML
//
// Inline page scripts can call `window.t("key")` for dynamic strings.

export const I18N_DICT = {
  en: {
    // nav / chrome
    brand: "shortr",
    navMy: "My links",
    navDashboard: "Dashboard",
    navLogin: "Login",
    navSignup: "Sign up",
    navLogout: "Logout",
    langToggle: "中文",

    // landing
    titleLanding: "shortr — URL shortener",
    landingPublicOff: "This instance has public shortening disabled. Login or create an account to shorten links.",
    cardShorten: "Shorten a URL",
    longUrl: "Long URL",
    longUrlPh: "https://example.com/very/long/path",
    options: "Options",
    customSlug: "Custom slug",
    optional: "(optional)",
    autoSlug: "auto",
    chars: "chars",
    expiresIn: "Expires in",
    seconds: "(seconds)",
    never: "never",
    maxClicks: "Max clicks",
    unlimited: "unlimited",
    password: "Password",
    passwordPh: "prompt before redirect",
    note: "Note",
    notePrivate: "(optional, private)",
    noteLabelPh: "internal label",
    btnShorten: "Shorten",
    btnShortening: "Shortening...",
    cardWhatHappens: "What happens to your link?",
    explainBase: "Each link gets a 32-character edit token. Anyone with that token can update or delete it via a special edit URL — give it to a teammate to delegate management without sharing your account.",
    explainAccount: "Your links are also tied to your account, so you can manage them from My links.",
    explainAnon: "Without an account, your links are remembered on this browser via a cookie. Sign up to access them anywhere.",
    resultExpires: "Expires",
    resultEditUrl: "Edit URL (keep secret, share to delegate):",
    btnCopy: "Copy",
    btnCopyEdit: "Copy edit link",
    btnCopied: "Copied",

    // auth pages
    titleLogin: "Sign in — shortr",
    titleSignup: "Sign up — shortr",
    authSignin: "Sign in",
    authCreate: "Create account",
    username: "Username",
    btnSignin: "Sign in",
    btnSignup: "Sign up",
    noAccount: "No account yet?",
    createOne: "Create one",
    haveAccount: "Already have an account?",
    signInLink: "Sign in",

    // my page
    titleMy: "My links — shortr",
    cardMyLinks: "My links",
    signedInAs: "Signed in as",
    anonBrowsing: "browsing anonymously",
    introUser: "Links you created while signed in to this account.",
    introAnon: "Links you created from this browser. Set up an account to keep them across devices.",
    cookieBanner: "You're not signed in. We're matching links by your browser cookie.",
    cookieIdLabel: "Cookie id:",
    cookieIdNone: "(none yet)",
    btnRefresh: "Refresh",
    btnNewLink: "New link",
    btnEditByToken: "Edit by token...",
    countLink: "link",
    countLinks: "links",
    cardCacheTitle: "Recent (this browser)",
    cardCacheHint: "Cached locally. Useful when cookies are cleared but you copied an edit link earlier.",
    emptyNoLinks: "No links yet.",
    emptyCreateFirst: "Create your first one.",
    emptyCacheNothing: "Nothing cached yet.",

    // table headers / actions
    thSlug: "Slug",
    thDestination: "Destination",
    thClicks: "Clicks",
    thFlags: "Flags",
    thCreated: "Created",
    thOwner: "Owner",
    thEditUrl: "Edit URL",
    thSaved: "Saved",
    btnEdit: "Edit",
    btnDelete: "Delete",
    btnOpen: "Open",
    btnForget: "Forget",

    // dialogs
    dlgNewTitle: "New link",
    dlgNewTitleAdmin: "New link (admin)",
    dlgEditTitle: "Edit link",
    dlgEditTitleAdmin: "Edit link (admin)",
    dlgTokenTitle: "Edit by token",
    dlgTokenHint: "Paste an edit link or just the token.",
    btnCancel: "Cancel",
    btnCreate: "Create",
    btnSave: "Save",
    fieldExpiresAt: "Expires at",
    fieldDatetimeLocal: "(local datetime)",
    fieldMaxClicksZero: "Max clicks (0=unlimited)",
    fieldPasswordRule: 'Password (blank=keep, "-"=remove)',
    fieldOwner: "Owner",
    fieldSlug: "Slug",
    fieldDestUrl: "Destination URL",
    confirmDelete: "Delete this link?",
    confirmDeleteSlug: "Delete /{slug}?",
    tokParseFail: "Could not parse slug:token",
    tokInputPh: "https://this-host/abcd:tokentoken... or slug:token",

    // admin page
    titleAdmin: "Admin — shortr",
    cardAdmin: "Admin dashboard",
    searchPh: "Filter slug prefix...",
    btnLoadMore: "Load more",
    countShown: "shown",

    // edit-by-token page
    titleEdit: "Edit link — shortr",
    editPageTitle: "Edit /{slug}",
    editPageHint: "Anyone with the edit token can update or delete this link. Treat it like a password.",
    btnSaveChanges: "Save changes",
    btnDeleteThis: "Delete this link",
    metaCreated: "Created:",
    metaClicks: "Clicks so far:",
    notFoundOrInvalid: "Link not found or token invalid.",
    flashSaved: "Saved.",
    flashDeleted: "Link deleted.",
    errLinkNotFound: "Link not found.",
    errTokenMismatch: "Edit token does not match this slug.",

    // password gate
    titleProtected: "Protected link",
    gateHeader: "This link is password-protected",
    gateHint: "Enter the password to continue.",
    btnContinue: "Continue",
    gatePwdRequired: "Password is required.",
    gatePwdWrong: "Incorrect password.",

    // ttl units
    ttlSeconds: "Seconds",
    ttlMinutes: "Minutes",
    ttlHours: "Hours",
    ttlDays: "Days",
    ttlMonths: "Months",
    ttlValuePh: "e.g. 7",

    // host slug
    hostSlug: "Subdomain",
    hostSlugPh: "e.g. blog",
    hostSlugHelp: "Optional. Reserves <strong>{example}</strong> on this domain.",
    hostSlugDisabled: "Subdomain short links require BASE_DOMAIN to be set.",

    // admin login
    titleAdminLogin: "Admin sign-in — shortr",
    adminLoginHeading: "Admin sign-in",
    adminLoginIntro: "You unlocked the admin login URL. Enter the admin account credentials to continue.",
    adminLoginExpired: "Session expired. Reload the admin URL.",
    adminLoginWrong: "Wrong admin username or password.",

    // captcha
    captchaPending: "Please complete the verification.",
    captchaFailed: "Captcha verification failed. Please retry.",

    // misc
    backHome: "← Back to home",

    // 404 / 410
    titleNotFound: "Not found",
    titleGone: "Gone",
    notFoundH1: "404 — not found",
    notFoundBody: "This link does not exist.",
    goneH1: "410 — gone",
    goneExpired: "This link has expired.",
    goneCapped: "This link has reached its click limit.",
    goneHome: "Go home",

    // owner tags
    ownerAdmin: "admin",
    ownerUser: "user",
    ownerAnon: "anon",
    flagTtl: "TTL",
    flagCap: "cap",
    flagPwd: "pwd",
  },
  zh: {
    brand: "shortr",
    navMy: "我的短链",
    navDashboard: "管理后台",
    navLogin: "登录",
    navSignup: "注册",
    navLogout: "登出",
    langToggle: "EN",

    titleLanding: "shortr — 短链服务",
    landingPublicOff: "此实例已禁用匿名生成。请登录或注册账号后再创建短链。",
    cardShorten: "生成短链",
    longUrl: "目标 URL",
    longUrlPh: "https://example.com/很长的路径",
    options: "高级选项",
    customSlug: "自定义短码",
    optional: "（可选）",
    autoSlug: "自动",
    chars: "位",
    expiresIn: "有效期",
    seconds: "（秒）",
    never: "永久",
    maxClicks: "最大点击数",
    unlimited: "不限",
    password: "访问密码",
    passwordPh: "跳转前要求输入",
    note: "备注",
    notePrivate: "（可选，仅自己可见）",
    noteLabelPh: "内部备注",
    btnShorten: "生成短链",
    btnShortening: "生成中…",
    cardWhatHappens: "短链是怎么工作的？",
    explainBase: "每个短链都会附带一个 32 位编辑 token。拥有 token 的人可以通过专属编辑链接修改或删除这条短链——把它发给别人就能授权管理，而不需要共享账号。",
    explainAccount: "登录后的短链会绑定到你的账号，可以在「我的短链」中管理。",
    explainAnon: "未登录时，短链通过浏览器 Cookie 与本机绑定。注册账号即可在任何设备访问。",
    resultExpires: "到期时间",
    resultEditUrl: "编辑链接（请妥善保管，分享即授权）：",
    btnCopy: "复制",
    btnCopyEdit: "复制编辑链接",
    btnCopied: "已复制",

    titleLogin: "登录 — shortr",
    titleSignup: "注册 — shortr",
    authSignin: "登录",
    authCreate: "创建账号",
    username: "用户名",
    btnSignin: "登录",
    btnSignup: "注册",
    noAccount: "还没有账号？",
    createOne: "立即注册",
    haveAccount: "已有账号？",
    signInLink: "登录",

    titleMy: "我的短链 — shortr",
    cardMyLinks: "我的短链",
    signedInAs: "已登录：",
    anonBrowsing: "匿名浏览",
    introUser: "本账号下创建的短链。",
    introAnon: "在本浏览器创建的短链。注册账号即可在任意设备访问。",
    cookieBanner: "未登录。当前通过浏览器 Cookie 识别归属。",
    cookieIdLabel: "Cookie id：",
    cookieIdNone: "（暂无）",
    btnRefresh: "刷新",
    btnNewLink: "新建短链",
    btnEditByToken: "用 Token 编辑…",
    countLink: "条",
    countLinks: "条",
    cardCacheTitle: "本机最近记录",
    cardCacheHint: "保存在本地。即使清除 Cookie，只要复制过编辑链接就能找回。",
    emptyNoLinks: "暂无短链。",
    emptyCreateFirst: "立即创建第一条。",
    emptyCacheNothing: "暂无本机记录。",

    thSlug: "短码",
    thDestination: "目标地址",
    thClicks: "点击",
    thFlags: "标记",
    thCreated: "创建时间",
    thOwner: "归属",
    thEditUrl: "编辑链接",
    thSaved: "保存于",
    btnEdit: "编辑",
    btnDelete: "删除",
    btnOpen: "打开",
    btnForget: "忘记",

    dlgNewTitle: "新建短链",
    dlgNewTitleAdmin: "新建短链（管理员）",
    dlgEditTitle: "编辑短链",
    dlgEditTitleAdmin: "编辑短链（管理员）",
    dlgTokenTitle: "用 Token 编辑",
    dlgTokenHint: "粘贴编辑链接或直接粘贴 token。",
    btnCancel: "取消",
    btnCreate: "创建",
    btnSave: "保存",
    fieldExpiresAt: "到期时间",
    fieldDatetimeLocal: "（本地时间）",
    fieldMaxClicksZero: "最大点击数（0=不限）",
    fieldPasswordRule: "密码（留空=保留，输入「-」=删除）",
    fieldOwner: "归属",
    fieldSlug: "短码",
    fieldDestUrl: "目标 URL",
    confirmDelete: "确认删除这条短链？",
    confirmDeleteSlug: "确认删除 /{slug}？",
    tokParseFail: "无法解析 slug:token",
    tokInputPh: "https://this-host/abcd:token… 或 slug:token",

    titleAdmin: "管理后台 — shortr",
    cardAdmin: "管理后台",
    searchPh: "按短码前缀过滤…",
    btnLoadMore: "加载更多",
    countShown: "条",

    titleEdit: "编辑短链 — shortr",
    editPageTitle: "编辑 /{slug}",
    editPageHint: "拥有编辑 token 的人都可以修改或删除这条短链，请像对待密码一样保管。",
    btnSaveChanges: "保存修改",
    btnDeleteThis: "删除此短链",
    metaCreated: "创建于：",
    metaClicks: "已点击：",
    notFoundOrInvalid: "短链不存在或 token 无效。",
    flashSaved: "已保存。",
    flashDeleted: "已删除。",
    errLinkNotFound: "短链不存在。",
    errTokenMismatch: "编辑 token 与短码不匹配。",

    titleProtected: "受保护链接",
    gateHeader: "此链接受密码保护",
    gateHint: "请输入访问密码。",
    btnContinue: "继续",
    gatePwdRequired: "请输入密码。",
    gatePwdWrong: "密码错误。",

    ttlSeconds: "秒",
    ttlMinutes: "分钟",
    ttlHours: "小时",
    ttlDays: "天",
    ttlMonths: "月",
    ttlValuePh: "例如 7",

    hostSlug: "二级域名",
    hostSlugPh: "如 blog",
    hostSlugHelp: "可选。会把 <strong>{example}</strong> 占用为短链域名。",
    hostSlugDisabled: "二级域名短链需要先配置 BASE_DOMAIN。",

    titleAdminLogin: "后台登录 — shortr",
    adminLoginHeading: "后台登录",
    adminLoginIntro: "你已通过秘密链接解锁后台登录。请输入管理员账号密码继续。",
    adminLoginExpired: "会话已过期，请重新访问后台秘密链接。",
    adminLoginWrong: "管理员账号或密码错误。",

    captchaPending: "请先完成人机验证。",
    captchaFailed: "人机验证未通过，请重试。",

    backHome: "← 返回首页",

    titleNotFound: "未找到",
    titleGone: "已失效",
    notFoundH1: "404 — 未找到",
    notFoundBody: "此短链不存在。",
    goneH1: "410 — 已失效",
    goneExpired: "此短链已过期。",
    goneCapped: "此短链已达点击上限。",
    goneHome: "返回首页",

    ownerAdmin: "管理员",
    ownerUser: "用户",
    ownerAnon: "匿名",
    flagTtl: "限时",
    flagCap: "上限",
    flagPwd: "密码",
  },
};

// Bootstrap script injected on every page. Reads/writes localStorage +
// cookie, fills DOM markers, exposes `window.t(key, vars?)` for inline scripts.
export const I18N_BOOTSTRAP = `
(function(){
  var DICT = ${JSON.stringify(I18N_DICT)};
  function detect() {
    try {
      var c = document.cookie.match(/(?:^|; )shortr_lang=([^;]+)/);
      if (c) return decodeURIComponent(c[1]);
    } catch(e){}
    try {
      var ls = localStorage.getItem("shortr_lang");
      if (ls) return ls;
    } catch(e){}
    var nav = (navigator.language || "en").toLowerCase();
    return nav.indexOf("zh") === 0 ? "zh" : "en";
  }
  var lang = detect();
  if (!DICT[lang]) lang = "en";
  function t(key, vars){
    var s = (DICT[lang] && DICT[lang][key]) || (DICT.en && DICT.en[key]) || key;
    if (vars) Object.keys(vars).forEach(function(k){
      s = s.replace(new RegExp("\\\\{"+k+"\\\\}","g"), vars[k]);
    });
    return s;
  }
  function applyTo(root){
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function(el){
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-html]").forEach(function(el){
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    root.querySelectorAll("[data-i18n-attr]").forEach(function(el){
      var spec = el.getAttribute("data-i18n-attr") || "";
      spec.split(",").forEach(function(pair){
        var parts = pair.split("=");
        if (parts.length === 2) el.setAttribute(parts[0].trim(), t(parts[1].trim()));
      });
    });
    // <title> via data-i18n-title on <html>
    var titleKey = document.documentElement.getAttribute("data-i18n-title");
    if (titleKey) document.title = t(titleKey);
    document.documentElement.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
  }
  function setLang(next){
    if (!DICT[next]) return;
    lang = next;
    try { localStorage.setItem("shortr_lang", next); } catch(e){}
    document.cookie = "shortr_lang=" + next + "; Path=/; Max-Age=31536000; SameSite=Lax";
    applyTo(document);
    var btn = document.getElementById("langBtn");
    if (btn) btn.textContent = t("langToggle");
    if (window.__shortrAfterLang) try { window.__shortrAfterLang(); } catch(e){}
  }
  window.t = t;
  window.applyI18n = applyTo;
  window.shortrLang = function(){ return lang; };
  window.shortrSetLang = setLang;
  window.shortrToggleLang = function(){ setLang(lang === "zh" ? "en" : "zh"); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function(){ applyTo(document); });
  } else {
    applyTo(document);
  }
})();
`;
