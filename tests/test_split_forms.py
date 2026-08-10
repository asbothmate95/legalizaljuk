import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8791"
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')

    # ---------- Consultation timer CTAs present + counting down ----------
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.goto(f"{BASE}/index.html", wait_until="networkidle")

    timers = page.locator(".consult-timer-value")
    tcount = timers.count()
    print("consult-timer-value count:", tcount)
    if tcount != 5:
        errors.append(f"Expected 5 consult timer badges (hero, bio, ebook, megoldas, feltetelek), found {tcount}")

    first_val = timers.nth(0).inner_text()
    page.wait_for_timeout(2200)
    second_val = timers.nth(0).inner_text()
    print("timer before/after 2.2s:", first_val, second_val)
    if first_val == second_val:
        errors.append(f"Consult timer does not appear to be counting down: {first_val} == {second_val}")

    # all 5 timer values should be in sync
    vals = [timers.nth(i).inner_text() for i in range(tcount)]
    print("all timer values:", vals)
    if len(set(vals)) > 1:
        errors.append(f"Timer badges out of sync: {vals}")

    # consult CTA buttons -> #form-consult ; book CTA buttons -> #form
    consult_links = page.locator("a:has-text('INGYENES KONZULTÁCIÓT KÉREK'), a:has-text('Ingyenes konzultációt kérek')")
    for i in range(consult_links.count()):
        href = consult_links.nth(i).get_attribute("href")
        if href != "#form-consult":
            errors.append(f"Consult CTA #{i} href is '{href}', expected '#form-consult'")

    book_links = page.locator("a:has-text('INGYENES KÖNYV LETÖLTÉSE'), a:has-text('E-KÖNYV MEGTEKINTÉSE'), a:has-text('E-könyv megtekintése'), a:has-text('Kérem az ingyenes könyvet')")
    for i in range(book_links.count()):
        href = book_links.nth(i).get_attribute("href")
        if href != "#form":
            errors.append(f"Book CTA #{i} href is '{href}', expected '#form'")

    # nav second link -> #form-consult
    nav_hrefs = [a.get_attribute("href") for a in page.locator(".site-nav a").all()]
    print("index.html nav hrefs:", nav_hrefs)
    if "#form-consult" not in nav_hrefs:
        errors.append(f"Nav does not link to #form-consult: {nav_hrefs}")

    page.screenshot(path="/home/claude/work/timer_hero.png")
    page.locator("#feltetelek").scroll_into_view_if_needed()
    page.screenshot(path="/home/claude/work/timer_feltetelek.png")

    if console_errors:
        real_errors = [e for e in console_errors if "ERR_TUNNEL" not in e and "403" not in e and "favicon" not in e]
        if real_errors:
            errors.append(f"Console errors on index.html: {real_errors}")

    page.close()

    # ---------- Book form flow ----------
    bpage = browser.new_page(viewport={"width": 1280, "height": 900})
    b_console_errors = []
    bpage.on("console", lambda msg: b_console_errors.append(msg.text) if msg.type == "error" else None)
    bpage.goto(f"{BASE}/index.html", wait_until="networkidle")
    bpage.locator('a[href="#form"]').first.click()
    bpage.wait_for_timeout(300)
    bpage.fill("#email", "teszt@pelda.sk")
    bpage.fill("#phone", "+421918208118")
    bpage.check("#book_gdpr_consent")
    bpage.click("#book-form button[type=submit]")
    bpage.wait_for_timeout(500)
    if "koszonjuk.html" not in bpage.url or "konzultacio" in bpage.url:
        errors.append(f"Book form submit did not redirect to koszonjuk.html, got: {bpage.url}")
    real_b_errors = [e for e in b_console_errors if "ERR_TUNNEL" not in e and "403" not in e and "favicon" not in e]
    if real_b_errors:
        errors.append(f"Console errors during book form flow: {real_b_errors}")
    bpage.close()

    # ---------- Consult form flow ----------
    cpage = browser.new_page(viewport={"width": 1280, "height": 900})
    c_console_errors = []
    cpage.on("console", lambda msg: c_console_errors.append(msg.text) if msg.type == "error" else None)
    cpage.goto(f"{BASE}/index.html", wait_until="networkidle")
    cpage.locator("#form-consult").scroll_into_view_if_needed()

    # step 0: building type (no email/phone should be required yet)
    if cpage.locator("#form-consult #email").count() > 0:
        errors.append("Consult form step 0 unexpectedly contains an #email field (should start with building type only)")
    cpage.click('#form-consult .option-grid[data-field="building_type"] .option-btn:has-text("Családi ház")')
    cpage.wait_for_timeout(400)
    if not cpage.locator('#form-consult .wizard-step[data-step="1"]').is_visible():
        errors.append("Consult wizard did not advance to step 1 (built period) after building type selection")

    cpage.click('#form-consult .option-grid[data-field="built_period"] .option-btn:has-text("1990. január 1.")')
    cpage.wait_for_timeout(400)
    if not cpage.locator('#form-consult .wizard-step[data-step="2"]').is_visible():
        errors.append("Consult wizard did not advance to step 2 (details) after built period selection")

    # chips should show 2 selections
    chip_count = cpage.locator("#consult-chips .chip").count()
    if chip_count != 2:
        errors.append(f"Expected 2 chips (building type + built period) on consult wizard step 2, found {chip_count}")

    cpage.fill("#c_settlement", "Dunaszerdahely")
    cpage.fill("#c_house_number", "123")
    cpage.click('#form-consult .option-grid[data-field="for_residence"] .option-btn:has-text("Igen")')
    cpage.fill("#c_name", "Teszt Elek")
    cpage.fill("#c_phone", "+421918208118")
    # leave email empty on purpose (should be allowed, it's optional)
    cpage.fill("#c_message", "Teszt üzenet.")
    cpage.check("#consult_gdpr_consent")
    cpage.click("#consult-submit")
    cpage.wait_for_timeout(500)

    if "koszonjuk-konzultacio.html" not in cpage.url:
        errors.append(f"Consult form submit (no email) did not redirect to koszonjuk-konzultacio.html, got: {cpage.url}")

    real_c_errors = [e for e in c_console_errors if "ERR_TUNNEL" not in e and "403" not in e and "favicon" not in e]
    if real_c_errors:
        errors.append(f"Console errors during consult form flow: {real_c_errors}")
    cpage.close()

    # ---------- Nav check on all other pages ----------
    for pg in ["koszonjuk.html", "koszonjuk-konzultacio.html", "adatkezelesi-tajekoztato.html", "aszf.html"]:
        p2 = browser.new_page()
        p2.goto(f"{BASE}/{pg}", wait_until="networkidle")
        hrefs = [a.get_attribute("href") for a in p2.locator(".site-nav a").all()]
        print(f"{pg} nav hrefs:", hrefs)
        if "index.html#form-consult" not in hrefs:
            errors.append(f"{pg}: expected 'index.html#form-consult' in nav, got {hrefs}")
        p2.close()

    browser.close()

print("\n--- RESULT ---")
if errors:
    print(f"{len(errors)} PROBLEM(S) FOUND:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
else:
    print("ALL CHECKS PASSED")
