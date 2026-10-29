/* Materiales por pieza y geometrías base: huesos, cápsulas, cajas redondeadas y el antebrazo con sección elíptica. */
window.MB = window.MB || {};
(function () {
  const T = THREE, MB = window.MB;
  // los colores en hexadecimal son sRGB (si no, los oscuros salen grises)
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;

  // Cada pieza de la lista de partes tiene sus propios materiales (clonados), así se puede resaltar o aislar sola.
  const BASE = {
    pla: { color: 0xe9e4da, roughness: 0.62, metalness: 0 },
    acrylic: { color: 0x0b0d10, roughness: 0.16, metalness: 0.05 },
    brass: { color: 0xc9a24a, roughness: 0.25, metalness: 0.95 },
    plaDark: { color: 0x2b3038, roughness: 0.6, metalness: 0 },
    plaTeal: { color: 0x2fb39e, roughness: 0.55, metalness: 0 },
    tpu: { color: 0x2a2d33, roughness: 0.92, metalness: 0 },
    pin: { color: 0xc9ced6, roughness: 0.28, metalness: 0.85 },
    steel: { color: 0x9aa3ad, roughness: 0.35, metalness: 0.8 },
    servo: { color: 0x1d2128, roughness: 0.5, metalness: 0.1 },
    servoLbl: { color: 0x4a5160, roughness: 0.6, metalness: 0 },
    horn: { color: 0xd9dde3, roughness: 0.3, metalness: 0.7 },
    spool: { color: 0xf2b84b, roughness: 0.5, metalness: 0 },
    tendon: { color: 0x3fa9ff, roughness: 0.45, metalness: 0, emissive: 0x1a5c99, emissiveIntensity: 0.6 },
    pcb: { color: 0x1d6b45, roughness: 0.55, metalness: 0.05 },
    pcbBlue: { color: 0x1f4fa3, roughness: 0.55, metalness: 0.05 },
    pcbPurple: { color: 0x5b2d8e, roughness: 0.55, metalness: 0.05 },
    pcbRed: { color: 0xa3262e, roughness: 0.55, metalness: 0.05 },
    chip: { color: 0x15171b, roughness: 0.4, metalness: 0.2 },
    gold: { color: 0xd8b25a, roughness: 0.3, metalness: 0.9 },
    usb: { color: 0xb7bec7, roughness: 0.25, metalness: 0.9 },
    wood: { color: 0x6b4a32, roughness: 0.8, metalness: 0 },
    alu: { color: 0xaab2bc, roughness: 0.35, metalness: 0.85 },
    battery: { color: 0x2c3f73, roughness: 0.45, metalness: 0.1 },
    cableBlack: { color: 0x15171a, roughness: 0.7, metalness: 0 },
    skin: { color: 0xd9a487, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false },
    skinSolid: { color: 0xd9a487, roughness: 0.62, metalness: 0 },
    nail: { color: 0xf0cdbd, roughness: 0.3, metalness: 0 },
    sleeve: { color: 0x324257, roughness: 0.9, metalness: 0 },
    muscle: { color: 0xa83a3a, roughness: 0.55, metalness: 0, emissive: 0x000000 },
    electrode: { color: 0xe8eef3, roughness: 0.5, metalness: 0 },
    gel: { color: 0x9fd6ff, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.7 },
    snap: { color: 0xc7cdd4, roughness: 0.25, metalness: 0.9 },
    band: { color: 0x22262d, roughness: 0.85, metalness: 0 },
    pad: { color: 0x2b2f36, roughness: 0.95, metalness: 0 },
    table: { color: 0x1a1f27, roughness: 0.92, metalness: 0 },
    glow: { color: 0x3fd0b6, roughness: 0.4, metalness: 0, emissive: 0x3fd0b6, emissiveIntensity: 0.8 },
    led: { color: 0xff3355, roughness: 0.4, metalness: 0, emissive: 0xff3355, emissiveIntensity: 1 },
  };
  const partMats = {}; // key -> {base -> material}
  MB.partMats = partMats;
  MB.M = function (key, base) {
    const k = key || '_';
    partMats[k] = partMats[k] || {};
    if (!partMats[k][base]) {
      const m = new T.MeshStandardMaterial(Object.assign({}, BASE[base]));
      m.userData.orig = { emissive: m.emissive.clone(), emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
      m.userData.part = k;
      partMats[k][base] = m;
    }
    return partMats[k][base];
  };
  MB.materialsOf = (key) => Object.values(partMats[key] || {});
  MB.allMaterialParts = () => Object.keys(partMats).filter((k) => k !== '_');

  // Registro de objetos por clave de la lista de partes, y del paso de armado en que se colocan
  MB.tagged = {};
  MB.asmList = [];
  let curStep = null;
  MB.step = (s) => { curStep = s; };
  MB.tag = function (obj, key, opts) {
    opts = opts || {};
    obj.userData.key = key;
    (MB.tagged[key] = MB.tagged[key] || []).push(obj);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = opts.shadow !== false; o.receiveShadow = true; o.userData.key = o.userData.key || key; } });
    if (curStep && opts.asm !== false) MB.asmList.push({ obj, step: curStep, sub: opts.sub || 'pop', from: opts.from || null });
    if (opts.explode) obj.userData.explode = opts.explode.clone ? opts.explode.clone() : new T.Vector3().fromArray(opts.explode);
    return obj;
  };

  // ---------- Geometrías ----------
  const G = (MB.Geo = {});
  G.box = (w, h, d) => new T.BoxGeometry(w, h, d);
  G.cyl = (r, h, seg, r2) => new T.CylinderGeometry(r2 === undefined ? r : r2, r, h, seg || 24);
  G.capsule = (r, len, seg) => new T.CapsuleGeometry(r, Math.max(0.01, len), 6, seg || 16);
  G.sphere = (r, seg) => new T.SphereGeometry(r, seg || 20, Math.round((seg || 20) * 0.7));

  // Caja con cantos redondeados (extrusión con bisel), centrada en el origen
  G.rbox = function (w, h, d, r) {
    r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
    const s = new T.Shape(), x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    s.moveTo(x, y - r); s.lineTo(x + W, y - r); s.quadraticCurveTo(x + W + r, y - r, x + W + r, y);
    s.lineTo(x + W + r, y + H); s.quadraticCurveTo(x + W + r, y + H + r, x + W, y + H + r);
    s.lineTo(x, y + H + r); s.quadraticCurveTo(x - r, y + H + r, x - r, y + H);
    s.lineTo(x - r, y); s.quadraticCurveTo(x - r, y - r, x, y - r);
    const g = new T.ExtrudeGeometry(s, { depth: Math.max(0.01, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.98, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
  };

  // Falange impresa: cuerpo alargado en +Y, sección redondeada más ancha en la base, con canal palmar
  G.phalanx = function (len, w0, w1, t0, t1) {
    const segL = 10, segR = 16, pos = [], idx = [];
    for (let i = 0; i <= segL; i++) {
      const v = i / segL, y = v * len;
      // la falange se afina en el medio (como un hueso) y se ensancha en los cóndilos
      const waist = 1 - 0.13 * Math.sin(Math.PI * v);
      const w = (w0 + (w1 - w0) * v) * waist, t = (t0 + (t1 - t0) * v) * waist;
      for (let j = 0; j <= segR; j++) {
        const a = (j / segR) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        // superelipse: más cuadrada que un cilindro, como las piezas impresas
        const e = 0.6, sx = Math.sign(c) * Math.pow(Math.abs(c), e), sz = Math.sign(s) * Math.pow(Math.abs(s), e);
        pos.push(sx * w / 2, y, sz * t / 2);
      }
    }
    for (let i = 0; i < segL; i++) for (let j = 0; j < segR; j++) {
      const a = i * (segR + 1) + j, b = a + segR + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    // tapas en los dos extremos
    [0, segL].forEach((i, k) => {
      const c = pos.length / 3;
      pos.push(0, (i / segL) * len, 0);
      for (let j = 0; j < segR; j++) { const a = i * (segR + 1) + j; if (k === 0) idx.push(c, a, a + 1); else idx.push(c, a + 1, a); }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  // Tubo de sección elíptica que cambia a lo largo de Y: rx(v), rz(v) con v de 0 a 1. Sirve para antebrazos y la palma.
  G.loft = function (len, rxF, rzF, opts) {
    opts = opts || {};
    const segL = opts.segL || 24, segR = opts.segR || 32, pos = [], idx = [];
    for (let i = 0; i <= segL; i++) {
      const v = i / segL, y = v * len, rx = rxF(v), rz = rzF(v), cz = opts.cz ? opts.cz(v) : 0, cx = opts.cx ? opts.cx(v) : 0;
      for (let j = 0; j <= segR; j++) {
        const a = (j / segR) * Math.PI * 2;
        pos.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
      }
    }
    for (let i = 0; i < segL; i++) for (let j = 0; j < segR; j++) {
      const a = i * (segR + 1) + j, b = a + segR + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    if (opts.caps !== false) {
      [0, segL].forEach((i, k) => {
        const v = i / segL, c = pos.length / 3;
        pos.push(opts.cx ? opts.cx(v) : 0, v * len, opts.cz ? opts.cz(v) : 0);
        for (let j = 0; j < segR; j++) {
          const a = i * (segR + 1) + j;
          if (k === 0) idx.push(c, a + 1, a); else idx.push(c, a, a + 1);
        }
      });
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  // Músculo: huso (fusiforme) a lo largo de +Y
  G.spindle = function (len, r, flat) {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const v = i / 16; pts.push(new T.Vector2(Math.max(0.3, r * Math.pow(Math.sin(Math.PI * v), 0.75)), v * len)); }
    const g = new T.LatheGeometry(pts, 18);
    g.scale(1, 1, flat || 0.6);
    return g;
  };

  // Arco de resorte (para los elásticos dorsales de la versión PWM) y tubo genérico por puntos
  G.tube = (pts, r, seg) => new T.TubeGeometry(new T.CatmullRomCurve3(pts), seg || 40, r, 8, false);

  MB.mesh = function (geo, key, base) {
    const m = new T.Mesh(geo, MB.M(key, base));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  MB.at = function (o, x, y, z, rx, ry, rz) {
    o.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
    return o;
  };
})();
