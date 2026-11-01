// Multi-language support — picks a language from the visitor's country, translates the page in place,
// and lets visitors switch at any time. Strings live in js/lang.js, keyed by the English text.
// Load order on every page (in <head>, after the Bootstrap CSS link): lang.js, then i18n.js.
(function () {
  "use strict";

  var DATA = window.I18N_DATA || { langs: [], strings: {} };
  var STORE_KEY = "swp-lang";

  var LANGS = {
    en: { name: "English", locale: "en-IN" },
    hi: { name: "हिन्दी", locale: "hi-IN", font: "Noto Sans Devanagari" },
    bn: { name: "বাংলা", locale: "bn-IN", font: "Noto Sans Bengali" },
    ar: { name: "العربية", locale: "ar", font: "Noto Sans Arabic", rtl: true },
    es: { name: "Español", locale: "es" },
    fr: { name: "Français", locale: "fr" }
  };

  // Country → default language
  var COUNTRY_LANG = {
    IN: "hi", BD: "bn",
    AE: "ar", SA: "ar", QA: "ar", KW: "ar", OM: "ar", BH: "ar", EG: "ar", JO: "ar", IQ: "ar", LB: "ar",
    MA: "ar", DZ: "ar", TN: "ar", LY: "ar", SY: "ar", YE: "ar", SD: "ar",
    ES: "es", MX: "es", AR: "es", CO: "es", PE: "es", CL: "es", VE: "es", EC: "es", GT: "es", CU: "es",
    BO: "es", DO: "es", HN: "es", PY: "es", SV: "es", NI: "es", CR: "es", PA: "es", UY: "es",
    FR: "fr", BE: "fr", SN: "fr", CI: "fr", CM: "fr", ML: "fr", BF: "fr", NE: "fr", TG: "fr", BJ: "fr",
    GA: "fr", CG: "fr", CD: "fr", MG: "fr", HT: "fr", LU: "fr", MC: "fr"
  };

  // Time zone → country, used to guess the visitor's country without any network call
  var TZ_COUNTRY = {
    "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Dhaka": "BD", "Asia/Dubai": "AE", "Asia/Riyadh": "SA",
    "Asia/Qatar": "QA", "Asia/Kuwait": "KW", "Asia/Muscat": "OM", "Asia/Bahrain": "BH", "Africa/Cairo": "EG",
    "Asia/Amman": "JO", "Asia/Baghdad": "IQ", "Asia/Beirut": "LB", "Africa/Casablanca": "MA", "Africa/Algiers": "DZ",
    "Africa/Tunis": "TN", "Africa/Tripoli": "LY", "Asia/Damascus": "SY", "Asia/Aden": "YE", "Africa/Khartoum": "SD",
    "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "America/Mexico_City": "MX", "America/Monterrey": "MX",
    "America/Tijuana": "MX", "America/Argentina/Buenos_Aires": "AR", "America/Buenos_Aires": "AR",
    "America/Bogota": "CO", "America/Lima": "PE", "America/Santiago": "CL", "America/Caracas": "VE",
    "America/Guayaquil": "EC", "America/Guatemala": "GT", "America/Havana": "CU", "America/La_Paz": "BO",
    "America/Santo_Domingo": "DO", "America/Tegucigalpa": "HN", "America/Asuncion": "PY",
    "America/El_Salvador": "SV", "America/Managua": "NI", "America/Costa_Rica": "CR", "America/Panama": "PA",
    "America/Montevideo": "UY", "Europe/Paris": "FR", "Europe/Brussels": "BE", "Africa/Dakar": "SN",
    "Africa/Abidjan": "CI", "Africa/Douala": "CM", "Africa/Bamako": "ML", "Africa/Ouagadougou": "BF",
    "Africa/Niamey": "NE", "Africa/Lome": "TG", "Africa/Porto-Novo": "BJ", "Africa/Libreville": "GA",
    "Africa/Brazzaville": "CG", "Africa/Kinshasa": "CD", "Indian/Antananarivo": "MG",
    "America/Port-au-Prince": "HT", "Europe/Luxembourg": "LU", "Europe/Monaco": "MC"
  };

  var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CANVAS|SVG)$/;
  var ATTRS = ["placeholder", "aria-label", "alt", "title"];

  var textOrig = new WeakMap();   // text node → original English
  var attrOrig = new WeakMap();   // element → { attr: original English }
  var headOrig = null;
  var current = "en";

  // ---------- detection ----------
  function safeGet() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
  function safeSet(v) { try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* private mode */ } }

  function guessCountry() {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* old browser */ }
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    var langs = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < langs.length; i++) {
      var m = /-([A-Z]{2})\b/i.exec(langs[i]);
      if (m) return m[1].toUpperCase();
    }
    return "";
  }

  function detect() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q && LANGS[q]) return q;
    var saved = safeGet();
    if (saved && LANGS[saved]) return saved;
    var browser = ((navigator.languages && navigator.languages[0]) || navigator.language || "").slice(0, 2).toLowerCase();
    if (browser !== "en" && LANGS[browser]) return browser;
    return COUNTRY_LANG[guessCountry()] || "en";
  }

  // ---------- translation ----------
  function lookup(src, lang) {
    if (lang === "en") return src;
    var row = DATA.strings[src];
    var idx = DATA.langs.indexOf(lang);
    if (!row || idx < 0 || row[idx] == null) return src;
    return row[idx];
  }

  function t(src, vars) {
    var s = lookup(src, current);
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return s;
  }

  function translateText(node) {
    var orig = textOrig.get(node);
    if (orig == null) {
      orig = node.nodeValue;
      if (!/[A-Za-z]/.test(orig)) return;
      textOrig.set(node, orig);
    }
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(orig);
    if (!DATA.strings[m[2]] && current !== "en") return;
    var out = m[1] + lookup(m[2], current) + m[3];
    if (node.nodeValue !== out) node.nodeValue = out;
  }

  function translateAttrs(el) {
    var store = attrOrig.get(el);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      if (!store) { store = {}; attrOrig.set(el, store); }
      if (!(a in store)) store[a] = el.getAttribute(a);
      var v = lookup(store[a], current);
      if (el.getAttribute(a) !== v) el.setAttribute(a, v);
    }
    // Keep submitted <option> values in English even when the label is translated
    if (el.tagName === "OPTION" && !el.hasAttribute("value")) el.setAttribute("value", el.textContent.trim());
  }

  function walk(root) {
    if (root.nodeType === 3) { if (!SKIP.test(root.parentNode && root.parentNode.nodeName)) translateText(root); return; }
    if (root.nodeType !== 1 || SKIP.test(root.nodeName) || root.hasAttribute("data-i18n-skip")) return;
    translateAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) return SKIP.test(n.nodeName) || n.hasAttribute("data-i18n-skip") ? 2 : 1;
        return 1;
      }
    });
    var n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) translateText(n); else translateAttrs(n);
    }
  }

  function translateHead() {
    var meta = document.querySelector('meta[name="description"]');
    if (!headOrig) headOrig = { title: document.title, desc: meta ? meta.content : "" };
    document.title = lookup(headOrig.title, current);
    if (meta) meta.content = lookup(headOrig.desc, current);
  }

  // ---------- language-specific page setup ----------
  function applyDocument(lang) {
    var cfg = LANGS[lang];
    var html = document.documentElement;
    html.lang = lang;
    html.dir = cfg.rtl ? "rtl" : "ltr";

    var bs = document.querySelector('link[href*="bootstrap"][href$=".css"]:not([href*="icons"])');
    if (bs) {
      var href = bs.getAttribute("href");
      var want = cfg.rtl ? href.replace(/bootstrap(\.rtl)?\.min\.css$/, "bootstrap.rtl.min.css")
                         : href.replace(/bootstrap\.rtl\.min\.css$/, "bootstrap.min.css");
      if (want !== href) bs.setAttribute("href", want);
    }

    if (cfg.font && !document.getElementById("font-" + lang)) {
      var l = document.createElement("link");
      l.id = "font-" + lang;
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=" + cfg.font.replace(/ /g, "+") + ":wght@400;500;600;700&display=swap";
      document.head.appendChild(l);
    }
  }

  // ---------- switcher ----------
  function buildSwitcher() {
    var bar = document.querySelector(".topbar .container");
    if (!bar || document.getElementById("langSelect")) return;
    var wrap = document.createElement("label");
    wrap.className = "lang-switch me-auto";
    wrap.setAttribute("data-i18n-skip", "");
    wrap.innerHTML = '<i class="bi bi-translate" aria-hidden="true"></i>';
    var sel = document.createElement("select");
    sel.id = "langSelect";
    sel.setAttribute("aria-label", "Language");
    Object.keys(LANGS).forEach(function (k) { sel.add(new Option(LANGS[k].name, k)); });
    sel.value = current;
    sel.addEventListener("change", function () { setLanguage(sel.value, true); });
    wrap.appendChild(sel);
    bar.insertBefore(wrap, bar.firstChild);
  }

  // Offer a language that matches a country the visitor picked (used on the upload form)
  function suggestFor(countryCode) {
    var lang = COUNTRY_LANG[countryCode] || "en";
    var old = document.getElementById("langSuggest");
    if (old) old.remove();
    if (lang === current) return;
    var bar = document.createElement("div");
    bar.id = "langSuggest";
    bar.className = "lang-suggest";
    bar.setAttribute("data-i18n-skip", "");
    bar.setAttribute("role", "status");
    var msg = document.createElement("span");
    msg.textContent = lookup("View this page in {lang}?", lang).replace("{lang}", LANGS[lang].name);
    var yes = document.createElement("button");
    yes.type = "button"; yes.className = "btn btn-sm btn-accent";
    yes.textContent = lookup("Switch", lang);
    yes.addEventListener("click", function () { bar.remove(); setLanguage(lang, true); });
    var no = document.createElement("button");
    no.type = "button"; no.className = "btn btn-sm btn-link";
    no.textContent = lookup("No thanks", lang);
    no.addEventListener("click", function () { bar.remove(); });
    bar.appendChild(msg); bar.appendChild(yes); bar.appendChild(no);
    document.body.appendChild(bar);
  }

  function setLanguage(lang, remember) {
    if (!LANGS[lang]) lang = "en";
    current = lang;
    if (remember) safeSet(lang);
    applyDocument(lang);
    if (document.body) {
      walk(document.body);
      translateHead();
      var sel = document.getElementById("langSelect");
      if (sel) sel.value = lang;
      document.dispatchEvent(new CustomEvent("i18n:change", { detail: { lang: lang } }));
    }
  }

  // Run early (in <head>) so direction, fonts and Bootstrap RTL are right before first paint
  current = detect();
  applyDocument(current);

  document.addEventListener("DOMContentLoaded", function () {
    buildSwitcher();
    walk(document.body);
    translateHead();
    // Translate anything the page scripts add later (cards, messages, modals)
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes.forEach(walk); });
    }).observe(document.body, { childList: true, subtree: true });
  });

  window.I18N = {
    t: t,
    get lang() { return current; },
    get locale() { return LANGS[current].locale; },
    get fontStack() { return LANGS[current].font ? "'" + LANGS[current].font + "', " : ""; },
    languages: LANGS,
    setLanguage: setLanguage,
    suggestFor: suggestFor,
    countryLanguage: function (cc) { return COUNTRY_LANG[cc] || "en"; }
  };
})();
