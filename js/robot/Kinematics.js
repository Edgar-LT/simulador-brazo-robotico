import * as THREE from 'https://esm.sh/three@0.160.0';
import { MathUtils } from '../utils/MathUtils.js';

// Pool de variables temporales estáticas reutilizables para CERO asignación en memoria (Zero-GC real)
const _targetClamped = new THREE.Vector3();
const _basePos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _currentTcpPos = new THREE.Vector3();
const _jointWorldPos = new THREE.Vector3();
const _jointWorldRot = new THREE.Quaternion();
const _worldAxis = new THREE.Vector3();
const _toTcp = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _projTcp = new THREE.Vector3();
const _projTarget = new THREE.Vector3();
const _cross = new THREE.Vector3();

// Ejes canónicos inmutables pre-asignados
const AXIS_X = Object.freeze(new THREE.Vector3(1, 0, 0));
const AXIS_Y = Object.freeze(new THREE.Vector3(0, 1, 0));

// Vectores auxiliares para FK
const _tcpVec = new THREE.Vector3();
const _tcpRot = new THREE.Euler();
const _tcpQuat = new THREE.Quaternion();

export class Kinematics {
  constructor(robot) {
    this.robot = robot;
    this.config = robot.config;
    this.isNearSingularity = false;
    this.isJointNearLimit = false;

    // Tabla de Parámetros Denavit-Hartenberg (D-H Clásica)
    // [theta, d (desplazamiento Z), a (longitud X), alpha (torsión X)]
    const { link1Height, link2Length, link3Length, link4Length, link5Length, gripperLength } = this.config.links;
    this.dhTable = [
      { joint: "J1 (Base)",      d: link1Height,                       a: 0,           alpha: Math.PI / 2 },
      { joint: "J2 (Hombro)",    d: 0,                                 a: link2Length, alpha: 0 },
      { joint: "J3 (Codo)",      d: 0,                                 a: 0,           alpha: Math.PI / 2 },
      { joint: "J4 (Muñeca R)",  d: link3Length + link4Length,         a: 0,           alpha: -Math.PI / 2 },
      { joint: "J5 (Muñeca P)",  d: 0,                                 a: 0,           alpha: Math.PI / 2 },
      { joint: "J6 (Herramienta)", d: link5Length + gripperLength,     a: 0,           alpha: 0 }
    ];

    // Array estático pre-asignado para Zero-GC absoluto en solveIK()
    const joints = this.robot.joints;
    this.jointOrder = [
      { joint: joints[4], axis: AXIS_X, idx: 4 }, // Wrist Pitch
      { joint: joints[2], axis: AXIS_X, idx: 2 }, // Elbow Pitch
      { joint: joints[1], axis: AXIS_X, idx: 1 }, // Shoulder Pitch
      { joint: joints[0], axis: AXIS_Y, idx: 0 }  // Base Yaw
    ];
  }

  // Cinemática Directa (FK): Obtiene la posición y orientación global del Tool Center Point (TCP)
  getForwardKinematics(jointAngles) {
    if (!jointAngles) {
      this.robot.tcpObject.getWorldPosition(_tcpVec);
      this.robot.tcpObject.getWorldQuaternion(_tcpQuat);
      _tcpRot.setFromQuaternion(_tcpQuat);

      return {
        position: _tcpVec,
        rotation: _tcpRot,
        quaternion: _tcpQuat
      };
    }

    // Cálculo geométrico de referencia
    const { link1Height, link2Length, link3Length, link4Length, link5Length, gripperLength } = this.config.links;
    const [q1, q2, q3] = jointAngles;

    const armTotalL3 = link3Length + link4Length + link5Length + gripperLength;
    const r = link2Length * Math.sin(q2) + armTotalL3 * Math.sin(q2 + q3);
    const y = link1Height + link2Length * Math.cos(q2) + armTotalL3 * Math.cos(q2 + q3);
    const x = r * Math.sin(q1);
    const z = r * Math.cos(q1);

    _tcpVec.set(x, y, z);
    return {
      position: _tcpVec
    };
  }

  // Cinemática Inversa (IK CCD Damped) optimizada sin asignaciones de memoria
  solveIK(targetPosition, maxIterations = 24, tolerance = 0.008) {
    const joints = this.robot.joints;
    const tcp = this.robot.tcpObject;
    
    // Clonar objetivo en vector temporal
    _targetClamped.copy(targetPosition);

    // C2: Restricción física estricta contra el piso y mesas (Y >= 0.15 m de seguridad)
    if (_targetClamped.y < 0.15) {
      _targetClamped.y = 0.15;
    }
    
    // Verificación de alcance de espacio de trabajo
    this.robot.baseGroup.getWorldPosition(_basePos);
    const maxReach = this.config.links.link1Height + this.config.links.link2Length + 
                     this.config.links.link3Length + this.config.links.link4Length + 
                     this.config.links.link5Length + this.config.links.gripperLength;

    const distToTarget = _targetClamped.distanceTo(_basePos);
    
    // Detección de singularidad de frontera (brazo completamente extendido)
    this.isNearSingularity = (distToTarget > maxReach * 0.94);

    if (distToTarget > maxReach * 0.98) {
      _dir.subVectors(_targetClamped, _basePos).normalize();
      _targetClamped.copy(_basePos).addScaledVector(_dir, maxReach * 0.96);
    }

    // Articulaciones involucradas en el lazo cinemático CCD (Reutiliza array pre-asignado Zero-GC)
    const jointOrder = this.jointOrder;

    for (let iter = 0; iter < maxIterations; iter++) {
      tcp.getWorldPosition(_currentTcpPos);
      if (_currentTcpPos.distanceTo(_targetClamped) < tolerance) {
        break;
      }

      for (let j = 0; j < jointOrder.length; j++) {
        const { joint, axis, idx } = jointOrder[j];
        joint.getWorldPosition(_jointWorldPos);
        tcp.getWorldPosition(_currentTcpPos);

        // Vector de la articulación al efector y al objetivo sin new THREE.Vector3
        _toTcp.subVectors(_currentTcpPos, _jointWorldPos).normalize();
        _toTarget.subVectors(_targetClamped, _jointWorldPos).normalize();

        // Eje de rotación en espacio global
        joint.parent.getWorldQuaternion(_jointWorldRot);
        _worldAxis.copy(axis).applyQuaternion(_jointWorldRot).normalize();

        // Proyección en el plano perpendicular al eje de rotación
        _projTcp.copy(_toTcp).projectOnPlane(_worldAxis).normalize();
        _projTarget.copy(_toTarget).projectOnPlane(_worldAxis).normalize();

        const dot = MathUtils.clamp(_projTcp.dot(_projTarget), -1, 1);
        let angleDiff = Math.acos(dot);

        // Signo mediante producto cruz
        _cross.crossVectors(_projTcp, _projTarget);
        if (_cross.dot(_worldAxis) < 0) {
          angleDiff = -angleDiff;
        }

        // Amortiguación
        angleDiff *= 0.42;

        const limit = this.config.jointLimits[idx];
        let currentAngle = (axis.y === 1) ? joint.rotation.y : joint.rotation.x;
        let newAngle = MathUtils.clamp(currentAngle + angleDiff, limit.min, limit.max);

        if (axis.y === 1) {
          joint.rotation.y = newAngle;
        } else {
          joint.rotation.x = newAngle;
        }

        joint.updateMatrixWorld(true);
      }
    }

    return this.robot.getCurrentJointAngles();
  }

  // Verifica si alguna articulación está próxima al 95% de su recorrido mecánico
  checkLimitsStatus() {
    let nearLimit = false;
    const angles = this.robot.currentAngles;
    for (let i = 0; i < 6; i++) {
      const val = angles[i];
      const lim = this.config.jointLimits[i];
      const range = lim.max - lim.min;
      const margin = range * 0.04; // 4% de margen
      if (val <= lim.min + margin || val >= lim.max - margin) {
        nearLimit = true;
        break;
      }
    }
    this.isJointNearLimit = nearLimit;
    return nearLimit;
  }
}
