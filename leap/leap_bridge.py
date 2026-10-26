"""
leap_bridge.py - Puente entre el Leap Motion (Ultraleap, LeapC) y la demo en el navegador.

El navegador no puede hablar con LeapC, así que este programa lo lee y lo sirve por HTTP local:

    http://127.0.0.1:8798/status     estado (JSON)
    http://127.0.0.1:8798/stream     la mano, ~60 veces por segundo (Server-Sent Events)
    http://127.0.0.1:8798/cam.mjpg   la cámara infrarroja del Leap, con el esqueleto dibujado (MJPEG)

Usa un binding propio de LeapC.dll con ctypes (sin compilar nada) y pide las imágenes con la política
eLeapPolicyFlag_Images. Necesita numpy y opencv-python.

    python leap_bridge.py            # o:  python leap_bridge.py --port 8798
"""
from __future__ import annotations

import argparse
import ctypes as C
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

# --------------------------------------------------------------------------- #
#  LeapC.dll (estructuras con #pragma pack(1), como en LeapC.h del SDK 5.x)
# --------------------------------------------------------------------------- #
SDK_LIB = os.environ.get("LEAPSDK_LIB", r"C:\Program Files\Ultraleap\LeapSDK\lib\x64")
if hasattr(os, "add_dll_directory"):
    os.add_dll_directory(SDK_LIB)
_lib = C.CDLL(os.path.join(SDK_LIB, "LeapC.dll"))
f32 = C.c_float


class VEC(C.Structure):
    _pack_ = 1
    _fields_ = [("x", f32), ("y", f32), ("z", f32)]

    def l(self):
        return [round(self.x, 1), round(self.y, 1), round(self.z, 1)]


class QUAT(C.Structure):
    _pack_ = 1
    _fields_ = [("x", f32), ("y", f32), ("z", f32), ("w", f32)]


class BONE(C.Structure):
    _pack_ = 1
    _fields_ = [("prev_joint", VEC), ("next_joint", VEC), ("width", f32), ("rotation", QUAT)]


class DIGIT(C.Structure):
    _pack_ = 1
    _fields_ = [("finger_id", C.c_int32), ("bones", BONE * 4), ("is_extended", C.c_uint32)]


class PALM(C.Structure):
    _pack_ = 1
    _fields_ = [("position", VEC), ("stabilized_position", VEC), ("velocity", VEC), ("normal", VEC),
                ("width", f32), ("direction", VEC), ("orientation", QUAT)]


class HAND(C.Structure):
    _pack_ = 1
    _fields_ = [("id", C.c_uint32), ("flags", C.c_uint32), ("type", C.c_uint32), ("confidence", f32),
                ("visible_time", C.c_uint64), ("pinch_distance", f32), ("grab_angle", f32),
                ("pinch_strength", f32), ("grab_strength", f32), ("palm", PALM),
                ("digits", DIGIT * 5), ("arm", BONE)]


class HEADER(C.Structure):
    _pack_ = 1
    _fields_ = [("reserved", C.c_void_p), ("frame_id", C.c_int64), ("timestamp", C.c_int64)]


class TRACKING_EVENT(C.Structure):
    _pack_ = 1
    _fields_ = [("info", HEADER), ("tracking_frame_id", C.c_int64), ("nHands", C.c_uint32),
                ("pHands", C.POINTER(HAND)), ("framerate", f32)]


class IMAGE_PROPERTIES(C.Structure):
    _pack_ = 1
    _fields_ = [("type", C.c_uint32), ("format", C.c_uint32), ("bpp", C.c_uint32), ("width", C.c_uint32),
                ("height", C.c_uint32), ("x_scale", f32), ("y_scale", f32), ("x_offset", f32), ("y_offset", f32)]


class IMAGE(C.Structure):
    _pack_ = 1
    _fields_ = [("properties", IMAGE_PROPERTIES), ("matrix_version", C.c_uint64),
                ("distortion_matrix", C.c_void_p), ("data", C.c_void_p), ("offset", C.c_uint32)]


class IMAGE_EVENT(C.Structure):
    _pack_ = 1
    _fields_ = [("info", HEADER), ("image", IMAGE * 2), ("calib", C.c_void_p)]


class MESSAGE(C.Structure):
    _pack_ = 1
    _fields_ = [("size", C.c_uint32), ("type", C.c_uint32), ("pointer", C.c_void_p), ("device_id", C.c_uint32)]


for st, n in ((VEC, 12), (BONE, 44), (DIGIT, 184), (PALM, 80), (HAND, 1084), (TRACKING_EVENT, 48),
              (IMAGE_PROPERTIES, 36), (IMAGE, 64), (IMAGE_EVENT, 160), (MESSAGE, 20)):
    assert C.sizeof(st) == n, f"{st.__name__}: {C.sizeof(st)} != {n}"

EV_CONNECTION, EV_CONNECTION_LOST, EV_DEVICE = 1, 2, 3
EV_TRACKING, EV_DEVICE_LOST, EV_IMAGE = 0x100, 0x104, 0x109
POLICY_IMAGES = 0x2

_lib.LeapCreateConnection.argtypes = [C.c_void_p, C.POINTER(C.c_void_p)]
_lib.LeapOpenConnection.argtypes = [C.c_void_p]
_lib.LeapPollConnection.argtypes = [C.c_void_p, C.c_uint, C.POINTER(MESSAGE)]
_lib.LeapSetPolicyFlags.argtypes = [C.c_void_p, C.c_uint64, C.c_uint64]
_lib.LeapRectilinearToPixel.argtypes = [C.c_void_p, C.c_uint32, VEC]
_lib.LeapRectilinearToPixel.restype = VEC
for fn in ("LeapCreateConnection", "LeapOpenConnection", "LeapPollConnection", "LeapSetPolicyFlags"):
    getattr(_lib, fn).restype = C.c_uint32


def hand_json(h: HAND) -> dict:
    """21 articulaciones en el orden de MediaPipe (mm, ejes del Leap: x derecha, y arriba, z hacia la persona)."""
    j = [h.arm.next_joint.l()]
    th = h.digits[0].bones
    j += [th[1].prev_joint.l(), th[1].next_joint.l(), th[2].next_joint.l(), th[3].next_joint.l()]
    for d in range(1, 5):
        b = h.digits[d].bones
        j += [b[1].prev_joint.l(), b[1].next_joint.l(), b[2].next_joint.l(), b[3].next_joint.l()]
    return {
        "side": "right" if h.type == 1 else "left",
        "conf": round(h.confidence, 2),
        "joints": j,
        "elbow": h.arm.prev_joint.l(),
        "palmN": [round(v, 3) for v in (h.palm.normal.x, h.palm.normal.y, h.palm.normal.z)],
        "palmD": [round(v, 3) for v in (h.palm.direction.x, h.palm.direction.y, h.palm.direction.z)],
        "pinch": round(h.pinch_strength, 2),
        "grab": round(h.grab_strength, 2),
    }


class Leap(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.conn = C.c_void_p()
        self.lock = threading.Lock()
        self.connected = self.device = False
        self.frame = {"id": 0, "fps": 0, "hands": []}
        self.img = None          # imagen izquierda (uint8, alto × ancho)
        self.img_id = 0
        self.err = None
        self.proj = None         # convención de proyección elegida (ver project())

    def run(self):
        if _lib.LeapCreateConnection(None, C.byref(self.conn)) or _lib.LeapOpenConnection(self.conn):
            self.err = "No se pudo abrir la conexión con el servicio de Ultraleap"
            return
        msg = MESSAGE()
        while True:
            if _lib.LeapPollConnection(self.conn, 100, C.byref(msg)):
                continue
            t = msg.type
            if t == EV_TRACKING:
                ev = C.cast(msg.pointer, C.POINTER(TRACKING_EVENT)).contents
                hands = [hand_json(ev.pHands[i]) for i in range(ev.nHands)]
                with self.lock:
                    self.frame = {"id": int(ev.info.frame_id), "fps": round(ev.framerate, 1), "hands": hands}
            elif t == EV_IMAGE:
                ev = C.cast(msg.pointer, C.POINTER(IMAGE_EVENT)).contents
                im = ev.image[0]
                p = im.properties
                n = p.width * p.height * p.bpp
                # el buffer solo vale durante este evento: se copia ya
                buf = (C.c_uint8 * n).from_address(im.data + im.offset)
                arr = np.frombuffer(buf, dtype=np.uint8).reshape(p.height, p.width, p.bpp)[:, :, 0].copy()
                with self.lock:
                    self.img, self.img_id = arr, self.img_id + 1
            elif t == EV_CONNECTION:
                self.connected = True
                _lib.LeapSetPolicyFlags(self.conn, POLICY_IMAGES, 0)
            elif t == EV_CONNECTION_LOST:
                self.connected = False
            elif t == EV_DEVICE:
                self.device = True
                _lib.LeapSetPolicyFlags(self.conn, POLICY_IMAGES, 0)
            elif t == EV_DEVICE_LOST:
                self.device = False

    # ---- proyección de la mano sobre la imagen ----
    # LeapRectilinearToPixel corrige la distorsión, pero pide la dirección del rayo en los ejes de la cámara,
    # que no son los del Leap. Se prueban las 16 convenciones posibles (signos, desplazamiento de la cámara
    # izquierda a ±20 mm y si los ejes van cruzados) y se queda con la que pone las articulaciones sobre
    # píxeles más brillantes: en infrarrojo la mano se ve clara sobre fondo oscuro.
    # Además de los signos se buscan la altura de la cámara respecto del origen (y0) y una escala del rayo (k):
    # con solo «brillo en las articulaciones» ganaba un esqueleto encogido adentro de la mano, así que el puntaje
    # también pide que un poco más allá de cada punta (fuera del dedo) esté oscuro.
    SIGNS = [(sx, so, sz, sw) for sx in (1, -1) for so in (1, -1) for sz in (1, -1) for sw in (0, 1)]

    def _px(self, p, c):
        sx, so, sz, sw, y0, k = c
        x, y, z = p
        y = y - y0
        if y < 10:
            return None
        a, b = k * sx * (x + so * 20.0) / y, k * sz * z / y
        if sw:
            a, b = b, a
        v = _lib.LeapRectilinearToPixel(self.conn, 1, VEC(a, b, 1.0))
        if not np.isfinite(v.x) or not np.isfinite(v.y):
            return None
        return v.x, v.y

    def _score(self, joints, img, c):
        h, w = img.shape
        val = lambda q: float(img[int(q[1]), int(q[0])]) if q and 0 <= q[0] < w and 0 <= q[1] < h else None
        inside = [val(self._px(j, c)) for j in joints]
        # puntos fuera de la mano: más allá de cada punta, en la dirección del último hueso
        out = []
        for tip in (4, 8, 12, 16, 20):
            t, d = np.array(joints[tip]), np.array(joints[tip - 1])
            out.append(val(self._px(list(t + (t - d) * 0.9), c)))
        inside = [v for v in inside if v is not None]
        out = [v for v in out if v is not None]
        if len(inside) < 17 or len(out) < 4:
            return -1e9
        return np.mean(inside) - np.mean(out)

    def project(self, joints, img):
        now = time.time()
        if self.proj is None or now - getattr(self, "_proj_t", 0) > 5:
            self._proj_t = now
            grid = [s + (y0, k) for s in self.SIGNS for y0 in (-20, 0, 20, 40, 60, 80) for k in (0.8, 1.0, 1.25, 1.5, 1.8, 2.2)]
            if self.proj is not None:
                # después de la primera búsqueda solo se afina alrededor de la elegida
                s, y0, k = self.proj[:4], self.proj[4], self.proj[5]
                grid = [s + (y0 + dy, k * dk) for dy in (-10, 0, 10) for dk in (0.92, 1.0, 1.08)]
            best = max(grid, key=lambda c: self._score(joints, img, c))
            if self._score(joints, img, best) > 25:
                self.proj = best
        if self.proj is None:
            return None
        return [self._px(j, self.proj) for j in joints]

    def jpeg(self):
        with self.lock:
            img, fr = self.img, self.frame
        if img is None:
            return None
        out = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        bones = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8), (5, 9), (9, 10), (10, 11),
                 (11, 12), (9, 13), (13, 14), (14, 15), (15, 16), (13, 17), (17, 18), (18, 19), (19, 20), (0, 17)]
        for hd in fr["hands"]:
            pts = self.project(hd["joints"], img)
            if not pts:
                continue
            for a, b in bones:
                if pts[a] and pts[b]:
                    cv2.line(out, (int(pts[a][0]), int(pts[a][1])), (int(pts[b][0]), int(pts[b][1])), (182, 208, 63), 2, cv2.LINE_AA)
            for q in pts:
                if q:
                    cv2.circle(out, (int(q[0]), int(q[1])), 3, (71, 179, 255), -1, cv2.LINE_AA)
        ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 75])
        return enc.tobytes() if ok else None


LEAP = Leap()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        # Chrome pide permiso antes de que una página pública (la demo publicada, por https) hable con 127.0.0.1
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _head(self, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-cache")
        self._cors()
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        try:
            if self.path.startswith("/status"):
                with LEAP.lock:
                    fr, im = LEAP.frame, LEAP.img
                self._head("application/json")
                self.wfile.write(json.dumps({
                    "connected": LEAP.connected, "device": LEAP.device, "error": LEAP.err,
                    "fps": fr["fps"], "hands": len(fr["hands"]),
                    "image": None if im is None else [int(im.shape[1]), int(im.shape[0])],
                    "projection": LEAP.proj,
                }).encode())
            elif self.path.startswith("/stream"):
                self._head("text/event-stream")
                last = -1
                while True:
                    with LEAP.lock:
                        fr = LEAP.frame
                    if fr["id"] != last:
                        last = fr["id"]
                        data = {"t": time.time(), "fps": fr["fps"], "device": LEAP.device, "hands": fr["hands"]}
                        self.wfile.write(b"data: " + json.dumps(data).encode() + b"\n\n")
                        self.wfile.flush()
                    time.sleep(1 / 60)
            elif self.path.startswith("/cam.mjpg"):
                self.send_response(200)
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-cache")
                self._cors()
                self.end_headers()
                last = -1
                while True:
                    if LEAP.img_id != last:
                        last = LEAP.img_id
                        jpg = LEAP.jpeg()
                        if jpg:
                            self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(jpg)).encode() + b"\r\n\r\n" + jpg + b"\r\n")
                            self.wfile.flush()
                    time.sleep(1 / 30)
            elif self.path.startswith("/cam.jpg"):
                jpg = LEAP.jpeg()
                if not jpg:
                    self.send_error(503, "Todavía no llegó ninguna imagen del Leap")
                    return
                self._head("image/jpeg")
                self.wfile.write(jpg)
            else:
                self.send_error(404)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # la página se cerró o recargó


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8798)
    args = ap.parse_args()
    LEAP.start()
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    srv.daemon_threads = True
    print(f"Puente del Leap en http://127.0.0.1:{args.port}  (Ctrl+C para cortar)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
