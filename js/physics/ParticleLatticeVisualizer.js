import * as THREE from 'https://esm.sh/three@0.160.0';

// Genera y renderiza una red de partículas y líneas de neón interconectadas (Lattice) para cualquier objeto o eslabón
export class ParticleLatticeVisualizer {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.color = options.color || 0x00f0ff;
    this.lineColor = options.lineColor || 0x00d2ff;
    this.particleRadius = options.particleRadius || 0.015;
    this.lineOpacity = options.lineOpacity || 0.75;

    this.group = new THREE.Group();
    this.group.name = options.name || "ParticleLattice";
    this.scene.add(this.group);

    // 1. InstancedMesh para las esferas/átomos
    const sphereGeo = new THREE.SphereGeometry(this.particleRadius, 10, 10);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: this.color
    });
    this.maxInstances = options.maxInstances || 600;
    this.instancedMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, this.maxInstances);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.frustumCulled = false; // Evita que Three.js lo descarte al enfocar a los lados
    this.group.add(this.instancedMesh);

    // 2. Líneas conectando los nodos (Lattice Wireframe)
    this.maxLineSegments = options.maxLineSegments || 1200;
    this.lineGeo = new THREE.BufferGeometry();
    this.linePositions = new Float32Array(this.maxLineSegments * 2 * 3);
    const posAttr = new THREE.BufferAttribute(this.linePositions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.lineGeo.setAttribute('position', posAttr);
    this.lineGeo.setDrawRange(0, 0);

    const lineMat = new THREE.LineBasicMaterial({
      color: this.lineColor,
      transparent: true,
      opacity: this.lineOpacity,
      linewidth: 2
    });
    this.lines = new THREE.LineSegments(this.lineGeo, lineMat);
    this.lines.frustumCulled = false; // Evita descarte en frustum
    this.group.add(this.lines);

    this.dummyMatrix = new THREE.Matrix4();
    this.group.visible = false; // Controlado por el checkbox
  }

  // Actualiza la posición de las partículas y las líneas que las conectan
  updateFromParticleBodies(bodies) {
    if (!this.group.visible) return;

    let pIdx = 0;
    let lineIdx = 0;

    for (let b = 0; b < bodies.length; b++) {
      const body = bodies[b];
      const particles = body.particles;

      // 1. Matriz de esferas
      for (let i = 0; i < particles.length; i++) {
        if (pIdx >= this.maxInstances) break;
        const p = particles[i];
        this.dummyMatrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
        this.instancedMesh.setMatrixAt(pIdx, this.dummyMatrix);
        pIdx++;
      }

      // 2. Conectar partículas adyacentes del cubo 3x3x3
      for (let x = 0; x < 3; x++) {
        for (let y = 0; y < 3; y++) {
          for (let z = 0; z < 3; z++) {
            const idx1 = x * 9 + y * 3 + z;
            const p1 = particles[idx1].pos;

            // Vecino en X
            if (x < 2 && lineIdx < this.maxLineSegments * 6) {
              const idx2 = (x + 1) * 9 + y * 3 + z;
              const p2 = particles[idx2].pos;
              this.addLineSegment(lineIdx, p1, p2);
              lineIdx += 6;
            }
            // Vecino en Y
            if (y < 2 && lineIdx < this.maxLineSegments * 6) {
              const idx2 = x * 9 + (y + 1) * 3 + z;
              const p2 = particles[idx2].pos;
              this.addLineSegment(lineIdx, p1, p2);
              lineIdx += 6;
            }
            // Vecino en Z
            if (z < 2 && lineIdx < this.maxLineSegments * 6) {
              const idx2 = x * 9 + y * 3 + (z + 1);
              const p2 = particles[idx2].pos;
              this.addLineSegment(lineIdx, p1, p2);
              lineIdx += 6;
            }
          }
        }
      }
    }

    this.instancedMesh.count = pIdx;
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineGeo.setDrawRange(0, lineIdx / 3);
  }

  addLineSegment(offset, p1, p2) {
    this.linePositions[offset] = p1.x;
    this.linePositions[offset + 1] = p1.y;
    this.linePositions[offset + 2] = p1.z;
    this.linePositions[offset + 3] = p2.x;
    this.linePositions[offset + 4] = p2.y;
    this.linePositions[offset + 5] = p2.z;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
