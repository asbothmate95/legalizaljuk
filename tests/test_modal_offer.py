import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8791"
errors = []

def console_filter(msgs):
    return [m for m in msgs if "ERR_TUNNEL" not in m and "403" not in m and "favicon" not in m]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')

    # ================= 1) Hero flag badge =================
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    consoleErrs = []
    page.on("console", lambda m: consoleErrs.append(m.text) if m.type == "error" else None)
    page.goto(f"{BASE}/index.html", wait_until="networkidle")

    badge = page.locator(".hero-flag-badge")
    if badge.count() == 0 or not badge.is_visible():
        errors.append("Hero flag badge missing or not visible")
    else:
        txt = badge.inner_text()
        if "\U0001F1ED\U0001F1FA" not in txt or "\U0001F1F8\U0001F1F0" not in txt:
            errors.append(f"Hero flag badge text missing HU/SK flags: {txt!r}")

    # ================= 2) Only ONE inline form on the page (#form-consult); #form is a hidden modal =================
    form_section = page.locator("#form")
    form_consult_section = page.locator("#form-consult")
    if form_consult_section.count() != 1:
        errors.append(f"#form-consult should exist exactly once, found {form_consult_section.count()}")
    # #form should exist but be inside a hidden modal overlay
    overlay = page.locator("#book-modal-overlay")
    if overlay.count() != 1:
        errors.append("book modal overlay (#book-modal-overlay) missing")
    else:
        if overlay.is_visible():
            errors.append("Modal overlay should be hidden by default on page load")
    if form_section.count() != 1:
        errors.append(f"#form (modal card) should exist exactly once, found {form_section.count()}")

    # scrolling through the page should NOT show two stacked forms — verify #form is not part of normal flow
    box = form_section.bounding_box()
    print("modal #form bounding box while hidden:", box)

    # ================= 3) Modal open via hero secondary CTA click =================
    book_trigger = page.locator('a[href="#form"]').first
    book_trigger.click()
    page.wait_for_timeout(300)
    if not overlay.is_visible():
        errors.append("Modal did not open after clicking a book CTA")
    if not page.locator("#email").is_visible():
        errors.append("Modal open but #email field not visible")

    # ESC closes it
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    if overlay.is_visible():
        errors.append("Modal did not close on Escape key")

    # backdrop click closes it
    book_trigger.click()
    page.wait_for_timeout(300)
    overlay.click(position={"x": 5, "y": 5})
    page.wait_for_timeout(300)
    if overlay.is_visible():
        errors.append("Modal did not close on backdrop click")

    # close (X) button closes it
    book_trigger.click()
    page.wait_for_timeout(300)
    page.locator("#book-modal-close").click()
    page.wait_for_timeout(300)
    if overlay.is_visible():
        errors.append("Modal did not close on close-button click")

    if console_filter(consoleErrs):
        errors.append(f"Console errors (index.html modal tests): {console_filter(consoleErrs)}")
    page.close()

    # ================= 4) Book form submit still works from modal =================
    bpage = browser.new_page(viewport={"width": 1280, "height": 900})
    bpage.goto(f"{BASE}/index.html", wait_until="networkidle")
    bpage.locator('a[href="#form"]').first.click()
    bpage.wait_for_timeout(300)
    bpage.fill("#email", "teszt@pelda.sk")
    bpage.fill("#phone", "+421918208118")
    bpage.check("#book_gdpr_consent")
    bpage.click("#book-form button[type=submit]")
    bpage.wait_for_timeout(500)
    if "koszonjuk.html" not in bpage.url or "konzultacio" in bpage.url:
        errors.append(f"Book form submit did not redirect to koszonjuk.html: {bpage.url}")
    bpage.close()

    # ================= 5) Cross-page: sticky bar book button on aszf.html opens modal on index.html =================
    cpage = browser.new_page(viewport={"width": 390, "height": 844})
    cpage.goto(f"{BASE}/aszf.html", wait_until="networkidle")
    cpage.locator('.mobile-sticky-cta a:has-text("Ingyenes könyv")').click()
    cpage.wait_for_load_state("networkidle")
    cpage.wait_for_timeout(400)
    if "index.html" not in cpage.url:
        errors.append(f"Cross-page book link did not land on index.html: {cpage.url}")
    if not cpage.locator("#book-modal-overlay").is_visible():
        errors.append("Cross-page navigation to index.html#form did not auto-open the modal")
    # hash should be cleaned up
    cur_url = cpage.url
    if cur_url.endswith("#form"):
        errors.append(f"URL hash was not cleaned up after auto-opening modal: {cur_url}")
    cpage.close()

    # ================= 6) Offer state: fresh visitor => free & ticking =================
    fpage = browser.new_page(viewport={"width": 1440, "height": 900})
    fpage.goto(f"{BASE}/index.html", wait_until="networkidle")
    fresh_locked = fpage.evaluate("!!document.querySelector('[data-consult-cta=\"full\"].is-locked')")
    if fresh_locked:
        errors.append("Fresh visitor (no localStorage) unexpectedly shows locked/paid state")
    timer_txt_1 = fpage.locator(".consult-timer-value").first.inner_text()
    fpage.wait_for_timeout(1500)
    timer_txt_2 = fpage.locator(".consult-timer-value").first.inner_text()
    print("fresh visitor timer ticking:", timer_txt_1, "->", timer_txt_2)
    if timer_txt_1 == timer_txt_2:
        errors.append("Countdown did not tick down for fresh visitor")
    fpage.close()

    # ================= 7) Offer state: expired within 24h => locked/paid state persists across reload =================
    lpage = browser.new_page(viewport={"width": 1440, "height": 900})
    lpage.goto(f"{BASE}/index.html", wait_until="networkidle")
    # simulate the 10-minute window having expired 5 minutes ago (still within 24h lock)
    lpage.evaluate("""() => {
        const fiveMinAgo = Date.now() - 5*60*1000;
        localStorage.setItem('legalizaljuk_consult_offer_expires_at', String(fiveMinAgo));
    }""")
    lpage.reload(wait_until="networkidle")
    lpage.wait_for_timeout(300)

    is_locked = lpage.evaluate("!!document.querySelector('[data-consult-cta=\"full\"].is-locked')")
    if not is_locked:
        errors.append("Expired-but-within-24h state did not render locked/paid CTA after reload")

    urgent_badge_txt = lpage.locator('[data-consult-cta="full"] .urgent-badge').first.inner_text() if is_locked else ""
    print("locked urgent badge text:", urgent_badge_txt)
    if is_locked and "50" in urgent_badge_txt:
        errors.append(f"Locked urgent badge should not show a price: {urgent_badge_txt!r}")
    if is_locked and not urgent_badge_txt.strip():
        errors.append("Locked urgent badge is empty")

    nav_compact_txt = lpage.locator('[data-consult-cta="compact"]').first.inner_text()
    print("locked compact CTA text:", nav_compact_txt)
    if "50" in nav_compact_txt:
        errors.append(f"Locked compact CTA (nav) should not mention a price: {nav_compact_txt!r}")
    nav_compact_is_locked_styled = lpage.evaluate("!!document.querySelector('[data-consult-cta=\"compact\"].is-locked')")
    if not nav_compact_is_locked_styled:
        errors.append("Locked compact CTA (nav) missing .is-locked class for red urgency styling")

    wsub = lpage.locator("#consult-wizard-sub").inner_text()
    print("locked wizard-sub:", wsub)
    if "50" in wsub:
        errors.append(f"Locked wizard-sub should not mention a price: {wsub!r}")

    submit_txt = None
    # need to click through the wizard to see the submit button's locked text
    lpage.click('#form-consult .option-grid[data-field="building_type"] .option-btn:has-text("Garázs")')
    lpage.wait_for_timeout(300)
    lpage.click('#form-consult .option-grid[data-field="built_period"] .option-btn:has-text("1990. január 1.")')
    lpage.wait_for_timeout(300)
    submit_txt = lpage.locator("#consult-submit").inner_text()
    print("locked submit button text:", submit_txt)
    if "ingyenes" in submit_txt.lower():
        errors.append(f"Locked submit button still says 'ingyenes': {submit_txt!r}")

    lpage.close()

    # ================= 8) Offer state: expired more than 24h ago => fresh 10:00 window restarts =================
    rpage = browser.new_page(viewport={"width": 1440, "height": 900})
    rpage.goto(f"{BASE}/index.html", wait_until="networkidle")
    rpage.evaluate("""() => {
        const overDayAgo = Date.now() - (25*60*60*1000);
        localStorage.setItem('legalizaljuk_consult_offer_expires_at', String(overDayAgo));
    }""")
    rpage.reload(wait_until="networkidle")
    rpage.wait_for_timeout(300)
    is_locked_after_reset = rpage.evaluate("!!document.querySelector('[data-consult-cta=\"full\"].is-locked')")
    fresh_timer = rpage.locator(".consult-timer-value").first.inner_text()
    print("after >24h reset — locked:", is_locked_after_reset, "timer:", fresh_timer)
    if is_locked_after_reset:
        errors.append("After >24h since expiry, state should reset to a fresh free window, but still locked")
    # should be close to 10:00
    mins = int(fresh_timer.split(":")[0])
    if mins < 9:
        errors.append(f"Fresh reset window timer not close to 10:00: {fresh_timer}")
    rpage.close()

    browser.close()

print("\n--- RESULT ---")
if errors:
    print(f"{len(errors)} PROBLEM(S) FOUND:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
else:
    print("ALL CHECKS PASSED")
