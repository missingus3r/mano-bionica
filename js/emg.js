/* Simulación de la cadena completa: intención → músculos → EMG de superficie (1 kHz, 8 canales) →
   filtros del microcontrolador (pasabanda 20–450 Hz + notch 50 Hz) → ventanas de 150 ms cada 25 ms →
   características de Hudgins (MAV, WL, ZC, SSC) → LDA o regresión → comandos a 17 servos con velocidad limitada. */
(function () {
  const MB = window.MB;
  const FS = 1000, WIN = 150, STRIDE = 25, NCH = 8;
  const E = (MB.EMG = {
    fs: FS, win: WIN, stride: STRIDE,
    gesture: 'reposo', intensity: 0.85, force: 0.4, manual: null,
    noise: { hum: 0.25, motion: 0.3, floor: 1, detached: -1, fatigue: 0 },
    filt: { band: true, notch: true },
    mode: 'lda', votes: 4, reject: 0.55,
    act: 'bus', // 'bus' = servos de bus STS3215 · 'pwm' = servos MG996R/MG90S + PCA9685
    t: 0,
  });

  // ---------- Gestos (17 GDL: pulgar 4, dedos índice→meñique [abd, MCP, PIP], muñeca) ----------
  const P = (th, f, w) => th.concat(...f, [w]);
  const fist = [[0, 1.45, 1.6], [0, 1.48, 1.62], [0, 1.45, 1.6], [0.05, 1.4, 1.55]];
  const rest = [[0.04, 0.28, 0.38], [0, 0.3, 0.42], [0.03, 0.32, 0.45], [0.06, 0.36, 0.5]];
  MB.GESTURES = [
    { k: 'reposo', n: 'Reposo', key: '1', q: P([0.35, 0.18, 0.12, 0.18], rest, 0) },
    { k: 'abrir', n: 'Mano abierta', key: '2', q: P([0.95, -0.05, -0.05, -0.1], [[0.24, -0.15, 0], [0.04, -0.15, 0], [0.18, -0.15, 0], [0.3, -0.12, 0]], -0.08) },
    { k: 'puno', n: 'Puño', key: '3', q: P([0.39, 0.32, 0.6, 0.67], fist, 0.05) },
    { k: 'pinza', n: 'Pinza fina', key: '4', q: P([0.68, 0.78, 0.17, 0.13], [[-0.02, 0.78, 0.88], [0.02, 0.28, 0.32], [0.05, 0.3, 0.36], [0.1, 0.32, 0.4]], 0) },
    { k: 'tripode', n: 'Pinza trípode', key: '5', q: P([0.71, 0.89, 0.12, 0.13], [[-0.06, 0.72, 0.82], [0.05, 0.7, 0.86], [0, 1.25, 1.45], [0.05, 1.25, 1.45]], 0) },
    { k: 'senalar', n: 'Señalar', key: '6', q: P([0.39, 0.32, 0.6, 0.67], [[0, 0, 0.02], [0, 1.48, 1.62], [0, 1.45, 1.6], [0.05, 1.4, 1.55]], 0) },
    { k: 'pulgar', n: 'Pulgar arriba', key: '7', q: P([0.55, -0.05, 0, -0.1], fist, 0) },
    { k: 'lateral', n: 'Agarre lateral (llave)', key: '8', q: P([1.05, 0.95, 0.32, 0.44], [[0, 0.85, 1.2], [0, 1.0, 1.3], [0, 1.1, 1.4], [0.05, 1.15, 1.4]], 0) },
    { k: 'flexMun', n: 'Flexión de muñeca', key: '9', q: P([0.35, 0.18, 0.12, 0.18], rest, 0.85) },
    { k: 'extMun', n: 'Extensión de muñeca', key: '0', q: P([0.4, 0.12, 0.08, 0.1], rest, -0.8) },
  ];
  MB.gIdx = {}; MB.GESTURES.forEach((g, i) => { MB.gIdx[g.k] = i; });
  const REST = MB.GESTURES[0].q;
  const NG = MB.GESTURES.length;

  // ---------- Azar con semilla ----------
  function rng(seed) {
    let a = seed >>> 0;
    const u = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let spare = null;
    u.g = () => { if (spare !== null) { const s = spare; spare = null; return s; } let x, y, r; do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (!r || r >= 1); const f = Math.sqrt((-2 * Math.log(r)) / r); spare = y * f; return x * f; };
    return u;
  }

  // ---------- Filtros biquad (RBJ) ----------
  function biquad(type, f0, Q, fs) {
    const w = (2 * Math.PI * f0) / fs, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; } // notch
    const f = { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, z1: 0, z2: 0 };
    f.run = (x) => { const y = f.b0 * x + f.z1; f.z1 = f.b1 * x - f.a1 * y + f.z2; f.z2 = f.b2 * x - f.a2 * y; return y; };
    f.reset = () => { f.z1 = f.z2 = 0; };
    return f;
  }
  MB.biquad = biquad;

  // ---------- Fuentes musculares y mezcla hacia los electrodos ----------
  // FDS y FDP se dividen en 4 compartimentos (uno por dedo), corridos del lado radial (índice) al cubital (meñique).
  const SRC = [];
  MB.MUSCLES.forEach((m, mi) => {
    const subs = m.k === 'FDS' || m.k === 'FDP' ? [-16, -6, 6, 16] : [0];
    subs.forEach((off, j) => SRC.push({ mi, k: m.k, finger: subs.length > 1 ? j : -1, phi: m.phi + off, v0: m.v[0], v1: m.v[1], deep: m.deep }));
  });
  E.sources = SRC;
  const NS = SRC.length;

  // Ganancia de cada fuente en cada canal: decae con la distancia por la piel y con la profundidad
  function mixMatrix(seed) {
    const r = rng(seed), W = [];
    for (let c = 0; c < NCH; c++) {
      const row = [], pc = MB.chPhi(c), ve = MB.ELEC.v, gain = 0.85 + 0.3 * r();
      SRC.forEach((s) => {
        let d = Math.abs(((s.phi - pc + 540) % 360) - 180);
        const arc = (d / 180) * Math.PI * 38;
        const dv = ve < s.v0 ? s.v0 - ve : ve > s.v1 ? ve - s.v1 : 0, dy = dv * 250;
        const depth = 0.25 + 0.75 * s.deep * s.deep;
        row.push(gain * depth * Math.exp(-(arc * arc) / (2 * 17 * 17)) * Math.exp(-(dy * dy) / (2 * 28 * 28)));
      });
      W.push(row);
    }
    return W;
  }

  // ---------- De la postura buscada a la activación de cada fuente ----------
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  function sourceTargets(q, force, out) {
    const F = [], X = [];
    for (let i = 0; i < 4; i++) {
      const m = q[5 + i * 3], p = q[6 + i * 3];
      F.push(cl((m - 0.28 + p - 0.4) / 2.5, 0, 1));
      X.push(cl((0.28 - m + 0.4 - p) / 0.85, 0, 1));
    }
    const meanF = (F[0] + F[1] + F[2] + F[3]) / 4, meanX = (X[0] + X[1] + X[2] + X[3]) / 4;
    const Ft = cl((q[1] - 0.18 + q[2] - 0.12 + q[3] - 0.18) / 1.7, 0, 1);
    const Xt = cl((q[0] - 0.35) / 0.6 + (0.18 - q[1]) / 0.5, 0, 1);
    const w = q[16], Wf = cl(w / 0.85, 0, 1), We = cl(-w / 0.8, 0, 1);
    const grip = 0.35 + 0.65 * force; // sostener una postura cuesta menos que apretar
    // co-contracción: al apretar, los extensores de muñeca se activan para estabilizarla (pasa de verdad)
    const base = 0.03;
    SRC.forEach((s, j) => {
      let a = base;
      switch (s.k) {
        case 'FDS': a += F[s.finger] * grip * 0.9 + meanF * 0.08; break;
        case 'FDP': a += F[s.finger] * grip * 0.8 + meanF * 0.1; break;
        case 'FCR': a += Wf * 0.85 + meanF * grip * 0.12; break;
        case 'FCU': a += Wf * 0.75 + F[3] * 0.15; break;
        case 'FPL': a += Ft * (0.4 + 0.6 * force) * 0.95; break;
        case 'ECR': a += We * 0.9 + meanF * grip * 0.28; break;
        case 'ED': a += meanX * 0.8 + We * 0.15 + X[2] * 0.1; break;
        case 'ECU': a += We * 0.75 + meanF * grip * 0.2; break;
        case 'APL': a += Xt * 0.85; break;
        case 'EIP': a += X[0] * (0.5 + 0.5 * meanF) * 0.85; break;
        // no mueven los dedos, pero están justo debajo del brazalete: suman ruido cruzado al apretar
        case 'PL': a += Wf * 0.6 + meanF * grip * 0.15; break;
        case 'PT': a += 0.02 + meanF * grip * 0.1; break;
        case 'BR': a += 0.02 + meanF * grip * 0.14 + We * 0.08; break;
      }
      out[j] = cl(a, 0, 1.2);
    });
    return out;
  }

  // ---------- Generador de EMG ----------
  // la matriz de mezcla depende de la persona y de dónde quedaron los electrodos (fija); el ruido, de la semilla
  const PERSON = 80;
  function makeGen(seed) {
    const r = rng(seed);
    const g = {
      r, W: mixMatrix(PERSON),
      act: new Float64Array(NS), tgt: new Float64Array(NS),
      shape: SRC.map((s, j) => biquad('bp', 70 + 40 * r(), 0.8, FS)),
      shape2: SRC.map(() => biquad('hp', 15, 0.7, FS)),
      trem: new Float64Array(NS), humPh: Array.from({ length: NCH }, () => r() * 6.28), humG: Array.from({ length: NCH }, () => 0.5 + r()),
      art: new Float64Array(NCH), artF: Array.from({ length: NCH }, () => biquad('lp', 4, 0.7, FS)),
      t: 0, wristVel: 0,
    };
    // un paso de 1 ms: devuelve los 8 canales en mV
    g.sample = function (out) {
      const N = E.noise, fat = 1 + N.fatigue * 0.6;
      for (let j = 0; j < NS; j++) {
        const up = g.tgt[j] > g.act[j];
        g.act[j] += (g.tgt[j] - g.act[j]) * (up ? 0.025 : 0.012); // ~40 ms al subir, ~80 ms al bajar
        g.trem[j] += (r.g() - g.trem[j]) * 0.004;
      }
      const src = g._s || (g._s = new Float64Array(NS));
      for (let j = 0; j < NS; j++) {
        // ruido gaussiano coloreado = suma de muchos potenciales de unidad motora
        const n = g.shape2[j].run(g.shape[j].run(r.g())) * 2.2;
        src[j] = n * g.act[j] * (1 + 0.12 * g.trem[j]) * fat;
      }
      g.t += 1 / FS;
      for (let c = 0; c < NCH; c++) {
        let x = 0; const row = g.W[c];
        for (let j = 0; j < NS; j++) x += row[j] * src[j];
        x *= 0.9;
        x += N.hum * 0.35 * g.humG[c] * Math.sin(2 * Math.PI * 50 * g.t + g.humPh[c]);
        g.art[c] = g.artF[c].run(r.g() * g.wristVel * N.motion * 60);
        x += g.art[c] + (0.006 * N.floor) * r.g();
        if (c === N.detached) x = x * 0.15 + 0.9 * Math.sin(2 * Math.PI * 50 * g.t) + 0.25 * r.g() + 0.5 * Math.sin(2 * Math.PI * 0.7 * g.t);
        out[c] = x;
      }
      return out;
    };
    return g;
  }

  // ---------- Procesamiento (lo que corre en el ESP32) ----------
  function makeDSP() {
    const d = {
      hp: Array.from({ length: NCH }, () => [biquad('hp', 20, 0.541, FS), biquad('hp', 20, 1.307, FS)]),
      lp: Array.from({ length: NCH }, () => biquad('lp', 450, 0.707, FS)),
      nt: Array.from({ length: NCH }, () => biquad('notch', 50, 25, FS)),
      buf: Array.from({ length: NCH }, () => new Float64Array(WIN)), pos: 0, n: 0,
    };
    d.run = function (x, y) {
      for (let c = 0; c < NCH; c++) {
        let v = x[c];
        if (E.filt.band) v = d.lp[c].run(d.hp[c][1].run(d.hp[c][0].run(v)));
        if (E.filt.notch) v = d.nt[c].run(v);
        y[c] = v;
        d.buf[c][d.pos] = v;
      }
      d.pos = (d.pos + 1) % WIN; d.n++;
      return d.n % STRIDE === 0 && d.n >= WIN;
    };
    // MAV, WL, ZC y SSC por canal sobre la ventana
    d.features = function () {
      const f = new Float64Array(NCH * 4), mav = new Float64Array(NCH), th = 0.012;
      for (let c = 0; c < NCH; c++) {
        const b = d.buf[c]; let s = 0, wl = 0, zc = 0, ssc = 0;
        for (let i = 0; i < WIN; i++) {
          const a = b[(d.pos + i) % WIN], p = b[(d.pos + i - 1 + WIN) % WIN], n = b[(d.pos + i + 1) % WIN];
          s += Math.abs(a);
          if (i > 0) { wl += Math.abs(a - p); if (a * p < 0 && Math.abs(a - p) > th) zc++; }
          if (i > 0 && i < WIN - 1 && (a - p) * (a - n) > th * th) ssc++;
        }
        mav[c] = s / WIN;
        f[c * 4] = Math.log(mav[c] + 1e-4); f[c * 4 + 1] = Math.log(wl / WIN + 1e-4); f[c * 4 + 2] = zc / WIN * 4; f[c * 4 + 3] = ssc / WIN * 4;
      }
      return { f, mav };
    };
    return d;
  }

  // ---------- Álgebra mínima ----------
  function invert(A) {
    const n = A.length, M = A.map((r, i) => r.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let i = 0; i < n; i++) {
      let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
      [M[i], M[p]] = [M[p], M[i]];
      const d = M[i][i] || 1e-12;
      for (let j = 0; j < 2 * n; j++) M[i][j] /= d;
      for (let k = 0; k < n; k++) if (k !== i) { const f = M[k][i]; if (f) for (let j = 0; j < 2 * n; j++) M[k][j] -= f * M[i][j]; }
    }
    return M.map((r) => r.slice(n));
  }

  // LDA con covarianza compartida y contracción (shrinkage)
  function trainLDA(X, y) {
    const D = X[0].length, mu = Array.from({ length: NG }, () => new Float64Array(D)), cnt = new Array(NG).fill(0);
    X.forEach((x, i) => { cnt[y[i]]++; for (let j = 0; j < D; j++) mu[y[i]][j] += x[j]; });
    mu.forEach((m, k) => { for (let j = 0; j < D; j++) m[j] /= Math.max(1, cnt[k]); });
    const S = Array.from({ length: D }, () => new Array(D).fill(0));
    X.forEach((x, i) => { const m = mu[y[i]]; for (let a = 0; a < D; a++) { const da = x[a] - m[a]; for (let b = a; b < D; b++) S[a][b] += da * (x[b] - m[b]); } });
    let tr = 0;
    for (let a = 0; a < D; a++) { for (let b = a; b < D; b++) { S[a][b] /= X.length - NG; S[b][a] = S[a][b]; } tr += S[a][a]; }
    const lam = 0.08 * tr / D;
    for (let a = 0; a < D; a++) S[a][a] += lam;
    const Si = invert(S);
    const w = mu.map((m) => Si.map((r) => r.reduce((s, v, j) => s + v * m[j], 0)));
    const b = mu.map((m, k) => -0.5 * w[k].reduce((s, v, j) => s + v * m[j], 0));
    return { w, b, D };
  }
  function ldaProbs(M, x) {
    const z = M.w.map((wk, k) => wk.reduce((s, v, j) => s + v * x[j], M.b[k]));
    const mx = Math.max(...z), e = z.map((v) => Math.exp(v - mx)), s = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / s);
  }
  // Regresión lineal con cresta (ridge): MAV normalizado → 6 salidas continuas
  function trainRidge(X, Y, lam) {
    const D = X[0].length, K = Y[0].length;
    const A = Array.from({ length: D }, () => new Array(D).fill(0)), B = Array.from({ length: D }, () => new Array(K).fill(0));
    X.forEach((x, i) => { for (let a = 0; a < D; a++) { for (let b = 0; b < D; b++) A[a][b] += x[a] * x[b]; for (let k = 0; k < K; k++) B[a][k] += x[a] * Y[i][k]; } });
    for (let a = 0; a < D - 1; a++) A[a][a] += lam * X.length;
    const Ai = invert(A);
    return Ai.map((r) => { const o = new Array(K).fill(0); r.forEach((v, j) => { for (let k = 0; k < K; k++) o[k] += v * B[j][k]; }); return o; }); // D×K
  }
  const regTargets = (q) => {
    const f = (i) => (q[5 + i * 3] / 1.45 + q[6 + i * 3] / 1.6) / 2;
    return [(q[1] / 0.95 + q[2] / 0.55 + q[3] / 0.45) / 3, f(0), f(1), f(2), f(3), q[16] / 0.85];
  };
  const regPose = (o) => {
    const c = (v) => cl(v, -0.12, 1.05), th = c(o[0]);
    const q = [0.75 - 0.5 * th, 0.95 * th, 0.55 * th, 0.45 * th];
    for (let i = 0; i < 4; i++) { const v = c(o[1 + i]); q.push(v < 0.1 ? 0.12 * (1 - v * 6) * (i === 1 ? 0.2 : 1) * (i < 1 ? -1 : 1) : 0, 1.45 * v, 1.6 * Math.max(0, v)); }
    q.push(cl(o[5], -1, 1) * 0.85);
    return q;
  };

  // ---------- Intención de la persona ----------
  function poseFor(gk, k) {
    const g = MB.GESTURES[MB.gIdx[gk]].q;
    return g.map((v, i) => REST[i] + (v - REST[i]) * k);
  }
  E.intentQ = function () {
    // con el Leap, la intención es la postura de tu mano (en modo «como la persona»)
    if (E.leap && E.leap.q && E.leap.mode === 'emg') return E.leap.q;
    if (E.manual) {
      const m = E.manual, q = REST.slice();
      q[0] = 0.75 - 0.45 * m[0]; q[1] = 0.95 * m[0]; q[2] = 0.55 * m[0]; q[3] = 0.45 * m[0];
      for (let i = 0; i < 4; i++) { q[5 + i * 3] = -0.12 + 1.57 * m[1 + i]; q[6 + i * 3] = 1.62 * m[1 + i]; q[4 + i * 3] = (1 - m[1 + i]) * 0.08 * [-1, 0, 1, 1.5][i]; }
      q[16] = m[5] * 0.85;
      return q;
    }
    return poseFor(E.gesture, E.intensity);
  };

  // ---------- Estado en vivo ----------
  const L = (E.live = {
    gen: makeGen(11), dsp: makeDSP(), x: new Float64Array(NCH), y: new Float64Array(NCH), tgt: new Float64Array(NS),
    humanQ: REST.slice(), robotQ: REST.slice(), cmdQ: REST.slice(), servoVel: new Array(MB.NDOF).fill(0),
    probs: new Array(NG).fill(0), cls: 0, votes: [], level: 0, mav: new Float64Array(NCH), feat: null,
    scope: { n: 2000, raw: Array.from({ length: NCH }, () => new Float32Array(2000)), flt: Array.from({ length: NCH }, () => new Float32Array(2000)), env: Array.from({ length: NCH }, () => new Float32Array(2000)), pos: 0 },
    env: new Float64Array(NCH), latency: null, lastChange: 0, pendingLat: null, decisions: 0, current: 0,
    muscleAct: new Float64Array(MB.NMUS), regOut: [0, 0, 0, 0, 0, 0],
  });
  E.model = null;
  E.mixRow = (c) => L.gen.W[c];

  function decide(feat) {
    const M = E.model;
    if (!M) return;
    L.feat = feat;
    const mavN = Array.from(feat.mav, (v, c) => v / M.mavScale[c]);
    L.level = mavN.reduce((a, b) => a + b, 0) / NCH;
    // antivibración, paso 0: la amplitud que decide cuánto cerrar se suaviza (~150 ms) antes de usarla
    const ks = E.smooth.on ? 1 - Math.exp(-(STRIDE / FS) / 0.15) : 1;
    L.levelF = L.levelF === undefined ? L.level : L.levelF + (L.level - L.levelF) * ks;
    if (E.mode === 'lda') {
      const p = ldaProbs(M.lda, feat.f);
      L.probs = p;
      let k = p.indexOf(Math.max(...p));
      if (p[k] < E.reject) k = 0; // si no está seguro, vuelve a reposo
      L.votes.push(k); if (L.votes.length > E.votes) L.votes.shift();
      const cnt = {}; L.votes.forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; });
      let best = k, bc = 0; Object.keys(cnt).forEach((v) => { if (cnt[v] > bc) { bc = cnt[v]; best = +v; } });
      L.cls = best;
      // control proporcional: cuánto se cierra sale de la amplitud relativa a la de calibración de ese gesto
      const ref = M.classLevel[best] || 1;
      const kk = best === 0 ? 1 : cl((L.levelF - M.classLevel[0]) / Math.max(1e-6, ref - M.classLevel[0]), 0.15, 1.05);
      L.cmdQ = poseFor(MB.GESTURES[best].k, Math.min(1, kk));
    } else {
      const x = mavN.concat([1]);
      const o = M.reg[0].map((_, k) => x.reduce((s, v, j) => s + v * M.reg[j][k], 0));
      L.regOut = L.regOut.map((v, k) => v + (o[k] - v) * ks);
      L.cmdQ = regPose(L.regOut);
      const p = new Array(NG).fill(0); L.probs = p;
      // para la latencia y la vista, el gesto más parecido
      let bi = 0, bd = 1e9; MB.GESTURES.forEach((g, i) => { const d = g.q.reduce((s, v, j) => s + (v - L.cmdQ[j]) ** 2, 0); if (d < bd) { bd = d; bi = i; } });
      L.cls = bi; p[bi] = 1;
    }
    L.decisions++;
    if (L.pendingLat && L.cls === L.pendingLat.g) { L.latency = (E.t - L.pendingLat.t) * 1000; L.pendingLat = null; }
  }

  // Servos: control de posición con velocidad máxima según el modelo, más corriente estimada
  // ---------- Control manual por dedo ----------
  // Cada grupo (pulgar, 4 dedos, muñeca) puede dejar de seguir al EMG y obedecer a sus propios controles.
  MB.GROUPS = [
    { k: 'thumb', n: 'Pulgar', dofs: [0, 1, 2, 3] },
    { k: 'index', n: 'Índice', dofs: [4, 5, 6] },
    { k: 'middle', n: 'Medio', dofs: [7, 8, 9] },
    { k: 'ring', n: 'Anular', dofs: [10, 11, 12] },
    { k: 'little', n: 'Meñique', dofs: [13, 14, 15] },
    { k: 'wrist', n: 'Muñeca', dofs: [16] },
  ];
  E.manualRobot = { on: MB.GROUPS.map(() => false), q: REST.slice() };

  // ---------- Antivibración ----------
  // El decodificador cambia un poco cada 25 ms aunque la persona esté quieta, y los servos lo siguen: tiemblan.
  // 1) filtro «One Euro» por articulación: suaviza mucho cuando el comando casi no se mueve y poco cuando se
  //    mueve rápido (así no agrega latencia en los cambios de gesto);
  // 2) zona muerta con histéresis: no se manda una posición nueva si difiere menos de X° de la última enviada;
  // 3) retener postura: si hace 300 ms que el comando casi no se mueve (velocidad filtrada baja en todas las
  //    articulaciones), queda fijo hasta que la diferencia supere 3 veces la zona muerta.
  // valores elegidos con una búsqueda: en modo gestos, temblor de 3,2° a 0° con +80 ms de demora al cambiar de gesto
  E.smooth = { on: true, deadband: 2.5, minCutoff: 0.5, beta: 1, hold: true, vth: 0.7 };
  const euro = MB.DOF.map(() => ({ x: null, dx: 0 }));
  const alpha = (fc, dt) => { const r = 2 * Math.PI * fc * dt; return r / (r + 1); };
  L.sent = REST.slice(); L.stableT = 0; L.jitter = 0; L.lpQ = REST.slice();
  function filterCmd(tgt, dt) {
    const S = E.smooth;
    if (!S.on) { L.sent = tgt.slice(); euro.forEach((e, i) => { e.x = e.raw = tgt[i]; e.dx = 0; }); L.stableT = 0; L.holding = false; return tgt; }
    const db = (S.deadband * Math.PI) / 180;
    const holding = S.hold && L.stableT > 0.3;
    let fast = 0;
    const out = tgt.map((x, i) => {
      const e = euro[i];
      if (e.x === null) { e.x = x; e.raw = x; }
      // la derivada se toma de la señal cruda (no de la filtrada) y también se suaviza
      const dx = (x - e.raw) / Math.max(dt, 1e-4); e.raw = x;
      e.dx += alpha(1, dt) * (dx - e.dx);
      const fc = S.minCutoff + S.beta * Math.abs(e.dx);
      const before = e.x;
      e.x += alpha(fc, dt) * (x - e.x);
      // velocidad del comando ya filtrado: el ruido la mueve poco, un cambio de gesto mucho
      fast = Math.max(fast, Math.abs(e.x - before) / Math.max(dt, 1e-4));
      const diff = Math.abs(e.x - L.sent[i]);
      if (diff > (holding ? db * 3 : db)) L.sent[i] = e.x;
      return L.sent[i];
    });
    // ¿la persona está quieta? (el comando filtrado se mueve menos de ~40°/s en todas las articulaciones)
    L.stableT = fast < S.vth ? L.stableT + dt : 0;
    L.holding = holding;
    return out;
  }

  const SPEED = { bus: 4.2, pwm: 5.0 }; // rad/s en la articulación (con carga típica)
  function servos(dt) {
    const vmax = SPEED[E.act] * dt;
    let cur = 0.18; // reposo de la electrónica, A
    // los grupos en manual toman sus valores de los controles
    // en modo directo, el Leap manda a los servos sin pasar por el EMG
    let tgt = E.leap && E.leap.q && E.leap.mode === 'direct' ? E.leap.q.slice() : L.cmdQ.slice();
    MB.GROUPS.forEach((g, gi) => { if (E.manualRobot.on[gi]) g.dofs.forEach((d) => { tgt[d] = E.manualRobot.q[d]; }); });
    tgt = filterCmd(tgt, dt);
    L.target = tgt;
    L.robotQ = L.robotQ.map((v, i) => {
      const t = cl(tgt[i], MB.DOF[i].lo, MB.DOF[i].hi);
      const d = cl((t - v) * 0.6, -vmax, vmax);
      L.servoVel[i] = d / Math.max(dt, 1e-4);
      cur += 0.05 + Math.abs(L.servoVel[i]) * 0.09 + (i >= 4 && i < 16 && (i - 4) % 3 ? Math.max(0, t) * 0.06 : 0);
      return v + d;
    });
    L.current = cur;
    // vibración: qué parte del tiempo están moviéndose los servos (más de 3°/s), promedio de ~1 s
    const moving = L.servoVel.filter((v) => Math.abs(v) > 0.05).length / MB.NDOF;
    L.jitter += (moving - L.jitter) * Math.min(1, dt / 1);
  }

  E.tick = function (dt) {
    E.t += dt;
    const g = L.gen;
    const q = E.intentQ();
    // cambio de gesto: arranca la medición de latencia
    const gk = E.manual ? -1 : MB.gIdx[E.gesture];
    if (gk !== L.lastG) { if (gk >= 0 && L.lastG !== undefined) L.pendingLat = { g: gk, t: E.t }; L.lastG = gk; }
    sourceTargets(q, E.force, L.tgt);
    for (let j = 0; j < NS; j++) g.tgt[j] = L.tgt[j];
    // la mano de la persona se mueve después de que se activan los músculos (retardo electromecánico)
    const prevW = L.humanQ[16];
    // con el Leap la mano simulada copia tu mano casi sin demora
    const a = 1 - Math.exp(-dt / (E.leap && E.leap.q ? 0.04 : 0.13));
    L.humanQ = L.humanQ.map((v, i) => v + (q[i] - v) * a);
    g.wristVel = Math.abs(L.humanQ[16] - prevW) / Math.max(dt, 1e-4);
    // muestras de 1 kHz en lo que duró el cuadro
    L.acc = (L.acc || 0) + dt * FS;
    const n = Math.min(400, Math.floor(L.acc)); L.acc -= n;
    const S = L.scope;
    for (let i = 0; i < n; i++) {
      g.sample(L.x);
      const ready = L.dsp.run(L.x, L.y);
      for (let c = 0; c < NCH; c++) {
        L.env[c] += (Math.abs(L.y[c]) - L.env[c]) * 0.012;
        S.raw[c][S.pos] = L.x[c]; S.flt[c][S.pos] = L.y[c]; S.env[c][S.pos] = L.env[c];
      }
      S.pos = (S.pos + 1) % S.n;
      if (ready) { const f = L.dsp.features(); L.mav = f.mav; decide(f); }
    }
    // activación visible de cada músculo = promedio de sus compartimentos
    const sum = new Float64Array(MB.NMUS), c2 = new Float64Array(MB.NMUS);
    SRC.forEach((s, j) => { sum[s.mi] += g.act[j]; c2[s.mi]++; });
    for (let m = 0; m < MB.NMUS; m++) L.muscleAct[m] = sum[m] / c2[m];
    servos(dt);
  };

  // ---------- Calibración ----------
  // La persona hace cada gesto unos segundos; se guardan las ventanas y se entrena el decodificador.
  // Se simula más rápido que en vivo (sin dibujar), con otra semilla para la prueba.
  function record(seed, secs, intensities) {
    // misma persona y mismos electrodos, otro momento
    const g = makeGen(seed), d = makeDSP(), x = new Float64Array(NCH), y = new Float64Array(NCH), tg = new Float64Array(NS);
    const X = [], Y = [], MAV = [], R = [];
    let hq = REST.slice();
    MB.GESTURES.forEach((G, gi) => {
      intensities.forEach((k) => {
        const tq = poseFor(G.k, k);
        const total = secs * FS;
        for (let i = 0; i < total; i++) {
          // rampa de subida, meseta y bajada
          const ph = i / total, ramp = ph < 0.18 ? ph / 0.18 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
          const q = REST.map((v, j) => v + (tq[j] - v) * ramp);
          if (i % 10 === 0) { sourceTargets(q, E.force * (0.8 + 0.4 * g.r()), tg); for (let j = 0; j < NS; j++) g.tgt[j] = tg[j]; const pw = hq[16]; hq = hq.map((v, j) => v + (q[j] - v) * 0.074); g.wristVel = Math.abs(hq[16] - pw) * 100; }
          g.sample(x);
          if (d.run(x, y)) {
            const f = d.features();
            if (ph > 0.3 && ph < 0.82) { X.push(Array.from(f.f)); Y.push(gi); MAV.push(Array.from(f.mav)); R.push(regTargets(q)); }
            else if (ph > 0.05) { MAV.push(Array.from(f.mav)); R.push(regTargets(q)); }
          }
        }
      });
    });
    return { X, Y, MAV, R };
  }
  E.calibrate = function () {
    const t0 = performance.now();
    const tr = record(101, 1.6, [0.7, 1.0]);
    const mavScale = new Array(NCH).fill(0);
    tr.MAV.forEach((m) => m.forEach((v, c) => { mavScale[c] = Math.max(mavScale[c], v); }));
    mavScale.forEach((v, c) => { mavScale[c] = Math.max(v, 1e-3) * 0.8; });
    const lda = trainLDA(tr.X, tr.Y);
    const reg = trainRidge(tr.MAV.map((m) => m.map((v, c) => v / mavScale[c]).concat([1])), tr.R, 0.002);
    E.model = { lda, reg, mavScale };
    // prueba con datos nuevos: matriz de confusión
    const te = record(202, 1.2, [0.85]);
    const conf = Array.from({ length: NG }, () => new Array(NG).fill(0));
    let ok = 0;
    te.X.forEach((x, i) => { const p = ldaProbs(lda, x); const k = p.indexOf(Math.max(...p)); conf[te.Y[i]][k]++; if (k === te.Y[i]) ok++; });
    // nivel de activación medio de cada gesto hecho a fondo (referencia del control proporcional)
    const lv2 = new Array(NG).fill(0), c3 = new Array(NG).fill(0);
    const te2 = record(303, 1.0, [1.0]);
    te2.X.forEach((x, i) => { const m = x.filter((_, j) => j % 4 === 0).map(Math.exp); lv2[te2.Y[i]] += m.reduce((s, v, c) => s + v / mavScale[c], 0) / NCH; c3[te2.Y[i]]++; });
    E.model.classLevel = lv2.map((v, k) => v / Math.max(1, c3[k]));
    // error de la regresión en la prueba
    let se = 0, sn = 0;
    te.MAV.forEach((m, i) => { const x = m.map((v, c) => v / mavScale[c]).concat([1]); const o = reg[0].map((_, k) => x.reduce((s, v, j) => s + v * reg[j][k], 0)); o.forEach((v, k) => { se += (v - te.R[i][k]) ** 2; sn++; }); });
    E.model.acc = ok / te.X.length; E.model.conf = conf; E.model.nTrain = tr.X.length; E.model.nTest = te.X.length;
    E.model.regRmse = Math.sqrt(se / sn); E.model.ms = performance.now() - t0;
    L.votes = [];
    return E.model;
  };

  E.reset = function () {
    L.gen = makeGen(11); L.dsp = makeDSP(); L.votes = []; L.env.fill(0);
  };
})();
