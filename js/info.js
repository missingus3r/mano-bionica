/* Textos de la pestaña "Cómo funciona" y del rol de cada músculo. */
window.MB = window.MB || {};
MB.MUSCLE_ROLE = {
  FCR: 'Flexiona la muñeca hacia el lado del pulgar. Se activa sobre todo en la flexión de muñeca.',
  FDS: 'Flexiona la articulación del medio (PIP) de los 4 dedos. Tiene un compartimento por dedo: por eso se puede distinguir el índice del meñique.',
  FCU: 'Flexiona la muñeca hacia el lado del meñique.',
  FDP: 'Flexiona la punta de los dedos (DIP). Es profundo: llega a la piel mezclado con el FDS.',
  FPL: 'Flexiona el pulgar. Es profundo, en el lado radial: su señal de superficie se separa mal.',
  ECR: 'Extiende la muñeca. También se activa al apretar un puño, para estabilizar la muñeca (co-contracción).',
  ED: 'Extiende los 4 dedos: abre la mano.',
  ECU: 'Extiende la muñeca hacia el lado del meñique y la estabiliza al agarrar.',
  APL: 'Separa y extiende el pulgar (pulgar arriba, mano abierta).',
  EIP: 'Extiende solo el índice: la clave del gesto de señalar.',
  PL: 'Tensa la fascia de la palma y ayuda a flexionar la muñeca. Falta en ~15 % de las personas.',
  PT: 'Gira el antebrazo (pronación). No mueve los dedos, pero está bajo el brazalete: al apretar suma ruido cruzado.',
  BR: 'Flexiona el codo. Se activa un poco al agarrar con fuerza y, como está bajo el brazalete, ensucia los canales del lado radial.',
};
MB.INFO_HTML = `
<h3>Qué es</h3>
<p>Una mano robótica casera lo más parecida posible a una mano humana: <b>17 grados de libertad</b>, con los motores <b>adentro de la mano</b> y bielas rígidas que mueven cada falange, como las manos diestras comerciales (AgiBot OmniHand, Sharpa Wave, DexHand). Se controla leyendo la actividad eléctrica de los músculos del antebrazo de una persona (<b>electromiografía de superficie, EMG</b>) con 8 pares de electrodos.</p>
<p>La construcción copia a los kits de acrílico cortado con láser como la Hiwonder uHand: placas negras de 3 mm, separadores hexagonales de latón, tornillos como ejes y bielas de acero en S. Las proporciones y la cinemática siguen a la <a href="https://github.com/orcahand/orca_core" target="_blank" rel="noopener">ORCA Hand</a> (ETH Zürich, 2025).</p>

<h3>La mano</h3>
<table>
  <tr><td>Pulgar (4)</td><td>abducción y oposición en la CMC, flexión de la MCP y de la IP</td></tr>
  <tr><td>Cada dedo (3)</td><td>abducción y flexión de la MCP, flexión de la PIP; la DIP sigue a la PIP con una biela en S (~0,7 de su ángulo, como el tendón del flexor profundo)</td></tr>
  <tr><td>Muñeca (1)</td><td>flexión y extensión, ±50°</td></tr>
  <tr><td>Motores</td><td>16 micro servos Feetech SCS0009 adentro de la mano: 9 en la palma (2 por dedo y la abducción del pulgar), 4 dentro de las falanges proximales y 3 en el pulgar; y un SCS15 de doble eje montado directo en la muñeca</td></tr>
</table>
<ul>
  <li><b>Bielas:</b> cada servo tiene un brazo (horn) y una biela hasta una palanca de su falange. Es una transmisión rígida: empuja y tira, no se estira ni hay que tensar nada, y el ángulo del servo dice el del dedo.</li>
  <li><b>Diferencial en la base de cada dedo</b> (como la AmazingHand de Pollen): dos servos de la palma tiran de los dos lados de la misma palanca. Juntos cierran el dedo con la fuerza de los dos; opuestos lo separan.</li>
  <li><b>Biela en S cruzada:</b> va del lado palmar de la falange proximal al lado dorsal de la distal. Así la DIP se dobla ~0,75 de lo que dobla la PIP; si las dos puntas fueran dorsales, la DIP se abriría al cerrar.</li>
  <li>La palma es un sándwich de dos placas con separadores. La placa dorsal tiene una ventana por servo, por donde asoma con su brazo.</li>
  <li>Las yemas y las almohadillas son de TPU (flexible) para agarrar sin resbalar.</li>
</ul>

<h3>Cuatro formas de mover un dedo</h3>
<p>La mano viene con bielas, pero el selector <b>«Transmisión de los dedos»</b> de la pestaña Operación la cambia en vivo por otra de las cuatro formas que compara la lámina de Huiwei Technology (HWR-1, un estudio de concepto). La lista de partes, los precios y las notas del armado cambian con ella.</p>
<ul>
  <li><b>Bielas</b> (la de esta mano): servos adentro de la mano y barras rígidas a cada falange. Simple y precisa; el costo es que los servos ocupan la palma y la mano pesa.</li>
  <li><b>Tendones:</b> los servos se van al antebrazo y tiran de cables que pasan por poleas en cada articulación, como los tendones de una mano real (así es, por ejemplo, la Shadow Hand). La mano queda liviana y cede al agarrar, pero los cables se estiran: hay que tensarlos con resortes y cada tanto ajustarlos. En la demo el dedo llega unos 60 ms tarde y rebota un poco al frenar.</li>
  <li><b>Engranajes:</b> un micromotor por articulación con un tren de reducción hasta un engranaje fijo a la falange. Da mucha fuerza, pero suma peso, ruido y <b>juego</b> entre dientes: en la demo, al invertir el sentido el dedo se queda quieto 1,7° antes de seguir.</li>
  <li><b>Tornillo de rodillos:</b> un motor gira un husillo y la tuerca, que avanza en línea recta, empuja la falange con una biela corta. Es la que más fuerza y precisión da y la usan manos humanoides de gama alta, pero es lenta (en la demo, hasta 230°/s) y casi no se puede mover a mano. Un tornillo de rodillos planetario de verdad no se consigue de este tamaño por menos de cientos de dólares; la versión casera usa un husillo común con motor N20.</li>
</ul>
<p>Con engranajes y con tornillo de rodillos el pulgar sigue con bielas y la punta de cada dedo sigue acoplada con la biela en S. La comparación de la ficha (1 a 5) es cualitativa, no medida.</p>

<h3>De dónde sale la señal</h3>
<p>Cuando el cerebro manda contraer un músculo, cada unidad motora dispara un pequeño potencial eléctrico. Desde la piel se ve la suma de cientos de ellos: un ruido de <b>20 a 450 Hz</b> cuya amplitud (décimas de milivoltio a ~1 mV) crece con la fuerza. La EMG aparece <b>30 a 100 ms antes</b> de que el dedo se mueva: eso le da ventaja al control.</p>
<ul>
  <li>Los que mueven los dedos son músculos <b>extrínsecos</b>, con el cuerpo en el antebrazo: flexores del lado de la palma (FDS, FDP, FPL) y extensores del lado del dorso (ED, EIP, APL).</li>
  <li>Los que separan los dedos (interóseos) están <b>dentro de la mano</b>: el brazalete no los ve. Por eso la abducción la decide el gesto reconocido, no un canal.</li>
  <li>Los músculos profundos (FDP, FPL) llegan débiles y mezclados con los superficiales. Esa mezcla (<i>crosstalk</i>) es lo que hace que algunos gestos se confundan.</li>
</ul>

<h3>Electrodos</h3>
<p>Ocho canales <b>bipolares</b> (dos electrodos de gel Ag/AgCl a 2 cm, en la dirección de las fibras), repartidos alrededor del tercio superior del antebrazo, donde los músculos son más gruesos. Un electrodo de <b>referencia</b> va sobre el hueso del codo, donde casi no hay músculo. Cada canal mide la diferencia entre sus dos electrodos: así se cancela casi todo lo que llega igual a los dos, como el zumbido de la red.</p>
<p>Antes de pegarlos: afeitar si hace falta y limpiar con alcohol. Una piel bien preparada baja la impedancia y el ruido.</p>

<h3>Procesamiento (en el ESP32-S3)</h3>
<table>
  <tr><td>Muestreo</td><td>1.000 por segundo por canal</td></tr>
  <tr><td>Pasabanda</td><td>20–450 Hz (Butterworth): saca el movimiento de cables y piel (&lt;20 Hz) y el ruido de alta frecuencia</td></tr>
  <tr><td>Notch</td><td>50 Hz: la red eléctrica de Uruguay</td></tr>
  <tr><td>Ventanas</td><td>150 ms con paso de 25 ms: una decisión cada 25 ms</td></tr>
  <tr><td>Características</td><td>las de Hudgins por canal: valor absoluto medio (MAV), largo de onda (WL), cruces por cero (ZC) y cambios de pendiente (SSC) → 32 números por ventana</td></tr>
  <tr><td>Clasificador</td><td>LDA (análisis discriminante lineal), con voto entre las 4 últimas decisiones y rechazo si la confianza baja de 55 %</td></tr>
</table>

<h3>Dos formas de decodificar</h3>
<ul>
  <li><b>Gestos (LDA) + proporcional:</b> reconoce uno de 10 gestos y usa la amplitud total para decidir cuánto cerrar. Es lo más robusto y lo que usan las prótesis comerciales con reconocimiento de patrones.</li>
  <li><b>Regresión (ridge):</b> estima en continuo cuánto se flexiona cada dedo y la muñeca. Permite combinaciones que no se entrenaron, pero con 8 canales es menos precisa: probá «Mover cada dedo por separado» y compará.</li>
</ul>
<p>Con 8 canales no se pueden controlar 17 GDL de forma independiente. Lo realista es decodificar unas pocas «sinergias» (agarres + intensidad) y expandirlas a los 17 servos. Para más dedos sueltos hacen falta 12–16 canales, como en Ninapro DB2 o emg2pose.</p>

<h3>Calibración</h3>
<p>Cada persona y cada vez que se pegan los electrodos dan señales distintas. La calibración pide hacer cada gesto unos segundos, guarda las ventanas y entrena el LDA y la regresión en milisegundos. Después se prueba con datos nuevos: la <b>matriz de confusión</b> muestra qué gestos se mezclan. Probá recalibrar con un electrodo despegado o con mucho ruido de red.</p>
<p>En la simulación el acierto sale muy alto porque la persona repite cada gesto siempre igual. Con gente real se reportan alrededor de 85–95 % para unos 10 gestos en laboratorio, y baja cuando el brazo cambia de posición, con la transpiración o de un día para otro: por eso se recalibra seguido.</p>

<h3>Latencia</h3>
<p>Media ventana (75 ms) + paso (hasta 25 ms) + voto (~40 ms) + bus y servo. El óptimo citado para prótesis es <b>100–125 ms</b> (Farrell y Weir, 2007); por encima de ~300 ms la mano se siente lenta. El indicador «Latencia» mide desde que la persona cambia de gesto hasta que el decodificador lo reconoce.</p>

<h3>Antivibración</h3>
<p>Aunque la persona esté quieta, la señal de EMG es ruido por naturaleza: cada 25 ms el decodificador da un comando un poco distinto y los servos lo persiguen. Se nota como temblor y zumbido, y gasta los engranajes. Antes de mandar cada posición se aplican cuatro pasos:</p>
<ol>
  <li><b>Amplitud suavizada:</b> la cantidad que decide cuánto cerrar se promedia ~150 ms.</li>
  <li><b>Filtro «One Euro»</b> por articulación: suaviza mucho cuando el comando casi no cambia y poco cuando cambia rápido, así un cambio de gesto no se demora tanto.</li>
  <li><b>Zona muerta con histéresis:</b> no se manda una posición nueva si difiere menos de unos grados de la última enviada.</li>
  <li><b>Retener postura:</b> si hace 300 ms que el comando está quieto, la mano se congela hasta que la diferencia supere 3 veces la zona muerta.</li>
</ol>
<p>Medido en la simulación con el puño sostenido: los servos pasan de moverse el ~65 % del tiempo a menos del 6 %, a cambio de ~80 ms más al cambiar de gesto (más con regresión). En los servos de bus además se puede subir el registro de «zona muerta» del propio servo para que no corrija errores de 1 o 2 pasos.</p>

<h3>Control por dedo</h3>
<p>Cada dedo, el pulgar y la muñeca pueden pasar a manual con sus propios controles: ese grupo deja de seguir al EMG y el resto sigue andando. Sirve para probar la mecánica, calibrar una articulación o combinar: por ejemplo, que la persona cierre el puño y el índice robótico quede estirado.</p>

<h3>Con tu mano (Leap Motion o cámara web)</h3>
<p>El Leap Motion ve la mano con dos cámaras infrarrojas y entrega 21 articulaciones en milímetros. Un puente en Python (<code>leap/leap_bridge.py</code>) las lee con LeapC y las pasa a la página junto con la imagen de la cámara. Cada cuadro, los ángulos se miden en los ejes de tu propia palma y se convierten a los 17 grados de libertad; el pulgar usa una regresión ajustada sobre el modelo de la mano. En modo <b>«como la persona»</b> tu postura reemplaza a la del brazo simulado y pasa por todo el camino: músculos, EMG, decodificador y servos. En modo <b>directo</b> va derecho a los servos.</p>
<p>Con la <b>cámara web</b>, MediaPipe Hand Landmarker corre en el propio navegador y estima las mismas 21 articulaciones en 3D a partir de una sola imagen. No hace falta el puente, pero es menos preciso: con una sola cámara tiene que adivinar la profundidad, y los dedos doblados hacia la cámara son lo que peor estima. Tampoco ve el antebrazo, así que la muñeca se mide contra la vertical de la imagen.</p>

<h3>Servos de bus vs PWM</h3>
<table>
  <tr><td></td><td><b>Bus (Feetech SCS)</b></td><td><b>PWM (MG90S)</b></td></tr>
  <tr><td>Micro servos</td><td>16 × SCS0009, 2,3 kg·cm</td><td>16 × MG90S, 2,8 kg·cm</td></tr>
  <tr><td>Muñeca</td><td>SCS15, 15 kg·cm</td><td>MG996R</td></tr>
  <tr><td>Realimentación</td><td>posición, carga y temperatura</td><td>ninguna</td></tr>
  <tr><td>Cables</td><td>uno encadenado para los 17</td><td>17 al controlador</td></tr>
  <tr><td>Control</td><td>adaptador de bus por UART, 1 Mbps</td><td>2 × PCA9685 por I²C</td></tr>
</table>
<p>Con la realimentación de carga del bus se puede limitar la fuerza al agarrar algo frágil y detectar una biela trabada.</p>

<h3>Seguridad</h3>
<div class="warn">No es un dispositivo médico. Mientras haya electrodos puestos, la parte de EMG tiene que estar <b>a batería y aislada</b> de todo lo que se enchufa a la red: por eso el ESP32 se alimenta con una batería USB y habla con los servos a través de un aislador digital. No conectes la computadora al ESP32 con el cargador enchufado mientras tenés los electrodos puestos. La parada de emergencia corta la fuente de los servos. Los dedos pueden apretar fuerte y las bielas pellizcan: probá primero sin nada en la mano y sin los dedos entre las placas.</div>

<h3>Fuentes</h3>
<ul>
  <li>Inspiración de las manos con motores adentro: <a href="https://www.agibot.com/products/OmniHand_O10" target="_blank" rel="noopener">AgiBot OmniHand O10</a>, <a href="https://www.xynova.com.cn/en/xynova-prima-1" target="_blank" rel="noopener">Xynova Prima 1</a>, <a href="https://www.dex-robot.com/en" target="_blank" rel="noopener">DexRobot</a>, <a href="https://www.sharpa.com/pages/w02" target="_blank" rel="noopener">Sharpa Wave</a>.</li>
  <li>Christoph y otros, <a href="https://arxiv.org/html/2504.04259v2" target="_blank" rel="noopener">ORCA: An Open-Source, Reliable, Cost-Effective, Anthropomorphic Robotic Hand</a> (2025) · <a href="https://github.com/orcahand/orca_core" target="_blank" rel="noopener">orca_core</a>.</li>
  <li>Otras manos abiertas: <a href="https://github.com/TheRobotStudio/V1.0-Dexhand" target="_blank" rel="noopener">DexHand</a>, <a href="https://github.com/ruka-hand/RUKA" target="_blank" rel="noopener">RUKA</a>, <a href="https://v1.leaphand.com/" target="_blank" rel="noopener">LEAP Hand</a>, <a href="https://github.com/pollen-robotics/AmazingHand" target="_blank" rel="noopener">Amazing Hand</a>.</li>
  <li>Modelos 3D: brazo de <a href="https://quaternius.com/packs/universalbasecharacters.html" target="_blank" rel="noopener">Quaternius</a> (CC0) · músculos y huesos de <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noopener">BodyParts3D</a>, © The Database Center for Life Science, CC BY 4.0 (modificado).</li>
  <li><a href="https://github.com/LibEMG/libemg" target="_blank" rel="noopener">LibEMG</a> (características, LDA, regresión) · datasets <a href="https://paperswithcode.com/dataset/ninapro-db5" target="_blank" rel="noopener">Ninapro</a> y <a href="https://arxiv.org/pdf/2412.02725" target="_blank" rel="noopener">emg2pose</a>.</li>
  <li>Hudgins, Parker y Scott, <i>A new strategy for multifunction myoelectric control</i> (1993) · Farrell y Weir, <i>The optimal controller delay for myoelectric prostheses</i> (2007).</li>
  <li>Sensores: <a href="https://www.tindie.com/products/upsidedownlabs/muscle-bioamp-candy-emg-sensor/" target="_blank" rel="noopener">Muscle BioAmp Candy</a>, MyoWare 2.0, <a href="https://github.com/starcat-io/hackeeg-shield" target="_blank" rel="noopener">HackEEG (ADS1299)</a> · <a href="https://www.waveshare.com/bus-servo-adapter-a.htm" target="_blank" rel="noopener">Waveshare Bus Servo Adapter</a>.</li>
</ul>

<h3>Controles</h3>
<ul>
  <li>Teclas <b>1</b> a <b>0</b>: los 10 gestos. Arrastrar: orbitar · rueda: zoom · clic derecho: desplazar.</li>
  <li>Clic en una pieza o un músculo: ficha · doble clic: enfocar · <b>I</b>: aislar · <b>F</b>: enfocar · <b>Esc</b>: salir.</li>
</ul>`;
