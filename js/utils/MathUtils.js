// Utilidades matemáticas para cinemática, interpolación y transformaciones 3D
export class MathUtils {
  static degToRad(deg) {
    return deg * (Math.PI / 180);
  }

  static radToDeg(rad) {
    return rad * (180 / Math.PI);
  }

  static clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  static lerp(start, end, alpha) {
    return start + (end - start) * alpha;
  }

  // Interpolación suave cúbica (Smoothstep) para aceleración y deceleración realista de motores
  static smoothstep(t) {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped * clamped * (3 - 2 * clamped);
  }

  // Perfil trapezoidal S-Curve de velocidad (Quintic Smoothstep)
  static smootherstep(t) {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
  }

  // Distancia euclídea 3D
  static distance3D(v1, v2) {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    const dz = v1.z - v2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Normalizar ángulo entre -PI y +PI
  static normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }
}
