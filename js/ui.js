/* Interfaz: selección y aislamiento de piezas, etiquetas, lista de partes, controles de la simulación,
   osciloscopio, brazalete, matriz de confusión y consola del bus de servos. */
(function () {
  const T = THREE, MB = window.MB, E = MB.EMG, L = E.live;
  const $ = (s) => document.querySelector(s);
  const ui = (MB.ui = { labels: false, selected: null, isolated: null, hideOthers: false, explode: 0, tendons: true, muscles: true, scopeView: 'flt', auto: false, cal: null, opt: { act: 'bus', emg: 'ads' } });
  const fmt = (n) => '$ ' + Math.round(n).toLocaleString('es-UY');
  const fmtUsd = (n) => 'US$ ' + Math.round(n).toLocaleString('es-UY');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const CH_COL = ['#ff5a5a', '#ffb347', '#ffe14a', '#3ddc84', '#4ac2ff', '#8b7bff', '#ff7ad9', '#dfe7ef'];
  MB.CH_COL = CH_COL;
  let toastT = 0;
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); };
  MB.toast = toast;

  // ---------- Lista de partes ----------
  const HAVE_KEY = 'mb-have-v1';
  let have = store.get(HAVE_KEY, {});
  const items = () => MB.BOM.items.filter((it) => !it.cfg || it.cfg === ui.opt.act || it.cfg === ui.opt.emg);
  const itemByKey = (k) => items().find((it) => it.key === k);
  function shown(o) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => m && (m.visible === false || (m.transparent && m.opacity < 0.02)))) return false;
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  }
  const shownTagged = (k) => (MB.tagged[k] || []).filter((o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; });
  const packs = (it) => (it.pack ? Math.ceil(it.qty / it.pack) : 0);
  const subtotal = (it) => (it.pack && it.packPrice ? packs(it) * it.packPrice : (it.unit_price_uyu || 0) * it.qty);
  const qtyText = (it) => (it.pack ? `${it.qty} → ${packs(it)} pack${packs(it) > 1 ? 's' : ''} ×${it.pack}` : `${it.qty}`);

  function renderBOM() {
    const q = ($('#bomSearch').value || '').toLowerCase();
    const cats = [];
    items().forEach((it) => { if (!cats.includes(it.cat)) cats.push(it.cat); });
    let html = '', n = 0, total = 0, missing = 0, imported = 0, local = 0, estim = 0, servos = 0, emg = 0;
    cats.forEach((cat) => {
      const list = items().filter((it) => it.cat === cat);
      const catSum = list.reduce((a, it) => a + subtotal(it), 0);
      let rows = '';
      list.forEach((it) => {
        n++; it.n = n;
        const st = subtotal(it); total += st; if (!have[it.key]) missing += st;
        if ((it.source || '').startsWith('import')) imported += st; else local += st;
        if (!it.verified) estim += st;
        if (it.cat === 'Actuadores') servos += st;
        if (it.cat === 'Lectura de EMG') emg += st;
        if (q && !(it.name + ' ' + it.spec + ' ' + it.short).toLowerCase().includes(q)) return;
        const modeled = shownTagged(it.key).length > 0;
        const unitP = it.incl ? '<span class="u">impresa</span>' : it.pack && it.packPrice ? `${fmt(it.packPrice)}<span class="u">/pack</span>` : fmt(it.unit_price_uyu || 0);
        rows += `<tr data-key="${it.key}" class="${ui.selected === it.key ? 'sel' : ''} ${have[it.key] ? 'have' : ''}">
          <td><input type="checkbox" data-have="${it.key}" ${have[it.key] ? 'checked' : ''} title="Ya lo tengo"></td>
          <td class="idx">${n}</td>
          <td><div class="pn">${esc(it.name)}${modeled ? '' : ' <span class="b nm" title="Sin modelo 3D">sin 3D</span>'}</div><div class="ps">${esc(it.spec)}</div></td>
          <td class="num">${esc(qtyText(it))}<span class="u">${esc(it.unit || 'u')}</span></td>
          <td class="num dim">${unitP}</td>
          <td class="num">${it.incl ? '<span class="u">—</span>' : fmt(st)}</td>
          <td>${it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener" title="${esc(it.source || '')}">↗</a>` : ''}<span class="b ${it.verified ? 'ok' : 'est'}" title="${it.verified ? 'Precio de un listado concreto' : 'Precio estimado'}">${it.verified ? '✓' : '≈'}</span></td>
        </tr>`;
      });
      if (rows) html += `<tr class="cat"><td colspan="5">${esc(cat)}</td><td class="num">${fmt(catSum)}</td><td></td></tr>` + rows;
    });
    $('#bomBody').innerHTML = html;
    const fx = MB.BOM.fx.usd_uyu;
    $('#tot').innerHTML = `
      <div><span>Total del sistema</span><b>${fmt(total)}</b></div>
      <div><span>≈ en dólares (${fx.toFixed(2)} UYU/USD)</span><b>${fmtUsd(total / fx)}</b></div>
      <div><span>Actuadores (${ui.opt.act === 'bus' ? 'bus serie' : 'PWM'})</span><b>${fmt(servos)}</b></div>
      <div><span>Lectura de EMG (${ui.opt.emg === 'ads' ? 'ADS1299' : 'sensores sueltos'})</span><b>${fmt(emg)}</b></div>
      <div><span>Comprado en Uruguay</span><b>${fmt(local)}</b></div>
      <div><span>Importado (sin flete ni impuestos)</span><b>${fmt(imported)}</b></div>
      <div><span>Parte estimada (≈)</span><b>${fmt(estim)}</b></div>
      <div class="miss"><span>Falta comprar (sin lo tildado)</span><b>${fmt(missing)}</b></div>`;
    $('#fxNote').textContent = `Dólar ${MB.BOM.fx.source} ${fx.toFixed(2)} al ${MB.BOM.fx.date}. Las piezas impresas no suman: su costo está en el filamento.`;
    MB.totals = { total, imported, local, estim, missing, servos, emg };
  }
  MB.renderBOM = renderBOM;

  // ---------- Selección, resaltado y aislamiento ----------
  function setEmissive(part, on) {
    MB.materialsOf(part).forEach((m) => {
      if (!m.emissive) return;
      const o = m.userData.orig;
      if (on) { m.emissive.setHex(0x2f7dff); m.emissiveIntensity = on === 'hover' ? 0.35 : 0.6; }
      else { m.emissive.copy(o.emissive); m.emissiveIntensity = o.emissiveIntensity; }
    });
  }
  const NOGHOST = ['_'];
  function applyIsolation() {
    const iso = ui.isolated;
    MB.allMaterialParts().forEach((p) => {
      if (NOGHOST.includes(p)) return;
      MB.materialsOf(p).forEach((m) => {
        const o = m.userData.orig, ghost = iso && p !== iso, was = m.transparent;
        if (ghost) { m.transparent = true; m.opacity = ui.hideOthers ? 0 : 0.07; m.depthWrite = false; }
        else { m.transparent = o.transparent; m.opacity = o.opacity; m.depthWrite = o.depthWrite; }
        m.visible = !(ghost && ui.hideOthers);
        if (was !== m.transparent) m.needsUpdate = true;
      });
    });
    const hum = MB.human;
    hum.muscles.forEach((mu) => mu.meshes.forEach((me) => { me.visible = ui.muscles && (!iso || iso === 'musculo'); }));
    hum.bones3d.forEach((b) => { b.visible = ui.muscles && !iso; });
    MB.robot.tendons.forEach((t) => { const k = t.line.userData.key; t.line.visible = (ui.tendons || k !== 'bielas') && (!iso || iso === k || !ui.hideOthers) && t.line.userData.asmOk !== false; });
    MB.bench.cables.forEach((c) => { const k = c.userData.key; c.material.opacity = iso && iso !== k ? (ui.hideOthers ? 0 : 0.07) : 1; c.material.transparent = !!iso; c.visible = !(iso && iso !== k && ui.hideOthers) && c.userData.asmOk !== false; });
    $('#isoBtn').classList.toggle('on', !!iso);
    $('#cardIso').textContent = iso ? 'Mostrar todo' : 'Aislar';
  }
  MB.applyIsolation = applyIsolation;
  MB.select = function (part, opts) {
    opts = opts || {};
    if (ui.selected && ui.selected !== part) setEmissive(ui.selected, false);
    ui.selected = part;
    if (part) setEmissive(part, true);
    if (ui.isolated && part && ui.isolated !== part) { ui.isolated = part; applyIsolation(); }
    showCard(part, opts.muscle);
    document.querySelectorAll('#bomBody tr[data-key]').forEach((tr) => tr.classList.toggle('sel', tr.dataset.key === part));
    document.querySelectorAll('#labels .lbl').forEach((l) => l.classList.toggle('sel', l.dataset.key === part));
    if (part && opts.scroll) { const tr = document.querySelector(`#bomBody tr[data-key="${part}"]`); if (tr) tr.scrollIntoView({ block: 'nearest' }); }
    if (part && opts.focus) focusPart(part);
  };
  MB.isolate = function (part) {
    ui.isolated = ui.isolated === part ? null : part;
    applyIsolation();
    if (ui.isolated) focusPart(ui.isolated);
  };

  function showCard(part, muscle) {
    const card = $('#card');
    if (!part) { card.hidden = true; return; }
    card.hidden = false;
    ui.cardMuscle = null;
    if (part === 'musculo' && muscle !== undefined) {
      const m = MB.MUSCLES[muscle];
      ui.cardMuscle = muscle;
      // qué canales lo captan más
      const W = E.chanMuscle;
      const top = W.map((r, c) => [c, r[muscle]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      $('#cardBody').innerHTML = `<div class="cn">Músculo del antebrazo</div><h3>${esc(m.n)} (${m.k})</h3>
        <div class="cs">${m.deep < 0.8 ? 'Profundo: llega débil a la piel y mezclado con los de arriba.' : 'Superficial: se lee bien desde la piel.'}</div>
        <div class="cg"><span>Activación</span><b id="cardAct">—</b>
        <span>Lo captan más</span><b>${top.map((t) => `C${t[0] + 1} <i>${Math.round(t[1] * 100)}%</i>`).join(' · ')}</b></div>
        <div class="cnote">${esc(MB.MUSCLE_ROLE[m.k] || '')}</div>`;
      return;
    }
    if (part === 'persona') { $('#cardBody').innerHTML = '<div class="cn">Persona</div><h3>Brazo de quien controla la mano</h3><div class="cs">La piel del antebrazo es translúcida para ver los músculos que se activan. Los electrodos van pegados con gel sobre la piel.</div><div class="cnote">Piel: brazo derecho de «Universal Base Characters» de Quaternius (CC0), con esqueleto. Músculos y huesos: BodyParts3D, © The Database Center for Life Science, CC BY 4.0 (modificado).</div>'; return; }
    const it = itemByKey(part);
    const modeled = shownTagged(part).length > 0;
    if (!it) { $('#cardBody').innerHTML = `<h3>${esc(part)}</h3>`; return; }
    $('#cardBody').innerHTML = `
      <div class="cn">#${it.n || '–'} · ${esc(it.cat)}</div>
      <h3>${esc(it.name)}</h3>
      <div class="cs">${esc(it.spec)}</div>
      <div class="cg">
        <span>Cantidad</span><b>${esc(qtyText(it))} ${esc(it.unit || 'u')}</b>
        ${it.incl ? '<span>Costo</span><b>en el filamento</b>' : `<span>${it.pack ? 'Precio por pack' : 'Precio unitario'}</span><b>${fmt(it.pack && it.packPrice ? it.packPrice : it.unit_price_uyu || 0)}${it.currency === 'USD' ? ` <i>(US$ ${esc(it.pack && it.packPriceUsd ? it.packPriceUsd : it.price)})</i>` : ''}</b>
        <span>Subtotal</span><b>${fmt(subtotal(it))}</b>`}
        <span>Fuente</span><b>${esc(it.source || '—')} <em class="b ${it.verified ? 'ok' : 'est'}">${it.verified ? 'listado real' : 'estimado'}</em></b>
      </div>
      ${it.note ? `<div class="cnote">${esc(it.note)}</div>` : ''}
      ${it.link ? `<a class="buy" href="${esc(it.link)}" target="_blank" rel="noopener">Ver en ${esc((it.source || 'tienda').replace(/^import: /, ''))} ↗</a>` : ''}
      ${modeled ? '' : '<div class="cnote">Esta parte no tiene modelo 3D (consumible o material).</div>'}`;
  }

  // ---------- Cámara ----------
  const camAnim = { t: 1, fromP: new T.Vector3(), toP: new T.Vector3(), fromT: new T.Vector3(), toT: new T.Vector3() };
  function flyTo(target, dist, dir, instant) {
    const cam = MB.camera, ctl = MB.controls;
    const d = dir ? dir.clone().normalize() : cam.position.clone().sub(ctl.target).normalize();
    camAnim.fromP.copy(cam.position); camAnim.fromT.copy(ctl.target);
    camAnim.toT.copy(target); camAnim.toP.copy(target).addScaledVector(d, dist);
    camAnim.t = instant ? 1 : 0;
    if (instant) { cam.position.copy(camAnim.toP); ctl.target.copy(camAnim.toT); }
  }
  MB.flyTo = flyTo;
  function partBox(part) {
    const b = new T.Box3(), tmp = new T.Box3();
    shownTagged(part).forEach((o) => { tmp.setFromObject(o); if (!tmp.isEmpty()) b.union(tmp); });
    if (part === 'musculo') MB.human.muscles.forEach((m) => m.meshes.forEach((me) => { tmp.setFromObject(me); b.union(tmp); }));
    return b;
  }
  function focusPart(part) {
    const b = partBox(part);
    if (b.isEmpty()) return;
    const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3()).length();
    flyTo(c, Math.max(60, s * 1.5 + 40));
  }
  MB.view = function (name, instant) {
    const hp = MB.human.root.position, rp = MB.robot.root.position, tp = MB.bench.tray.position;
    const wr = MB.robot.hand.root.getWorldPosition(new T.Vector3());
    const V = {
      // la escena es ancha: en una ventana angosta hay que alejarse más
      general: [new T.Vector3(0, 185, 40), 1150 * Math.max(1, 1.45 / MB.camera.aspect), new T.Vector3(0.32, 0.42, 1)],
      mano: [wr.clone().add(new T.Vector3(0, 95, 0)), 380, new T.Vector3(0.35, 0.22, 1)],
      // los servos y las bielas están del lado del dorso: se miran desde atrás
      servos: [wr.clone().add(new T.Vector3(0, 50, 0)), 300, new T.Vector3(-0.35, 0.3, -1)],
      brazo: [new T.Vector3(hp.x, 140, hp.z), 470, new T.Vector3(-0.25, 0.2, 1)],
      electronica: [new T.Vector3(tp.x + 40, 0, tp.z), 480, new T.Vector3(0.1, 1, 0.55)],
    }[name];
    flyTo(V[0], V[1], V[2], instant);
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  };

  // ---------- Etiquetas ----------
  let labelEls = {};
  function buildLabels() {
    const host = $('#labels'); host.innerHTML = ''; labelEls = {};
    if (!ui.labels) return;
    items().forEach((it) => {
      if (!MB.tagged[it.key]) return;
      const el = document.createElement('div');
      el.className = 'lbl'; el.dataset.key = it.key;
      el.innerHTML = `<b>${it.n}</b>${esc(it.short || it.name)}`;
      el.onclick = () => MB.select(it.key, { scroll: true });
      host.appendChild(el); labelEls[it.key] = el;
    });
  }
  const _b = new T.Box3(), _c = new T.Vector3();
  function updateLabels() {
    if (!ui.labels) return;
    const r = MB.renderer.domElement.getBoundingClientRect();
    Object.keys(labelEls).forEach((k) => {
      const el = labelEls[k], objs = shownTagged(k);
      const o = objs[Math.floor(objs.length / 2)];
      if (!o || (ui.isolated && ui.isolated !== k)) { el.style.display = 'none'; return; }
      _b.setFromObject(o); if (_b.isEmpty()) { el.style.display = 'none'; return; }
      _b.getCenter(_c).project(MB.camera);
      if (_c.z > 1) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = `translate(${r.left + ((_c.x + 1) / 2) * r.width}px, ${r.top + ((1 - _c.y) / 2) * r.height}px)`;
    });
  }

  // ---------- Selección con el mouse ----------
  const ray = new T.Raycaster(), mouse = new T.Vector2();
  ray.params.Line.threshold = 1.2;
  function pick(ev) {
    const r = MB.renderer.domElement.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, MB.camera);
    const hits = ray.intersectObjects(MB.scene.children, true);
    for (const h of hits) {
      const o = h.object;
      if (!shown(o)) continue;
      let k = o.userData.key;
      if (o.userData.muscle !== undefined) return { key: 'musculo', muscle: o.userData.muscle };
      if (!k || k === '_') continue;
      if (k === 'persona') { if (ui.muscles) continue; return { key: 'persona' }; }
      if (ui.isolated && ui.isolated !== k) continue;
      return { key: k };
    }
    return null;
  }
  function wirePicking() {
    const el = MB.renderer.domElement, tip = $('#tip');
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || e.button !== 0) return;
      const p = pick(e);
      if (p) MB.select(p.key, { scroll: true, muscle: p.muscle }); else MB.select(null);
    });
    el.addEventListener('dblclick', (e) => { const p = pick(e); if (p) { MB.select(p.key, { muscle: p.muscle }); focusPart(p.key); } });
    let last = 0;
    el.addEventListener('pointermove', (e) => {
      const now = performance.now(); if (now - last < 60) return; last = now;
      const p = pick(e);
      if (!p) { tip.style.display = 'none'; el.style.cursor = ''; return; }
      const it = itemByKey(p.key);
      const name = p.key === 'musculo' ? MB.MUSCLES[p.muscle].n : p.key === 'persona' ? 'Brazo de la persona' : it ? it.name : p.key;
      const sub = p.key === 'musculo' ? `activación ${Math.round(L.muscleAct[p.muscle] * 100)} %` : it ? (it.incl ? 'pieza impresa' : fmt(subtotal(it))) : '';
      tip.innerHTML = `<b>${esc(name)}</b><span>${esc(sub)}</span>`;
      tip.style.display = 'block'; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 12 + 'px';
      el.style.cursor = 'pointer';
    });
    el.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
  }

  // ---------- Explosionado ----------
  function applyExplode() {
    const f = ui.explode;
    Object.values(MB.tagged).forEach((list) => list.forEach((o) => {
      const ex = o.userData.explode; if (!ex) return;
      if (!o.userData.p0) o.userData.p0 = o.position.clone();
      if (o.userData.asmAnim) return;
      o.position.copy(o.userData.p0).addScaledVector(ex, f);
    }));
  }
  MB.applyExplode = applyExplode;

  // ---------- Controles de la simulación ----------
  const GSHORT = { reposo: 'Reposo', abrir: 'Abrir', puno: 'Puño', pinza: 'Pinza', tripode: 'Trípode', senalar: 'Señalar', pulgar: 'Pulgar ↑', lateral: 'Lateral', flexMun: 'Muñeca ↓', extMun: 'Muñeca ↑' };
  MB.GSHORT = GSHORT;
  function setGesture(k, fromUser) {
    E.gesture = k;
    if (fromUser) { ui.auto = false; $('#auto').checked = false; if (E.manual) { E.manual = null; $('#manual').checked = false; $('#manualBox').hidden = true; } }
    document.querySelectorAll('#gest button').forEach((b) => b.classList.toggle('on', b.dataset.g === k && !E.manual));
  }
  MB.setGesture = setGesture;
  function buildControls() {
    $('#gest').innerHTML = MB.GESTURES.map((g) => `<button data-g="${g.k}"><kbd>${g.key}</kbd>${esc(g.n)}</button>`).join('');
    document.querySelectorAll('#gest button').forEach((b) => { b.onclick = () => setGesture(b.dataset.g, true); });
    setGesture(E.gesture);
    const MAN = ['Pulgar', 'Índice', 'Medio', 'Anular', 'Meñique', 'Muñeca'];
    $('#manualBox').innerHTML = MAN.map((n, i) => `<span>${n}</span><input type="range" data-m="${i}" min="${i === 5 ? -1 : 0}" max="1" step="0.01" value="${i === 5 ? 0 : 0.2}">`).join('');
    const readManual = () => { E.manual = Array.from(document.querySelectorAll('#manualBox input')).map((r) => +r.value); };
    document.querySelectorAll('#manualBox input').forEach((r) => { r.oninput = readManual; });
    $('#manual').onchange = (e) => {
      $('#manualBox').hidden = !e.target.checked;
      if (e.target.checked) { ui.auto = false; $('#auto').checked = false; readManual(); } else E.manual = null;
      setGesture(E.gesture);
    };
    $('#auto').onchange = (e) => { ui.auto = e.target.checked; ui.autoT = 0; ui.autoI = 0; if (ui.auto && E.manual) { E.manual = null; $('#manual').checked = false; $('#manualBox').hidden = true; } };
    const slider = (id, out, fn, fmtF) => { const el = $('#' + id); const upd = () => { fn(+el.value); $('#' + out).textContent = fmtF(+el.value); }; el.oninput = upd; upd(); };
    const pct = (v) => Math.round(v * 100) + ' %';
    slider('intensity', 'intV', (v) => { E.intensity = v; }, pct);
    slider('force', 'forceV', (v) => { E.force = v; }, pct);
    slider('hum', 'humV', (v) => { E.noise.hum = v; }, (v) => (v * 0.35 * 1000).toFixed(0) + ' µV');
    slider('motion', 'motV', (v) => { E.noise.motion = v; }, pct);
    slider('fatigue', 'fatV', (v) => { E.noise.fatigue = v; }, pct);
    const det = $('#detached');
    for (let c = 0; c < MB.NCH; c++) det.insertAdjacentHTML('beforeend', `<option value="${c}">Canal ${c + 1} (${MB.MUSCLES[E.chanTop[c]].k})</option>`);
    det.onchange = () => { E.noise.detached = +det.value; };
    $('#fBand').onchange = (e) => { E.filt.band = e.target.checked; };
    $('#fNotch').onchange = (e) => { E.filt.notch = e.target.checked; };

    // antivibración: el suavizado va de 3 Hz (casi nada) a 0,2 Hz (mucho) en escala logarítmica
    $('#smOn').onchange = (e) => { E.smooth.on = e.target.checked; };
    $('#smHold').onchange = (e) => { E.smooth.hold = e.target.checked; };
    slider('smDb', 'smDbV', (v) => { E.smooth.deadband = v; }, (v) => v.toFixed(1).replace('.', ',') + '°');
    slider('smFc', 'smFcV', (v) => { E.smooth.minCutoff = 3 * Math.pow(0.07, v); }, () => E.smooth.minCutoff.toFixed(2).replace('.', ',') + ' Hz');

    // control por dedo: cada grupo puede pasar a manual y moverse con sus propios controles
    const JN = { tAbd: 'abducción', tFlex: 'oposición', tMcp: 'MCP', tIp: 'IP', wFlex: 'flexión' };
    const MR = E.manualRobot;
    $('#mrBox').innerHTML = MB.GROUPS.map((g, gi) => `<div class="mr" data-g="${gi}"><div class="mh">${esc(g.n)}<label><input type="checkbox" data-mg="${gi}">manual</label></div>
      <div class="js">${g.dofs.map((d) => { const D = MB.DOF[d], nm = JN[D.k] || (D.k.endsWith('Abd') ? 'abducción' : D.k.endsWith('Mcp') ? 'MCP' : 'PIP+DIP'); return `<span>${nm}</span><input type="range" data-md="${d}" min="${D.lo}" max="${D.hi}" step="0.01" value="${MR.q[d]}">`; }).join('')}</div></div>`).join('');
    const syncMR = () => {
      document.querySelectorAll('#mrBox .mr').forEach((el) => el.classList.toggle('on', MR.on[+el.dataset.g]));
      document.querySelectorAll('#mrBox input[data-mg]').forEach((c) => { c.checked = MR.on[+c.dataset.mg]; });
      document.querySelectorAll('#mrBox input[data-md]').forEach((r) => { r.value = MR.q[+r.dataset.md]; });
    };
    MB.syncManualRobot = syncMR;
    $('#mrBox').addEventListener('input', (e) => {
      const d = e.target.dataset.md, g = e.target.dataset.mg;
      if (d !== undefined) {
        MR.q[+d] = +e.target.value;
        // mover un control pasa ese dedo a manual
        const gi = MB.GROUPS.findIndex((x) => x.dofs.includes(+d)); if (!MR.on[gi]) { MR.on[gi] = true; syncMR(); }
      }
      if (g !== undefined) { MR.on[+g] = e.target.checked; if (e.target.checked) MB.GROUPS[+g].dofs.forEach((k) => { MR.q[k] = L.robotQ[k]; }); syncMR(); }
    });
    $('#mrCopy').onclick = () => { MR.q = L.robotQ.slice(); syncMR(); toast('Los controles toman la postura actual de la mano'); };
    $('#mrAll').onclick = () => { MR.q = L.robotQ.slice(); MR.on = MR.on.map(() => true); syncMR(); };
    $('#mrNone').onclick = () => { MR.on = MR.on.map(() => false); syncMR(); };
    syncMR();
    document.querySelectorAll('input[name=mode]').forEach((r) => { r.onchange = () => { E.mode = r.value; document.body.classList.toggle('reg', E.mode === 'reg'); L.votes = []; }; });
    document.querySelectorAll('input[name=scopeV]').forEach((r) => { r.onchange = () => { ui.scopeView = r.value; }; });
    $('#btnCal').onclick = startCalibration;
    $('#btnConf').onclick = () => { const c = $('#conf'); c.hidden = !c.hidden; drawConf(); };
    $('#clearLog').onclick = () => { $('#log').innerHTML = ''; };
    $('#probs').innerHTML = MB.GESTURES.map((g, i) => `<span>${esc(g.n)}</span><i><b id="pb${i}"></b></i><em id="pv${i}"></em>`).join('');
    $('#regBars').innerHTML = ['Pulgar', 'Índice', 'Medio', 'Anular', 'Meñique', 'Muñeca'].map((n, i) => `<span>${n}</span><i><b id="rb${i}"></b></i><em id="rv${i}"></em>`).join('');

    // opciones de hardware
    ui.opt = store.get('mb-opt-v1', ui.opt);
    const applyOpt = () => {
      E.act = ui.opt.act;
      MB.bench.applyCfg(ui.opt.emg, ui.opt.act);
      store.set('mb-opt-v1', ui.opt);
      renderBOM(); buildLabels();
      if (ui.selected) showCard(ui.selected);
    };
    document.querySelectorAll('input[name=actOpt]').forEach((r) => { r.checked = r.value === ui.opt.act; r.onchange = () => { ui.opt.act = r.value; applyOpt(); }; });
    document.querySelectorAll('input[name=emgOpt]').forEach((r) => { r.checked = r.value === ui.opt.emg; r.onchange = () => { ui.opt.emg = r.value; applyOpt(); }; });
    applyOpt();

    $('#bomSearch').oninput = renderBOM;
    $('#bomBody').addEventListener('click', (e) => {
      const cb = e.target.closest('input[data-have]');
      if (cb) { have[cb.dataset.have] = cb.checked; store.set(HAVE_KEY, have); renderBOM(); return; }
      if (e.target.closest('a')) return;
      const tr = e.target.closest('tr[data-key]');
      if (tr) MB.select(tr.dataset.key, { focus: true });
    });

    // barra de herramientas
    document.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => MB.view(b.dataset.view); });
    $('#tTendon').onclick = (e) => { ui.tendons = !ui.tendons; e.target.classList.toggle('on', ui.tendons); applyIsolation(); };
    $('#tMus').onclick = (e) => {
      ui.muscles = !ui.muscles; e.target.classList.toggle('on', ui.muscles);
      const m = MB.human.skin.material; m.opacity = ui.muscles ? 0.4 : 1; m.transparent = ui.muscles; m.depthWrite = !ui.muscles; m.needsUpdate = true;
      m.userData.orig.opacity = m.opacity; m.userData.orig.transparent = m.transparent; m.userData.orig.depthWrite = m.depthWrite;
      applyIsolation();
    };
    $('#tLbl').onclick = (e) => { ui.labels = !ui.labels; e.target.classList.toggle('on', ui.labels); buildLabels(); };
    $('#tScope').onclick = (e) => { const s = $('#scope'); s.hidden = !s.hidden; e.target.classList.toggle('on', !s.hidden); };
    $('#isoBtn').onclick = () => { if (ui.isolated) MB.isolate(ui.isolated); else if (ui.selected) MB.isolate(ui.selected); else toast('Elegí una pieza primero'); };
    $('#hideOthers').onchange = (e) => { ui.hideOthers = e.target.checked; applyIsolation(); };
    $('#explode').oninput = (e) => { ui.explode = +e.target.value; applyExplode(); };
    $('#cardClose').onclick = () => MB.select(null);
    $('#cardFocus').onclick = () => ui.selected && focusPart(ui.selected);
    $('#cardIso').onclick = () => ui.selected && MB.isolate(ui.selected);

    // pestañas
    document.querySelectorAll('.tabs button').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
        document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== 'tab-' + b.dataset.tab; });
        document.body.classList.toggle('wide', b.dataset.tab === 'parts');
        MB.onResize();
        if (b.dataset.tab === 'asm') MB.asm.enter(); else if (MB.asm.active) MB.asm.exit();
      };
    });
    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input[type=search], textarea')) return;
      const g = MB.GESTURES.find((x) => x.key === e.key);
      if (g && !MB.asm.active) { setGesture(g.k, true); return; }
      if (e.key === 'Escape') { if (ui.isolated) MB.isolate(ui.isolated); MB.select(null); }
      if ((e.key === 'i' || e.key === 'I') && ui.selected) MB.isolate(ui.selected);
      if ((e.key === 'f' || e.key === 'F') && ui.selected) focusPart(ui.selected);
    });
  }

  // ---------- Calibración visible ----------
  function startCalibration() {
    if (ui.cal) return;
    ui.auto = false; $('#auto').checked = false;
    E.manual = null; $('#manual').checked = false; $('#manualBox').hidden = true;
    ui.cal = { i: 0, t: 0, prevG: E.gesture };
    $('#btnCal').disabled = true;
    log('▶ Calibración: hacé cada gesto cuando aparezca', 'hdr');
  }
  MB.startCalibration = startCalibration;
  const CAL_STEP = 1.3;
  function tickCalibration(dt) {
    const c = ui.cal; if (!c) return;
    c.t += dt;
    const i = Math.floor(c.t / CAL_STEP);
    if (i >= MB.GESTURES.length) {
      const m = E.calibrate();
      ui.cal = null; $('#btnCal').disabled = false;
      setGesture('reposo');
      showCalResult();
      log(`✓ Decodificador entrenado: ${m.nTrain} ventanas, acierto ${(m.acc * 100).toFixed(1)} % en datos nuevos`, 'ok');
      if (c.done) c.done(m);
      return;
    }
    const g = MB.GESTURES[i];
    if (E.gesture !== g.k) { setGesture(g.k); log(`  grabando «${g.n}»…`); }
    $('#calRes').innerHTML = `Grabando <b>${esc(g.n)}</b> · gesto ${i + 1} de ${MB.GESTURES.length}`;
  }
  MB.calibrateVisible = function (done) { startCalibration(); ui.cal.done = done; };
  // al salir del armado a mitad de una calibración, se corta (queda el modelo anterior)
  MB.cancelCalibration = function () {
    if (!ui.cal) return;
    ui.cal = null; $('#btnCal').disabled = false; setGesture('reposo');
    log('✗ Calibración cancelada: sigue el decodificador anterior', 'err');
    showCalResult();
  };
  function showCalResult() {
    const m = E.model; if (!m) return;
    $('#calRes').innerHTML = `Acierto en datos nuevos: <b>${(m.acc * 100).toFixed(1)} %</b> · ${m.nTrain} ventanas de entrenamiento · error de la regresión ${m.regRmse.toFixed(2)} · entrenado en ${Math.round(m.ms)} ms`;
    drawConf();
  }
  MB.showCalResult = showCalResult;
  function drawConf() {
    const cv = $('#conf'); if (cv.hidden || !E.model) return;
    const ctx = cv.getContext('2d'), C = E.model.conf, n = C.length, W = cv.width, H = cv.height, x0 = 78, y0 = 8, cs = Math.min((W - x0 - 8) / n, (H - y0 - 40) / n);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '10px system-ui'; ctx.textBaseline = 'middle';
    C.forEach((row, i) => {
      const tot = row.reduce((a, b) => a + b, 0) || 1;
      ctx.fillStyle = '#8b95a3'; ctx.textAlign = 'right'; ctx.fillText(GSHORT[MB.GESTURES[i].k], x0 - 5, y0 + i * cs + cs / 2);
      row.forEach((v, j) => {
        const f = v / tot;
        ctx.fillStyle = i === j ? `rgba(63,208,182,${0.12 + 0.88 * f})` : f > 0 ? `rgba(255,90,90,${0.25 + 0.75 * f})` : '#141922';
        ctx.fillRect(x0 + j * cs + 1, y0 + i * cs + 1, cs - 2, cs - 2);
        if (v) { ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(v, x0 + j * cs + cs / 2, y0 + i * cs + cs / 2); }
      });
    });
    ctx.save(); ctx.fillStyle = '#8b95a3'; ctx.textAlign = 'right';
    MB.GESTURES.forEach((g, j) => { ctx.save(); ctx.translate(x0 + j * cs + cs / 2, y0 + n * cs + 4); ctx.rotate(-Math.PI / 3); ctx.fillText(GSHORT[g.k], 0, 0); ctx.restore(); });
    ctx.restore();
    ctx.fillStyle = '#8b95a3'; ctx.textAlign = 'left'; ctx.fillText('filas: lo que hizo · columnas: lo que entendió', 4, H - 6);
  }

  // ---------- Consola del bus ----------
  const logEl = () => $('#log');
  function log(msg, cls) {
    const el = logEl(), d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = msg;
    el.appendChild(d);
    while (el.childNodes.length > 140) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }
  MB.log = log;
  const hex = (v) => v.toString(16).toUpperCase().padStart(2, '0');
  function busFrame() {
    const q = L.robotQ;
    if (ui.opt.act === 'bus') {
      // SYNC WRITE (0x83) a la dirección 0x2A (posición objetivo), 2 bytes por servo, IDs 1–17
      const pos = q.map((v) => Math.max(0, Math.min(4095, Math.round(2048 + (v * 1.55 / (2 * Math.PI)) * 4096))));
      const bytes = [0xff, 0xff, 0xfe, 3 * 17 + 4, 0x83, 0x2a, 0x02];
      pos.forEach((p, i) => bytes.push(i + 1, p & 0xff, p >> 8));
      let chk = 0; for (let i = 2; i < bytes.length; i++) chk += bytes[i];
      bytes.push(~chk & 0xff);
      return `TX ${bytes.slice(0, 13).map(hex).join(' ')} … ${hex(bytes[bytes.length - 1])}  (${bytes.length} B, pos ${pos.slice(4, 7).join('/')}…)`;
    }
    const us = q.map((v) => Math.round(1500 + v * 1.55 * (1000 / Math.PI)));
    return `I²C 0x40 LED0..15 · ${us.slice(0, 6).join(' ')} … µs · 0x41 LED0 ${us[16]} µs`;
  }

  // ---------- Dibujo del osciloscopio y el brazalete ----------
  function drawScope() {
    const cv = $('#scopeC'); if ($('#scope').hidden) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0d12'; ctx.fillRect(0, 0, w, h);
    const S = L.scope, lane = h / MB.NCH, view = ui.scopeView;
    const data = S[view], scale = view === 'raw' ? 1.3 : view === 'flt' ? 0.9 : 0.42;
    const per = S.n / w;
    ctx.strokeStyle = '#1a2230'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo((w * i) / 4, 0); ctx.lineTo((w * i) / 4, h); ctx.stroke(); }
    for (let c = 0; c < MB.NCH; c++) {
      const y0 = lane * c + lane / 2, amp = lane * 0.48 / scale, buf = data[c];
      ctx.strokeStyle = '#151b24'; ctx.beginPath(); ctx.moveTo(0, view === 'env' ? lane * (c + 1) - 3 : y0); ctx.lineTo(w, view === 'env' ? lane * (c + 1) - 3 : y0); ctx.stroke();
      ctx.strokeStyle = CH_COL[c]; ctx.globalAlpha = c === E.noise.detached ? 0.55 : 0.95;
      ctx.beginPath();
      if (view === 'env') {
        for (let x = 0; x < w; x++) { const v = buf[(S.pos + Math.floor(x * per)) % S.n]; const y = lane * (c + 1) - 3 - Math.min(lane - 6, v * amp * 2); if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      } else {
        for (let x = 0; x < w; x++) {
          let mn = 1e9, mx = -1e9;
          for (let k = Math.floor(x * per), e = Math.floor((x + 1) * per); k < e; k++) { const v = buf[(S.pos + k) % S.n]; if (v < mn) mn = v; if (v > mx) mx = v; }
          const lim = lane * 0.5 - 1;
          ctx.moveTo(x + 0.5, y0 - Math.max(-lim, Math.min(lim, mx * amp))); ctx.lineTo(x + 0.5, y0 - Math.max(-lim, Math.min(lim, mn * amp)) + 0.6);
        }
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = CH_COL[c]; ctx.font = '600 10px system-ui'; ctx.fillText(`C${c + 1} ${MB.MUSCLES[E.chanTop[c]].k}`, 5, lane * c + 11);
    }
    const unit = view === 'raw' ? '±1,3 mV' : view === 'flt' ? '±0,9 mV' : '0–0,4 mV';
    $('#scopeFoot').textContent = `${unit} por carril · 1 kHz · ${view === 'raw' ? 'sin filtrar: se ve el zumbido de 50 Hz y el movimiento' : view === 'flt' ? 'pasabanda ' + (E.filt.band ? '20–450 Hz' : 'apagado') + ' · notch ' + (E.filt.notch ? '50 Hz' : 'apagado') : 'rectificada y suavizada (lo que mide la amplitud)'}`;
  }
  function drawBand() {
    const cv = $('#band'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2 - 40, cy = H / 2 + 4;
    ctx.clearRect(0, 0, W, H);
    const rx = 82, rz = 70, M = E.model;
    // corte del antebrazo visto desde el codo: palma arriba, lado del pulgar a la izquierda
    ctx.fillStyle = '#1b2029'; ctx.beginPath(); ctx.ellipse(cx, cy, rx, rz, 0, 0, Math.PI * 2); ctx.fill();
    MB.MUSCLES.forEach((m, i) => {
      const a = (m.phi * Math.PI) / 180, d = 0.55 + 0.33 * m.deep, act = L.muscleAct[i];
      ctx.fillStyle = `rgba(${150 + 105 * act},${50 + 40 * act},${50},${0.35 + 0.65 * act})`;
      ctx.beginPath(); ctx.ellipse(cx - Math.cos(a) * rx * d, cy - Math.sin(a) * rz * d, 10, 7, -a, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9d2dc'; ctx.font = '9px system-ui'; ctx.textAlign = 'center'; ctx.fillText(m.k, cx - Math.cos(a) * rx * d, cy - Math.sin(a) * rz * d + 3);
    });
    for (let c = 0; c < MB.NCH; c++) {
      const a = (MB.chPhi(c) * Math.PI) / 180, v = M ? Math.min(1.2, L.mav[c] / M.mavScale[c]) : 0;
      const x = cx - Math.cos(a) * (rx + 8), y = cy - Math.sin(a) * (rz + 8);
      const x2 = cx - Math.cos(a) * (rx + 10 + v * 46), y2 = cy - Math.sin(a) * (rz + 10 + v * 46);
      ctx.strokeStyle = CH_COL[c]; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.globalAlpha = c === E.noise.detached ? 0.35 : 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#e6ebf1'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('C' + (c + 1), cx - Math.cos(a) * (rx + 66), cy - Math.sin(a) * (rz + 62) + 3);
    }
    ctx.lineWidth = 1; ctx.textAlign = 'left'; ctx.fillStyle = '#8b95a3'; ctx.font = '10px system-ui';
    ctx.fillText('palma', cx - 12, 12); ctx.fillText('dorso', cx - 12, H - 4); ctx.fillText('pulgar', 2, cy + 3); ctx.fillText('meñique', cx + rx + 50, cy + 3);
    // leyenda a la derecha: nivel global
    ctx.fillStyle = '#8b95a3'; ctx.fillText('nivel', W - 64, 20);
    ctx.fillStyle = '#24303f'; ctx.fillRect(W - 64, 28, 14, 160);
    const lv = Math.min(1, L.level * 1.4); ctx.fillStyle = '#3fd0b6'; ctx.fillRect(W - 64, 28 + 160 * (1 - lv), 14, 160 * lv);
    ctx.fillStyle = '#c9d2dc'; ctx.fillText(Math.round(L.level * 100) + '%', W - 46, 34 + 160 * (1 - lv));
  }

  // ---------- Bucle de la interfaz ----------
  let acc = 0, busAcc = 0, lastCls = -1;
  ui.frame = function (dt) {
    // cámara
    if (camAnim.t < 1) {
      camAnim.t = Math.min(1, camAnim.t + dt / 0.8);
      const k = 1 - Math.pow(1 - camAnim.t, 3);
      MB.camera.position.lerpVectors(camAnim.fromP, camAnim.toP, k);
      MB.controls.target.lerpVectors(camAnim.fromT, camAnim.toT, k);
    }
    // demo automática: gesto, reposo, gesto…
    if (ui.auto && !ui.cal && !MB.asm.active && !(E.leap && E.leap.q)) {
      ui.autoT = (ui.autoT || 0) + dt;
      const seq = ['abrir', 'puno', 'pinza', 'senalar', 'tripode', 'pulgar', 'lateral', 'flexMun', 'extMun'];
      const per = 1.7, i = Math.floor(ui.autoT / per);
      const k = i % 2 ? 'reposo' : seq[(i / 2) % seq.length];
      if (E.gesture !== k) setGesture(k);
    }
    tickCalibration(dt);
    MB.leapTick();
    updateLabels();
    if (ui.cardMuscle !== null && ui.cardMuscle !== undefined) { const el = $('#cardAct'); if (el) el.textContent = Math.round(L.muscleAct[ui.cardMuscle] * 100) + ' %'; }
    acc += dt;
    if (acc < 1 / 24) return;
    acc = 0;
    drawScope(); drawBand();
    // decodificador
    const g = MB.GESTURES[L.cls], p = L.probs;
    $('#detName').textContent = E.model ? g.n : 'Sin calibrar';
    $('#detConf').textContent = E.mode === 'lda' ? `confianza ${Math.round(Math.max(...p) * 100)} %` : 'más parecido';
    if (E.mode === 'lda') p.forEach((v, i) => { const b = $('#pb' + i); b.style.width = v * 100 + '%'; b.classList.toggle('top', i === L.cls); $('#pv' + i).textContent = Math.round(v * 100) + '%'; });
    else L.regOut.forEach((v, i) => { const b = $('#rb' + i); const w = Math.max(-1, Math.min(1, v)); if (i === 5) { b.style.left = (50 + Math.min(0, w) * 50) + '%'; b.style.width = Math.abs(w) * 50 + '%'; } else { b.style.left = '0'; b.style.width = Math.max(0, w) * 100 + '%'; } $('#rv' + i).textContent = v.toFixed(2); });
    document.querySelectorAll('#gest button').forEach((b, i) => b.classList.toggle('det', i === L.cls && !!E.model));
    // lecturas
    const err = Math.sqrt(L.robotQ.reduce((s, v, i) => s + (v - L.humanQ[i]) ** 2, 0) / MB.NDOF);
    $('#droG').textContent = E.model ? GSHORT[g.k] : '—';
    $('#droC').textContent = E.mode === 'lda' ? Math.round(Math.max(...p) * 100) + ' %' : 'regresión';
    $('#droL').textContent = L.latency ? Math.round(L.latency) + ' ms' : '—';
    $('#droD').textContent = Math.round(1000 / E.stride) + ' /s';
    $('#droI').textContent = L.current.toFixed(2) + ' A';
    $('#droE').textContent = (err * 57.3).toFixed(1) + '°';
    $('#droV').textContent = Math.round(L.jitter * 100) + ' %' + (L.holding ? ' · quieta' : '');
    // consola: cambios de gesto y tramas del bus
    busAcc += 1 / 24;
    if (L.cls !== lastCls && E.model) { log(`▶ ${g.n}${E.mode === 'lda' ? ` · p=${Math.max(...p).toFixed(2)}` : ''}${L.latency ? ` · ${Math.round(L.latency)} ms` : ''}`, 'hdr'); lastCls = L.cls; }
    if (busAcc > 0.5) { busAcc = 0; log(busFrame(), 'tx'); }
    if (MB.bench.mcuLed) MB.bench.mcuLed.material.emissiveIntensity = 0.3 + 0.7 * (Math.sin(E.t * 20) > 0);
  };

  MB.initUI = function () {
    // qué canal capta más cada músculo y cuál es el músculo principal de cada canal (para las etiquetas)
    const W = [];
    for (let c = 0; c < MB.NCH; c++) {
      const row = new Array(MB.NMUS).fill(0);
      E.sources.forEach((s, j) => { row[s.mi] = Math.max(row[s.mi], E.mixRow(c)[j]); });
      W.push(row);
    }
    const mx = Math.max(...W.flat());
    E.chanMuscle = W.map((r) => r.map((v) => v / mx));
    E.chanTop = W.map((r) => r.indexOf(Math.max(...r)));
    $('#tab-info').innerHTML = MB.INFO_HTML;
    buildControls();
    MB.initLeap();
    wirePicking();
    applyIsolation();
  };
})();
