// Optional on-device input tracing, loaded only with ?devInput=1.
(function () {
  'use strict';
  if (!window.__jd || document.getElementById('inputDiagnostics')) return;
  var build = 'fire-input-1', game = document.getElementById('game');
  var stage = document.getElementById('stage'), rows = [], counts = {};
  var maxGap = 0, gaps100 = 0, maxInputLag = 0, viewportChanges = 0;
  var contextLosses = 0, stageMoves = 0, canvasChanges = 0, previousBox = null;
  var previousFrame = null, lastDisplay = 0, pending = new WeakMap();
  var panel = document.createElement('div');
  panel.id = 'inputDiagnostics';
  panel.style.cssText = 'position:fixed;left:4px;top:4px;z-index:20000;max-width:calc(100vw - 8px);' +
    'box-sizing:border-box;padding:6px;background:rgba(0,0,0,.88);color:white;font:12px/1.3 monospace;' +
    'border-radius:6px;pointer-events:none;text-align:left;';
  var display = document.createElement('pre');
  display.style.cssText = 'margin:0;white-space:pre-wrap;font:inherit;';
  var copy = document.createElement('button');
  copy.type = 'button'; copy.textContent = 'Copy touch report';
  copy.style.cssText = 'pointer-events:auto;min-height:36px;margin-top:4px;font:14px system-ui;';
  panel.appendChild(display); panel.appendChild(copy); document.body.appendChild(panel);
  function state() {
    var p = window.__jd.P(), s = window.__jd.st();
    return { state: s.state, mode: s.mode, jumps: p.jumps, y: Math.round(p.y * 10) / 10,
      vy: Math.round(p.vy * 10) / 10, onGround: p.onGround };
  }
  function record(row) { rows.push(row); if (rows.length > 120) rows.shift(); }
  function targetName(el) {
    if (!el) return '?';
    if (el.id) return '#' + el.id;
    var button = el.closest && el.closest('button');
    return button && button.id ? '#' + button.id : el.tagName;
  }
  function eventTime(e) {
    var stamp = e.timeStamp;
    if (stamp > 1e12) stamp -= performance.timeOrigin;
    return Math.max(0, performance.now() - stamp);
  }
  function finishEvent(e) {
    var row = pending.get(e); if (!row) return;
    pending.delete(e);
    row.after = state(); row.prevented = e.defaultPrevented;
    row.jumpDelta = row.after.jumps - row.before.jumps;
    if (row.jumpDelta > 0) row.result = 'jump accepted';
    else if (row.before.state !== 'play') row.result = 'not playing';
    else if (row.before.jumps >= 2) row.result = 'two jumps already used';
    else row.result = 'no jump on this event';
  }
  ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'click'].forEach(function (name) {
    document.addEventListener(name, function (e) {
      if (panel.contains(e.target)) return;
      counts[name] = (counts[name] || 0) + 1;
      var before = state(), lag = Math.round(eventTime(e));
      maxInputLag = Math.max(maxInputLag, lag);
      var row = { event: name, at: Math.round(performance.now()), target: targetName(e.target),
        pointer: e.pointerType || '', contacts: e.changedTouches ? e.changedTouches.length : 0,
        lagMs: lag, before: before };
      pending.set(e,row); record(row);
    }, { capture: true, passive: true });
    // These listeners are registered after the game's handlers on the same
    // targets, so stopPropagation does not hide the resulting jump state.
    [game].concat(Array.prototype.slice.call(document.querySelectorAll('button'))).forEach(function (el) {
      el.addEventListener(name, finishEvent, {passive:true});
    });
    document.addEventListener(name, finishEvent, {passive:true});
  });
  window.addEventListener('resize', function () { viewportChanges++; record({event:'viewport resize',at:Math.round(performance.now()),w:innerWidth,h:innerHeight}); });
  game.addEventListener('contextlost', function () { contextLosses++; record({event:'canvas context lost',at:Math.round(performance.now())}); });
  game.addEventListener('contextrestored', function () { record({event:'canvas context restored',at:Math.round(performance.now())}); });
  window.addEventListener('error', function (e) { record({event:'error',message:String(e.message).slice(0,300),at:Math.round(performance.now())}); });
  function report() {
    return { build: build, gameBase: 'ae9dd35', userAgent: navigator.userAgent,
      memoryGB: navigator.deviceMemory || null, dpr: devicePixelRatio,
      viewport: {width:innerWidth,height:innerHeight}, canvas: {width:game.width,height:game.height},
      counts: counts, maxFrameGapMs: Math.round(maxGap), frameGapsOver100ms: gaps100,
      maxInputLagMs: maxInputLag, viewportChanges: viewportChanges,
      sampledStageMoves: stageMoves, sampledCanvasChanges: canvasChanges, contextLosses: contextLosses,
      current: state(), events: rows.slice() };
  }
  // Exposed for local verification; nothing is uploaded or saved automatically.
  window.__ddInputReport = report;
  copy.addEventListener('click', function () {
    var text = JSON.stringify(report(), null, 2);
    function fallback() {
      var field = document.createElement('textarea'); field.value = text;
      field.setAttribute('aria-label','Touch report to copy');
      field.style.cssText = 'position:fixed;inset:10%;width:80%;height:80%;z-index:21000;pointer-events:auto;';
      document.body.appendChild(field); field.focus(); field.select();
      copy.textContent = 'Select and copy the report';
    }
    if (!navigator.clipboard || !navigator.clipboard.writeText) { fallback(); return; }
    navigator.clipboard.writeText(text).then(function () { copy.textContent = 'Copied'; }, fallback);
  });
  function frame(now) {
    if (!document.hidden && previousFrame !== null) {
      var gap = now - previousFrame; maxGap = Math.max(maxGap, gap); if (gap > 100) gaps100++;
    }
    previousFrame = document.hidden ? null : now;
    if (now - lastDisplay >= 250) {
      lastDisplay = now;
      var r = stage.getBoundingClientRect(), box = [r.x,r.y,r.width,r.height,game.width,game.height];
      if (previousBox) {
        if (box.slice(0,4).some(function(v,i){return Math.abs(v-previousBox[i])>.5;})) stageMoves++;
        if (box[4]!==previousBox[4] || box[5]!==previousBox[5]) canvasChanges++;
      }
      previousBox = box;
      var s = state();
      display.textContent = 'TOUCH TEST ' + build + '\nTouch starts ' + (counts.touchstart || 0) +
        ' | pointer downs ' + (counts.pointerdown || 0) + '\nJumps used ' + s.jumps + '/2 | ' + s.state +
        '\nLongest frame ' + Math.round(maxGap) + 'ms | input wait ' + maxInputLag + 'ms' +
        '\nBox changes ' + stageMoves + ' | viewport changes ' + viewportChanges;
    }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange',function(){previousFrame=null;});
  requestAnimationFrame(frame);
})();
