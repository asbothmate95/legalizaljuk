// =========================================================
// Legalizáljuk — send-lead-email Supabase Edge Function
// =========================================================
// Ezt a függvényt a leads tábla adatbázis-triggere hívja meg minden
// egyes új űrlap-beküldésnél (lásd: supabase_schema.sql).
//
// Két e-mailt küld ki a Resend API-n keresztül (https://resend.com):
//   1) A LÁTOGATÓNAK — ha megadott e-mail címet:
//        - "book" típusnál: köszönő e-mail + link az ingyenes e-könyv
//          Google Drive-os PDF-jéhez
//        - "consult" típusnál: visszaigazoló e-mail (a könyv linkjével)
//   2) NEKED (a cég e-mail címére) — értesítés az új érdeklődőről,
//      minden megadott adattal, hogy azonnal fel tudd venni vele a
//      kapcsolatot telefonon.
//
// Minden kimenő e-mail végén egy egységes HTML aláírás szerepel
// (Ing. arch. Asbóth Máté elérhetőségei, logó, közösségi linkek).
//
// SZÜKSÉGES BEÁLLÍTÁSOK (Supabase Dashboard → Edge Functions →
// send-lead-email → Secrets, VAGY a Supabase CLI-vel):
//
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
//   supabase secrets set NOTIFY_TO_EMAIL=hello@legalizaljuk.sk
//   supabase secrets set RESEND_FROM_EMAIL=Legalizáljuk <hello@legalizaljuk.sk>
//
// A RESEND_FROM_EMAIL csak akkor küldhet a saját domainedről (pl.
// @legalizaljuk.sk), ha azt a Resend felületén (Domains → Add Domain)
// előzőleg hitelesítetted (néhány DNS-rekord hozzáadásával a
// domain-szolgáltatódnál). Amíg ezt nem teszed meg, tesztelésre
// használhatod ideiglenesen a Resend saját, előre hitelesített
// "onboarding@resend.dev" feladó-címét.
//
// Az e-könyvet NEM csatolmányként küldjük, hanem egy Google Drive
// megosztási linkként (a fájlnak "Anyone with the link" jogosultsággal
// megoszthatónak kell lennie). A link az EBOOK_DRIVE_URL secret-ben
// állítható be — ha nincs beállítva, egy alapértelmezett link kerül
// felhasználásra:
//
//   supabase secrets set EBOOK_DRIVE_URL=https://drive.google.com/file/d/XXXXXXXX/view?usp=sharing
//
// =========================================================

// deno-lint-ignore-file no-explicit-any
// @ts-ignore — Deno globális objektum az Edge Function futtatókörnyezetében
Deno.serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const lead = payload.record ?? payload;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const NOTIFY_TO_EMAIL = Deno.env.get("NOTIFY_TO_EMAIL");
    const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "Legalizáljuk <onboarding@resend.dev>";
    const EBOOK_DRIVE_URL = Deno.env.get("EBOOK_DRIVE_URL") ||
      "https://drive.google.com/file/d/1gZ2rA_q4fLQvJK9K2M188ptDW3J8CuhT/view?usp=sharing";

    if (!RESEND_API_KEY) {
      throw new Error("Hiányzik a RESEND_API_KEY secret — lásd a fájl elején lévő beállítási útmutatót.");
    }

    // ---------- egységes HTML e-mail aláírás ----------
    const SIGNATURE_HTML = `<table class="main01" style="color: #000000; font-size: medium; font-family: 'Times New Roman';" border="0" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="font-size: 1px;" height="5">&nbsp;</td>
</tr>
<tr>
<td valign="top">
<table style="height: 166px;" border="0" width="410" cellspacing="0" cellpadding="0" align="left">
<tbody>
<tr>
<td align="left" valign="top">
<table border="0" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td align="center" valign="bottom" width="130">
<p><img src="https://softcodeitpark.com/signatures/F3017-viktriakovcs218/images/Mate.png" alt="head" width="130" height="130" /></p>
</td>
<td style="font-size: 1px;" valign="top" width="15">&nbsp;</td>
<td align="left" valign="middle">
<table border="0" width="100%" cellspacing="0" cellpadding="0" align="left">
<tbody>
<tr>
<td align="left" valign="bottom">
<table border="0" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="color: #000000; font-size: 13pt; font-family: 'Open Sans', Arial, Gotham, Helvetica, sans-serif;" colspan="2" align="left" valign="top"><strong>Ing. arch. M&aacute;t&eacute; Asb&oacute;th</strong></td>
</tr>
<tr>
<td style="color: #000000; font-size: 9pt; font-family: 'Open Sans', Arial, Gotham, Helvetica, sans-serif;" colspan="2" align="left" valign="top">
<p>&Eacute;p&iacute;t&eacute;szm&eacute;rn&ouml;k &amp; Telep&uuml;l&eacute;stervező&nbsp;</p>
</td>
</tr>
<tr>
<td style="font-size: 1px;" colspan="2" height="10">&nbsp;</td>
</tr>
<tr>
<td width="20"><img src="https://softcodeitpark.com/signatures/F3017-viktriakovcs218/images/call.png" alt="phone" width="12" height="12" /></td>
<td style="color: #000000; font-size: 9pt; font-family: 'Open Sans', Arial, Gotham, Helvetica, sans-serif; font-weight: normal;" align="left" valign="top"><a style="color: #b78428; font-size: 9pt;" href="tel:+421918208118"><span style="color: #000000;">+421 918 208 118</span></a></td>
</tr>
<tr>
<td style="font-size: 0pt;" colspan="2" height="5">&nbsp;</td>
</tr>
<tr>
<td width="20"><img src="https://softcodeitpark.com/signatures/F3017-viktriakovcs218/images/email.png" alt="email" width="12" height="12" /></td>
<td style="color: #000000; font-size: 9pt; font-family: 'Open Sans', Arial, Gotham, Helvetica, sans-serif; font-weight: normal;" align="left" valign="top">hello@legalizaljuk.sk</td>
</tr>
<tr>
<td style="font-size: 0pt;" colspan="2" height="10">&nbsp;</td>
</tr>
<tr>
<td colspan="2"><a href="https://www.linkedin.com/in/asbothmate/" rel="noopener"><img src="https://softcodeitpark.com/signatures/F3017-viktriakovcs218/images/linkedin.png" alt="linkedin" width="18" height="18" /></a><span>&nbsp;</span>&nbsp;<a href="https://www.instagram.com/madspace.co.uk/" rel="noopener"><img src="https://softcodeitpark.com/signatures/F3017-viktriakovcs218/images/instagram.png" alt="instagram" width="18" height="18" /></a></td>
</tr>
<tr>
<td style="font-size: 0pt;" colspan="2" height="5">&nbsp;</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>
</td>
</tr>
</tbody>
</table>`;

    const emails: any[] = [];

    // ---------- 1) e-mail a látogatónak (ha megadott e-mail címet) ----------
    if (lead.email) {
      const isBook = lead.type === "book";
      const subject = isBook
        ? "Az Ön ingyenes e-könyve — Legalizáljuk"
        : "Megkaptuk a jelentkezését — Legalizáljuk";

      const bodyHtml = isBook
        ? `<p>Kedves Érdeklődő!</p>
           <p>Köszönjük, hogy igényelte az ingyenes e-könyvünket az épületek legalizálásáról (Zákon č. 25/2025 Z. z.). Az alábbi linken tudja letölteni: <a href="${EBOOK_DRIVE_URL}">Ingyenes e-könyv letöltése</a></p>
           <p>Ha bármilyen kérdése van, hívjon bátran: <a href="tel:+421918208118">0918 208 118</a>, vagy válaszoljon erre az e-mailre.</p>
           <p>Üdvözlettel,</p>
           ${SIGNATURE_HTML}`
        : `<p>Kedves ${lead.name || "Érdeklődő"}!</p>
           <p>Köszönjük jelentkezését! Megkaptuk az Ön által megadott adatokat (${lead.building_type || "-"}, ${lead.built_period || "-"}), és <b>24 órán belül telefonon jelentkezünk</b> a(z) ${lead.phone || "megadott"} számon.</p>
           <p>Addig is, itt a linkje az ingyenes e-könyvünknek: <a href="${EBOOK_DRIVE_URL}">Ingyenes e-könyv letöltése</a></p>
           <p>Üdvözlettel,</p>
           ${SIGNATURE_HTML}`;

      emails.push({
        from: RESEND_FROM_EMAIL,
        to: [lead.email],
        subject,
        html: bodyHtml,
      });
    }

    // ---------- 2) belső értesítés Máténak ----------
    if (NOTIFY_TO_EMAIL) {
      const rows = Object.entries(lead)
        .filter(([k]) => !["id", "created_at", "email_status", "email_error"].includes(k))
        .map(([k, v]) => `<tr><td style="padding:4px 10px;color:#666;">${k}</td><td style="padding:4px 10px;"><b>${v ?? "-"}</b></td></tr>`)
        .join("");

      emails.push({
        from: RESEND_FROM_EMAIL,
        to: [NOTIFY_TO_EMAIL],
        subject: `Új érdeklődő (${lead.type === "book" ? "e-könyv" : "konzultáció"}) — ${lead.name || lead.email || lead.phone || ""}`,
        html: `<p>Új lead érkezett a weboldalon:</p><table>${rows}</table>${SIGNATURE_HTML}`,
      });
    }

    // ---------- kiküldés a Resend API-n keresztül ----------
    const results = await Promise.all(
      emails.map((email) =>
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(email),
        })
      )
    );

    const failed = [];
    for (const r of results) {
      if (!r.ok) failed.push(await r.text());
    }

    if (failed.length) {
      throw new Error("Resend hiba: " + failed.join(" | "));
    }

    return new Response(JSON.stringify({ ok: true, sent: emails.length }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("send-lead-email hiba:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
