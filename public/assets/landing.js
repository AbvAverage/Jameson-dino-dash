/* Jameson's Dino Dash landing page.
 * Every character, world and pickup here is drawn by the game's own art code
 * (REXART, JAM, JUNGLE, ZONES, SKYART, OBSART, PICKUPS from dd-art.js), so they
 * match the game exactly. This file only directs the scenes.
 */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mqReduce.matches;
  var GROUND = 384, H = 500;                // the game's own logical size
  var GRAV = 2250, JUMP1 = -790, JUMP2 = -660;
  var HEAD = new Image();
  HEAD.decoding = 'async';
  HEAD.src = DD_ASSET('jameson-head.png');
  PICKUPS.setHead(HEAD);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeOut(k) { k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3); }
  function sceneOf(k) { return k === 'jungle' ? JUNGLE : ZONES[k]; }
  var seed = 7;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  // ---------- sound (off until the visitor turns it on) ----------
  var soundOn = false;
  function sfx(name) { if (soundOn && !reduced) SFX.play(name); }
  var soundBtn = document.getElementById('soundBtn');
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', soundOn ? 'Sound effects on. Turn off' : 'Sound effects off. Turn on');
    if (soundOn) { SFX.setMuted(false); SFX.unlock(); SFX.play('click'); }
  });

  // ---------- render scheduler ----------
  // One requestAnimationFrame for every canvas; a view only draws while it is on screen.
  var views = [];
  var dprCap = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.75 : 2);
  var slowFrames = 0;

  function View(canvas, draw, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.draw = draw;
    this.logicalH = opts.logicalH || H;
    this.logicalHFor = opts.logicalHFor || null;
    this.visible = false;
    this.t = opts.t0 || 0;
    this.w = 0; this.h = 0; this.W = 0; this.scale = 1;
    this.stillT = opts.stillT;
    views.push(this);
    var self = this;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { self.visible = e.isIntersecting; });
      if (reduced && self.visible) self.renderStill();
    }, { rootMargin: '80px' });
    io.observe(canvas);
    this.resize();
  }
  View.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.dpr = dpr;
    if (this.logicalHFor) this.logicalH = this.logicalHFor(this.w, this.h);
    this.scale = this.h / this.logicalH;
    this.W = this.w / this.scale;
    if (reduced) this.renderStill();
  };
  View.prototype.frame = function (dt) {
    var c = this.ctx;
    c.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, 0, 0);
    this.t += dt;
    this.draw(c, this.W, this.logicalH, dt, this.t, this);
  };
  View.prototype.renderStill = function () {
    // reduced motion: one good-looking still frame, re-drawn once the art has loaded
    var self = this;
    var go = function () {
      self.t = 0;
      var steps = Math.round((self.stillT || 2.2) / (1 / 30));
      for (var i = 0; i < steps; i++) { self.t += 1 / 30; self.draw(self.ctx, self.W, self.logicalH, 1 / 30, self.t, self, true); }
      self.ctx.setTransform(self.scale * self.dpr, 0, 0, self.scale * self.dpr, 0, 0);
      self.draw(self.ctx, self.W, self.logicalH, 0, self.t, self);
    };
    go();
    if (!HEAD.complete) HEAD.addEventListener('load', go, { once: true });
    setTimeout(go, 600);
  };

  var last = 0;
  function tick(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    // quality governor: if frames are slow for a while, draw fewer pixels
    if (dt > 0.026) slowFrames++; else slowFrames = Math.max(0, slowFrames - 0.5);
    if (slowFrames > 45 && dprCap > 0.6) {
      // step down the drawing resolution; below 1x the browser upscales the canvas smoothly
      dprCap = Math.max(0.6, Math.min(dprCap, window.devicePixelRatio || 1) - 0.2); slowFrames = 0;
      views.forEach(function (v) { v.resize(); });
    }
    for (var i = 0; i < views.length; i++) if (views[i].visible) views[i].frame(dt);
    requestAnimationFrame(tick);
  }

  var resizeT = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { views.forEach(function (v) { v.resize(); }); }, 120);
  });

  // ---------- a runner: Jameson, on foot or riding Rex, with the game's physics ----------
  function Runner(o) {
    o = o || {};
    this.ride = !!o.ride; this.outfit = o.outfit || 'truck';
    this.y = 0; this.vy = 0; this.air = false; this.jumps = 0;
    this.phase = o.phase || 0; this.squash = 0; this.spin = 0; this.spinT = 0;
    this.roarT = 0; this.shootT = 0; this.power = false;
    this.onLand = null; this.onStep = null;
  }
  Runner.prototype.jump = function () {
    if (this.jumps >= 2) return false;
    if (this.jumps === 1) this.spinT = 0.001;
    this.vy = this.jumps === 0 ? JUMP1 : JUMP2;
    this.jumps++; this.air = true;
    return true;
  };
  Runner.prototype.update = function (dt, vel) {
    if (this.air) {
      this.vy += GRAV * dt; this.y += this.vy * dt;
      if (this.y >= 0) {
        this.y = 0; this.vy = 0; this.air = false; this.jumps = 0; this.spinT = 0; this.spin = 0;
        this.squash = 0.2;
        if (this.onLand) this.onLand();
      }
    } else {
      var before = this.phase;
      this.phase += dt * (7 + vel / 90);
      // a foot hits the ground every half stride
      if (this.onStep && Math.floor((before - Math.PI / 2) / Math.PI) !== Math.floor((this.phase - Math.PI / 2) / Math.PI)) this.onStep();
    }
    if (this.spinT > 0) { this.spinT += dt; this.spin = -Math.PI * 2 * Math.min(1, this.spinT / 0.45); if (this.spinT >= 0.45) { this.spinT = 0; this.spin = 0; } }
    this.squash = Math.max(0, this.squash - dt * 1.1);
    this.roarT = Math.max(0, this.roarT - dt);
    this.shootT = Math.max(0, this.shootT - dt);
  };
  Runner.prototype.draw = function (ctx, x, ground, t, s) {
    ctx.save();
    ctx.translate(x, ground);
    ctx.scale(s, s);
    JAM.draw(ctx, HEAD, 0, 0, {
      phase: this.phase, air: this.air, vy: this.vy, lift: -this.y, squash: this.squash, spin: this.spin,
      shoot: this.shootT > 0, power: this.power, t: t, outfit: this.outfit, ride: this.ride, roar: this.roarT > 0
    });
    ctx.restore();
  };

  // ---------- particles ----------
  function Particles() { this.list = []; }
  Particles.prototype.dust = function (x, y, n, spread, vx) {
    for (var i = 0; i < n; i++) this.list.push({ k: 'dust', x: x + (Math.random() - 0.5) * spread, y: y - Math.random() * 4, vx: (vx || -60) - Math.random() * 80, vy: -20 - Math.random() * 50, r: 4 + Math.random() * 6, life: 0.5 + Math.random() * 0.35, max: 0.85 });
  };
  Particles.prototype.spark = function (x, y, n, c, speed) {
    for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, v = (speed || 160) * (0.4 + Math.random()); this.list.push({ k: 'spark', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: 2 + Math.random() * 2.5, life: 0.5, max: 0.5, c: c }); }
  };
  Particles.prototype.debris = function (x, y, color) {
    for (var i = 0; i < 9; i++) this.list.push({ k: 'deb', x: x + Math.random() * 30, y: y + Math.random() * 30, vx: -120 + Math.random() * 300, vy: -260 - Math.random() * 220, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, s: 6 + Math.random() * 7, life: 1, max: 1, c: color });
  };
  Particles.prototype.popup = function (x, y, text, col, big) { this.list.push({ k: 'pop', x: x, y: y, text: text, col: col, big: big, life: 1, max: 1 }); };
  Particles.prototype.update = function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      if (p.k === 'pop') { p.y -= 60 * dt; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'deb') { p.vy += 900 * dt; p.r += p.vr * dt; }
      else if (p.k === 'spark') { p.vy += 300 * dt; }
      else { p.vy *= 0.94; p.r += dt * 6; }
    }
  };
  Particles.prototype.draw = function (ctx, layer) {
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i], a = Math.max(0, p.life / p.max);
      if (layer === 'back' && p.k !== 'dust') continue;
      if (layer === 'front' && p.k === 'dust') continue;
      if (p.k === 'dust') { ctx.fillStyle = 'rgba(245,235,215,' + (0.7 * a) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill(); }
      else if (p.k === 'spark') { ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
      else if (p.k === 'deb') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.min(1, p.life / 0.4);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
        ctx.strokeStyle = 'rgba(11,42,91,0.7)'; ctx.lineWidth = 1.5; ctx.strokeRect(-p.s / 2, -p.s / 2, p.s, p.s);
        ctx.restore();
      } else if (p.k === 'pop') {
        ctx.globalAlpha = Math.min(1, p.life / 0.4);
        ctx.font = (p.big ? 34 : 26) + 'px "Luckiest Guy", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6; ctx.strokeStyle = '#0B2A5B'; ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.col || '#FFD23F'; ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      }
    }
  };

  // drifting leaves (hero + finale atmosphere)
  function Leaves(n, colors) {
    this.list = [];
    for (var i = 0; i < n; i++) this.list.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.9, r: Math.random() * 6, vr: (Math.random() - 0.5) * 2, sp: 0.4 + Math.random() * 0.8, p: Math.random() * 6, c: colors[i % colors.length] });
  }
  Leaves.prototype.draw = function (ctx, W, Hh, t, dt) {
    for (var i = 0; i < this.list.length; i++) {
      var l = this.list[i];
      l.y += dt * 0.05 * l.sp; l.x -= dt * 0.07 * l.sp; l.r += l.vr * dt;
      if (l.y > 1.05) { l.y = -0.05; l.x = Math.random() * 1.2; }
      if (l.x < -0.05) l.x = 1.05;
      var x = l.x * W + Math.sin(t * 1.3 + l.p) * 24, y = l.y * Hh;
      ctx.save(); ctx.translate(x, y); ctx.rotate(l.r + Math.sin(t * 2 + l.p) * 0.5); ctx.scale(l.s, l.s * (0.6 + 0.4 * Math.abs(Math.sin(t * 2.2 + l.p))));
      ctx.fillStyle = l.c;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(0, -7, 10, 0); ctx.quadraticCurveTo(0, 7, -9, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(0,40,10,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(9, 0); ctx.stroke();
      ctx.restore();
    }
  };

  function blockStack(letters, cols, rows) {
    var b = [];
    for (var c = 0; c < cols; c++) for (var r = 0; r < rows; r++) {
      b.push({ dx: c * 38, dy: r * 38, color: PICKUPS.blockColors[(c * 2 + r * 3 + letters.length) % PICKUPS.blockColors.length], letter: letters[(c * rows + r) % letters.length] });
    }
    return b;
  }
  function drawBlocks(ctx, o, t) {
    ctx.fillStyle = 'rgba(30,40,20,0.22)';
    ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, GROUND + 2, o.w / 2 + 6, 5, 0, 0, 6.3); ctx.fill();
    PICKUPS.use(ctx, t);
    for (var i = 0; i < o.blocks.length; i++) PICKUPS.block(o.x + o.blocks[i].dx, GROUND - 37 - o.blocks[i].dy, o.blocks[i]);
  }

  // =====================================================================
  // HERO: Jameson riding Rex through the jungle
  // =====================================================================
  function initHero() {
    var canvas = document.getElementById('heroCanvas');
    var hero = canvas.parentNode;
    var rex = new Runner({ ride: true, outfit: 'truck' });
    var fx = new Particles();
    var leaves = new Leaves(14, ['#5DBB4E', '#3E9B45', '#8DD06A', '#C9D96A', '#2F7F3A']);
    var dist = 2600, vel = 300, shake = 0, roarRing = null;
    var items = [];               // blocks + bubbles scrolling toward Rex
    var nextEvent = 3.2, eventN = 0;
    var mx = 0, my = 0, tmx = 0, tmy = 0;
    var started = performance.now();

    rex.onStep = function () { fx.dust(rexX + 26 * cs, GROUND - 2, 3, 26 * cs, -vel * 0.35); };
    rex.onLand = function () { fx.dust(rexX + 10 * cs, GROUND, 12, 90 * cs); shake = Math.max(shake, 0.12); sfx('land'); };
    var rexX = 0, cs = 1;

    if (!reduced && window.matchMedia('(pointer: fine)').matches) {
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        tmx = (e.clientX - r.left) / r.width - 0.5; tmy = (e.clientY - r.top) / r.height - 0.5;
      });
      hero.addEventListener('pointerleave', function () { tmx = 0; tmy = 0; });
    }

    function spawn(W) {
      eventN++;
      var lead = W + 60;
      var kind = eventN % 4;
      if (kind === 1 || kind === 3) {
        // toy blocks to jump, with a bubble above for Jameson to grab at the top of the jump
        var letters = kind === 1 ? ['J', 'A'] : ['M', 'E'];
        items.push({ type: 'blocks', x: lead, w: 76, h: 38, blocks: blockStack(letters, 2, 1), jumpAt: true });
        items.push({ type: kind === 1 ? 'dino' : 'truck', x: lead + 10, y: GROUND - 300 * cs, bob: Math.random() * 6 });
      } else if (kind === 2) {
        // a roar, then a block Rex stomps straight through
        items.push({ type: 'roar', x: 0, at: 0 });
        items.push({ type: 'blocks', x: lead + 380, w: 38, h: 76, blocks: blockStack(['S', 'O'], 1, 2), stomp: true });
      } else {
        items.push({ type: 'truck', x: lead, y: GROUND - 150 * cs, bob: 0 });
        items.push({ type: 'dino', x: lead + 140, y: GROUND - 210 * cs, bob: 2 });
      }
    }

    new View(canvas, function (ctx, W, Hh, dt, t, view, sim) {
      // framing: big characters, ground low; Rex sits right of the title on wide screens
      var portrait = view.w / view.h < 0.9;
      cs = portrait ? clamp(W / 350, 0.6, 0.86) : clamp(W / 700, 0.95, 1.32);
      var intro = reduced ? 1 : easeOut((performance.now() - started) / 2200);
      var homeX = portrait ? W * 0.5 - 8 * cs : W * 0.66;
      rexX = lerp(-260 * cs, homeX + Math.sin(t * 0.35) * 14 * cs, intro);

      vel = 300;
      dist += vel * dt;
      rex.update(dt, vel);
      mx += (tmx - mx) * Math.min(1, dt * 3); my += (tmy - my) * Math.min(1, dt * 3);

      // scripted moments
      if (!sim) nextEvent -= dt;
      if (nextEvent <= 0) { spawn(W); nextEvent = 4.6; }
      var reach = rexX + 70 * cs;
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        if (it.type === 'roar') {
          it.at += dt;
          if (it.at > 0.05 && !it.done) { it.done = true; rex.roarT = 1.1; shake = 0.35; roarRing = { t: 0 }; sfx('rumble'); }
          if (it.at > 1.2) items.splice(i, 1);
          continue;
        }
        it.x -= vel * dt;
        if (it.type === 'blocks') {
          if (it.jumpAt && !it.jumped && it.x - (rexX + 50 * cs) < vel * 0.12) { it.jumped = true; if (rex.jump()) { fx.dust(rexX, GROUND, 8, 60 * cs); sfx('jump'); } }
          if (it.stomp && it.x < reach) {
            items.splice(i, 1);
            rex.roarT = Math.max(rex.roarT, 0.5); shake = 0.3;
            for (var b = 0; b < it.blocks.length; b++) fx.debris(it.x + it.blocks[b].dx, GROUND - 37 - it.blocks[b].dy, it.blocks[b].color[0]);
            fx.popup(it.x + 120 * cs, GROUND - 250 * cs, 'STOMP! +' + 2 * it.blocks.length, '#8FE2FF', true);
            sfx('boom');
            continue;
          }
        } else {
          var jy = GROUND + rex.y * cs - 230 * cs;
          if (!it.got && Math.abs(it.x - (rexX + 10 * cs)) < 70 * cs && Math.abs(it.y - jy) < 110 * cs) {
            it.got = true;
            fx.spark(it.x, it.y, 14, it.type === 'dino' ? '#9BE27F' : '#FFD23F', 220);
            fx.popup(it.x, it.y - 30, it.type === 'dino' ? '+5' : '+3');
            sfx(it.type);
          }
          if (it.got) { items.splice(i, 1); continue; }
        }
        if (it.x < -200) items.splice(i, 1);
      }
      fx.update(dt);
      shake = Math.max(0, shake - dt);
      if (sim) return;

      // ----- draw -----
      var zoom = reduced ? 1 : lerp(1.12, 1, intro);
      var sx = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
      ctx.save();
      ctx.translate(W / 2, Hh * 0.62); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -Hh * 0.62);
      ctx.translate(sx, sy);

      // far layers drift against the pointer, near layers with it
      ctx.save(); ctx.translate(-mx * 14 - 20, -my * 8);
      JUNGLE.draw(ctx, W + 40, Hh, GROUND, dist, t);
      ctx.restore();

      // morning haze and a sun glow behind the canopy
      var sunX = W * (portrait ? 0.82 : 0.86) - mx * 10, sunY = 46;
      var sg = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, W * 0.6);
      sg.addColorStop(0, 'rgba(255,244,200,0.55)'); sg.addColorStop(0.25, 'rgba(255,230,160,0.18)'); sg.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = sg; ctx.fillRect(-40, -40, W + 80, GROUND + 40);
      for (var f = 0; f < 3; f++) {
        var fxp = ((t * (10 + f * 6) + f * 400) % (W + 600)) - 300;
        var fg = ctx.createRadialGradient(fxp, GROUND - 70 - f * 26, 10, fxp, GROUND - 70 - f * 26, 260);
        fg.addColorStop(0, 'rgba(236,250,244,' + (0.16 - f * 0.03) + ')'); fg.addColorStop(1, 'rgba(236,250,244,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(fxp, GROUND - 70 - f * 26, 300, 60, 0, 0, 6.3); ctx.fill();
      }

      ctx.save(); ctx.translate(mx * 6, my * 3);
      // pickups and blocks
      PICKUPS.use(ctx, t);
      for (var k = 0; k < items.length; k++) {
        var o = items[k];
        if (o.type === 'blocks') drawBlocks(ctx, o, t);
        else if (o.type === 'dino' || o.type === 'truck') {
          ctx.save(); ctx.translate(o.x, o.y + Math.sin(t * 4 + o.bob) * 6); ctx.scale(cs * 0.95, cs * 0.95);
          if (o.type === 'dino') PICKUPS.dino(0, 0); else PICKUPS.truck(0, 0);
          ctx.restore();
        }
      }
      fx.draw(ctx, 'back');
      // roar shockwave
      if (roarRing) {
        roarRing.t += dt;
        var rr = roarRing.t * 520, ra = Math.max(0, 1 - roarRing.t / 0.8);
        ctx.strokeStyle = 'rgba(255,255,255,' + 0.5 * ra + ')'; ctx.lineWidth = 6 * ra + 1;
        var hx = rexX + 150 * cs, hy = GROUND - 250 * cs + rex.y;
        ctx.beginPath(); ctx.arc(hx, hy, rr, -0.9, 0.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(hx, hy, rr * 0.7, -0.7, 0.7); ctx.stroke();
        if (roarRing.t > 0.8) roarRing = null;
      }
      rex.draw(ctx, rexX, GROUND, t, cs);
      fx.draw(ctx, 'front');
      ctx.restore();

      ctx.save(); ctx.translate(mx * 26 - 10, my * 10);
      JUNGLE.drawFront(ctx, W + 20, Hh, GROUND, dist, t);
      ctx.restore();
      if (!reduced) leaves.draw(ctx, W, Hh, t, dt);
      ctx.restore();
    }, { stillT: 3.0, logicalHFor: function (w, h) { return w / h < 0.9 ? 500 : 466; } });
  }

  // =====================================================================
  // ADVENTURE: one stage, six mechanics, driven by scroll position
  // =====================================================================
  function initDemo() {
    var canvas = document.getElementById('demoCanvas');
    var tag = document.getElementById('demoTag');
    var steps = [].slice.call(document.querySelectorAll('.step'));
    var TAGS = { jump: 'Jump!', mud: 'Double jump!', ptero: 'Stay low!', grab: 'Dino +5 · Truck +3', blast: 'Dino power!', portal: 'Bonus portal!' };
    var mode = 'jump', cycle = 0, objs = [], warp = 0, bonusT = 0;
    var J = new Runner({ ride: false, outfit: 'truck' });
    var fx = new Particles();
    var dist = 0, vel = 330, PX = 150, power = 0;
    J.onLand = function () { fx.dust(PX, GROUND, 7, 34); };

    function setMode(m) {
      if (m === mode) return;
      mode = m; cycle = 0; objs = []; power = 0; J.power = false; warp = 0; bonusT = 0;
      tag.textContent = TAGS[m];
      tag.classList.remove('bump'); void tag.offsetWidth; tag.classList.add('bump');
      setTimeout(function () { tag.classList.remove('bump'); }, 350);
      steps.forEach(function (s) { s.classList.toggle('is-on', s.getAttribute('data-demo') === m); });
      if (reduced && demoView) demoView.renderStill();
    }
    // the step nearest the middle of the screen drives the demo
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) setMode(e.target.getAttribute('data-demo')); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (s) {
      io.observe(s);
      s.addEventListener('click', function () { setMode(s.getAttribute('data-demo')); });
    });

    function spawn(W) {
      var x = W + 40;
      if (mode === 'jump') objs.push({ type: 'blocks', x: x, w: 76, h: 38, blocks: blockStack(['J', 'A', 'M', 'E'], 2, 1) }, { type: 'blocks', x: x + 330, w: 38, h: 38, blocks: blockStack(['S'], 1, 1) });
      if (mode === 'mud') objs.push({ type: 'mud', x: x, w: 230 });
      if (mode === 'ptero') objs.push({ type: 'ptero', x: x + 40, y: GROUND - 218, seed: 1.3 });
      if (mode === 'grab') objs.push({ type: 'dino', x: x, y: GROUND - 95 }, { type: 'truck', x: x + 190, y: GROUND - 210 });
      if (mode === 'blast') {
        objs.push({ type: 'power', x: x, y: GROUND - 90 });
        objs.push({ type: 'blocks', x: x + 300, w: 38, h: 76, blocks: blockStack(['O', 'N'], 1, 2) }, { type: 'blocks', x: x + 470, w: 38, h: 38, blocks: blockStack(['J'], 1, 1) });
      }
      if (mode === 'portal') objs.push({ type: 'portal', x: x + 60 });
    }

    var demoView = new View(canvas, function (ctx, W, Hh, dt, t, view, sim) {
      if (mode === 'portal' && warp > 0 && warp < 1) { /* frozen world during the flash */ } else dist += vel * dt;
      cycle -= dt;
      if (cycle <= 0) { spawn(W); cycle = mode === 'portal' ? 6.2 : mode === 'blast' ? 4.4 : 3.4; }
      J.update(dt, vel);
      if (power > 0) { power -= dt; J.power = power > 0; }

      for (var i = objs.length - 1; i >= 0; i--) {
        var o = objs[i];
        if (!o) continue;
        o.x -= (vel + (o.type === 'ptero' ? 60 : 0)) * dt;
        var gap = o.x - (PX + 16);
        if (o.type === 'blocks' && !o.j && mode === 'jump' && gap < vel * 0.25) { o.j = 1; J.jump(); fx.dust(PX, GROUND, 6, 30); }
        if (o.type === 'mud' && !o.j && gap < vel * 0.12) { o.j = 1; J.jump(); setTimeout(function () { J.jump(); }, 240); }
        if (o.type === 'truck' && !o.j && gap < vel * 0.3) { o.j = 1; J.jump(); }
        if ((o.type === 'dino' || o.type === 'truck' || o.type === 'power') && !o.got) {
          var py = GROUND + J.y - 85;
          if (Math.abs(o.x - PX) < 46 && Math.abs(o.y - py) < 70) {
            o.got = true; objs.splice(i, 1);
            if (o.type === 'power') { power = 3.6; J.power = true; fx.popup(PX + 60, GROUND - 230, 'DINO POWER!', '#8FE2FF', true); }
            else { fx.spark(o.x, o.y, 12, o.type === 'dino' ? '#9BE27F' : '#FFD23F'); fx.popup(o.x, o.y - 40, o.type === 'dino' ? '+5' : '+3'); }
            continue;
          }
        }
        if (o.type === 'blocks' && mode === 'blast' && power > 0 && !o.shot && gap < 300) {
          o.shot = true; J.shootT = 0.18;
          objs.push({ type: 'shot', x: PX + 46, y: GROUND - 68, target: o });
        }
        if (o.type === 'shot') {
          o.x += (760 + vel) * dt;
          if (o.x + 12 > o.target.x) {
            var tg = o.target, k = objs.indexOf(tg);
            if (k >= 0) {
              for (var b = 0; b < tg.blocks.length; b++) fx.debris(tg.x + tg.blocks[b].dx, GROUND - 37 - tg.blocks[b].dy, tg.blocks[b].color[0]);
              fx.popup(tg.x + 20, GROUND - 150, 'BOOM! +' + 2 * tg.blocks.length, '#8FE2FF', true);
              objs.splice(k, 1);
            }
            objs.splice(objs.indexOf(o), 1);
            continue;
          }
        }
        if (o.type === 'portal' && !o.in && o.x < PX + 20) { o.in = true; warp = 0.001; }
        if (o.x < -260) objs.splice(objs.indexOf(o), 1);
      }
      if (warp > 0) { warp += dt; if (warp > 1 && bonusT === 0) bonusT = 0.001; }
      if (bonusT > 0) { bonusT += dt; if (bonusT > 3.2) { bonusT = 0; warp = 0; objs = []; cycle = 0.6; } }
      fx.update(dt);
      if (sim) return;

      // ---- draw ----
      if (bonusT > 0) {
        SKYART.sky(ctx, W, Hh, GROUND, t);
        SKYART.floor(ctx, W, Hh, GROUND, t);
        SKYART.platform(ctx, { x: W * 0.62, y: GROUND - 150, w: 170, seed: 2 }, t);
        for (var q = 0; q < 6; q++) {
          var bx = ((W * 0.35 + q * 120 - bonusT * 160) % (W + 120) + W + 120) % (W + 120);
          SKYART.bolt(ctx, bx, GROUND - 90 - (q % 3) * 60 + Math.sin(t * 3 + q) * 5, q === 2, t + q);
        }
      } else {
        JUNGLE.draw(ctx, W, Hh, GROUND, dist, t);
      }
      PICKUPS.use(ctx, t);
      for (var m = 0; m < objs.length; m++) if (objs[m].type === 'mud') OBSART.mud(ctx, objs[m].x, objs[m].w, GROUND, t, 'jungle');
      for (var n = 0; n < objs.length; n++) {
        var d = objs[n];
        if (bonusT > 0) break;
        if (d.type === 'blocks') drawBlocks(ctx, d, t);
        else if (d.type === 'dino') PICKUPS.dino(d.x, d.y + Math.sin(t * 4) * 6);
        else if (d.type === 'truck') PICKUPS.truck(d.x, d.y + Math.sin(t * 4 + 1) * 6);
        else if (d.type === 'power') PICKUPS.power(d.x, d.y + Math.sin(t * 4 + 2) * 6);
        else if (d.type === 'ptero') {
          OBSART.pteroShadow(ctx, d.x, GROUND); OBSART.ptero(ctx, d.x, d.y, t + d.seed, 'jungle');
          if (d.x > W - 30) OBSART.warning(ctx, W - 34, d.y, t);
        } else if (d.type === 'portal') SKYART.portal(ctx, d.x, GROUND + 6, t, 1);
      }
      fx.draw(ctx, 'back');
      J.draw(ctx, PX, GROUND, t, 1);
      for (var s = 0; s < objs.length; s++) if (objs[s].type === 'shot') PICKUPS.shot(objs[s]);
      fx.draw(ctx, 'front');
      if (bonusT === 0) JUNGLE.drawFront(ctx, W, Hh, GROUND, dist, t);
      if (warp > 0 && warp < 1.4) {
        var a = warp < 1 ? warp : 1 - (warp - 1) / 0.4;
        var wg = ctx.createRadialGradient(PX, GROUND - 60, 10, PX, GROUND - 60, W * 1.2 * Math.min(1, warp));
        wg.addColorStop(0, 'rgba(255,255,255,' + a + ')'); wg.addColorStop(0.5, 'rgba(200,170,255,' + a * 0.8 + ')'); wg.addColorStop(1, 'rgba(120,90,220,0)');
        ctx.fillStyle = wg; ctx.fillRect(0, 0, W, Hh);
      }
    }, { stillT: 1.15 });
  }

  // =====================================================================
  // WORLDS: four live windows into the real scenes
  // =====================================================================
  function initWorlds() {
    var cards = [].slice.call(document.querySelectorAll('.world'));
    var cfg = {
      jungle: { ride: true, outfit: 'truck', obstacle: 'blocks' },
      volcano: { ride: true, outfit: 'fire', obstacle: 'boulder' },
      beach: { ride: false, outfit: 'dino', obstacle: 'boulder' },
      bonus: { ride: false, outfit: 'space', obstacle: null }
    };
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    cards.forEach(function (card, idx) {
      io.observe(card);
      var key = card.getAttribute('data-world'), c = cfg[key];
      var r = new Runner({ ride: c.ride, outfit: c.outfit, phase: idx });
      var fx = new Particles();
      var dist = 3000 + idx * 1700, vel = key === 'beach' ? 380 : 320, obs = [], next = 1.2 + idx * 0.5, speedUp = 1;
      var plats = [{ x: 0.3, y: GROUND - 140, w: 150, seed: 1 }, { x: 0.78, y: GROUND - 210, w: 120, seed: 3 }];
      card.addEventListener('pointerenter', function () { speedUp = 1.6; });
      card.addEventListener('pointerleave', function () { speedUp = 1; });
      r.onLand = function () { fx.dust(PX, GROUND, 7, 40); };
      var PX = 0;
      new View(card.querySelector('canvas'), function (ctx, W, Hh, dt, t, view, sim) {
        var v = vel * speedUp;
        var s = c.ride ? 0.95 : 1.15;
        PX = c.ride ? W * 0.42 : W * 0.36;
        dist += v * dt; r.update(dt, v);
        next -= dt;
        if (c.obstacle && next <= 0) {
          next = 3.2;
          if (c.obstacle === 'boulder') obs.push({ type: 'boulder', x: W + 60, r: 30, rot: 0, extra: 170 });
          else obs.push({ type: 'blocks', x: W + 40, w: 76, h: 38, blocks: blockStack(['J', 'A'], 2, 1) });
        }
        for (var i = obs.length - 1; i >= 0; i--) {
          var o = obs[i], ov = v + (o.extra || 0);
          o.x -= ov * dt;
          if (o.type === 'boulder') o.rot -= ov * dt / o.r;
          if (!o.j && o.x - (PX + 40 * s) < ov * 0.32) { o.j = 1; r.jump(); fx.dust(PX, GROUND, 6, 30); }
          if (o.x < -120) obs.splice(i, 1);
        }
        fx.update(dt);
        if (sim) return;
        if (key === 'bonus') {
          SKYART.sky(ctx, W, Hh, GROUND, t);
          SKYART.floor(ctx, W, Hh, GROUND, t);
          for (var p = 0; p < plats.length; p++) {
            var pp = plats[p], px = (((pp.x * (W + 300) - dist * 0.25) % (W + 300)) + W + 300) % (W + 300) - 150;
            SKYART.platform(ctx, { x: px, y: pp.y, w: pp.w, seed: pp.seed }, t);
            SKYART.bolt(ctx, px, pp.y - 46 + Math.sin(t * 3 + p) * 5, p === 1, t);
          }
          for (var q = 0; q < 4; q++) {
            var bx = (((q * 210 + 90 - dist * 0.6) % (W + 200)) + W + 200) % (W + 200) - 100;
            SKYART.bolt(ctx, bx, GROUND - 70 - (q % 2) * 50 + Math.sin(t * 3 + q) * 5, false, t + q);
          }
          SKYART.fallingStar(ctx, ((t * 120) % (W + 200)) - 100, ((t * 80) % 260) + 20, t);
        } else sceneOf(key).draw(ctx, W, Hh, GROUND, dist, t);
        for (var k = 0; k < obs.length; k++) {
          var ob = obs[k];
          ctx.fillStyle = 'rgba(30,40,20,0.22)'; ctx.beginPath(); ctx.ellipse(ob.x + 30, GROUND + 2, 36, 5, 0, 0, 6.3); ctx.fill();
          if (ob.type === 'boulder') OBSART.boulder(ctx, ob.x + ob.r, GROUND - ob.r + 2, ob.r, ob.rot, key, t);
          else drawBlocks(ctx, ob, t);
        }
        fx.draw(ctx, 'back');
        r.draw(ctx, PX, GROUND, t, s);
        if (key !== 'bonus') sceneOf(key).drawFront(ctx, W, Hh, GROUND, dist, t);
      }, { logicalH: 440, stillT: 1.4 + idx * 0.3 });
    });
  }

  // =====================================================================
  // SHOP: the real items and prices, drawn with the game's own art
  // =====================================================================
  function initShop() {
    var grid = document.getElementById('shopGrid');
    var BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="#FFD23F" stroke="#7A3E00" stroke-width="1.6" stroke-linejoin="round"></path></svg>';
    var KIND = { outfit: 'Outfit', upgrade: 'Upgrade', ride: 'Ride' };
    var order = SHOP.items.filter(function (i) { return i.kind === 'ride'; }).concat(SHOP.items.filter(function (i) { return i.kind !== 'ride'; }));
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    order.forEach(function (it, idx) {
      var card = document.createElement('article');
      card.className = 'item' + (it.kind === 'ride' ? ' feature' : '');
      card.style.transitionDelay = (idx * 0.06) + 's';
      setTimeout(function () { card.style.transitionDelay = ''; }, 2600 + idx * 60);
      var cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true');
      var body = document.createElement('div'); body.className = 'item-body';
      var kind = document.createElement('span'); kind.className = 'item-kind'; kind.textContent = it.price === 0 ? 'Starter outfit' : KIND[it.kind];
      var h = document.createElement('h3'); h.textContent = it.name;
      var p = document.createElement('p'); p.textContent = it.desc + '.';
      var price = document.createElement('span');
      if (it.price === 0) { price.className = 'price free'; price.textContent = 'Free'; }
      else { price.className = 'price'; price.innerHTML = BOLT + '<span></span>'; price.lastChild.textContent = it.price + ' bolts'; }
      body.appendChild(kind); body.appendChild(h); body.appendChild(p); body.appendChild(price);
      card.appendChild(cv); card.appendChild(body);
      grid.appendChild(card);
      io.observe(card);

      var hover = false;
      card.addEventListener('pointerenter', function () { hover = true; if (!reduced) burst(card); sfx('bolt'); });
      card.addEventListener('pointerleave', function () { hover = false; });

      if (it.kind === 'upgrade') {
        // the game's own shop preview, drawn once, with a gentle glow pulse
        var bg = document.createElement('canvas');
        PICKUPS.preview(bg, it);
        new View(cv, function (ctx, W, Hh, dt, t) {
          ctx.drawImage(bg, 0, 0, bg.width, bg.height, 0, 0, W, Hh);
          var a = 0.12 + 0.1 * Math.sin(t * (hover ? 6 : 2.4));
          var g = ctx.createRadialGradient(W / 2, Hh * 0.46, 4, W / 2, Hh * 0.46, Hh * 0.6);
          g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
        }, { logicalH: 112 });
        return;
      }
      var r = new Runner({ ride: it.kind === 'ride', outfit: it.kind === 'ride' ? 'truck' : it.id, phase: idx * 0.7 });
      var feature = it.kind === 'ride';
      new View(cv, function (ctx, W, Hh, dt, t) {
        var bgc = ctx.createLinearGradient(0, 0, 0, Hh);
        if (feature) { bgc.addColorStop(0, '#FFE2B0'); bgc.addColorStop(1, '#FFF4DC'); }
        else { bgc.addColorStop(0, '#BDE6FF'); bgc.addColorStop(1, '#E9F7FF'); }
        ctx.fillStyle = bgc; ctx.fillRect(0, 0, W, Hh);
        // sunburst
        ctx.save(); ctx.translate(W / 2, Hh * 0.62); ctx.rotate(t * 0.15);
        ctx.fillStyle = feature ? 'rgba(255,200,90,0.28)' : 'rgba(255,255,255,0.4)';
        for (var k = 0; k < 12; k++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18, -W); ctx.lineTo(18, -W); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        ctx.fillStyle = feature ? '#9ED67F' : 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.ellipse(W / 2, Hh - 8, W * 0.46, 16, 0, 0, 6.3); ctx.fill();
        var running = hover || feature;
        if (running) r.update(dt, feature ? 300 : 360); else { r.phase = 0.7; }
        if (hover && !r.air && Math.random() < dt * 0.9) r.jump();
        if (!hover && r.air) r.update(dt, 0);
        var s = feature ? 0.7 : 0.72;
        ctx.save(); ctx.translate(feature ? W / 2 + 30 : W / 2, Hh - 12); ctx.scale(s, s);
        JAM.draw(ctx, HEAD, 0, 0, { phase: r.phase, air: r.air, vy: r.vy, lift: -r.y, squash: r.squash, spin: r.spin, t: t, outfit: r.outfit, ride: r.ride, idle: !running && !r.air });
        ctx.restore();
      }, { logicalH: feature ? 196 : 190, stillT: 0.5 });
    });

    function burst(card) {
      for (var i = 0; i < 6; i++) {
        var s = document.createElement('span');
        s.className = 'spark';
        s.innerHTML = BOLT;
        var x = 15 + Math.random() * 70, rot = (Math.random() - 0.5) * 60;
        s.style.left = x + '%'; s.style.top = '40%';
        card.appendChild(s);
        s.animate([
          { transform: 'translate(-50%, 0) scale(.4) rotate(0deg)', opacity: 0 },
          { transform: 'translate(-50%, -40px) scale(1) rotate(' + rot / 2 + 'deg)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, -' + (90 + Math.random() * 60) + 'px) scale(.7) rotate(' + rot + 'deg)', opacity: 0 }
        ], { duration: 800 + Math.random() * 400, delay: i * 50, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).onfinish = function () { this.effect.target.remove(); };
      }
    }
  }

  // =====================================================================
  // WATCH: real footage, plays only while on screen
  // =====================================================================
  function initReel() {
    var v = document.getElementById('reel');
    var btn = document.getElementById('reelPlay');
    var chips = [].slice.call(document.querySelectorAll('#chapters button'));
    var times = chips.map(function (c) { return parseFloat(c.getAttribute('data-t')); });
    var userPaused = false;
    function tryPlay() { var p = v.play(); if (p && p.catch) p.catch(function () { btn.hidden = false; }); }
    if (reduced) { btn.hidden = false; v.controls = false; }
    btn.addEventListener('click', function () { btn.hidden = true; v.controls = true; userPaused = false; tryPlay(); });
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { if (!reduced && !userPaused) { v.preload = 'auto'; tryPlay(); } }
        else if (!v.paused) v.pause();
      });
    }, { threshold: 0.35 }).observe(v);
    v.addEventListener('pause', function () { if (document.visibilityState === 'visible' && v.getBoundingClientRect().top < innerHeight && v.getBoundingClientRect().bottom > 0 && v.controls) userPaused = true; });
    v.addEventListener('timeupdate', function () {
      var cur = 0;
      for (var i = 0; i < times.length; i++) if (v.currentTime + 0.05 >= times[i]) cur = i;
      chips.forEach(function (c, i) { c.classList.toggle('on', i === cur); });
    });
    chips.forEach(function (c, i) {
      c.addEventListener('click', function () {
        v.preload = 'auto';
        v.currentTime = times[i];
        btn.hidden = true; userPaused = false; tryPlay();
      });
    });
  }

  // =====================================================================
  // FINALE: sunset on Sunny Beach, Rex roars, then they ride off
  // =====================================================================
  function initFinale() {
    var section = document.getElementById('finale');
    var rex = new Runner({ ride: true, outfit: 'truck' });
    var fx = new Particles();
    var embers = new Leaves(10, ['#FFC36B', '#FF9A52', '#FFE29A']);
    var dist = 9000, beat = 0, shake = 0, RX = 0, cs = 1, ring = 0;
    rex.onStep = function () { fx.dust(RX + 26 * cs, GROUND - 2, 3, 26 * cs, -110); };
    rex.onLand = function () { fx.dust(RX, GROUND, 14, 100 * cs); shake = 0.25; sfx('land'); };
    new IntersectionObserver(function (es) { es.forEach(function (e) { section.classList.toggle('in', e.isIntersecting); document.body.classList.toggle('at-finale', e.isIntersecting); }); }, { threshold: 0.3 }).observe(section);

    new View(document.getElementById('finaleCanvas'), function (ctx, W, Hh, dt, t, view, sim) {
      var portrait = view.w / view.h < 0.9;
      cs = portrait ? clamp(W / 350, 0.6, 0.86) : clamp(W / 700, 0.95, 1.3);
      RX = portrait ? W * 0.5 - 8 * cs : W * 0.7;
      beat += dt;
      var cyc = beat % 6.5;
      var vel = 300;
      if (cyc > 3.0 && cyc - dt <= 3.0) { rex.roarT = 1.2; shake = 0.4; ring = 0.001; sfx('rumble'); }
      if (cyc > 5.0 && cyc - dt <= 5.0) { rex.jump(); fx.dust(RX, GROUND, 10, 70 * cs); sfx('jump'); }
      dist += vel * dt;
      rex.update(dt, vel);
      fx.update(dt);
      shake = Math.max(0, shake - dt);
      if (sim) return;
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * 12 * shake, (Math.random() - 0.5) * 10 * shake);
      ZONES.beach.draw(ctx, W, Hh, GROUND, dist, t);
      // golden hour grade
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      var g = ctx.createLinearGradient(0, 0, 0, Hh);
      g.addColorStop(0, '#F9A86A'); g.addColorStop(0.5, '#FFD3A0'); g.addColorStop(0.62, '#FFC69A'); g.addColorStop(1, '#F2B184');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
      ctx.globalCompositeOperation = 'soft-light';
      var g2 = ctx.createLinearGradient(0, 0, 0, Hh);
      g2.addColorStop(0, 'rgba(255,90,120,0.55)'); g2.addColorStop(0.55, 'rgba(255,150,60,0.5)'); g2.addColorStop(1, 'rgba(255,120,40,0.3)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, Hh);
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var sx = portrait ? W * 0.5 : W * 0.62, sy = GROUND - 90;
      var sun = ctx.createRadialGradient(sx, sy, 10, sx, sy, W * 0.7);
      sun.addColorStop(0, 'rgba(255,220,150,0.55)'); sun.addColorStop(0.3, 'rgba(255,170,90,0.2)'); sun.addColorStop(1, 'rgba(255,150,80,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, Hh);
      ctx.restore();
      fx.draw(ctx, 'back');
      if (ring) {
        ring += dt;
        var ra = Math.max(0, 1 - ring / 0.9), hx = RX + 150 * cs, hy = GROUND - 250 * cs;
        ctx.strokeStyle = 'rgba(255,255,240,' + 0.6 * ra + ')'; ctx.lineWidth = 7 * ra + 1;
        for (var k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(hx, hy, ring * 480 * (1 - k * 0.22), -0.9, 0.9); ctx.stroke(); }
        if (ring > 0.9) ring = 0;
      }
      // warm rim light behind the riders
      var rim = ctx.createRadialGradient(RX, GROUND - 160 * cs, 10, RX, GROUND - 160 * cs, 260 * cs);
      rim.addColorStop(0, 'rgba(255,214,140,0.35)'); rim.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = rim; ctx.fillRect(RX - 300 * cs, GROUND - 450 * cs, 600 * cs, 450 * cs);
      rex.draw(ctx, RX, GROUND, t, cs);
      fx.draw(ctx, 'front');
      ZONES.beach.drawFront(ctx, W, Hh, GROUND, dist, t);
      if (!reduced) embers.draw(ctx, W, Hh, t, dt);
      var vg = ctx.createRadialGradient(W / 2, Hh * 0.5, Math.min(W, Hh) * 0.4, W / 2, Hh * 0.5, Math.max(W, Hh) * 0.8);
      vg.addColorStop(0, 'rgba(60,20,0,0)'); vg.addColorStop(1, 'rgba(60,20,0,0.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, Hh);
      ctx.restore();
    }, { stillT: 3.2, logicalHFor: function (w, h) { return w / h < 0.9 ? 500 : 466; } });
  }

  // ---------- page chrome ----------
  function initChrome() {
    var nav = document.getElementById('nav');
    var onScroll = function () {
      var y = window.scrollY;
      nav.classList.toggle('is-solid', y > 40);
      document.body.classList.toggle('scrolled', y > window.innerHeight * 0.5);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    // a satisfying press before leaving for the game
    [].forEach.call(document.querySelectorAll('[data-play]'), function (a) {
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        a.classList.add('is-pressed');
        sfx('jump');
        setTimeout(function () { window.location.href = a.getAttribute('href'); }, reduced ? 0 : 140);
      });
    });
    // keep the game file warm in the browser cache once the page is idle
    var warm = function () { var l = document.createElement('link'); l.rel = 'prefetch'; l.href = '/play/'; document.head.appendChild(l); };
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 3000);
  }

  function boot() {
    initChrome();
    initHero();
    initDemo();
    initWorlds();
    initShop();
    initReel();
    initFinale();
    document.documentElement.classList.add('ready');
    if (!reduced) requestAnimationFrame(tick);
  }
  // wait for the display font so canvas text (popups, block letters) uses it, but never long
  var booted = false;
  function go() { if (!booted) { booted = true; boot(); } }
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('30px "Luckiest Guy"'), document.fonts.load('600 16px Fredoka')]).then(go, go);
    setTimeout(go, 1200);
  } else go();
})();
