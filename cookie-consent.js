// =========================================================
// Legalizáljuk — süti-elfogadó (cookie consent) panel
// =========================================================
// A Microsoft Clarity (statisztikai) szkript csak akkor töltődik be,
// ha a látogató ehhez hozzájárult. A panel nyelve elsődlegesen a
// böngésző nyelvi beállításából (navigator.language) derül ki; ha ez
// nem állapítható meg, egy IP-cím alapú, kulcs nélküli lekérdezéssel
// (ipapi.co) próbáljuk meg kitalálni az országot. Ha egyik sem
// működik, magyar nyelven jelenik meg (a weboldal alapnyelve).
//
// A döntést (elfogad / elutasít / részletes beállítás) a böngésző
// localStorage-ában tároljuk, hogy ne kérdezzünk rá minden oldalon
// újra.
// =========================================================

(function () {
  "use strict";

  var CONSENT_KEY = "legalizaljuk_cookie_consent_v1";
  var CLARITY_ID = "y0dtmfi37x";

  function loadClarity() {
    if (window.__clarityLoaded) return;
    window.__clarityLoaded = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, "clarity", "script", CLARITY_ID);
  }

  function getStoredConsent() {
    try {
      var raw = window.localStorage.getItem(CONSENT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function storeConsent(analytics) {
    try {
      window.localStorage.setItem(
        CONSENT_KEY,
        JSON.stringify({ analytics: !!analytics, ts: Date.now() })
      );
    } catch (e) {
      // localStorage nem elérhető - a panel minden oldalbetöltéskor újra megjelenik,
      // de ez nem hiba, csak degradált élmény.
    }
  }

  var TEXTS = {
    hu: {
      title: "Sütik kezelése",
      desc: "A legjobb élmény biztosítása érdekében sütiket és hasonló technológiákat használunk (pl. eszközadatok tárolása/elérése). A hozzájárulás lehetővé teszi számunkra a böngészési szokások elemzését ezen a weboldalon. A hozzájárulás megtagadása vagy visszavonása hátrányosan befolyásolhatja egyes funkciókat.",
      accept: "Elfogadom",
      decline: "Elutasítom",
      prefs: "Beállítások megjelenítése",
      policyLink: "Cookie tájékoztató",
      prefsTitle: "Süti-beállítások",
      necessary: "Szükséges sütik",
      necessaryDesc: "A weboldal alapműködéséhez szükségesek, mindig aktívak.",
      analytics: "Statisztikai sütik (Microsoft Clarity)",
      analyticsDesc: "Segítenek megérteni, hogyan használják látogatóink a weboldalt.",
      save: "Beállítások mentése"
    },
    sk: {
      title: "Spravovať súhlas",
      desc: "Na poskytovanie tých najlepších skúseností používame technológie, ako sú súbory cookie na ukladanie a/alebo prístup k informáciám o zariadení. Súhlas s týmito technológiami nám umožní spracovávať údaje, ako je správanie pri prehliadaní na tejto stránke. Nesúhlas alebo odvolanie súhlasu môže nepriaznivo ovplyvniť určité vlastnosti a funkcie.",
      accept: "Prijať",
      decline: "Odmietnuť",
      prefs: "Zobraziť predvoľby",
      policyLink: "Zásady používania súborov cookie (EÚ)",
      prefsTitle: "Predvoľby súborov cookie",
      necessary: "Nevyhnutné cookies",
      necessaryDesc: "Potrebné pre základné fungovanie stránky, vždy aktívne.",
      analytics: "Štatistické cookies (Microsoft Clarity)",
      analyticsDesc: "Pomáhajú nám pochopiť, ako návštevníci používajú stránku.",
      save: "Uložiť predvoľby"
    }
  };

  function detectLangSync() {
    var langs =
      navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language || navigator.userLanguage || ""];
    for (var i = 0; i < langs.length; i++) {
      var l = (langs[i] || "").toLowerCase();
      if (l.indexOf("sk") === 0) return "sk";
      if (l.indexOf("hu") === 0) return "hu";
    }
    return null;
  }

  // Csak akkor fut le, ha a böngésző nyelvéből nem derült ki sk/hu.
  // Kulcs nélküli, ingyenes IP-geolokációs szolgáltatás; rövid timeout-tal,
  // hiba esetén csendben magyarra esik vissza.
  function detectLangByIP(cb) {
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; cb("hu"); }
    }, 2500);

    fetch("https://ipapi.co/json/", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        var country = ((data && data.country_code) || "").toUpperCase();
        cb(country === "SK" ? "sk" : "hu");
      })
      .catch(function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cb("hu");
      });
  }

  function renderBanner(t) {
    var wrap = document.createElement("div");
    wrap.className = "cc-banner";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-live", "polite");
    wrap.innerHTML =
      '<div class="cc-card">' +
        '<h3 class="cc-title">' + t.title + "</h3>" +
        '<p class="cc-desc">' + t.desc + "</p>" +
        '<div class="cc-prefs-panel" hidden>' +
          '<div class="cc-pref-row">' +
            "<div><b>" + t.necessary + "</b><div class=\"cc-pref-desc\">" + t.necessaryDesc + "</div></div>" +
            '<input type="checkbox" checked disabled aria-label="' + t.necessary + '">' +
          "</div>" +
          '<div class="cc-pref-row">' +
            "<div><b>" + t.analytics + "</b><div class=\"cc-pref-desc\">" + t.analyticsDesc + "</div></div>" +
            '<input type="checkbox" class="cc-analytics-toggle" checked aria-label="' + t.analytics + '">' +
          "</div>" +
          '<button type="button" class="btn btn-cyan btn-block cc-save">' + t.save + "</button>" +
        "</div>" +
        '<div class="cc-actions">' +
          '<button type="button" class="btn btn-cyan cc-accept">' + t.accept + "</button>" +
          '<button type="button" class="btn btn-outline cc-decline">' + t.decline + "</button>" +
          '<button type="button" class="cc-prefs-toggle">' + t.prefs + "</button>" +
        "</div>" +
        '<a class="cc-policy-link" href="cookie-tajekoztato.html">' + t.policyLink + "</a>" +
      "</div>";
    document.body.appendChild(wrap);

    function close() {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    wrap.querySelector(".cc-accept").addEventListener("click", function () {
      storeConsent(true);
      loadClarity();
      close();
    });
    wrap.querySelector(".cc-decline").addEventListener("click", function () {
      storeConsent(false);
      close();
    });
    wrap.querySelector(".cc-prefs-toggle").addEventListener("click", function () {
      var panel = wrap.querySelector(".cc-prefs-panel");
      panel.hidden = !panel.hidden;
    });
    wrap.querySelector(".cc-save").addEventListener("click", function () {
      var analytics = wrap.querySelector(".cc-analytics-toggle").checked;
      storeConsent(analytics);
      if (analytics) loadClarity();
      close();
    });
  }

  function init(lang) {
    var existing = getStoredConsent();
    if (existing) {
      if (existing.analytics) loadClarity();
      return;
    }
    renderBanner(TEXTS[lang] || TEXTS.hu);
  }

  function start() {
    var lang = detectLangSync();
    if (lang) {
      init(lang);
    } else {
      detectLangByIP(init);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
