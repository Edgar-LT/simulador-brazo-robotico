// Configuración de especificaciones mecatrónicas del Manipulador Robótico 6-DOF
export const ROBOT_CONFIG = {
  name: "RoboTwin 6-DOF Industrial Manipulator",
  version: "1.0.0",
  // Dimensiones físicas de los eslabones (en unidades métricas / metros ficticios)
  links: {
    baseHeight: 0.8,
    baseRadius: 0.6,
    link1Height: 0.7,   // Altura columna hombro
    link2Length: 1.8,   // Brazo superior (Upper arm)
    link3Length: 1.5,   // Antebrazo (Forearm)
    link4Length: 0.4,   // Muñeca pitch/roll
    link5Length: 0.35,  // Muñeca yaw/tool mount
    gripperLength: 0.45 // Longitud del efector final con pinza
  },
  // Límites mecánicos angulares (en radianes y grados)
  jointLimits: [
    { id: 'j1', name: 'J1 (Base Yaw)', min: -Math.PI, max: Math.PI, default: 0, maxSpeed: 1.8 },
    { id: 'j2', name: 'J2 (Shoulder Pitch)', min: -Math.PI * 0.45, max: Math.PI * 0.75, default: 0.3, maxSpeed: 1.5 },
    { id: 'j3', name: 'J3 (Elbow Pitch)', min: -Math.PI * 0.85, max: Math.PI * 0.85, default: 0.6, maxSpeed: 1.5 },
    { id: 'j4', name: 'J4 (Wrist Roll)', min: -Math.PI, max: Math.PI, default: 0, maxSpeed: 2.2 },
    { id: 'j5', name: 'J5 (Wrist Pitch)', min: -Math.PI * 0.75, max: Math.PI * 0.75, default: 0.3, maxSpeed: 2.2 },
    { id: 'j6', name: 'J6 (Wrist Yaw/Tool)', min: -Math.PI, max: Math.PI, default: 0, maxSpeed: 3.0 }
  ],
  // Pinza / Gripper
  gripper: {
    maxOpen: 0.25,      // metros (apertura holgada de 25 cm para abrazar limpiamente la caja de 0.15m sin rozar)
    minOpen: 0.0,
    speed: 0.35
  },
  // Paleta estética industrial (Materials & Colors)
  theme: {
    baseColor: 0x1a1e24,       // Gris grafito oscuro
    jointColor: 0x242b35,      // Acero fundido
    bodyColor: 0x00d2ff,       // Cyan eléctrico mecatrónico (resalta detalles de diseño)
    accentColor: 0xff6b00,    // Naranja de seguridad industrial
    metalness: 0.75,
    roughness: 0.28,
    glowColor: 0x00f0ff
  }
};
