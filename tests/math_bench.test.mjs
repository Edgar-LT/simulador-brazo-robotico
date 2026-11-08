import { MathUtils } from '../js/utils/MathUtils.js';

console.log('🧪 Iniciando Suite de Pruebas Matemáticas y de Robustez...');

// 1. Test de MathUtils.normalizeAngle
console.log('\n--- 1. MathUtils.normalizeAngle (O(1) & Edge Cases) ---');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALLÓ: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASÓ: ${message}`);
  }
}

function approxEqual(a, b, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

// Valores estándar
assert(approxEqual(MathUtils.normalizeAngle(0), 0), 'Ángulo 0 se mantiene 0');
assert(approxEqual(MathUtils.normalizeAngle(Math.PI), Math.PI) || approxEqual(MathUtils.normalizeAngle(Math.PI), -Math.PI), 'Ángulo PI en rango');
assert(approxEqual(MathUtils.normalizeAngle(3 * Math.PI), Math.PI) || approxEqual(MathUtils.normalizeAngle(3 * Math.PI), -Math.PI), '3*PI normalizado a PI');
assert(approxEqual(MathUtils.normalizeAngle(2 * Math.PI), 0), '2*PI normalizado a 0');
assert(approxEqual(MathUtils.normalizeAngle(-2 * Math.PI), 0), '-2*PI normalizado a 0');
assert(approxEqual(MathUtils.normalizeAngle(2.5 * Math.PI), 0.5 * Math.PI), '2.5*PI normalizado a 0.5*PI');

// Edge cases que antes congelaban el CPU en bucle infinito
const start = performance.now();
const extremeAngle = 1e12; // 1 billón de radianes
const normExtreme = MathUtils.normalizeAngle(extremeAngle);
const elapsed = performance.now() - start;

assert(Number.isFinite(normExtreme), '10^12 radianes retorna número finito');
assert(normExtreme >= -Math.PI && normExtreme <= Math.PI, '10^12 radianes está acotado en [-PI, PI]');
assert(elapsed < 2.0, `Ejecución O(1) inmediata (${elapsed.toFixed(3)} ms) sin TLE`);

// Salvaguardas ante NaN e Infinity
assert(MathUtils.normalizeAngle(NaN) === 0, 'NaN devuelve 0 de seguridad sin colapsar');
assert(MathUtils.normalizeAngle(Infinity) === 0, 'Infinity devuelve 0 de seguridad sin bucle infinito');
assert(MathUtils.normalizeAngle(-Infinity) === 0, '-Infinity devuelve 0 de seguridad');

// 2. Test de Interpolaciones y Suavizado
console.log('\n--- 2. Interpolaciones C1 y C2 (Smoothstep & Smootherstep) ---');
assert(MathUtils.smoothstep(-1) === 0, 'Smoothstep clamp inferior');
assert(MathUtils.smoothstep(2) === 1, 'Smoothstep clamp superior');
assert(approxEqual(MathUtils.smoothstep(0.5), 0.5), 'Smoothstep en punto medio');

assert(MathUtils.smootherstep(-1) === 0, 'Smootherstep clamp inferior');
assert(MathUtils.smootherstep(2) === 1, 'Smootherstep clamp superior');
assert(approxEqual(MathUtils.smootherstep(0.5), 0.5), 'Smootherstep en punto medio');

// 3. Test de Distancias 3D
console.log('\n--- 3. Distancias 3D ---');
const v1 = { x: 0, y: 0, z: 0 };
const v2 = { x: 3, y: 4, z: 0 };
assert(MathUtils.distance3DSq(v1, v2) === 25, 'distance3DSq correcto (25)');
assert(MathUtils.distance3D(v1, v2) === 5, 'distance3D correcto (5)');

console.log('\n🎉 ¡TODAS LAS PRUEBAS MATEMÁTICAS Y DE TIEMPO CONSTANTE PASARON CON ÉXITO!');
