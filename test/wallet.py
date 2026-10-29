from playwright.sync_api import sync_playwright
U='http://localhost:8899/'
with sync_playwright() as p:
    b=p.chromium.launch()
    a=b.new_context().new_page(); a.goto(U); a.wait_for_timeout(1200)
    a.click('#chip-aurora'); a.evaluate('__jd.addBolts(30)'); a.click('#shopBtnStart'); a.wait_for_timeout(300); a.click('#buy-dino'); a.wait_for_timeout(1200)
    c=b.new_context().new_page(); c.goto(U); c.wait_for_timeout(1200); c.click('#chip-aurora'); c.wait_for_timeout(300)
    print('other device bolts pill for Aurora:', c.inner_text('#boltsPill'))
    b.close()
