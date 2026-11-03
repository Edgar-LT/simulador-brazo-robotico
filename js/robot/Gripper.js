import * as THREE from 'https://esm.sh/three@0.160.0';

export class Gripper {
  constructor(robot) {
    this.robot = robot;
    this.config = robot.config.gripper;
    this.isOpen = true;
    this.currentWidth = this.config.maxOpen;
    this.targetWidth = this.config.maxOpen;
    this.grippedObject = null;

    // Velocidad lineal del TCP estimada para fricción
    this.linearVelocity = new THREE.Vector3();
    this.lastWorldPos = new THREE.Vector3();
    this.tempBoxLeft = new THREE.Box3();
    this.tempBoxRight = new THREE.Box3();

    // Posición y orientación de anclaje relativo cuando una caja está sujeta físicamente
    this.relativeHoldPos = new THREE.Vector3();
    this.relativeHoldQuat = new THREE.Quaternion();

    this.group = new THREE.Group();
    this.group.name = "GripperAssembly";
    this.buildGripperGeometry();
  }

  buildGripperGeometry() {
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x22262c,
      metalness: 0.85,
      roughness: 0.25
    });

    const fingerMat = new THREE.MeshStandardMaterial({
      color: 0xff6b00, // Naranja alta visibilidad en yemas
      metalness: 0.4,
      roughness: 0.35
    });

    // Base de acoplamiento cilíndrica de la pinza
    const baseGeo = new THREE.CylinderGeometry(0.12, 0.13, 0.08, 20);
    this.baseMesh = new THREE.Mesh(baseGeo, metalMat);
    this.baseMesh.position.y = 0.04;
    this.baseMesh.castShadow = true;
    this.group.add(this.baseMesh);

    // Guía transversal del actuador (Palm / Palma de la garra)
    const railGeo = new THREE.BoxGeometry(0.32, 0.06, 0.09);
    this.railMesh = new THREE.Mesh(railGeo, metalMat);
    this.railMesh.position.y = 0.09;
    this.railMesh.castShadow = true;
    this.group.add(this.railMesh);

    // Dedo Izquierdo (Slider 1)
    this.fingerLeft = new THREE.Group();
    this.fingerLeft.position.set(-this.currentWidth / 2, 0.12, 0);

    const fingerGeo = new THREE.BoxGeometry(0.02, 0.18, 0.06);
    this.fingerLeftStructural = new THREE.Mesh(fingerGeo, metalMat);
    this.fingerLeftStructural.position.y = 0.09;
    this.fingerLeftStructural.castShadow = true;
    this.fingerLeft.add(this.fingerLeftStructural);

    // Yema de agarre de goma de alta fricción (Grip Pad)
    const tipGeo = new THREE.BoxGeometry(0.012, 0.10, 0.05);
    this.fingerLeftMesh = new THREE.Mesh(tipGeo, fingerMat);
    this.fingerLeftMesh.position.set(0.012, 0.11, 0);
    this.fingerLeft.add(this.fingerLeftMesh);
    this.group.add(this.fingerLeft);

    // Dedo Derecho (Slider 2)
    this.fingerRight = new THREE.Group();
    this.fingerRight.position.set(this.currentWidth / 2, 0.12, 0);

    const fMeshR = new THREE.Mesh(fingerGeo, metalMat);
    this.fingerRightStructural = fMeshR;
    this.fingerRightStructural.position.y = 0.09;
    this.fingerRightStructural.castShadow = true;
    this.fingerRight.add(this.fingerRightStructural);

    this.fingerRightMesh = new THREE.Mesh(tipGeo, fingerMat);
    this.fingerRightMesh.position.set(-0.012, 0.11, 0);
    this.fingerRight.add(this.fingerRightMesh);
    this.group.add(this.fingerRight);

    // Punto central de agarre (TCP - Tool Center Point)
    this.tcp = new THREE.Object3D();
    this.tcp.name = "TCP";
    this.tcp.position.set(0, 0.23, 0);
    this.group.add(this.tcp);
  }

  open() {
    this.targetWidth = this.config.maxOpen;
    this.isOpen = true;
    this.releaseObject();
  }

  close(targetObject = null) {
    if (targetObject && targetObject.userData && targetObject.userData.size) {
      this.targetWidth = targetObject.userData.size + 0.012;
    } else if (this.grippedObject && this.grippedObject.userData && this.grippedObject.userData.size) {
      this.targetWidth = this.grippedObject.userData.size + 0.012;
    } else {
      this.targetWidth = this.config.minOpen;
    }
    this.isOpen = false;
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  // Detecta si una caja está físicamente dentro del volumen real entre las yemas de la garra
  findNearbyObject(candidates) {
    if (!candidates || candidates.length === 0) return null;

    this.fingerLeftMesh.updateMatrixWorld(true);
    this.fingerRightMesh.updateMatrixWorld(true);
    const leftBox = this.tempBoxLeft.setFromObject(this.fingerLeftMesh);
    const rightBox = this.tempBoxRight.setFromObject(this.fingerRightMesh);

    // Volumen estricto comprendido entre las caras internas de ambos dedos
    const gripBounds = new THREE.Box3();
    gripBounds.min.x = Math.min(leftBox.min.x, rightBox.min.x) - 0.02;
    gripBounds.max.x = Math.max(leftBox.max.x, rightBox.max.x) + 0.02;
    gripBounds.min.y = Math.min(leftBox.min.y, rightBox.min.y) - 0.03;
    gripBounds.max.y = Math.max(leftBox.max.y, rightBox.max.y) + 0.03;
    gripBounds.min.z = Math.min(leftBox.min.z, rightBox.min.z) - 0.04;
    gripBounds.max.z = Math.max(leftBox.max.z, rightBox.max.z) + 0.04;

    const objBox = new THREE.Box3();
    const objPos = new THREE.Vector3();
    const tcpPos = new THREE.Vector3();
    this.tcp.getWorldPosition(tcpPos);

    let closestObj = null;
    let minDistance = 0.12; // Radio estricto de captura física real (12 cm máx)

    for (let i = 0; i < candidates.length; i++) {
      const obj = candidates[i];
      obj.getWorldPosition(objPos);
      objBox.setFromObject(obj);

      const dist = tcpPos.distanceTo(objPos);
      // Solo es válido si la caja intersecta el espacio físico entre dedos Y está a distancia de agarre
      if (gripBounds.intersectsBox(objBox) && dist < minDistance) {
        minDistance = dist;
        closestObj = obj;
      }
    }

    return closestObj;
  }

  // Sujeta físicamente un objeto si está presente de forma comprobada en la garra
  grabObject(object3D, candidates = null) {
    if (this.grippedObject) return;

    // Verificar presencia física real
    let target = null;
    if (object3D) {
      target = this.findNearbyObject([object3D]);
    } else if (candidates && candidates.length > 0) {
      target = this.findNearbyObject(candidates);
    }

    if (!target) return;
    this.grippedObject = target;

    // Calcular offset relativo respecto al TCP
    const tcpWorldPos = new THREE.Vector3();
    const tcpWorldQuat = new THREE.Quaternion();
    this.tcp.getWorldPosition(tcpWorldPos);
    this.tcp.getWorldQuaternion(tcpWorldQuat);

    const objWorldPos = new THREE.Vector3();
    const objWorldQuat = new THREE.Quaternion();
    target.getWorldPosition(objWorldPos);
    target.getWorldQuaternion(objWorldQuat);

    const invTcpQuat = tcpWorldQuat.clone().invert();
    this.relativeHoldPos.subVectors(objWorldPos, tcpWorldPos).applyQuaternion(invTcpQuat);
    this.relativeHoldQuat.copy(invTcpQuat).multiply(objWorldQuat);
  }

  releaseObject() {
    if (this.grippedObject && this.grippedObject.userData && this.grippedObject.userData.particleBody) {
      this.grippedObject.userData.particleBody.isClamped = false;
      this.grippedObject.userData.particleBody.contactNormalForce = 0.0;
    }
    this.grippedObject = null;
  }

  dispose() {
    this.group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }

  update(delta) {
    // 1. Cinemática de apertura / cierre del servomotor de la pinza
    if (Math.abs(this.currentWidth - this.targetWidth) > 0.001) {
      const step = (this.targetWidth - this.currentWidth) * 14 * delta;
      this.currentWidth += step;
      this.fingerLeft.position.x = -this.currentWidth / 2;
      this.fingerRight.position.x = this.currentWidth / 2;
      this.fingerLeft.updateMatrixWorld(true);
      this.fingerRight.updateMatrixWorld(true);
    }

    // 2. Estimación continua de velocidad lineal en el espacio de mundo
    const currentWorldPos = new THREE.Vector3();
    this.tcp.getWorldPosition(currentWorldPos);
    if (delta > 1e-5) {
      this.linearVelocity.subVectors(currentWorldPos, this.lastWorldPos).multiplyScalar(1.0 / delta);
    }
    this.lastWorldPos.copy(currentWorldPos);

    // 3. Arrastre de cuerpo físico XPBD si está sujeto por la pinza
    if (this.grippedObject && !this.isOpen) {
      const tcpWorldPos = new THREE.Vector3();
      const tcpWorldQuat = new THREE.Quaternion();
      this.tcp.getWorldPosition(tcpWorldPos);
      this.tcp.getWorldQuaternion(tcpWorldQuat);

      const targetPos = this.relativeHoldPos.clone().applyQuaternion(tcpWorldQuat).add(tcpWorldPos);
      const targetQuat = tcpWorldQuat.clone().multiply(this.relativeHoldQuat);

      if (this.grippedObject.userData && this.grippedObject.userData.particleBody) {
        const pBody = this.grippedObject.userData.particleBody;
        // Interpolación amortiguada (slerp / lerp) para movimiento fluido y natural sin sacudidas
        const currentPos = pBody.centerOfMass;
        const currentQuat = pBody.orientation;
        const smoothedPos = currentPos.clone().lerp(targetPos, 0.45);
        const smoothedQuat = currentQuat.clone().slerp(targetQuat, 0.45);
        pBody.setKinematicTarget(smoothedPos, smoothedQuat, delta);
      }
    }
  }
}
