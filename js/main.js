import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/TransformControls.js';
import { SceneSetup } from './environment/SceneSetup.js?v=3.5';
import { RobotArm } from './robot/RobotArm.js?v=3.5';
import { WorkObjects } from './environment/WorkObjects.js?v=3.5';
import { TelemetryChart } from './ui/TelemetryChart.js?v=3.5';
import { SequenceEditor } from './ui/SequenceEditor.js?v=3.5';
import { ControlsHUD } from './ui/ControlsHUD.js?v=4.2';
import { TrajectoryTrail } from './robot/TrajectoryTrail.js?v=3.5';
import { PhysicsWorld } from './physics/PhysicsWorld.js?v=3.5';
import { ParticlePhysicsWorld } from './physics/ParticlePhysicsWorld.js?v=3.5';
import { RobotParticleLattice } from './physics/RobotParticleLattice.js?v=3.5';
import { TableParticleLattice } from './physics/TableParticleLattice.js?v=3.5';

class RoboTwinApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.sceneSetup = new SceneSetup(this.container);
    this.scene = this.sceneSetup.scene;
    this.camera = this.sceneSetup.camera;
    this.renderer = this.sceneSetup.renderer;

    this.clock = new THREE.Clock();
    this.tempTcpVec = new THREE.Vector3();

    // Controles orbitales de la cámara
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 25;
    this.controls.target.set(0, 1.2, 0);

    // Inicializar Motor de Físicas Rígidas y Motor de Partículas XPBD
    this.physicsWorld = new PhysicsWorld();
    this.particleWorld = new ParticlePhysicsWorld(this.scene);

    // Instanciar Entidades
    this.robot = new RobotArm(this.scene, this.physicsWorld);
    this.scene.add(this.robot.group);

    // Entramado de partículas del brazo robótico
    this.robotLattice = new RobotParticleLattice(this.scene, this.robot);

    // Mesas de trabajo y cajas
    this.workObjects = new WorkObjects(this.scene, null, this.particleWorld);

    // Entramado de partículas y átomos de las mesas de trabajo
    this.tableLattice = new TableParticleLattice(this.scene, this.workObjects.tableData);

    // Trazador 3D de Trayectoria del TCP
    this.trajectoryTrail = new TrajectoryTrail(this.scene);

    // Gizmo visual para objetivo IK
    this.buildTargetGizmo();

    // UI y Telemetría
    this.telemetryChart = new TelemetryChart('telemetry-canvas');
    this.sequenceEditor = new SequenceEditor(this.robot, this.workObjects);
    this.hud = new ControlsHUD(this.robot, this.sequenceEditor, this.telemetryChart, this.targetGizmo, this.trajectoryTrail, this);

    // Inicializar visualización física (nodos XPBD apagados por defecto para una vista limpia)
    this.particleWorld.setParticleLatticeVisible(false);
    this.robotLattice.setVisible(false);
    this.tableLattice.setVisible(false);
    this.robot.setLatticeTransparency(false);
    this.workObjects.setTablesTransparency(false);

    // Sincronizar posición inicial en sliders
    this.hud.syncSlidersWithRobot();

    // Eventos de ventana
    window.addEventListener('resize', () => this.sceneSetup.onResize());

    // Iniciar ciclo de animación
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  buildTargetGizmo() {
    this.targetGizmo = new THREE.Group();
    this.targetGizmo.name = "IK_Target_Gizmo";

    const sphereGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    this.targetGizmo.add(sphere);

    const axesHelper = new THREE.AxesHelper(0.3);
    this.targetGizmo.add(axesHelper);

    this.targetGizmo.position.set(0, 1.8, 1.6);
    this.targetGizmo.visible = false;
    this.scene.add(this.targetGizmo);

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.size = 0.75;
    this.transformControls.attach(this.targetGizmo);
    this.transformControls.visible = false;
    this.transformControls.enabled = false;
    this.scene.add(this.transformControls);

    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
    });

    this.transformControls.addEventListener('change', () => {
      if (this.hud && this.hud.mode === 'ik' && this.transformControls.enabled) {
        if (this.targetGizmo.position.y < 0.15) {
          this.targetGizmo.position.y = 0.15;
        }

        this.robot.kinematics.solveIK(this.targetGizmo.position);
        this.hud.syncIKSlidersWithTarget(this.targetGizmo.position);
        this.hud.syncSlidersWithRobot();
      }
    });
  }

  setCameraPreset(preset) {
    const target = new THREE.Vector3(0, 1.2, 0);
    this.controls.target.copy(target);

    switch (preset) {
      case 'iso':
        this.camera.position.set(6.8, 5.2, 7.8);
        break;
      case 'top':
        this.camera.position.set(0, 9.5, 0.01);
        break;
      case 'side':
        this.camera.position.set(8.5, 2.5, 0);
        break;
      case 'tool':
        const tcpPos = new THREE.Vector3();
        this.robot.tcpObject.getWorldPosition(tcpPos);
        this.controls.target.copy(tcpPos);
        this.camera.position.set(tcpPos.x + 1.8, tcpPos.y + 1.0, tcpPos.z + 1.8);
        break;
    }
    this.camera.lookAt(this.controls.target);
  }

  animate() {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.05);

    // 1. Actualizar cinemática del robot y postura de eslabones
    this.robot.update(delta);

    // 2. Comunicar cápsulas de colisión del robot al motor físico XPBD
    this.particleWorld.setRobotCapsules(this.robot.linkCapsules);

    // 3. Actualizar simulación física XPBD continua (colisiones continuas, fricción, deformación)
    this.particleWorld.step(delta, this.robot.gripper);

    // 4. Actualizar entramado de partículas adheridas al robot y a las mesas
    this.robotLattice.update();
    this.tableLattice.update();

    // 5. Registrar posición del efector final para el trazador de trayectoria
    this.robot.tcpObject.getWorldPosition(this.tempTcpVec);
    this.trajectoryTrail.addPointFromCoords(
      this.tempTcpVec.x,
      this.tempTcpVec.y,
      this.tempTcpVec.z
    );

    // 6. Actualizar secuencia si está activa
    this.sequenceEditor.update(delta);

    // 7. Actualizar datos del osciloscopio y HUD
    this.telemetryChart.addDataPoint(this.robot);
    this.hud.updateTelemetryHUD();

    // 8. Controles orbitales
    this.controls.update();

    // 9. Renderizar fotograma Three.js
    this.sceneSetup.render();
  }
}

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.robotApp = new RoboTwinApp();
});
