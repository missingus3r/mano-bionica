/* Tu propia mano controla la simulación: con un Leap Motion o con la cámara web (MediaPipe, ver webcam.js).
   El navegador no puede hablar con LeapC; leap/leap_bridge.py lo lee y sirve en http://127.0.0.1:8798
   la mano (/stream, Server-Sent Events) y la cámara infrarroja (/cam.mjpg).
   Cada cuadro, las 21 articulaciones se pasan a los 17 grados de libertad de la simulación, medidos en los ejes
   de la propia palma (así da igual dónde esté la mano o si es la izquierda). */
(function () {
  const MB = window.MB, E = MB.EMG;
  const URL0 = 'http://127.0.0.1:8798';
  const LP = (MB.leap = { es: null, state: 'off', last: 0, fps: 0, side: null, hands: 0, raw: null, calib: null });
  E.leap = { q: null, mode: 'emg' };

  // ---------- vectores ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]) || 1e-9;
  const nrm = (a) => { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l]; };
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

  // Ángulos crudos de la mano del Leap (radianes), antes de pasarlos a la escala de la simulación
  function rawAngles(h) {
    const J = h.joints;
    // ejes de la palma: n sale de la palma, d va de la muñeca a los dedos, r apunta al pulgar
    const n = nrm(h.palmN);
    const d = nrm(add(h.palmD, n, -dot(h.palmD, n)));
    const r = h.side === 'right' ? cross(d, n) : cross(n, d);
    const R = { fingers: [], thumb: null, wrist: 0 };
    [5, 9, 13, 17].forEach((b) => {
      const p = nrm(sub(J[b + 1], J[b])), m = nrm(sub(J[b + 2], J[b + 1])), t = nrm(sub(J[b + 3], J[b + 2]));
      // la MCP se mide contra el metacarpiano de ese dedo (muñeca → nudillo) y no contra la dirección general de la
      // palma: si la palma se estima torcida (pasa con la cámara web), se tuercen los dos y el error se cancela
      const mc = nrm(sub(J[b], J[0])), nm = nrm(add(n, mc, -dot(n, mc)));
      R.fingers.push({
        mcp: Math.atan2(dot(p, nm), dot(p, mc)), // hacia la palma = positivo
        pip: ang(p, m), dip: ang(m, t),
        abd: Math.atan2(dot(p, r), dot(p, d)), // hacia el pulgar = positivo
      });
    });
    const t0 = nrm(sub(J[2], J[1])), t1 = nrm(sub(J[3], J[2])), t2 = nrm(sub(J[4], J[3]));
    R.thumb = {
      spread: Math.atan2(dot(t0, r), dot(t0, d)), // se abre hacia afuera, en el plano de la palma
      opp: Math.atan2(dot(t0, n), Math.hypot(dot(t0, d), dot(t0, r))), // sale hacia adelante de la palma
      mcp: ang(t0, t1), ip: ang(t1, t2),
    };
    // muñeca: dirección del antebrazo (codo → muñeca) contra la de la mano
    const a = nrm(sub(J[0], h.elbow));
    R.wrist = Math.atan2(-dot(a, n), dot(a, d));
    return R;
  }

  // Valores de referencia con la mano abierta y relajada (se ajustan con «Calibrar mano abierta»)
  const DEF = { abd: [0.1, 0, -0.07, -0.16], wrist: 0 };
  // Pulgar: cuánto se abre y cuánto se opone salen de una regresión lineal hecha sobre el modelo de la mano
  // (400 posturas al azar, error ~6°). Calibrar con la mano abierta solo corre el cero hacia tu pulgar real.
  const TH = { a0: -1.813, b0: 0.85, c0: 4.371, a1: -1.415, b1: -0.698, c1: 3.749 };
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  function toQ(R) {
    const C = LP.calib || DEF, q = MB.GESTURES[0].q.slice();
    const T = R.thumb;
    // con la mano abierta calibrada, el pulgar tiene que dar la postura «abrir» (0,95 y −0,05)
    const s0 = C.spread !== undefined ? 0.95 - (TH.a0 + TH.b0 * C.spread + TH.c0 * C.opp) : 0;
    const s1 = C.spread !== undefined ? -0.05 - (TH.a1 + TH.b1 * C.spread + TH.c1 * C.opp) : 0;
    q[0] = cl(TH.a0 + TH.b0 * T.spread + TH.c0 * T.opp + s0, 0, 1.05);
    q[1] = cl(TH.a1 + TH.b1 * T.spread + TH.c1 * T.opp + s1, -0.1, 1.15);
    q[2] = cl(T.mcp * 1.1, -0.1, 0.95);
    q[3] = cl(T.ip * 1.0, -0.15, 1.25);
    const SG = [1, 1, -1, -1];
    R.fingers.forEach((f, i) => {
      q[4 + i * 3] = cl(SG[i] * (f.abd - C.abd[i]) * 1.2, -0.3, 0.35);
      q[5 + i * 3] = cl(f.mcp, -0.25, 1.57);
      // la PIP de la simulación arrastra la DIP: se usa el promedio de lo que dobla cada una
      q[6 + i * 3] = cl((f.pip + f.dip / 0.72) / 2, 0, 1.75);
    });
    q[16] = cl((R.wrist - C.wrist) / 0.85, -1, 1);
    return MB.clampQ(q);
  }
  MB.leapToQ = (h) => toQ(rawAngles(h));

  // ---------- conexión ----------
  const $ = (s) => document.querySelector(s);
  // Dos fuentes posibles para la mano: el Leap Motion (por el puente) o la cámara web con MediaPipe (en el navegador)
  LP.src = 'leap';
  LP.calibs = {};
  const SRC_N = { leap: 'Leap', cam: 'cámara' };
  const active = () => !!LP.es || MB.webcam.on || LP.starting;
  function setState(s, txt) {
    LP.state = s;
    const el = $('#leapSt'); if (!el) return;
    el.textContent = txt; el.className = 'pill ' + s;
    $('#leapBtn').textContent = s === 'off' || s === 'nobridge' || s === 'nocam' ? (LP.src === 'leap' ? 'Conectar Leap' : 'Encender cámara') : 'Desconectar';
    $('#leapCal').disabled = s !== 'hand';
    $('#leapHelp').hidden = !(s === 'nobridge' && LP.src === 'leap');
    $('#camHelp').hidden = LP.src !== 'cam';
    document.body.classList.toggle('leapOn', s === 'hand');
    document.querySelectorAll('input[name=handSrc]').forEach((r) => { r.disabled = active() && r.value !== LP.src; });
  }
  // cada cuadro de cualquiera de las dos fuentes entra por acá
  function feed(h, fps) {
    LP.fps = fps; LP.hands = 1;
    LP.raw = rawAngles(h); LP.side = h.side; LP.last = performance.now(); LP.grab = h.grab;
    E.leap.q = toQ(LP.raw);
  }
  function showPanel(src) {
    $('#leapImg').hidden = src !== 'leap'; $('#camCanvas').hidden = src !== 'cam';
    $('#leapCamTitle').textContent = src === 'leap' ? 'Cámara del Leap · infrarrojo' : 'Cámara web · MediaPipe';
    $('#leapCam').hidden = false; $('#tLeap').classList.add('on');
  }
  function connect() {
    if (active()) { disconnect(); return; }
    LP.calib = LP.calibs[LP.src] || null;
    if (LP.src === 'cam') { startCam(); return; }
    setState('wait', 'conectando…');
    const es = new EventSource(URL0 + '/stream');
    LP.es = es;
    es.onopen = () => {
      setState('nohand', 'sin mano a la vista');
      $('#leapImg').src = URL0 + '/cam.mjpg?' + Date.now();
      showPanel('leap');
      MB.log('▶ Leap Motion conectado: poné la mano sobre el sensor', 'hdr');
    };
    es.onerror = () => {
      if (es.readyState === 2 || LP.state === 'wait') { disconnect(); setState('nobridge', 'no hay puente'); }
    };
    es.onmessage = (ev) => {
      const fr = JSON.parse(ev.data);
      LP.hands = fr.hands.length;
      // si hay dos manos, se usa la derecha
      const h = fr.hands.find((x) => x.side === 'right') || fr.hands[0];
      if (h) feed(h, fr.fps);
    };
  }
  async function startCam() {
    LP.starting = true;
    setState('wait', 'preparando…');
    try {
      await MB.webcam.start($('#camVideo'), $('#camCanvas'), feed, (t) => { $('#leapSt').textContent = t; });
      LP.starting = false;
      setState('nohand', 'sin mano a la vista');
      showPanel('cam');
      MB.log('▶ Cámara web con MediaPipe: mostrá la mano a la cámara', 'hdr');
    } catch (e) {
      LP.starting = false; MB.webcam.stop();
      const why = (e.name || '') + ' ' + (e.message || '');
      const msg = /Permission|NotAllowed/i.test(why) ? 'sin permiso de cámara' : /NotFound|Devices|NotReadable/i.test(why) ? 'no hay cámara libre' : 'no cargó MediaPipe';
      setState('nocam', msg);
      MB.log('✗ Cámara web: ' + why.trim(), 'err');
    }
  }
  function disconnect() {
    if (LP.es) LP.es.close();
    LP.es = null; E.leap.q = null; LP.starting = false;
    MB.webcam.stop();
    $('#leapImg').removeAttribute('src');
    $('#leapCam').hidden = true; $('#tLeap').classList.remove('on');
    setState('off', 'sin conectar');
  }
  MB.leapConnect = connect;

  // la mano se pierde si no llega nada por medio segundo: vuelve el control normal
  MB.leapTick = function () {
    if (!LP.es && !MB.webcam.on) return;
    const seen = performance.now() - LP.last < 500;
    if (!seen && E.leap.q) { E.leap.q = null; MB.log('· ' + SRC_N[LP.src] + ': se perdió la mano', 'err'); }
    const want = seen ? 'hand' : 'nohand';
    const txt = () => 'mano ' + (LP.side === 'right' ? 'derecha' : 'izquierda') + ' · ' + Math.round(LP.fps) + ' fps';
    if (LP.state !== want && LP.state !== 'wait') setState(want, seen ? txt() : 'sin mano a la vista');
    else if (seen && Math.random() < 0.05) $('#leapSt').textContent = txt();
  };

  MB.initLeap = function () {
    $('#leapBtn').onclick = connect;
    $('#leapCal').onclick = () => {
      const R = LP.raw; if (!R) return;
      LP.calib = LP.calibs[LP.src] = { abd: R.fingers.map((f) => f.abd), spread: R.thumb.spread, opp: R.thumb.opp, wrist: R.wrist };
      try { localStorage.setItem('mb-hand-calib', JSON.stringify(LP.calibs)); } catch (e) {}
      MB.toast('Listo: esa es tu mano abierta y relajada');
    };
    try { LP.calibs = JSON.parse(localStorage.getItem('mb-hand-calib') || '{}') || {}; } catch (e) { LP.calibs = {}; }
    document.querySelectorAll('input[name=leapMode]').forEach((r) => { r.onchange = () => { E.leap.mode = r.value; }; });
    document.querySelectorAll('input[name=handSrc]').forEach((r) => { r.onchange = () => { LP.src = r.value; setState('off', 'sin conectar'); }; });
    $('#tLeap').onclick = () => { const c = $('#leapCam'); if (!active()) { connect(); return; } c.hidden = !c.hidden; $('#tLeap').classList.toggle('on', !c.hidden); };
    setState('off', 'sin conectar');
  };
})();
