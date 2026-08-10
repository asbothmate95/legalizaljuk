// =========================================================
// Legalizáljuk — send-lead-email Supabase Edge Function
// =========================================================
// Ezt a függvényt a leads tábla adatbázis-triggere hívja meg minden
// egyes új űrlap-beküldésnél (lásd: supabase_schema.sql).
//
// Két e-mailt küld ki a Resend API-n keresztül (https://resend.com):
//   1) A LÁTOGATÓNAK — ha megadott e-mail címet:
//        - "book" típusnál: köszönő e-mail + az ingyenes e-könyv PDF
//          csatolva
//        - "consult" típusnál: visszaigazoló e-mail (a könyvet is
//          csatolva, ha e-mailt is megadott)
//   2) NEKED (a cég e-mail címére) — értesítés az új érdeklődőről,
//      minden megadott adattal, hogy azonnal fel tudd venni vele a
//      kapcsolatot telefonon.
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
// Az e-könyv PDF-jét egy publikus Supabase Storage bucket-be kell
// feltölteni (lásd a repó gyökerében lévő SETUP-UTMUTATO.md-t), és az
// EBOOK_PDF_URL secret-ben a publikus URL-jét kell megadni:
//
//   supabase secrets set EBOOK_PDF_URL=https://<PROJECT_REF>.supabase.co/storage/v1/object/public/assets/legalizaljuk-ekonyv.pdf
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
    const EBOOK_PDF_URL = Deno.env.get("EBOOK_PDF_URL");

    if (!RESEND_API_KEY) {
      throw new Error("Hiányzik a RESEND_API_KEY secret — lásd a fájl elején lévő beállítási útmutatót.");
    }

    // ---------- e-könyv PDF letöltése + base64-esítése (csatolmányhoz) ----------
    let ebookAttachment: { filename: string; content: string } | null = null;
    if (EBOOK_PDF_URL) {
      const pdfResp = await fetch(EBOOK_PDF_URL);
      if (pdfResp.ok) {
        const pdfBuf = new Uint8Array(await pdfResp.arrayBuffer());
        let binary = "";
        for (let i = 0; i < pdfBuf.length; i++) binary += String.fromCharCode(pdfBuf[i]);
        ebookAttachment = {
          filename: "legalizaljuk-ekonyv.pdf",
          content: btoa(binary),
        };
      }
    }

    const emails: any[] = [];

    // ---------- 1) e-mail a látogatónak (ha megadott e-mail címet) ----------
    if (lead.email) {
      const isBook = lead.type === "book";
      const subject = isBook
        ? "Az Ön ingyenes e-könyve — Legalizáljuk"
        : "Megkaptuk a jelentkezését — Legalizáljuk";

      const bodyHtml = isBook
        ? `<p>Kedves Érdeklődő!</p>
           <p>Köszönjük, hogy igényelte az ingyenes e-könyvünket az épületek legalizálásáról (Zákon č. 25/2025 Z. z.). A könyvet csatoltan küldjük.</p>
           <p>Ha bármilyen kérdése van, hívjon bátran: <a href="tel:+421918208118">0918 208 118</a>, vagy válaszoljon erre az e-mailre.</p>
           <p>Üdvözlettel,<br>Ing. arch. Asbóth Máté<br>Legalizáljuk</p>`
        : `<p>Kedves ${lead.name || "Érdeklődő"}!</p>
           <p>Köszönjük jelentkezését! Megkaptuk az Ön által megadott adatokat (${lead.building_type || "-"}, ${lead.built_period || "-"}), és <b>24 órán belül telefonon jelentkezünk</b> a(z) ${lead.phone || "megadott"} számon.</p>
           ${ebookAttachment ? "<p>Addig is csatoltan küldjük az ingyenes e-könyvünket.</p>" : ""}
           <p>Üdvözlettel,<br>Ing. arch. Asbóth Máté<br>Legalizáljuk</p>`;

      emails.push({
        from: RESEND_FROM_EMAIL,
        to: [lead.email],
        subject,
        html: bodyHtml,
        attachments: ebookAttachment ? [ebookAttachment] : undefined,
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
        html: `<p>Új lead érkezett a weboldalon:</p><table>${rows}</table>`,
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
