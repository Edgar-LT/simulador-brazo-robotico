// Exportador industrial desacoplado: Formatos JSON, G-Code y ABB RAPID
export class IndustrialProgramExporter {
  static exportJSON(waypoints, robotName = "RoboTwin 6-DOF") {
    const data = {
      robot: robotName,
      exportDate: new Date().toISOString(),
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
    let gcode = `; ==========================================\n`;
    gcode += `; RoboTwin 6-DOF Industrial G-Code Export\n`;
    gcode += `; Generated: ${new Date().toLocaleString()}\n`;
    gcode += `; ==========================================\n`;
    gcode += `G21 ; Unidades en mm\nG90 ; Absolutas\nM17 ; Energizar motores\n\n`;

    waypoints.forEach((wp, idx) => {
      const degs = wp.angles.map(a => (a * 180 / Math.PI).toFixed(2));
      gcode += `; Paso #${idx + 1}: ${wp.name}\n`;
      gcode += `G01 A${degs[0]} B${degs[1]} C${degs[2]} D${degs[3]} E${degs[4]} F${degs[5]} F1500\n`;
      gcode += wp.gripper ? `M05 ; Abrir Pinza\n` : `M03 ; Cerrar Pinza\n`;
      gcode += `G04 P400 ; Dwell 400ms\n\n`;
    });

    gcode += `M18 ; Fin de ciclo / Desenergizar\n`;
    this._downloadFile(gcode, `robot_program_${Date.now()}.gcode`, "text/plain");
  }

  static exportRAPID(waypoints) {
    let rapid = `MODULE RoboTwinModule\n  PROC main()\n`;
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
