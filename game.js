(() => {
  "use strict";

  const TILE = 16;
  const MAP_W = 20;
  const MAP_H = 24;
  const G_GRASS = 0, G_PATH = 1, G_PLAZA = 2, G_FADE = 3, G_DIRT = 4, G_FLOWER = 5, G_WATER = 6;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let cssW = 390, cssH = 844, dpr = 1, viewScale = 3;
  let lastT = 0, mode = "boot";
  let fadeEl = document.getElementById("fade");
  let fadeBusy = false;

  const keys = new Set();
  const stick = { x: 0, y: 0, active: false, id: null };

  let audioCtx = null, master = null, muted = false, ambTimer = 0;

  const assets = { tiles: [], chars: {}, enemy: null, crystal: null };
  const particles = [];
  const floaters = [];

  let map, solids, objects, lights, npcs, tileVarRef;
  let player;
  let cam = { x: 0, y: 0 };
  let talked = { sera: false, luca: false, noah: false, maloi: false, ena: false };
  let locCard = { text: "", t: 0 };
  let battleStarted = false;
  let time = 0;

  let dlgQueue = [];
  let dlgIndex = 0;
  let dlgShown = "";
  let dlgFull = "";
  let dlgTimer = 0;
  let dlgDone = false;
  let dlgAfter = null;
  const TYPE_MS = 28;

  let battle = null;
  let openingState = { phase: 0, t: 0, cracked: false };

  const params = new URLSearchParams(location.search);
  const shotMode = params.get("scene") || params.get("shot");

  const PAL = {
    sunfi: {
      skin: "#f0d0b4", shade: "#d0a888",
      hair: "#5a3828", hairL: "#8a5840", hairD: "#3a2218",
      cloth: "#efece3", clothS: "#c4bba8", clothD: "#8e8674",
      accent: "#c9a24a", boot: "#5a4a3a",
      weapon: "#d8c8a0", gem: "#9fe8ff", eye: "#3a2a20", line: "#2a1c14"
    },
    sera: {
      skin: "#e8c4a4", shade: "#c49878",
      hair: "#1e1a22", hairL: "#3a3440", hairD: "#0c0a10",
      cloth: "#6a3c38", clothS: "#4a2828", clothD: "#2e1818",
      accent: "#8a3030", boot: "#2a2420",
      weapon: "#c8c8d0", gem: "#9098a0", eye: "#3a2020", line: "#140c0c"
    },
    luca: {
      skin: "#efc8a0", shade: "#c99a74",
      hair: "#6b4a2a", hairL: "#8a6238", hairD: "#3a2414",
      cloth: "#3d5a3a", clothS: "#2a3e28", clothD: "#1a2618",
      accent: "#c8b48a", boot: "#3a3024",
      weapon: "#8a6238", gem: "#c8d0a0", eye: "#2a2418", line: "#1a140c"
    },
    noah: {
      skin: "#e8c8b4", shade: "#c4a08c",
      hair: "#3a3450", hairL: "#6a6088", hairD: "#1c1828",
      cloth: "#6a5a82", clothS: "#4e4068", clothD: "#2e2444",
      accent: "#6a6080", boot: "#1c1820",
      weapon: "#6a6080", gem: "#c0a0e0", eye: "#302038", line: "#120c16"
    },
    maloi: {
      skin: "#d8b08c", shade: "#b48a68",
      hair: "#4a3a30", hairL: "#6a5244", hairD: "#2a2018",
      cloth: "#5a4a3a", clothS: "#3e3228", clothD: "#2a2018",
      accent: "#8a6a40", boot: "#2a2018",
      weapon: "#8a7a60", gem: "#c0a070", eye: "#2a2018", line: "#181410"
    },
    ena: {
      skin: "#f0d0b0", shade: "#d0a888",
      hair: "#6a4030", hairL: "#8a5840", hairD: "#3a2418",
      cloth: "#6a4a40", clothS: "#4a322c", clothD: "#2e201c",
      accent: "#d0a070", boot: "#4a3028",
      weapon: "#c0a080", gem: "#e0c0a0", eye: "#3a2a20", line: "#1c1410"
    }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function irand(a, b) { return (a + Math.random() * (b - a + 1)) | 0; }
  function seedRand(s) {
    let a = s >>> 0;
    return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  }
  function newCvs(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    return { c, g };
  }
  function px(g, x, y, w, h, c) {
    g.fillStyle = c;
    g.fillRect(x | 0, y | 0, w, h);
  }
  function $(id) { return document.getElementById(id); }

  function fadeTo(ms, fn) {
    if (fadeBusy) return;
    fadeBusy = true;
    fadeEl.classList.add("on");
    fadeEl.style.transition = "opacity " + ms + "ms ease";
    fadeEl.style.opacity = "1";
    setTimeout(() => {
      if (fn) fn();
      fadeEl.style.opacity = "0";
      setTimeout(() => {
        fadeEl.classList.remove("on");
        fadeBusy = false;
      }, ms);
    }, ms + 40);
  }

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      master = audioCtx.createGain();
      master.gain.value = muted ? 0 : 0.28;
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem("eldia-mute", m ? "1" : "0"); } catch (e) {}
    if (master) master.gain.value = m ? 0 : 0.28;
    const btn = $("btn-mute");
    if (btn) {
      btn.classList.toggle("muted", m);
      btn.textContent = m ? "x" : "♪";
    }
  }

  function tone(opt) {
    if (!audioCtx || muted) return;
    const freq = opt.freq || 440, dur = opt.dur || 0.12, type = opt.type || "sine";
    const vol = opt.vol || 0.12, slide = opt.slide || 0, delay = opt.delay || 0;
    const t = audioCtx.currentTime + delay;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(40, freq), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(dur, vol, bp) {
    if (!audioCtx || muted) return;
    const n = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = n;
    const f = audioCtx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = bp || 800;
    f.Q.value = 0.7;
    const g = audioCtx.createGain();
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }

  const sfx = {
    ui() { tone({ freq: 660, dur: 0.07, type: "triangle", vol: 0.06 }); },
    confirm() { tone({ freq: 520, dur: 0.08, type: "sine", vol: 0.07 }); tone({ freq: 780, dur: 0.1, type: "sine", vol: 0.05, delay: 0.04 }); },
    type() { tone({ freq: 420 + Math.random() * 80, dur: 0.02, type: "square", vol: 0.02 }); },
    step() { noise(0.04, 0.03, 300); },
    crack() {
      noise(0.28, 0.18, 200);
      tone({ freq: 180, dur: 0.4, type: "sawtooth", vol: 0.07, slide: -80 });
      tone({ freq: 880, dur: 0.2, type: "sine", vol: 0.05, slide: -400 });
    },
    talk() { tone({ freq: 340, dur: 0.06, type: "triangle", vol: 0.05 }); },
    sword() { noise(0.08, 0.1, 1800); tone({ freq: 700, dur: 0.08, type: "square", vol: 0.04, slide: -300 }); },
    arrow() { tone({ freq: 900, dur: 0.08, type: "square", vol: 0.05, slide: -500 }); noise(0.05, 0.04, 2000); },
    fire() { noise(0.16, 0.1, 400); tone({ freq: 240, dur: 0.2, type: "sawtooth", vol: 0.05, slide: 60 }); },
    ice() { tone({ freq: 900, dur: 0.16, type: "sine", vol: 0.06 }); tone({ freq: 1200, dur: 0.12, type: "triangle", vol: 0.04, delay: 0.04 }); },
    hit() { noise(0.1, 0.12, 500); tone({ freq: 160, dur: 0.12, type: "square", vol: 0.05 }); },
    hurt() { tone({ freq: 220, dur: 0.16, type: "sawtooth", vol: 0.07, slide: -80 }); },
    holy() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.45, type: "sine", vol: 0.07, delay: i * 0.05 }));
      tone({ freq: 1568, dur: 0.6, type: "triangle", vol: 0.04, delay: 0.12 });
    },
    heal() {
      [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.28, type: "sine", vol: 0.06, delay: i * 0.07 }));
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.3, type: "triangle", vol: 0.07, delay: i * 0.1 }));
    },
    lose() { tone({ freq: 220, dur: 0.5, type: "sawtooth", vol: 0.07, slide: -120 }); },
    chime() { tone({ freq: 1046, dur: 0.4, type: "sine", vol: 0.05 }); tone({ freq: 1568, dur: 0.5, type: "sine", vol: 0.03, delay: 0.05 }); }
  };

  function tickAmbient(dt) {
    if (mode !== "town" && mode !== "opening" && mode !== "title") return;
    ambTimer -= dt;
    if (ambTimer <= 0) {
      ambTimer = 2.8 + Math.random() * 3.5;
      tone({ freq: 520 + Math.random() * 400, dur: 0.7, type: "sine", vol: 0.025 });
    }
  }

  function drawCharFrame(pal, dir, frame, who) {
    const { c, g } = newCvs(16, 24);
    const walk = frame % 2;
    const bob = frame === 1 ? 1 : 0;
    const legOff = frame === 0 ? 0 : (walk ? 1 : -1);
    const skin = pal.skin, shade = pal.shade, hair = pal.hair, hairL = pal.hairL;
    const cloth = pal.cloth, clothS = pal.clothS, clothD = pal.clothD;
    const accent = pal.accent, boot = pal.boot, eye = pal.eye, line = pal.line;

    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.ellipse(8, 22, 5, 1.6, 0, 0, Math.PI * 2);
    g.fill();

    const headY = 1 + bob;
    const face = dir !== 3;
    const ly = 17 + bob;
    if (dir === 1) {
      px(g, 5, ly, 3, 4, clothD);
      px(g, 8 + legOff, ly, 3, 4, clothD);
      px(g, 5, ly + 4, 3, 2, boot);
      px(g, 8 + legOff, ly + 4, 3, 2, boot);
    } else if (dir === 2) {
      px(g, 8, ly, 3, 4, clothD);
      px(g, 5 - legOff, ly, 3, 4, clothD);
      px(g, 8, ly + 4, 3, 2, boot);
      px(g, 5 - legOff, ly + 4, 3, 2, boot);
    } else {
      px(g, 4, ly, 3, 4, clothD);
      px(g, 9, ly, 3, 4, clothD);
      if (frame === 1) px(g, 4, ly + 1, 3, 4, clothD);
      if (frame === 2) px(g, 9, ly + 1, 3, 4, clothD);
      px(g, 4, ly + 4, 3, 2, boot);
      px(g, 9, ly + 4, 3, 2, boot);
    }

    const ty = 11 + bob;
    px(g, 4, ty, 8, 7, cloth);
    px(g, 4, ty, 8, 2, clothS);
    px(g, 4, ty + 5, 8, 2, clothD);
    px(g, 4, ty, 1, 7, clothD);
    px(g, 11, ty, 1, 7, clothS);

    if (who === "sunfi") {
      px(g, 5, ty, 6, 1, accent);
      px(g, 7, ty + 2, 2, 3, "#f7f4ea");
    } else if (who === "sera") {
      px(g, 5, ty + 1, 6, 1, pal.accent);
      px(g, 3, ty - 1, 2, 6, clothD);
      px(g, 11, ty - 1, 2, 6, clothD);
    } else if (who === "luca") {
      px(g, 5, ty + 1, 6, 2, pal.accent);
    } else if (who === "noah") {
      px(g, 3, ty - 1, 10, 2, clothD);
      px(g, 3, ty, 1, 8, clothD);
      px(g, 12, ty, 1, 8, clothD);
    } else if (who === "maloi") {
      px(g, 5, ty + 2, 6, 4, "#d0c4a8");
    } else if (who === "ena") {
      px(g, 5, ty + 1, 6, 4, "#c07060");
      px(g, 5, ty + 4, 6, 1, "#e8d0b0");
    }

    if (dir === 1) {
      px(g, 2, ty + 1, 2, 5, clothS);
      px(g, 2, ty + 6, 2, 2, skin);
    } else if (dir === 2) {
      px(g, 12, ty + 1, 2, 5, clothS);
      px(g, 12, ty + 6, 2, 2, skin);
    } else {
      px(g, 2, ty + 1 + (frame === 1 ? 1 : 0), 2, 5, clothS);
      px(g, 12, ty + 1 + (frame === 2 ? 1 : 0), 2, 5, clothS);
      px(g, 2, ty + 6, 2, 2, skin);
      px(g, 12, ty + 6, 2, 2, skin);
    }

    px(g, 7, 8 + bob, 2, 3, skin);
    const hx = 4, hy2 = headY + 2;
    px(g, hx + 1, hy2, 6, 7, skin);
    px(g, hx, hy2 + 1, 8, 5, skin);
    px(g, hx + 6, hy2 + 2, 2, 4, shade);

    if (face) {
      if (dir === 0) {
        px(g, 6, hy2 + 3, 1, 1, eye);
        px(g, 9, hy2 + 3, 1, 1, eye);
        if (who === "sera") {
          px(g, 6, hy2 + 2, 1, 1, line);
          px(g, 9, hy2 + 2, 1, 1, line);
          px(g, 7, hy2 + 5, 2, 1, shade);
        } else if (who === "luca") {
          px(g, 7, hy2 + 5, 2, 1, shade);
          px(g, 6, hy2 + 5, 1, 1, shade);
          px(g, 9, hy2 + 5, 1, 1, shade);
        } else if (who === "noah") {
          px(g, 6, hy2 + 3, 2, 1, eye);
          px(g, 9, hy2 + 3, 1, 1, eye);
          px(g, 7, hy2 + 5, 1, 1, shade);
        } else {
          px(g, 7, hy2 + 5, 2, 1, shade);
        }
      } else if (dir === 1) {
        px(g, 6, hy2 + 3, 1, 1, eye);
        px(g, 6, hy2 + 5, 1, 1, shade);
      } else if (dir === 2) {
        px(g, 9, hy2 + 3, 1, 1, eye);
        px(g, 9, hy2 + 5, 1, 1, shade);
      }
    }

    if (who === "sunfi") {
      px(g, hx, hy2 - 1, 8, 3, hair);
      px(g, hx - 1, hy2 + 1, 2, 5, hair);
      px(g, hx + 7, hy2 + 1, 2, 5, hair);
      px(g, hx + 1, hy2 - 2, 6, 2, hair);
      px(g, hx + 2, hy2 - 2, 3, 1, hairL);
      if (dir !== 0) px(g, hx + (dir === 1 ? -1 : 7), hy2 + 5, 2, 3, hair);
      else {
        px(g, hx + 3, hy2 + 7, 3, 3, hair);
        px(g, hx + 3, hy2 + 9, 2, 2, pal.hairD);
      }
    } else if (who === "sera") {
      px(g, hx, hy2 - 2, 8, 3, hair);
      px(g, hx - 1, hy2, 2, 4, hair);
      px(g, hx + 7, hy2, 3, 5, hair);
      px(g, hx + 2, hy2 - 3, 3, 2, hairL);
      if (dir === 0) px(g, hx + 1, hy2, 1, 1, hair);
    } else if (who === "luca") {
      px(g, hx, hy2 - 1, 8, 3, hair);
      px(g, hx - 1, hy2 + 1, 2, 5, hair);
      px(g, hx + 7, hy2 + 1, 2, 5, hair);
      px(g, hx + 1, hy2 - 2, 6, 2, hair);
      px(g, hx + 2, hy2 - 2, 2, 1, hairL);
    } else if (who === "noah") {
      px(g, hx, hy2 - 1, 8, 3, hair);
      px(g, hx - 1, hy2, 2, 7, hair);
      px(g, hx + 7, hy2, 3, 8, hair);
      px(g, hx + 1, hy2 - 2, 6, 2, hair);
      px(g, hx + 8, hy2 + 6, 2, 3, pal.hairL);
    } else if (who === "maloi") {
      px(g, hx, hy2 - 1, 8, 3, hair);
      px(g, hx + 1, hy2 - 2, 6, 1, pal.hairL);
      px(g, hx - 1, hy2 + 1, 1, 3, hair);
      px(g, hx + 8, hy2 + 1, 1, 3, hair);
      if (dir === 0) px(g, hx + 2, hy2 + 6, 4, 1, "#c8b8a0");
    } else {
      px(g, hx, hy2 - 1, 8, 3, hair);
      px(g, hx + 1, hy2 - 2, 6, 2, hair);
      px(g, hx - 1, hy2 + 1, 2, 5, hair);
      px(g, hx + 7, hy2 + 1, 2, 6, hair);
      px(g, hx + 2, hy2 - 2, 2, 1, hairL);
    }

    if (who === "sunfi") {
      if (dir !== 1) {
        px(g, 13, 4 + bob, 2, 14, pal.weapon);
        px(g, 12, 2 + bob, 4, 4, pal.gem);
        px(g, 13, 3 + bob, 2, 2, "#effcff");
      } else {
        px(g, 1, 4 + bob, 2, 14, pal.weapon);
        px(g, 0, 2 + bob, 4, 4, pal.gem);
      }
    } else if (who === "sera") {
      if (dir === 2 || dir === 0) {
        px(g, 13, 8 + bob, 2, 10, pal.weapon);
        px(g, 13, 7 + bob, 2, 2, accent);
      } else if (dir === 1) {
        px(g, 1, 8 + bob, 2, 10, pal.weapon);
      } else {
        px(g, 3, 8 + bob, 2, 8, pal.weapon);
      }
    } else if (who === "luca") {
      if (dir === 3) {
        px(g, 4, 10 + bob, 8, 2, pal.weapon);
      } else {
        px(g, 1, 8 + bob, 2, 8, pal.weapon);
        px(g, 0, 8 + bob, 1, 6, pal.accent);
      }
    } else if (who === "noah") {
      const wx = dir === 1 ? 1 : 13;
      px(g, wx, 7 + bob, 2, 10, pal.weapon);
      px(g, wx - (dir === 1 ? 0 : 1), 6 + bob, 4, 3, pal.gem);
    }
    return c;
  }

  function buildCharSheets() {
    const names = ["sunfi", "sera", "luca", "noah", "maloi", "ena"];
    for (const n of names) {
      const frames = [];
      for (let dir = 0; dir < 4; dir++) {
        frames[dir] = [0, 1, 2].map((f) => drawCharFrame(PAL[n], dir, f, n));
      }
      assets.chars[n] = frames;
    }
  }

  function makeTile(type, v, rng) {
    const { c, g } = newCvs(TILE, TILE);
    const n = () => rng();
    if (type === G_GRASS) {
      px(g, 0, 0, 16, 16, "#121c1a");
      for (let i = 0; i < 28; i++) {
        const col = n() < 0.5 ? "#1a2a24" : n() < 0.7 ? "#0e1614" : "#243830";
        px(g, (n() * 16) | 0, (n() * 16) | 0, n() < 0.4 ? 2 : 1, 1, col);
      }
      if (n() < 0.2) px(g, (n() * 14) | 0, (n() * 14) | 0, 1, 2, "#2a4840");
    } else if (type === G_FADE) {
      px(g, 0, 0, 16, 16, "#1b1b1e");
      for (let i = 0; i < 26; i++) {
        const col = n() < 0.5 ? "#242428" : "#141416";
        px(g, (n() * 16) | 0, (n() * 16) | 0, 2, 1, col);
      }
      if (n() < 0.4) px(g, (n() * 14) | 0, (n() * 14) | 0, 2, 1, "#2c2c32");
    } else if (type === G_PATH || type === G_PLAZA) {
      const base = type === G_PLAZA ? "#2c2c38" : "#26262e";
      const grout = "#16161c";
      px(g, 0, 0, 16, 16, grout);
      const s = type === G_PLAZA ? 8 : 5;
      for (let yy = 0; yy < 16; yy += s) {
        for (let xx = 0; xx < 16; xx += s) {
          const ox = ((yy / s) | 0) % 2 ? s / 2 : 0;
          const col = n() < 0.5 ? base : (type === G_PLAZA ? "#343444" : "#2e2e36");
          px(g, xx + ox, yy, s - 1, s - 1, col);
          px(g, xx + ox, yy, s - 1, 1, "#3a3a48");
        }
      }
      if (type === G_PLAZA && n() < 0.25) px(g, 3, 3, 1, 1, "#5a4a30");
    } else if (type === G_DIRT) {
      px(g, 0, 0, 16, 16, "#2a2218");
      for (let i = 0; i < 20; i++) px(g, (n() * 16) | 0, (n() * 16) | 0, 2, 1, n() < 0.5 ? "#32281c" : "#1e1810");
    } else if (type === G_FLOWER) {
      px(g, 0, 0, 16, 16, "#121c1a");
      for (let i = 0; i < 16; i++) px(g, (n() * 16) | 0, (n() * 16) | 0, 1, 1, "#1a2a24");
      const bloom = n() < 0.5 ? "#6a4a58" : "#4a5a4a";
      px(g, 5, 6, 2, 2, bloom);
      px(g, 10, 9, 2, 2, "#4a4860");
      px(g, 7, 11, 1, 1, bloom);
    } else if (type === G_WATER) {
      px(g, 0, 0, 16, 16, "#142030");
      px(g, 1, 1, 14, 14, "#1a2c40");
      px(g, 3, 4, 8, 1, "#2a4860");
      px(g, 6, 8, 6, 1, "#3a6080");
      px(g, 4, 11, 5, 1, "#243848");
    }
    return c;
  }

  function buildTiles() {
    const kinds = [G_GRASS, G_PATH, G_PLAZA, G_FADE, G_DIRT, G_FLOWER, G_WATER];
    assets.tiles = kinds.map((k) => {
      const vars = [];
      for (let i = 0; i < 4; i++) vars.push(makeTile(k, i, seedRand(k * 99 + i * 17 + 3)));
      return vars;
    });
  }

  function drawCrystalSprite() {
    const { c, g } = newCvs(48, 64);
    px(g, 10, 50, 28, 10, "#3a3a48");
    px(g, 8, 48, 32, 4, "#4a4a5a");
    px(g, 12, 52, 24, 2, "#2a2a34");
    g.fillStyle = "rgba(160, 230, 255, 0.25)";
    g.beginPath(); g.ellipse(24, 50, 16, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#9fe0f4";
    g.beginPath();
    g.moveTo(24, 4); g.lineTo(40, 28); g.lineTo(32, 50); g.lineTo(16, 50); g.lineTo(8, 28);
    g.closePath(); g.fill();
    g.fillStyle = "#d8f6ff";
    g.beginPath();
    g.moveTo(24, 4); g.lineTo(24, 50); g.lineTo(16, 50); g.lineTo(8, 28);
    g.closePath(); g.fill();
    g.fillStyle = "#5aa8c8";
    g.beginPath();
    g.moveTo(24, 4); g.lineTo(40, 28); g.lineTo(32, 50); g.lineTo(24, 50);
    g.closePath(); g.fill();
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.beginPath(); g.moveTo(20, 10); g.lineTo(24, 8); g.lineTo(22, 30); g.lineTo(16, 28); g.closePath(); g.fill();
    g.strokeStyle = "#2a3040";
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(24, 8); g.lineTo(20, 26); g.lineTo(26, 38); g.lineTo(18, 50); g.stroke();
    g.beginPath(); g.moveTo(20, 26); g.lineTo(12, 32); g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.55)";
    g.beginPath(); g.moveTo(25, 10); g.lineTo(21, 26); g.stroke();
    return c;
  }

  function drawEnemySprite(frame) {
    const { c, g } = newCvs(64, 56);
    const bob = (frame % 2) * 1;
    g.fillStyle = "rgba(0,0,0,0.4)";
    g.beginPath(); g.ellipse(32, 50, 20, 5, 0, 0, Math.PI * 2); g.fill();
    const y = 8 + bob;
    const fur = "#6a6a72", furD = "#3a3a42", furL = "#8a8a94", voidC = "#1a1a22";
    px(g, 12, y + 28, 8, 14, furD);
    px(g, 44, y + 28, 8, 14, furD);
    px(g, 12, y + 40, 8, 4, "#2a2a32");
    px(g, 44, y + 40, 8, 4, "#2a2a32");
    px(g, 16, y + 16, 32, 20, fur);
    px(g, 18, y + 18, 28, 10, furL);
    px(g, 20, y + 22, 16, 8, voidC);
    px(g, 24, y + 20, 2, 10, "#0c0c10");
    px(g, 30, y + 18, 1, 12, "#0c0c10");
    px(g, 20, y + 4, 22, 16, fur);
    px(g, 18, y + 8, 6, 8, furD);
    px(g, 40, y + 6, 10, 8, fur);
    px(g, 48, y + 8, 6, 4, furD);
    px(g, 20, y, 6, 8, furD);
    px(g, 34, y, 6, 8, furD);
    px(g, 22, y + 2, 3, 4, "#4a4a55");
    px(g, 26, y + 10, 4, 3, "#d8e8f0");
    px(g, 34, y + 10, 4, 3, "#d8e8f0");
    px(g, 27, y + 11, 2, 2, "#ffffff");
    px(g, 20, y + 32, 7, 12, fur);
    px(g, 36, y + 32, 7, 12, fur);
    px(g, 20, y + 42, 7, 3, "#2a2a32");
    px(g, 36, y + 42, 7, 3, "#2a2a32");
    px(g, 8, y + 20, 10, 4, furD);
    px(g, 4, y + 16, 8, 4, fur);
    return c;
  }

  function inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H; }

  function buildMap() {
    const rng = seedRand(2026);
    const ground = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(G_GRASS));
    const sol = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));
    const tileVar = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => (rng() * 4) | 0));

    const fill = (x, y, w, h, t) => {
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++)
          if (inBounds(xx, yy)) ground[yy][xx] = t;
    };
    const wall = (x, y, w, h) => {
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++)
          if (inBounds(xx, yy)) sol[yy][xx] = 1;
    };

    for (let x = 0; x < MAP_W; x++) { sol[0][x] = 1; sol[1][x] = 1; sol[MAP_H - 1][x] = 1; sol[MAP_H - 2][x] = 1; }
    for (let y = 0; y < MAP_H; y++) { sol[y][0] = 1; sol[y][1] = 1; sol[y][MAP_W - 1] = 1; sol[y][MAP_W - 2] = 1; }

    fill(6, 3, 8, 6, G_PLAZA);
    fill(8, 9, 4, 2, G_PLAZA);
    fill(12, 5, 3, 3, G_FADE);
    ground[6][11] = G_FADE;
    ground[7][11] = G_FADE;
    ground[8][12] = G_FADE;
    fill(9, 9, 3, 12, G_PATH);
    fill(3, 13, 14, 2, G_PATH);
    fill(4, 16, 3, 1, G_PATH);
    fill(14, 16, 3, 1, G_PATH);
    fill(7, 12, 2, 1, G_FLOWER);
    fill(11, 12, 2, 1, G_FLOWER);
    fill(7, 16, 2, 2, G_FLOWER);
    fill(11, 16, 2, 2, G_FLOWER);
    wall(3, 9, 4, 4);
    wall(13, 9, 4, 4);
    wall(4, 17, 3, 3);
    wall(13, 17, 3, 3);
    wall(2, 4, 3, 3);
    wall(7, 15, 1, 1);
    [[4, 8], [16, 8], [5, 20], [14, 20], [7, 21], [12, 21], [3, 21], [16, 3]].forEach(([x, y]) => {
      if (inBounds(x, y)) sol[y][x] = 2;
    });
    wall(8, 22, 5, 1);

    const objs = [
      { type: "crystal", x: 9.2, y: 5.1, footY: 6.6 },
      { type: "house", kind: "workshop", x: 3, y: 7.15, w: 4, h: 5.8, footY: 12.85 },
      { type: "house", kind: "bakery", x: 13, y: 7.15, w: 4, h: 5.8, footY: 12.85 },
      { type: "house", kind: "home", x: 4, y: 15.4, w: 3, h: 4.8, footY: 19.8 },
      { type: "house", kind: "home2", x: 13, y: 15.4, w: 3, h: 4.8, footY: 19.8 },
      { type: "house", kind: "shed", x: 2, y: 2.4, w: 3, h: 4.6, footY: 6.8 },
      { type: "well", x: 7.15, y: 14.15, footY: 15.9 },
      { type: "lantern", x: 7.2, y: 9.2, footY: 10 },
      { type: "lantern", x: 12.6, y: 9.2, footY: 10 },
      { type: "lantern", x: 8.1, y: 17.2, footY: 18 },
      { type: "lantern", x: 12.2, y: 17.2, footY: 18 },
      { type: "lantern", x: 8.2, y: 4.2, footY: 5 },
      { type: "lantern", x: 12.2, y: 4.2, footY: 5 },
      { type: "barrels", x: 6.1, y: 12.3, footY: 13.4 },
      { type: "barrels", x: 13.2, y: 12.3, footY: 13.4 },
      { type: "cart", x: 8.1, y: 21.1, footY: 22.3 }
    ];

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (sol[y][x] === 1 && (y <= 1 || y >= MAP_H - 2 || x <= 1 || x >= MAP_W - 2) && ground[y][x] === G_GRASS) {
          objs.push({ type: "tree", x, y: y - 1.4, footY: y + 0.9, edge: true });
        }
        if (sol[y][x] === 2) objs.push({ type: "tree", x, y: y - 1.4, footY: y + 0.9 });
      }
    }

    const lightList = [
      { x: 10.4 * TILE, y: 5.4 * TILE, r: 70, col: "160,230,255", a: 0.42, flicker: 0.08 },
      { x: 13.5 * TILE, y: 6.5 * TILE, r: 36, col: "180,180,190", a: 0.18, flicker: 0.12 },
      { x: 7.4 * TILE, y: 9.2 * TILE, r: 38, col: "255,180,90", a: 0.36, flicker: 0.15 },
      { x: 12.9 * TILE, y: 9.2 * TILE, r: 38, col: "255,180,90", a: 0.36, flicker: 0.16 },
      { x: 8.4 * TILE, y: 17.2 * TILE, r: 34, col: "255,180,90", a: 0.32, flicker: 0.14 },
      { x: 12.5 * TILE, y: 17.2 * TILE, r: 34, col: "255,180,90", a: 0.32, flicker: 0.13 },
      { x: 8.5 * TILE, y: 4.2 * TILE, r: 32, col: "255,190,100", a: 0.3, flicker: 0.15 },
      { x: 12.5 * TILE, y: 4.2 * TILE, r: 32, col: "255,190,100", a: 0.3, flicker: 0.14 },
      { x: 5 * TILE, y: 10.6 * TILE, r: 30, col: "255,170,80", a: 0.3, flicker: 0.1 },
      { x: 15 * TILE, y: 10.6 * TILE, r: 30, col: "255,170,80", a: 0.3, flicker: 0.1 },
      { x: 5.5 * TILE, y: 17.4 * TILE, r: 22, col: "255,160,80", a: 0.22, flicker: 0.1 },
      { x: 14.5 * TILE, y: 17.4 * TILE, r: 22, col: "255,160,80", a: 0.22, flicker: 0.1 }
    ];

    const npcList = [
      { id: "sera", name: "セラ", who: "sera", x: 8.1 * TILE, y: 6.4 * TILE, dir: 2, idle: true },
      { id: "luca", name: "ルカ", who: "luca", x: 11.5 * TILE, y: 14.5 * TILE, dir: 0, idle: true },
      { id: "noah", name: "ノア", who: "noah", x: 12.3 * TILE, y: 7.5 * TILE, dir: 1, idle: true },
      { id: "maloi", name: "マロイ", who: "maloi", x: 5.2 * TILE, y: 13.15 * TILE, dir: 0, idle: true },
      { id: "ena", name: "エナ", who: "ena", x: 14.3 * TILE, y: 13.15 * TILE, dir: 1, idle: true }
    ];

    return { ground, sol, tileVar, objs, lightList, npcList };
  }

  function isSolidAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (!inBounds(tx, ty)) return true;
    if (solids[ty][tx]) return true;
    for (const n of npcs) {
      if (Math.abs(px - (n.x + 8)) < 7 && Math.abs(py - (n.y + 20)) < 6) return true;
    }
    return false;
  }

  function drawTree(g, sx, sy, scale) {
    const x = sx, y = sy;
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(x + 8 * scale, y + 30 * scale, 7 * scale, 2 * scale, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a1c14";
    g.fillRect(x + 6 * scale, y + 16 * scale, 4 * scale, 14 * scale);
    g.fillStyle = "#0e1c18";
    g.beginPath(); g.arc(x + 8 * scale, y + 12 * scale, 11 * scale, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#163028";
    g.beginPath(); g.arc(x + 5 * scale, y + 10 * scale, 7 * scale, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1a3a30";
    g.beginPath(); g.arc(x + 10 * scale, y + 8 * scale, 6 * scale, 0, Math.PI * 2); g.fill();
  }

  function drawHouse(g, obj, ox, oy, sc) {
    const x = obj.x * TILE * sc - ox;
    const y = obj.y * TILE * sc - oy;
    const w = obj.w * TILE * sc;
    const h = obj.h * TILE * sc;
    const wallH = h * 0.52;
    const roofH = h * 0.48;
    const kind = obj.kind;
    const wallCol = kind === "workshop" ? "#3a2a22" : kind === "bakery" ? "#4a3028" : kind === "shed" ? "#2e261e" : "#352820";
    const roofCol = kind === "bakery" ? "#3a1c1c" : kind === "workshop" ? "#2a2a22" : "#1c2430";
    const wallY = y + roofH * 0.55;

    g.fillStyle = "rgba(0,0,0,0.28)";
    g.fillRect(x + 4, wallY + wallH - 2, w, 6);
    g.fillStyle = roofCol;
    g.beginPath();
    g.moveTo(x - 4, wallY + 6);
    g.lineTo(x + w / 2, y);
    g.lineTo(x + w + 4, wallY + 6);
    g.lineTo(x + w - 2, wallY + 14);
    g.lineTo(x + 2, wallY + 14);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.beginPath();
    g.moveTo(x + w / 2, y);
    g.lineTo(x + w + 4, wallY + 6);
    g.lineTo(x + w / 2, wallY + 4);
    g.closePath();
    g.fill();
    g.fillStyle = wallCol;
    g.fillRect(x, wallY + 10, w, wallH);
    g.fillStyle = "rgba(0,0,0,0.2)";
    g.fillRect(x, wallY + 10 + wallH - 6, w, 6);

    const dx = x + w * 0.38;
    const dw = w * 0.24;
    const dh = wallH * 0.55;
    const dy = wallY + 10 + wallH - dh;
    g.fillStyle = "#1a120e";
    g.fillRect(dx, dy, dw, dh);
    g.fillStyle = "#c9a24a";
    g.fillRect(dx + dw - 4, dy + dh * 0.45, 2, 2);

    const drawWin = (wx, wy, ww, wh) => {
      g.fillStyle = "#1a1410";
      g.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
      g.fillStyle = "#f0c060";
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = "rgba(255,230,160,0.7)";
      g.fillRect(wx, wy, ww * 0.4, wh * 0.35);
      g.strokeStyle = "#2a2018";
      g.strokeRect(wx, wy, ww, wh);
      g.beginPath();
      g.moveTo(wx + ww / 2, wy);
      g.lineTo(wx + ww / 2, wy + wh);
      g.stroke();
    };
    drawWin(x + w * 0.12, wallY + 10 + wallH * 0.22, w * 0.18, wallH * 0.28);
    drawWin(x + w * 0.70, wallY + 10 + wallH * 0.22, w * 0.18, wallH * 0.28);

    if (kind === "workshop" || kind === "bakery") {
      g.fillStyle = "#2a2014";
      g.fillRect(x + w * 0.3, wallY + 6, w * 0.4, 10);
      g.fillStyle = "#e0c073";
      g.font = "bold " + Math.max(8, 7 * sc / 3) + "px \"Zen Kaku Gothic New\", sans-serif";
      g.textAlign = "center";
      g.fillText(kind === "workshop" ? "工房" : "パン", x + w * 0.5, wallY + 14);
    }
  }

  function drawWell(g, obj, ox, oy, sc) {
    const x = obj.x * TILE * sc - ox;
    const y = obj.y * TILE * sc - oy;
    const s = sc;
    const cx = x + 10 * s, cy = y + 14 * s;
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.ellipse(cx, cy + 6 * s, 9 * s, 3 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#3a3a48";
    g.beginPath(); g.ellipse(cx, cy, 9 * s, 5 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a2a36";
    g.beginPath(); g.ellipse(cx, cy, 6.5 * s, 3.4 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#0e1824";
    g.beginPath(); g.ellipse(cx, cy, 5 * s, 2.5 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1a3048";
    g.beginPath(); g.ellipse(cx - 0.6 * s, cy - 0.4 * s, 2.2 * s, 1 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a2018";
    g.fillRect(cx - 7 * s, y + 2 * s, 2 * s, 11 * s);
    g.fillRect(cx + 5 * s, y + 2 * s, 2 * s, 11 * s);
    g.fillStyle = "#3a2a1c";
    g.fillRect(cx - 7 * s, y + 2 * s, 14 * s, 2 * s);
  }

  function drawLantern(g, obj, ox, oy, sc) {
    const x = obj.x * TILE * sc - ox;
    const y = obj.y * TILE * sc - oy;
    const s = sc;
    g.fillStyle = "#2a2420";
    g.fillRect(x + 6 * s, y + 8 * s, 2 * s, 12 * s);
    g.fillStyle = "#3a3020";
    g.fillRect(x + 3 * s, y + 2 * s, 8 * s, 8 * s);
    g.fillStyle = "#f0c060";
    g.fillRect(x + 4 * s, y + 3 * s, 6 * s, 6 * s);
    g.fillStyle = "rgba(255, 210, 120, 0.35)";
    g.beginPath(); g.arc(x + 7 * s, y + 6 * s, 7 * s, 0, Math.PI * 2); g.fill();
  }

  function drawBarrels(g, obj, ox, oy, sc) {
    const x = obj.x * TILE * sc - ox;
    const y = obj.y * TILE * sc - oy;
    const s = sc;
    const barrel = (bx, by) => {
      g.fillStyle = "#4a3828";
      g.fillRect(bx, by, 8 * s, 10 * s);
      g.fillStyle = "#2a2018";
      g.fillRect(bx, by + 3 * s, 8 * s, 1 * s);
      g.fillRect(bx, by + 7 * s, 8 * s, 1 * s);
      g.fillStyle = "#6a5038";
      g.fillRect(bx + s, by + s, 2 * s, 2 * s);
    };
    barrel(x, y + 4 * s);
    barrel(x + 9 * s, y + 2 * s);
  }

  function drawCart(g, obj, ox, oy, sc) {
    const x = obj.x * TILE * sc - ox;
    const y = obj.y * TILE * sc - oy;
    const s = sc;
    g.fillStyle = "#3a2a1c";
    g.fillRect(x, y + 4 * s, 28 * s, 10 * s);
    g.fillStyle = "#2a1c14";
    g.fillRect(x + 2 * s, y, 24 * s, 6 * s);
    g.fillStyle = "#1a1410";
    g.beginPath(); g.arc(x + 6 * s, y + 14 * s, 4 * s, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + 22 * s, y + 14 * s, 4 * s, 0, Math.PI * 2); g.fill();
  }

  function emit(pt) { particles.push(pt); }
  function updateParticles(dt) {
    for (const pt of particles) {
      pt.t += dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.g) pt.vy += pt.g * dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].t >= particles[i].life) particles.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].t += dt;
      floaters[i].y -= 22 * dt;
      if (floaters[i].t > 0.85) floaters.splice(i, 1);
    }
  }
  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color, t: 0 });
  }

  function bindInput() {
    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      keys.add(e.key);
      if (e.key === "z" || e.key === "Z" || e.key === "Enter" || e.key === " ") pressAction();
      if (e.key === "x" || e.key === "X" || e.key === "Escape") pressCancel();
    });
    window.addEventListener("keyup", (e) => keys.delete(e.key));

    const st = $("stick");
    const setStickPos = (cx, cy) => {
      const r = st.getBoundingClientRect();
      const mx = cx - (r.left + r.width / 2);
      const my = cy - (r.top + r.height / 2);
      const mag = Math.hypot(mx, my);
      const max = r.width * 0.42;
      const k = mag > max ? max / mag : 1;
      stick.x = (mx * k) / max;
      stick.y = (my * k) / max;
      if (Math.abs(stick.x) < 0.2) stick.x = 0;
      if (Math.abs(stick.y) < 0.2) stick.y = 0;
      $("stick-knob").style.transform = "translate(" + (stick.x * max) + "px, " + (stick.y * max) + "px)";
    };
    const endStick = () => {
      stick.x = stick.y = 0;
      stick.active = false;
      stick.id = null;
      $("stick-knob").style.transform = "translate(0,0)";
    };
    st.addEventListener("pointerdown", (e) => { st.setPointerCapture(e.pointerId); stick.active = true; stick.id = e.pointerId; setStickPos(e.clientX, e.clientY); });
    st.addEventListener("pointermove", (e) => { if (stick.active && e.pointerId === stick.id) setStickPos(e.clientX, e.clientY); });
    st.addEventListener("pointerup", endStick);
    st.addEventListener("pointercancel", endStick);

    $("btn-action").addEventListener("click", (e) => { e.preventDefault(); pressAction(); });
    $("btn-start").addEventListener("click", startGame);
    $("btn-title").addEventListener("click", () => fadeTo(500, () => showTitle()));
    $("btn-retry").addEventListener("click", () => {
      $("gameover").classList.add("hidden");
      beginBattle();
    });
    $("btn-mute").addEventListener("click", () => { ensureAudio(); setMuted(!muted); });

    canvas.addEventListener("pointerdown", (e) => {
      if (mode === "dialogue" || mode === "opening") { pressAction(); return; }
      if (mode !== "town") return;
      const r = canvas.getBoundingClientRect();
      const wx = cam.x + (e.clientX - r.left) / viewScale;
      const wy = cam.y + (e.clientY - r.top) / viewScale;
      player.target = { x: wx, y: wy };
    });
    $("dialogue").addEventListener("pointerdown", (e) => { e.stopPropagation(); pressAction(); });
    window.addEventListener("resize", resize);
  }

  function moveAxis() {
    let x = stick.x, y = stick.y;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) x = -1;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) x = 1;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) y = -1;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) y = 1;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }

  const LINES = {
    opening: [
      { name: "", text: "浮遊大陸エルディア。\n人々は、クリスタルの光とともに生きてきた。" },
      { name: "", text: "だが近ごろ、その光は少しずつ弱まっている。\n各地で「色褪せ」と呼ばれる異変が、静かに広がりはじめていた。" },
      { name: "", text: "辺境の町、リュミエ。\n旅の白魔道士スンフィは、夜のうちにこの町を発とうとしていた——" },
      { name: "", text: "……そのとき、町の守りのクリスタルが、ひび割れた。" },
      { name: "セラ", who: "sera", text: "……はあ！？　おい、見てくれ！　ひび、入ってるぞ！？" },
      { name: "セラ", who: "sera", text: "くそ、昼間は何事もなかったのに……！\n町の連中、今すぐ下がれ！" },
      { name: "セラ", who: "sera", text: "……あんた、旅人か。見てないで手を貸せ。\n怪我人が出る前に、周囲を見て回ってくれ。" },
      { name: "スンフィ", who: "sunfi", text: "……分かった。光が、泣いているみたいだ。" }
    ],
    sera: [
      { name: "セラ", who: "sera", text: "俺はセラ。この町の見張りだ。\n口が悪いってよく言われるが、どうだっていい。" },
      { name: "セラ", who: "sera", text: "この町は俺が守る。クリスタルがどうなろうと、それは変えねえ。" },
      { name: "セラ", who: "sera", text: "……あんた、白魔道士らしいな。手が空いてるなら、色の抜けた地面のほうも見てくれ。変な気配がする。" }
    ],
    sera2: [
      { name: "セラ", who: "sera", text: "じっとしてられるか。何か出てきたら、俺が先に斬る。" }
    ],
    luca: [
      { name: "ルカ", who: "luca", text: "やあ、怖い顔しないで。僕はルカ。弓をちょっとばかりね。" },
      { name: "ルカ", who: "luca", text: "夜はすぐに明けるよ。……たぶんね。" },
      { name: "ルカ", who: "luca", text: "セラはああ見えて、一人で全部を背負おうとするんだ。放っておけないだろ。" }
    ],
    luca2: [
      { name: "ルカ", who: "luca", text: "笑顔は、癖なんだ。……いや、なんでもない。行こうか。" }
    ],
    noah: [
      { name: "ノア", who: "noah", text: "通りすがりの魔導士よ。ノアと呼んで。\n余計な心配は結構。" },
      { name: "ノア", who: "noah", text: "色褪せは、ただの病気じゃない。光が足りなくなれば、草も、記憶も、薄くなる。" },
      { name: "ノア", who: "noah", text: "……あなた。白魔法の気配が、普通じゃないわね。\nま、今は借りられる手は借りる。あちらの褪せた地面を見ておきなさい。" }
    ],
    noah2: [
      { name: "ノア", who: "noah", text: "解析は終わっている。あとは、出てくるのを待つだけよ。" }
    ],
    maloi: [
      { name: "マロイ", who: "maloi", text: "俺はマロイ。採集と細工が商売でな。今は道具を直している。" },
      { name: "マロイ", who: "maloi", text: "こんな夜は、むやみに山へは入らないことだ。落ち着いたら、お前さんにも仕事を頼むかもしれん。" }
    ],
    maloi2: [
      { name: "マロイ", who: "maloi", text: "工房は開いている。またいつでも来い。" }
    ],
    ena: [
      { name: "エナ", who: "ena", text: "あたしはエナ。この通りでパンを焼いてるの。" },
      { name: "エナ", who: "ena", text: "夜なのに、窓の色がどこか薄い気がする。……気のせいだといいんだけど。" }
    ],
    ena2: [
      { name: "エナ", who: "ena", text: "騒ぎが収まったら、焼き立てを渡すわ。今はまだ、窯の番をしてる。" }
    ],
    fadeEarly: [
      { name: "", text: "地面の色が、薄く沈んでいる。触れると、指先の温もりまで薄くなる気がした。" }
    ],
    gate: [
      { name: "スンフィ", who: "sunfi", text: "……今は、まだ出せない。" }
    ],
    prebattle: [
      { name: "", text: "褪せた地面が、ごく小さく、息をした。" },
      { name: "セラ", who: "sera", text: "ちっ、出てきたか……色の抜けた獣だと！？" },
      { name: "ルカ", who: "luca", text: "笑顔でいこうか。……無理か。" },
      { name: "ノア", who: "noah", text: "名前をつける暇はないわ。退けて。" },
      { name: "スンフィ", who: "sunfi", text: "——私が、光を持つ。" }
    ],
    postbattle: [
      { name: "セラ", who: "sera", text: "……ふう。助かった、とは言いたくねえがな。悪くない。" },
      { name: "ルカ", who: "luca", text: "ほら、夜はまだ終わらない。でも、まずは息を吐こう。" },
      { name: "ノア", who: "noah", text: "この獣は、色褪せそのものだわ。クリスタルのひびと、無関係とは思えない。" },
      { name: "スンフィ", who: "sunfi", text: "……まだ、光は残っている。" }
    ]
  };

  function startDialogue(lines, after) {
    dlgQueue = lines;
    dlgIndex = 0;
    dlgAfter = after || null;
    if (mode !== "opening") mode = "dialogue";
    if (mode !== "opening") $("controls").classList.add("hidden");
    $("dialogue").classList.remove("hidden");
    beginLine();
  }

  function beginLine() {
    const line = dlgQueue[dlgIndex];
    dlgFull = line.text;
    dlgShown = "";
    dlgTimer = 0;
    dlgDone = false;
    const nameEl = $("dlg-name");
    $("dlg-next").classList.add("hidden");
    if (line.name) {
      nameEl.textContent = line.name;
      nameEl.className = "dlg-name c-" + (line.who || "");
      nameEl.classList.remove("hidden");
    } else {
      nameEl.classList.add("hidden");
    }
    $("dlg-text").textContent = "";
  }

  function advanceDialogue() {
    if (!dlgDone) {
      dlgShown = dlgFull;
      dlgDone = true;
      $("dlg-text").textContent = dlgShown;
      $("dlg-next").classList.remove("hidden");
      return;
    }
    dlgIndex++;
    if (dlgIndex >= dlgQueue.length) {
      endDialogue();
      return;
    }
    sfx.ui();
    beginLine();
  }

  function endDialogue() {
    $("dialogue").classList.add("hidden");
    const cb = dlgAfter;
    dlgAfter = null;
    dlgQueue = [];
    if (mode === "opening") {
      if (cb) cb();
      return;
    }
    mode = "town";
    $("controls").classList.remove("hidden");
    if (cb) cb();
    refreshObjective();
  }

  function pressAction() {
    if (mode === "title") return;
    if (mode === "dialogue" || mode === "opening") {
      advanceDialogue();
      return;
    }
    if (mode === "town") tryInteract();
  }
  function pressCancel() {
    if (mode === "battle" && battle && battle.menu === "skills") {
      battle.menu = "main";
      renderCommands();
    }
  }

  function nearestInteract() {
    const px = player.x + 8, py = player.y + 20;
    let best = null, bestD = 30;
    for (const n of npcs) {
      const d = Math.hypot(px - (n.x + 8), py - (n.y + 20));
      if (d < bestD) { bestD = d; best = { kind: "npc", npc: n }; }
    }
    const fx = 13.2 * TILE, fy = 6.6 * TILE;
    const df = Math.hypot(px - fx, py - fy);
    if (df < 28 && df < bestD) { best = { kind: "fade" }; bestD = df; }
    const gx = 10 * TILE, gy = 21.5 * TILE;
    const dg = Math.hypot(px - gx, py - gy);
    if (dg < 20 && dg < bestD) best = { kind: "gate" };
    return best;
  }

  function tryInteract() {
    const t = nearestInteract();
    if (!t) return;
    sfx.talk();
    if (t.kind === "npc") {
      const id = t.npc.id;
      const first = !talked[id];
      talked[id] = true;
      const key = first ? id : id + "2";
      startDialogue(LINES[key] || LINES[id]);
      t.npc.dir = player.x > t.npc.x ? 2 : (player.x < t.npc.x - 4 ? 1 : (player.y > t.npc.y ? 0 : 3));
    } else if (t.kind === "fade") {
      const ready = talked.sera && talked.luca && talked.noah;
      if (ready && !battleStarted) {
        battleStarted = true;
        startDialogue(LINES.prebattle, () => fadeTo(600, () => beginBattle()));
      } else {
        startDialogue(LINES.fadeEarly);
      }
    } else if (t.kind === "gate") {
      startDialogue(LINES.gate);
    }
  }

  function refreshObjective() {
    const n = [talked.sera, talked.luca, talked.noah].filter(Boolean).length;
    const el = $("objective");
    if (mode !== "town") { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    if (n < 3) el.textContent = "仲間たちに話を聞こう　" + n + " / 3";
    else if (!battleStarted) el.textContent = "色褪せた地面を調べよう";
    else el.classList.add("hidden");
  }

  function updateActionButton() {
    const btn = $("btn-action");
    if (mode !== "town") return;
    const t = nearestInteract();
    if (!t) {
      btn.classList.add("disabled");
      btn.textContent = "話す";
    } else {
      btn.classList.remove("disabled");
      btn.textContent = t.kind === "npc" ? "話す" : "調べる";
    }
  }

  const SKILLS = {
    sunfi: [
      { id: "cura", name: "ケアルガ", strong: true, kind: "healAll", pow: [92, 110] },
      { id: "holy", name: "ホーリー", strong: true, kind: "dmg", pow: [108, 128] },
      { id: "veil", name: "守護の光", strong: true, kind: "veil" }
    ],
    sera: [
      { id: "slash", name: "斬撃", kind: "dmg", pow: [32, 42] },
      { id: "reckless", name: "捨て身斬り", kind: "reckless", pow: [58, 74], self: 12 },
      { id: "guard", name: "盾になれ", kind: "cover" }
    ],
    luca: [
      { id: "shot", name: "狙撃", kind: "dmg", pow: [28, 38] },
      { id: "double", name: "連射", kind: "double", pow: [20, 26] },
      { id: "cheer", name: "活気づける", kind: "buff" }
    ],
    noah: [
      { id: "fire", name: "ファイア", kind: "dmg", pow: [38, 50] },
      { id: "blizzard", name: "ブリザド", kind: "blizzard", pow: [30, 40] },
      { id: "analyze", name: "解析", kind: "analyze" }
    ]
  };

  function partyTemplate() {
    return [
      { id: "sunfi", name: "スンフィ", who: "sunfi", hp: 220, max: 220, alive: true, atkMod: 1, veil: 0, cover: false },
      { id: "sera", name: "セラ", who: "sera", hp: 180, max: 180, alive: true, atkMod: 1, veil: 0, cover: false },
      { id: "luca", name: "ルカ", who: "luca", hp: 150, max: 150, alive: true, atkMod: 1, veil: 0, cover: false },
      { id: "noah", name: "ノア", who: "noah", hp: 140, max: 140, alive: true, atkMod: 1, veil: 0, cover: false }
    ];
  }

  function beginBattle() {
    $("ending").classList.add("hidden");
    $("gameover").classList.add("hidden");
    $("dialogue").classList.add("hidden");
    $("controls").classList.add("hidden");
    $("objective").classList.add("hidden");
    $("screen-title").classList.add("hidden");
    $("battle-ui").classList.remove("hidden");
    mode = "battle";
    battle = {
      party: partyTemplate(),
      enemy: { name: "色褪せの獣", hp: 320, max: 320, atkMod: 1, weak: 1, freeze: 0 },
      turn: 0,
      queue: ["sunfi", "sera", "luca", "noah", "enemy"],
      menu: "main",
      anim: null,
      busy: false,
      t: 0,
      shake: 0,
      flash: 0
    };
    $("enemy-name").textContent = battle.enemy.name;
    renderPartyHud();
    updateEnemyHud();
    setBattleLog("色褪せの獣 が現れた！");
    battle.busy = true;
    setTimeout(() => { battle.busy = false; nextTurn(); }, 700);
  }

  function renderPartyHud() {
    const el = $("party-hud");
    const cur = battle ? battle.queue[battle.turn] : "";
    el.innerHTML = battle.party.map((p) => {
      const pct = clamp(p.hp / p.max, 0, 1);
      const active = cur === p.id && !battle.busy && p.alive ? " active" : "";
      const down = p.alive ? "" : " down";
      const low = pct < 0.35 ? " low" : "";
      return "<div class=\"ph" + active + down + "\"><div class=\"ph-top\"><span>" + p.name + "</span><span class=\"ph-hp\">" + Math.max(0, p.hp) + " / " + p.max + "</span></div><div class=\"hp-bar\"><i class=\"" + low + "\" style=\"transform:scaleX(" + pct + ")\"></i></div></div>";
    }).join("");
  }

  function updateEnemyHud() {
    const e = battle.enemy;
    $("enemy-hp").style.transform = "scaleX(" + clamp(e.hp / e.max, 0, 1) + ")";
    $("enemy-hp-text").textContent = Math.max(0, e.hp) + " / " + e.max;
  }

  function setBattleLog(t) { $("battle-log").textContent = t; }

  function renderCommands() {
    const box = $("commands");
    if (!battle || battle.busy) { box.innerHTML = ""; return; }
    const actor = currentActor();
    if (!actor || actor === "enemy") { box.innerHTML = ""; return; }
    const p = battle.party.find((x) => x.id === actor);
    if (battle.menu === "main") {
      box.innerHTML = "<button type=\"button\" data-cmd=\"fight\">たたかう</button><button type=\"button\" data-cmd=\"skills\">わざ</button><button type=\"button\" data-cmd=\"defend\">ぼうぎょ</button><button type=\"button\" data-cmd=\"wait\">様子を見る</button>";
    } else {
      const list = SKILLS[p.id].map((s) =>
        "<button type=\"button\" class=\"" + (s.strong ? "skill-strong" : "") + "\" data-skill=\"" + s.id + "\">" + s.name + "</button>"
      ).join("");
      box.innerHTML = list + "<button type=\"button\" class=\"back\" data-cmd=\"back\">もどる</button>";
    }
    box.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        sfx.ui();
        if (b.dataset.cmd === "skills") { battle.menu = "skills"; renderCommands(); }
        else if (b.dataset.cmd === "back") { battle.menu = "main"; renderCommands(); }
        else if (b.dataset.cmd === "fight") useDefaultAttack(p);
        else if (b.dataset.cmd === "defend") doDefend(p);
        else if (b.dataset.cmd === "wait") doWait(p);
        else if (b.dataset.skill) useSkill(p, SKILLS[p.id].find((s) => s.id === b.dataset.skill));
      });
    });
  }

  function currentActor() { return battle ? battle.queue[battle.turn] : null; }

  function nextTurn() {
    if (!battle) return;
    if (battle.enemy.hp <= 0) return onWin();
    if (battle.party.every((p) => !p.alive)) return onLose();
    let guard = 0;
    while (guard++ < 10) {
      const id = battle.queue[battle.turn];
      if (id === "enemy") { startEnemyTurn(); return; }
      const p = battle.party.find((x) => x.id === id);
      if (p && p.alive) {
        battle.menu = "main";
        battle.busy = false;
        setBattleLog(p.name + " のばん");
        renderPartyHud();
        renderCommands();
        return;
      }
      battle.turn = (battle.turn + 1) % battle.queue.length;
    }
  }

  function afterAction() {
    battle.turn = (battle.turn + 1) % battle.queue.length;
    battle.menu = "main";
    renderPartyHud();
    updateEnemyHud();
    renderCommands();
    setTimeout(() => nextTurn(), 420);
  }

  function dmgToEnemy(base, actor) {
    return Math.max(1, Math.round(base * (actor.atkMod || 1) * (battle.enemy.weak || 1)));
  }

  function applyEnemyDamage(amount, actor) {
    const d = dmgToEnemy(amount, actor);
    battle.enemy.hp = Math.max(0, battle.enemy.hp - d);
    battle.shake = 10;
    addFloater(cssW * 0.5, cssH * 0.28, d, actor.id === "sunfi" ? "#fff4c8" : "#ffe8e0");
    updateEnemyHud();
    return d;
  }

  function applyPartyDamage(target, amount) {
    let t = target;
    const cover = battle.party.find((p) => p.cover && p.alive);
    if (cover && t.id !== cover.id) {
      t = cover;
      cover.cover = false;
      setBattleLog(cover.name + " が攻撃を引き受けた！");
    }
    let d = Math.round(amount * (t.veil > 0 ? 0.55 : 1) * (battle.enemy.atkMod || 1));
    d = Math.max(1, d);
    t.hp = Math.max(0, t.hp - d);
    if (t.hp <= 0) { t.alive = false; t.hp = 0; }
    addFloater(cssW * (0.22 + battle.party.indexOf(t) * 0.2), cssH * 0.55, d, "#ff9090");
    renderPartyHud();
    return { t, d };
  }

  function useDefaultAttack(p) { useSkill(p, SKILLS[p.id][0]); }
  function doDefend(p) {
    battle.busy = true;
    $("commands").innerHTML = "";
    p.veil = Math.max(p.veil, 1);
    setBattleLog(p.name + " は身を守っている……");
    sfx.ui();
    setTimeout(() => { battle.busy = false; afterAction(); }, 600);
  }
  function doWait(p) {
    battle.busy = true;
    $("commands").innerHTML = "";
    setBattleLog(p.name + " は間合いを計った。");
    setTimeout(() => { battle.busy = false; afterAction(); }, 500);
  }

  function useSkill(p, skill) {
    if (!skill) return;
    battle.busy = true;
    battle.anim = { who: p.id, skill: skill.id, t: 0, life: skill.id === "holy" || skill.id === "cura" ? 1.05 : 0.55 };
    $("commands").innerHTML = "";
    let log = "";

    if (skill.kind === "healAll") {
      sfx.heal();
      const v = irand(skill.pow[0], skill.pow[1]);
      battle.party.forEach((q) => {
        if (!q.alive && q.hp <= 0) return;
        q.alive = true;
        q.hp = Math.min(q.max, q.hp + v);
        addFloater(cssW * (0.22 + battle.party.indexOf(q) * 0.2), cssH * 0.58, "+" + v, "#b8f0a0");
      });
      log = p.name + " の " + skill.name + "！　全員の傷が、ほとんど閉じた！";
      battle.flash = 0.5;
    } else if (skill.kind === "dmg") {
      if (skill.id === "holy") sfx.holy();
      else if (skill.id === "fire") sfx.fire();
      else if (p.id === "sera") sfx.sword();
      else if (p.id === "luca") sfx.arrow();
      else sfx.hit();
      const d = applyEnemyDamage(irand(skill.pow[0], skill.pow[1]), p);
      log = p.name + " の " + skill.name + "！　" + d + " のダメージ！";
      if (skill.id === "holy") {
        log = p.name + " の " + skill.name + "！！　聖なる光が獣を貫いた！　" + d + " のダメージ！";
        battle.flash = 0.7;
      }
      battle.enemy.weak = 1;
    } else if (skill.kind === "reckless") {
      sfx.sword();
      const d = applyEnemyDamage(irand(skill.pow[0], skill.pow[1]), p);
      p.hp = Math.max(1, p.hp - skill.self);
      addFloater(cssW * 0.28, cssH * 0.58, "-" + skill.self, "#ffb0a0");
      log = p.name + " の捨て身斬り！　" + d + " のダメージ！　反動で " + skill.self + " の痛み！";
      battle.enemy.weak = 1;
    } else if (skill.kind === "cover") {
      p.cover = true;
      log = p.name + " は仲間の盾になろうと、前に出た！";
      sfx.ui();
    } else if (skill.kind === "double") {
      sfx.arrow();
      const d1 = applyEnemyDamage(irand(skill.pow[0], skill.pow[1]), p);
      const d2 = applyEnemyDamage(irand(skill.pow[0], skill.pow[1]), p);
      log = p.name + " の連射！　" + d1 + " と " + d2 + " のダメージ！";
      battle.enemy.weak = 1;
    } else if (skill.kind === "buff") {
      sfx.chime();
      battle.party.forEach((q) => { if (q.alive) q.atkMod = 1.3; });
      log = p.name + " が声をかけて、みんなの手が軽くなった！";
    } else if (skill.kind === "blizzard") {
      sfx.ice();
      const d = applyEnemyDamage(irand(skill.pow[0], skill.pow[1]), p);
      battle.enemy.atkMod = 0.75;
      battle.enemy.freeze = 2;
      log = p.name + " のブリザド！　" + d + " のダメージ！　獣の動きが鈍った！";
      battle.enemy.weak = 1;
    } else if (skill.kind === "analyze") {
      sfx.chime();
      battle.enemy.weak = 1.4;
      log = p.name + " の解析！　聖なる光がよく通る、と見抜いた！";
    } else if (skill.kind === "veil") {
      sfx.heal();
      battle.party.forEach((q) => { if (q.alive) q.veil = 2; });
      log = p.name + " の守護の光！　柔らかな幕が仲間を包んだ！";
      battle.flash = 0.4;
    }

    setBattleLog(log);
    renderPartyHud();
    if (navigator.vibrate && skill.id === "holy") navigator.vibrate(40);

    const wait = battle.anim.life * 1000 + 280;
    setTimeout(() => {
      battle.anim = null;
      if (battle.enemy.hp <= 0) return onWin();
      battle.busy = false;
      afterAction();
    }, wait);
  }

  function startEnemyTurn() {
    battle.busy = true;
    $("commands").innerHTML = "";
    renderPartyHud();
    const alive = battle.party.filter((p) => p.alive);
    if (!alive.length) return onLose();
    const rollMove = Math.random();
    let move, target;
    if (rollMove < 0.45) { move = "claw"; target = alive[(Math.random() * alive.length) | 0]; }
    else if (rollMove < 0.75) { move = "breath"; target = alive[(Math.random() * alive.length) | 0]; }
    else { move = "roar"; }
    battle.anim = { who: "enemy", skill: move, t: 0, life: 0.7 };
    setTimeout(() => {
      sfx.hurt();
      battle.shake = 8;
      if (move === "claw") {
        const r = applyPartyDamage(target, irand(28, 38));
        setBattleLog("色褪せの獣の 爪撃！　" + r.t.name + " は " + r.d + " のダメージ！");
      } else if (move === "breath") {
        const r = applyPartyDamage(target, irand(36, 46));
        setBattleLog("色褪せの獣の 褪色の息！　" + r.t.name + " は " + r.d + " のダメージ！");
      } else {
        const parts = [];
        alive.forEach((t) => {
          const r = applyPartyDamage(t, irand(12, 18));
          parts.push(r.t.name + " に " + r.d);
        });
        setBattleLog("色褪せの獣の 咆哮！　" + parts.join("、") + "！");
      }
      battle.party.forEach((p) => { if (p.veil > 0) p.veil--; if (p.atkMod > 1) p.atkMod = 1; });
      if (battle.enemy.freeze > 0) {
        battle.enemy.freeze--;
        if (battle.enemy.freeze <= 0) battle.enemy.atkMod = 1;
      }
      renderPartyHud();
    }, 350);

    setTimeout(() => {
      battle.anim = null;
      if (battle.party.every((p) => !p.alive)) return onLose();
      battle.busy = false;
      afterAction();
    }, 1100);
  }

  function onWin() {
    battle.busy = true;
    $("commands").innerHTML = "";
    setBattleLog("色褪せの獣を退けた！");
    sfx.win();
    setTimeout(() => {
      $("battle-ui").classList.add("hidden");
      fadeTo(700, () => {
        mode = "dialogue";
        startDialogue(LINES.postbattle, () => showEnding());
      });
    }, 1100);
  }

  function onLose() {
    battle.busy = true;
    $("commands").innerHTML = "";
    sfx.lose();
    setBattleLog("パーティは力尽きた……");
    setTimeout(() => { $("gameover").classList.remove("hidden"); }, 800);
  }

  function showEnding() {
    mode = "ending";
    $("dialogue").classList.add("hidden");
    $("controls").classList.add("hidden");
    $("objective").classList.add("hidden");
    $("ending-body").textContent = "夜はまだ明けない。町の光は、わずかに残っている。";
    $("ending").classList.remove("hidden");
  }

  function showTitle() {
    mode = "title";
    $("loading").classList.add("hidden");
    $("screen-title").classList.remove("hidden");
    $("dialogue").classList.add("hidden");
    $("battle-ui").classList.add("hidden");
    $("ending").classList.add("hidden");
    $("gameover").classList.add("hidden");
    $("controls").classList.add("hidden");
    $("objective").classList.add("hidden");
    resetWorld(false);
  }

  function startGame() {
    ensureAudio();
    sfx.confirm();
    fadeTo(700, () => {
      $("screen-title").classList.add("hidden");
      resetWorld(true);
      mode = "opening";
      openingState = { phase: 0, t: 0, cracked: false };
      startDialogue(LINES.opening, () => {
        fadeTo(600, () => {
          mode = "town";
          player.x = 9.6 * TILE;
          player.y = 18.4 * TILE;
          player.dir = 3;
          locCard = { text: "辺境の町　リュミエ", t: 2.8 };
          $("controls").classList.remove("hidden");
          refreshObjective();
        });
      });
    });
  }

  function resetWorld(fresh) {
    const built = buildMap();
    map = built.ground;
    solids = built.sol;
    objects = built.objs;
    lights = built.lightList;
    npcs = built.npcList;
    tileVarRef = built.tileVar;
    player = { x: 9.6 * TILE, y: 18.4 * TILE, vx: 0, vy: 0, dir: 3, frame: 0, ft: 0, who: "sunfi", target: null };
    if (fresh) {
      talked = { sera: false, luca: false, noah: false, maloi: false, ena: false };
      battleStarted = false;
    }
    particles.length = 0;
  }

  function updateTown(dt) {
    const axis = moveAxis();
    let ax = axis.x, ay = axis.y;
    if (player.target && ax === 0 && ay === 0) {
      const dx = player.target.x - (player.x + 8);
      const dy = player.target.y - (player.y + 20);
      const d = Math.hypot(dx, dy);
      if (d < 4) player.target = null;
      else { ax = dx / d; ay = dy / d; }
    } else if (ax !== 0 || ay !== 0) {
      player.target = null;
    }

    const speed = 62;
    const nx = player.x + ax * speed * dt;
    const ny = player.y + ay * speed * dt;
    const footX = (p) => p + 8;
    const footY = (p) => p + 20;
    if (!isSolidAt(footX(nx), footY(player.y)) && !isSolidAt(footX(nx) - 4, footY(player.y)) && !isSolidAt(footX(nx) + 4, footY(player.y))) {
      player.x = nx;
    }
    if (!isSolidAt(footX(player.x), footY(ny)) && !isSolidAt(footX(player.x), footY(ny) - 2)) {
      player.y = ny;
    }

    if (ax !== 0 || ay !== 0) {
      if (Math.abs(ax) > Math.abs(ay)) player.dir = ax < 0 ? 1 : 2;
      else player.dir = ay < 0 ? 3 : 0;
      player.ft += dt;
      if (player.ft > 0.18) {
        player.ft = 0;
        player.frame = player.frame === 1 ? 2 : 1;
        if (Math.random() < 0.4) sfx.step();
      }
    } else {
      player.frame = 0;
      player.ft = 0;
    }

    if (Math.random() < 0.4) {
      emit({
        x: (12 + Math.random() * 3) * TILE, y: (5 + Math.random() * 3) * TILE,
        vx: rand(-6, 6), vy: rand(-10, -3), t: 0, life: rand(0.8, 1.8),
        col: "200,200,210", r: rand(1, 2), a: 0.5, world: true
      });
    }
    if (Math.random() < 0.25) {
      emit({
        x: 10.4 * TILE + rand(-10, 10), y: 5.2 * TILE + rand(-8, 8),
        vx: rand(-4, 4), vy: rand(-14, -4), t: 0, life: rand(0.6, 1.4),
        col: "170,230,255", r: rand(1.2, 2.2), a: 0.7, world: true
      });
    }
    updateActionButton();
    if (locCard.t > 0) locCard.t -= dt;
  }

  function updateCamera() {
    const vw = cssW / viewScale;
    const vh = cssH / viewScale;
    const targetX = player.x + 8 - vw / 2;
    const targetY = player.y + 12 - vh * 0.42;
    const maxX = MAP_W * TILE - vw;
    const maxY = MAP_H * TILE - vh;
    const tx = clamp(targetX, 0, Math.max(0, maxX));
    const ty = clamp(targetY, 0, Math.max(0, maxY));
    if (mode === "opening") {
      cam.x = 6.2 * TILE;
      cam.y = 2.2 * TILE;
      return;
    }
    cam.x = lerp(cam.x, tx, 0.14);
    cam.y = lerp(cam.y, ty, 0.14);
  }

  function resize() {
    const app = $("app");
    const r = app.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    viewScale = Math.max(2, Math.floor(cssW / (TILE * 8)));
  }

  function drawWorld() {
    const sc = viewScale;
    const ox = Math.round(cam.x * sc);
    const oy = Math.round(cam.y * sc);
    const g = ctx;
    g.fillStyle = "#0a0c16";
    g.fillRect(0, 0, cssW, cssH);

    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const x1 = Math.min(MAP_W, Math.ceil((cam.x + cssW / sc) / TILE) + 1);
    const y1 = Math.min(MAP_H, Math.ceil((cam.y + cssH / sc) / TILE) + 1);
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const t = map[ty][tx];
        const v = (tileVarRef[ty][tx]) & 3;
        const img = assets.tiles[t][v];
        g.drawImage(img, 0, 0, TILE, TILE, (tx * TILE) * sc - ox, (ty * TILE) * sc - oy, TILE * sc, TILE * sc);
      }
    }

    const ents = [];
    for (const obj of objects) ents.push({ y: (obj.footY || obj.y + 1) * TILE, kind: "obj", obj });
    for (const n of npcs) ents.push({ y: n.y + 22, kind: "npc", n });
    if (mode === "town" || mode === "dialogue") ents.push({ y: player.y + 22, kind: "player" });
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) {
      if (e.kind === "obj") drawObj(g, e.obj, ox, oy, sc);
      else if (e.kind === "npc") drawActor(g, e.n, ox, oy, sc);
      else if (e.kind === "player") drawActor(g, player, ox, oy, sc);
    }

    drawLights(g, ox, oy, sc);
    for (const pt of particles) {
      if (!pt.world) continue;
      const a = pt.a * (1 - pt.t / pt.life);
      g.fillStyle = "rgba(" + pt.col + "," + a + ")";
      g.beginPath();
      g.arc(pt.x * sc - ox, pt.y * sc - oy, pt.r * sc * 0.45, 0, Math.PI * 2);
      g.fill();
    }

    if (locCard.t > 0 && mode === "town") {
      const a = locCard.t > 2.3 ? (2.8 - locCard.t) / 0.5 : locCard.t < 0.5 ? locCard.t / 0.5 : 1;
      g.save();
      g.globalAlpha = clamp(a, 0, 1);
      g.fillStyle = "rgba(8,10,24,0.7)";
      const ly = cssH * 0.36;
      g.fillRect(cssW / 2 - 110, ly, 220, 36);
      g.strokeStyle = "rgba(224,192,115,0.5)";
      g.strokeRect(cssW / 2 - 110, ly, 220, 36);
      g.fillStyle = "#f3ead8";
      g.font = "14px \"Shippori Mincho\", serif";
      g.textAlign = "center";
      g.fillText(locCard.text, cssW / 2, ly + 23);
      g.restore();
    }
  }

  function drawObj(g, obj, ox, oy, sc) {
    if (obj.type === "tree") drawTree(g, obj.x * TILE * sc - ox, obj.y * TILE * sc - oy, sc);
    else if (obj.type === "house") drawHouse(g, obj, ox, oy, sc);
    else if (obj.type === "well") drawWell(g, obj, ox, oy, sc);
    else if (obj.type === "lantern") drawLantern(g, obj, ox, oy, sc);
    else if (obj.type === "barrels") drawBarrels(g, obj, ox, oy, sc);
    else if (obj.type === "cart") drawCart(g, obj, ox, oy, sc);
    else if (obj.type === "crystal") {
      const img = assets.crystal;
      const x = obj.x * TILE * sc - ox;
      const y = obj.y * TILE * sc - oy;
      const pulse = 0.85 + Math.sin(time * 2.2) * 0.15;
      g.save();
      g.globalAlpha = 0.55 * pulse;
      g.fillStyle = "#9fe8ff";
      g.beginPath();
      g.ellipse(x + 24 * sc / 3 * 1.1, y + 52 * sc / 3, 18 * sc / 2.2, 7 * sc / 2.2, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.drawImage(img, x, y, 48 * sc / 2.2, 64 * sc / 2.2);
    }
  }

  function drawActor(g, a, ox, oy, sc) {
    const sheet = assets.chars[a.who];
    const img = sheet[a.dir || 0][a.frame || 0] || sheet[a.dir || 0][0];
    const x = a.x * sc - ox;
    const y = a.y * sc - oy;
    g.save();
    g.shadowColor = "rgba(0,0,0,0.8)";
    g.shadowBlur = 0;
    g.shadowOffsetX = sc * 0.35;
    g.shadowOffsetY = sc * 0.35;
    g.drawImage(img, 0, 0, 16, 24, x, y, 16 * sc, 24 * sc);
    g.restore();
  }

  function drawLights(g, ox, oy, sc) {
    g.save();
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "rgba(18, 22, 40, 0.42)";
    g.fillRect(0, 0, cssW, cssH);
    g.restore();
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const L of lights) {
      const flick = 1 + Math.sin(time * 4 + L.r) * L.flicker + Math.sin(time * 7.1 + L.x) * L.flicker * 0.5;
      const x = L.x * sc - ox;
      const y = L.y * sc - oy;
      const r = L.r * sc / 2.4 * flick;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(" + L.col + "," + (L.a * flick) + ")");
      grd.addColorStop(0.4, "rgba(" + L.col + "," + (L.a * 0.35 * flick) + ")");
      grd.addColorStop(1, "rgba(" + L.col + ",0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  function drawTitleBg() {
    const g = ctx;
    g.fillStyle = "#070712";
    g.fillRect(0, 0, cssW, cssH);
    const rng = seedRand(42);
    for (let i = 0; i < 80; i++) {
      const x = rng() * cssW;
      const y = rng() * cssH * 0.7;
      const a = 0.3 + Math.sin(time * 2 + i) * 0.3 + 0.2;
      const r = rng() * 1.4 + 0.4;
      g.fillStyle = "rgba(230,230,255," + a + ")";
      g.fillRect(x, y, r, r);
    }
    g.fillStyle = "#12101c";
    g.beginPath();
    g.moveTo(0, cssH * 0.58);
    g.quadraticCurveTo(cssW * 0.25, cssH * 0.46, cssW * 0.5, cssH * 0.52);
    g.quadraticCurveTo(cssW * 0.75, cssH * 0.58, cssW, cssH * 0.48);
    g.lineTo(cssW, cssH);
    g.lineTo(0, cssH);
    g.fill();
    g.fillStyle = "#0c0c16";
    g.beginPath();
    g.moveTo(0, cssH * 0.62);
    g.quadraticCurveTo(cssW * 0.3, cssH * 0.55, cssW * 0.55, cssH * 0.6);
    g.quadraticCurveTo(cssW * 0.8, cssH * 0.64, cssW, cssH * 0.56);
    g.lineTo(cssW, cssH);
    g.lineTo(0, cssH);
    g.fill();

    const mx = cssW * 0.78, my = cssH * 0.16;
    const moon = g.createRadialGradient(mx, my, 4, mx, my, 70);
    moon.addColorStop(0, "rgba(220,230,255,0.9)");
    moon.addColorStop(0.3, "rgba(180,200,255,0.25)");
    moon.addColorStop(1, "rgba(180,200,255,0)");
    g.fillStyle = moon; g.beginPath(); g.arc(mx, my, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e4eaf8";
    g.beginPath(); g.arc(mx, my, 18, 0, Math.PI * 2); g.fill();

    const cx = cssW / 2, cy = cssH * 0.44;
    const pulse = 0.8 + Math.sin(time * 2) * 0.2;
    const glow = g.createRadialGradient(cx, cy + 20, 10, cx, cy + 20, 140);
    glow.addColorStop(0, "rgba(160,230,255," + (0.35 * pulse) + ")");
    glow.addColorStop(1, "rgba(160,230,255,0)");
    g.fillStyle = glow;
    g.beginPath(); g.arc(cx, cy + 10, 140, 0, Math.PI * 2); g.fill();
    g.save();
    g.translate(cx - 40, cy - 70);
    g.scale(1.7, 1.7);
    g.drawImage(assets.crystal, 0, 0);
    g.restore();

    if (Math.random() < 0.5) {
      emit({
        x: cx + rand(-40, 40), y: cy + rand(10, 60),
        vx: rand(-6, 6), vy: rand(-22, -8),
        t: 0, life: rand(1.2, 2.4),
        col: "180,230,255", r: rand(1, 2.4), a: 0.8, world: false
      });
    }
    for (const pt of particles) {
      if (pt.world) continue;
      const a = pt.a * (1 - pt.t / pt.life);
      g.fillStyle = "rgba(" + pt.col + "," + a + ")";
      g.beginPath(); g.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); g.fill();
    }
  }

  function drawOpeningExtras() {
    if (!openingState.cracked && dlgIndex >= 3 && mode === "opening") {
      openingState.cracked = true;
      sfx.crack();
      for (let i = 0; i < 24; i++) {
        emit({
          x: 10.4 * TILE + rand(-8, 8),
          y: 5.2 * TILE + rand(-12, 8),
          vx: rand(-30, 30), vy: rand(-40, 10),
          g: 40, t: 0, life: rand(0.5, 1.2),
          col: "200,240,255", r: rand(1, 3), a: 0.9, world: true
        });
      }
    }
  }

  function drawBattle() {
    const g = ctx;
    const grd = g.createRadialGradient(cssW / 2, cssH * 0.42, 20, cssW / 2, cssH * 0.42, cssW * 0.7);
    grd.addColorStop(0, "#1c1c24");
    grd.addColorStop(1, "#0a0a12");
    g.fillStyle = grd;
    g.fillRect(0, 0, cssW, cssH);
    g.strokeStyle = "rgba(80,80,90,0.45)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cssW * 0.2, cssH * 0.4);
    g.lineTo(cssW * 0.48, cssH * 0.36);
    g.lineTo(cssW * 0.55, cssH * 0.5);
    g.lineTo(cssW * 0.8, cssH * 0.46);
    g.stroke();

    if (battle && battle.shake > 0) {
      const s = battle.shake;
      g.save();
      g.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      battle.shake *= 0.85;
      if (battle.shake < 0.4) battle.shake = 0;
    }

    const eBob = Math.sin(time * 3) * 3;
    let ex = cssW / 2 - 54, ey = cssH * 0.20 + eBob;
    if (battle && battle.anim && battle.anim.who === "enemy") {
      ey += Math.sin(battle.anim.t * 12) * 6;
      ex += 8;
    }
    const eFrame = (time * 2 | 0) % 2;
    g.drawImage(assets.enemy[eFrame], ex, ey, 108, 94);

    const spots = [
      { x: cssW * 0.12, y: cssH * 0.50 },
      { x: cssW * 0.34, y: cssH * 0.53 },
      { x: cssW * 0.56, y: cssH * 0.53 },
      { x: cssW * 0.76, y: cssH * 0.50 }
    ];
    if (battle) {
      battle.party.forEach((p, i) => {
        const sp = spots[i];
        let x = sp.x, y = sp.y;
        if (battle.anim && battle.anim.who === p.id) {
          y -= 14;
          if (battle.anim.skill === "holy" || battle.anim.skill === "cura") y -= 6;
        }
        if (!p.alive) g.globalAlpha = 0.4;
        const img = assets.chars[p.who][3][0];
        g.drawImage(img, x, y, 16 * 3.2, 24 * 3.2);
        g.globalAlpha = 1;
      });
    }

    if (battle && battle.anim) {
      const A = battle.anim;
      const midX = cssW / 2, midY = cssH * 0.28;
      if (A.skill === "holy") {
        const a = 1 - A.t / A.life;
        g.save();
        g.globalCompositeOperation = "lighter";
        g.fillStyle = "rgba(255,250,220," + (0.45 * a) + ")";
        g.beginPath(); g.arc(midX, midY, 30 + A.t * 120, 0, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(200,240,255," + (0.5 * a) + ")";
        g.fillRect(midX - 10, 0, 20, cssH * 0.5);
        g.restore();
      } else if (A.skill === "cura" || A.skill === "veil") {
        const a = 1 - A.t / A.life;
        g.save();
        g.globalCompositeOperation = "lighter";
        spots.forEach((s) => {
          g.fillStyle = "rgba(180,255,200," + (0.35 * a) + ")";
          g.beginPath(); g.arc(s.x + 20, s.y + 20, 20 + A.t * 30, 0, Math.PI * 2); g.fill();
        });
        g.restore();
      } else if (A.skill === "fire") {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.fillStyle = "rgba(255,140,60," + (0.45 * (1 - A.t / A.life)) + ")";
        g.beginPath(); g.arc(midX, midY, 20 + A.t * 50, 0, Math.PI * 2); g.fill();
        g.restore();
      } else if (A.skill === "blizzard") {
        g.save();
        g.globalCompositeOperation = "lighter";
        g.fillStyle = "rgba(160,210,255," + (0.4 * (1 - A.t / A.life)) + ")";
        g.beginPath(); g.arc(midX, midY, 24 + A.t * 40, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }

    if (battle && battle.shake > 0) g.restore();

    if (battle && battle.flash > 0) {
      g.fillStyle = "rgba(255,252,230," + (battle.flash * 0.45) + ")";
      g.fillRect(0, 0, cssW, cssH);
    }

    for (const f of floaters) {
      g.font = "bold 22px \"Zen Kaku Gothic New\", sans-serif";
      g.textAlign = "center";
      g.fillStyle = f.color;
      g.globalAlpha = 1 - f.t / 0.85;
      g.fillText(String(f.text), f.x, f.y);
      g.globalAlpha = 1;
    }
    for (const pt of particles) {
      if (pt.world) continue;
      const a = pt.a * (1 - pt.t / pt.life);
      g.fillStyle = "rgba(" + pt.col + "," + a + ")";
      g.beginPath(); g.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); g.fill();
    }
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    time += dt;

    if (mode === "title") {
      updateParticles(dt);
      drawTitleBg();
    } else if (mode === "opening") {
      updateParticles(dt);
      updateCamera();
      drawOpeningExtras();
      drawWorld();
    } else if (mode === "town" || mode === "dialogue") {
      if (mode === "town") updateTown(dt);
      updateParticles(dt);
      updateCamera();
      drawWorld();
    } else if (mode === "battle") {
      if (battle) {
        battle.t += dt;
        if (battle.anim) battle.anim.t += dt;
        if (battle.flash > 0) battle.flash = Math.max(0, battle.flash - dt * 1.6);
        if (battle.anim && (battle.anim.skill === "holy" || battle.anim.skill === "cura") && Math.random() < 0.6) {
          emit({
            x: cssW * 0.5 + rand(-40, 40), y: cssH * 0.3 + rand(-20, 20),
            vx: rand(-10, 10), vy: rand(-30, -8),
            t: 0, life: 0.7, col: "230,250,255", r: rand(1, 3), a: 0.9, world: false
          });
        }
      }
      updateParticles(dt);
      drawBattle();
    } else if (mode === "ending" || mode === "gameover") {
      drawTitleBg();
    }

    if ((mode === "dialogue" || mode === "opening") && !dlgDone && dlgFull) {
      dlgTimer += dt * 1000;
      while (dlgTimer >= TYPE_MS && dlgShown.length < dlgFull.length) {
        dlgTimer -= TYPE_MS;
        dlgShown += dlgFull[dlgShown.length];
        if (dlgShown.length % 2 === 0) sfx.type();
      }
      $("dlg-text").textContent = dlgShown;
      if (dlgShown.length >= dlgFull.length) {
        dlgDone = true;
        $("dlg-next").classList.remove("hidden");
      }
    }

    tickAmbient(dt);
    requestAnimationFrame(frame);
  }

  function boot() {
    try { muted = localStorage.getItem("eldia-mute") === "1"; } catch (e) {}
    setMuted(muted);
    resize();
    buildTiles();
    buildCharSheets();
    assets.crystal = drawCrystalSprite();
    assets.enemy = [drawEnemySprite(0), drawEnemySprite(1)];
    bindInput();
    resetWorld(true);
    cam.x = player.x - 40;
    cam.y = player.y - 80;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    const go = () => {
      $("loading").classList.add("hidden");
      if (shotMode === "town") {
        mode = "town";
        $("controls").classList.remove("hidden");
        player.x = 8.4 * TILE; player.y = 11.2 * TILE; player.dir = 3;
        refreshObjective();
        locCard = { text: "辺境の町　リュミエ", t: 2.8 };
      } else if (shotMode === "battle") {
        beginBattle();
      } else if (shotMode === "ending") {
        showEnding();
      } else {
        showTitle();
      }
      requestAnimationFrame(frame);
    };

    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([ready, new Promise((res) => setTimeout(res, 1200))]).then(go);
  }

  window.__ELDIA = {
    get mode() { return mode; },
    startGame, beginBattle, showTitle, showEnding
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
