// Utilidades matemáticas para cinemática, interpolación y transformaciones 3D
// Diseñado para máximo rendimiento en tiempo real (Zero-GC, O(1), IEEE 754 safe)

const TWO_PI = 2 * Math.PI;

export class MathUtils {
  static degToRad(deg) {
    return deg * (Math.PI / 180);
  }

  static radToDeg(rad) {
    return rad * (180 / Math.PI);
  }

  static clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  static lerp(start, end, alpha) {
    return start + (end - start) * alpha;
  }

  // Interpolación suave cúbica (Smoothstep) para aceleración y deceleración continua
  static smoothstep(t) {
    const clamped = t < 0 ? 0 : (t > 1 ? 1 : t);
    return clamped * clamped * (3 - 2 * clamped);
  }

  // Perfil trapezoidal S-Curve de velocidad (Quintic Smootherstep: C2-continuo, aceleración y jerk suaves)
  static smootherstep(t) {
    const clamped = t < 0 ? 0 : (t > 1 ? 1 : t);
    return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
  }

  // Cuadrado de distancia euclídea 3D (evita Math.sqrt cuando solo se compara distancia)
  static distance3DSq(v1, v2) {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    const dz = v1.z - v2.z;
    return dx * dx + dy * dy + dz * dz;
  }

  // Distancia euclídea 3D
  static distance3D(v1, v2) {
    return Math.sqrt(MathUtils.distance3DSq(v1, v2));
  }

  /**
   * Normalizar ángulo entre -PI y +PI en O(1) tiempo constante estricto.
   * Blindado contra DoS por entradas infinitas, NaN o acumulaciones grandes.
   */
  static normalizeAngle(angle) {
    if (!Number.isFinite(angle)) return 0;
    angle = (angle + Math.PI) % TWO_PI;
    if (angle < 0) angle += TWO_PI;
    return angle - Math.PI;
  }
}
