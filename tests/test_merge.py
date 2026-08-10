import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8791"
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')

    # ---------- Desktop pass ----------
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: console_errors.append(str(exc)))

    page.goto(f"{BASE}/index.html", wait_until="networkidle")

    # confirm hero is visible at top (no auto-scroll bug)
    hero_box = page.locator(".hero-dark h1").bounding_box()
    if hero_box is None or hero_box["y"] > 400:
        errors.append(f"Hero H1 not visible near top on load: {hero_box}")

    # legalizacio.html should be gone / not linked
    nav_links = page.locator(".site-nav a").all()
    for a in nav_links:
        href = a.get_attribute("href")
        if href and "legalizacio" in href:
            errors.append(f"Nav still links to legalizacio.html: {href}")
    print("Nav hrefs:", [a.get_attribute("href") for a in page.locator(".site-nav a").all()])

    # check cta-row counts and hrefs across the page
    cta_rows = page.locator(".cta-row")
    n = cta_rows.count()
    print("cta-row count:", n)
    for i in range(n):
        row = cta_rows.nth(i)
        btns = row.locator("a.btn")
        bn = btns.count()
        if bn != 2:
            errors.append(f"cta-row[{i}] does not have exactly 2 buttons (has {bn})")
        for j in range(bn):
            href = btns.nth(j).get_attribute("href")
            text = btns.nth(j).inner_text()
            if href != "#form":
                errors.append(f"cta-row[{i}] button '{text}' href is '{href}', expected '#form'")

    # section presence + order check via evaluate
    ids_in_order = page.eval_on_selector_all("section[id]", "els => els.map(e => e.id)")
    print("Section order:", ids_in_order)
    expected_order = ["miert-most", "feltetelek", "folyamat", "forrasok", "gyik"]
    positions = [ids_in_order.index(x) if x in ids_in_order else -1 for x in expected_order]
    print("Positions of migrated sections:", dict(zip(expected_order, positions)))
    if -1 in positions:
        errors.append(f"Missing expected migrated section id(s): {dict(zip(expected_order, positions))}")
    elif positions != sorted(positions):
        errors.append(f"Migrated sections out of requested order: {dict(zip(expected_order, positions))}")

    # FAQ count (should be 6 after merge/dedupe)
    faq_count = page.locator("#gyik .faq-item").count()
    print("FAQ item count:", faq_count)
    if faq_count != 6:
        errors.append(f"Expected 6 merged FAQ items, found {faq_count}")

    # screenshot full page desktop
    page.screenshot(path="/home/claude/work/screenshot_desktop_full.png", full_page=True)

    # scroll to feltetelek and folyamat sections for visual check
    page.locator("#feltetelek").scroll_into_view_if_needed()
    page.screenshot(path="/home/claude/work/screenshot_feltetelek.png")

    page.locator("#folyamat").scroll_into_view_if_needed()
    page.screenshot(path="/home/claude/work/screenshot_folyamat.png")

    page.locator("#forrasok").scroll_into_view_if_needed()
    page.screenshot(path="/home/claude/work/screenshot_forrasok.png")

    if console_errors:
        errors.append(f"Console/page errors on index.html: {console_errors}")

    page.close()

    # ---------- Mobile pass ----------
    mpage = browser.new_page(viewport={"width": 390, "height": 844})
    m_console_errors = []
    mpage.on("console", lambda msg: m_console_errors.append(msg.text) if msg.type == "error" else None)
    mpage.goto(f"{BASE}/index.html", wait_until="networkidle")
    mpage.screenshot(path="/home/claude/work/screenshot_mobile_hero.png")

    # check cta-row stacks full width on mobile
    first_row = mpage.locator(".cta-row").first
    btns = first_row.locator("a.btn")
    b0 = btns.nth(0).bounding_box()
    b1 = btns.nth(1).bounding_box()
    if b0 and b1:
        if abs(b0["y"] - b1["y"]) < 5:
            errors.append(f"Mobile cta-row buttons appear side-by-side instead of stacked: {b0} vs {b1}")
    mpage.locator("#feltetelek").scroll_into_view_if_needed()
    mpage.screenshot(path="/home/claude/work/screenshot_mobile_feltetelek.png")
    if m_console_errors:
        errors.append(f"Console errors on mobile index.html: {m_console_errors}")
    mpage.close()

    # ---------- Full wizard flow test ----------
    wpage = browser.new_page(viewport={"width": 1280, "height": 900})
    w_console_errors = []
    wpage.on("console", lambda msg: w_console_errors.append(msg.text) if msg.type == "error" else None)
    wpage.goto(f"{BASE}/index.html", wait_until="networkidle")

    # click a secondary CTA to jump to form
    wpage.locator(".hero-ctas .cta-row a.btn").nth(1).click()
    wpage.wait_for_timeout(600)
    email_visible = wpage.locator("#email").is_visible()
    if not email_visible:
        errors.append("After clicking hero secondary CTA, #email field not visible (did not land on form step 0)")

    wpage.fill("#email", "teszt@pelda.sk")
    wpage.fill("#phone", "+421918208118")
    wpage.check("#gdpr_consent")
    wpage.click("#step0-continue")
    wpage.wait_for_timeout(400)
    if not wpage.locator('.wizard-step[data-step="1"]').is_visible():
        errors.append("Wizard did not advance to step 1 (building type) after step 0 continue")

    wpage.click('.option-grid[data-field="building_type"] .option-btn:has-text("Családi ház")')
    wpage.wait_for_timeout(400)
    if not wpage.locator('.wizard-step[data-step="2"]').is_visible():
        errors.append("Wizard did not advance to step 2 (built period) after building type selection")

    wpage.click('.option-grid[data-field="built_period"] .option-btn:has-text("1990. január 1.")')
    wpage.wait_for_timeout(400)
    if not wpage.locator('.wizard-step[data-step="3"]').is_visible():
        errors.append("Wizard did not advance to step 3 (settlement/details) after built period selection")

    wpage.fill("#settlement", "Dunaszerdahely")
    wpage.fill("#house_number", "123")
    wpage.click('.option-grid[data-field="for_residence"] .option-btn:has-text("Igen")')
    wpage.fill("#name", "Teszt Elek")
    wpage.fill("#message", "Teszt üzenet a probléma leírásához.")
    wpage.click("#wizard-submit")
    wpage.wait_for_timeout(600)

    if "koszonjuk.html" not in wpage.url:
        errors.append(f"Form submit did not redirect to koszonjuk.html, current url: {wpage.url}")

    if w_console_errors:
        errors.append(f"Console errors during wizard flow: {w_console_errors}")

    wpage.close()

    # ---------- Nav link check on other pages ----------
    for pg in ["koszonjuk.html", "adatkezelesi-tajekoztato.html", "impresszum.html"]:
        p2 = browser.new_page()
        p2.goto(f"{BASE}/{pg}", wait_until="networkidle")
        hrefs = [a.get_attribute("href") for a in p2.locator(".site-nav a").all()]
        print(f"{pg} nav hrefs:", hrefs)
        if not any(h == "index.html#form" for h in hrefs):
            errors.append(f"{pg}: expected nav link 'index.html#form' not found in {hrefs}")
        if any(h and "legalizacio" in h for h in hrefs):
            errors.append(f"{pg}: still references legalizacio.html: {hrefs}")
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
