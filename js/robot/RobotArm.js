import * as THREE from 'https://esm.sh/three@0.160.0';
import { ROBOT_CONFIG } from '../config.js';
import { Gripper } from './Gripper.js?v=4.0';
import { Kinematics } from './Kinematics.js';
import { MathUtils } from '../utils/MathUtils.js';

// Scratchpad global reutilizable para RobotArm (Zero-GC)
const _pBase = new THREE.Vector3();
const _pJ2 = new THREE.Vector3();
const _pJ3 = new THREE.Vector3();
const _pJ4 = new THREE.Vector3();
const _pJ5 = new THREE.Vector3();
const _pTCP = new THREE.Vector3();
const _pToolBase = new THREE.Vector3();
const _zeroVec = new THREE.Vector3(0, 0, 0);

export class RobotArm {
  constructor(scene, physicsWorld = null) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.config = ROBOT_CONFIG;
    this.group = new THREE.Group();
    this.group.name = "RobotArm_Assembly";

    this.joints = [];          // Referencias a los Pivots rotativos Three.js
    this.currentAngles = [0, 0.3, -0.6, 0, 0.3, 0];
    this.targetAngles = [...this.currentAngles];
    this.jointVelocities = [0, 0, 0, 0, 0, 0];
    this.jointTorques = [0, 0, 0, 0, 0, 0];
    this.isEmergencyStopped = false;

    // Array pre-alocado de cápsulas de colisión (Zero-GC)
    this.linkCapsules = this.createCollisionCapsulesPool();

    // Materiales industriales
    this.materials = {
      base: new THREE.MeshStandardMaterial({
        color: this.config.theme.baseColor,
        metalness: 0.8,
        roughness: 0.3
      }),
      body: new THREE.MeshStandardMaterial({
        color: this.config.theme.bodyColor,
        metalness: 0.7,
        roughness: 0.25,
        clearcoat: 0.3,
        clearcoatRoughness: 0.2
      }),
      jointActuator: new THREE.MeshStandardMaterial({
        color: this.config.theme.jointColor,
        metalness: 0.9,
        roughness: 0.2
      }),
      accent: new THREE.MeshStandardMaterial({
        color: this.config.theme.accentColor,
        metalness: 0.5,
        roughness: 0.35,
        emissive: 0x221100,
        emissiveIntensity: 0.2
      }),
      ledGlow: new THREE.MeshBasicMaterial({
        color: this.config.theme.glowColor
      })
    };

    this.buildRobot();
    this.kinematics = new Kinematics(this);
    
    // Aplicar ángulos por defecto
    this.applyJointAngles(this.currentAngles);
  }

  createCollisionCapsulesPool() {
    return [
      { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0.32, velocity: new THREE.Vector3(), name: 'base' },
      { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0.28, velocity: new THREE.Vector3(), name: 'upper_arm' },
      { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0.24, velocity: new THREE.Vector3(), name: 'forearm' },
      { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0.16, velocity: new THREE.Vector3(), name: 'wrist' },
      { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0.10, velocity: new THREE.Vector3(), name: 'tool_base' },
      { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0.045, velocity: new THREE.Vector3(), name: 'gripper_palm_rail' },
      { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0.016, velocity: new THREE.Vector3(), name: 'gripper_finger_left' },
      { start: new THREE.Vector3(), end: new THREE.Vector3(), radius: 0.016, velocity: new THREE.Vector3(), name: 'gripper_finger_right' }
    ];
  }

  buildRobot() {
    const { links } = this.config;

    // 0. Base fija al suelo
    this.baseGroup = new THREE.Group();
    const baseGeo = new THREE.CylinderGeometry(links.baseRadius * 0.85, links.baseRadius, links.baseHeight * 0.4, 32);
    const baseMesh = new THREE.Mesh(baseGeo, this.materials.base);
    baseMesh.position.y = links.baseHeight * 0.2;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    this.baseGroup.add(baseMesh);

    // Anillo con bisel y acento
    const ringGeo = new THREE.TorusGeometry(links.baseRadius * 0.7, 0.04, 16, 32);
    const ringMesh = new THREE.Mesh(ringGeo, this.materials.accent);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = links.baseHeight * 0.4;
    this.baseGroup.add(ringMesh);

    this.group.add(this.baseGroup);

    // 1. Joint 1 (Base Yaw - rotación en Y)
    const j1Pivot = new THREE.Group();
    j1Pivot.position.y = links.baseHeight * 0.4;
    this.baseGroup.add(j1Pivot);
    this.joints.push(j1Pivot);

    const shoulderBaseGeo = new THREE.CylinderGeometry(0.38, 0.45, links.link1Height, 32);
    const shoulderBaseMesh = new THREE.Mesh(shoulderBaseGeo, this.materials.body);
    shoulderBaseMesh.position.y = links.link1Height / 2;
    shoulderBaseMesh.castShadow = true;
    j1Pivot.add(shoulderBaseMesh);

    const motor1Geo = new THREE.CylinderGeometry(0.24, 0.24, 0.48, 24);
    const motor1Mesh = new THREE.Mesh(motor1Geo, this.materials.jointActuator);
    motor1Mesh.rotation.z = Math.PI / 2;
    motor1Mesh.position.y = links.link1Height;
    motor1Mesh.castShadow = true;
    j1Pivot.add(motor1Mesh);

    // 2. Joint 2 (Shoulder Pitch - rotación en X)
    const j2Pivot = new THREE.Group();
    j2Pivot.position.y = links.link1Height;
    j1Pivot.add(j2Pivot);
    this.joints.push(j2Pivot);

    // Eslabón 2: Brazo Superior (Upper Arm)
    const arm1Geo = new THREE.BoxGeometry(0.26, links.link2Length, 0.32);
    const arm1Mesh = new THREE.Mesh(arm1Geo, this.materials.body);
    arm1Mesh.position.y = links.link2Length / 2;
    arm1Mesh.castShadow = true;
    j2Pivot.add(arm1Mesh);

    const stripGeo = new THREE.BoxGeometry(0.02, links.link2Length * 0.8, 0.33);
    const stripMesh = new THREE.Mesh(stripGeo, this.materials.ledGlow);
    stripMesh.position.y = links.link2Length / 2;
    j2Pivot.add(stripMesh);

    // 3. Joint 3 (Elbow Pitch - rotación en X)
    const j3Pivot = new THREE.Group();
    j3Pivot.position.y = links.link2Length;
    j2Pivot.add(j3Pivot);
    this.joints.push(j3Pivot);

    const elbowMotorGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.4, 24);
    const elbowMotorMesh = new THREE.Mesh(elbowMotorGeo, this.materials.jointActuator);
    elbowMotorMesh.rotation.z = Math.PI / 2;
    elbowMotorMesh.castShadow = true;
    j3Pivot.add(elbowMotorMesh);

    // Eslabón 3: Antebrazo (Forearm)
    const forearmGeo = new THREE.BoxGeometry(0.22, links.link3Length, 0.24);
    const forearmMesh = new THREE.Mesh(forearmGeo, this.materials.body);
    forearmMesh.position.y = links.link3Length / 2;
    forearmMesh.castShadow = true;
    j3Pivot.add(forearmMesh);

    // 4. Joint 4 (Wrist Roll - rotación en Y local)
    const j4Pivot = new THREE.Group();
    j4Pivot.position.y = links.link3Length;
    j3Pivot.add(j4Pivot);
    this.joints.push(j4Pivot);

    const wristRotGeo = new THREE.CylinderGeometry(0.18, 0.2, links.link4Length, 24);
    const wristRotMesh = new THREE.Mesh(wristRotGeo, this.materials.jointActuator);
    wristRotMesh.position.y = links.link4Length / 2;
    wristRotMesh.castShadow = true;
    j4Pivot.add(wristRotMesh);

    // 5. Joint 5 (Wrist Pitch - rotación transversal en X)
    const j5Pivot = new THREE.Group();
    j5Pivot.position.y = links.link4Length;
    j4Pivot.add(j5Pivot);
    this.joints.push(j5Pivot);

    const forkGeo = new THREE.BoxGeometry(0.26, 0.16, 0.22);
    const forkMesh = new THREE.Mesh(forkGeo, this.materials.body);
    forkMesh.position.y = 0.04;
    forkMesh.castShadow = true;
    j5Pivot.add(forkMesh);

    const wristPitchGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.28, 24);
    const wristPitchMesh = new THREE.Mesh(wristPitchGeo, this.materials.accent);
    wristPitchMesh.rotation.z = Math.PI / 2;
    wristPitchMesh.castShadow = true;
    j5Pivot.add(wristPitchMesh);

    // 6. Joint 6 (Wrist Roll / Brida de Herramienta - rotación en Y concéntrica)
    const j6Pivot = new THREE.Group();
    j6Pivot.position.y = 0.14;
    j5Pivot.add(j6Pivot);
    this.joints.push(j6Pivot);

    const flangeGeo = new THREE.CylinderGeometry(0.15, 0.16, 0.06, 28);
    const flangeMesh = new THREE.Mesh(flangeGeo, this.materials.jointActuator);
    flangeMesh.position.y = 0.03;
    flangeMesh.castShadow = true;
    j6Pivot.add(flangeMesh);

    // Pinza / Gripper montada firmemente en la brida de la herramienta
    this.gripper = new Gripper(this);
    this.gripper.group.position.y = 0.06;
    j6Pivot.add(this.gripper.group);
    this.tcpObject = this.gripper.tcp;

    this.buildWorkspaceSphere();
  }

  buildWorkspaceSphere() {
    const totalReach = this.config.links.link1Height + this.config.links.link2Length + 
                       this.config.links.link3Length + this.config.links.gripperLength;
    const sphereGeo = new THREE.SphereGeometry(totalReach, 32, 24);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      wireframe: true,
      transparent: true,
      opacity: 0.04
    });
    this.workspaceMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.workspaceMesh.position.y = this.config.links.baseHeight * 0.4;
    this.workspaceMesh.visible = false;
    this.group.add(this.workspaceMesh);
  }

  setWorkspaceVisibility(visible) {
    if (this.workspaceMesh) {
      this.workspaceMesh.visible = visible;
    }
  }

  setLatticeTransparency(enable) {
    Object.values(this.materials).forEach(mat => {
      if (mat !== this.materials.ledGlow) {
        mat.transparent = enable;
        mat.opacity = enable ? 0.30 : 1.0;
        mat.needsUpdate = true;
      }
    });
  }

  setLedStatus(colorHex) {
    if (this.materials.ledGlow) {
      this.materials.ledGlow.color.setHex(colorHex);
    }
  }

  // Actualiza in-place las cápsulas de colisión física (Zero-GC, 0 asignaciones)
  updateCollisionCapsules() {
    this.joints[0].getWorldPosition(_pBase);
    this.joints[1].getWorldPosition(_pJ2);
    this.joints[2].getWorldPosition(_pJ3);
    this.joints[3].getWorldPosition(_pJ4);
    this.joints[4].getWorldPosition(_pJ5);
    this.tcpObject.getWorldPosition(_pTCP);

    const vGripper = this.gripper.linearVelocity;

    // 0. Base
    const c0 = this.linkCapsules[0];
    c0.start.copy(_pBase);
    c0.end.copy(_pJ2);
    c0.velocity.copy(_zeroVec);

    // 1. Upper Arm
    const c1 = this.linkCapsules[1];
    c1.start.copy(_pJ2);
    c1.end.copy(_pJ3);
    c1.velocity.copy(vGripper);

    // 2. Forearm
    const c2 = this.linkCapsules[2];
    c2.start.copy(_pJ3);
    c2.end.copy(_pJ4);
    c2.velocity.copy(vGripper);

    // 3. Wrist
    const c3 = this.linkCapsules[3];
    c3.start.copy(_pJ4);
    c3.end.copy(_pJ5);
    c3.velocity.copy(vGripper);

    // 4. Tool Base
    _pToolBase.copy(_pJ5).lerp(_pTCP, 0.45);
    const c4 = this.linkCapsules[4];
    c4.start.copy(_pJ5);
    c4.end.copy(_pToolBase);
    c4.velocity.copy(vGripper);

    // 5. Gripper Palm Rail
    const c5 = this.linkCapsules[5];
    c5.start.set(-0.16, 0.09, 0);
    c5.end.set(0.16, 0.09, 0);
    this.gripper.group.localToWorld(c5.start);
    this.gripper.group.localToWorld(c5.end);
    c5.velocity.copy(vGripper);

    // 6. Left Finger
    const halfW = this.gripper.currentWidth / 2;
    const c6 = this.linkCapsules[6];
    c6.start.set(-halfW, 0.11, 0);
    c6.end.set(-halfW, 0.23, 0);
    this.gripper.group.localToWorld(c6.start);
    this.gripper.group.localToWorld(c6.end);
    c6.velocity.copy(vGripper);

    // 7. Right Finger
    const c7 = this.linkCapsules[7];
    c7.start.set(halfW, 0.11, 0);
    c7.end.set(halfW, 0.23, 0);
    this.gripper.group.localToWorld(c7.start);
    this.gripper.group.localToWorld(c7.end);
    c7.velocity.copy(vGripper);
  }

  dispose() {
    this.gripper.dispose();
    this.group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    this.scene.remove(this.group);
  }

  setEmergencyStop(stopped) {
    this.isEmergencyStopped = stopped;
    if (stopped) {
      for (let i = 0; i < 6; i++) {
        this.targetAngles[i] = this.currentAngles[i];
        this.jointVelocities[i] = 0;
      }
    }
  }

  setTargetJointAngles(angles) {
    if (this.isEmergencyStopped) return;
    for (let i = 0; i < 6; i++) {
      if (angles[i] !== undefined) {
        const limit = this.config.jointLimits[i];
        this.targetAngles[i] = MathUtils.clamp(angles[i], limit.min, limit.max);
      }
    }
  }

  applyJointAngles(angles) {
    if (!angles || angles.length < 6) return;
    this.joints[0].rotation.y = angles[0];
    this.joints[1].rotation.x = angles[1];
    this.joints[2].rotation.x = angles[2];
    this.joints[3].rotation.y = angles[3];
    this.joints[4].rotation.x = angles[4];
    this.joints[5].rotation.y = angles[5];

    for (let i = 0; i < 6; i++) {
      this.currentAngles[i] = angles[i];
      this.targetAngles[i] = angles[i];
    }
    this.group.updateMatrixWorld(true);
    this.updateCollisionCapsules();
  }

  getCurrentJointAngles() {
    return [
      this.joints[0].rotation.y,
      this.joints[1].rotation.x,
      this.joints[2].rotation.x,
      this.joints[3].rotation.y,
      this.joints[4].rotation.x,
      this.joints[5].rotation.y
    ];
  }

  update(delta) {
    if (this.isEmergencyStopped) {
      this.gripper.update(delta);
      this.updateCollisionCapsules();
      return;
    }

    const responseSpeed = 8.0;
    const invDelta = delta > 1e-5 ? 1.0 / delta : 60;

    for (let i = 0; i < 6; i++) {
      const diff = this.targetAngles[i] - this.currentAngles[i];
      const maxDelta = this.config.jointLimits[i].maxSpeed * delta;
      const step = MathUtils.clamp(diff * responseSpeed * delta, -maxDelta, maxDelta);
      
      this.currentAngles[i] += step;
      this.jointVelocities[i] = step * invDelta;
      
      const gravityFactor = (i === 1 || i === 2) ? Math.cos(this.currentAngles[i]) * 15.0 : 2.0;
      this.jointTorques[i] = Math.abs(this.jointVelocities[i] * 4.2) + Math.abs(gravityFactor);
    }

    this.joints[0].rotation.y = this.currentAngles[0];
    this.joints[1].rotation.x = this.currentAngles[1];
    this.joints[2].rotation.x = this.currentAngles[2];
    this.joints[3].rotation.y = this.currentAngles[3];
    this.joints[4].rotation.x = this.currentAngles[4];
    this.joints[5].rotation.y = this.currentAngles[5];

    this.gripper.update(delta);
    this.group.updateMatrixWorld(true);
    this.updateCollisionCapsules();
  }
}
