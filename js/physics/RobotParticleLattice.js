import * as THREE from 'https://esm.sh/three@0.160.0';

// Genera un entramado volumétrico de partículas y líneas de neón adherido a las piezas del manipulador robótico
export class RobotParticleLattice {
  constructor(scene, robot) {
    this.scene = scene;
    this.robot = robot;
    this.group = new THREE.Group();
    this.group.name = "Robot_Particle_Lattice";
    this.scene.add(this.group);

    this.nodes = []; // { parentGroup, localPos, worldPos }
    this.connections = []; // [nodeA, nodeB]

    this.buildRobotLattice();
    this.initRenderMeshes();
  }

  buildRobotLattice() {
    const { links } = this.robot.config;

    // 1. Partículas en la Base (J1)
    const basePivot = this.robot.joints[0];
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      const r = links.baseRadius * 0.7;
      this.addNode(this.robot.baseGroup, new THREE.Vector3(Math.cos(angle) * r, 0.2, Math.sin(angle) * r));
      this.addNode(this.robot.baseGroup, new THREE.Vector3(Math.cos(angle) * r, links.baseHeight * 0.4, Math.sin(angle) * r));
    }

    // 2. Partículas en el Hombro (J1 columna)
    for (let y = 0.2; y <= links.link1Height; y += 0.25) {
      for (let a = 0; a < 4; a++) {
        const ang = (a / 4) * Math.PI * 2;
        this.addNode(basePivot, new THREE.Vector3(Math.cos(ang) * 0.25, y, Math.sin(ang) * 0.25));
      }
    }

    // 3. Partículas en el Brazo Superior (J2 -> J3)
    const j2 = this.robot.joints[1];
    for (let y = 0.2; y <= links.link2Length; y += 0.3) {
      this.addNode(j2, new THREE.Vector3(-0.12, y, -0.12));
      this.addNode(j2, new THREE.Vector3(0.12, y, -0.12));
      this.addNode(j2, new THREE.Vector3(-0.12, y, 0.12));
      this.addNode(j2, new THREE.Vector3(0.12, y, 0.12));
    }

    // 4. Partículas en el Antebrazo (J3 -> J4)
    const j3 = this.robot.joints[2];
    for (let y = 0.2; y <= links.link3Length; y += 0.3) {
      this.addNode(j3, new THREE.Vector3(-0.10, y, -0.10));
      this.addNode(j3, new THREE.Vector3(0.10, y, -0.10));
      this.addNode(j3, new THREE.Vector3(-0.10, y, 0.10));
      this.addNode(j3, new THREE.Vector3(0.10, y, 0.10));
    }

    // 5. Partículas en la Muñeca (J4, J5)
    const j4 = this.robot.joints[3];
    for (let y = 0.1; y <= links.link4Length; y += 0.15) {
      this.addNode(j4, new THREE.Vector3(-0.08, y, -0.08));
      this.addNode(j4, new THREE.Vector3(0.08, y, 0.08));
    }

    // 6. Partículas en la Pinza (Gripper)
    const j6 = this.robot.joints[5];
    this.addNode(j6, new THREE.Vector3(-0.14, 0.15, 0));
    this.addNode(j6, new THREE.Vector3(0.14, 0.15, 0));
    this.addNode(j6, new THREE.Vector3(-0.08, 0.26, 0));
    this.addNode(j6, new THREE.Vector3(0.08, 0.26, 0));
    this.addNode(j6, new THREE.Vector3(0, 0.28, 0)); // TCP

    // Conectar nodos adyacentes pertenecientes al mismo cuerpo para formar líneas de neón
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        if (this.nodes[i].parentGroup === this.nodes[j].parentGroup) {
          const dist = this.nodes[i].localPos.distanceTo(this.nodes[j].localPos);
          if (dist < 0.35) {
            this.connections.push([this.nodes[i], this.nodes[j]]);
          }
        }
      }
    }
  }

  addNode(parentGroup, localPos) {
    this.nodes.push({
      parentGroup,
      localPos,
      worldPos: new THREE.Vector3()
    });
  }

  initRenderMeshes() {
    // 1. Átomos/Esferas con MeshBasicMaterial brillante autoiluminado
    const sphereGeo = new THREE.SphereGeometry(0.015, 10, 10);
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
      opacity: 0.75,
      linewidth: 2
    });
    this.lines = new THREE.LineSegments(this.lineGeo, lineMat);
    this.lines.frustumCulled = false;
    this.group.add(this.lines);

    this.dummyMatrix = new THREE.Matrix4();
    this.group.visible = false;
  }

  update() {
    if (!this.group.visible) return;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      node.worldPos.copy(node.localPos).applyMatrix4(node.parentGroup.matrixWorld);

      this.dummyMatrix.makeTranslation(node.worldPos.x, node.worldPos.y, node.worldPos.z);
      this.instancedMesh.setMatrixAt(i, this.dummyMatrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;

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
