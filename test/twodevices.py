from playwright.sync_api import sync_playwright
U='http://localhost:8899/'
with sync_playwright() as p:
    b=p.chromium.launch()
    tablet=b.new_context(viewport={'width':800,'height':600}); phone=b.new_context(viewport={'width':844,'height':390})
    t=tablet.new_page(); t.on('pageerror', lambda e: print('TAB ERR', e))
    t.goto(U); t.wait_for_timeout(1500)
    print('tablet sees Chris:', '6742' in t.inner_text('#boardStart'))
    t.click('#chip-addy'); t.click('#startBtn')
    for i in range(200):
        t.wait_for_timeout(100)
        if not t.evaluate("document.getElementById('overPanel').hidden"): break
    t.wait_for_timeout(1200)
    addy = t.evaluate("JSON.stringify(__jd.st())")
    print('tablet run over; board on tablet:', t.inner_text('#boardOver').replace('\n',' | ')[:200])
    ph=phone.new_page(); ph.on('pageerror', lambda e: print('PHONE ERR', e))
    ph.goto(U); ph.wait_for_timeout(1500)
    txt = ph.inner_text('#boardStart').replace('\n',' | ')
    print('phone board:', txt[:220])
    ph.screenshot(path='phone_board.png')
    b.close()
