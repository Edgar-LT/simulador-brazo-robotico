import * as THREE from 'https://esm.sh/three@0.160.0';

// Genera un entramado volumétrico de partículas y líneas de neón alineado en coordenadas de mundo sobre las mesas
export class TableParticleLattice {
  constructor(scene, tables) {
    this.scene = scene;
    this.tables = tables; // [{ group, width, height, depth, position }]
    this.group = new THREE.Group();
    this.group.name = "Table_Particle_Lattice";
    this.scene.add(this.group);

    this.nodes = [];
    this.connections = [];

    this.buildTableLattice();
    this.initRenderMeshes();
  }

  buildTableLattice() {
    this.tables.forEach(table => {
      const { group, width, height, depth, position } = table;
      const hw = width / 2;
      const hd = depth / 2;
      const topY = height;

      // 1. Rejilla de nodos sobre el tablero de la mesa (5 x 4 cuadrícula) en espacio local del grupo
      const startIdx = this.nodes.length;
      const stepsX = 5;
      const stepsZ = 4;

      for (let ix = 0; ix < stepsX; ix++) {
        for (let iz = 0; iz < stepsZ; iz++) {
          const lx = -hw + (ix / (stepsX - 1)) * width;
          const lz = -hd + (iz / (stepsZ - 1)) * depth;

          // Capa superior del tablero
          this.addNode(group, new THREE.Vector3(lx, topY, lz));
          // Capa inferior del tablero
          this.addNode(group, new THREE.Vector3(lx, topY - 0.08, lz));
        }
      }

      // 2. Nodos a lo largo de las 4 patas
      const legOffsetW = width / 2 - 0.1;
      const legOffsetD = depth / 2 - 0.1;
      const legXs = [-legOffsetW, legOffsetW];
      const legZs = [-legOffsetD, legOffsetD];

      legXs.forEach(lx => {
        legZs.forEach(lz => {
          for (let y = 0.05; y < topY - 0.08; y += 0.20) {
            this.addNode(group, new THREE.Vector3(lx, y, lz));
          }
        });
      });

      // 3. Conexiones entre nodos de la mesa
      for (let i = startIdx; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const dist = this.nodes[i].localPos.distanceTo(this.nodes[j].localPos);
          if (dist > 0.01 && dist < 0.42) {
            this.connections.push([this.nodes[i], this.nodes[j]]);
          }
        }
      }
    });
  }

  addNode(group, localPos) {
    this.nodes.push({
      group,
      localPos: localPos.clone(),
      worldPos: new THREE.Vector3()
    });
  }

  initRenderMeshes() {
    // 1. Átomos/Esferas con MeshBasicMaterial cian brillante
    const sphereGeo = new THREE.SphereGeometry(0.013, 10, 10);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff
    });
    this.instancedMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, this.nodes.length);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instancedMesh.frustumCulled = false;
    this.group.add(this.instancedMesh);

    // 2. Líneas de enlace
    this.lineGeo = new THREE.BufferGeometry();
    this.linePositions = new Float32Array(this.connections.length * 2 * 3);
    const posAttr = new THREE.BufferAttribute(this.linePositions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.lineGeo.setAttribute('position', posAttr);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.70,
      linewidth: 2
    });
    this.lines = new THREE.LineSegments(this.lineGeo, lineMat);
    this.lines.frustumCulled = false;
    this.group.add(this.lines);

    this.dummyMatrix = new THREE.Matrix4();
    this.group.visible = true;

    this.update();
  }

  update() {
    if (!this.group.visible) return;

    // Actualizar coordenadas mundiales de los átomos siguiendo la posición de cada mesa
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      node.group.localToWorld(node.worldPos.copy(node.localPos));
      this.dummyMatrix.makeTranslation(node.worldPos.x, node.worldPos.y, node.worldPos.z);
      this.instancedMesh.setMatrixAt(i, this.dummyMatrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    // Actualizar líneas de enlace
    for (let c = 0; c < this.connections.length; c++) {
      const [nodeA, nodeB] = this.connections[c];
      const offset = c * 6;
      this.linePositions[offset] = nodeA.worldPos.x;
      this.linePositions[offset + 1] = nodeA.worldPos.y;
      this.linePositions[offset + 2] = nodeA.worldPos.z;
      this.linePositions[offset + 3] = nodeB.worldPos.x;
      this.linePositions[offset + 4] = nodeB.worldPos.y;
      this.linePositions[offset + 5] = nodeB.worldPos.z;
    }
    this.lineGeo.attributes.position.needsUpdate = true;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
