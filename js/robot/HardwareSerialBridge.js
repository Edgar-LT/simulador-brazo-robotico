// Gestor de comunicación con hardware físico (Arduino / ESP32) vía Web Serial API nativa
export class HardwareSerialBridge {
  constructor(robot) {
    this.robot = robot;
    this.port = null;
    this.writer = null;
    this.isConnected = false;
    this.baudRate = 115200;
  }

  isSupported() {
    return 'serial' in navigator;
  }

  async connect() {
    if (!this.isSupported()) {
      alert("Tu navegador no soporta Web Serial API (Recomendado: Google Chrome o Microsoft Edge).");
      return false;
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });
      this.writer = this.port.writable.getWriter();
      this.isConnected = true;
      return true;
    } catch (err) {
      console.warn("Conexión serial cancelada o fallida:", err);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    if (this.writer) {
      await this.writer.close();
      this.writer = null;
    }
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
    this.isConnected = false;
  }

  // Envía los 6 ángulos en grados formateados en cadena serial estándar (ej: "<0.0, 30.5, -45.0, 0.0, 15.0, 0.0, 1>\n")
  async sendAngles(angles, gripperOpen) {
    if (!this.isConnected || !this.writer) return;

    try {
      const degs = angles.map(a => (a * 180 / Math.PI).toFixed(1));
      const gripVal = gripperOpen ? 1 : 0;
      const payload = `<${degs.join(',')},${gripVal}>\n`;
      const encoder = new TextEncoder();
      await this.writer.write(encoder.encode(payload));
    } catch (err) {
      console.error("Error al transmitir por puerto serial:", err);
    }
  }
}
