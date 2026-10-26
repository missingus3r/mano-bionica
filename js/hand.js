/* Mano articulada (robótica o humana) con la misma cinemática: 17 grados de libertad.
   El estilo robótico (placas de acrílico, servos y bielas) está en robot.js.
   Ejes de la mano: +Y hacia los dedos, +Z hacia la palma, +X hacia el pulgar (mano derecha). */
(function () {
  const T = THREE, MB = window.MB, G = MB.Geo;

  // ---------- Grados de libertad ----------
  // 17 GDL activos: pulgar 4, cada dedo 3 (abducción, MCP, PIP con la DIP acoplada) y la flexión de muñeca.
  MB.DOF = [
    { k: 'tAbd', n: 'Pulgar · abducción CMC', lo: 0, hi: 1.05 },
    { k: 'tFlex', n: 'Pulgar · oposición CMC', lo: -0.1, hi: 1.15 },
    { k: 'tMcp', n: 'Pulgar · MCP', lo: -0.1, hi: 0.95 },
    { k: 'tIp', n: 'Pulgar · IP', lo: -0.15, hi: 1.25 },
    { k: 'iAbd', n: 'Índice · abducción', lo: -0.3, hi: 0.3 },
    { k: 'iMcp', n: 'Índice · MCP', lo: -0.25, hi: 1.57 },
    { k: 'iPip', n: 'Índice · PIP+DIP', lo: 0, hi: 1.75 },
    { k: 'mAbd', n: 'Medio · abducción', lo: -0.3, hi: 0.3 },
    { k: 'mMcp', n: 'Medio · MCP', lo: -0.25, hi: 1.57 },
    { k: 'mPip', n: 'Medio · PIP+DIP', lo: 0, hi: 1.75 },
    { k: 'rAbd', n: 'Anular · abducción', lo: -0.3, hi: 0.3 },
    { k: 'rMcp', n: 'Anular · MCP', lo: -0.25, hi: 1.57 },
    { k: 'rPip', n: 'Anular · PIP+DIP', lo: 0, hi: 1.75 },
    { k: 'lAbd', n: 'Meñique · abducción', lo: -0.3, hi: 0.35 },
    { k: 'lMcp', n: 'Meñique · MCP', lo: -0.25, hi: 1.57 },
    { k: 'lPip', n: 'Meñique · PIP+DIP', lo: 0, hi: 1.75 },
    { k: 'wFlex', n: 'Muñeca · flexión', lo: -1.0, hi: 1.0 },
  ];
  MB.NDOF = MB.DOF.length;
  MB.dofIdx = {}; MB.DOF.forEach((d, i) => { MB.dofIdx[d.k] = i; });
  MB.clampQ = (q) => q.map((v, i) => Math.max(MB.DOF[i].lo, Math.min(MB.DOF[i].hi, v)));

  // Medidas de una mano adulta (mm): metacarpo hasta la MCP y largo de falanges proximal, media y distal
  const FINGERS = [
    { id: 'i', name: 'índice', x: 24, y: 90, z: 1, splay: -0.07, sgn: -1, L: [42, 25, 18], W: [17.5, 16, 14.5] },
    { id: 'm', name: 'medio', x: 6.5, y: 93, z: -1, splay: 0, sgn: -0.25, L: [46, 28, 19], W: [18, 16.5, 15] },
    { id: 'r', name: 'anular', x: -11, y: 88, z: 0, splay: 0.06, sgn: 0.6, L: [43, 27, 19], W: [17, 15.5, 14] },
    { id: 'l', name: 'meñique', x: -27, y: 79, z: 3, splay: 0.15, sgn: 1, L: [34, 20, 17], W: [15, 13.5, 12.5] },
  ];
  const THUMB = { x: 24, y: 26, z: 11, L: [44, 32, 26], W: [21, 19.5, 17.5], d: [0.5, 0.78, 0.38], p: [-0.7, 0.05, 0.7] };
  // ganancias de la oposición (se ajustaron para que la pinza cierre yema con yema)
  const TK = (MB.THUMB_K = { abd: 0.8, opp: 0.95, pron: 0.5, cmc: 0.25 });
  MB.FINGERS = FINGERS;

  // ---------- Mano genérica ----------
  // style: 'robot' (piezas impresas, pernos, yemas de TPU) o 'human' (piel, uñas)
  MB.buildHand = function (style, s, keys) {
    const robot = style === 'robot';
    keys = keys || {};
    const kP = keys.phal || 'falanges', kPalm = keys.palm || 'palma', kPad = keys.pad || 'yemas', kPin = keys.pin || 'pernos';
    const root = new T.Group();
    const H = { root, fingers: [], thumb: null, style, s };
    const sk = robot ? 'pla' : 'skinSolid';

    // ----- Palma -----
    const palmLen = 80 * s;
    const rx = (v) => (30 + 13 * Math.min(1, v * 1.5)) * s * (robot ? 1 : 0.98);
    const rz = (v) => (robot ? 12.5 : 13.5 + 2.5 * Math.sin(Math.PI * v)) * s;
    if (!robot) {
      const palm = MB.mesh(G.loft(palmLen, rx, rz, { segL: 16, segR: 36, cx: (v) => -2 * s * v }), kPalm, sk);
      root.add(MB.tag(palm, kPalm, { explode: [0, 0, 0] }));
    // fila de nudillos: redondea el borde de arriba e inclina la línea de las MCP (el meñique va más abajo)
    const kn = MB.mesh(G.capsule((robot ? 12.5 : 14) * s, 50 * s, 18), kPalm, sk);
    kn.rotation.z = Math.PI / 2 + 0.2; kn.scale.set(1, 1, robot ? 1 : 0.95);
    kn.position.set(-2 * s, 81 * s, 0);
    root.add(kn);
    }
    if (robot) {
      MB.robotPalm(root, s, { palm: kPalm, pad: kPad });
    } else {
      // eminencia tenar e hipotenar
      const then = MB.mesh(G.sphere(17 * s, 20), kPalm, sk); then.scale.set(1, 1.5, 0.75); MB.at(then, 19 * s, 30 * s, 9 * s);
      const hyp = MB.mesh(G.sphere(13 * s, 18), kPalm, sk); hyp.scale.set(0.9, 1.9, 0.7); MB.at(hyp, -26 * s, 38 * s, 7 * s);
      root.add(then, hyp);
    }

    // ----- Dedos -----
    function link(parent, len, w0, w1, t0, t1, dist, fi) {
      const g = new T.Group();
      if (robot) {
        MB.robotLink(g, len, w0, w1, t0, t1, dist, { phal: kP, pad: kPad, pin: kPin });
      } else {
        const r = (w0 + w1) * 0.25;
        const body = MB.mesh(G.capsule(r, len - r * 0.4, 14), kP, 'skinSolid');
        body.scale.z = 0.86; body.position.y = len / 2;
        g.add(body);
        if (dist) {
          const nail = MB.mesh(G.rbox(w1 * 0.62, len * 0.5, 1.2 * s, 0.5 * s), kP, 'nail');
          nail.position.set(0, len * 0.66, -r * 0.78); nail.rotation.x = 0.08;
          g.add(nail);
        }
      }
      MB.tag(g, kP, { explode: [0, 10 + fi * 2, 0] });
      parent.add(g);
      return g;
    }
    function pin(parent, w) {
      if (!robot) return;
      const p = MB.mesh(G.cyl(1.5, w + 2, 12), kPin, 'pin'); p.rotation.z = Math.PI / 2;
      parent.add(MB.tag(p, kPin, { explode: [26, 0, 0], sub: 'pop' }));
    }

    FINGERS.forEach((F, fi) => {
      const base = new T.Group();
      base.position.set(F.x * s, F.y * s, F.z * s);
      base.rotation.z = F.splay;
      root.add(base);
      const abd = new T.Group(); base.add(abd);
      const mcp = new T.Group(); abd.add(mcp);
      pin(mcp, F.W[0] * s);
      const p1 = link(mcp, F.L[0] * s, F.W[0] * s, F.W[1] * s, 16 * s, 14 * s, false, fi);
      const pip = new T.Group(); pip.position.y = F.L[0] * s; p1.add(pip);
      pin(pip, F.W[1] * s);
      const p2 = link(pip, F.L[1] * s, F.W[1] * s, F.W[2] * s, 14 * s, 12.5 * s, false, fi);
      const dip = new T.Group(); dip.position.y = F.L[1] * s; p2.add(dip);
      pin(dip, F.W[2] * s);
      const p3 = link(dip, F.L[2] * s, F.W[2] * s, F.W[2] * 0.85 * s, 12.5 * s, 10 * s, true, fi);
      H.fingers.push({ F, base, abd, mcp, pip, dip, p1, p2, p3 });
    });

    // ----- Pulgar -----
    // Cadena: abducción en el plano de la palma → oposición (cruza por delante de la palma) →
    // orientación fija del metacarpiano → pronación sobre su eje + flexión de la CMC → MCP → IP.
    const tb = new T.Group();
    tb.position.set(THUMB.x * s, THUMB.y * s, THUMB.z * s);
    root.add(tb);
    if (robot) {
      // bloque de la CMC: dos placas que sostienen el módulo del pulgar
      [-1, 1].forEach((sz) => { const b = MB.mesh(G.rbox(24 * s, 24 * s, 3, 1.5), kPalm, 'acrylic'); b.position.set(-2 * s, -4 * s, sz * 12 * s - 4); tb.add(b); });
    }
    const tAbd = new T.Group(); tb.add(tAbd);
    const tOpp = new T.Group(); tAbd.add(tOpp);
    const tAlign = new T.Group(); tOpp.add(tAlign);
    // el metacarpiano apunta hacia arriba, afuera y adelante; la yema mira al índice
    H.setThumbBase = function (d, p) {
      const d0 = new T.Vector3().fromArray(d).normalize(), p0 = new T.Vector3().fromArray(p);
      p0.addScaledVector(d0, -p0.dot(d0)).normalize();
      const x0 = new T.Vector3().crossVectors(d0, p0);
      tAlign.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x0, d0, p0));
    };
    H.setThumbBase(THUMB.d, THUMB.p);
    const tFlex = new T.Group(); tAlign.add(tFlex);
    pin(tFlex, THUMB.W[0] * s);
    const t1 = link(tFlex, THUMB.L[0] * s, THUMB.W[0] * s, THUMB.W[1] * s, 19 * s, 16 * s, false, 4);
    const tMcp = new T.Group(); tMcp.position.y = THUMB.L[0] * s; t1.add(tMcp);
    pin(tMcp, THUMB.W[1] * s);
    const t2 = link(tMcp, THUMB.L[1] * s, THUMB.W[1] * s, THUMB.W[2] * s, 16 * s, 14 * s, false, 4);
    const tIp = new T.Group(); tIp.position.y = THUMB.L[1] * s; t2.add(tIp);
    pin(tIp, THUMB.W[2] * s);
    const t3 = link(tIp, THUMB.L[2] * s, THUMB.W[2] * s, THUMB.W[2] * 0.85 * s, 14 * s, 11 * s, true, 4);
    H.thumb = { base: tb, abd: tAbd, opp: tOpp, flex: tFlex, mcp: tMcp, ip: tIp, t1, t2, t3 };
    if (!robot) {
      // la carne entre el pulgar y el índice
      const web = MB.mesh(G.sphere(12 * s, 16), kPalm, sk); web.scale.set(1, 1.6, 0.6); web.position.set(0, 14 * s, 2 * s); t1.add(web);
    }

    // ----- Postura -----
    H.q = new Array(MB.NDOF).fill(0);
    H.setPose = function (q) {
      H.q = q.slice();
      const th = H.thumb;
      th.abd.rotation.z = -(q[0] - 0.35) * TK.abd;
      th.opp.rotation.y = -q[1] * TK.opp;
      // la oposición también gira el pulgar sobre su eje para enfrentar la yema a los dedos
      th.flex.rotation.y = -q[1] * TK.pron;
      th.flex.rotation.x = q[1] * TK.cmc;
      th.mcp.rotation.x = q[2];
      th.ip.rotation.x = q[3];
      H.fingers.forEach((f, i) => {
        const a = q[4 + i * 3], m = q[5 + i * 3], p = q[6 + i * 3];
        f.abd.rotation.z = a * f.F.sgn;
        f.mcp.rotation.x = m;
        f.pip.rotation.x = p;
        f.dip.rotation.x = p * 0.72; // DIP acoplada a la PIP (como el tendón del FDP)
      });
    };
    H.setPose(H.q);
    return H;
  };

})();
