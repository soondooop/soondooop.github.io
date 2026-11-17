(() => {
  const WORLD = 1000;
  const FRAME = 34;
  const RADIUS = 60;
  const HIT_EXTRA = 28;
  const COLS = [188, 396, 604, 812];
  const ROW_GAP = 146;
  const RESTITUTION = 0.92;
  const DECEL = 260;
  const DRAG = 0.55;
  const SLEEP = 22;
  const MIN_SPEED = 360;
  const MAX_SPEED = 1280;
  const MIN_DRAG = 42;
  const FULL_DRAG = 188;
  const SIM_LIMIT = 8;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FALL_TIME = reduceMotion ? 0.12 : 0.42;

  const app = document.getElementById("app");
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const menu = document.getElementById("menu");
  const win = document.getElementById("win");
  const turnEl = document.getElementById("turn");
  const hintEl = document.getElementById("hint");
  const modeLabel = document.getElementById("mode-label");
  const countBlack = document.getElementById("count-black");
  const countWhite = document.getElementById("count-white");
  const subBlack = document.getElementById("sub-black");
  const subWhite = document.getElementById("sub-white");
  const restartBtn = document.getElementById("restart");
  const muteBtn = document.getElementById("mute");
  const winTitle = document.getElementById("win-title");
  const winSub = document.getElementById("win-sub");
  const diffEasy = document.getElementById("diff-easy");
  const diffNormal = document.getElementById("diff-normal");

  const view = { size: 0, dpr: 1 };
  let wood = null;
  let mode = "2p";
  let difficulty = "normal";
  let phase = "menu";
  let current = "black";
  let stones = [];
  let dragging = null;
  let aiPlan = null;
  let aiTimer = 0;
  let simTime = 0;
  let winner = null;
  let turnText = "알까기";
  let audioCtx = null;
  let noiseBuf = null;
  let muted = false;
  let pendingHits = [];

  try {
    muted = localStorage.getItem("alkkagi-muted") === "1";
  } catch (err) {
    muted = false;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeWood() {
    const size = 1024;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    const rand = mulberry32(0xa11ca6);
    const base = g.createLinearGradient(0, 0, size, size * 0.35);
    base.addColorStop(0, "#f0cb8d");
    base.addColorStop(0.4, "#e0b06a");
    base.addColorStop(0.72, "#c88845");
    base.addColorStop(1, "#e4b56e");
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);

    for (let i = 0; i < 110; i += 1) {
      const y = (i / 110) * size;
      g.strokeStyle = rand() > 0.55
        ? `rgba(110, 58, 22, ${0.05 + rand() * 0.12})`
        : `rgba(255, 226, 180, ${0.04 + rand() * 0.1})`;
      g.lineWidth = 1 + rand() * 2.4;
      g.beginPath();
      let x = 0;
      let yy = y + (rand() - 0.5) * 10;
      g.moveTo(0, yy);
      while (x < size) {
        x += 16;
        yy += Math.sin(x * 0.012 + i) * 1.4 + (rand() - 0.5) * 1.6;
        g.lineTo(x, yy);
      }
      g.stroke();
    }

    for (let k = 0; k < 3; k += 1) {
      const kx = 90 + rand() * (size - 180);
      const ky = 90 + rand() * (size - 180);
      const rad = 16 + rand() * 26;
      const knot = g.createRadialGradient(kx, ky, 2, kx, ky, rad);
      knot.addColorStop(0, "rgba(92, 48, 18, 0.2)");
      knot.addColorStop(0.55, "rgba(120, 72, 30, 0.08)");
      knot.addColorStop(1, "rgba(120, 72, 30, 0)");
      g.fillStyle = knot;
      g.beginPath();
      g.arc(kx, ky, rad, 0, Math.PI * 2);
      g.fill();
    }

    for (let i = 0; i < 2200; i += 1) {
      const alpha = rand() * 0.07;
      g.fillStyle = rand() > 0.5 ? `rgba(70, 36, 12, ${alpha})` : `rgba(255, 236, 200, ${alpha})`;
      g.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1);
    }
    return c;
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function makeStone(side, x, y) {
    return {
      side,
      x,
      y,
      vx: 0,
      vy: 0,
      alive: true,
      falling: false,
      fallT: 0,
      fallX: 0,
      fallY: 0,
      r: RADIUS
    };
  }

  function placeStones() {
    const back = FRAME + RADIUS + 26;
    const front = back + ROW_GAP;
    stones = [];
    COLS.forEach((x) => {
      stones.push(makeStone("white", x, back));
      stones.push(makeStone("white", x, front));
      stones.push(makeStone("black", x, WORLD - front));
      stones.push(makeStone("black", x, WORLD - back));
    });
  }

  function countSide(side) {
    let n = 0;
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      if (s.side === side && s.alive && !s.falling) n += 1;
    }
    return n;
  }

  function setHint(text) {
    hintEl.textContent = text;
  }

  function setTurn(text, kind) {
    if (turnText !== text) {
      turnText = text;
      turnEl.textContent = text;
      turnEl.classList.remove("pop");
      void turnEl.offsetWidth;
      turnEl.classList.add("pop");
    }
    turnEl.classList.toggle("is-black", kind === "black");
    turnEl.classList.toggle("is-white", kind === "white");
  }

  function updateHud() {
    countBlack.textContent = String(countSide("black"));
    countWhite.textContent = String(countSide("white"));
    if (mode === "1p" && phase !== "menu") {
      subBlack.textContent = "나";
      subWhite.textContent = "컴퓨터";
      modeLabel.textContent = difficulty === "easy" ? "컴퓨터 · 쉬움" : "컴퓨터 · 보통";
    } else if (phase !== "menu") {
      subBlack.textContent = "아래";
      subWhite.textContent = "위";
      modeLabel.textContent = "두 명이 하기";
    } else {
      subBlack.textContent = "아래";
      subWhite.textContent = "위";
      modeLabel.textContent = "바둑알 튕기기";
    }
    restartBtn.hidden = phase === "menu";
    if (phase === "menu") setTurn("알까기", null);
    else if (phase === "win") setTurn(winTitle.textContent, winner === "draw" ? null : winner);
    else setTurn(current === "black" ? "흑 차례" : "백 차례", current);
  }

  function showOverlay(which) {
    overlay.hidden = which === "none";
    menu.hidden = which !== "menu";
    win.hidden = which !== "win";
  }

  function aimHint() {
    setHint(current === "black" ? "흑 알을 뒤로 끌어당기세요" : "백 알을 뒤로 끌어당기세요");
  }

  function startGame(nextMode) {
    mode = nextMode;
    current = "black";
    winner = null;
    dragging = null;
    aiPlan = null;
    simTime = 0;
    canvas.classList.remove("is-dragging");
    placeStones();
    phase = "aim";
    showOverlay("none");
    aimHint();
    updateHud();
  }

  function showWin() {
    let title = "무승부";
    let sub = "양쪽 알이 모두 떨어졌습니다.";
    if (winner === "black") {
      title = "흑 승리";
      sub = mode === "1p" ? "당신이 이겼습니다." : "백의 알이 모두 떨어졌습니다.";
    } else if (winner === "white") {
      title = "백 승리";
      sub = mode === "1p" ? "컴퓨터가 이겼습니다." : "흑의 알이 모두 떨어졌습니다.";
    }
    winTitle.textContent = title;
    winSub.textContent = sub;
    phase = "win";
    showOverlay("win");
    setHint(sub);
    updateHud();
  }

  function goMenu() {
    phase = "menu";
    dragging = null;
    aiPlan = null;
    winner = null;
    current = "black";
    canvas.classList.remove("is-dragging");
    placeStones();
    showOverlay("menu");
    setHint("방식을 고르면 판이 시작됩니다");
    updateHud();
  }

  function setDifficulty(next) {
    difficulty = next;
    diffEasy.classList.toggle("is-on", next === "easy");
    diffNormal.classList.toggle("is-on", next === "normal");
    diffEasy.setAttribute("aria-pressed", next === "easy" ? "true" : "false");
    diffNormal.setAttribute("aria-pressed", next === "normal" ? "true" : "false");
  }

  function syncMute() {
    muteBtn.textContent = muted ? "소리 꺼짐" : "소리 켜짐";
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  }

  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      try {
        audioCtx = new AC();
      } catch (err) {
        return null;
      }
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    if (!noiseBuf) {
      const n = Math.max(1, Math.floor(audioCtx.sampleRate * 0.05));
      noiseBuf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / n) * (1 - i / n);
      }
    }
    return audioCtx;
  }

  function playHit(strength, fall) {
    if (muted) return;
    const ac = ensureAudio();
    if (!ac) return;
    try {
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.playbackRate.value = fall ? 0.55 : 0.85 + strength * 0.7;
      const filter = ac.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = fall ? 280 : 700 + strength * 1600;
      filter.Q.value = 0.7;
      const gain = ac.createGain();
      const vol = fall ? 0.08 : Math.min(0.32, 0.04 + strength * 0.28);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (fall ? 0.12 : 0.06));
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      src.start(t);
      src.stop(t + 0.12);

      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(fall ? 90 : 150 + strength * 70, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.08);
      const og = ac.createGain();
      og.gain.setValueAtTime(fall ? 0.06 : Math.min(0.18, 0.03 + strength * 0.14), t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(og);
      og.connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    } catch (err) {
      /* ignore audio glitches */
    }
  }

  function flushHits() {
    if (!pendingHits.length) return;
    pendingHits.sort((a, b) => b - a);
    const top = pendingHits.slice(0, 2);
    pendingHits = [];
    top.forEach((j) => playHit(clamp(j / 900, 0, 1), false));
  }

  function travelDistance(speed) {
    let v = speed;
    let x = 0;
    const dt = 1 / 120;
    for (let i = 0; i < 8000 && v > SLEEP; i += 1) {
      const ns = Math.max(0, v - (DECEL + v * DRAG) * dt);
      x += (v + ns) * 0.5 * dt;
      v = ns;
    }
    return x;
  }

  const travelTable = [];
  function buildTravelTable() {
    for (let i = 0; i <= 20; i += 1) travelTable.push(travelDistance((i / 20) * MAX_SPEED));
  }

  function approxTravel(speed) {
    const t = clamp(speed / MAX_SPEED, 0, 1) * 20;
    const i = Math.floor(t);
    const f = t - i;
    const a = travelTable[i] || 0;
    const b = travelTable[Math.min(20, i + 1)] || a;
    return a + (b - a) * f;
  }

  function speedForDistance(dist) {
    let lo = 200;
    let hi = MAX_SPEED;
    for (let i = 0; i < 14; i += 1) {
      const mid = (lo + hi) / 2;
      if (travelDistance(mid) < dist) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function planAi() {
    const mine = stones.filter((s) => s.alive && !s.falling && s.side === "white");
    const foes = stones.filter((s) => s.alive && !s.falling && s.side === "black");
    if (!mine.length || !foes.length) return null;
    const easy = difficulty === "easy";
    const ranked = mine.map((stone) => {
      let target = foes[0];
      let best = Infinity;
      foes.forEach((foe) => {
        const d = Math.hypot(foe.x - stone.x, foe.y - stone.y);
        if (d < best) {
          best = d;
          target = foe;
        }
      });
      return { stone, target, d: best };
    }).sort((a, b) => a.d - b.d);

    let pick = ranked[0];
    if (easy) {
      pick = ranked[Math.floor(Math.random() * ranked.length)];
      if (Math.random() < 0.55) {
        const target = foes[Math.floor(Math.random() * foes.length)];
        pick = { stone: pick.stone, target, d: Math.hypot(target.x - pick.stone.x, target.y - pick.stone.y) };
      }
    } else if (ranked.length > 1 && Math.random() < 0.35) {
      pick = ranked[1];
    }

    let ang = Math.atan2(pick.target.y - pick.stone.y, pick.target.x - pick.stone.x);
    const noise = easy ? 0.5 : 0.12;
    ang += (Math.random() * 2 - 1) * noise;
    const want = pick.d + (easy ? 30 : 150);
    let speed = speedForDistance(want);
    speed *= easy ? 0.55 + Math.random() * 0.45 : 0.88 + Math.random() * 0.2;
    speed = clamp(speed, 300, MAX_SPEED);
    return {
      stone: pick.stone,
      dirx: Math.cos(ang),
      diry: Math.sin(ang),
      speed,
      power: clamp((speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0.05, 1)
    };
  }

  function beginAi() {
    phase = "ai";
    aiPlan = planAi();
    aiTimer = easyWait();
    setHint("컴퓨터가 조준하는 중");
    if (!aiPlan) {
      current = "black";
      phase = "aim";
      aimHint();
    }
    updateHud();
  }

  function easyWait() {
    return difficulty === "easy" ? 0.95 : 0.72;
  }

  function startFall(stone) {
    if (!stone.alive || stone.falling) return;
    const dx = stone.x - WORLD / 2;
    const dy = stone.y - WORLD / 2;
    const mag = Math.hypot(dx, dy) || 1;
    stone.falling = true;
    stone.fallT = 0;
    stone.fallX = dx / mag;
    stone.fallY = dy / mag;
    stone.vx = 0;
    stone.vy = 0;
    playHit(0.35, true);
  }

  function integrate(dt) {
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      if (!s.alive || s.falling) continue;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp <= 0) continue;
      const ns = Math.max(0, sp - (DECEL + sp * DRAG) * dt);
      const k = ns / sp;
      s.x += s.vx * (1 + k) * 0.5 * dt;
      s.y += s.vy * (1 + k) * 0.5 * dt;
      s.vx *= k;
      s.vy *= k;
    }
  }

  function solveCollisions() {
    for (let pass = 0; pass < 8; pass += 1) {
      for (let i = 0; i < stones.length; i += 1) {
        const a = stones[i];
        if (!a.alive || a.falling) continue;
        for (let j = i + 1; j < stones.length; j += 1) {
          const b = stones[j];
          if (!b.alive || b.falling) continue;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          const min = a.r + b.r;
          if (dist >= min) continue;
          if (dist < 1e-6) {
            dx = 1;
            dy = 0;
            dist = 1e-6;
          }
          const nx = dx / dist;
          const ny = dy / dist;
          const push = (min - dist) * 0.5 + 0.02;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          if (pass === 0) {
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel < 0) {
              const impulse = -(1 + RESTITUTION) * rel * 0.5;
              a.vx -= impulse * nx;
              a.vy -= impulse * ny;
              b.vx += impulse * nx;
              b.vy += impulse * ny;
              if (impulse > 28) pendingHits.push(impulse);
            }
          }
        }
      }
    }
  }

  function capSpeeds() {
    const cap = MAX_SPEED * 1.35;
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      if (!s.alive || s.falling) continue;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > cap) {
        s.vx = (s.vx / sp) * cap;
        s.vy = (s.vy / sp) * cap;
      }
    }
  }

  function offBoard(s) {
    return s.x < FRAME || s.y < FRAME || s.x > WORLD - FRAME || s.y > WORLD - FRAME;
  }

  function stepPhysics(dt) {
    let maxSp = 1;
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      if (!s.alive || s.falling) continue;
      maxSp = Math.max(maxSp, Math.hypot(s.vx, s.vy));
    }
    const steps = Math.min(8, Math.max(1, Math.ceil((maxSp * dt) / 36)));
    const h = dt / steps;
    for (let n = 0; n < steps; n += 1) {
      integrate(h);
      solveCollisions();
      capSpeeds();
      for (let i = 0; i < stones.length; i += 1) {
        const s = stones[i];
        if (s.alive && !s.falling && offBoard(s)) startFall(s);
      }
    }
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      if (!s.alive || s.falling) continue;
      if (s.vx * s.vx + s.vy * s.vy < SLEEP * SLEEP) {
        s.vx = 0;
        s.vy = 0;
      }
    }
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      if (!s.falling) continue;
      s.fallT += dt;
      if (s.fallT >= FALL_TIME) {
        s.falling = false;
        s.alive = false;
      }
    }
    flushHits();
  }

  function forceStop() {
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      s.vx = 0;
      s.vy = 0;
      if (s.falling) {
        s.falling = false;
        s.alive = false;
      } else if (s.alive && offBoard(s)) {
        s.alive = false;
      }
    }
  }

  function settled() {
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      if (!s.alive) continue;
      if (s.falling || s.vx !== 0 || s.vy !== 0) return false;
    }
    return true;
  }

  function finishTurn() {
    const black = countSide("black");
    const white = countSide("white");
    if (black === 0 || white === 0) {
      if (black === 0 && white === 0) winner = "draw";
      else winner = black === 0 ? "white" : "black";
      showWin();
      return;
    }
    current = current === "black" ? "white" : "black";
    if (mode === "1p" && current === "white") beginAi();
    else {
      phase = "aim";
      aimHint();
      updateHud();
    }
  }

  function dragInfo(stone, px, py) {
    const dx = px - stone.x;
    const dy = py - stone.y;
    const dist = Math.hypot(dx, dy);
    const raw = (dist - MIN_DRAG) / FULL_DRAG;
    const power = clamp(raw, 0, 1);
    const inv = dist > 0.001 ? 1 / dist : 0;
    return {
      dist,
      power,
      dirx: dist > 0.001 ? -dx * inv : 0,
      diry: dist > 0.001 ? -dy * inv : -1
    };
  }

  function releaseShot(stone, px, py) {
    const info = dragInfo(stone, px, py);
    if (info.dist < MIN_DRAG || info.power <= 0) {
      aimHint();
      return;
    }
    const speed = MIN_SPEED + info.power * (MAX_SPEED - MIN_SPEED);
    stone.vx = info.dirx * speed;
    stone.vy = info.diry * speed;
    phase = "sim";
    simTime = 0;
    setHint("알이 움직이는 중");
    updateHud();
  }

  function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    return {
      x: ((event.clientX - rect.left) / w) * WORLD,
      y: ((event.clientY - rect.top) / h) * WORLD
    };
  }

  function pickStone(x, y, side) {
    const reach = RADIUS + HIT_EXTRA;
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      if (!s.alive || s.falling || s.side !== side) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d <= reach && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  function onPointerDown(event) {
    if (phase !== "aim" || dragging) return;
    if (event.button != null && event.button !== 0) return;
    const p = toWorld(event);
    const stone = pickStone(p.x, p.y, current);
    if (!stone) return;
    event.preventDefault();
    dragging = { stone, id: event.pointerId, x: p.x, y: p.y };
    canvas.classList.add("is-dragging");
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (err) {
      /* pointer may already be gone */
    }
    ensureAudio();
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== dragging.id) return;
    event.preventDefault();
    const p = toWorld(event);
    dragging.x = p.x;
    dragging.y = p.y;
    const info = dragInfo(dragging.stone, p.x, p.y);
    if (info.dist < MIN_DRAG) setHint("조금 더 끌어당기세요");
    else setHint(`힘 ${Math.round(info.power * 100)}% · 놓으면 날아갑니다`);
  }

  function endDrag(event, launch) {
    if (!dragging || (event && event.pointerId !== dragging.id)) return;
    const shot = dragging;
    dragging = null;
    canvas.classList.remove("is-dragging");
    if (launch && phase === "aim") releaseShot(shot.stone, shot.x, shot.y);
    else if (phase === "aim") aimHint();
  }

  function layout() {
    const stage = canvas.parentElement;
    const rect = stage.getBoundingClientRect();
    const size = Math.max(0, Math.floor(Math.min(rect.width, rect.height)));
    if (!size) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.size = size;
    view.dpr = dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
  }

  function drawBoard() {
    const frame = ctx.createLinearGradient(0, 0, 0, WORLD);
    frame.addColorStop(0, "#8d5a34");
    frame.addColorStop(0.12, "#5a3418");
    frame.addColorStop(0.5, "#3d2412");
    frame.addColorStop(1, "#6a4124");
    ctx.fillStyle = frame;
    ctx.fillRect(0, 0, WORLD, WORLD);

    ctx.save();
    roundRect(FRAME - 10, FRAME - 10, WORLD - FRAME * 2 + 20, WORLD - FRAME * 2 + 20, 18);
    ctx.clip();
    ctx.fillStyle = "#24160e";
    ctx.fillRect(0, 0, WORLD, WORLD);
    ctx.restore();

    ctx.save();
    roundRect(FRAME, FRAME, WORLD - FRAME * 2, WORLD - FRAME * 2, 12);
    ctx.clip();
    ctx.drawImage(wood, FRAME, FRAME, WORLD - FRAME * 2, WORLD - FRAME * 2);
    const vignette = ctx.createRadialGradient(WORLD / 2, WORLD / 2, WORLD * 0.2, WORLD / 2, WORLD / 2, WORLD * 0.62);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(70, 32, 10, 0.18)");
    ctx.fillStyle = vignette;
    ctx.fillRect(FRAME, FRAME, WORLD - FRAME * 2, WORLD - FRAME * 2);
    ctx.restore();

    const lines = 13;
    const pad = 48;
    const x0 = FRAME + pad;
    const x1 = WORLD - FRAME - pad;
    const step = (x1 - x0) / (lines - 1);
    ctx.save();
    ctx.strokeStyle = "rgba(48, 26, 12, 0.78)";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "square";
    for (let i = 0; i < lines; i += 1) {
      const p = x0 + step * i;
      ctx.beginPath();
      ctx.moveTo(p, x0);
      ctx.lineTo(p, x1);
      ctx.moveTo(x0, p);
      ctx.lineTo(x1, p);
      ctx.stroke();
    }
    ctx.lineWidth = 4;
    ctx.strokeRect(x0, x0, x1 - x0, x1 - x0);
    [[3, 3], [3, 9], [6, 6], [9, 3], [9, 9]].forEach(([sx, sy]) => {
      ctx.beginPath();
      ctx.arc(x0 + step * sx, x0 + step * sy, 6.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(42, 22, 10, 0.86)";
      ctx.fill();
    });
    ctx.restore();

    if (phase === "aim" || phase === "sim" || phase === "ai") {
      const grd = ctx.createLinearGradient(0, current === "black" ? WORLD - 90 : 0, 0, current === "black" ? WORLD : 90);
      const fade = current === "black"
        ? ["rgba(255, 236, 200, 0.28)", "rgba(255, 236, 200, 0)"]
        : ["rgba(255, 250, 240, 0.34)", "rgba(255, 250, 240, 0)"];
      if (current === "black") {
        grd.addColorStop(0, fade[1]);
        grd.addColorStop(1, fade[0]);
      } else {
        grd.addColorStop(0, fade[0]);
        grd.addColorStop(1, fade[1]);
      }
      ctx.fillStyle = grd;
      ctx.fillRect(FRAME, current === "black" ? WORLD - FRAME - 70 : FRAME, WORLD - FRAME * 2, 70);
    }
  }

  function drawStoneBody(s, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const falling = s.falling;
    const t = falling ? clamp(s.fallT / FALL_TIME, 0, 1) : 0;
    const shift = t * t;
    ctx.translate(s.x + s.fallX * 78 * shift, s.y + s.fallY * 78 * shift + 26 * shift);
    ctx.rotate(shift * 0.9);
    const scale = 1 - 0.38 * shift;
    ctx.scale(scale, scale);

    ctx.save();
    ctx.translate(6, 10);
    ctx.scale(1, 0.4);
    ctx.beginPath();
    ctx.arc(0, 0, s.r * 0.92, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(36, 18, 8, 0.38)";
    ctx.fill();
    ctx.restore();

    const black = s.side === "black";
    const g = ctx.createRadialGradient(-s.r * 0.36, -s.r * 0.42, s.r * 0.12, 0, s.r * 0.15, s.r);
    if (black) {
      g.addColorStop(0, "#6a6a6a");
      g.addColorStop(0.42, "#2c2c2c");
      g.addColorStop(0.8, "#141414");
      g.addColorStop(1, "#050505");
    } else {
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.45, "#f4f0e7");
      g.addColorStop(0.82, "#d4cfc3");
      g.addColorStop(1, "#b7b1a4");
    }
    ctx.beginPath();
    ctx.arc(0, 0, s.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = black ? "rgba(255,255,255,0.16)" : "rgba(70, 60, 46, 0.4)";
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(-s.r * 0.32, -s.r * 0.38, s.r * 0.26, s.r * 0.15, -0.7, 0, Math.PI * 2);
    ctx.fillStyle = black ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.9)";
    ctx.fill();
    ctx.restore();
  }

  function drawRings() {
    if (phase !== "aim" || !dragging) return;
    const s = dragging.stone;
    if (!s.alive) return;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r + 8, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255, 244, 214, 0.95)";
    ctx.stroke();
  }

  function clipReach(x, y, dirx, diry, dist) {
    let max = dist;
    if (dirx > 0.0001) max = Math.min(max, (WORLD - FRAME - x) / dirx);
    else if (dirx < -0.0001) max = Math.min(max, (FRAME - x) / dirx);
    if (diry > 0.0001) max = Math.min(max, (WORLD - FRAME - y) / diry);
    else if (diry < -0.0001) max = Math.min(max, (FRAME - y) / diry);
    return Math.max(28, max);
  }

  function drawAim(x, y, dirx, diry, power, pull) {
    const speed = MIN_SPEED + Math.max(power, 0) * (MAX_SPEED - MIN_SPEED);
    const len = clipReach(x, y, dirx, diry, approxTravel(speed));
    const x1 = x + dirx * (RADIUS + 8);
    const y1 = y + diry * (RADIUS + 8);
    const x2 = x + dirx * (RADIUS + 8 + len);
    const y2 = y + diry * (RADIUS + 8 + len);
    ctx.save();
    ctx.lineCap = "round";
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = "rgba(32, 16, 8, 0.55)";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = power > 0.82 ? "#ffb088" : "#fff6df";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(diry, dirx);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang - 0.42) * 20, y2 - Math.sin(ang - 0.42) * 20);
    ctx.lineTo(x2 - Math.cos(ang + 0.42) * 20, y2 - Math.sin(ang + 0.42) * 20);
    ctx.closePath();
    ctx.fillStyle = power > 0.82 ? "#ffb088" : "#fff6df";
    ctx.fill();

    if (power > 0) {
      ctx.beginPath();
      ctx.arc(x, y, RADIUS + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power);
      ctx.strokeStyle = power > 0.82 ? "#e25a2a" : "#fff1cf";
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    if (pull) {
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(pull.x, pull.y);
      ctx.strokeStyle = "rgba(150, 42, 24, 0.7)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(pull.x, pull.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 246, 230, 0.95)";
      ctx.fill();
      ctx.font = "700 36px sans-serif";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(40, 18, 8, 0.75)";
      ctx.fillStyle = "#fff8ee";
      const label = `${Math.round(power * 100)}%`;
      const lx = pull.x > WORLD - 120 ? pull.x - 52 : pull.x + 52;
      const ly = pull.y;
      ctx.textAlign = pull.x > WORLD - 120 ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.strokeText(label, lx, ly);
      ctx.fillText(label, lx, ly);
    }
    ctx.restore();
  }

  function draw() {
    if (!view.size || !wood) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = (view.size / WORLD) * view.dpr;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawBoard();
    for (let i = 0; i < stones.length; i += 1) {
      const s = stones[i];
      if (!s.alive && !s.falling) continue;
      const alpha = s.falling ? 1 - (s.fallT / FALL_TIME) * (s.fallT / FALL_TIME) : 1;
      drawStoneBody(s, clamp(alpha, 0, 1));
    }
    drawRings();
    if (dragging && phase === "aim") {
      const info = dragInfo(dragging.stone, dragging.x, dragging.y);
      drawAim(dragging.stone.x, dragging.stone.y, info.dirx, info.diry, info.power, dragging);
    } else if (phase === "ai" && aiPlan) {
      drawAim(aiPlan.stone.x, aiPlan.stone.y, aiPlan.dirx, aiPlan.diry, aiPlan.power, null);
    }
  }

  function frame(now) {
    if (!frame.last) frame.last = now;
    const dt = Math.min(0.033, (now - frame.last) / 1000);
    frame.last = now;
    if (phase === "ai") {
      aiTimer -= dt;
      if (aiTimer <= 0 && aiPlan) {
        const s = aiPlan.stone;
        if (s.alive && !s.falling) {
          s.vx = aiPlan.dirx * aiPlan.speed;
          s.vy = aiPlan.diry * aiPlan.speed;
        }
        aiPlan = null;
        phase = "sim";
        simTime = 0;
        setHint("알이 움직이는 중");
      }
    } else if (phase === "sim") {
      stepPhysics(dt);
      simTime += dt;
      if (simTime > SIM_LIMIT) forceStop();
      if (settled()) finishTurn();
    }
    draw();
    requestAnimationFrame(frame);
  }

  document.getElementById("mode-2p").addEventListener("click", () => startGame("2p"));
  document.getElementById("mode-1p").addEventListener("click", () => startGame("1p"));
  diffEasy.addEventListener("click", () => setDifficulty("easy"));
  diffNormal.addEventListener("click", () => setDifficulty("normal"));
  restartBtn.addEventListener("click", () => {
    if (phase !== "menu") startGame(mode);
  });
  document.getElementById("win-restart").addEventListener("click", () => startGame(mode));
  document.getElementById("win-menu").addEventListener("click", goMenu);
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    syncMute();
    try {
      localStorage.setItem("alkkagi-muted", muted ? "1" : "0");
    } catch (err) {
      /* storage may be blocked */
    }
    if (!muted) ensureAudio();
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", (event) => endDrag(event, true));
  window.addEventListener("pointercancel", (event) => endDrag(event, false));
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("touchmove", (event) => {
    if (dragging) event.preventDefault();
  }, { passive: false });
  app.addEventListener("pointerdown", () => ensureAudio(), { passive: true });

  window.addEventListener("resize", layout);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", layout);

  wood = makeWood();
  buildTravelTable();
  placeStones();
  syncMute();
  updateHud();
  layout();
  requestAnimationFrame(frame);
})();
