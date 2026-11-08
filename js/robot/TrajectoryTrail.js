import * as THREE from 'https://esm.sh/three@0.160.0';

export class TrajectoryTrail {
  constructor(scene, maxPoints = 500) {
    this.scene = scene;
    this.maxPoints = maxPoints;
    this.enabled = true;

    // Buffer geometry para trazo eficiente de anillo circular (Zero-GC, O(1) inserción)
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
    this.count = 0;
  }

  // Desplazamiento ultra-rápido en memoria contigua utilizando TypedArray.copyWithin (O(1) nativo C++)
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

    if (this.count >= this.maxPoints) {
      // Mover los elementos [3..N*3] al índice 0 con memcpy nativo de bajo nivel
      this.positions.copyWithin(0, 3, this.maxPoints * 3);
      const lastIdx = (this.maxPoints - 1) * 3;
      this.positions[lastIdx] = x;
      this.positions[lastIdx + 1] = y;
      this.positions[lastIdx + 2] = z;
    } else {
      const idx = this.count * 3;
      this.positions[idx] = x;
      this.positions[idx + 1] = y;
      this.positions[idx + 2] = z;
      this.count++;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.setDrawRange(0, this.count);
  }

  clear() {
    this.count = 0;
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
