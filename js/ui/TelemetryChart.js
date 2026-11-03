export class TelemetryChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.maxPoints = 60;
    this.history = {
      j1: new Array(this.maxPoints).fill(0),
      j2: new Array(this.maxPoints).fill(0),
      j3: new Array(this.maxPoints).fill(0),
      torque: new Array(this.maxPoints).fill(0)
    };
    this.colors = {
      j1: '#00d2ff',
      j2: '#ff6b00',
      j3: '#2ed573',
      torque: '#e056fd'
    };
  }

  addDataPoint(robot) {
    if (!this.canvas) return;
    const angles = robot.currentAngles;
    const avgTorque = robot.jointTorques.reduce((a, b) => a + b, 0) / 6;

    this.history.j1.push(angles[0]);
    this.history.j1.shift();

    this.history.j2.push(angles[1]);
    this.history.j2.shift();

    this.history.j3.push(angles[2]);
    this.history.j3.shift();

    this.history.torque.push(avgTorque);
    this.history.torque.shift();

    this.draw();
  }

  draw() {
    const w = this.canvas.width = this.canvas.clientWidth;
    const h = this.canvas.height = this.canvas.clientHeight;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Fondo y rejilla del osciloscopio
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 30) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 20) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Línea central de referencia
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Graficar series
    this.plotSeries(this.history.j1, this.colors.j1, -Math.PI, Math.PI, w, h);
    this.plotSeries(this.history.j2, this.colors.j2, -Math.PI, Math.PI, w, h);
    this.plotSeries(this.history.j3, this.colors.j3, -Math.PI, Math.PI, w, h);
  }

  plotSeries(data, color, minVal, maxVal, w, h) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const step = w / (this.maxPoints - 1);
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - minVal) / (maxVal - minVal);
      const y = h - (normalized * h);
      const x = i * step;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
