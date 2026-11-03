import * as THREE from 'https://esm.sh/three@0.160.0';

// Implementación de cuerpo volumétrico XPBD (Extended Position Based Dynamics)
export class ParticleBody {
  constructor(initialPosition, size = 0.15, config = {}) {
    this.size = size;
    this.name = config.name || "Particle Box";
    this.id = config.id || "pbox_0";
    this.color = config.color || 0xff4757;

    this.materialPreset = config.materialPreset || 'rubber';
    this.applyMaterialPreset(this.materialPreset);

    this.numX = 3;
    this.numY = 3;
    this.numZ = 3;
    this.particles = [];
    this.distanceConstraints = [];
    this.initialWorldPos = initialPosition.clone();

    this.centerOfMass = initialPosition.clone();
    this.orientation = new THREE.Quaternion();

    this.contactNormalForce = 0.0;
    this.isClamped = false;
    this.tempBoxL = new THREE.Box3();
    this.tempBoxR = new THREE.Box3();
    this.accumLinkPush = new THREE.Vector3();
    this.collidingLinkCount = 0;

    this.initParticles(initialPosition, size);
    this.buildDistanceConstraints();
  }

  applyMaterialPreset(preset) {
    this.materialPreset = preset;
    switch (preset) {
      case 'wood':
        this.compliance = 1e-6;
        this.frictionCoeff = 0.85;
        this.damping = 0.985;
        this.shapeStiffness = 0.98;
        break;
      case 'rubber':
        this.compliance = 1e-4;
        this.frictionCoeff = 0.98;
        this.damping = 0.970;
        this.shapeStiffness = 0.92;
        break;
      case 'jelly':
        this.compliance = 1e-2;
        this.frictionCoeff = 0.80;
        this.damping = 0.950;
        this.shapeStiffness = 0.65;
        break;
      default:
        this.compliance = 1e-4;
        this.frictionCoeff = 0.95;
        this.damping = 0.970;
        this.shapeStiffness = 0.90;
    }
  }

  initParticles(pos, size) {
    const half = size / 2;
    const step = size / 2;
    const totalMass = 1.2;
    const pMass = totalMass / 27;

    this.particles = [];
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          const rx = -half + x * step;
          const ry = -half + y * step;
          const rz = -half + z * step;

          const p0 = new THREE.Vector3(rx, ry, rz);
          const p = new THREE.Vector3(pos.x + rx, pos.y + ry, pos.z + rz);
          const prev = p.clone();
          const vel = new THREE.Vector3(0, 0, 0);

          this.particles.push({
            gridIndex: { x, y, z },
            restPos: p0,
            pos: p,
            prevPos: prev,
            vel: vel,
            mass: pMass,
            invMass: 1.0 / pMass,
            radius: 0.016
          });
        }
      }
    }
  }

  buildDistanceConstraints() {
    this.distanceConstraints = [];
    const getIdx = (x, y, z) => x * 9 + y * 3 + z;

    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        for (let z = 0; z < 3; z++) {
          const idx1 = getIdx(x, y, z);

          if (x < 2) {
            this.addDistanceConstraint(idx1, getIdx(x + 1, y, z));
          }
          if (y < 2) {
            this.addDistanceConstraint(idx1, getIdx(x, y + 1, z));
          }
          if (z < 2) {
            this.addDistanceConstraint(idx1, getIdx(x, y, z + 1));
          }
          if (x < 2 && y < 2) {
            this.addDistanceConstraint(getIdx(x, y, z), getIdx(x + 1, y + 1, z));
            this.addDistanceConstraint(getIdx(x + 1, y, z), getIdx(x, y + 1, z));
          }
          if (y < 2 && z < 2) {
            this.addDistanceConstraint(getIdx(x, y, z), getIdx(x, y + 1, z + 1));
            this.addDistanceConstraint(getIdx(x, y + 1, z), getIdx(x, y, z + 1));
          }
          if (x < 2 && z < 2) {
            this.addDistanceConstraint(getIdx(x, y, z), getIdx(x + 1, y, z + 1));
            this.addDistanceConstraint(getIdx(x + 1, y, z), getIdx(x, y, z + 1));
          }
        }
      }
    }
  }

  addDistanceConstraint(i, j) {
    const p1 = this.particles[i];
    const p2 = this.particles[j];
    const restLength = p1.restPos.distanceTo(p2.restPos);
    this.distanceConstraints.push({
      p1: i,
      p2: j,
      restLength: restLength,
      lambda: 0.0
    });
  }

  integrate(dt, gravity) {
    if (this.isClamped) return; // Si la pinza traslada la caja, omitir aceleración gravitacional suelta

    this.contactNormalForce = 0.0;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.vel.addScaledVector(gravity, dt);
      p.vel.multiplyScalar(this.damping);
      p.prevPos.copy(p.pos);
      p.pos.addScaledVector(p.vel, dt);
    }
  }

  // Resetea el multiplicador de Lagrange lambda a 0 al inicio de cada paso de tiempo XPBD
  resetDistanceConstraints() {
    for (let c = 0; c < this.distanceConstraints.length; c++) {
      this.distanceConstraints[c].lambda = 0.0;
    }
  }

  solveDistanceConstraints(dt) {
    if (this.isClamped) return;

    const alpha = this.compliance / (dt * dt);
    const dir = new THREE.Vector3();

    for (let c = 0; c < this.distanceConstraints.length; c++) {
      const constraint = this.distanceConstraints[c];
      const p1 = this.particles[constraint.p1];
      const p2 = this.particles[constraint.p2];

      dir.subVectors(p1.pos, p2.pos);
      const len = dir.length();
      if (len < 1e-7) continue;

      const C = len - constraint.restLength;
      const w1 = p1.invMass;
      const w2 = p2.invMass;
      const wSum = w1 + w2;
      if (wSum === 0) continue;

      const deltaLambda = (-C - alpha * constraint.lambda) / (wSum + alpha);
      constraint.lambda += deltaLambda;

      dir.multiplyScalar(1.0 / len);
      p1.pos.addScaledVector(dir, w1 * deltaLambda);
      p2.pos.addScaledVector(dir, -w2 * deltaLambda);
    }
  }

  solveShapeMatching() {
    if (this.isClamped) return;

    this.centerOfMass.set(0, 0, 0);
    let totalMass = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      this.centerOfMass.addScaledVector(p.pos, p.mass);
      totalMass += p.mass;
    }
    this.centerOfMass.divideScalar(totalMass);

    let a00 = 0, a01 = 0, a02 = 0;
    let a10 = 0, a11 = 0, a12 = 0;
    let a20 = 0, a21 = 0, a22 = 0;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const qx = p.pos.x - this.centerOfMass.x;
      const qy = p.pos.y - this.centerOfMass.y;
      const qz = p.pos.z - this.centerOfMass.z;
      const r0x = p.restPos.x;
      const r0y = p.restPos.y;
      const r0z = p.restPos.z;
      const m = p.mass;

      a00 += m * qx * r0x; a01 += m * qx * r0y; a02 += m * qx * r0z;
      a10 += m * qy * r0x; a11 += m * qy * r0y; a12 += m * qy * r0z;
      a20 += m * qz * r0x; a21 += m * qz * r0y; a22 += m * qz * r0z;
    }

    // 1. Matriz de covarianza de deformación A = sum(m * q * r0^T)
    const c0 = new THREE.Vector3(a00, a10, a20);
    const c1 = new THREE.Vector3(a01, a11, a21);

    // Ortonormalización Gram-Schmidt robusta para extraer la rotación pura R
    if (c0.lengthSq() > 1e-8 && c1.lengthSq() > 1e-8) {
      c0.normalize();
      const dot = c0.dot(c1);
      c1.sub(c0.clone().multiplyScalar(dot)).normalize();
      const c2 = new THREE.Vector3().crossVectors(c0, c1).normalize();

      const rotMat = new THREE.Matrix4().makeBasis(c0, c1, c2);
      const quat = new THREE.Quaternion().setFromRotationMatrix(rotMat).normalize();

      if (!isNaN(quat.x) && !isNaN(quat.y) && !isNaN(quat.z) && !isNaN(quat.w) && quat.lengthSq() > 0.5) {
        this.orientation.slerp(quat, 0.45).normalize();
      }
    } else {
      this.orientation.normalize();
    }

    // 2. Proyección de goalPos mediante cuaternión estrictamente normalizado
    const goalPos = new THREE.Vector3();
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      goalPos.copy(p.restPos).applyQuaternion(this.orientation).add(this.centerOfMass);
      p.pos.lerp(goalPos, this.shapeStiffness * 0.4);
    }
  }

  solveCollisions(tables, floorY = 0) {
    if (this.isClamped) return;

    const friction = this.frictionCoeff;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Colisión contra el suelo
      if (p.pos.y - p.radius < floorY) {
        p.pos.y = floorY + p.radius;
        p.vel.y = -p.vel.y * 0.12;
        p.vel.x *= Math.max(0, 1 - friction * 0.5);
        p.vel.z *= Math.max(0, 1 - friction * 0.5);
      }

      // Colisión contra las mesas (superficie superior y contorno volumétrico)
      for (let t = 0; t < tables.length; t++) {
        const table = tables[t];
        const minX = table.x - table.w / 2;
        const maxX = table.x + table.w / 2;
        const minZ = table.z - table.d / 2;
        const maxZ = table.z + table.d / 2;
        const topY = table.topY;

        // Si la partícula está dentro del perímetro horizontal del tablero
        if (p.pos.x >= minX - 0.05 && p.pos.x <= maxX + 0.05 && p.pos.z >= minZ - 0.05 && p.pos.z <= maxZ + 0.05) {
          // Si está penetrando el tablero superior hacia abajo
          if (p.pos.y - p.radius < topY && p.pos.y > topY - 0.40) {
            p.pos.y = topY + p.radius;
            if (p.vel.y < 0) {
              p.vel.y = -p.vel.y * 0.08;
            }
            p.vel.x *= Math.max(0, 1 - friction * 0.6);
            p.vel.z *= Math.max(0, 1 - friction * 0.6);
          }
        }
      }
    }
  }

  interactWithGripperFingers(gripper, dt) {
    if (this.isClamped) return;
    if (!gripper || !gripper.fingerLeftMesh || !gripper.fingerRightMesh) return;
    // Si la pinza está abierta para preparar la sujeción, permitimos que los dedos abracen la caja sin empujarla
    if (gripper.isOpen) return;

    gripper.fingerLeftMesh.updateMatrixWorld(true);
    gripper.fingerRightMesh.updateMatrixWorld(true);
    const fingerLBox = this.tempBoxL.setFromObject(gripper.fingerLeftMesh);
    const fingerRBox = this.tempBoxR.setFromObject(gripper.fingerRightMesh);

    const centerL = fingerLBox.getCenter(new THREE.Vector3());
    const centerR = fingerRBox.getCenter(new THREE.Vector3());
    const pushVec = new THREE.Vector3();

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      if (fingerLBox.containsPoint(p.pos)) {
        const pushDir = new THREE.Vector3().subVectors(p.pos, centerL).normalize();
        p.pos.addScaledVector(pushDir, 0.008);
        pushVec.addScaledVector(pushDir, 0.005);
        p.vel.multiplyScalar(0.7); // Disipar energía parásita
      }

      if (fingerRBox.containsPoint(p.pos)) {
        const pushDir = new THREE.Vector3().subVectors(p.pos, centerR).normalize();
        p.pos.addScaledVector(pushDir, 0.008);
        pushVec.addScaledVector(pushDir, 0.005);
        p.vel.multiplyScalar(0.7); // Disipar energía parásita
      }
    }

    if (pushVec.lengthSq() > 1e-6) {
      this.centerOfMass.add(pushVec);
      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i].pos.add(pushVec);
      }
    }
  }

  interactWithRobotLinks(capsules) {
    if (this.isClamped) return;
    if (!capsules || capsules.length === 0) return;

    const netDisplacement = new THREE.Vector3(0, 0, 0);
    let contactCount = 0;
    const avgVelocity = new THREE.Vector3(0, 0, 0);

    for (let c = 0; c < capsules.length; c++) {
      const cap = capsules[c];
      const capSeg = new THREE.Line3(cap.start, cap.end);
      const closestPoint = new THREE.Vector3();

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        capSeg.closestPointToPoint(p.pos, true, closestPoint);
        const dist = p.pos.distanceTo(closestPoint);
        // Margen de seguridad sólido para eslabones; para los dedos del gripper se usa contacto directo
        const isFingerCap = cap.name && cap.name.startsWith('gripper_finger');
        const safetyMargin = isFingerCap ? 0.002 : 0.015;
        const minDist = cap.radius + p.radius + safetyMargin;

        if (dist < minDist && dist > 1e-6) {
          const normal = new THREE.Vector3().subVectors(p.pos, closestPoint).normalize();
          const penetration = minDist - dist;
          
          // Desplazar partícula fuera de la cápsula
          p.pos.addScaledVector(normal, penetration);

          // Acumular el empuje sobre todo el cuerpo rígido
          netDisplacement.addScaledVector(normal, penetration);
          contactCount++;

          if (cap.velocity && cap.velocity.lengthSq() > 1e-4) {
            avgVelocity.add(cap.velocity);
          } else {
            // Empuje elástico suave proporcional a la penetración física (amortiguado para dedos)
            const pushStiffness = isFingerCap ? 8.0 : 40.0;
            avgVelocity.addScaledVector(normal, penetration * pushStiffness);
          }
        }
      }
    }

    // Si hubo colisión con los eslabones del brazo, desplazar el centro de masa
    // de manera que la caja entera sea empujada y NO sea atravesada
    if (contactCount > 0) {
      const bodyPush = netDisplacement.divideScalar(contactCount);
      // Trasladar el centro de masa del cuerpo
      this.centerOfMass.add(bodyPush);

      // Trasladar todas las partículas para mantener coherencia volumétrica instantánea
      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i].pos.add(bodyPush);
      }

      // Transferir momento/velocidad para que continúe deslizándose de forma realista
      avgVelocity.divideScalar(contactCount);
      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i].vel.addScaledVector(avgVelocity, 0.7);
      }
    }
  }

  updateVelocities(dt) {
    if (this.isClamped) return;

    const invDt = 1.0 / dt;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.vel.subVectors(p.pos, p.prevPos).multiplyScalar(invDt);
    }
  }

  updateVisualMeshSkinning() {
    if (!this.visualMesh) return;

    this.visualMesh.position.copy(this.centerOfMass);
    this.visualMesh.quaternion.copy(this.orientation);
  }

  // Arrastre continuo de las partículas cuando el manipulador traslada la caja
  setKinematicTarget(targetPos, targetQuat, dt) {
    this.isClamped = true;
    this.contactNormalForce = 75.0;

    this.centerOfMass.copy(targetPos);
    this.orientation.copy(targetQuat);

    const goalPos = new THREE.Vector3();
    const invDt = dt > 1e-5 ? 1.0 / dt : 60;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      goalPos.copy(p.restPos).applyQuaternion(this.orientation).add(this.centerOfMass);
      p.prevPos.copy(p.pos);
      p.pos.copy(goalPos);
      p.vel.subVectors(p.pos, p.prevPos).multiplyScalar(invDt);
    }
  }

  reset() {
    this.contactNormalForce = 0.0;
    this.isClamped = false;
    this.initParticles(this.initialWorldPos, this.size);
    this.buildDistanceConstraints();
    this.centerOfMass.copy(this.initialWorldPos);
    this.orientation.identity();
    if (this.visualMesh) {
      this.visualMesh.position.copy(this.initialWorldPos);
      this.visualMesh.quaternion.identity();
    }
  }
}
