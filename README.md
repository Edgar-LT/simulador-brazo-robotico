# 🤖 RoboTwin 3D: Gemelo Digital de Brazo Robótico 6-DOF

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Three.js](https://img.shields.io/badge/Three.js-r160-black.svg?style=flat&logo=three.js)
![WebGL](https://img.shields.io/badge/WebGL-2.0-orange.svg)
![Mecatrónica](https://img.shields.io/badge/Área-Mecatrónica%20%26%20Robótica-00d2ff.svg)

**RoboTwin 3D** es una aplicación web de alto impacto visual y rigor técnico que implementa el **Gemelo Digital (Digital Twin)** de un manipulador robótico industrial articulado de 6 grados de libertad (6-DOF) con pinza neumática/eléctrica.

---

## 🚀 Características Principales

### 🦾 Cinemática y Robótica Aplicada (Nivel Profesional)
- **Cinemática Directa (Forward Kinematics - FK)**: Cálculo matricial y geométrico en tiempo real con modelado estandarizado según la convención **Denavit-Hartenberg (D-H)**. Incluye modal interactivo con la tabla formal de parámetros $(d_i, a_i, \alpha_i, \theta_i)$.
- **Cinemática Inversa (Inverse Kinematics - IK CCD) Zero-GC**: Algoritmo cíclico desacoplado optimizado con pool estático de vectores y array articular pre-asignado (`this.jointOrder`), libre de fugas de memoria y caídas de frames por recolección de basura. Resuelve la posición espacial $(X, Y, Z)$ del TCP junto a la flexión de muñeca (Pitch), manteniendo desacopladas las torsiones axiales (Roll de J4 y J6) para manipulación fluida sin bloqueos gimnásticos.
- **Protección Física contra Suelo y Obstáculos ($Y \ge 0.15\text{ m}$)**: El manipulador y el Gizmo 3D restringen activamente la cota vertical para evitar colisiones mecánicas con la bancada.
- **Detección Dinámica de Singularidades y Límites Articulares**: Monitoreo continuo a 60 Hz que alerta visualmente en el HUD y cambia el color de los ribetes LED del robot (Cian $\rightarrow$ Naranja $\rightarrow$ Rojo) cuando se aproxima a extremos angulares o singularidades de extensión.
- **Trazador 3D de Trayectorias (Trajectory Trail)**: Visualización en tiempo real de las curvas de interpolación espacial del Tool Center Point para análisis de suavidad cinemática.
- **Sistema de Seguridad Industrial y Parada de Emergencia (E-STOP)**: Bloqueo de actuadores instantáneo con indicación estroboscópica y protocolo de rearme.
- **Espacio de Trabajo (Workspace Visualizer)**: Indicador esférico volumétrico para verificar el alcance mecánico admisible.

### 📊 Telemetría y Supervisión SCADA / HUD
- **Monitor de Ecuaciones Cinemáticas en Vivo**: Muestra la sustitución trigonométrica en tiempo real de $r(\theta_2, \theta_3)$, coordenadas $X, Y, Z$ resultantes y torque estático $\tau_2$ a medida que se mueve cualquier articulación.
- **Osciloscopio Virtual en Tiempo Real**: Gráfica de telemetría a 60 Hz para monitorizar la respuesta transitoria y ángulos articulares.
- **Modo Inmersivo (Limpieza de Pantalla)**: Permite ocultar/mostrar instantáneamente los paneles laterales con animaciones fluidas para enfocar la vista en el gemelo 3D.
- **Cámaras Rápidas de Celda**: Presets de cámara isométrica, planta (Top View), lateral (Side View) y cámara montada en el efector final (Tool Cam).
- **Exportador a Lenguajes Robóticos Industriales**:
  - **G-Code estándar** (`G01`, `M03`, `M05`, `G04`).
  - **ABB RAPID** (`MoveAbsJ`, `Set do_Gripper`).
  - **JSON de waypoints** para intercambio y carga rápida.
- **Conexión Serial con Hardware Real (Web Serial API)**: Conexión plug-and-play vía USB a 115200 baudios con microcontroladores **Arduino** o **ESP32** para controlar servomotores físicos en paralelo. Incluye estrangulamiento adaptativo a 30 Hz para prevenir desbordamiento de búfer UART, transmisión delta y suma de comprobación XOR de 8 bits en cada trama (`<deg1,...,deg6,grip*CHECKSUM>\n`).

### 🎨 Gráficos 3D de Alta Fidelidad
- Renderizado PBR (Physically Based Rendering) con materiales metálicos y acabados pulidos estilo KUKA / Fanuc.
- Sistema de iluminación con luz direccional cenital, sombras suaves PCF y luces de acento estilo ciber-industrial.
- Controles orbitales intuitivos (OrbitControls) con restricciones de piso y suavizado.

---

## 🛠️ Stack Tecnológico
- **Frontend / Gráficos**: Three.js (ES Modules), HTML5 Canvas, WebGL 2.0.
- **Estilos**: CSS3 Moderno (Glassmorphism, CSS Grid, Variables semánticas).
- **Matemáticas**: Algoritmos puros de vectores y cuaterniones en JavaScript nativo.
- **Despliegue**: Compatible con cualquier servidor estático (GitHub Pages, Vercel, Netlify).

---

## 💻 Cómo Ejecutar Localmente

No se requiere instalar Node.js ni paquetes pesados. Solo clona y ejecuta con el servidor integrado de Python:

```bash
# 1. Navegar a la carpeta del proyecto
cd simulador-brazo-robotico

# 2. Iniciar servidor local rápido con Python
python -m http.server 8080
```

Luego abre tu navegador en:
👉 `http://localhost:8080`

---

## 🌐 Despliegue en GitHub Pages (en 1 minuto)
1. Sube este repositorio a tu cuenta de GitHub.
2. Ve a **Settings** > **Pages** en tu repositorio.
3. En la sección **Branch**, selecciona `main` (o `master`) y la carpeta `/root` (o `/simulador-brazo-robotico`).
4. Haz clic en **Save** y obtendrás una URL pública e interactiva para compartir en tu currículum o portafolio.

---

## 📐 Modelo Cinemático

El manipulador consta de las siguientes articulaciones:
- **J1 (Base)**: Rotación Yaw sobre el eje $Y$ ($[-180^\circ, 180^\circ]$).
- **J2 (Hombro)**: Pitch sobre el eje horizontal ($[-80^\circ, 115^\circ]$).
- **J3 (Codo)**: Pitch sobre el eje horizontal ($[-135^\circ, 135^\circ]$).
- **J4 (Muñeca Roll)**: Torsión longitudinal ($[-180^\circ, 180^\circ]$).
- **J5 (Muñeca Pitch)**: Flexión vertical ($[-105^\circ, 105^\circ]$).
- **J6 (Herramienta Roll)**: Brida rotatoria del efector ($[-180^\circ, 180^\circ]$).

---

*Desarrollado como proyecto de demostración y portfolio de ingeniería mecatrónica y desarrollo de software 3D.*
