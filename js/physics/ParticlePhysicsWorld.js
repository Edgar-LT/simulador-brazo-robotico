import * as THREE from 'https://esm.sh/three@0.160.0';
import { ParticleBody } from './ParticleBody.js';
import { ParticleLatticeVisualizer } from './ParticleLatticeVisualizer.js';

// Administrador de Simulación Física XPBD con Sub-stepping (Blender / Bullet style)
export class ParticlePhysicsWorld {
  constructor(scene) {
    this.scene = scene;
    this.bodies = [];
    this.gravity = new THREE.Vector3(0, -9.82, 0);
    this.tables = [];
    this.robotCapsules = []; // Cápsulas de colisión de los eslabones del brazo robótico
    this.showParticleLattice = false;
    this.physicsAccumulator = 0;
    this.fixedDt = 1 / 60; // 60 Hz física base determinista
    this.substeps = 8; // 8 sub-pasos XPBD por cada paso de 1/60s (480 Hz)

    // Visualizador de nodos con líneas conectadas
    this.latticeVisualizer = new ParticleLatticeVisualizer(this.scene, {
      color: 0x00f0ff,
      lineColor: 0x00d2ff,
      particleRadius: 0.016, // Tamaño más visible para los átomos de las cajas
      lineOpacity: 0.85
    });
  }

  addTableCollider(x, y, z, w, h, d, group = null) {
    const entry = {
      x, y, z, w, h, d,
      topY: y + h,
      group: group,
      velocity: new THREE.Vector3(0, 0, 0),
      initialPos: new THREE.Vector3(x, y, z)
    };
    this.tables.push(entry);
    return entry;
  }

  setRobotCapsules(capsules) {
    this.robotCapsules = capsules || [];
  }

  createParticleBox(pos, size = 0.15, config = {}) {
    const pBody = new ParticleBody(pos, size, config);
    this.bodies.push(pBody);
    pBody.updateVisualMeshSkinning();
    if (this.showParticleLattice && this.latticeVisualizer) {
      this.latticeVisualizer.updateFromParticleBodies(this.bodies);
    }
    return pBody;
  }

  step(delta, gripper = null) {
    // Acotar delta para evitar la "espiral de la muerte" tras suspensión de pestaña o frame drops severos
    const clampedDelta = Math.min(Math.max(0.001, delta), 0.1);
    this.physicsAccumulator += clampedDelta;

    const subDt = this.fixedDt / this.substeps;
    let stepped = false;

    // Consumir el acumulador en pasos fijos de 1/60s (máximo 3 pasos por frame para proteger el presupuesto de tiempo)
    let stepsProcessed = 0;
    while (this.physicsAccumulator >= this.fixedDt && stepsProcessed < 3) {
      this.stepSubsteps(subDt, this.substeps, gripper);
      this.physicsAccumulator -= this.fixedDt;
      stepsProcessed++;
      stepped = true;
    }

    // Si aún queda residuo grande tras el límite de pasos, descartar exceso para no desfasar
    if (this.physicsAccumulator > this.fixedDt) {
      this.physicsAccumulator = 0;
    }

    // Actualización de la representación visual y deformación (una sola vez por render frame)
    if (stepped || delta > 0) {
      this.updateRenderRepresentation();
    }
  }

  stepSubsteps(dt, substeps, gripper) {
    for (let s = 0; s < substeps; s++) {
      for (let b = 0; b < this.bodies.length; b++) {
        const body = this.bodies[b];
        
        // 1. Integración temporal de Verlet
        body.integrate(dt, this.gravity);

        // 2. Restricciones internas elásticas XPBD con reseteo de lambda
        body.resetDistanceConstraints();
        body.solveDistanceConstraints(dt);

        // 3. Shape Matching elástico
        body.solveShapeMatching();

        // 4. Colisiones con el entorno estático (mesas y suelo)
        body.solveCollisions(this.tables, 0);

        // 5. Colisiones cinemáticas con los eslabones móviles del robot
        if (this.robotCapsules.length > 0) {
          body.interactWithRobotLinks(this.robotCapsules);
        }

        // 6. Contacto, fricción de Coulomb y compresión de los dedos de la pinza
        if (gripper) {
          body.interactWithGripperFingers(gripper, dt);
        }

        // 7. Actualización de velocidades según Verlet
        body.updateVelocities(dt);
      }

      // 8. Colisión física y empuje del robot hacia las mesas de trabajo
      this.solveTableRobotInteractions(dt);
    }
  }

  updateRenderRepresentation() {
    for (let b = 0; b < this.bodies.length; b++) {
      const body = this.bodies[b];
      // Aplicar skinning trilineal dinámico sobre la malla cúbica visual
      body.updateVisualMeshSkinning();
    }

    // Actualizar nodos y líneas del lattice
    if (this.showParticleLattice && this.latticeVisualizer) {
      this.latticeVisualizer.updateFromParticleBodies(this.bodies);
    }
  }

  solveTableRobotInteractions(dt) {
    if (!this.robotCapsules || this.robotCapsules.length === 0) return;

    for (let t = 0; t < this.tables.length; t++) {
      const table = this.tables[t];
      if (!table.group) continue;

      const halfW = table.w / 2;
      const halfD = table.d / 2;

      // Desplazamiento por fricción / amortiguamiento lineal
      table.velocity.multiplyScalar(0.92);

      // Comprobar colisión entre cada cápsula del robot y el prisma rectangular de la mesa
      // Solo consideramos los eslabones principales del brazo (cápsulas 0 a 3),
      // no la herramienta/pinza en el extremo final para permitir apoyar las cajas sobre la mesa sin desplazarla.
      const maxCapsuleIdx = Math.min(this.robotCapsules.length - 1, 3);
      for (let c = 0; c < maxCapsuleIdx; c++) {
        const cap = this.robotCapsules[c];
        const pA = cap.start || cap.pA;
        const pB = cap.end || cap.pB;
        if (!pA || !pB) continue;
        const radius = cap.radius || 0.12;

        // Comprobación de alta resolución a lo largo del segmento de la cápsula (antitumeling)
        const steps = 7;
        for (let s = 0; s <= steps; s++) {
          const alpha = s / steps;
          const px = pA.x + (pB.x - pA.x) * alpha;
          const py = pA.y + (pB.y - pA.y) * alpha;
          const pz = pA.z + (pB.z - pA.z) * alpha;

          // Si el punto está a la altura del tablero o patas de la mesa
          if (py >= table.y && py <= table.topY) {
            const minX = table.x - halfW - radius;
            const maxX = table.x + halfW + radius;
            const minZ = table.z - halfD - radius;
            const maxZ = table.z + halfD + radius;

            if (px >= minX && px <= maxX && pz >= minZ && pz <= maxZ) {
              // Calcular penetración y vector de empuje horizontal
              const dx = px - table.x;
              const dz = pz - table.z;
              const len = Math.sqrt(dx * dx + dz * dz) || 0.001;
              const pushForce = 0.08 * (1.0 + (cap.velocity ? cap.velocity.length() : 0));
              
              table.velocity.x -= (dx / len) * pushForce;
              table.velocity.z -= (dz / len) * pushForce;
            }
          }
        }
      }

      // Aplicar velocidad al grupo de la mesa y sincronizar coordenadas del colisionador
      if (table.velocity.lengthSq() > 1e-6) {
        table.group.position.x += table.velocity.x * dt;
        table.group.position.z += table.velocity.z * dt;
        table.x = table.group.position.x;
        table.z = table.group.position.z;
      }
    }
  }

  setParticleLatticeVisible(visible) {
    this.showParticleLattice = visible;
    if (this.latticeVisualizer) {
      this.latticeVisualizer.setVisible(visible);
      if (visible) {
        this.latticeVisualizer.updateFromParticleBodies(this.bodies);
      }
    }
  }

  setMaterialPresetAll(preset) {
    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i].applyMaterialPreset(preset);
    }
  }

  // Obtener la fuerza normal máxima de sujeción entre los cuerpos
  getMaxContactForce() {
    let maxF = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      if (this.bodies[i].contactNormalForce > maxF) {
        maxF = this.bodies[i].contactNormalForce;
      }
    }
    return maxF;
  }

  resetAll() {
    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i].reset();
    }
  }

  dispose() {
    if (this.latticeVisualizer) {
      this.latticeVisualizer.dispose();
    }
  }
}
