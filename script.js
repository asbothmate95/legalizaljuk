// =========================================================
// Legalizáljuk - visszaszámláló + form-kezelés
// =========================================================

(function () {
  "use strict";

  /* ---------- Supabase kapcsolat (lead-ek mentése + e-mail-küldés) ---------- */
  // A weboldal ide küldi be az űrlap-adatokat (közvetlenül a böngészőből,
  // a Supabase publikus "anon" kulcsával). Ez a kulcs SZÁNDÉKOSAN publikus
  // - nem titok - , mert az adatbázis-oldali RLS-szabály (lásd
  // backend/supabase_schema.sql) ezzel a kulccsal KIZÁRÓLAG új sor
  // beszúrását engedélyezi, olvasást/módosítást/törlést nem. Az e-mail
  // kiküldés (Resend API-kulccsal) egy külön, szerveroldali Edge
  // Function-ben történik, amit egy adatbázis-trigger indít el minden
  // új beszúráskor - a Resend-kulcs SOHA nem kerül a böngészőbe.
  //
  // A saját Supabase projekted adatait (Project Settings → API) írd be
  // ide a telepítés előtt - lásd: backend/SETUP-UTMUTATO.md
  var SUPABASE_URL = "https://vrhrzlvhyxrkxxcjxmaf.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_Tbc0xXDswbuM2CDXszZHHw_YaT32Lg_";
  var SUPABASE_CONFIGURED = SUPABASE_URL.indexOf("YOUR_PROJECT_REF") === -1 && SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE_ANON_KEY") === -1;

  /* ---------- Élő visszaszámláló 2029-03-31 23:59:59-ig ---------- */
  // Helyi (böngésző szerinti) időként értelmezve - mivel a látogatók
  // túlnyomó része Szlovákiában van, ez megegyezik a törvényi határidővel.
  var target = new Date(2029, 2, 31, 23, 59, 59); // hónap: 0-indexelt, 2 = március

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function updateCountdown() {
    var daysEl = document.getElementById("cd-days");
    var hoursEl = document.getElementById("cd-hours");
    var minsEl = document.getElementById("cd-mins");
    var secsEl = document.getElementById("cd-secs");
    if (!daysEl) return;

    var now = new Date();
    var diff = target.getTime() - now.getTime();

    if (diff <= 0) {
      daysEl.textContent = "0";
      hoursEl.textContent = "00";
      minsEl.textContent = "00";
      secsEl.textContent = "00";
      return;
    }

    var totalSeconds = Math.floor(diff / 1000);
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var mins = Math.floor((totalSeconds % 3600) / 60);
    var secs = totalSeconds % 60;

    daysEl.textContent = String(days);
    hoursEl.textContent = pad(hours);
    minsEl.textContent = pad(mins);
    secsEl.textContent = pad(secs);
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  /* ---------- Konzultáció ajánlat - 10 perc ingyenes, utána 24 órára zárolva ---------- */
  // Az első látogatáskor (vagy ha az előző ajánlat lejárta óta eltelt 24
  // óra) az oldal betöltésétől számított 10 percig ingyenes a rendesen
  // 50 €-s (a projekt árából levonásra kerülő) telefonos konzultáció.
  // Ez az állapot (mikor jár le) a böngésző localStorage-ában tárolódik,
  // ezért oldal-újratöltés és lapváltás után is folytatódik - nem indul
  // újra minden betöltéskor. Ha a 10 perc lejárt, a gombok 24 órán át a
  // fizetős (50 €) ajánlatot mutatják, utána új 10 perces ablak nyílik.
  // Megjegyzés: ez kliensoldali, eszköz/böngésző-szintű állapot - ha a
  // látogató töröl minden böngészőadatot vagy más eszközről nyitja meg
  // az oldalt, számára új ablak indul.
  var OFFER_STORAGE_KEY = "legalizaljuk_consult_offer_expires_at";
  var OFFER_FREE_MS = 10 * 60 * 1000; // 10 perc
  var OFFER_LOCK_MS = 24 * 60 * 60 * 1000; // 24 óra

  function readStoredExpiry() {
    try {
      var raw = window.localStorage.getItem(OFFER_STORAGE_KEY);
      return raw ? parseInt(raw, 10) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStoredExpiry(value) {
    try {
      window.localStorage.setItem(OFFER_STORAGE_KEY, String(value));
    } catch (e) {
      // localStorage nem elérhető (pl. szigorú inkognitó-beállítás) - 
      // ilyenkor minden oldalbetöltéskor friss 10 perces ablak indul.
    }
  }

  function getOfferExpiry() {
    var now = Date.now();
    var expiresAt = readStoredExpiry();
    if (!expiresAt || now >= expiresAt + OFFER_LOCK_MS) {
      expiresAt = now + OFFER_FREE_MS;
      writeStoredExpiry(expiresAt);
    }
    return expiresAt;
  }

  var fullCtaEls = Array.prototype.slice.call(document.querySelectorAll('[data-consult-cta="full"]'));
  var compactCtaEls = Array.prototype.slice.call(document.querySelectorAll('[data-consult-cta="compact"]'));
  var consultWizardSub = document.getElementById("consult-wizard-sub");
  var consultSubmitBtn = document.getElementById("consult-submit");

  // az eredeti (ingyenes-állapotú) felirat elmentése, hogy vissza tudjunk
  // állni rá egy következő, friss 10 perces ablaknál
  compactCtaEls.forEach(function (el) {
    el.dataset.freeLabel = el.textContent;
  });

  function renderLockedFullCta(el) {
    el.classList.add("is-locked");
    el.innerHTML =
      '<span class="timer-row">' +
        '<span class="orig-offer">MÉRNÖKI KONZULTÁCIÓ</span>' +
        '<span class="urgent-badge"><span class="urgent-dot" aria-hidden="true"></span>FOGLALJON MOST</span>' +
      "</span>" +
      '<span class="timer-main">KONZULTÁCIÓT KÉREK</span>';
  }

  function applyOfferState() {
    var expiresAt = getOfferExpiry();
    var remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      // LEZÁRVA - a 10 perces ingyenes ablak lejárt. Nem árat mutatunk,
      // hanem pirossal, sürgetve hívjuk fel rá a figyelmet, hogy még
      // mindig érdemes most rákattintani.
      fullCtaEls.forEach(function (el) {
        if (!el.classList.contains("is-locked")) renderLockedFullCta(el);
      });
      compactCtaEls.forEach(function (el) {
        el.classList.add("is-locked");
        el.innerHTML = '<span class="urgent-dot" aria-hidden="true"></span>' + (el.dataset.lockedLabel || el.dataset.freeLabel);
      });
      if (consultWizardSub) {
        consultWizardSub.innerHTML = 'Az ingyenes időablak épp lejárt, de a konzultáció továbbra is elérhető. <span class="text-urgent">Ne halogassa - foglaljon időpontot még ma</span>, hogy időben elkezdhessük az Ön ügyét.';
      }
      if (consultSubmitBtn) {
        consultSubmitBtn.textContent = "Küldés - kérem a konzultációt";
      }
      return false; // nincs több teendő, nem kell tovább ketyegni
    }

    // AKTÍV - ingyenes, ketyeg a visszaszámláló
    var totalSeconds = Math.ceil(remaining / 1000);
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    var text = m + ":" + pad(s);
    Array.prototype.forEach.call(document.querySelectorAll(".consult-timer-value"), function (el) {
      el.textContent = text;
    });
    return true; // van még hátra, kell a következő tick
  }

  if (fullCtaEls.length || compactCtaEls.length) {
    var offerStillTicking = applyOfferState();
    if (offerStillTicking) {
      var offerInterval = setInterval(function () {
        var keepGoing = applyOfferState();
        if (!keepGoing) clearInterval(offerInterval);
      }, 1000);
    }
  }

  /* ---------- Könyv-igénylés - felugró ablak (modal) ---------- */
  // A könyv-CTA-k (href="#form") mostantól nem egy külön oldalszekcióhoz
  // görgetnek, hanem egy felugró ablakban nyitják meg az egyszerű
  // (e-mail + telefon) könyv-igénylő űrlapot - így az oldalon scrollozva
  // csak egy inline űrlap (a konzultációs kvíz) látszik, nem kettő
  // egymás alatt.
  var bookModalOverlay = document.getElementById("book-modal-overlay");
  if (bookModalOverlay) {
    var bookModalClose = document.getElementById("book-modal-close");
    var bookModalLastFocus = null;

    var openBookModal = function () {
      bookModalLastFocus = document.activeElement;
      bookModalOverlay.hidden = false;
      document.body.classList.add("modal-open");
      document.addEventListener("keydown", onBookModalKeydown);
      var firstField = document.getElementById("email");
      if (firstField) {
        setTimeout(function () { firstField.focus(); }, 50);
      }
    };

    var closeBookModal = function () {
      bookModalOverlay.hidden = true;
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onBookModalKeydown);
      if (bookModalLastFocus && typeof bookModalLastFocus.focus === "function") {
        bookModalLastFocus.focus();
      }
    };

    function onBookModalKeydown(e) {
      if (e.key === "Escape" || e.keyCode === 27) closeBookModal();
    }

    Array.prototype.forEach.call(document.querySelectorAll('a[href="#form"]'), function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        openBookModal();
      });
    });

    if (bookModalClose) {
      bookModalClose.addEventListener("click", closeBookModal);
    }
    bookModalOverlay.addEventListener("click", function (e) {
      if (e.target === bookModalOverlay) closeBookModal();
    });

    // más oldalról érkezve (pl. impresszum.html -> index.html#form)
    // automatikusan nyíljon meg az ablak, majd tisztuljon a URL
    if (window.location.hash === "#form") {
      openBookModal();
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
  }

  /* ---------- Közös segédfüggvények (email / telefon formai ellenőrzés) ---------- */
  // Ez csak FORMAI ellenőrzés (helyes e-mail-formátum, elég számjegy a
  // telefonszámban) - kiszűri az elgépeléseket és a nyilvánvalóan hamis
  // adatokat, de nem garantálja, hogy a megadott cím/szám valóban létezik
  // és elérhető. Ehhez egy backend-alapú megerősítés kellene: pl.
  // megerősítő e-mail (double opt-in) és/vagy SMS-kód küldése egy
  // szolgáltatáson (pl. Twilio Verify) keresztül.
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  function isValidPhone(value) {
    var digits = value.replace(/[\s\-().]/g, "");
    return /^\+?\d{9,14}$/.test(digits);
  }

  function submitLead(data) {
    // -----------------------------------------------------------
    // Beszúrja a lead-et a Supabase "leads" táblájába. Ez automatikusan
    // elindítja a backend/supabase/functions/send-lead-email Edge
    // Function-t (adatbázis-trigger), ami kiküldi:
    //   - a látogatónak a visszaigazoló e-mailt (+ a PDF e-könyvet, ha
    //     van e-mail címe),
    //   - Máténak a belső értesítést az új érdeklődőről.
    //
    // Amíg a SUPABASE_URL / SUPABASE_ANON_KEY nincs beállítva (lásd a
    // fájl elején), ez a függvény csak egy figyelmeztetést ír a
    // konzolra, és a form továbbra is átirányít a köszönő oldalra - 
    // de az adatok NEM kerülnek sehova elmentésre, és e-mail SEM megy
    // ki, amíg a backend/SETUP-UTMUTATO.md lépéseit el nem végzed.
    // -----------------------------------------------------------
    if (!SUPABASE_CONFIGURED) {
      console.warn(
        "Legalizáljuk: a Supabase backend még nincs beállítva (script.js tetején SUPABASE_URL / " +
        "SUPABASE_ANON_KEY) - a lead NEM lett elmentve, e-mail NEM ment ki. Lásd backend/SETUP-UTMUTATO.md"
      );
      return;
    }

    fetch(SUPABASE_URL + "/rest/v1/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(data),
      keepalive: true
    }).catch(function (err) {
      // Hálózati hiba esetén se szakítsuk meg a látogató folyamatát - 
      // a form továbbra is átirányít a köszönő oldalra, csak a mentés
      // marad el. A hibát a konzolra írjuk hibakereséshez.
      console.error("Legalizáljuk: a lead mentése sikertelen volt.", err);
    });
  }

  /* ---------- 1. ŰRLAP - ingyenes e-könyv (csak email + telefon) ---------- */
  var bookForm = document.getElementById("book-form");
  if (bookForm) {
    var bookErrorBox = document.getElementById("book-form-error");

    function showBookError(msg) {
      bookErrorBox.textContent = msg;
      bookErrorBox.classList.add("show");
    }
    function clearBookError() {
      bookErrorBox.classList.remove("show");
    }

    bookForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var email = bookForm.elements["email"].value.trim();
      var phone = bookForm.elements["phone"].value.trim();
      var gdpr = bookForm.elements["gdpr_consent"].checked;

      if (!email || !isValidEmail(email)) {
        showBookError("Kérjük, adjon meg egy érvényes e-mail címet.");
        return;
      }
      if (!phone || !isValidPhone(phone)) {
        showBookError("Kérjük, adjon meg egy érvényes telefonszámot (pl. 0918 208 118 vagy +421 918 208 118).");
        return;
      }
      if (!gdpr) {
        showBookError("Kérjük, fogadja el az adatkezelési tájékoztatót a folytatáshoz.");
        return;
      }
      clearBookError();

      submitLead({
        type: "book",
        email: email,
        phone: phone,
        newsletter_optin: bookForm.elements["newsletter_optin"].checked
      });

      window.location.href = "koszonjuk.html";
    });
  }

  /* ---------- 2. ŰRLAP - ingyenes telefonos konzultáció (3 lépéses kvíz) ---------- */
  // Lépések: 0 = épülettípus, 1 = építés ideje, 2 = helyszín (ZBGIS-hez) +
  // elérhetőség (telefon kötelező, e-mail nem) + részletek.
  var consultForm = document.getElementById("consult-form");
  if (consultForm) {
    var cSteps = Array.prototype.slice.call(consultForm.querySelectorAll(".wizard-step"));
    var cLastStep = cSteps.length - 1;
    var cChipsBox = document.getElementById("consult-chips");
    var cBackBtn = document.getElementById("consult-back");
    var cSubmitBtn = document.getElementById("consult-submit");
    var cErrorBox = document.getElementById("consult-form-error");

    var cAnswers = {};
    var cCurrentStep = 0;

    function showConsultError(msg) {
      cErrorBox.textContent = msg;
      cErrorBox.classList.add("show");
    }
    function clearConsultError() {
      cErrorBox.classList.remove("show");
    }

    function showConsultStep(n, scroll) {
      cCurrentStep = n;
      cSteps.forEach(function (s) {
        s.hidden = Number(s.dataset.step) !== n;
      });
      cBackBtn.hidden = n === 0;
      cSubmitBtn.hidden = n !== cLastStep;
      clearConsultError();

      // görgessünk a kártya tetejére, hogy mobilon is lássa a váltást - 
      // de csak felhasználói interakció után, az oldal betöltésekor ne
      // ugorjon el a Hero-ról.
      if (scroll !== false) {
        var card = consultForm.closest(".wizard-card");
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }

    function renderConsultChips() {
      cChipsBox.innerHTML = "";
      Object.keys(cAnswers).forEach(function (field) {
        var a = cAnswers[field];
        var chip = document.createElement("span");
        chip.className = "chip";
        var text = document.createElement("span");
        text.textContent = a.label + ": " + a.value;
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.setAttribute("aria-label", "Módosítás: " + a.label);
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", function () {
          showConsultStep(a.step);
        });
        chip.appendChild(text);
        chip.appendChild(removeBtn);
        cChipsBox.appendChild(chip);
      });
    }

    function selectConsultOption(btn) {
      var grid = btn.parentElement;
      var field = grid.dataset.field;
      var fieldLabel = grid.dataset.fieldlabel;
      var value = btn.dataset.value;
      var step = Number(btn.closest(".wizard-step").dataset.step);

      Array.prototype.forEach.call(grid.querySelectorAll(".option-btn"), function (b) {
        b.classList.remove("selected");
      });
      btn.classList.add("selected");

      cAnswers[field] = { step: step, label: fieldLabel, value: value };

      var hiddenInput = document.getElementById("consult-hidden-" + field.replace(/_/g, "-"));
      if (hiddenInput) hiddenInput.value = value;

      renderConsultChips();

      // a 0. és 1. lépésen a választás automatikusan tovább visz a
      // következő lépésre; a 2. (utolsó) lépésen (lakhatás célja) csak kijelöl
      if (step < cLastStep) {
        setTimeout(function () { showConsultStep(step + 1); }, 180);
      }
    }

    Array.prototype.forEach.call(consultForm.querySelectorAll(".option-btn"), function (btn) {
      btn.addEventListener("click", function () { selectConsultOption(btn); });
    });

    cBackBtn.addEventListener("click", function () {
      if (cCurrentStep > 0) showConsultStep(cCurrentStep - 1);
    });

    consultForm.addEventListener("submit", function (e) {
      e.preventDefault();

      if (cCurrentStep !== cLastStep) {
        // védelem stray Enter billentyűre / hibás állapotra
        return;
      }

      var buildingType = cAnswers.building_type ? cAnswers.building_type.value : "";
      var builtPeriod = cAnswers.built_period ? cAnswers.built_period.value : "";
      var forResidence = cAnswers.for_residence ? cAnswers.for_residence.value : "";
      var settlement = consultForm.elements["settlement"].value.trim();
      var houseNumber = consultForm.elements["house_number"].value.trim();
      var name = consultForm.elements["name"].value.trim();
      var phone = consultForm.elements["phone"].value.trim();
      var email = consultForm.elements["email"].value.trim();
      var message = consultForm.elements["message"].value.trim();
      var gdpr = consultForm.elements["gdpr_consent"].checked;

      if (!buildingType || !builtPeriod) {
        showConsultError("Kérjük, az előző lépésekben válassza ki az épülettípust és az építés idejét.");
        showConsultStep(buildingType ? 1 : 0);
        return;
      }
      if (!settlement || !forResidence || !name) {
        showConsultError("Kérjük, töltse ki az összes kötelező mezőt.");
        return;
      }
      if (!phone || !isValidPhone(phone)) {
        showConsultError("Kérjük, adjon meg egy érvényes telefonszámot (pl. 0918 208 118 vagy +421 918 208 118) - ezen fogjuk hívni.");
        return;
      }
      if (email && !isValidEmail(email)) {
        showConsultError("A megadott e-mail cím formátuma nem tűnik érvényesnek - javítsa ki, vagy hagyja üresen.");
        return;
      }
      if (!gdpr) {
        showConsultError("Kérjük, fogadja el az adatkezelési tájékoztatót a folytatáshoz.");
        return;
      }
      clearConsultError();

      submitLead({
        type: "consult",
        building_type: buildingType,
        built_period: builtPeriod,
        for_residence: forResidence,
        settlement: settlement,
        house_number: houseNumber,
        name: name,
        phone: phone,
        email: email,
        message: message,
        newsletter_optin: consultForm.elements["newsletter_optin"].checked
      });

      window.location.href = "koszonjuk-konzultacio.html";
    });

    showConsultStep(0, false);
  }

  /* ---------- Mobil sticky CTA sáv - elrejtés, ha épp egy űrlap látszik ---------- */
  // Így a látogató bárhonnan egy koppintással eljut valamelyik űrlaphoz,
  // de amíg ténylegesen az egyik űrlapot tölti ki, a sáv nem takarja el
  // a Küldés gombot.
  var stickyBar = document.querySelector(".mobile-sticky-cta");
  var formSections = [document.getElementById("form"), document.getElementById("form-consult")].filter(Boolean);
  if (stickyBar && formSections.length && "IntersectionObserver" in window) {
    var visibleForms = new Set();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          visibleForms.add(entry.target);
        } else {
          visibleForms.delete(entry.target);
        }
      });
      stickyBar.classList.toggle("is-hidden", visibleForms.size > 0);
    }, { threshold: 0.15 });
    formSections.forEach(function (el) { observer.observe(el); });
  }
})();
