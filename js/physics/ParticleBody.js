import * as THREE from 'https://esm.sh/three@0.160.0';

// Pool de variables estáticas reutilizables para todo ParticleBody (Zero-GC en 480 Hz)
const _dir = new THREE.Vector3();
const _centerL = new THREE.Vector3();
const _centerR = new THREE.Vector3();
const _pushVec = new THREE.Vector3();
const _pushDir = new THREE.Vector3();
const _c0 = new THREE.Vector3();
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
const _rotMat = new THREE.Matrix4();
const _tempQuat = new THREE.Quaternion();
const _goalPos = new THREE.Vector3();
const _netDisplacement = new THREE.Vector3();
const _avgVelocity = new THREE.Vector3();
const _closestPoint = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _bodyPush = new THREE.Vector3();
const _capSeg = new THREE.Line3();

// Implementación de cuerpo volumétrico XPBD (Extended Position Based Dynamics) de alto rendimiento
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
    if (this.isClamped) return;

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

    for (let c = 0; c < this.distanceConstraints.length; c++) {
      const constraint = this.distanceConstraints[c];
      const p1 = this.particles[constraint.p1];
      const p2 = this.particles[constraint.p2];

      _dir.subVectors(p1.pos, p2.pos);
      const lenSq = _dir.lengthSq();
      if (lenSq < 1e-12) continue;

      const len = Math.sqrt(lenSq);
      const C = len - constraint.restLength;
      const w1 = p1.invMass;
      const w2 = p2.invMass;
      const wSum = w1 + w2;
      if (wSum === 0) continue;

      const deltaLambda = (-C - alpha * constraint.lambda) / (wSum + alpha);
      constraint.lambda += deltaLambda;

      _dir.multiplyScalar(deltaLambda / len);
      p1.pos.addScaledVector(_dir, w1);
      p2.pos.addScaledVector(_dir, -w2);
    }
  }

  solveShapeMatching() {
    if (this.isClamped) return;

    this.centerOfMass.set(0, 0, 0);
    let totalMass = 0;
    const n = this.particles.length;

    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      this.centerOfMass.addScaledVector(p.pos, p.mass);
      totalMass += p.mass;
    }
    this.centerOfMass.divideScalar(totalMass);

    let a00 = 0, a01 = 0, a02 = 0;
    let a10 = 0, a11 = 0, a12 = 0;
    let a20 = 0, a21 = 0, a22 = 0;

    for (let i = 0; i < n; i++) {
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

    _c0.set(a00, a10, a20);
    _c1.set(a01, a11, a21);

    const lenC0Sq = _c0.lengthSq();
    const lenC1Sq = _c1.lengthSq();

    // Ortonormalización Gram-Schmidt con salvaguarda robusta contra colinealidad/aplastamiento
    if (lenC0Sq > 1e-7 && lenC1Sq > 1e-7) {
      _c0.multiplyScalar(1.0 / Math.sqrt(lenC0Sq));
      const dot = _c0.dot(_c1);
      _c1.addScaledVector(_c0, -dot);
      const lenC1OrthSq = _c1.lengthSq();

      if (lenC1OrthSq > 1e-7) {
        _c1.multiplyScalar(1.0 / Math.sqrt(lenC1OrthSq));
        _c2.crossVectors(_c0, _c1).normalize();

        _rotMat.makeBasis(_c0, _c1, _c2);
        _tempQuat.setFromRotationMatrix(_rotMat);

        if (Number.isFinite(_tempQuat.x) && _tempQuat.lengthSq() > 0.5) {
          _tempQuat.normalize();
          this.orientation.slerp(_tempQuat, 0.45).normalize();
        }
      }
    } else {
      this.orientation.normalize();
    }

    // Proyección elástica hacia la forma de reposo
    const stiffness = this.shapeStiffness * 0.4;
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      _goalPos.copy(p.restPos).applyQuaternion(this.orientation).add(this.centerOfMass);
      p.pos.lerp(_goalPos, stiffness);
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

      // Colisión contra las mesas
      for (let t = 0; t < tables.length; t++) {
        const table = tables[t];
        const minX = table.x - table.w / 2;
        const maxX = table.x + table.w / 2;
        const minZ = table.z - table.d / 2;
        const maxZ = table.z + table.d / 2;
        const topY = table.topY;

        if (p.pos.x >= minX - 0.05 && p.pos.x <= maxX + 0.05 && p.pos.z >= minZ - 0.05 && p.pos.z <= maxZ + 0.05) {
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
    if (gripper.isOpen) return;

    gripper.fingerLeftMesh.updateMatrixWorld(true);
    gripper.fingerRightMesh.updateMatrixWorld(true);
    const fingerLBox = this.tempBoxL.setFromObject(gripper.fingerLeftMesh);
    const fingerRBox = this.tempBoxR.setFromObject(gripper.fingerRightMesh);

    fingerLBox.getCenter(_centerL);
    fingerRBox.getCenter(_centerR);
    _pushVec.set(0, 0, 0);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      if (fingerLBox.containsPoint(p.pos)) {
        _pushDir.subVectors(p.pos, _centerL).normalize();
        p.pos.addScaledVector(_pushDir, 0.008);
        _pushVec.addScaledVector(_pushDir, 0.005);
        p.vel.multiplyScalar(0.7);
      }

      if (fingerRBox.containsPoint(p.pos)) {
        _pushDir.subVectors(p.pos, _centerR).normalize();
        p.pos.addScaledVector(_pushDir, 0.008);
        _pushVec.addScaledVector(_pushDir, 0.005);
        p.vel.multiplyScalar(0.7);
      }
    }

    if (_pushVec.lengthSq() > 1e-6) {
      this.centerOfMass.add(_pushVec);
      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i].pos.add(_pushVec);
      }
    }
  }

  interactWithRobotLinks(capsules) {
    if (this.isClamped) return;
    if (!capsules || capsules.length === 0) return;

    _netDisplacement.set(0, 0, 0);
    _avgVelocity.set(0, 0, 0);
    let contactCount = 0;

    for (let c = 0; c < capsules.length; c++) {
      const cap = capsules[c];
      _capSeg.set(cap.start, cap.end);

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        _capSeg.closestPointToPoint(p.pos, true, _closestPoint);
        const distSq = p.pos.distanceToSquared(_closestPoint);
        
        const isFingerCap = cap.name && cap.name.startsWith('gripper_finger');
        const safetyMargin = isFingerCap ? 0.002 : 0.015;
        const minDist = cap.radius + p.radius + safetyMargin;
        const minDistSq = minDist * minDist;

        if (distSq < minDistSq && distSq > 1e-12) {
          const dist = Math.sqrt(distSq);
          _normal.subVectors(p.pos, _closestPoint).multiplyScalar(1.0 / dist);
          const penetration = minDist - dist;
          
          p.pos.addScaledVector(_normal, penetration);
          _netDisplacement.addScaledVector(_normal, penetration);
          contactCount++;

          if (cap.velocity && cap.velocity.lengthSq() > 1e-4) {
            _avgVelocity.add(cap.velocity);
          } else {
            const pushStiffness = isFingerCap ? 8.0 : 40.0;
            _avgVelocity.addScaledVector(_normal, penetration * pushStiffness);
          }
        }
      }
    }

    if (contactCount > 0) {
      _bodyPush.copy(_netDisplacement).multiplyScalar(1.0 / contactCount);
      this.centerOfMass.add(_bodyPush);

      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i].pos.add(_bodyPush);
      }

      _avgVelocity.multiplyScalar(0.7 / contactCount);
      for (let i = 0; i < this.particles.length; i++) {
        this.particles[i].vel.add(_avgVelocity);
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

  setKinematicTarget(targetPos, targetQuat, dt) {
    this.isClamped = true;
    this.contactNormalForce = 75.0;

    this.centerOfMass.copy(targetPos);
    this.orientation.copy(targetQuat);

    const invDt = dt > 1e-5 ? 1.0 / dt : 60;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      _goalPos.copy(p.restPos).applyQuaternion(this.orientation).add(this.centerOfMass);
      p.prevPos.copy(p.pos);
      p.pos.copy(_goalPos);
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
