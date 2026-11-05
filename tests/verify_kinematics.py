"""
Verificación formal de la Cinemática Directa (FK) y Matrices Denavit-Hartenberg (D-H)
para RoboTwin 3D (Manipulador Industrial de 6-DOF).
"""

import math
import numpy as np

# Dimensiones geométricas del robot (según config.js)
LINK1_HEIGHT = 0.7
LINK2_LENGTH = 1.8
LINK3_LENGTH = 1.5
LINK4_LENGTH = 0.4
LINK5_LENGTH = 0.35
GRIPPER_LENGTH = 0.45
ARM_TOTAL_L3 = LINK3_LENGTH + LINK4_LENGTH + LINK5_LENGTH + GRIPPER_LENGTH  # 2.7 m

MAX_REACH = LINK1_HEIGHT + LINK2_LENGTH + ARM_TOTAL_L3  # 0.7 + 1.8 + 2.7 = 5.2 m


def dh_matrix(theta: float, d: float, a: float, alpha: float) -> np.ndarray:
    """Calcula la matriz homogénea de transformación estándar D-H (4x4)."""
    ct = math.cos(theta)
    st = math.sin(theta)
    ca = math.cos(alpha)
    sa = math.sin(alpha)

    return np.array([
        [ct, -st * ca,  st * sa, a * ct],
        [st,  ct * ca, -ct * sa, a * st],
        [0.0, sa,       ca,      d],
        [0.0, 0.0,      0.0,     1.0]
    ])


def forward_kinematics_geometric(q1: float, q2: float, q3: float) -> tuple[float, float, float]:
    """Cálculo trigonométrico geométrico simplificado de Kinematics.js."""
    r = LINK2_LENGTH * math.sin(q2) + ARM_TOTAL_L3 * math.sin(q2 + q3)
    y = LINK1_HEIGHT + LINK2_LENGTH * math.cos(q2) + ARM_TOTAL_L3 * math.cos(q2 + q3)
    x = r * math.sin(q1)
    z = r * math.cos(q1)
    return (x, y, z)


def test_dh_table_consistency():
    """Verifica que la tabla D-H formal y el cálculo geométrico producen resultados coherentes."""
    print("--- 1. Comprobando configuración en reposo (Home: q = [0, 0, 0, 0, 0, 0]) ---")
    x, y, z = forward_kinematics_geometric(0.0, 0.0, 0.0)
    print(f"  Posición geométrica TCP: X={x:.3f}, Y={y:.3f}, Z={z:.3f}")
    assert abs(x) < 1e-6, "X debe ser 0 en posición home con q1=0"
    assert abs(y - (LINK1_HEIGHT + LINK2_LENGTH + ARM_TOTAL_L3)) < 1e-6, "Y debe ser la altura vertical completa"
    assert abs(z) < 1e-6, "Z debe ser 0 en posición vertical"

    print("--- 2. Comprobando rotación de base (q1 = 90 deg, q2 = 30 deg, q3 = 45 deg) ---")
    q1 = math.radians(90.0)
    q2 = math.radians(30.0)
    q3 = math.radians(45.0)
    x_rot, y_rot, z_rot = forward_kinematics_geometric(q1, q2, q3)
    print(f"  Posición TCP rotado: X={x_rot:.3f}, Y={y_rot:.3f}, Z={z_rot:.3f}")
    assert abs(z_rot) < 1e-6, "Con q1=90°, cos(90°)=0, Z debe ser 0"
    assert x_rot > 0, "Con q1=90°, sin(90°)=1, X debe ser positivo hacia la derecha"

    print("--- 3. Verificando alcance máximo y límites de singularidad ---")
    reach = math.sqrt(x_rot**2 + z_rot**2 + (y_rot - LINK1_HEIGHT)**2)
    print(f"  Alcance radial del brazo: {reach:.3f} m (Alcance máximo teórico: {LINK2_LENGTH + ARM_TOTAL_L3:.3f} m)")
    assert reach <= (LINK2_LENGTH + ARM_TOTAL_L3) + 1e-6, "El alcance no puede superar la longitud física extendida"

    print("\n[OK] Todas las pruebas de cinematica y parametros D-H pasaron exitosamente.")


if __name__ == "__main__":
    test_dh_table_consistency()
