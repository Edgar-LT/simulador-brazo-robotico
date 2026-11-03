import * as THREE from 'https://esm.sh/three@0.160.0';

export class WorkObjects {
  constructor(scene, physicsWorld = null, particleWorld = null) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.particleWorld = particleWorld;
    this.tables = [];
    this.tableData = []; // Metadatos para TableParticleLattice: { group, width, height, depth, position }
    this.boxes = [];
    this.slotsA = []; // Posiciones mesa origen
    this.slotsB = []; // Posiciones mesa destino
    this.materials = {
      tableTop: new THREE.MeshStandardMaterial({
        color: 0x222c3a,
        metalness: 0.7,
        roughness: 0.35,
        transparent: true,
        opacity: 0.85
      }),
      tableLeg: new THREE.MeshStandardMaterial({
        color: 0x161c24,
        metalness: 0.8,
        roughness: 0.3,
        transparent: true,
        opacity: 0.85
      })
    };
    this.buildWorkcell();
  }

  buildWorkcell() {
    // Mesas ampliadas y optimizadas dentro del radio de alcance del manipulador
    const tableWidth = 1.4;
    const tableHeight = 0.85;
    const tableDepth = 1.5;

    // Mesa de Origen (Zona A) a la izquierda
    const posA = new THREE.Vector3(-1.55, 0, 0.50);
    const sourceTable = this.createTable(tableWidth, tableHeight, tableDepth, posA, this.materials.tableTop, this.materials.tableLeg);
    this.tables.push(sourceTable);
    this.tableData.push({ group: sourceTable, width: tableWidth, height: tableHeight, depth: tableDepth, position: posA });

    if (this.physicsWorld) {
      this.physicsWorld.addTable(posA, tableWidth, tableHeight, tableDepth);
    }
    if (this.particleWorld) {
      const colliderA = this.particleWorld.addTableCollider(posA.x, posA.y, posA.z, tableWidth, tableHeight, tableDepth, sourceTable);
      sourceTable.userData.collider = colliderA;
    }

    // Mesa de Destino (Zona B) a la derecha
    const posB = new THREE.Vector3(1.55, 0, 0.50);
    const targetTable = this.createTable(tableWidth, tableHeight, tableDepth, posB, this.materials.tableTop, this.materials.tableLeg);
    this.tables.push(targetTable);
    this.tableData.push({ group: targetTable, width: tableWidth, height: tableHeight, depth: tableDepth, position: posB });

    if (this.physicsWorld) {
      this.physicsWorld.addTable(posB, tableWidth, tableHeight, tableDepth);
    }
    if (this.particleWorld) {
      const colliderB = this.particleWorld.addTableCollider(posB.x, posB.y, posB.z, tableWidth, tableHeight, tableDepth, targetTable);
      targetTable.userData.collider = colliderB;
    }

    // Definición de las 3 ranuras (Slots) sobre cada mesa con holgura amplia (35 cm de separación)
    const tableTopY = tableHeight + 0.01;
    const slotOffsetsZ = [-0.35, 0.0, 0.35];

    // Ranuras Mesa A
    slotOffsetsZ.forEach((zOff, i) => {
      const slotPos = new THREE.Vector3(-1.55, tableTopY, 0.50 + zOff);
      this.slotsA.push(slotPos);
      this.createSlotMarker(slotPos, 0x00d2ff, `A${i + 1}`);
    });

    // Ranuras Mesa B
    slotOffsetsZ.forEach((zOff, i) => {
      const slotPos = new THREE.Vector3(1.55, tableTopY, 0.50 + zOff);
      this.slotsB.push(slotPos);
      this.createSlotMarker(slotPos, 0x00ff88, `B${i + 1}`);
    });

    // Crear las cajas físicas iniciales y cajas adicionales en espera
    this.createPhysicsBoxes(tableTopY);
  }

  createTable(width, height, depth, position, topMat, legMat) {
    const group = new THREE.Group();
    group.position.set(position.x, 0, position.z);

    // Tablero
    const topGeo = new THREE.BoxGeometry(width, 0.08, depth);
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.y = height - 0.04;
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    group.add(topMesh);

    // Patas
    const legGeo = new THREE.BoxGeometry(0.08, height - 0.08, 0.08);
    const legOffsetW = width / 2 - 0.1;
    const legOffsetD = depth / 2 - 0.1;
    const legY = (height - 0.08) / 2;

    const legPositions = [
      [-legOffsetW, legY, -legOffsetD],
      [legOffsetW, legY, -legOffsetD],
      [-legOffsetW, legY, legOffsetD],
      [legOffsetW, legY, legOffsetD]
    ];

    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(...pos);
      leg.castShadow = true;
      group.add(leg);
    });

    this.scene.add(group);
    return group;
  }

  createSlotMarker(pos, colorHex, labelText) {
    const ringGeo = new THREE.RingGeometry(0.10, 0.12, 28);
    const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.002, pos.z);
    this.scene.add(ring);
  }

  createPhysicsBoxes(tableTopY) {
    // 3 cajas de trabajo en los slots A1, A2, A3
    const boxConfigs = [
      { id: "box_0", name: "Caja #1 (Rojo)", color: 0xff4757, mass: 1.2, x: this.slotsA[0].x, z: this.slotsA[0].z },
      { id: "box_1", name: "Caja #2 (Verde)", color: 0x2ed573, mass: 1.0, x: this.slotsA[1].x, z: this.slotsA[1].z },
      { id: "box_2", name: "Caja #3 (Naranja)", color: 0xffa502, mass: 1.4, x: this.slotsA[2].x, z: this.slotsA[2].z }
    ];

    const boxSize = 0.15;
    boxConfigs.forEach((cfg) => {
      const boxGeo = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
      const boxMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.35,
        metalness: 0.25,
        transparent: true,
        opacity: 0.85, // Perfecta visibilidad y presencia sólida en la celda
        wireframe: false
      });

      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(cfg.x, tableTopY + boxSize / 2 + 0.005, cfg.z);
      boxMesh.castShadow = true;
      boxMesh.receiveShadow = true;

      boxMesh.userData = {
        id: cfg.id,
        name: cfg.name,
        color: cfg.color,
        mass: cfg.mass,
        size: boxSize,
        initialPos: boxMesh.position.clone(),
        isKinematic: false
      };

      this.scene.add(boxMesh);
      this.boxes.push(boxMesh);

      if (this.physicsWorld) {
        this.physicsWorld.addBox(boxMesh, boxSize, cfg.mass);
      }

      // Conectar con el motor físico XPBD
      if (this.particleWorld) {
        const pBody = this.particleWorld.createParticleBox(boxMesh.position, boxSize, {
          color: cfg.color,
          name: cfg.name,
          id: cfg.id,
          stiffness: 0.85
        });
        pBody.visualMesh = boxMesh;
        boxMesh.userData.particleBody = pBody;
      }
    });
  }

  setTablesTransparency(enable) {
    this.materials.tableTop.opacity = enable ? 0.70 : 1.0;
    this.materials.tableLeg.opacity = enable ? 0.70 : 1.0;
    this.materials.tableTop.needsUpdate = true;
    this.materials.tableLeg.needsUpdate = true;
  }

  resetAllBoxes() {
    this.boxes.forEach(box => {
      if (box.userData.particleBody) {
        box.userData.particleBody.reset();
      }
      if (this.physicsWorld) {
        this.physicsWorld.resetBox(box);
      }
    });
  }

  getActiveBox(index = 0) {
    return this.boxes[index] || null;
  }

  dispose() {
    [...this.tables, ...this.boxes].forEach(obj => {
      obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      this.scene.remove(obj);
    });
  }
}
