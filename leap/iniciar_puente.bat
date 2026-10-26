@echo off
rem Puente del Leap Motion para la demo: sirve la mano y la camara en http://127.0.0.1:8798
cd /d "%~dp0"
set PY=python
if exist "%USERPROFILE%\Desktop\leap-mediapipe-fusion\.venv\Scripts\python.exe" set PY="%USERPROFILE%\Desktop\leap-mediapipe-fusion\.venv\Scripts\python.exe"
%PY% leap_bridge.py %*
pause
