/* Cámara web + MediaPipe Hand Landmarker, corriendo en el propio navegador (sin puente ni Python).
   Entrega la mano en el mismo formato que el puente del Leap, así el resto (pasar a 17 grados de libertad,
   modos «como la persona» y «directo», calibración) es el mismo para las dos fuentes.
   Necesita internet la primera vez: baja MediaPipe de jsDelivr y el modelo de Google. */
(function () {
  const MB = window.MB;
  const VER = '1.1.0';
  const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VER;
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
  const W = (MB.webcam = { on: false, lm: null, stream: null, video: null, canvas: null, fps: 0, n: 0, t0: 0 });

  async function landmarker(vision, fileset) {
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    // la GPU (WebGL) es más rápida; si no está disponible, la CPU
    try { return await vision.HandLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch (e) { return vision.HandLandmarker.createFromOptions(fileset, opts('CPU')); }
  }

  // Las coordenadas «world» de MediaPipe son metros con x a la derecha de la imagen, y hacia abajo y z hacia
  // adentro. Se pasan a milímetros con y hacia arriba y z hacia la cámara (un giro de 180°: sigue siendo un
  // sistema derecho, así los productos vectoriales dan la normal de la palma bien orientada).
  function toHand(world, label) {
    const J = world.map((p) => [p.x * 1000, -p.y * 1000, -p.z * 1000]);
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // Con la imagen sin espejar, tasks-vision 1.1 etiqueta bien: «Right» es la mano derecha (verificado con una
    // mano derecha renderizada vista de frente; la documentación vieja decía que venía invertido)
    const side = label === 'Right' ? 'right' : 'left';
    const a = sub(J[5], J[0]), b = sub(J[17], J[0]);
    const n = nrm(side === 'right' ? cross(a, b) : cross(b, a));
    return {
      side, joints: J, palmN: n, palmD: nrm(sub(J[9], J[0])),
      // la cámara no ve el antebrazo: se lo supone vertical (la muñeca se mide contra la vertical de la imagen)
      elbow: [J[0][0], J[0][1] - 250, J[0][2]],
      conf: 1,
    };
  }

  function draw(res) {
    const c = W.canvas, v = W.video, ctx = c.getContext('2d');
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
    // vista espejada, como un espejo: es más natural para moverse
    ctx.save(); ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    (res.landmarks || []).forEach((lm) => {
      ctx.strokeStyle = '#3fd0b6'; ctx.lineWidth = 3;
      BONES.forEach(([i, j]) => { ctx.beginPath(); ctx.moveTo(lm[i].x * c.width, lm[i].y * c.height); ctx.lineTo(lm[j].x * c.width, lm[j].y * c.height); ctx.stroke(); });
      ctx.fillStyle = '#ffb347';
      lm.forEach((p) => { ctx.beginPath(); ctx.arc(p.x * c.width, p.y * c.height, 4, 0, Math.PI * 2); ctx.fill(); });
    });
    ctx.restore();
  }

  function loop(onHand) {
    if (!W.on) return;
    const v = W.video;
    const next = () => (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(() => loop(onHand)) : requestAnimationFrame(() => loop(onHand)));
    if (v.readyState >= 2) {
      const res = W.lm.detectForVideo(v, performance.now());
      draw(res);
      W.n++;
      const now = performance.now();
      if (now - W.t0 > 1000) { W.fps = (W.n * 1000) / (now - W.t0); W.n = 0; W.t0 = now; }
      if (res.worldLandmarks && res.worldLandmarks.length) {
        const cat = (res.handedness || res.handednesses || [[]])[0][0];
        onHand(toHand(res.worldLandmarks[0], cat ? cat.categoryName : 'Left'), W.fps);
      }
    }
    next();
  }

  // onStatus(texto) informa el avance de la carga; devuelve una promesa que se cumple al arrancar
  W.start = async function (video, canvas, onHand, onStatus) {
    W.video = video; W.canvas = canvas;
    if (!W.lm) {
      onStatus('cargando MediaPipe…');
      const vision = await import(CDN + '/vision_bundle.mjs');
      const fileset = await vision.FilesetResolver.forVisionTasks(CDN + '/wasm');
      onStatus('cargando el modelo…');
      W.lm = await landmarker(vision, fileset);
    }
    onStatus('abriendo la cámara…');
    W.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    video.srcObject = W.stream;
    await video.play();
    W.on = true; W.t0 = performance.now(); W.n = 0;
    loop(onHand);
  };
  W.stop = function () {
    W.on = false;
    if (W.stream) W.stream.getTracks().forEach((t) => t.stop());
    W.stream = null;
    if (W.video) W.video.srcObject = null;
  };
  MB.webcamToHand = toHand;
})();
