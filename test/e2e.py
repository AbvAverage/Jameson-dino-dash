# End-to-end: real game page + real score-server code, several separate "devices".
from playwright.sync_api import sync_playwright
import json, urllib.request
U='http://localhost:8899/'
def board(): return json.load(urllib.request.urlopen(U+'api/board'))
def run_until_over(pg):
    pg.click('#startBtn')
    for i in range(300):
        pg.wait_for_timeout(100)
        if not pg.evaluate("document.getElementById('overPanel').hidden"): return
ok=True
def check(name, cond, extra=''):
    global ok; ok = ok and cond; print(('PASS ' if cond else 'FAIL ') + name, extra)
with sync_playwright() as p:
    b=p.chromium.launch()
    tablet=b.new_context(); phone=b.new_context()
    t=tablet.new_page(); t.on('pageerror', lambda e: print('TAB ERR', e)); t.goto(U); t.wait_for_timeout(1200)
    # 1. Addy plays on the tablet
    t.fill('#nameInput', 'Addy'); run_until_over(t); t.wait_for_timeout(1500)
    a = board()['players']['addy']
    check('Addy\'s run saved from the tablet', a['games'] == 1 and a['best'] > 0, a)
    ph=phone.new_page(); ph.goto(U); ph.wait_for_timeout(1500)
    ph.fill('#nameInput', 'Addy'); ph.wait_for_timeout(300)
    check('phone shows Addy\'s best', ph.inner_text('#best') == str(a['best']), ph.inner_text('#best'))
    check('no scoreboard on screen', ph.evaluate("document.querySelectorAll('.board, #boardStart, #boardOver').length") == 0)
    # 2. Aurora plays while the tablet is offline, then it reconnects
    t.click('#switchBtn'); t.fill('#nameInput', 'Aurora'); tablet.set_offline(True)
    run_until_over(t); t.wait_for_timeout(1500)
    check('offline run held on the tablet', t.evaluate('__jd.queue().length') > 0)
    check('nothing reached the server while offline', board()['players']['aurora']['games'] == 0)
    tablet.set_offline(False); t.evaluate("window.dispatchEvent(new Event('online'))"); t.wait_for_timeout(2500)
    au = board()['players']['aurora']
    check('Aurora\'s offline run saved after reconnecting', au['games'] == 1 and au['best'] > 0, au)
    check('tablet queue emptied', t.evaluate('__jd.queue().length') == 0)
    # 3. bolts and a purchase as Addy on the phone, seen on the tablet
    ph.fill('#nameInput', 'Addy'); ph.evaluate('__jd.addBolts(100)'); ph.wait_for_timeout(1200)
    ph.click('#shopBtnStart'); ph.wait_for_timeout(300); ph.click('#buy-dino'); ph.wait_for_timeout(1500)
    a = board()['players']['addy']
    check('purchase checked by the server (100 - 40 = 60)', a.get('bolts') == 60 and a.get('owned') == ['dino'], a)
    t.reload(); t.wait_for_timeout(1500); t.fill('#nameInput', 'Addy'); t.wait_for_timeout(300)
    check('tablet shows Addy\'s 60 bolts', t.inner_text('#boltsPill') == '60', t.inner_text('#boltsPill'))
    # 4. two devices earn bolts for the same player at the same moment
    t.evaluate('__jd.addBolts(50)'); ph.evaluate('__jd.addBolts(50)'); t.wait_for_timeout(2000)
    check('both earnings counted (60 + 50 + 50 = 160)', board()['players']['addy'].get('bolts') == 160, board()['players']['addy'].get('bolts'))
    # 5. can't buy what you can't afford, even if the device thinks you can
    t.evaluate("(function(){ return 1; })()")
    req = urllib.request.Request(U+'api/board', data=json.dumps({'op': {'id':'jameson','type':'buy','item':'rex','opId':'cheat-1'}}).encode(), headers={'content-type':'application/json'}, method='POST')
    try: urllib.request.urlopen(req); refused=False
    except urllib.error.HTTPError as e: refused = e.code == 409
    check('server refuses a Rex nobody paid for', refused and 'rex' not in (board()['players']['jameson'].get('owned') or []))
    # 6. typed names
    n=b.new_context().new_page(); n.on('pageerror', lambda e: print('NEW ERR', e)); n.goto(U); n.wait_for_timeout(1200)
    check('fresh device starts with an empty name box', n.input_value('#nameInput') == '' and n.is_disabled('#startBtn'))
    check('no name buttons left', n.evaluate("document.querySelectorAll('.chip').length") == 0)
    n.click('#nameInput'); n.keyboard.type('Big Dawg'); n.wait_for_timeout(200)
    check('space typed into the name, game did not start', n.input_value('#nameInput') == 'Big Dawg' and n.evaluate('__jd.st().state') == 'ready', n.input_value('#nameInput'))
    check('Play button shows the typed name', n.inner_text('#startBtn') == 'Play as Big Dawg', n.inner_text('#startBtn'))
    n.keyboard.press('Enter'); n.wait_for_timeout(400)
    check('Enter starts the game', n.evaluate('__jd.st().state') == 'play')
    n.wait_for_function("!document.getElementById('overPanel').hidden", timeout=30000); n.wait_for_timeout(1500)
    bd = board()['players'].get('big-dawg') or {}
    check('new player saved on the server under their typed name', bd.get('name') == 'Big Dawg' and bd.get('games') == 1, bd)
    n.reload(); n.wait_for_timeout(1200)
    check('name remembered after reload', n.input_value('#nameInput') == 'Big Dawg')
    n.click('#nameInput'); n.fill('#nameInput', 'chris'); n.wait_for_timeout(300)
    check('typing chris picks up Chris\'s saved best', n.inner_text('#best') == '6742' and n.inner_text('#startBtn') == 'Play as Chris', (n.inner_text('#best'), n.inner_text('#startBtn')))
    b.close()
print('ALL PASSED' if ok else 'SOME FAILED')
