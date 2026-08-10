# Legalizáljuk — Lead-mentés + automatikus e-mail-küldés beállítása

## ✅ Állapot — ez már el van végezve a `LEGALIZALJUK` Supabase projektedben

A projekted Supabase fiókjában (asboth.mate@madspace.co.uk) az alábbiakat élesben, közvetlenül beállítottam és leteszteltem:

- `leads` tábla + biztonsági (RLS) szabály létrehozva (`backend/supabase_schema.sql` lefuttatva)
- `send-lead-email` Edge Function telepítve (`backend/supabase/functions/send-lead-email/index.ts` tartalmával)
- mind a 4 titkos kulcs (`RESEND_API_KEY`, `NOTIFY_TO_EMAIL`, `RESEND_FROM_EMAIL`, `EBOOK_DRIVE_URL`) beállítva
- a `script.js` fájl a csomagban MÁR a te valós Supabase URL-eddel és publikus kulcsoddal van feltöltve — nincs több teendő ezen a téren
- **az e-könyv NEM csatolmányként, hanem egy Google Drive megosztási linkként** kerül ki a kimenő e-mailekben — a link az `EBOOK_DRIVE_URL` secretben van beállítva
- minden kimenő e-mail (a látogatóknak és a belső értesítés is) egységes HTML aláírással záródik (Ing. arch. Asbóth Máté elérhetőségei)
- a teljes láncot (űrlap → adatbázis → automatikus e-mail, Drive-linkkel) tesztadatokkal ellenőriztem

**Ami még hátravan, mielőtt élesben, valódi ügyfeleknek is helyesen menjenek ki a levelek:**

1. **Resend teszt-korlátozás** — amíg nincs saját domain hitelesítve a Resend-en, a rendszer **kizárólag a te saját Resend-fiókodhoz tartozó e-mail címre** (amivel a Resend-re regisztráltál) tud levelet küldeni — bárki másnak (a valódi látogatóknak) NEM fog kimenni a levél. Ez a Resend biztonsági korlátozása, nem hiba. Ahhoz, hogy a valódi látogatóknak is menjenek a levelek, végezd el az alábbi 3. lépést (domain hitelesítés a resend.com/domains oldalon), majd frissítsd a `RESEND_FROM_EMAIL` és `NOTIFY_TO_EMAIL` secreteket a saját domained címeire.

A lenti lépések (1–7) a teljes, önálló beállítási útmutatót írják le — ha egy másik Supabase/Resend projekttel szeretnéd újra elvégezni, vagy csak meg szeretnéd érteni a rendszert, kövesd őket sorban.

Ez az útmutató végigvezet azon, hogyan kösd be a weboldal két űrlapját
(„Kérem az ingyenes könyvet” és „Tudja meg, legalizálható-e az épülete”)
egy **ingyenes Supabase adatbázisba**, és hogyan indítson minden egyes
beküldés **automatikus e-mailt** (a látogatónak a PDF e-könyvvel, Neked
pedig egy belső értesítést az új érdeklődőről) a **Resend** szolgáltatáson
keresztül.

Mindkét szolgáltatás ingyenes csomagja bőven elég egy induló vállalkozás
forgalmához (Supabase: ingyenes / hónap; Resend: 3000 e-mail / hónap,
100 e-mail / nap — ingyen). Nincs havidíj, amíg ezeket a kereteket nem
lépi túl a weboldal.

---

## 1. lépés — Supabase projekt létrehozása

1. Regisztrálj a [supabase.com](https://supabase.com) oldalon (ingyenes).
2. Hozz létre egy új projektet (pl. `legalizaljuk`).
3. A **Project Settings → API** oldalon másold ki:
   - **Project URL** (pl. `https://abcdefgh.supabase.co`)
   - **anon public** kulcs (egy hosszú, `eyJ...`-vel kezdődő token)
   - **service_role** kulcs (ezt csak a saját gépeden / CLI-ben használd,
     SOHA ne kerüljön bele a weboldal kódjába!)
   - a **Project Reference** (az URL-ből az `abcdefgh` rész)

## 2. lépés — adatbázis-tábla létrehozása

1. Nyisd meg a Supabase Dashboardon a **SQL Editor**-t.
2. Nyisd meg a `backend/supabase_schema.sql` fájlt (ebben a csomagban),
   és a `<PROJECT_REF>` és `<ANON_KEY>` helyére írd be a saját projekted
   1. lépésben kimásolt adatait.
3. Másold be a teljes fájl tartalmát az SQL Editorba, és nyomj **Run**-t.
   Ez létrehozza a `leads` táblát, a biztonsági (RLS) szabályokat, és a
   triggert, ami minden új lead-nél meghívja majd az e-mail-küldő
   függvényt.

## 3. lépés — Resend fiók (az e-mail-küldéshez)

1. Regisztrálj a [resend.com](https://resend.com) oldalon (ingyenes).
2. **API Keys** menüpontban hozz létre egy új API-kulcsot — ezt fogod
   megadni a Supabase-nek (lásd 5. lépés).
3. (Ajánlott, de nem kötelező az induláshoz) **Domains** menüpontban add
   hozzá és hitelesítsd a saját domained (pl. `legalizaljuk.sk`) — így a
   leveleid a saját domainedről mennek ki, nem kerülnek könnyen
   spam-mappába, és profibb hatást keltenek. Amíg ezt nem teszed meg,
   ideiglenesen a Resend saját `onboarding@resend.dev` feladó-címét
   használhatod teszteléshez.

## 4. lépés — az e-könyv Google Drive linkjének beállítása

> ✅ A te `LEGALIZALJUK` projektedben ez már megtörtént: az `EBOOK_DRIVE_URL`
> secret be van állítva a Google Drive megosztási linkre
> (`https://drive.google.com/file/d/1gZ2rA_q4fLQvJK9K2M188ptDW3J8CuhT/view?usp=sharing`).
> Ez a lépés csak akkor kell, ha egy másik/új e-könyv linket akarsz beállítani.

Az e-könyvet NEM csatolmányként küldjük ki (hogy elkerüljük a spamszűrők
gyanakvását nagy PDF-csatolmányoknál), hanem egy Google Drive linkként
szerepel az e-mail szövegében.

1. Töltsd fel a végleges e-könyv PDF-et a Google Drive-ra.
2. Kattints jobb gombbal a fájlra → **Megosztás** → állítsd "Bárki, aki
   rendelkezik a linkkel" (Anyone with the link) jogosultságúra.
3. Másold ki a megosztási linket (pl.
   `https://drive.google.com/file/d/XXXXXXXX/view?usp=sharing`) — erre
   lesz szükség az 5. lépésben.

> Ha a link még nincs kész, ideiglenesen üresen hagyhatod ezt a lépést —
> a rendszer egy alapértelmezett Drive-linket használ, amíg meg nem adod
> az `EBOOK_DRIVE_URL`-t.

## 5. lépés — Edge Function telepítése (Supabase CLI)

Ehhez szükséged lesz a [Supabase CLI](https://supabase.com/docs/guides/cli)-re
(egyszeri telepítés a saját gépedre):

```bash
npm install -g supabase

# bejelentkezés + a projekt összekötése
supabase login
supabase link --project-ref <PROJECT_REF>

# titkos kulcsok beállítása (SOHA ne kerüljenek a weboldal kódjába!)
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set NOTIFY_TO_EMAIL=hello@legalizaljuk.sk
supabase secrets set RESEND_FROM_EMAIL="Legalizáljuk <hello@legalizaljuk.sk>"
supabase secrets set EBOOK_DRIVE_URL="https://drive.google.com/file/d/XXXXXXXX/view?usp=sharing"

# a függvény feltöltése
supabase functions deploy send-lead-email --no-verify-jwt
```

A `backend/supabase/functions/send-lead-email/index.ts` fájl tartalmazza
a teljes logikát — nincs mit módosítani rajta, csak a fenti secreteket
kell beállítani.

## 6. lépés — a weboldal kódjának összekötése

Nyisd meg a `script.js` fájl legelejét, és írd be a saját Supabase
projekted adatait:

```js
var SUPABASE_URL = "https://<PROJECT_REF>.supabase.co";
var SUPABASE_ANON_KEY = "<ide az anon public kulcs>";
```

Ez a kulcs **szándékosan publikus** — bárki láthatja a weboldal
forráskódjában —, mert az adatbázis-oldali biztonsági szabály (RLS)
ezzel a kulccsal kizárólag ÚJ SOR BESZÚRÁSÁRA jogosít, olvasásra vagy
módosításra nem. A leadeket Te a Supabase Dashboard **Table Editor**
nézetében, bejelentkezve tudod megtekinteni.

## 7. lépés — tesztelés

1. Töltsd be a weboldalt, töltsd ki bármelyik űrlapot egy valós, Te
   magad által ellenőrizhető e-mail címmel.
2. Ellenőrizd a Supabase **Table Editor → leads** táblát — meg kell
   jelennie az új sornak.
3. Ellenőrizd a megadott e-mail postafiókot (és a `NOTIFY_TO_EMAIL`
   címet is) — pár másodpercen belül meg kell érkeznie mindkét
   levélnek.
4. Ha valami nem jön meg: Supabase Dashboard → **Edge Functions →
   send-lead-email → Logs** — itt látod a hibaüzenetet (pl. hiányzó
   API-kulcs, nem hitelesített domain stb.).

---

## Miért ezt az architektúrát választottuk (nem sima Mailchimp)?

Kérted, hogy akár az ingyenes Mailchimp-et is használhatjuk — ezt
megvizsgáltam, de a Mailchimp elsősorban hírlevél-küldésre és
automatizált „drip” kampányokra való; egyedi, látogatónként eltérő PDF
csatolmányos, azonnali („valaki most töltötte ki az űrlapot”) e-mailek
küldésére a sima (ingyenes) Mailchimp nem alkalmas — ehhez a fizetős
Mailchimp Transactional (Mandrill) termékre lenne szükség, ami már nem
ingyenes.

A **Supabase + Resend** kombináció:
- **teljesen ingyenes** a várható forgalom mellett (nincs kártyaszám
  sem szükséges hozzá a regisztrációhoz),
- **kódszinten, automatikusan** működik — nincs kézi kampányindítás,
  nincs manuális lépés egy-egy új érdeklődőnél,
- **biztonságos** — a Resend API-kulcs sosem kerül a böngészőbe, csak a
  Supabase szerveroldali titkai közé,
- és a leadek egy helyen, a Supabase adatbázisában gyűlnek, ahonnan
  bármikor exportálhatók (pl. Excel/CSV-be) vagy később egy CRM-be is
  átköthetők.

## Mennyibe kerül, ha a weboldal beindul és sok az érdeklődő?

- Supabase ingyenes csomag: 500 MB adatbázis, havonta bőven elég egy
  induló legalizálási tanácsadó vállalkozásnak (több ezer lead is
  belefér).
- Resend ingyenes csomag: 3000 e-mail / hónap, 100 e-mail / nap. Ha ezt
  túllépnéd (pl. napi 50+ új érdeklődő), a Resend következő csomagja
  havi kb. 20 USD-től indul.
