import { MathUtils } from '../utils/MathUtils.js';

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

  // Genera la secuencia completa multi-caja con cinemática analítica exacta:
  // El gripper desciende perpendicularmente sobre cada ranura A1..A3 y B1..B3
  loadMultiBoxBidirectionalRoutine() {
    this.stepDuration = 1.9;
    this.waypoints = [];

    // Posición Home de seguridad
    const homeAngles = [0, 0.20, 1.40, 0, 1.54, 0];
    this.waypoints.push({ name: "Inicio en Home", angles: homeAngles, gripper: true });

    // Poses calculadas con cota exacta de descenso perpendicular (gripper apuntando vector [0, -1, 0])
    // Ranuras ampliadas a Z = [0.45, 0.80, 1.15] (35 cm de espacio libre entre cubos)
    // Grab/Drop: TCP a Y = 0.99m (las yemas abrazan la caja justamente a media altura sin rozar la mesa)
    // Approx: TCP a Y = 1.45m directamente en la misma vertical para descenso y ascenso rectilíneos
    const posesA = [
      { approx: [-1.326, 0.110, 1.970, 0, 1.062, 0], grab: [-1.326, 0.280, 2.070, 0, 0.792, 0] }, // Slot A1 (Z=0.45)
      { approx: [-1.153, 0.170, 1.900, 0, 1.072, 0], grab: [-1.153, 0.330, 1.990, 0, 0.822, 0] }, // Slot A2 (Z=0.80)
      { approx: [-1.001, 0.250, 1.800, 0, 1.092, 0], grab: [-1.001, 0.400, 1.890, 0, 0.852, 0] }  // Slot A3 (Z=1.15)
    ];

    const posesB = [
      { approx: [1.326, 0.110, 1.970, 0, 1.062, 0], drop: [1.326, 0.280, 2.070, 0, 0.792, 0] },   // Slot B1 (Z=0.45)
      { approx: [1.153, 0.170, 1.900, 0, 1.072, 0], drop: [1.153, 0.330, 1.990, 0, 0.822, 0] },   // Slot B2 (Z=0.80)
      { approx: [1.001, 0.250, 1.800, 0, 1.092, 0], drop: [1.001, 0.400, 1.890, 0, 0.852, 0] }    // Slot B3 (Z=1.15)
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
    const data = {
      robot: "RoboTwin 6-DOF",
      exportDate: new Date().toISOString(),
      waypoints: this.waypoints
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robot_routine_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportProgramGCode() {
    let gcode = `; ==========================================\n`;
    gcode += `; RoboTwin 6-DOF Industrial G-Code Export\n`;
    gcode += `; Generated: ${new Date().toLocaleString()}\n`;
    gcode += `; ==========================================\n`;
    gcode += `G21 ; Unidades en mm\nG90 ; Absolutas\nM17 ; Energizar\n\n`;

    this.waypoints.forEach((wp, idx) => {
      const degs = wp.angles.map(a => (a * 180 / Math.PI).toFixed(2));
      gcode += `; Paso #${idx + 1}: ${wp.name}\n`;
      gcode += `G01 A${degs[0]} B${degs[1]} C${degs[2]} D${degs[3]} E${degs[4]} F${degs[5]} F1500\n`;
      gcode += wp.gripper ? `M05 ; Abrir Pinza\n` : `M03 ; Cerrar Pinza\n`;
      gcode += `G04 P400\n\n`;
    });

    gcode += `M18 ; Fin de ciclo\n`;
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robot_program_${Date.now()}.gcode`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportProgramRAPID() {
    let rapid = `MODULE RoboTwinModule\n  PROC main()\n`;
    this.waypoints.forEach((wp, idx) => {
      const degs = wp.angles.map(a => (a * 180 / Math.PI).toFixed(2));
      rapid += `    ! ${wp.name}\n`;
      rapid += `    MoveAbsJ [[${degs.join(', ')}], [9E9,9E9,9E9,9E9,9E9,9E9]], v500, fine, tool0;\n`;
      rapid += wp.gripper ? `    Reset do_GripperClose;\n    Set do_GripperOpen;\n` : `    Reset do_GripperOpen;\n    Set do_GripperClose;\n`;
      rapid += `    WaitTime 0.4;\n\n`;
    });
    rapid += `  ENDPROC\nENDMODULE\n`;

    const blob = new Blob([rapid], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `robot_routine_${Date.now()}.mod`;
    a.click();
    URL.revokeObjectURL(url);
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

  // Pausa temporal (utilizada por E-STOP para reanudar sin resetear)
  pause() {
    this.isPlaying = false;
    if (this.onStatusChange) this.onStatusChange();
  }

  // Detención completa: resetea al paso 0 y libera objetos si había alguno sujeto
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

    const smoothAlpha = MathUtils.smootherstep(Math.min(1.0, this.stepProgress));

    const interpAngles = [];
    for (let i = 0; i < 6; i++) {
      interpAngles.push(MathUtils.lerp(fromWp.angles[i], toWp.angles[i], smoothAlpha));
    }
    this.robot.setTargetJointAngles(interpAngles);

    if (this.stepProgress >= 1.0) {
      this.stepProgress = 0;
      this.currentStep = nextIdx;

      // Acciones de pinza con detección física de presencia de cajas
      if (toWp.action === 'grab' && this.workObjects) {
        // Buscar si existe físicamente una caja entre los dedos en este instante
        const detectedBox = this.robot.gripper.findNearbyObject(this.workObjects.boxes || []);
        
        // Ajustar el cierre al ancho de la caja si hay una presente, o cerrar completamente en vacío si no hay caja
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
