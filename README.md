<p align="center">
  <img src="favicon.svg" alt="" width="72" height="72">
</p>

<h1 align="center">Mano biónica DIY</h1>

<p align="center">
  Una mano robótica de 17 grados de libertad, con los servos adentro y bielas a cada falange, controlada con las señales eléctricas de los músculos del antebrazo.<br>
  <a href="https://tinymoonlabs.com/mano-bionica/">Demo en vivo</a> · <a href="https://tinymoonlabs.com/mano.html">Página del proyecto</a> · <a href="https://tinymoonlabs.com">Tiny Moon Labs</a>
</p>

---

> [!NOTE]
> **Es una demo, no un producto ni un dispositivo médico.** Es una simulación 3D interactiva y un posible
> proyecto futuro de [Tiny Moon Labs](https://tinymoonlabs.com). No hay mano construida y nada está a la venta.
> La construcción se inspira en la Hiwonder uHand y en manos diestras comerciales (AgiBot OmniHand, Sharpa Wave, DexRobot);
> no tenemos relación con ninguna de esas empresas.

## Qué es

Una mano de acrílico negro cortado con láser, con los motores adentro como las manos diestras comerciales:
16 micro servos Feetech SCS0009 en la palma, en las falanges y en el pulgar, y bielas rígidas hasta cada falange.
Una persona con 8 pares de electrodos en el antebrazo la controla: el microcontrolador lee la actividad
eléctrica de sus músculos (EMG), reconoce qué quiere hacer y mueve la mano.

| | |
|---|---|
| Grados de libertad | 17: pulgar 4, cada dedo 3 (abducción, MCP, PIP con la DIP acoplada), muñeca 1 |
| Transmisión | diferencial de 2 servos en la base de cada dedo (como la AmazingHand de Pollen), biela de la PIP, biela en S cruzada para la DIP |
| Motores | 9 servos en la palma, 4 dentro de las falanges proximales, 3 en el pulgar y un SCS15 de doble eje directo en la muñeca |
| Estructura | acrílico negro de 3 mm, separadores hexagonales de latón, tornillos M3 como ejes con rodamientos MR63ZZ |
| Lectura | 8 canales bipolares: placa ADS1299 o 8 módulos Muscle BioAmp Candy |
| Control | ESP32-S3: filtros, características de Hudgins, LDA o regresión, una decisión cada 25 ms |
| Costo aproximado | ≈ US$ 1.280 con servos de bus y ADS1299 · ≈ US$ 790 con MG90S y sensores sueltos |

## Qué incluye la demo

- **La mano, la persona y la electrónica en 3D**: palma en sándwich con ventanas por donde asoman los servos,
  falanges de placas con separadores, bielas que se reacomodan en cada cuadro, soporte en L y antebrazo. La
  persona es un brazo real con esqueleto (cada falange sigue la misma postura) y, debajo de la piel translúcida,
  los músculos y huesos reales del antebrazo (17 músculos de BodyParts3D, ajustados corte por corte a la piel),
  que se iluminan al activarse; los 17 electrodos se apoyan sobre la piel, medida con rayos. Podés orbitar, marcar cada pieza, aislarla, ver etiquetas y abrirla en despiece.
- **La señal de verdad**: EMG sintética a 1 kHz en 8 canales, con mezcla entre músculos (crosstalk), zumbido de
  50 Hz, ruido de movimiento, fatiga y un electrodo que se puede despegar. Osciloscopio con la señal cruda,
  filtrada o su envolvente, y un corte del antebrazo con la amplitud de cada canal.
- **El decodificador**: pasabanda 20–450 Hz, notch de 50 Hz, ventanas de 150 ms, características MAV, WL, ZC y
  SSC, y dos modos: 10 gestos con LDA y control proporcional, o regresión continua por dedo. Recalibración
  con matriz de confusión, latencia medida y la consola con las tramas del bus de servos.
- **Partes y precios**: lista completa con links y precios en pesos y dólares (relevamiento de octubre de
  2026). Elegís servos de bus o PWM y lectura con ADS1299 o con sensores sueltos, y tildás lo que ya tenés.
- **Armado y calibración**: 13 pasos de armado (corte láser, soporte, antebrazo, muñeca, palma, servos, dedos,
  yemas, bielas, electrónica y electrodos) y 7 de calibración que mueven la mano: servos, ajuste de bielas,
  rangos, electrodos, ruido de red, entrenamiento y prueba final.

## Cómo usarla

No hay que instalar ni compilar nada. Abrí `index.html` con doble clic. Funciona mejor en una computadora.

- Teclas **1** a **0**: los 10 gestos de la persona. «Demo automática» los encadena.
- Arrastrar: orbitar · rueda: zoom · clic derecho: desplazar.
- Clic en una pieza o un músculo: ficha · doble clic: enfocar · **I**: aislar · **F**: enfocar · **Esc**: salir.

## Controlar con tu mano (Leap Motion o cámara web)

**Con la cámara web** no hace falta instalar nada: elegí «Cámara web» y «Encender cámara». MediaPipe Hand
Landmarker corre en el navegador (la primera vez baja ~10 MB de jsDelivr y de Google) y la imagen no sale de tu
computadora. Es menos preciso que el Leap (una sola cámara tiene que adivinar la profundidad de los dedos doblados)
y no ve el antebrazo, así que la muñeca se mide contra la vertical.

**Con un Leap Motion** (Ultraleap) enchufado:

1. Instalá el servicio de seguimiento de Ultraleap (Gemini) y, en Python, `numpy` y `opencv-python`.
2. Corré el puente: `python leap/leap_bridge.py` (o doble clic en `leap/iniciar_puente.bat`). Lee el sensor con
   LeapC y sirve en `http://127.0.0.1:8798` la mano (`/stream`) y la cámara infrarroja con el esqueleto (`/cam.mjpg`).
3. En la demo, «Conectar Leap». Con la mano abierta y relajada sobre el sensor, «Calibrar mano abierta».

Hay dos modos:
- **Como la persona:** tu postura pasa por el modelo de músculos, genera el EMG y el decodificador la reconoce.
  Es como si los electrodos estuvieran en tu brazo.
- **Directo:** tu postura va derecho a los servos (con la antivibración).

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Página, estilos y pestañas (Operación, Partes y precios, Armado, Cómo funciona). |
| `js/geo.js` | Materiales por pieza, falanges, cápsulas, cajas redondeadas y el antebrazo con sección elíptica. |
| `js/hand.js` | Cinemática de la mano: 17 grados de libertad, dedos y pulgar. |
| `js/robot.js` | La mano robótica: placas de acrílico, servos, bielas, antebrazo y muñeca. |
| `js/arm.js` | Brazo de la persona (modelo real), músculos, electrodos y la electrónica sobre la mesa. |
| `js/emg.js` | Gestos, modelo muscular, generador de EMG, filtros, características, LDA, regresión y servos. |
| `js/ui.js` | Selección, aislamiento, etiquetas, lista de partes, osciloscopio, brazalete y consola. |
| `js/assembly.js` | Los 20 pasos de armado y calibración. |
| `js/bom.js` | Lista de materiales con precios, links y fuentes. |
| `js/info.js` | Textos de «Cómo funciona». |
| `js/leap.js` | Tu mano: fuentes (Leap o cámara web), paso de las 21 articulaciones a los 17 grados de libertad y calibración. |
| `js/webcam.js` | Cámara web con MediaPipe Hand Landmarker en el navegador. |
| `leap/leap_bridge.py` | Puente LeapC → HTTP local (mano por SSE y cámara infrarroja por MJPEG). |
| `js/main.js` | Escena, luces, cámara y bucle de dibujo. |
| `models/` | La piel del brazo (`brazo`) y la anatomía del antebrazo (`antebrazo`): el `.glb` y la misma copia en base64 (`.js`), para que ande abriendo el HTML con doble clic. |
| `vendor/` | [Three.js](https://threejs.org) r147 con OrbitControls, RoomEnvironment y GLTFLoader (MIT), sin cambios. |

## Sobre los precios

Son un relevamiento del 25 de octubre de 2026 en Uruguay, con dólar BROU a $ 41,25. Los servos Feetech no
se venden en Uruguay y ningún taller de Montevideo publica tarifa de corte láser: esos ítems están estimados. MercadoLibre pide
iniciar sesión para ver las publicaciones, así que esos precios salen de los resúmenes del buscador:
confirmalos antes de comprar. electronica.uy y Macrotec se leyeron en vivo. Los importados no incluyen
flete ni impuestos. Los ítems marcados con ≈ son estimados.

## Sobre la simulación

El acierto del clasificador sale muy alto porque la persona simulada repite cada gesto siempre igual. Con
gente real se reportan alrededor de 85–95 % para unos 10 gestos en laboratorio, y baja cuando el brazo cambia
de posición o de un día para otro. Los músculos que separan los dedos están dentro de la mano y el brazalete
no los ve: la abducción la decide el gesto reconocido.

## Fuentes

- Manos de referencia: [Hiwonder uHand UNO](https://www.hiwonder.com/products/uhand-uno), [AmazingHand](https://github.com/pollen-robotics/AmazingHand), [AgiBot OmniHand O10](https://www.agibot.com/products/OmniHand_O10), [Xynova Prima 1](https://www.xynova.com.cn/en/xynova-prima-1), [DexRobot](https://www.dex-robot.com/en), [Sharpa Wave](https://www.sharpa.com/pages/w02).
- Christoph y otros, [ORCA: An Open-Source, Reliable, Cost-Effective, Anthropomorphic Robotic Hand](https://arxiv.org/html/2504.04259v2) (2025) · [orca_core](https://github.com/orcahand/orca_core).
- Otras manos abiertas: [DexHand](https://github.com/TheRobotStudio/V1.0-Dexhand), [RUKA](https://github.com/ruka-hand/RUKA), [LEAP Hand](https://v1.leaphand.com/), [Amazing Hand](https://github.com/pollen-robotics/AmazingHand).
- [LibEMG](https://github.com/LibEMG/libemg) · datasets [Ninapro](https://paperswithcode.com/dataset/ninapro-db5) y [emg2pose](https://arxiv.org/pdf/2412.02725).
- Hudgins, Parker y Scott, *A new strategy for multifunction myoelectric control* (1993) · Farrell y Weir, *The optimal controller delay for myoelectric prostheses* (2007).

## Seguridad

Mientras haya electrodos puestos, la parte de EMG tiene que estar a batería y aislada de todo lo que va a la
red eléctrica. Por eso el ESP32 se alimenta con una batería USB y habla con los servos a través de un
aislador digital. La parada de emergencia corta la fuente de los servos.

## Licencia

[MIT](LICENSE), salvo los modelos de `models/`:

- `brazo.glb` / `brazo.js`: brazo derecho de [Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html)
  de Quaternius, CC0 1.0, recortado desde el codo y con la textura reducida.
- `antebrazo.glb` / `antebrazo.js`: músculos y huesos del antebrazo derecho de
  [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html), © The Database Center for Life Science,
  licensed under CC Attribution 4.0 International. Modificado: subconjunto, decimado y reorientado.

Three.js, en `vendor/`, tiene su propia licencia MIT.
