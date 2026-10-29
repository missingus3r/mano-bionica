/* Arranque: renderer, escena, luces, cámara orbital, armado de la escena y bucle principal. */
(function () {
  const T = THREE, MB = window.MB, E = MB.EMG, L = E.live;
  const host = document.getElementById('app');

  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: /[?&]snap/.test(location.search) });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.localClippingEnabled = true; // la piel del antebrazo y la de la mano se cortan en la muñeca
  host.appendChild(renderer.domElement);
  MB.renderer = renderer;

  const scene = new T.Scene();
  scene.background = new T.Color(0x0e1116);
  MB.scene = scene;
  const pm = new T.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;

  scene.add(new T.HemisphereLight(0xdfe8f5, 0x2b2420, 0.3));
  const key = new T.DirectionalLight(0xffffff, 1.2);
  key.position.set(380, 820, 620); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -520, right: 520, top: 520, bottom: -420, near: 100, far: 2200 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6;
  scene.add(key);
  const fill = new T.DirectionalLight(0x9fc4ff, 0.45); fill.position.set(-600, 350, 300); scene.add(fill);
  const rim = new T.DirectionalLight(0x3fd0b6, 0.35); rim.position.set(0, 300, -700); scene.add(rim);

  const camera = new T.PerspectiveCamera(36, 1, 1, 6000);
  camera.position.set(340, 620, 1130);
  MB.camera = camera;
  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 170, 40);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 30; controls.maxDistance = 2600;
  controls.zoomSpeed = 1.2;
  MB.controls = controls;

  // el modelo del brazo se decodifica antes de armar la escena (los electrodos se apoyan en su piel)
  MB.loadArm().then(start, (err) => { const t = document.getElementById('toast'); t.textContent = 'No se pudo cargar el modelo del brazo: ' + err; t.classList.add('on'); });
  function start(models) {
  // La persona a la izquierda, la mano robótica a la derecha, la electrónica adelante
  MB.buildRobot(scene, new T.Vector3(175, 0, -10));
  MB.buildTransmissions(MB.robot);
  MB.buildHuman(scene, new T.Vector3(-175, 0, -10), models);
  MB.buildBench(scene);
  MB.step(null);

  // primera calibración, sin mostrarla: así la mano anda apenas se abre la página
  E.calibrate();
  MB.initUI();
  MB.asm.init();
  MB.showCalResult();

  MB.onResize = function () {
    const r = host.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    renderer.domElement.style.width = r.width + 'px';
    renderer.domElement.style.height = r.height + 'px';
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', MB.onResize);
  MB.onResize();
  MB.view('general', true);

  const clock = new T.Clock();
  function frame(fixedDt) {
    const real = Math.min(0.05, clock.getDelta());
    const dt = typeof fixedDt === 'number' ? fixedDt : real;
    E.tick(dt);
    MB.asm.tick(dt);
    const A = MB.asm, rq = A.active && A.robotQ ? A.robotQ : L.robotQ;
    // en el armado, la mano se mueve suave hacia lo que pide cada paso
    if (A.active && A.robotQ) { MB._asmQ = (MB._asmQ || L.robotQ.slice()).map((v, i) => v + (rq[i] - v) * Math.min(1, dt * 8)); MB.robot.setPose(MB._asmQ); }
    else { MB._asmQ = null; MB.robot.setPose(MB.trans.filter(rq, dt)); }
    MB.human.setPose(L.humanQ);
    MB.human.setActivation(L.muscleAct);
    MB.updateLinks();
    MB.trans.update();
    MB.ui.frame(dt);
    controls.update();
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(() => frame());
  // Para pruebas sin requestAnimationFrame (pestaña en segundo plano): avanza n cuadros de dt fijo
  MB.advance = async function (n, dt) { for (let i = 0; i < n; i++) { frame(dt || 1 / 30); await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); }); } };
  MB.ready = true;
  }
})();
