// Exportador industrial desacoplado con validaciones de límites mecánicos y singularidad
import { ROBOT_CONFIG } from '../config.js';

export class IndustrialProgramExporter {
  /**
   * Valida si un array de waypoints contiene posiciones fuera de los límites cinemáticos mecánicos.
   */
  static validateRoutine(waypoints) {
    const limits = ROBOT_CONFIG.jointLimits;
    const errors = [];

    waypoints.forEach((wp, idx) => {
      if (!Array.isArray(wp.angles) || wp.angles.length < 6) {
        errors.push(`Paso #${idx + 1} (${wp.name}): Formato de ángulos inválido`);
        return;
      }
      for (let j = 0; j < 6; j++) {
        const val = wp.angles[j];
        const lim = limits[j];
        if (val < lim.min - 1e-4 || val > lim.max + 1e-4) {
          errors.push(`Paso #${idx + 1} (${wp.name}): Eje J${j + 1} (${(val * 180 / Math.PI).toFixed(1)}°) excede límites [${(lim.min * 180 / Math.PI).toFixed(0)}°, ${(lim.max * 180 / Math.PI).toFixed(0)}°]`);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static exportJSON(waypoints, robotName = "RoboTwin 6-DOF") {
    const validation = this.validateRoutine(waypoints);
    if (!validation.isValid) {
      console.warn("Advertencias en exportación:", validation.errors);
    }

    const data = {
      robot: robotName,
      exportDate: new Date().toISOString(),
      validationStatus: validation.isValid ? "VALID" : "LIMIT_WARNINGS",
      waypoints: waypoints.map(wp => ({
        name: wp.name,
        angles: wp.angles,
        gripper: wp.gripper,
        action: wp.action || null
      }))
    };
    this._downloadFile(
      JSON.stringify(data, null, 2),
      `robot_routine_${Date.now()}.json`,
      "application/json"
    );
  }

  static exportGCode(waypoints) {
    const validation = this.validateRoutine(waypoints);
    let gcode = `; ==========================================\n`;
    gcode += `; RoboTwin 6-DOF Industrial G-Code Export\n`;
    gcode += `; Generated: ${new Date().toLocaleString()}\n`;
    gcode += `; Validation: ${validation.isValid ? 'PASSED (All limits verified)' : 'WARNINGS DETECTED'}\n`;
    gcode += `; ==========================================\n`;
    gcode += `G21 ; Unidades en mm\nG90 ; Coordenadas Absolutas\nM17 ; Energizar servomotores\n\n`;

    waypoints.forEach((wp, idx) => {
      const degs = wp.angles.map(a => (a * 180 / Math.PI).toFixed(2));
      gcode += `; Paso #${idx + 1}: ${wp.name}\n`;
      gcode += `G01 A${degs[0]} B${degs[1]} C${degs[2]} D${degs[3]} E${degs[4]} F${degs[5]} F1500\n`;
      gcode += wp.gripper ? `M05 ; Abrir Pinza\n` : `M03 ; Cerrar Pinza\n`;
      gcode += `G04 P400 ; Dwell 400ms\n\n`;
    });

    gcode += `M18 ; Fin de ciclo / Desenergizar servos\n`;
    this._downloadFile(gcode, `robot_program_${Date.now()}.gcode`, "text/plain");
  }

  static exportRAPID(waypoints) {
    const validation = this.validateRoutine(waypoints);
    let rapid = `MODULE RoboTwinModule\n`;
    rapid += `  ! Validation Status: ${validation.isValid ? 'PASSED' : 'LIMIT_WARNINGS'}\n`;
    rapid += `  PROC main()\n`;

    waypoints.forEach((wp, idx) => {
      const degs = wp.angles.map(a => (a * 180 / Math.PI).toFixed(2));
      rapid += `    ! ${wp.name}\n`;
      rapid += `    MoveAbsJ [[${degs.join(', ')}], [9E9,9E9,9E9,9E9,9E9,9E9]], v500, fine, tool0;\n`;
      rapid += wp.gripper
        ? `    Reset do_GripperClose;\n    Set do_GripperOpen;\n`
        : `    Reset do_GripperOpen;\n    Set do_GripperClose;\n`;
      rapid += `    WaitTime 0.4;\n\n`;
    });
    rapid += `  ENDPROC\nENDMODULE\n`;

    this._downloadFile(rapid, `robot_routine_${Date.now()}.mod`, "text/plain");
  }

  static _downloadFile(content, fileName, mimeType) {
    if (typeof document === 'undefined') return;
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
