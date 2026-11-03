import * as CANNON from 'https://esm.sh/cannon-es@0.20.0';
import * as THREE from 'https://esm.sh/three@0.160.0';

const _tempWorldPos = new THREE.Vector3();
const _tempWorldQuat = new THREE.Quaternion();

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });

    // Materiales de fricción y contacto físico
    this.defaultMaterial = new CANNON.Material('default');
    this.tableMaterial = new CANNON.Material('table');
    this.boxMaterial = new CANNON.Material('box');

    // Contacto Caja - Mesa (fricción alta para evitar que patinen al ser depositadas)
    const boxTableContact = new CANNON.ContactMaterial(this.boxMaterial, this.tableMaterial, {
      friction: 0.65,
      restitution: 0.05
    });
    this.world.addContactMaterial(boxTableContact);

    // Contacto Caja - Caja
    const boxBoxContact = new CANNON.ContactMaterial(this.boxMaterial, this.boxMaterial, {
      friction: 0.5,
      restitution: 0.05
    });
    this.world.addContactMaterial(boxBoxContact);

    // Suelo infinito
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: this.tableMaterial
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    this.bodies = [];
  }

  addTable(position, width, height, depth) {
    const halfExtents = new CANNON.Vec3(width / 2, height / 2, depth / 2);
    const boxShape = new CANNON.Box(halfExtents);
    const tableBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      position: new CANNON.Vec3(position.x, position.y + height / 2, position.z),
      shape: boxShape,
      material: this.tableMaterial
    });
    this.world.addBody(tableBody);
    return tableBody;
  }

  addBox(mesh, size = 0.15, mass = 1.2) {
    const halfExtents = new CANNON.Vec3(size / 2, size / 2, size / 2);
    const shape = new CANNON.Box(halfExtents);
    const body = new CANNON.Body({
      mass: mass,
      shape: shape,
      material: this.boxMaterial,
      linearDamping: 0.15,
      angularDamping: 0.2
    });
    body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
    body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
    
    this.world.addBody(body);
    this.bodies.push({ mesh, body, initialPos: mesh.position.clone() });
    return body;
  }

  getBodyByMesh(mesh) {
    const item = this.bodies.find(b => b.mesh === mesh);
    return item ? item.body : null;
  }

  step(delta) {
    const fixedTimeStep = 1 / 60;
    this.world.step(fixedTimeStep, Math.min(delta, 0.05), 3);

    // Sincronizar posiciones y rotaciones de Three.js con Cannon.js
    for (let i = 0; i < this.bodies.length; i++) {
      const item = this.bodies[i];
      // Si la caja no está siendo transportada kinemáticamente por la pinza
      if (!item.mesh.userData.isKinematic) {
        item.mesh.position.copy(item.body.position);
        item.mesh.quaternion.copy(item.body.quaternion);
      } else {
        // La caja está anclada a la pinza: sincronizar el cuerpo rígido a la posición MUNDIAL de la caja
        item.mesh.getWorldPosition(_tempWorldPos);
        item.mesh.getWorldQuaternion(_tempWorldQuat);
        item.body.position.set(_tempWorldPos.x, _tempWorldPos.y, _tempWorldPos.z);
        item.body.quaternion.set(_tempWorldQuat.x, _tempWorldQuat.y, _tempWorldQuat.z, _tempWorldQuat.w);
        item.body.velocity.set(0, 0, 0);
        item.body.angularVelocity.set(0, 0, 0);
      }
    }
  }

  resetBox(mesh) {
    const found = this.bodies.find(b => b.mesh === mesh);
    if (found && mesh.userData.initialPos) {
      mesh.userData.isKinematic = false;
      found.body.position.set(mesh.userData.initialPos.x, mesh.userData.initialPos.y, mesh.userData.initialPos.z);
      found.body.quaternion.set(0, 0, 0, 1);
      found.body.velocity.set(0, 0, 0);
      found.body.angularVelocity.set(0, 0, 0);
      mesh.position.copy(mesh.userData.initialPos);
      mesh.rotation.set(0, 0, 0);
    }
  }
}
