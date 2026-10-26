/* Armado paso a paso (las piezas entran en el orden en que se colocan) y calibración con la máquina andando. */
(function () {
  const T = THREE, MB = window.MB, E = MB.EMG, L = E.live;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const A = (MB.asm = { active: false, cur: 0, robotQ: null, playing: false, speed: 1, ghost: false });
  const REST = MB.GESTURES[0].q;
  const isBus = () => MB.ui.opt.act === 'bus';
  const st = (s) => (e) => e.step === s;
  const stk = (s, keys) => (e) => e.step === s && keys.includes(e.obj.userData.key);
  const key = (k) => (e) => e.obj.userData.key === k;

  const STEPS = [
    { title: 'Cortar y preparar las piezas', phase: 'Armado', tools: ['Servicio de corte láser', 'Impresora 3D (TPU)', 'Lija al agua 400'], parts: ['acrilico', 'bielas', 'filamentoTPU'],
      text: 'Se mandan a cortar con láser unas 50 piezas de acrílico negro de 3 mm: las dos placas de la palma (la dorsal con 9 ventanas para los servos), 2 placas por falange, los laterales del antebrazo y el soporte. Las bielas en S se cortan en acero inoxidable de 1,2 mm. Las yemas y las almohadillas se imprimen en TPU.',
      extra: '<div class="cut">Acrílico 3 mm: pedir agujeros de 3,0 mm para los ejes (el láser los deja justos) y 3,2 mm para tornillos pasantes<br>Acero inox 1,2 mm: agujeros de 2 mm en los extremos de cada biela<br>TPU 95A: 20 mm/s · relleno 15 %</div>' },
    { title: 'Soporte', match: st('base'), tools: ['Destornillador'], parts: ['soporte'], text: 'Pegar las patas de TPU a la placa base y atornillar la escuadra donde va el antebrazo.' },
    { title: 'Antebrazo', match: st('antebrazo'), tools: ['Destornillador', 'Llave de 5,5 mm'], parts: ['antebrazo', 'separadores'],
      text: 'Unir los dos laterales con 5 separadores hexagonales M3. Arriba forman la horquilla de la muñeca.' },
    { title: 'Muñeca', match: stk('muneca', ['servoMuneca', 'pernos', 'rodamiento', 'antebrazo']), tools: ['Destornillador'], parts: ['servoMuneca', 'rodamiento', 'pernos'],
      text: 'El SCS15 tiene doble eje: se atornilla entre los laterales con un eje sobre el de la muñeca. De un lado la horquilla en U de la mano va al brazo del servo; del otro, a su segundo eje, que gira en un rodamiento. Accionamiento directo, sin varillas. Tiene que girar ±50° sin trabarse.' },
    { title: 'Palma: placas y separadores', match: stk('mano', ['palma', 'separadores']), tools: ['Destornillador', 'Llave de 5,5 mm'], parts: ['palma', 'separadores'],
      text: 'Armar la palma como un sándwich: placa palmar, 7 separadores de 29 mm y placa dorsal. El bloque de la CMC del pulgar va atornillado al costado.' },
    { title: 'Servos: número y centro', match: key('servo'), tools: ['ESP32 o adaptador por USB', 'Destornillador'], parts: ['servo', 'busDriver', 'pca9685'],
      text: () => (isBus() ? 'Antes de montarlos, conectar cada servo solo al bus y darle su número (ID 1 a 16) con el programa de Feetech o con el sketch del ESP32, y llevarlo al centro (posición 512 en los SCS). Después atornillar 9 en la palma (2 por dedo y la abducción del pulgar; cada uno asoma por su ventana), 4 dentro de las falanges proximales, 1 en el módulo giratorio del pulgar y 2 en el pulgar.' : 'Llevar todos los MG90S a 1.500 µs antes de montarlos: así los brazos arrancan alineados. Anotar en qué canal de qué PCA9685 va cada uno. Van 9 en la palma, 4 dentro de las falanges proximales y 3 en el pulgar.') },
    { title: 'Dedos', match: stk('mano', ['falanges', 'pernos']), tools: ['Destornillador', 'Llave de 5,5 mm'], parts: ['falanges', 'pernos', 'separadores'],
      text: 'Cada falange son dos placas con un separador al medio. Las articulaciones son tornillos M3 que hacen de eje, con tuerca autofrenante: apretar hasta que no haya juego pero el dedo caiga solo por su peso.' },
    { title: 'Yemas y almohadillas', match: key('yemas'), tools: ['Cianoacrilato flexible'], parts: ['yemas'], text: 'Pegar las 5 yemas de TPU y las 2 almohadillas del lado de la palma: dan agarre y amortiguan los golpes.' },
    { title: 'Bielas y varilla', match: (e) => e.step === 'bielas' || e.obj.userData.key === 'varilla', tools: ['Destornillador', 'Pinza'], parts: ['bielas', 'varilla', 'horns'],
      text: 'Con todos los servos en el centro y la mano abierta, colocar las bielas. Cada dedo tiene un diferencial: dos bielas, una de cada servo de la palma, a los dos lados de una palanca en la base del dedo; si los servos giran juntos el dedo se cierra y si giran opuestos se separa. La biela en S va cruzada (lado palmar en la proximal, dorsal en la distal): así la DIP se cierra con la PIP. La abducción del pulgar va con la varilla.' },
    { title: 'Electrónica', match: st('electronica'), tools: ['Soldador', 'Estaño'], parts: ['esp32', 'emgFront', 'emgCandy', 'aislador', 'busDriver', 'pca9685'],
      text: () => `Montar el ESP32-S3 al lado de la ${MB.ui.opt.emg === 'ads' ? 'placa ADS1299 (SPI: SCLK, MOSI, MISO, CS y DRDY)' : 'fila de 8 BioAmp Candy (cada salida a un pin ADC1 del ESP32: GPIO 1 a 8)'}. El aislador digital va entre el ESP32 y ${isBus() ? 'el adaptador de bus (TX/RX a 1 Mbps)' : 'las PCA9685 (SDA/SCL)'}: separa la parte de los electrodos de la de los motores.` },
    { title: 'Energía y parada', match: st('energia'), tools: ['Pelacables', 'Destornillador'], parts: ['fuente', 'powerbank', 'parada'],
      text: () => `La fuente de ${isBus() ? '12 V' : '5 V'} alimenta solo los servos, a través de la parada de emergencia. El ESP32 y la lectura de EMG van con la batería USB: nunca comparten tierra con la fuente que va a la red.` },
    { title: 'Cableado', match: st('cables'), tools: ['Precintos'], parts: ['cablesBus', 'cablesCtrl', 'cablesEmg'],
      text: () => (isBus() ? 'Encadenar los 17 servos con su cable de 3 hilos y llevar el bus hasta el adaptador. ' : 'Llevar un prolongador de cada servo a su canal de las PCA9685. ') + 'Precintar los cables de los electrodos juntos hasta el conector: si se mueven sueltos, meten ruido.' },
    { title: 'Electrodos', match: st('electrodos'), tools: ['Alcohol isopropílico', 'Algodón'], parts: ['electrodo', 'cablesEmg', 'alcohol', 'apoyo'],
      text: 'Limpiar la piel con alcohol. Pegar los 16 electrodos en 8 pares alrededor del tercio superior del antebrazo (el canal 1 sobre la palma, a 2 cm entre sí, en la dirección del músculo) y la referencia sobre el hueso del codo. Apoyar el codo en la almohadilla.' },
    // ---- calibración ----
    { cal: 'servos', title: 'Comprobar los servos', phase: 'Calibración', dur: 6, tools: ['Computadora'], text: () => (isBus() ? 'El ESP32 hace PING a los 17 IDs, lee tensión y temperatura, y mueve cada servo un poco para confirmar que está en su lugar.' : 'El ESP32 mueve cada canal de las PCA9685 un poco, en orden, para confirmar que cada servo está donde corresponde.') },
    { cal: 'tension', title: 'Ajustar las bielas', phase: 'Calibración', dur: 8, tools: ['Destornillador'], text: () => 'Cada dedo se cierra y se abre despacio. Si una biela traba o el dedo no llega a cerrar, correr el brazo del servo un diente y repetir.' + (isBus() ? ' Con servos de bus se ve en la carga: una biela trabada marca carga alta aunque el dedo no apriete nada.' : '') },
    { cal: 'range', title: 'Rango de cada articulación', phase: 'Calibración', dur: 10, tools: ['Computadora'], text: 'Se recorre cada uno de los 17 GDL de un tope al otro y se guardan los límites en el ESP32. Nunca mandar un servo más allá del tope: corta el tendón.' },
    { cal: 'electrodes', title: 'Revisar los electrodos', phase: 'Calibración', dur: 7, tools: ['Osciloscopio de la demo'], text: 'Con la mano relajada, cada canal tiene que quedar plano (menos de ~15 µV). Al cerrar el puño, todos tienen que subir. Un canal que no cambia o que zumba está despegado.' },
    { cal: 'hum', title: 'Ruido de la red', phase: 'Calibración', dur: 6, tools: [], text: 'Se mira la señal cruda con el filtro de 50 Hz apagado y después prendido. Si el zumbido es muy grande, alejar el brazo de cargadores y zapatillas y revisar la referencia.' },
    { cal: 'train', title: 'Entrenar el decodificador', phase: 'Calibración', dur: 15, tools: [], text: 'La persona hace los 10 gestos, uno por vez, cuando aparecen. Con esas ventanas se entrena el LDA y la regresión, y se mide el acierto con datos nuevos.' },
    { cal: 'final', title: 'Prueba final', phase: 'Calibración', dur: 14, tools: [], text: 'La persona encadena gestos y la mano los copia. Mirá la latencia y la matriz de confusión en la pestaña Operación.' },
  ];
  A.STEPS = STEPS;

  // ---------- Qué pieza va en qué paso ----------
  let entries = [];
  function collect() {
    entries = MB.asmList.map((e) => {
      const i = STEPS.findIndex((s) => s.match && s.match(e));
      const o = e.obj;
      if (!o.userData.p0) o.userData.p0 = o.position.clone();
      return Object.assign({}, e, { si: i < 0 ? -1 : i });
    });
  }
  const ghostMat = new T.MeshStandardMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.1, depthWrite: false });
  function setGhost(o, on) {
    o.traverse((m) => {
      if (!m.isMesh) return;
      if (on && !m.userData.origMat) { m.userData.origMat = m.material; m.material = ghostMat; }
      if (!on && m.userData.origMat) { m.material = m.userData.origMat; m.userData.origMat = null; }
    });
  }
  function isLine(o) { return o.isLine || (o.isMesh && o.geometry.type === 'TubeGeometry'); }
  function drawFrac(o, f) {
    const g = o.geometry;
    if (o.isLine) g.setDrawRange(0, Math.max(2, Math.ceil(g.attributes.position.count * f)));
    else g.setDrawRange(0, Math.floor((g.index.count / 6) * f) * 6);
  }
  function applyVisibility(animStep) {
    const anims = [];
    entries.forEach((e) => {
      const o = e.obj, show = (e.si < 0 || e.si <= A.cur) && MB.bench.cfgOk(o);
      const ghost = !show && A.ghost && !isLine(o) && MB.bench.cfgOk(o);
      o.visible = show || ghost;
      setGhost(o, ghost);
      if (isLine(o)) { o.userData.asmOk = show; if (show) drawFrac(o, 1); }
      o.userData.asmAnim = false;
      if (o.userData.p0) o.position.copy(o.userData.p0);
      if (show && e.si === animStep) anims.push(e);
    });
    // animación de entrada del paso actual
    const n = anims.length, stag = Math.min(0.14, 2.4 / Math.max(1, n));
    A.anim = { t: 0, list: anims.map((e, i) => ({ e, d: i * stag })), dur: (n - 1) * stag + 0.9 };
    anims.forEach((a) => { a.obj.userData.asmAnim = true; });
    MB.applyIsolation();
  }
  const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
  function tickAnim(dt) {
    const an = A.anim; if (!an || an.t > an.dur + 0.2) return 1;
    an.t += dt * A.speed;
    an.list.forEach(({ e, d }) => {
      const o = e.obj, k = ease((an.t - d) / 0.9);
      if (isLine(o)) { drawFrac(o, Math.max(0.001, k)); return; }
      const off = o.userData.explode ? o.userData.explode.clone().multiplyScalar(1.6) : new T.Vector3(0, 40, 0);
      o.position.copy(o.userData.p0).addScaledVector(off, 1 - k);
      o.visible = an.t >= d;
      if (e.sub === 'screw') o.rotation.y = (1 - k) * 12;
      if (k >= 1) o.userData.asmAnim = false;
    });
    return Math.min(1, an.t / an.dur);
  }

  // ---------- Calibración ----------
  const qOf = (fn) => REST.map((v, i) => fn(i, v));
  let calLogged = {};
  function calTick(s, t, dt) {
    const once = (k, fn) => { if (!calLogged[k]) { calLogged[k] = 1; fn(); } };
    if (s.cal === 'servos') {
      const per = s.dur / MB.NDOF, i = Math.min(MB.NDOF - 1, Math.floor(t / per)), ph = (t - i * per) / per;
      A.robotQ = qOf((j, v) => (j === i ? v + 0.25 * Math.sin(ph * Math.PI * 2) : v));
      once('s' + i, () => MB.log(isBus() ? `PING ID ${i + 1} (${MB.DOF[i].n}) → OK · ${(11.9 + Math.random() * 0.2).toFixed(1)} V · ${Math.round(29 + Math.random() * 4)} °C` : `PCA9685 0x${i < 16 ? '40' : '41'} canal ${i % 16} → ${MB.DOF[i].n} OK`, 'ok'));
    } else if (s.cal === 'tension') {
      const per = s.dur / 5, f = Math.min(4, Math.floor(t / per)), ph = (t - f * per) / per, a = Math.sin(ph * Math.PI);
      A.robotQ = qOf((j, v) => {
        if (f === 0 && j < 4) return v + (MB.GESTURES[2].q[j] - v) * a;
        if (f > 0 && j >= 4 + (f - 1) * 3 && j < 7 + (f - 1) * 3 && (j - 4) % 3) return v + (1.4 - v) * a;
        return v;
      });
      once('t' + f, () => MB.log(`${['Pulgar', 'Índice', 'Medio', 'Anular', 'Meñique'][f]}: cerrar y abrir${isBus() ? ` · carga máx ${Math.round(12 + Math.random() * 8)} % · sin trabas` : ''}`, 'tx'));
    } else if (s.cal === 'range') {
      const per = s.dur / MB.NDOF, i = Math.min(MB.NDOF - 1, Math.floor(t / per)), ph = (t - i * per) / per, D = MB.DOF[i];
      const v = ph < 0.5 ? REST[i] + (D.hi - REST[i]) * Math.sin(ph * Math.PI) : REST[i] + (D.lo - REST[i]) * Math.sin((ph - 0.5) * Math.PI * 2) * 0.9;
      A.robotQ = qOf((j, w) => (j === i ? v : w));
      once('r' + i, () => MB.log(`${D.n}: ${Math.round(D.lo * 57.3)}° a ${Math.round(D.hi * 57.3)}° guardado`, 'tx'));
    } else if (s.cal === 'electrodes') {
      A.robotQ = REST;
      MB.setGesture(t < 3 ? 'reposo' : t < 5.5 ? 'puno' : 'reposo');
      if (t > 2.6) once('rest', () => { A.restMav = Array.from(L.mav); });
      if (t > 5.2) once('fist', () => {
        const rs = A.restMav || Array.from(L.mav);
        for (let c = 0; c < MB.NCH; c++) {
          const r = rs[c] * 1000, f = L.mav[c] * 1000, bad = c === E.noise.detached || r > 60;
          MB.log(`C${c + 1}: reposo ${r.toFixed(0)} µV · puño ${f.toFixed(0)} µV ${bad ? '✗ revisar' : '✓'}`, bad ? 'err' : 'ok');
        }
      });
    } else if (s.cal === 'hum') {
      A.robotQ = REST;
      const off = t < 3;
      E.filt.notch = !off; document.querySelector('#fNotch').checked = !off;
      const sv = document.querySelector('input[name=scopeV][value=' + (off ? 'raw' : 'flt') + ']'); if (sv && !sv.checked) { sv.checked = true; MB.ui.scopeView = sv.value; }
      once('h1', () => MB.log(`Notch apagado: zumbido de 50 Hz ≈ ${(E.noise.hum * 350).toFixed(0)} µV`, 'err'));
      if (!off) once('h2', () => MB.log(`Notch prendido: queda < ${Math.max(2, E.noise.hum * 8).toFixed(0)} µV`, 'ok'));
    } else if (s.cal === 'train') {
      A.robotQ = null;
      once('go', () => MB.calibrateVisible(() => { A.trainDone = true; }));
      if (A.trainDone) return true;
      return false;
    } else if (s.cal === 'final') {
      A.robotQ = null;
      const seq = ['abrir', 'puno', 'pinza', 'senalar', 'pulgar', 'flexMun', 'reposo'];
      MB.setGesture(seq[Math.min(seq.length - 1, Math.floor(t / (s.dur / seq.length)))]);
    }
    return t >= s.dur;
  }

  // ---------- Pasos ----------
  function partsHtml(s) {
    const its = (s.parts || []).map((k) => MB.BOM.items.find((it) => it.key === k && (!it.cfg || it.cfg === MB.ui.opt.act || it.cfg === MB.ui.opt.emg))).filter(Boolean);
    if (!its.length) return '';
    return `<label class="lab" style="margin-top:8px">Partes</label><ul>${its.map((it) => `<li><b>${it.qty}×</b>${esc(it.short || it.name)}</li>`).join('')}</ul>`;
  }
  function render() {
    const s = STEPS[A.cur], txt = typeof s.text === 'function' ? s.text() : s.text;
    $('#asmCount').textContent = `Paso ${A.cur + 1} de ${STEPS.length}`;
    $('#asmPhase').textContent = s.phase || (s.cal ? 'Calibración' : 'Armado');
    $('#asmBar').style.width = ((A.cur + 1) / STEPS.length) * 100 + '%';
    $('#asmTitle').textContent = s.title;
    $('#asmText').textContent = txt;
    $('#asmExtra').innerHTML = s.extra || '';
    $('#asmTools').innerHTML = (s.tools || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('') || '<span class="chip">—</span>';
    $('#asmParts').innerHTML = partsHtml(s);
    document.querySelectorAll('#asmList li').forEach((li, i) => { li.classList.toggle('cur', i === A.cur); li.classList.toggle('done', i < A.cur); });
    const cur = document.querySelector('#asmList li.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function go(i, anim) {
    A.cur = Math.max(0, Math.min(STEPS.length - 1, i));
    A.calT = 0; calLogged = {}; A.trainDone = false;
    const s = STEPS[A.cur];
    A.robotQ = s.cal === 'train' || s.cal === 'final' ? null : REST;
    if (s.cal !== 'final' && s.cal !== 'train') MB.setGesture('reposo');
    // el paso del ruido de red apaga el notch y muestra la señal cruda: al salir, se deja como estaba
    if (s.cal !== 'hum') {
      E.filt.notch = document.querySelector('#fNotch').checked = true;
      const sv = document.querySelector('input[name=scopeV][value=flt]'); sv.checked = true; MB.ui.scopeView = 'flt';
    }
    applyVisibility(anim === false ? -2 : A.cur);
    render();
    if (s.cal) MB.log(`— ${s.title} —`, 'hdr');
    // vista que conviene para cada paso
    const v = s.cal ? (['electrodes', 'hum', 'train', 'final'].includes(s.cal) ? 'general' : 'mano') : A.cur <= 3 ? 'general' : A.cur <= 8 ? 'servos' : A.cur === 12 ? 'brazo' : 'electronica';
    if (anim !== false) MB.view(v);
  }
  A.go = go;
  A.enter = function () {
    if (A.active) return;
    A.active = true;
    document.body.classList.add('asm');
    MB.ui.auto = false; document.querySelector('#auto').checked = false;
    MB.ui.explode = 0; document.querySelector('#explode').value = 0;
    Object.values(MB.tagged).forEach((list) => list.forEach((o) => { if (o.userData.p0) o.position.copy(o.userData.p0); }));
    collect();
    $('#asmList').innerHTML = STEPS.map((s, i) => `<li data-i="${i}" class="${s.cal ? 'cal' : ''}"><span>${i + 1}</span>${esc(s.title)}</li>`).join('');
    document.querySelectorAll('#asmList li').forEach((li) => { li.onclick = () => { A.playing = false; setPlay(); go(+li.dataset.i); }; });
    go(A.cur);
  };
  A.exit = function () {
    if (!A.active) return;
    A.active = false; A.playing = false; setPlay();
    MB.cancelCalibration();
    document.body.classList.remove('asm');
    entries.forEach((e) => { const o = e.obj; setGhost(o, false); o.visible = true; o.userData.asmOk = true; o.userData.asmAnim = false; if (isLine(o)) drawFrac(o, 1); if (o.userData.p0) o.position.copy(o.userData.p0); o.rotation.y = e.sub === 'screw' ? 0 : o.rotation.y; });
    MB.bench.applyCfg(MB.ui.opt.emg, MB.ui.opt.act);
    A.robotQ = null;
    E.filt.notch = document.querySelector('#fNotch').checked = true;
    MB.applyIsolation();
  };
  function setPlay() { const b = $('#asmPlay'); if (b) b.textContent = A.playing ? '⏸ Pausar' : '▶ Reproducir todo'; }
  A.tick = function (dt) {
    if (!A.active) return;
    const f = tickAnim(dt);
    const s = STEPS[A.cur];
    let done = f >= 1;
    if (s.cal) { A.calT += dt * (s.cal === 'train' ? 1 : A.speed); done = calTick(s, A.calT, dt); $('#asmStepBar').style.width = Math.min(100, (A.calT / s.dur) * 100) + '%'; }
    else $('#asmStepBar').style.width = f * 100 + '%';
    if (A.playing && done) {
      A.wait = (A.wait || 0) + dt * A.speed;
      if (A.wait > (s.cal ? 0.6 : 1.4)) { A.wait = 0; if (A.cur < STEPS.length - 1) go(A.cur + 1); else { A.playing = false; setPlay(); } }
    }
  };
  A.init = function () {
    $('#asmFirst').onclick = () => { A.playing = false; setPlay(); go(0); };
    $('#asmPrev').onclick = () => { A.playing = false; setPlay(); go(A.cur - 1); };
    $('#asmNext').onclick = () => { A.playing = false; setPlay(); go(A.cur + 1); };
    $('#asmPlay').onclick = () => { A.playing = !A.playing; setPlay(); if (A.playing && A.cur === STEPS.length - 1) go(0); };
    $('#asmReplay').onclick = () => go(A.cur);
    $('#asmSpeed').onchange = (e) => { A.speed = +e.target.value; };
    $('#asmGhost').onchange = (e) => { A.ghost = e.target.checked; applyVisibility(-2); };
  };
})();
