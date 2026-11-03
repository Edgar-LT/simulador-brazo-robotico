import * as THREE from 'https://esm.sh/three@0.160.0';

export class TrajectoryTrail {
  constructor(scene, maxPoints = 400) {
    this.scene = scene;
    this.maxPoints = maxPoints;
    this.points = [];
    this.enabled = true;

    // Buffer geometry para trazo eficiente sin fugas de memoria
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.maxPoints * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);

    // Material brillante de alta tecnología
    this.material = new THREE.LineBasicMaterial({
      color: 0x00d2ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });

    this.line = new THREE.Line(this.geometry, this.material);
    this.line.name = "TCP_Trajectory_Trail";
    this.scene.add(this.line);

    this.lastX = 9999;
    this.lastY = 9999;
    this.lastZ = 9999;
    this.minDistSq = 0.0004; // 2 cm para registrar nuevo punto
  }

  // Cero asignaciones new THREE.Vector3(): recibe directamente coordenadas o lee de objeto sin clonar
  addPointFromCoords(x, y, z) {
    if (!this.enabled) return;

    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const dz = z - this.lastZ;
    if ((dx * dx + dy * dy + dz * dz) < this.minDistSq) {
      return;
    }

    this.lastX = x;
    this.lastY = y;
    this.lastZ = z;

    // Guardar en array plano
    if (this.points.length >= this.maxPoints * 3) {
      // Desplazar 3 elementos hacia la izquierda
      for (let i = 0; i < (this.maxPoints - 1) * 3; i++) {
        this.positions[i] = this.positions[i + 3];
      }
      const lastIdx = (this.maxPoints - 1) * 3;
      this.positions[lastIdx] = x;
      this.positions[lastIdx + 1] = y;
      this.positions[lastIdx + 2] = z;
    } else {
      const idx = this.points.length;
      this.positions[idx] = x;
      this.positions[idx + 1] = y;
      this.positions[idx + 2] = z;
      this.points.length += 3;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.floor(this.points.length / 3));
  }

  clear() {
    this.points.length = 0;
    this.geometry.setDrawRange(0, 0);
    this.lastX = 9999;
    this.lastY = 9999;
    this.lastZ = 9999;
  }

  setVisible(visible) {
    this.enabled = visible;
    this.line.visible = visible;
  }

  dispose() {
    this.scene.remove(this.line);
    this.geometry.dispose();
    this.material.dispose();
  }
}
