/* Mano robótica de placas de acrílico con los servos adentro, al estilo de la Hiwonder uHand y de las manos diestras
   comerciales (AgiBot OmniHand, Sharpa Wave): bielas rígidas a cada falange.
   17 GDL con 16 micro servos Feetech SCS0009 y 1 SCS15:
   - palma: 2 servos por dedo en diferencial (como la AmazingHand de Pollen): si giran juntos flexionan la MCP,
     si giran opuestos separan el dedo; más la abducción del pulgar, con varilla de latón;
   - dentro de la falange proximal: el servo de la PIP; la DIP la sigue con una biela en S cruzada;
   - pulgar: oposición sobre el módulo que gira, MCP en el metacarpiano, IP en la falange proximal;
   - muñeca: SCS15 de doble eje montado directo en la horquilla. */
(function () {
  const T = THREE, MB = window.MB, G = MB.Geo;
  const PL = 3; // espesor del acrílico, mm

  // Placa de acrílico con forma de estadio (dos círculos unidos) en el plano YZ, espesor a lo largo de X
  G.stadium = function (len, r0, r1, tip) {
    const s = new T.Shape();
    s.absarc(0, 0, r0, Math.PI, Math.PI * 2, false);
    if (tip) { s.lineTo(r1, len - r1 * 0.2); s.quadraticCurveTo(r1 * 0.9, len + r1 * 1.4, -r1 * 0.2, len + r1 * 0.9); s.lineTo(-r1, len - r1 * 0.4); }
    else { s.lineTo(r1, len); s.absarc(0, len, r1, 0, Math.PI, false); }
    s.lineTo(-r0, 0);
    const g = new T.ExtrudeGeometry(s, { depth: PL, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 1, curveSegments: 14 });
    g.rotateY(Math.PI / 2); g.translate(-PL / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  };
  // Placa plana con contorno libre en el plano XY, espesor a lo largo de Z
  G.outline = function (pts, thick, holes) {
    const s = new T.Shape(pts.map((p) => new T.Vector2(p[0], p[1])));
    (holes || []).forEach((h) => { s.holes.push(new T.Path([[h[0] - h[2] / 2, h[1] - h[3] / 2], [h[0] + h[2] / 2, h[1] - h[3] / 2], [h[0] + h[2] / 2, h[1] + h[3] / 2], [h[0] - h[2] / 2, h[1] + h[3] / 2]].map((p) => new T.Vector2(p[0], p[1])))); });
    const g = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.35, bevelSegments: 1 });
    g.translate(0, 0, -thick / 2);
    g.computeVertexNormals();
    return g;
  };
  // Biela en S (como las de acero de la foto), de largo L sobre +Y; las rectas (varillas) son cilindros
  G.sbar = function (L, r, straight) {
    if (straight) return new T.CylinderGeometry(r, r, L, 10).translate(0, L / 2, 0);
    const pts = [], A = Math.min(3.5, L * 0.07);
    for (let i = 0; i <= 24; i++) { const v = i / 24; pts.push(new T.Vector3(Math.sin(v * Math.PI * 2) * A, v * L, 0)); }
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts), 32, r, 6, false);
  };

  // Dónde van los servos de la palma (mm sin escalar, centro del cuerpo): los 2 del diferencial de cada dedo, en dos filas
  const FXs = [24, 8, -9, -26];
  const PALM_SERVOS = [];
  ['i', 'm', 'r', 'l'].forEach((id, k) => {
    PALM_SERVOS.push([id + 'Mcp', FXs[k], 68], [id + 'Abd', FXs[k] - 3, 36]);
  });
  PALM_SERVOS.push(['tAbd', 38, 14]);

  // ---------- Partes de la mano (se llaman desde MB.buildHand cuando el estilo es 'robot') ----------
  MB.robotPalm = function (root, s, keys) {
    // contorno de la palma (sin escalar): más ancha en el lado del pulgar
    const P = [[-36, 0], [24, 0], [44, 14], [48, 34], [40, 52], [34, 84], [18, 94], [-6, 96], [-30, 88], [-40, 76], [-41, 18]].map((p) => [p[0] * s, p[1] * s]);
    const zp = 14 * s, zd = -14 * s;
    // la placa dorsal tiene ventanas donde asoma cada servo (como la mano de la foto)
    const win = PALM_SERVOS.map((p) => [p[1] * s, p[2] * s, 13.4, 24.4]);
    [zp, zd].forEach((z, i) => {
      const pl = MB.mesh(G.outline(P, PL, i ? win : null), keys.palm, 'acrylic'); pl.position.z = z;
      root.add(MB.tag(pl, keys.palm, { explode: [0, 0, i ? -45 : 45] }));
    });
    // separadores hexagonales entre las dos placas
    [[-34, 8], [20, 6], [42, 30], [32, 80], [-34, 80], [-6, 90], [0, 30]].forEach((p) => {
      const sp = MB.mesh(G.cyl(2.6, zp - zd, 6), 'separadores', 'brass'); sp.rotation.x = Math.PI / 2;
      sp.position.set(p[0] * s, p[1] * s, 0); root.add(MB.tag(sp, 'separadores', { explode: [0, 0, 20] }));
      [zp + PL / 2, zd - PL / 2].forEach((z) => { const h = MB.mesh(G.sphere(2.4, 10), 'separadores', 'brass'); h.scale.z = 0.45; h.position.set(p[0] * s, p[1] * s, z); root.add(h); });
    });
    // almohadillas de TPU del lado de la palma
    [[-14, 36, 34, 30], [6, 66, 54, 14]].forEach((p) => {
      const pad = MB.mesh(G.rbox(p[2] * s, p[3] * s, 3, 1.3), keys.pad, 'tpu');
      MB.at(pad, p[0] * s, p[1] * s, zp + PL / 2 + 1.5);
      root.add(MB.tag(pad, keys.pad, { explode: [0, 0, 30] }));
    });
  };

  // Falange: dos placas laterales de acrílico, separador hexagonal, tornillo-eje con cabezas a los costados
  MB.robotLink = function (g, len, w0, w1, t0, t1, dist, keys) {
    const gap = w0 / 2 - PL / 2;
    [-1, 1].forEach((sx) => {
      const pl = MB.mesh(G.stadium(len, t0 * 0.5, t1 * 0.5, dist), keys.phal, 'acrylic');
      pl.position.x = sx * gap; g.add(pl);
      const head = MB.mesh(G.cyl(2.7, 1.6, 14), keys.pin, 'steel'); head.rotation.z = Math.PI / 2;
      head.position.x = sx * (gap + PL / 2 + 0.8); g.add(head);
    });
    const sp = MB.mesh(G.cyl(2.4, gap * 2, 6), 'separadores', 'brass'); sp.rotation.z = Math.PI / 2; sp.position.y = len * (dist ? 0.4 : 0.86);
    g.add(sp);
    if (dist) {
      const pad = MB.mesh(G.rbox(w1 * 0.95, len * 0.55, 4, 1.8), keys.pad, 'tpu');
      pad.position.set(0, len * 0.6, t1 * 0.42);
      g.add(MB.tag(pad, keys.pad, { explode: [0, 0, 18] }));
    }
  };

  // ---------- Servos ----------
  // Micro servo de bus (Feetech SCS0009: 23,2 × 12,1 × 25,3 mm). Eje de salida hacia +Z local.
  function micro(key) {
    const g = new T.Group();
    const body = MB.mesh(G.rbox(12.1, 23.2, 21, 1), key, 'servo'); g.add(body);
    const lbl = MB.mesh(G.box(9, 15, 0.3), key, 'servoLbl'); lbl.position.set(0, -2, 10.6); g.add(lbl);
    [-1, 1].forEach((e) => { const sc = MB.mesh(G.cyl(1.3, 1, 8), 'kitTornillos', 'steel'); sc.rotation.x = Math.PI / 2; sc.position.set(0, e * 14, 8); g.add(sc); });
    const ears = MB.mesh(G.rbox(12.1, 32.3, 2.2, 0.6), key, 'servo'); ears.position.z = 6.5; g.add(ears);
    const boss = MB.mesh(G.cyl(3.2, 8, 14), key, 'servo'); boss.rotation.x = Math.PI / 2; boss.position.set(0, 5.9, 14); g.add(boss);
    const horn = new T.Group(); horn.position.set(0, 5.9, 18.5); g.add(horn);
    const arm = MB.mesh(G.rbox(5, 13, 1.6, 0.7), 'horns', 'horn'); arm.position.y = 4.5; horn.add(arm);
    const hub = MB.mesh(G.cyl(3.4, 2.2, 16), 'horns', 'horn'); hub.rotation.x = Math.PI / 2; horn.add(hub);
    const tip = new T.Object3D(); tip.position.set(0, 9, 1.2); horn.add(tip);
    return { g, horn, tip };
  }
  // Servo estándar de bus para la muñeca (Feetech SCS15: 40,5 × 20 × 40,5 mm)
  function big(key) {
    const g = new T.Group();
    const body = MB.mesh(G.rbox(20, 40.5, 37, 1.5), key, 'servo'); g.add(body);
    const ears = MB.mesh(G.rbox(20, 54, 2.5, 0.8), key, 'servo'); ears.position.z = 11; g.add(ears);
    const boss = MB.mesh(G.cyl(5.5, 6, 18), key, 'servo'); boss.rotation.x = Math.PI / 2; boss.position.set(0, 10, 21); g.add(boss);
    const horn = new T.Group(); horn.position.set(0, 10, 25); g.add(horn);
    const arm = MB.mesh(G.rbox(8, 26, 2.4, 1.2), 'horns', 'horn'); arm.position.y = 9; horn.add(arm);
    const tip = new T.Object3D(); tip.position.set(0, 18, 1.5); horn.add(tip);
    return { g, horn, tip };
  }

  // ---------- Robot completo ----------
  MB.buildRobot = function (scene, at) {
    const R = (MB.robot = { servos: [], bars: [], tendons: [] });
    const root = new T.Group(); root.position.copy(at); scene.add(root); R.root = root;
    const s = 1.15;

    // Soporte en L (como el de la foto)
    MB.step('base');
    const plate = MB.mesh(G.rbox(130, 6, 100, 2), 'soporte', 'acrylic'); plate.position.y = 3; root.add(MB.tag(plate, 'soporte', { explode: [0, -30, 0] }));
    [[-52, -38], [52, -38], [-52, 38], [52, 38]].forEach((p) => { const ft = MB.mesh(G.cyl(6, 3, 14), 'soporte', 'tpu'); ft.position.set(p[0], -1, p[1]); root.add(ft); });

    // Antebrazo: dos laterales de acrílico con separadores; arriba hacen de horquilla para la muñeca
    MB.step('antebrazo');
    const WY = 196, FX = 30;
    const sideP = [[-26, 6], [26, 6], [26, 150], [20, 176], [14, WY - 8], [10, WY + 8], [-10, WY + 8], [-14, WY - 8], [-20, 176], [-26, 150]];
    [-1, 1].forEach((sx) => {
      const sp = MB.mesh(G.outline(sideP.map((p) => [p[0], p[1]]), PL), 'antebrazo', 'acrylic');
      sp.rotation.y = Math.PI / 2; sp.position.x = sx * FX; root.add(MB.tag(sp, 'antebrazo', { explode: [sx * 40, 0, 0] }));
    });
    [[20, 14], [-20, 14], [20, 140], [-20, 140], [0, 176]].forEach((p) => {
      const sp = MB.mesh(G.cyl(2.8, FX * 2, 6), 'separadores', 'brass'); sp.rotation.z = Math.PI / 2; sp.position.set(0, p[1], p[0]); root.add(MB.tag(sp, 'separadores', { explode: [0, 0, 20] }));
    });
    const brk = MB.mesh(G.rbox(FX * 2 + PL, 6, 56, 2), 'antebrazo', 'acrylic'); brk.position.y = 9; root.add(MB.tag(brk, 'antebrazo'));

    // Servo de la muñeca: SCS15 de doble eje, con el eje sobre el de la muñeca (accionamiento directo)
    MB.step('muneca');
    const ws = big('servoMuneca');
    // girado para que su eje (Z local) quede sobre +X; el brazo del servo cae justo adentro del lateral derecho
    ws.g.rotation.y = Math.PI / 2; ws.g.position.set(FX - 27, WY - 10, 0);
    root.add(MB.tag(ws.g, 'servoMuneca', { explode: [60, 0, 0] }));
    R.wristServo = ws;
    // del otro lado, el segundo eje del servo gira en un rodamiento del lateral izquierdo
    const b2 = MB.mesh(G.cyl(4, 4, 18), 'rodamiento', 'steel'); b2.rotation.z = Math.PI / 2; b2.position.set(-(FX + 3), WY, 0); root.add(MB.tag(b2, 'rodamiento', { explode: [-50, 20, 0] }));
    const wpin = MB.mesh(G.cyl(2.5, 30, 14), 'pernos', 'pin'); wpin.rotation.z = Math.PI / 2; wpin.position.set(-FX + 8, WY, 0); root.add(MB.tag(wpin, 'pernos', { explode: [-60, 20, 0] }));

    const wrist = new T.Group(); wrist.position.y = WY; root.add(wrist); R.wrist = wrist;
    // horquilla en U de la mano, atornillada al brazo del servo de un lado y al eje del otro
    [-1, 1].forEach((sx) => { const u = MB.mesh(G.rbox(PL, 26, 28, 1), 'antebrazo', 'acrylic'); u.position.set(sx * (FX - 6), 8, 0); wrist.add(MB.tag(u, 'antebrazo', { explode: [sx * 30, 20, 0] })); });
    const wblock = MB.mesh(G.rbox(FX * 2 - 12, 6, 30, 2), 'antebrazo', 'acrylic'); wblock.position.y = 19; wrist.add(MB.tag(wblock, 'antebrazo', { explode: [0, 20, 0] }));

    MB.step('mano');
    const hand = MB.buildHand('robot', s, { phal: 'falanges', palm: 'palma', pad: 'yemas', pin: 'pernos' });
    hand.root.position.y = 22;
    wrist.add(hand.root);
    R.hand = hand;

    // ---- servos de la mano ----
    MB.step('servos');
    const hr = hand.root;
    const addServo = (dof, parent, pos, rot) => {
      const sv = micro('servo');
      sv.g.position.copy(pos); if (rot) sv.g.rotation.set(rot[0], rot[1], rot[2]);
      parent.add(MB.tag(sv.g, 'servo', { explode: [0, 0, -50] }));
      sv.dof = dof; R.servos[dof] = sv;
      return sv;
    };
    // acostados, con el eje y el brazo del servo hacia el dorso (−Z)
    const flat = [0, Math.PI, 0];
    PALM_SERVOS.forEach((p) => addServo(MB.dofIdx[p[0]], hr, new T.Vector3(p[1] * s, p[2] * s, -1), flat));
    const th = hand.thumb;
    // PIP: adentro de la falange proximal, entre las dos placas; asoma un poco por el dorso (dedos "robustos")
    hand.fingers.forEach((f) => addServo(MB.dofIdx[f.F.id + 'Pip'], f.p1, new T.Vector3(0, f.F.L[0] * s * 0.44, -4), flat));
    // pulgar: la oposición va sobre el módulo que gira; la MCP en el metacarpiano y la IP en la falange proximal
    addServo(MB.dofIdx.tFlex, th.abd, new T.Vector3(-6, -14, -10), [0, Math.PI, -0.6]);
    addServo(MB.dofIdx.tMcp, th.t1, new T.Vector3(0, 20, -6), flat);
    addServo(MB.dofIdx.tIp, th.t2, new T.Vector3(0, 14, -6), flat);
    R.servos[MB.dofIdx.wFlex] = ws; ws.dof = MB.dofIdx.wFlex;

    // ---- bielas ----
    MB.step('bielas');
    const anchor = (parent, x, y, z) => { const o = new T.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
    const bar = (a, b, key, r, kind) => {
      // la geometría se arma con el largo real la primera vez que se dibuja (ver MB.updateLinks)
      const m = MB.mesh(new T.BufferGeometry(), key, kind === 'rod' ? 'brass' : 'steel');
      m.userData.r = r; m.userData.rod = kind === 'rod'; m.castShadow = true;
      R.root.parent.add(m);
      MB.tag(m, key, { sub: 'pop' });
      R.bars.push({ a, b, m, r });
      R.tendons.push({ line: m, dof: -1, side: 1 });
      return m;
    };
    hand.fingers.forEach((f) => {
      const id = f.F.id, tMid = 7.5 * s, w0 = f.F.W[0] * s, w2 = f.F.W[2] * s;
      // diferencial: una biela de cada servo a cada lado de una palanca dorsal en la base de la falange proximal
      bar(R.servos[MB.dofIdx[id + 'Mcp']].tip, anchor(f.mcp, w0 * 0.3, 5, -(tMid + 7)), 'bielas', 1.2);
      bar(R.servos[MB.dofIdx[id + 'Abd']].tip, anchor(f.mcp, -w0 * 0.3, 5, -(tMid + 7)), 'bielas', 1.2);
      // PIP: del servo de la falange proximal a una manivela dorsal de la falange media
      bar(R.servos[MB.dofIdx[id + 'Pip']].tip, anchor(f.pip, 0, 5, -(6.6 * s + 6)), 'bielas', 1);
      // DIP acoplada con biela en S cruzada: palmar en la proximal (a≈4,5 mm del eje), dorsal en la distal (b≈6 mm)
      // θDIP ≈ (a/b)·θPIP ≈ 0,75·θPIP. Si las dos fueran dorsales, la DIP se abriría al cerrar la PIP.
      bar(anchor(f.p1, -(w0 * 0.5 + 2.5), f.F.L[0] * s - 4.5, 4.5), anchor(f.dip, -(w2 * 0.5 + 2.5), 6, -6), 'bielas', 0.9);
    });
    // pulgar: abducción con brazo de servo y varilla de latón (como la foto); el resto con bielas
    bar(R.servos[MB.dofIdx.tAbd].tip, anchor(th.abd, 4, 2, -14), 'varilla', 1.1, 'rod');
    bar(R.servos[MB.dofIdx.tFlex].tip, anchor(th.flex, 0, 8, -12), 'bielas', 1.2);
    bar(R.servos[MB.dofIdx.tMcp].tip, anchor(th.mcp, 0, 5, -12), 'bielas', 1.1);
    bar(R.servos[MB.dofIdx.tIp].tip, anchor(th.ip, 0, 5, -11), 'bielas', 1);

    R.q = new Array(MB.NDOF).fill(0);
    // ángulo del brazo de cada servo según la articulación (el diferencial mezcla flexión y abducción)
    const di = MB.dofIdx;
    const horn = (dof, q) => {
      const k = MB.DOF[dof].k;
      if (k === 'wFlex') return q[dof] * 0.85;
      const fid = k[0];
      if (fid !== 't' && k.endsWith('Mcp')) return 0.5 - q[dof] * 1.1 + q[di[fid + 'Abd']] * 1.8;
      if (fid !== 't' && k.endsWith('Abd')) return 0.5 - q[di[fid + 'Mcp']] * 1.1 - q[dof] * 1.8;
      return 0.5 - q[dof] * 1.25;
    };
    R.setPose = function (q) {
      R.q = q.slice();
      hand.setPose(q);
      wrist.rotation.x = q[16] * 0.85;
      R.servos.forEach((sv) => { if (sv) sv.horn.rotation.z = horn(sv.dof, q); });
    };
    R.setPose(R.q);
    return R;
  };

  // Cada biela se estira y orienta entre sus dos puntos de apoyo
  const _a = new T.Vector3(), _b = new T.Vector3(), _d = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
  MB.updateLinks = function () {
    const R = MB.robot; if (!R) return;
    R.bars.forEach((br) => {
      br.a.getWorldPosition(_a); br.b.getWorldPosition(_b);
      _d.subVectors(_b, _a); const len = _d.length();
      if (!br.L0) { br.L0 = Math.max(4, len); br.m.geometry.dispose(); br.m.geometry = G.sbar(br.L0, br.r, br.m.userData.rod); }
      br.m.position.copy(_a);
      br.m.quaternion.setFromUnitVectors(Y, _d.normalize());
      br.m.scale.set(1, len / br.L0, 1);
    });
  };
})();
