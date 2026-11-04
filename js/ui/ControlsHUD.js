import { MathUtils } from '../utils/MathUtils.js';

export class ControlsHUD {
  constructor(robot, sequenceEditor, telemetryChart, targetGizmo, trajectoryTrail, app) {
    this.robot = robot;
    this.sequenceEditor = sequenceEditor;
    this.telemetryChart = telemetryChart;
    this.targetGizmo = targetGizmo;
    this.trajectoryTrail = trajectoryTrail;
    this.app = app;

    this.mode = 'manual'; // 'manual' | 'ik' | 'sequence'
    this.isEstopActive = false;
    this.bindDOM();
  }

  bindDOM() {
    // 1. Manejo de Pestañas del Panel Unificado
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(targetId)?.classList.add('active');
      });
    });

    // Botón para Plegar/Desplegar Menú
    document.getElementById('btn-toggle-panel')?.addEventListener('click', () => {
      document.body.classList.toggle('panel-hidden');
    });

    // 2. Selectores de Modo (FK vs IK)
    const btnManual = document.getElementById('btn-mode-manual');
    const btnIK = document.getElementById('btn-mode-ik');
    const secFK = document.getElementById('section-fk');
    const secIK = document.getElementById('section-ik');

    btnManual?.addEventListener('click', () => {
      this.setMode('manual');
      btnManual.classList.add('active');
      btnIK.classList.remove('active');
      if (secFK) secFK.style.display = 'block';
      if (secIK) secIK.style.display = 'none';
    });

    btnIK?.addEventListener('click', () => {
      this.setMode('ik');
      btnIK.classList.add('active');
      btnManual.classList.remove('active');
      if (secFK) secFK.style.display = 'none';
      if (secIK) secIK.style.display = 'block';
    });

    // 3. Sliders Articulares (J1 - J6)
    this.sliders = [];
    this.valBadges = [];

    for (let i = 0; i < 6; i++) {
      const slider = document.getElementById(`slider-j${i + 1}`);
      const valBadge = document.getElementById(`val-j${i + 1}`);
      if (slider && valBadge) {
        this.sliders.push(slider);
        this.valBadges.push(valBadge);

        slider.addEventListener('input', (e) => {
          if (this.mode !== 'manual') {
            this.setMode('manual');
            btnManual?.classList.add('active');
            btnIK?.classList.remove('active');
            if (secFK) secFK.style.display = 'block';
            if (secIK) secIK.style.display = 'none';
          }
          const deg = parseFloat(e.target.value);
          const rad = MathUtils.degToRad(deg);
          valBadge.innerText = `${deg.toFixed(1)}°`;
          
          const newAngles = [...this.robot.currentAngles];
          newAngles[i] = rad;
          this.robot.setTargetJointAngles(newAngles);
        });
      }
    }

    // 4. Sliders IK (Cartesianos X, Y, Z)
    ['x', 'y', 'z'].forEach(axis => {
      const slider = document.getElementById(`slider-ik-${axis}`);
      slider?.addEventListener('input', () => {
        if (this.mode !== 'ik') {
          this.setMode('ik');
          btnIK?.classList.add('active');
          btnManual?.classList.remove('active');
          if (secFK) secFK.style.display = 'none';
          if (secIK) secIK.style.display = 'block';
        }
        this.updateIKFromSliders();
      });
    });

    // Botón de Gripper
    document.getElementById('btn-toggle-gripper')?.addEventListener('click', () => {
      if (this.robot.gripper.isOpen) {
        const candidates = this.app?.workObjects?.boxes || [];
        const detectedBox = this.robot.gripper.findNearbyObject(candidates);
        this.robot.gripper.close(detectedBox);
        if (detectedBox) {
          this.robot.gripper.grabObject(detectedBox);
        }
      } else {
        this.robot.gripper.open();
      }
      this.updateGripperButton();
    });

    // Selector de Preset de Material Físico XPBD
    document.getElementById('sel-box-material')?.addEventListener('change', (e) => {
      const preset = e.target.value;
      if (this.app?.particleWorld) {
        this.app.particleWorld.setMaterialPresetAll(preset);
      }
    });

    // Presets de Cámara
    ['iso', 'top', 'side', 'tool'].forEach(camKey => {
      document.getElementById(`cam-${camKey}`)?.addEventListener('click', () => {
        this.app?.setCameraPreset(camKey);
        document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`cam-${camKey}`)?.classList.add('active');
      });
    });

    // Parada de Emergencia E-STOP
    document.getElementById('btn-estop')?.addEventListener('click', () => {
      this.toggleEmergencyStop();
    });

    // Secuenciador y Demo
    document.getElementById('btn-demo-routine')?.addEventListener('click', () => {
      this.robot.gripper.open();
      this.sequenceEditor.loadMultiBoxBidirectionalRoutine();
      this.setMode('sequence');
      this.sequenceEditor.play(false);
      this.renderWaypointList();
    });

    document.getElementById('btn-reset-boxes')?.addEventListener('click', () => {
      this.robot.gripper.open();
      this.updateGripperButton();
      this.app?.workObjects?.resetAllBoxes();
    });

    document.getElementById('btn-add-step')?.addEventListener('click', () => {
      this.sequenceEditor.addCurrentPositionAsWaypoint();
      this.renderWaypointList();
    });

    document.getElementById('btn-play-seq')?.addEventListener('click', () => {
      if (this.sequenceEditor.isPlaying) {
        this.sequenceEditor.stop();
      } else {
        this.setMode('sequence');
        this.sequenceEditor.play();
      }
      this.updatePlayButton();
    });

    document.getElementById('btn-clear-seq')?.addEventListener('click', () => {
      this.sequenceEditor.clearWaypoints();
      this.renderWaypointList();
    });

    // Exportaciones
    document.getElementById('btn-export-seq')?.addEventListener('click', () => this.sequenceEditor.exportProgramJSON());
    document.getElementById('btn-export-gcode')?.addEventListener('click', () => this.sequenceEditor.exportProgramGCode());
    document.getElementById('btn-export-rapid')?.addEventListener('click', () => this.sequenceEditor.exportProgramRAPID());
    
    const fileInput = document.getElementById('file-import-seq');
    document.getElementById('btn-import-seq')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (this.sequenceEditor.importProgramJSON(ev.target.result)) {
            this.renderWaypointList();
            alert("Rutina cargada con éxito");
          }
        };
        reader.readAsText(file);
      }
    });

    // Opciones Visuales
    const updateParticlesState = (active) => {
      this.app?.particleWorld?.setParticleLatticeVisible(active);
      this.app?.robotLattice?.setVisible(active);
      this.app?.tableLattice?.setVisible(active);
      this.robot.setLatticeTransparency(active);
      this.app?.workObjects?.setTablesTransparency(active);
      
      const chk = document.getElementById('chk-particles');
      if (chk) chk.checked = active;

      const headerBtn = document.getElementById('btn-toggle-particles-header');
      if (headerBtn) {
        headerBtn.innerText = active ? "Nodos XPBD: ON" : "Nodos XPBD: OFF";
        headerBtn.classList.toggle('active', active);
      }
    };

    document.getElementById('chk-particles')?.addEventListener('change', (e) => {
      updateParticlesState(e.target.checked);
    });

    document.getElementById('btn-toggle-particles-header')?.addEventListener('click', () => {
      const isVisible = !this.app?.particleWorld?.showParticleLattice;
      updateParticlesState(isVisible);
    });

    document.getElementById('chk-workspace')?.addEventListener('change', (e) => {
      this.robot.setWorkspaceVisibility(e.target.checked);
    });
    document.getElementById('chk-trail')?.addEventListener('change', (e) => {
      this.trajectoryTrail?.setVisible(e.target.checked);
    });

    this.sequenceEditor.onStatusChange = () => {
      this.updatePlayButton();
      this.renderWaypointList();
    };
  }

  toggleEmergencyStop() {
    this.isEstopActive = !this.isEstopActive;
    this.robot.setEmergencyStop(this.isEstopActive);

    const estopBtn = document.getElementById('btn-estop');
    if (estopBtn) {
      if (this.isEstopActive) {
        estopBtn.innerText = "Rearmar";
        estopBtn.classList.add('active-alarm');
        this.wasPlayingBeforeEstop = this.sequenceEditor.isPlaying;
        if (this.sequenceEditor.isPlaying) {
          this.sequenceEditor.pause();
        }
      } else {
        estopBtn.innerText = "E-STOP";
        estopBtn.classList.remove('active-alarm');
        if (this.wasPlayingBeforeEstop) {
          this.sequenceEditor.play(true);
          this.wasPlayingBeforeEstop = false;
        }
      }
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'ik' && this.targetGizmo) {
      const fk = this.robot.kinematics.getForwardKinematics();
      this.targetGizmo.position.copy(fk.position);
      this.targetGizmo.visible = true;
      if (this.app?.transformControls) {
        this.app.transformControls.visible = true;
        this.app.transformControls.enabled = true;
      }
      this.syncIKSlidersWithTarget(fk.position);
    } else if (this.targetGizmo) {
      this.targetGizmo.visible = false;
      if (this.app?.transformControls) {
        this.app.transformControls.visible = false;
        this.app.transformControls.enabled = false;
      }
    }
  }

  syncIKSlidersWithTarget(pos) {
    const sx = document.getElementById('slider-ik-x');
    const sy = document.getElementById('slider-ik-y');
    const sz = document.getElementById('slider-ik-z');
    if (sx) sx.value = pos.x.toFixed(2);
    if (sy) sy.value = pos.y.toFixed(2);
    if (sz) sz.value = pos.z.toFixed(2);
    
    const vx = document.getElementById('val-ik-x');
    const vy = document.getElementById('val-ik-y');
    const vz = document.getElementById('val-ik-z');
    if (vx) vx.innerText = `${pos.x.toFixed(2)} m`;
    if (vy) vy.innerText = `${pos.y.toFixed(2)} m`;
    if (vz) vz.innerText = `${pos.z.toFixed(2)} m`;
  }

  updateIKFromSliders() {
    const x = parseFloat(document.getElementById('slider-ik-x')?.value || 0);
    const y = parseFloat(document.getElementById('slider-ik-y')?.value || 1.5);
    const z = parseFloat(document.getElementById('slider-ik-z')?.value || 0);

    const vx = document.getElementById('val-ik-x');
    const vy = document.getElementById('val-ik-y');
    const vz = document.getElementById('val-ik-z');
    if (vx) vx.innerText = `${x.toFixed(2)} m`;
    if (vy) vy.innerText = `${y.toFixed(2)} m`;
    if (vz) vz.innerText = `${z.toFixed(2)} m`;

    if (this.targetGizmo) {
      const safeY = Math.max(0.15, y);
      this.targetGizmo.position.set(x, safeY, z);
      this.robot.kinematics.solveIK(this.targetGizmo.position);
      this.syncSlidersWithRobot();
    }
  }

  syncSlidersWithRobot() {
    for (let i = 0; i < 6; i++) {
      const deg = MathUtils.radToDeg(this.robot.currentAngles[i]);
      if (this.sliders[i]) this.sliders[i].value = deg;
      if (this.valBadges[i]) this.valBadges[i].innerText = `${deg.toFixed(1)}°`;
    }
  }

  updateGripperButton() {
    const btn = document.getElementById('btn-toggle-gripper');
    if (btn) {
      btn.innerText = this.robot.gripper.isOpen ? "Pinza: Abierta" : "Pinza: Cerrada";
      btn.classList.toggle('active', !this.robot.gripper.isOpen);
    }
  }

  updatePlayButton() {
    const btn = document.getElementById('btn-play-seq');
    if (btn) {
      btn.innerText = this.sequenceEditor.isPlaying ? "Detener" : "Reproducir";
      btn.classList.toggle('active', this.sequenceEditor.isPlaying);
    }
  }

  renderWaypointList() {
    const container = document.getElementById('waypoint-list');
    if (!container) return;

    container.innerHTML = '';
    this.sequenceEditor.waypoints.forEach((wp, idx) => {
      const item = document.createElement('div');
      item.className = `wp-item ${this.sequenceEditor.currentStep === idx && this.sequenceEditor.isPlaying ? 'active' : ''}`;
      item.innerHTML = `
        <span>${idx + 1}. ${wp.name}</span>
        <span style="color: ${wp.gripper ? '#00ff88' : '#ff6b00'};">${wp.gripper ? 'Abierto' : 'Sujeto'}</span>
      `;
      container.appendChild(item);
    });
  }

  updateTelemetryHUD() {
    const fk = this.robot.kinematics.getForwardKinematics();
    const pos = fk.position;

    const elX = document.getElementById('tcp-pos-x');
    const elY = document.getElementById('tcp-pos-y');
    const elZ = document.getElementById('tcp-pos-z');
    if (elX) elX.innerText = pos.x.toFixed(3);
    if (elY) elY.innerText = pos.y.toFixed(3);
    if (elZ) elZ.innerText = pos.z.toFixed(3);

    // Ecuaciones cinemáticas y dinámicas
    const angles = this.robot.currentAngles;
    const q2 = angles[1];
    const q3 = angles[2];
    const { link2Length, link3Length, link4Length, link5Length, gripperLength } = this.robot.config.links;
    const l3Total = link3Length + link4Length + link5Length + gripperLength;
    const r = link2Length * Math.sin(q2) + l3Total * Math.sin(q2 + q3);

    const elValR = document.getElementById('math-val-r');
    const elValTorque = document.getElementById('math-val-torque');
    if (elValR) elValR.innerText = `= ${r.toFixed(3)} m`;
    if (elValTorque) {
      const tau2 = this.robot.jointTorques[1] || 0;
      elValTorque.innerText = `${tau2.toFixed(1)} N·m`;
    }

    // Fuerza de contacto normal física en Newtons
    const elClampForce = document.getElementById('math-val-clamp');
    if (elClampForce && this.app?.particleWorld) {
      const fn = this.app.particleWorld.getMaxContactForce();
      elClampForce.innerText = `${fn.toFixed(1)} N`;
    }

    // Alertas y LED
    const nearLimit = this.robot.kinematics.checkLimitsStatus();
    const nearSingularity = this.robot.kinematics.isNearSingularity;
    const alertBadge = document.getElementById('status-alert-badge');

    if (this.isEstopActive) {
      if (alertBadge) {
        alertBadge.className = 'alert-status warning';
        alertBadge.innerHTML = '<span>Parada de emergencia activa</span>';
      }
      this.robot.setLedStatus(0xff0000);
    } else if (nearLimit) {
      if (alertBadge) {
        alertBadge.className = 'alert-status warning';
        alertBadge.innerHTML = '<span>Límite articular próximo</span>';
      }
      this.robot.setLedStatus(0xff6b00);
    } else if (nearSingularity) {
      if (alertBadge) {
        alertBadge.className = 'alert-status warning';
        alertBadge.innerHTML = '<span>Singularidad de extensión</span>';
      }
      this.robot.setLedStatus(0xffaa00);
    } else {
      if (alertBadge) {
        alertBadge.className = 'alert-status normal';
        alertBadge.innerHTML = '<span>Estado: Seguro (Zona Operativa)</span>';
      }
      this.robot.setLedStatus(0x00f0ff);
    }

    // Actualizar parámetros Denavit-Hartenberg (D-H) en tiempo real
    for (let i = 0; i < 6; i++) {
      const row = document.getElementById(`dh-row-${i + 1}`);
      if (row) {
        const thetaCell = row.querySelector('.dh-theta');
        if (thetaCell) {
          const deg = MathUtils.radToDeg(angles[i]);
          thetaCell.innerText = `${deg >= 0 ? '+' : ''}${deg.toFixed(1)}°`;
        }
      }
    }

    if (this.mode !== 'manual') {
      this.syncSlidersWithRobot();
    }
  }
}
