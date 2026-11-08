import { IndustrialProgramExporter } from '../js/robot/IndustrialProgramExporter.js';
import { ROBOT_CONFIG } from '../js/config.js';

console.log('🧪 Iniciando Suite de Validación de Rutinas y Exportadores Industriales...');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASÓ: ${message}`);
  }
}

// 1. Validar rutina con ángulos dentro de límites
const validWaypoints = [
  { name: "Paso 1", angles: [0, 0.2, 0.5, 0, 0.3, 0], gripper: true },
  { name: "Paso 2", angles: [1.2, 0.4, 0.8, -0.5, 0.5, 1.0], gripper: false }
];

const res1 = IndustrialProgramExporter.validateRoutine(validWaypoints);
assert(res1.isValid === true, 'Rutina válida pasa la validación');
assert(res1.errors.length === 0, 'Cero errores reportados en rutina válida');

// 2. Validar detección de límites excedidos (Stress testing de límites mecánicos)
const invalidWaypoints = [
  { name: "Paso Normal", angles: [0, 0, 0, 0, 0, 0], gripper: true },
  { name: "Paso Excedido J2", angles: [0, 5.0, 0, 0, 0, 0], gripper: false }, // J2 max es ~2.0 rad
  { name: "Paso Excedido J1", angles: [-4.0, 0, 0, 0, 0, 0], gripper: true }  // J1 min es ~ -3.14 rad
];

const res2 = IndustrialProgramExporter.validateRoutine(invalidWaypoints);
assert(res2.isValid === false, 'Rutina que excede límites es rechazada correctamente');
assert(res2.errors.length === 2, `Se detectaron exactamente 2 violaciones mecánicas (Detectadas: ${res2.errors.length})`);

console.log('\n🎉 ¡VALIDADOR INDUSTRIAL Y GENERADOR DE CÓDIGO APROBADOS!');
