/* Las cuatro formas de mover un dedo, sobre la misma mano (lámina de Huiwei HWR-1, "Inside the transmission"):
   - bielas: lo que ya tiene la mano (servos adentro y bielas rígidas a cada falange);
   - tendones: los servos se van al antebrazo y tiran de cables que pasan por poleas en cada articulación;
   - engranajes: un motor por articulación y un tren de reducción hasta un engranaje fijo a la falange;
   - tornillo de rodillos: un motor gira un husillo, la tuerca avanza y empuja la falange con una biela corta.
   Cada opción cambia lo que se ve y cómo sigue la mano al comando (retraso, juego, velocidad máxima).
   El pulgar queda con bielas en engranajes y tornillo de rodillos; con tendones también se mueve con cables. */
(function () {
  const T = THREE, MB = window.MB, G = MB.Geo;

  const MODES = ['bielas', 'tendones', 'engranajes', 'husillo'];
  // Comparación cualitativa (1 a 5, más es mejor) y cómo se comporta en la demo
  MB.TRANS = {
    bielas: {
      n: 'Bielas', sub: 'servos en la mano', demo: 'Rígida: el dedo sigue al servo sin retraso ni juego.',
      pros: 'Simple, precisa y fácil de armar con acrílico y acero.', cons: 'Los servos ocupan la palma y las falanges; la mano pesa.',
      s: { fuerza: 3, velocidad: 4, precision: 4, liviana: 3, amano: 3, silencio: 3, mantenimiento: 4 },
      asm: '',
    },
    tendones: {
      n: 'Tendones', sub: 'cables y poleas', demo: 'Elástica: unos 60 ms de retraso y un pequeño rebote al frenar.',
      pros: 'Mano muy liviana, motores en el antebrazo, se adapta al objeto.', cons: 'Hay que tensar los cables, se estiran y se gastan.',
      s: { fuerza: 3, velocidad: 5, precision: 2, liviana: 5, amano: 4, silencio: 4, mantenimiento: 2 },
      asm: 'van 12 servos en el antebrazo en vez de 16 en la mano, cada uno con su carrete. En lugar de bielas, cada tendón pasa por su funda de PTFE en la muñeca y por las poleas de cada articulación hasta la yema. Con la mano abierta y los servos en el centro, tensar con los resortes hasta que no quede ninguno flojo.',
    },
    engranajes: {
      n: 'Engranajes', sub: 'motor y reducción', demo: 'Con juego: al invertir el sentido el dedo se queda quieto 1,7° antes de seguir.',
      pros: 'Mucha fuerza y control fino en cada articulación.', cons: 'Más pesada y ruidosa; el juego entre dientes resta precisión.',
      s: { fuerza: 4, velocidad: 3, precision: 3, liviana: 2, amano: 2, silencio: 2, mantenimiento: 3 },
      asm: 'en lugar de los servos de los dedos va un micromotor N20 en cada MCP y PIP, con un tren de 3 engranajes hasta el engranaje fijo a la falange. Ajustar la distancia entre ejes para que los dientes engranen sin trabarse. El pulgar y la biela en S de la punta quedan como con bielas.',
    },
    husillo: {
      n: 'Tornillo de rodillos', sub: 'actuador lineal', demo: 'Lenta pero firme: hasta 230°/s y sin temblor.',
      pros: 'La que más fuerza y precisión da; la usan manos humanoides de gama alta.', cons: 'Cara y lenta; casi no se puede mover a mano.',
      s: { fuerza: 5, velocidad: 2, precision: 5, liviana: 2, amano: 1, silencio: 4, mantenimiento: 4 },
      asm: 'en lugar de los servos de los dedos van actuadores lineales: uno sobre el dorso de la palma por dedo (MCP) y uno sobre cada falange proximal (PIP), con una biela corta de la tuerca a la palanca. Con la mano abierta, llevar cada tuerca al tope de abajo antes de unir la biela. El pulgar y la biela en S de la punta quedan como con bielas.',
    },
  };
  MB.TRANS_KEYS = { fuerza: 'Fuerza', velocidad: 'Velocidad', precision: 'Precisión', liviana: 'Liviana', amano: 'Se mueve a mano', silencio: 'Silenciosa', mantenimiento: 'Poco mantenimiento' };

  const TR = (MB.trans = { mode: 'bielas', groups: {}, cables: [], gears: [], screws: [], spools: [], st: null });

  // ---------- Geometrías ----------
  // Engranaje recto de radio primitivo r (módulo 1: un diente cada 2 mm de diámetro), eje sobre X
  G.gear = function (r, th) {
    const n = Math.max(8, Math.round(2 * r)), m = (2 * r) / n, ro = r + m * 0.9, ri = r - m * 1.1, p = (Math.PI * 2) / n;
    const s = new T.Shape();
    for (let i = 0; i < n; i++) {
      const a = i * p;
      [[ri, a - p * 0.5], [ri, a - p * 0.27], [ro, a - p * 0.13], [ro, a + p * 0.13], [ri, a + p * 0.27]].forEach((q, j) => {
        const x = Math.cos(q[1]) * q[0], y = Math.sin(q[1]) * q[0];
        if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y);
      });
    }
    const hole = new T.Path(); hole.absarc(0, 0, Math.min(1.2, r * 0.3), 0, Math.PI * 2, true); s.holes.push(hole);
    const g = new T.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -th / 2); g.rotateY(Math.PI / 2); g.computeVertexNormals();
    return g;
  };
  // Rosca: hélice de alambre alrededor de un cilindro, sobre +Y
  G.helix = function (R, L, pitch, r) {
    const pts = [], turns = L / pitch, n = Math.ceil(turns * 14);
    for (let i = 0; i <= n; i++) { const a = (i / n) * turns * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * R, (i / n) * L, Math.sin(a) * R)); }
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts), n, r, 5, false);
  };
  const cylX = (r, len, key, mat) => { const m = MB.mesh(G.cyl(r, len, 16), key, mat); m.rotation.z = Math.PI / 2; return m; };
  const anchor = (parent, x, y, z) => { const o = new T.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

  // ---------- Armado de las cuatro variantes sobre el robot ya construido ----------
  MB.buildTransmissions = function (R) {
    MB.step(null); // estas piezas no entran en el armado paso a paso (que está hecho para bielas)
    const hand = R.hand, hr = hand.root, s = hand.s, di = MB.dofIdx;
    MODES.forEach((k) => { TR.groups[k] = []; });
    const own = (mode, obj) => { TR.groups[mode].push(obj); return obj; };

    // qué hace falta esconder de la versión con bielas en cada modo
    const fingerServos = [], thumbServos = [], fingerBars = [], dipBars = [], thumbBars = [];
    hand.fingers.forEach((f) => ['Mcp', 'Abd', 'Pip'].forEach((j) => fingerServos.push(R.servos[di[f.F.id + j]].g)));
    ['tAbd', 'tFlex', 'tMcp', 'tIp'].forEach((k) => thumbServos.push(R.servos[di[k]].g));
    R.bars.forEach((b, i) => { if (i >= 16) thumbBars.push(b.m); else if (i % 4 === 3) dipBars.push(b.m); else fingerBars.push(b.m); });
    TR.hide = {
      bielas: [],
      tendones: [...fingerServos, ...thumbServos, ...fingerBars, ...dipBars, ...thumbBars],
      engranajes: [...fingerServos, ...fingerBars],
      husillo: [...fingerServos, ...fingerBars],
    };

    // ===== Tendones =====
    // 12 servos en el antebrazo, cada uno con un carrete: flexor y extensor de cada dedo y 4 para el pulgar
    const bank = new T.Group(); R.root.add(bank); own('tendones', bank);
    const cols = [-16, 0, 16], rows = [45, 80, 115, 150];
    const spoolAt = [];
    rows.forEach((y) => cols.forEach((x) => {
      const sv = MB.robotMicro('servo');
      sv.g.position.set(x, y, -6);
      bank.add(MB.tag(sv.g, 'servo', { explode: [0, 0, -40] }));
      const sp = MB.mesh(G.cyl(5, 6, 18), 'carretes', 'spool'); sp.rotation.x = Math.PI / 2; sp.position.z = 3; sv.horn.add(MB.tag(sp, 'carretes'));
      [-1, 1].forEach((e) => { const fl = MB.mesh(G.cyl(6.4, 0.8, 18), 'carretes', 'spool'); fl.rotation.x = Math.PI / 2; fl.position.z = 3 + e * 3.2; sv.horn.add(fl); });
      TR.spools.push(sv);
      spoolAt.push(anchor(sv.g, 0, 5.9 + 5, 18.5 + 3));
    }));
    // tensores: un resorte por columna, justo antes de la muñeca
    cols.forEach((x) => [-1, 1].forEach((sz) => {
      const sp = MB.mesh(G.helix(2.2, 18, 1.6, 0.45), 'tensores', 'steel'); sp.position.set(x, 168, sz * 9);
      bank.add(MB.tag(sp, 'tensores', { explode: [0, 25, 0] }));
    }));
    const WY = R.wrist.position.y;
    // poleas: un disco en cada articulación que asoma 1,2 mm por los bordes de las placas
    const pulley = (parent, r, mode) => { const p = cylX(r, 2.4, 'poleas', 'steel'); parent.add(MB.tag(p, 'poleas', { explode: [0, 0, 12] })); return own(mode, p); };
    const cable = (pts, dof) => TR.cables.push({ pts, dof, segs: [] });
    hand.fingers.forEach((f, i) => {
      const F = f.F, L = F.L.map((v) => v * s), t = [16, 14, 12.5, 10].map((v) => (v * s) / 2 + 1.4);
      pulley(f.mcp, t[0] - 0.6, 'tendones'); pulley(f.pip, t[1] - 0.6, 'tendones'); pulley(f.dip, t[2] - 0.6, 'tendones');
      [1, -1].forEach((sz, k) => {
        const col = cols[i % 3] + (sz > 0 ? -2 : 2);
        cable([
          spoolAt[(i * 2 + k) % 12],
          anchor(R.root, col * 0.6, WY - 24, sz * 9),
          anchor(R.wrist, F.x * s * 0.4, 4, sz * 9),
          anchor(hr, F.x * s, 18 * s, sz * 9),
          anchor(hr, F.x * s, (F.y - 14) * s, sz * 10),
          anchor(f.abd, 0, 0, sz * t[0]),
          anchor(f.p1, 0, L[0], sz * t[1]),
          anchor(f.p2, 0, L[1], sz * t[2]),
          anchor(f.p3, 0, L[2] * (sz > 0 ? 0.72 : 0.4), sz * t[3]),
        ], i);
      });
    });
    const th = hand.thumb, TL = [44, 32, 26].map((v) => v * s), tt = [19, 16, 14, 11].map((v) => (v * s) / 2 + 1.4);
    pulley(th.flex, tt[0] - 0.6, 'tendones'); pulley(th.mcp, tt[1] - 0.6, 'tendones'); pulley(th.ip, tt[2] - 0.6, 'tendones');
    [1, -1].forEach((sz, k) => cable([
      spoolAt[8 + k], anchor(R.root, 10, WY - 24, sz * 9), anchor(R.wrist, 12, 4, sz * 9), anchor(hr, 26 * s, 8 * s, sz * 8),
      anchor(th.base, 0, -6, sz * 8), anchor(th.flex, 0, 0, sz * tt[0]), anchor(th.t1, 0, TL[0], sz * tt[1]),
      anchor(th.t2, 0, TL[1], sz * tt[2]), anchor(th.t3, 0, TL[2] * (sz > 0 ? 0.7 : 0.4), sz * tt[3]),
    ], 4));
    // abducción y oposición del pulgar: un cable a cada lado del metacarpiano
    [1, -1].forEach((sx, k) => cable([
      spoolAt[10 + k], anchor(R.root, 16, WY - 24, 0), anchor(R.wrist, 16, 4, 0), anchor(hr, 30 * s, 6 * s, 0),
      anchor(th.t1, sx * (tt[0] - 1), TL[0] * 0.35, 0),
    ], 4));
    TR.cables.forEach((c) => {
      for (let j = 0; j < c.pts.length - 1; j++) {
        const m = MB.mesh(new T.CylinderGeometry(0.7, 0.7, 1, 6).translate(0, 0.5, 0), 'cableTendon', 'tendon');
        m.castShadow = false; MB.root3d().add(MB.tag(m, 'cableTendon', { shadow: false }));
        c.segs.push(own('tendones', m));
      }
    });

    // ===== Engranajes =====
    // en cada MCP y PIP: engranaje fijo a la falange (gira con la articulación), un engranaje doble de reducción
    // y el piñón del motor; el tren sube hacia el dorso para que se vea sobre la mano
    const train = (parentFix, joint, Rout, dir1, dir2, motorLen) => {
      const out = MB.mesh(G.gear(Rout, 2.6), 'engranajes', 'brass'); out.position.x = -1.5; joint.add(MB.tag(out, 'engranajes', { explode: [-14, 0, 0] })); own('engranajes', out);
      const c = new T.Group(); c.position.set(0, joint.position.y + dir1[0] * (Rout + 4.5), joint.position.z + dir1[1] * (Rout + 4.5)); parentFix.add(c); own('engranajes', c);
      const cs = MB.mesh(G.gear(4.5, 2.6), 'engranajes', 'steel'); cs.position.x = -1.5; c.add(MB.tag(cs, 'engranajes'));
      const cb = MB.mesh(G.gear(8, 2.6), 'engranajes', 'brass'); cb.position.x = 1.5; c.add(MB.tag(cb, 'engranajes', { explode: [14, 0, 0] }));
      const mp = new T.Group(); mp.position.set(0, c.position.y + dir2[0] * 11.5, c.position.z + dir2[1] * 11.5); parentFix.add(mp); own('engranajes', mp);
      const pin = MB.mesh(G.gear(3.5, 2.6), 'engranajes', 'steel'); pin.position.x = 1.5; mp.add(pin);
      const mot = cylX(4.2, motorLen, 'motorEngranajes', 'servo'); mot.position.x = -motorLen / 2 - 0.5; mp.add(MB.tag(mot, 'motorEngranajes', { explode: [-20, 0, 0] }));
      const cap = cylX(4.4, 1.2, 'motorEngranajes', 'alu'); cap.position.x = -motorLen - 0.8; mp.add(cap);
      TR.gears.push({ joint, c, mp, k1: Rout / 4.5, k2: (Rout / 4.5) * (8 / 3.5) });
    };
    hand.fingers.forEach((f) => {
      train(f.abd, f.mcp, 10, [-0.6, -0.8], [-0.35, -0.94], 12);
      train(f.p1, f.pip, 8, [-0.55, -0.83], [-0.9, -0.42], 10);
    });
    // la DIP sigue acoplada con la biela en S, igual que con bielas

    // ===== Tornillo de rodillos =====
    // MCP: actuador sobre el dorso de la palma, con la tuerca empujando una palanca dorsal de la falange proximal;
    // PIP: uno más chico sobre el dorso de la falange proximal
    const actuator = (parent, x, y0, z, lenM, lenS, rM, joint, lever, kmm, dof) => {
      const g = new T.Group(); g.position.set(x, y0, z); parent.add(g); own('husillo', g);
      const mot = MB.mesh(G.cyl(rM, lenM, 18), 'husillos', 'servo'); mot.position.y = lenM / 2; g.add(MB.tag(mot, 'husillos', { explode: [0, 0, -30] }));
      const cap = MB.mesh(G.cyl(rM + 0.2, 1.4, 18), 'husillos', 'alu'); cap.position.y = 0.7; g.add(cap);
      const rodR = rM * 0.42;
      const rod = MB.mesh(G.cyl(rodR, lenS, 12), 'husillos', 'steel'); rod.position.y = lenM + lenS / 2; g.add(rod);
      const thr = MB.mesh(G.helix(rodR + 0.25, lenS, 1, 0.32), 'husillos', 'steel'); thr.position.y = lenM; g.add(thr);
      const nut = new T.Group(); g.add(nut);
      const body = MB.mesh(G.cyl(rodR * 2.1, 6, 6), 'husillos', 'brass'); nut.add(body);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, rl = MB.mesh(G.cyl(0.7, 6.4, 8), 'husillos', 'steel'); rl.position.set(Math.cos(a) * rodR * 1.45, 0, Math.sin(a) * rodR * 1.45); nut.add(rl); }
      const pinA = anchor(nut, 0, 0, -rodR * 2.1 - 1);
      const bar = MB.mesh(new T.BufferGeometry(), 'husillos', 'steel'); bar.userData.r = 1.1; bar.userData.rod = true; MB.root3d().add(MB.tag(bar, 'husillos'));
      R.bars.push({ a: pinA, b: anchor(joint, 0, lever[0], lever[1]), m: bar, r: 1.1 });
      own('husillo', bar);
      TR.screws.push({ nut, rod: thr, y0: lenM + 4, lenS, dof, kmm });
    };
    hand.fingers.forEach((f) => {
      const F = f.F, tMid = 7.5 * s;
      // la base del dedo está girada (splay): el actuador va derecho sobre la palma, a la altura del dedo
      actuator(hr, F.x * s, (F.y - 62) * s, -(14 * s + 9), 22, 26, 5, f.mcp, [5, -(tMid + 7)], 14, di[F.id + 'Mcp']);
      actuator(f.p1, 0, F.L[0] * s * 0.08, -(8 * s + 6), 12, 16, 3.4, f.pip, [5, -(6.6 * s + 6)], 9, di[F.id + 'Pip']);
    });

    TR.st = { x: new Array(MB.NDOF).fill(0), v: new Array(MB.NDOF).fill(0) };
    MB.setTransmission(TR.mode);
  };

  // la escena (donde cuelgan bielas y cables, en coordenadas de mundo)
  MB.root3d = () => MB.robot.root.parent;

  // ---------- Cambio de modo ----------
  MB.setTransmission = function (mode) {
    if (!MODES.includes(mode)) mode = 'bielas';
    TR.mode = mode;
    if (!TR.st) return;
    TR.st.x = MB.robot.q.slice(); TR.st.v.fill(0);
    if (MB.human && MB.ui && MB.ui.applyIsolation) MB.ui.applyIsolation();
    TR.enforce();
  };
  // el modo que se ve: durante el armado paso a paso siempre bielas
  TR.shown = () => (MB.asm && MB.asm.active ? 'bielas' : TR.mode);
  TR.enforce = function () {
    const m = TR.shown();
    MODES.forEach((k) => { if (k !== 'bielas') TR.groups[k].forEach((o) => { o.visible = k === m; }); });
    (TR.hide[m] || []).forEach((o) => { o.visible = false; });
    if (m !== TR._last) {
      // al volver, lo que estaba escondido vuelve a quedar como lo deja el aislamiento de la lista de partes
      MODES.forEach((k) => { if (k !== m) (TR.hide[k] || []).forEach((o) => { if (!(TR.hide[m] || []).includes(o)) o.visible = true; }); });
      TR._last = m;
      if (MB.human && MB.ui && MB.ui.applyIsolation) MB.ui.applyIsolation();
      (TR.hide[m] || []).forEach((o) => { o.visible = false; });
    }
  };

  // ---------- Cómo sigue la mano al comando en cada transmisión ----------
  // tendones: segundo orden (6 Hz, amortiguamiento 0,45) · engranajes: juego de 0,03 rad · husillo: 4 rad/s como máximo
  TR.filter = function (q, dt) {
    const st = TR.st, m = TR.mode;
    if (!st || m === 'bielas') { if (st) { st.x = q.slice(); st.v.fill(0); } return q; }
    const out = q.slice();
    for (let i = 0; i < 16; i++) {
      const thumb = i < 4;
      if (thumb && m !== 'tendones') { st.x[i] = q[i]; st.v[i] = 0; continue; }
      if (m === 'tendones') {
        const w = Math.PI * 2 * 6, z = 0.45, n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
        for (let k = 0; k < n; k++) { const a = w * w * (q[i] - st.x[i]) - 2 * z * w * st.v[i]; st.v[i] += a * h; st.x[i] += st.v[i] * h; }
      } else if (m === 'engranajes') {
        const b = 0.03, d = q[i] - st.x[i];
        if (d > b) st.x[i] = q[i] - b; else if (d < -b) st.x[i] = q[i] + b;
      } else {
        const maxv = 4 * dt, d = q[i] - st.x[i];
        st.x[i] += Math.max(-maxv, Math.min(maxv, d));
      }
      out[i] = MB.DOF[i] ? Math.max(MB.DOF[i].lo - 0.08, Math.min(MB.DOF[i].hi + 0.08, st.x[i])) : st.x[i];
    }
    return out;
  };

  // ---------- Dibujo de cada cuadro ----------
  const _a = new T.Vector3(), _b = new T.Vector3(), _d = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
  TR.update = function () {
    if (!TR.st) return;
    TR.enforce();
    const m = TR.shown(), q = MB.robot.q;
    if (m === 'tendones') {
      TR.cables.forEach((c) => c.segs.forEach((seg, j) => {
        c.pts[j].getWorldPosition(_a); c.pts[j + 1].getWorldPosition(_b);
        _d.subVectors(_b, _a); const len = Math.max(0.01, _d.length());
        seg.position.copy(_a); seg.quaternion.setFromUnitVectors(Y, _d.normalize()); seg.scale.set(1, len, 1);
      }));
      // cada carrete gira lo que tiene que enrollar su cable
      TR.spools.forEach((sv, k) => {
        const fi = Math.floor(k / 2), sgn = k % 2 ? -1 : 1;
        let a;
        if (fi < 4) { const b = 4 + fi * 3; a = q[b + 1] * 1.6 + q[b + 2] * 1.4; } else if (k < 10) a = q[2] * 1.4 + q[3] * 1.2 + q[1]; else a = q[0] * 2;
        sv.horn.rotation.z = sgn * a;
      });
    } else if (m === 'engranajes') {
      TR.gears.forEach((g) => { const t = g.joint.rotation.x; g.c.rotation.x = -t * g.k1; g.mp.rotation.x = t * g.k2; });
    } else if (m === 'husillo') {
      TR.screws.forEach((sc) => {
        const y = Math.max(0, Math.min(sc.lenS - 6, (q[sc.dof] + 0.25) * sc.kmm * 0.7));
        sc.nut.position.y = sc.y0 + y;
        sc.rod.rotation.y = y * Math.PI * 2; // 1 mm de avance por vuelta
      });
    }
  };

  // ---------- Lo que manda el ESP32 en cada caso (para la consola del bus) ----------
  TR.busLine = function (q) {
    const m = TR.mode;
    if (m === 'tendones') {
      const pos = TR.spools.map((sv) => Math.round(2048 + (sv.horn.rotation.z / (2 * Math.PI)) * 4096));
      return `TX SYNC WRITE · 12 carretes en el antebrazo · pos ${pos.slice(0, 4).join('/')}… · cable índice ${((q[5] * 1.6 + q[6] * 1.4) * 5).toFixed(1)} mm`;
    }
    if (m === 'engranajes') {
      const tk = (v) => Math.round(v * 5.1 * 2.3 * 12 * 30 / (2 * Math.PI) * 4);
      return `TX motores DC + encoder (12 PPR, caja 30:1, tren 11,6:1) · índice MCP ${tk(q[5])} / PIP ${tk(q[6])} cuentas`;
    }
    if (m === 'husillo') {
      const mm = (v) => Math.max(0, (v + 0.25) * 14 * 0.7);
      return `TX actuadores lineales · paso 1 mm · índice ${mm(q[5]).toFixed(1)} mm (${mm(q[5]).toFixed(1)} vueltas) · medio ${mm(q[8]).toFixed(1)} mm`;
    }
    return null;
  };
})();
