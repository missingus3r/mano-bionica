/* Brazo de la persona (piel translúcida, músculos del antebrazo y electrodos) y la electrónica sobre la mesa. */
(function () {
  const T = THREE, MB = window.MB, G = MB.Geo;

  // Músculos del antebrazo. phi: ángulo alrededor del antebrazo (0° = lado del pulgar/radial, 90° = palma,
  // ±180° = lado cubital, −90° = dorso). v: tramo a lo largo (0 = codo, 1 = muñeca). deep: 1 superficial, menor = profundo.
  // Ángulos y tramos medidos sobre el modelo anatómico (BodyParts3D): el vientre de cada músculo (percentil 10–90
  // de su superficie) y el ángulo medio de sus cortes. mesh = las piezas del modelo que le corresponden.
  MB.MUSCLES = [
    { k: 'FCR', n: 'Flexor radial del carpo', phi: 107, v: [0.15, 0.81], deep: 1, mesh: ['FCR'] },
    { k: 'FDS', n: 'Flexor superficial de los dedos', phi: 129, v: [0.21, 0.95], deep: 0.85, mesh: ['FDS'] },
    { k: 'FCU', n: 'Flexor cubital del carpo', phi: -178, v: [0.12, 0.74], deep: 1, mesh: ['FCU'] },
    { k: 'FDP', n: 'Flexor profundo de los dedos', phi: 136, v: [0.31, 0.95], deep: 0.5, mesh: ['FDP'] },
    { k: 'FPL', n: 'Flexor largo del pulgar', phi: 21, v: [0.49, 0.95], deep: 0.6, mesh: ['FPL'] },
    { k: 'ECR', n: 'Extensores radiales del carpo', phi: -21, v: [0.0, 0.74], deep: 1, mesh: ['ECRL', 'ECRB'] },
    { k: 'ED', n: 'Extensor de los dedos', phi: -66, v: [0.19, 0.95], deep: 1, mesh: ['ED', 'EDM'] },
    { k: 'ECU', n: 'Extensor cubital del carpo', phi: -104, v: [0.24, 0.85], deep: 1, mesh: ['ECU'] },
    { k: 'APL', n: 'Abductor y extensores del pulgar', phi: -50, v: [0.43, 0.95], deep: 0.75, mesh: ['APL', 'EPB', 'EPL'] },
    { k: 'EIP', n: 'Extensor propio del índice', phi: -144, v: [0.78, 0.98], deep: 0.7, mesh: ['EIP'] },
    { k: 'PL', n: 'Palmar largo', phi: 130, v: [0.12, 0.6], deep: 1, mesh: ['PL'] },
    { k: 'PT', n: 'Pronador redondo', phi: 49, v: [0.07, 0.42], deep: 0.9, mesh: ['PT'] },
    { k: 'BR', n: 'Braquiorradial', phi: 18, v: [0.0, 0.65], deep: 1, mesh: ['BR'] },
  ];
  MB.NMUS = MB.MUSCLES.length;
  MB.NCH = 8;
  // El antebrazo mide 244 mm del codo a la muñeca (el del modelo). El corte no es una elipse: la piel se mide con rayos
  // sobre el modelo real y queda en una tabla radio(ángulo, tramo).
  const FA = { y0: 40, len: 244 };
  const NA = 36, NV = 14, RT = []; // tabla de radios
  const skinR = (phiDeg, v) => {
    if (!RT.length) return 40;
    const a = ((((phiDeg % 360) + 360) % 360) / 360) * NA, vv = Math.max(0, Math.min(1, v)) * (NV - 1);
    const a0 = Math.floor(a) % NA, a1 = (a0 + 1) % NA, fa = a - Math.floor(a), v0 = Math.min(NV - 2, Math.floor(vv)), fv = vv - v0;
    const r = (i, j) => RT[j][i];
    return (r(a0, v0) * (1 - fa) + r(a1, v0) * fa) * (1 - fv) + (r(a0, v0 + 1) * (1 - fa) + r(a1, v0 + 1) * fa) * fv;
  };
  MB.forearmShape = { y0: FA.y0, len: FA.len, r: skinR };
  // punto de la superficie del antebrazo (coordenadas del brazo)
  MB.skinPoint = (phiDeg, v, out) => {
    const a = (phiDeg * Math.PI) / 180, r = skinR(phiDeg, v);
    return (out || new T.Vector3()).set(Math.cos(a) * r, FA.y0 + v * FA.len, Math.sin(a) * r);
  };
  // Brazalete: 8 canales bipolares alrededor del tercio proximal, el canal 1 sobre la palma
  MB.ELEC = { v: 0.3, dv: 0.085 };
  MB.chPhi = (c) => 90 - c * 45;

  // ---------- Modelo real del brazo ----------
  // Piel: brazo derecho de «Universal Base Characters» de Quaternius (CC0), recortado desde el codo (models/brazo.js).
  // Adentro: músculos y huesos del antebrazo de BodyParts3D (CC BY 4.0), en models/antebrazo.js.
  const parseGlb = (b64) => {
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Promise((res, rej) => new T.GLTFLoader().parse(buf.buffer, '', res, rej));
  };
  MB.loadArm = () => Promise.all([parseGlb(MB.ARM_GLB), parseGlb(MB.ANAT_GLB)]).then(([arm, anat]) => ({ arm, anat }));

  MB.buildHuman = function (scene, at, models) {
    const gltf = models.arm;
    const Hm = (MB.human = { muscles: [], electrodes: [], bones: {}, bones3d: [] });
    const root = new T.Group(); root.position.copy(at); scene.add(root); Hm.root = root;

    MB.step(null);
    const pad = MB.mesh(G.rbox(120, 16, 120, 6), 'apoyo', 'pad'); pad.position.y = 8; root.add(MB.tag(pad, 'apoyo', { asm: false }));

    // En el archivo: metros, pose en T, brazo hacia −X, palma hacia −Y, pulgar hacia +Z.
    // Acá: milímetros, antebrazo vertical (+Y), palma hacia la cámara (+Z), pulgar hacia +X.
    const model = gltf.scene;
    let skin = null;
    model.traverse((o) => { if (o.isBone) Hm.bones[o.name] = o; if (o.isSkinnedMesh) skin = o; });
    const B = Hm.bones;
    const holder = new T.Group(); root.add(holder);
    const inner = new T.Group(); holder.add(inner); inner.add(model);
    inner.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0, -1, 0), new T.Vector3(0, 0, -1), new T.Vector3(1, 0, 0)));
    inner.scale.setScalar(1000);
    root.updateMatrixWorld(true);
    // codo en (0, y0, 0) y el eje codo→muñeca exactamente vertical
    const pE = holder.worldToLocal(B.lowerarm_r.getWorldPosition(new T.Vector3()));
    inner.position.sub(pE);
    holder.position.set(0, FA.y0, 0);
    root.updateMatrixWorld(true);
    const pW = root.worldToLocal(B.hand_r.getWorldPosition(new T.Vector3())).sub(new T.Vector3(0, FA.y0, 0));
    holder.quaternion.setFromUnitVectors(pW.clone().normalize(), new T.Vector3(0, 1, 0));
    root.updateMatrixWorld(true);
    Hm.forearmLen = pW.length();

    // Dos pasadas del mismo modelo: la mano opaca y el antebrazo translúcido (para ver los músculos), cortadas en la muñeca
    const wristY = at.y + FA.y0 + FA.len - 6;
    const mat = skin.material;
    mat.roughness = 0.62; mat.metalness = 0;
    mat.clippingPlanes = [new T.Plane(new T.Vector3(0, 1, 0), -wristY)];
    const fmat = mat.clone();
    fmat.clippingPlanes = [new T.Plane(new T.Vector3(0, -1, 0), wristY)];
    fmat.transparent = true; fmat.opacity = 0.4; fmat.depthWrite = false;
    fmat.userData.orig = { transparent: true, opacity: 0.4, depthWrite: false };
    const fore = new T.SkinnedMesh(skin.geometry, fmat);
    fore.bind(skin.skeleton, skin.bindMatrix);
    skin.parent.add(fore);
    fore.renderOrder = 2;
    [skin, fore].forEach((m) => { m.castShadow = true; m.receiveShadow = true; m.userData.key = 'persona'; m.frustumCulled = false; });
    Hm.skin = fore; Hm.handSkin = skin;
    MB.tagged.persona = (MB.tagged.persona || []).concat([skin, fore]);

    // ---- medir la piel con rayos, de afuera hacia el eje ----
    const ray = new T.Raycaster(), o = new T.Vector3(), d = new T.Vector3(), hits = [], rows = [];
    for (let j = 0; j < NV; j++) {
      const v = j / (NV - 1), row = [];
      for (let i = 0; i < NA; i++) {
        const a = (i / NA) * Math.PI * 2;
        d.set(Math.cos(a), 0, Math.sin(a));
        // en los extremos (codo y muñeca) se mide un poco adentro para no caer en el pliegue
        o.set(0, FA.y0 + (0.03 + v * 0.92) * FA.len, 0).addScaledVector(d, 150);
        root.localToWorld(o);
        const dw = d.clone().transformDirection(root.matrixWorld).negate();
        ray.set(o, dw);
        hits.length = 0; skin.raycast(ray, hits);
        row.push(hits.length ? 150 - Math.min(...hits.map((h) => h.distance)) : row[row.length - 1] || 35);
      }
      rows.push(row);
    }
    RT.push(...rows);

    // ---- músculos y huesos reales (BodyParts3D) ----
    // Vienen en mm con el origen en el codo, +Y a la muñeca, +Z palmar y +X radial, con el antebrazo de 255 mm.
    // Se estiran al largo de este brazo y, corte por corte, se achican o agrandan para quedar dentro de la piel medida.
    const anat = models.anat.scene; anat.updateMatrixWorld(true);
    const sy = FA.len / 255.4, geos = {};
    anat.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); g.scale(1, sy, 1); geos[o.name] = g; } });
    // Por cada corte: centro de la piel, centro de la anatomía y cuánto escalar para que todo quede al 90 % de la piel.
    // La piel se mide desde su propio centro (el antebrazo no es redondo ni está centrado en el hueso del modelo).
    const NB = 20, vOf = (b) => (b + 0.5) / NB;
    const skinPoly = (v) => { const P = []; for (let j = 0; j < 36; j++) { const ang = j * 10, a2 = (ang * Math.PI) / 180, r = skinR(ang, v); P.push([Math.cos(a2) * r, Math.sin(a2) * r]); } return P; };
    const rayPoly = (P, cx, cz, ux, uz) => {
      let best = 1e9;
      for (let j = 0; j < P.length; j++) {
        const [x1, z1] = P[j], [x2, z2] = P[(j + 1) % P.length], ex = x2 - x1, ez = z2 - z1, den = ux * ez - uz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((x1 - cx) * ez - (z1 - cz) * ex) / den, u = ((x1 - cx) * uz - (z1 - cz) * ux) / den;
        if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
      }
      return best;
    };
    const SC = [], AC = [], KB = [];
    for (let b = 0; b < NB; b++) {
      const P = skinPoly(vOf(b));
      SC.push([P.reduce((s2, q) => s2 + q[0], 0) / P.length, P.reduce((s2, q) => s2 + q[1], 0) / P.length]);
      AC.push([1e9, -1e9, 1e9, -1e9]); KB.push(1.3);
    }
    const bucket = (y) => Math.max(0, Math.min(NB - 1, Math.floor((y / FA.len) * NB)));
    Object.values(geos).forEach((g) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const b = bucket(p.getY(i)), A = AC[b]; A[0] = Math.min(A[0], p.getX(i)); A[1] = Math.max(A[1], p.getX(i)); A[2] = Math.min(A[2], p.getZ(i)); A[3] = Math.max(A[3], p.getZ(i)); } });
    const ACc = AC.map((A) => [(A[0] + A[1]) / 2, (A[2] + A[3]) / 2]);
    const POLY = Array.from({ length: NB }, (_, b) => skinPoly(vOf(b)));
    Object.values(geos).forEach((g) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = p.getY(i) / FA.len; if (v < 0.03 || v > 0.97) continue;
        const b = bucket(p.getY(i)), dx = p.getX(i) - ACc[b][0], dz = p.getZ(i) - ACc[b][1], r = Math.hypot(dx, dz); if (r < 2) continue;
        const R = rayPoly(POLY[b], SC[b][0], SC[b][1], dx / r, dz / r);
        KB[b] = Math.min(KB[b], (0.9 * R) / r);
      }
    });
    const ks = KB.map((k, i) => Math.min(k, KB[Math.max(0, i - 1)], KB[Math.min(NB - 1, i + 1)]));
    // interpolación suave entre cortes (escala y los dos centros)
    const lerpB = (arr, v) => { const x = Math.max(0, Math.min(NB - 1, v * NB - 0.5)), i0 = Math.floor(x), f = x - i0, i1 = Math.min(NB - 1, i0 + 1); return Array.isArray(arr[0]) ? [arr[i0][0] * (1 - f) + arr[i1][0] * f, arr[i0][1] * (1 - f) + arr[i1][1] * f] : arr[i0] * (1 - f) + arr[i1] * f; };
    Object.values(geos).forEach((g) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = p.getY(i) / FA.len, k = lerpB(ks, v), sc = lerpB(SC, v), ac = lerpB(ACc, v);
        p.setXYZ(i, sc[0] + (p.getX(i) - ac[0]) * k, p.getY(i) + FA.y0, sc[1] + (p.getZ(i) - ac[1]) * k);
      }
      p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
    });
    Hm.fitK = ks;
    // los tendones siguen hasta los dedos: se cortan en la muñeca, igual que la piel translúcida
    const clip = [new T.Plane(new T.Vector3(0, -1, 0), wristY)];
    const boneMat = new T.MeshStandardMaterial({ color: 0xe9e1d0, roughness: 0.7, side: T.DoubleSide, clippingPlanes: clip });
    ['radius', 'ulna', 'humerus'].forEach((n) => {
      if (!geos[n]) return;
      const m = new T.Mesh(geos[n], boneMat); m.userData.key = 'persona'; m.castShadow = false;
      root.add(m); Hm.bones3d.push(m);
    });
    MB.MUSCLES.forEach((m, i) => {
      const mmat = new T.MeshStandardMaterial({ color: 0x9c3434, roughness: 0.55, emissive: 0xff5a2a, emissiveIntensity: 0, side: T.DoubleSide, clippingPlanes: clip });
      const meshes = m.mesh.filter((n) => geos[n]).map((n) => {
        const me = new T.Mesh(geos[n], mmat);
        me.userData.key = 'musculo'; me.userData.muscle = i; me.castShadow = false;
        root.add(me); return me;
      });
      Hm.muscles.push({ m, meshes, mesh: meshes[0], mat: mmat });
    });

    // electrodos de gel Ag/AgCl: pares bipolares a lo largo de las fibras + referencia sobre el hueso del codo
    MB.step('electrodos');
    const elecGeo = G.cyl(8, 1.4, 24), gelGeo = G.cyl(5, 0.8, 20), snapGeo = G.cyl(2.4, 3, 12);
    const placeElectrode = (phi, v, ch, ref) => {
      const g = new T.Group(), a = (phi * Math.PI) / 180;
      const p = MB.skinPoint(phi, v);
      // normal: de la diferencia de radios alrededor (la piel no es un cilindro)
      const dr = (skinR(phi + 5, v) - skinR(phi - 5, v)) / ((10 * Math.PI) / 180);
      const tang = new T.Vector3(-Math.sin(a), 0, Math.cos(a)), rad = new T.Vector3(Math.cos(a), 0, Math.sin(a));
      const n = rad.clone().multiplyScalar(skinR(phi, v)).sub(tang.clone().multiplyScalar(dr)).normalize();
      g.position.copy(p).addScaledVector(n, 1.2);
      g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
      const foam = MB.mesh(elecGeo, 'electrodo', 'electrode'); g.add(foam);
      const gel = MB.mesh(gelGeo, 'electrodo', 'gel'); gel.position.y = -0.8; g.add(gel);
      const sn = MB.mesh(snapGeo, 'electrodo', 'snap'); sn.position.y = 2; g.add(sn);
      root.add(MB.tag(g, 'electrodo', { explode: [n.x * 30, 0, n.z * 30] }));
      Hm.electrodes.push({ g, ch, ref, phi, v, n });
      return g;
    };
    for (let c = 0; c < MB.NCH; c++) {
      placeElectrode(MB.chPhi(c), MB.ELEC.v - MB.ELEC.dv / 2, c);
      placeElectrode(MB.chPhi(c), MB.ELEC.v + MB.ELEC.dv / 2, c);
    }
    // referencia: sobre el epicóndilo / olécranon, donde casi no hay músculo
    placeElectrode(-165, 0.04, -1, true);
    MB.step(null);

    // ---- postura: cada articulación gira sobre los ejes locales del hueso (Y a lo largo, X = flexión) ----
    const REST = {};
    Object.keys(B).forEach((k) => { REST[k] = B[k].quaternion.clone(); });
    const qa = new T.Quaternion(), e = new T.Euler();
    const pose = (name, x, y, z) => {
      const b = B[name]; if (!b) return;
      e.set(x || 0, y || 0, z || 0, 'XZY');
      b.quaternion.copy(REST[name]).multiply(qa.setFromEuler(e));
    };
    // signos y ganancias de cada articulación del modelo (se ajustaron mirando la mano)
    // flexión = +X en dedos y pulgar; la muñeca flexiona sobre Z; el pulgar se opone con +X (hacia el meñique), un poco de
    // −Z (hacia la palma) y un giro sobre su eje (Y). Las ganancias salen de una búsqueda: pinza a 10 mm yema con yema
    const HK = (MB.HUMAN_K = { abd: 1, oppX: 0.59, oppZ: 0.21, pron: -0.96, abdX: 0.53, mcp: 1.2, ip: 1.3, dip: 0.72 });
    const FN = ['index', 'middle', 'ring', 'pinky'];
    Hm.setPose = function (q) {
      FN.forEach((f, i) => {
        const a = q[4 + i * 3], m = q[5 + i * 3], p = q[6 + i * 3], sg = MB.FINGERS[i].sgn;
        pose(f + '_01_r', m, 0, a * sg * HK.abd);
        pose(f + '_02_r', p, 0, 0);
        pose(f + '_03_r', p * HK.dip, 0, 0);
      });
      pose('thumb_01_r', q[1] * HK.oppX - (q[0] - 0.35) * HK.abdX, q[1] * HK.pron, -q[1] * HK.oppZ);
      pose('thumb_02_r', q[2] * HK.mcp, 0, 0);
      pose('thumb_03_r', q[3] * HK.ip, 0, 0);
      pose('hand_r', 0, 0, q[16] * 0.9);
    };
    Hm.setActivation = function (act) {
      Hm.muscles.forEach((mu, i) => {
        const a = Math.min(1, act[i] || 0);
        mu.mat.emissiveIntensity = a * 1.6;
        mu.mat.color.setRGB(0.42 + 0.58 * a, 0.1 + 0.16 * a, 0.1);
      });
    };
    return Hm;
  };

  // ---------- Electrónica sobre la mesa ----------
  MB.buildBench = function (scene) {
    const B = (MB.bench = {});
    const root = new T.Group(); scene.add(root); B.root = root;
    const table = new T.Mesh(G.box(980, 20, 640), MB.M('_', 'table'));
    table.position.set(0, -10, 0); table.receiveShadow = true; root.add(table);

    const tray = new T.Group(); tray.position.set(-10, 0, 150); root.add(tray); B.tray = tray;
    const board = (key, base, w, d, x, z, extra) => {
      const g = new T.Group(); g.position.set(x, 0, z);
      const pcb = MB.mesh(G.box(w, 1.6, d), key, base); pcb.position.y = 6; g.add(pcb);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((p) => { const st = MB.mesh(G.cyl(2, 5, 8), key, 'gold'); st.position.set(p[0] * (w / 2 - 4), 2.5, p[1] * (d / 2 - 4)); g.add(st); });
      if (extra) extra(g);
      tray.add(g);
      return g;
    };

    // Lectura de EMG: placa de 8 canales ADS1299, u 8 módulos sueltos de 1 canal leídos por el ADC del ESP32
    MB.step('electronica');
    B.cfg = { ads: [], cheap: [], bus: [], pwm: [] };
    B.emg = board('emgFront', 'pcbPurple', 62, 62, -95, 0, (g) => {
      const ic = MB.mesh(G.box(12, 1.6, 12), 'emgFront', 'chip'); ic.position.set(0, 7.6, 4); g.add(ic);
      for (let i = 0; i < 9; i++) { const pinH = MB.mesh(G.box(2.5, 9, 2.5), 'emgFront', 'gold'); pinH.position.set(-24 + i * 6, 11, -26); g.add(pinH); }
      const conn = MB.mesh(G.box(40, 8, 10), 'emgFront', 'chip'); conn.position.set(0, 11, 24); g.add(conn);
    });
    MB.tag(B.emg, 'emgFront', { explode: [0, 40, 0] }); B.cfg.ads.push(B.emg);
    for (let i = 0; i < 8; i++) {
      const c = board('emgCandy', 'pcbRed', 16, 24, -118 + (i % 4) * 19, (i < 4 ? -14 : 14), (g) => {
        const ic = MB.mesh(G.box(5, 1.2, 5), 'emgCandy', 'chip'); ic.position.set(0, 7.4, 2); g.add(ic);
        const jk = MB.mesh(G.box(6, 4, 5), 'emgCandy', 'electrode'); jk.position.set(0, 9, -9); g.add(jk);
      });
      MB.tag(c, 'emgCandy', { explode: [0, 40, 0] }); B.cfg.cheap.push(c);
    }
    // Microcontrolador ESP32-S3
    B.mcu = board('esp32', 'chip', 26, 64, -40, 0, (g) => {
      const can = MB.mesh(G.box(18, 3.2, 25), 'esp32', 'usb'); can.position.set(0, 8.5, -12); g.add(can);
      const usb = MB.mesh(G.box(9, 3.4, 7), 'esp32', 'usb'); usb.position.set(0, 8.5, 30); g.add(usb);
      const led = MB.mesh(G.box(2, 1, 2), 'esp32', 'glow'); led.position.set(6, 7.4, 14); g.add(led); B.mcuLed = led;
    });
    MB.tag(B.mcu, 'esp32', { explode: [0, 40, 0] });
    // Aislador digital: separa la parte de los electrodos (a batería) de la fuente de los servos
    B.iso = board('aislador', 'pcbBlue', 20, 26, -5, 0, (g) => {
      const ic = MB.mesh(G.box(6, 2, 8), 'aislador', 'chip'); ic.position.set(0, 7.8, 0); g.add(ic);
    });
    MB.tag(B.iso, 'aislador', { explode: [0, 40, 0] });
    // Servos de bus: adaptador Waveshare · servos PWM: dos PCA9685
    B.bus = board('busDriver', 'pcbBlue', 50, 46, 40, 0, (g) => {
      const jack = MB.mesh(G.cyl(5, 11, 16), 'busDriver', 'chip'); jack.rotation.x = Math.PI / 2; jack.position.set(-14, 12, -18); g.add(jack);
      [-4, 6, 16].forEach((x) => { const c = MB.mesh(G.box(7, 6, 5), 'busDriver', 'electrode'); c.position.set(x, 10, 18); g.add(c); });
    });
    MB.tag(B.bus, 'busDriver', { explode: [0, 40, 0] }); B.cfg.bus.push(B.bus);
    [-16, 16].forEach((z) => {
      const p = board('pca9685', 'pcbBlue', 62, 25, 45, z, (g) => {
        for (let i = 0; i < 16; i++) { const h = MB.mesh(G.box(2.4, 8, 7), 'pca9685', 'chip'); h.position.set(-27 + i * 3.6, 10, -6); g.add(h); }
        const ic = MB.mesh(G.box(8, 1.6, 8), 'pca9685', 'chip'); ic.position.set(0, 7.6, 6); g.add(ic);
      });
      MB.tag(p, 'pca9685', { explode: [0, 40, 0] }); B.cfg.pwm.push(p);
    });
    // Energía: fuente de los servos, batería USB de la parte de EMG y botón de parada en la línea de los servos
    MB.step('energia');
    const psu = MB.mesh(G.rbox(110, 34, 58, 3), 'fuente', 'alu'); psu.position.set(185, 17, -10); tray.add(MB.tag(psu, 'fuente', { explode: [0, 40, 0] }));
    const bat = MB.mesh(G.rbox(70, 16, 140, 6), 'powerbank', 'battery'); bat.position.set(-60, 8, 95); bat.rotation.y = Math.PI / 2; tray.add(MB.tag(bat, 'powerbank', { explode: [0, 40, 0] }));
    const estop = new T.Group(); estop.position.set(110, 0, 30); tray.add(estop);
    const eb = MB.mesh(G.rbox(40, 30, 40, 4), 'parada', 'spool'); eb.position.y = 15; estop.add(eb);
    const mush = MB.mesh(G.cyl(13, 9, 24, 15), 'parada', 'led'); mush.position.y = 35; estop.add(mush);
    MB.tag(estop, 'parada', { explode: [0, 40, 0] });
    // ¿la pieza corresponde a las opciones elegidas?
    B.cfgOk = function (o) {
      const op = MB.ui.opt;
      if (B.cfg.ads.includes(o)) return op.emg === 'ads';
      if (B.cfg.cheap.includes(o)) return op.emg !== 'ads';
      if (B.cfg.bus.includes(o)) return op.act === 'bus';
      if (B.cfg.pwm.includes(o)) return op.act !== 'bus';
      return true;
    };
    B.applyCfg = function (emgOpt, actOpt) {
      B.cfg.ads.forEach((o) => { o.visible = emgOpt === 'ads'; });
      B.cfg.cheap.forEach((o) => { o.visible = emgOpt !== 'ads'; });
      B.cfg.bus.forEach((o) => { o.visible = actOpt === 'bus'; });
      B.cfg.pwm.forEach((o) => { o.visible = actOpt !== 'bus'; });
      // los micro servos PWM (MG90S) tienen casi la misma medida que los de bus: el modelo 3D no cambia
    };

    // Cables (estáticos): electrodos → conector, frente → ESP32 → bus → torre; batería → bus
    MB.step('cables');
    B.cables = [];
    const cable = (key, pts, r, col) => {
      const m = new T.Mesh(G.tube(pts, r, 60), new T.MeshStandardMaterial({ color: col, roughness: 0.6 }));
      m.castShadow = true; root.add(m);
      MB.tag(m, key, { sub: 'line' });
      B.cables.push(m);
      return m;
    };
    const Hm = MB.human, hr = Hm.root.position;
    const hub = new T.Vector3(hr.x + 30, 36, hr.z + 70);
    const hubBox = MB.mesh(G.rbox(26, 12, 18, 3), 'cablesEmg', 'chip'); hubBox.position.copy(hub); root.add(MB.tag(hubBox, 'cablesEmg'));
    const wp = new T.Vector3();
    Hm.electrodes.forEach((e, i) => {
      e.g.getWorldPosition(wp);
      const out = wp.clone().add(new T.Vector3(e.n.x * 22, -10, e.n.z * 22));
      const col = e.ref ? 0x3ddc84 : [0xff5a5a, 0xffb347, 0xffe14a, 0x3ddc84, 0x4ac2ff, 0x8b7bff, 0xff7ad9, 0xdfe7ef][e.ch];
      cable('cablesEmg', [wp.clone(), out, new T.Vector3((out.x + hub.x) / 2, Math.max(28, out.y * 0.4), (out.z + hub.z) / 2 + 10), hub.clone()], 0.7, col);
    });
    const tp = tray.position;
    const emgIn = new T.Vector3(tp.x - 95, 12, tp.z - 26);
    cable('cablesEmg', [hub.clone(), new T.Vector3(hub.x + 30, 4, hub.z + 20), new T.Vector3(emgIn.x - 20, 4, emgIn.z - 10), emgIn], 2.2, 0x22262d);
    const V = (x, y, z) => new T.Vector3(tp.x + x, y, tp.z + z);
    cable('cablesCtrl', [V(-70, 9, 0), V(-58, 14, 4), V(-53, 9, 0)], 1.2, 0xff8a2a);
    cable('cablesCtrl', [V(-27, 9, 6), V(-18, 14, 9), V(-12, 9, 6)], 1.2, 0x4ac2ff);
    cable('cablesCtrl', [V(2, 9, 6), V(10, 14, 9), V(17, 9, 6)], 1.2, 0x4ac2ff);
    cable('cablesCtrl', [V(-40, 9, 31), V(-45, 6, 55), V(-60, 10, 60)], 1.6, 0x22262d);
    const R = MB.robot, rp = R.root.position;
    cable('cablesBus', [V(45, 10, -22), V(75, 4, -70), new T.Vector3(rp.x - 30, 4, rp.z + 90), new T.Vector3(rp.x - 30, 14, rp.z + 40), new T.Vector3(rp.x - 20, 22, rp.z + 20)], 2.4, 0x15171a);
    cable('cablesBus', [V(150, 14, -10), V(128, 4, 20), V(110, 22, 30)], 2.4, 0xd03030);
    cable('cablesBus', [V(110, 22, 30), V(85, 4, 15), V(52, 12, -18)], 2.4, 0xd03030);
    return B;
  };
})();
