import { MathUtils } from '../utils/MathUtils.js';
import { IndustrialProgramExporter } from '../robot/IndustrialProgramExporter.js';

// Buffer persistente para interpolación Zero-GC en cada tick de secuencia
const _interpAngles = new Float64Array(6);

export class SequenceEditor {
  constructor(robot, workObjects) {
    this.robot = robot;
    this.workObjects = workObjects;
    this.waypoints = [];
    this.isPlaying = false;
    this.currentStep = 0;
    this.stepProgress = 0;
    this.stepDuration = 1.9; // Cadencia óptima por tramo
    this.onStatusChange = null;

    // Configuración inicial en reposo (la rutina se ejecutará únicamente cuando el usuario presione Iniciar)
    this.loadMultiBoxBidirectionalRoutine();
    this.stop();
  }

  addCurrentPositionAsWaypoint(label = null) {
    const angles = [...this.robot.currentAngles];
    const gripperState = this.robot.gripper.isOpen;
    const name = label || `Paso #${this.waypoints.length + 1}`;
    
    this.waypoints.push({
      name,
      angles,
      gripper: gripperState
    });

    if (this.onStatusChange) this.onStatusChange();
    return this.waypoints.length;
  }

  clearWaypoints() {
    this.waypoints = [];
    this.stop();
    if (this.onStatusChange) this.onStatusChange();
  }

  // Genera la secuencia completa multi-caja con cinemática analítica exacta
  loadMultiBoxBidirectionalRoutine() {
    this.stepDuration = 1.9;
    this.waypoints = [];

    // Posición Home de seguridad
    const homeAngles = [0, 0.20, 1.40, 0, 1.54, 0];
    this.waypoints.push({ name: "Inicio en Home", angles: homeAngles, gripper: true });

    const posesA = [
      { approx: [-1.4743, -0.0362, 2.1544, 0, 1.0234, -3.0451], grab: [-1.4743, 0.1413, 2.2441, 0, 0.7563, -3.0451] }, // Slot A1 (Z=0.15)
      { approx: [-1.2588,  0.0039, 2.1150, 0, 1.0227, -2.8296], grab: [-1.2588, 0.1757, 2.2022, 0, 0.7637, -2.8296] }, // Slot A2 (Z=0.50)
      { approx: [-1.0692,  0.0793, 2.0361, 0, 1.0262, -2.6400], grab: [-1.0692, 0.2406, 2.1191, 0, 0.7819, -2.6400] }  // Slot A3 (Z=0.85)
    ];

    const posesB = [
      { approx: [1.4743, -0.0362, 2.1544, 0, 1.0234, -0.0965], drop: [1.4743, 0.1413, 2.2441, 0, 0.7563, -0.0965] },   // Slot B1 (Z=0.15)
      { approx: [1.2588,  0.0039, 2.1150, 0, 1.0227, -0.3120], drop: [1.2588, 0.1757, 2.2022, 0, 0.7637, -0.3120] },   // Slot B2 (Z=0.50)
      { approx: [1.0692,  0.0793, 2.0361, 0, 1.0262, -0.5016], drop: [1.0692, 0.2406, 2.1191, 0, 0.7819, -0.5016] }    // Slot B3 (Z=0.85)
    ];

    // --- FASE 1: IDA (MESA A -> MESA B) ---
    for (let i = 0; i < 3; i++) {
      const boxIdx = i;
      const slotA = `A${i + 1}`;
      const slotB = `B${i + 1}`;

      this.waypoints.push({ name: `Aproximar a Caja ${i + 1} (${slotA})`, angles: posesA[i].approx, gripper: true });
      this.waypoints.push({ name: `Descenso a Caja ${i + 1}`, angles: posesA[i].grab, gripper: true });
      this.waypoints.push({ name: `Sujetar Caja ${i + 1}`, angles: posesA[i].grab, gripper: false, action: 'grab', boxIndex: boxIdx });
      this.waypoints.push({ name: `Elevar Caja ${i + 1}`, angles: posesA[i].approx, gripper: false });
      this.waypoints.push({ name: `Transferir hacia ${slotB}`, angles: posesB[i].approx, gripper: false });
      this.waypoints.push({ name: `Descender en ${slotB}`, angles: posesB[i].drop, gripper: false });
      this.waypoints.push({ name: `Liberar en ${slotB}`, angles: posesB[i].drop, gripper: true, action: 'release' });
      this.waypoints.push({ name: `Retirada hacia arriba`, angles: posesB[i].approx, gripper: true });
    }

    // Punto intermedio de seguridad
    this.waypoints.push({ name: "Ciclo Ida Completado (Home)", angles: homeAngles, gripper: true });

    // --- FASE 2: VUELTA (MESA B -> MESA A) ---
    for (let i = 2; i >= 0; i--) {
      const boxIdx = i;
      const slotB = `B${i + 1}`;
      const slotA = `A${i + 1}`;

      this.waypoints.push({ name: `Aproximar a Caja ${i + 1} (${slotB})`, angles: posesB[i].approx, gripper: true });
      this.waypoints.push({ name: `Descenso a Caja ${i + 1}`, angles: posesB[i].drop, gripper: true });
      this.waypoints.push({ name: `Sujetar Caja ${i + 1}`, angles: posesB[i].drop, gripper: false, action: 'grab', boxIndex: boxIdx });
      this.waypoints.push({ name: `Elevar Caja ${i + 1}`, angles: posesB[i].approx, gripper: false });
      this.waypoints.push({ name: `Retornar hacia ${slotA}`, angles: posesA[i].approx, gripper: false });
      this.waypoints.push({ name: `Descender en ${slotA}`, angles: posesA[i].grab, gripper: false });
      this.waypoints.push({ name: `Liberar en ${slotA}`, angles: posesA[i].grab, gripper: true, action: 'release' });
      this.waypoints.push({ name: `Retirada hacia arriba`, angles: posesA[i].approx, gripper: true });
    }

    this.waypoints.push({ name: "Ciclo Bidireccional Finalizado", angles: homeAngles, gripper: true });

    if (this.onStatusChange) this.onStatusChange();
  }

  exportProgramJSON() {
    IndustrialProgramExporter.exportJSON(this.waypoints, "RoboTwin 6-DOF");
  }

  exportProgramGCode() {
    IndustrialProgramExporter.exportGCode(this.waypoints);
  }

  exportProgramRAPID() {
    IndustrialProgramExporter.exportRAPID(this.waypoints);
  }

  importProgramJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (Array.isArray(data.waypoints)) {
        this.waypoints = data.waypoints;
        this.stop();
        if (this.onStatusChange) this.onStatusChange();
        return true;
      }
    } catch (e) {
      console.error("Error importando JSON:", e);
    }
    return false;
  }

  play(resume = false) {
    if (this.waypoints.length < 2) return;
    this.isPlaying = true;
    if (!resume) {
      this.currentStep = 0;
      this.stepProgress = 0;
    }
    if (this.onStatusChange) this.onStatusChange();
  }

  pause() {
    this.isPlaying = false;
    if (this.onStatusChange) this.onStatusChange();
  }

  stop() {
    this.isPlaying = false;
    this.currentStep = 0;
    this.stepProgress = 0;
    if (this.robot.gripper.grippedObject) {
      this.robot.gripper.releaseObject();
    }
    if (this.onStatusChange) this.onStatusChange();
  }

  update(delta) {
    if (!this.isPlaying || this.waypoints.length < 2) return;

    this.stepProgress += delta / this.stepDuration;

    const fromWp = this.waypoints[this.currentStep];
    const nextIdx = (this.currentStep + 1) % this.waypoints.length;
    const toWp = this.waypoints[nextIdx];

    // Interpolación S-Curve (Quintic Smootherstep: C2-continuo, sin saltos de aceleración/jerk)
    const smoothAlpha = MathUtils.smootherstep(Math.min(1.0, this.stepProgress));

    for (let i = 0; i < 6; i++) {
      _interpAngles[i] = MathUtils.lerp(fromWp.angles[i], toWp.angles[i], smoothAlpha);
    }
    this.robot.setTargetJointAngles(_interpAngles);

    if (this.stepProgress >= 1.0) {
      this.stepProgress = 0;
      this.currentStep = nextIdx;

      // Acciones de pinza con detección física comprobada
      if (toWp.action === 'grab' && this.workObjects) {
        const detectedBox = this.robot.gripper.findNearbyObject(this.workObjects.boxes || []);
        this.robot.gripper.close(detectedBox);
        if (detectedBox) {
          this.robot.gripper.grabObject(detectedBox);
        }
      } else if (toWp.action === 'release' && this.workObjects) {
        this.robot.gripper.open();
        this.robot.gripper.releaseObject();
      } else if (toWp.gripper) {
        this.robot.gripper.open();
      } else {
        this.robot.gripper.close();
      }

      if (this.onStatusChange) this.onStatusChange();
    }
  }
}
