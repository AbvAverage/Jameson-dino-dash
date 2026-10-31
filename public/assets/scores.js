// Family leaderboard on the landing page: reads the same score server the game saves to,
// so a best set on any phone, tablet or computer shows up here within seconds.
(function () {
  var board = document.getElementById('lbBoard');
  if (!board) return;
  var podium = document.getElementById('lbPodium');
  var list = document.getElementById('lbList');
  var empty = document.getElementById('lbEmpty');
  var status = document.getElementById('lbStatus');
  var heroTop = document.getElementById('heroTop');
  var last = {};          // id -> best, to flash rows that just changed
  var lastLeader = null;
  var loadedOnce = false;
  var COLORS = ['#FF7A2F', '#2E9E46', '#1C7FD6', '#9B5DE5', '#E0457B', '#00A6A6', '#D98E04', '#5A6CF0'];

  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    var now = new Date();
    var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    var day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var days = Math.round((day0 - dd) / 86400000);
    if (days <= 0) return 'today at ' + time;
    if (days === 1) return 'yesterday at ' + time;
    if (days < 7) return d.toLocaleDateString([], { weekday: 'long' }) + ' at ' + time;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function avatar(p) {
    var a = el('span', 'lb-av', (p.name || '?').trim().charAt(0).toUpperCase());
    a.style.background = COLORS[hash(p.id) % COLORS.length];
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  function changed(p) { return loadedOnce && last[p.id] !== undefined && last[p.id] !== p.best; }

  function render(players) {
    var rows = Object.keys(players).map(function (id) {
      var p = players[id] || {};
      return { id: id, name: p.name || id, best: Math.floor(p.best || 0), bestAt: p.bestAt, games: p.games || 0 };
    }).filter(function (r) { return r.best > 0; });
    rows.sort(function (a, b) { return b.best - a.best || String(a.bestAt || '').localeCompare(String(b.bestAt || '')); });

    empty.hidden = rows.length > 0;
    podium.replaceChildren(); list.replaceChildren();

    rows.slice(0, 3).forEach(function (r, i) {
      var pod = el('li', 'lb-pod lb-p' + (i + 1) + (changed(r) ? ' lb-new' : ''));
      var medal = el('span', 'lb-medal', String(i + 1)); medal.setAttribute('aria-label', ['First', 'Second', 'Third'][i] + ' place');
      if (i === 0) { var crown = el('span', 'lb-crown'); crown.setAttribute('aria-hidden', 'true'); pod.appendChild(crown); }
      pod.appendChild(medal);
      pod.appendChild(avatar(r));
      pod.appendChild(el('span', 'lb-name', r.name));
      pod.appendChild(el('span', 'lb-score', commas(r.best)));
      pod.appendChild(el('span', 'lb-when', r.bestAt ? 'Best set ' + when(r.bestAt) : ''));
      podium.appendChild(pod);
    });
    rows.slice(3, 12).forEach(function (r, i) {
      var li = el('li', 'lb-row' + (changed(r) ? ' lb-new' : ''));
      li.appendChild(el('span', 'lb-rank', String(i + 4)));
      li.appendChild(avatar(r));
      var who = el('span', 'lb-who');
      who.appendChild(el('span', 'lb-name', r.name));
      who.appendChild(el('span', 'lb-when', (r.bestAt ? when(r.bestAt) : '') + (r.games ? ' · ' + r.games + (r.games === 1 ? ' run' : ' runs') : '')));
      li.appendChild(who);
      li.appendChild(el('span', 'lb-score', commas(r.best)));
      list.appendChild(li);
    });
    list.hidden = rows.length <= 3;

    var leader = rows[0] ? rows[0].id + ':' + rows[0].best : null;
    if (loadedOnce && leader && leader !== lastLeader && rows[0]) {
      status.textContent = 'New high score! ' + rows[0].name + ' just took first place.';
      status.className = 'lb-status lb-status-hot';
    } else if (!status.classList.contains('lb-status-hot')) {
      status.textContent = 'Live. Updates on its own.';
    }
    lastLeader = leader;
    last = {}; rows.forEach(function (r) { last[r.id] = r.best; });
    if (heroTop) {
      if (rows[0]) { heroTop.hidden = false; heroTop.querySelector('b').textContent = rows[0].name + ' · ' + commas(rows[0].best); }
      else heroTop.hidden = true;
    }
    loadedOnce = true;
    board.setAttribute('aria-busy', 'false');
  }

  function load() {
    return fetch('/api/board', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('score server ' + r.status);
      return r.json();
    }).then(function (j) {
      render((j && j.players) || {});
      board.classList.remove('lb-offline');
    }).catch(function () {
      board.classList.add('lb-offline');
      status.textContent = loadedOnce ? 'Can’t reach the scoreboard right now. Showing the last scores.' : 'Can’t reach the scoreboard right now.';
      status.className = 'lb-status';
    });
  }

  load();
  setInterval(function () { if (!document.hidden) load(); }, 15000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
  window.addEventListener('focus', load);
  // the "new high score" note fades back to normal after a while
  setInterval(function () { if (status.classList.contains('lb-status-hot')) { status.className = 'lb-status'; status.textContent = 'Live. Updates on its own.'; } }, 60000);
})();
