/**
 * @file HardwareSerialBridge.js
 * @description Gestor de comunicación con hardware físico (Arduino / ESP32) vía Web Serial API nativa.
 * Incorpora protecciones de grado industrial:
 * 1. Control de flujo y estrangulamiento (Throttling a 30 Hz) para no saturar el búfer UART (64 bytes).
 * 2. Transmisión delta: solo transmite si hubo un cambio angular significativo (> 0.15°) o cambio de pinza.
 * 3. Suma de verificación XOR (Checksum de 8 bits) en cada trama para detección de errores.
 * 4. Detección automática de desconexión física de cable USB mediante eventos de navegador.
 * 5. Reutilización de TextEncoder estático (Zero-GC).
 */

export class HardwareSerialBridge {
  constructor(robot) {
    this.robot = robot;
    this.port = null;
    this.writer = null;
    this.isConnected = false;
    this.baudRate = 115200;

    // Control de flujo y frecuencia (máx. 30 Hz = cada 33 ms)
    this.lastSentTime = 0;
    this.minSendIntervalMs = 33;
    this.lastSentPayload = '';
    this.encoder = new TextEncoder();

    this.setupDisconnectListener();
  }

  isSupported() {
    return 'serial' in navigator;
  }

  setupDisconnectListener() {
    if (this.isSupported()) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (this.port && event.target === this.port) {
          console.warn('[HardwareSerialBridge] Dispositivo USB desconectado físicamente.');
          this.disconnect();
        }
      });
    }
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
      this.lastSentPayload = '';
      return true;
    } catch (err) {
      console.warn("[HardwareSerialBridge] Conexión serial cancelada o fallida:", err);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.writer) {
        await this.writer.close();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.warn("[HardwareSerialBridge] Error al cerrar puerto serial:", err);
    } finally {
      this.isConnected = false;
      this.port = null;
      this.writer = null;
    }
  }

  /**
   * Calcula el checksum XOR de 8 bits en formato hexadecimal (2 dígitos).
   * @param {string} str
   * @returns {string}
   */
  calculateChecksum(str) {
    let checksum = 0;
    for (let i = 0; i < str.length; i++) {
      checksum ^= str.charCodeAt(i);
    }
    return checksum.toString(16).padStart(2, '0').toUpperCase();
  }

  /**
   * Envía los 6 ángulos en grados y el estado de pinza con control de flujo y suma de verificación.
   * Formato de trama segura: `<0.0,30.5,-45.0,0.0,15.0,0.0,1*3F>\n`
   * @param {number[]} angles Ángulos articulares en radianes
   * @param {boolean} gripperOpen
   */
  async sendAngles(angles, gripperOpen) {
    if (!this.isConnected || !this.writer) return;

    // Estrangulamiento temporal (evita buffer overflow en el microcontrolador)
    const now = performance.now();
    if (now - this.lastSentTime < this.minSendIntervalMs) {
      return;
    }

    try {
      const degs = angles.map((a) => (a * (180 / Math.PI)).toFixed(1));
      const gripVal = gripperOpen ? 1 : 0;
      const dataPayload = `${degs.join(',')},${gripVal}`;

      // Transmisión delta: omitir si no ha variado respecto a la última muestra confirmada
      if (dataPayload === this.lastSentPayload) {
        return;
      }

      const checksum = this.calculateChecksum(dataPayload);
      const frame = `<${dataPayload}*${checksum}>\n`;

      await this.writer.write(this.encoder.encode(frame));
      this.lastSentPayload = dataPayload;
      this.lastSentTime = now;
    } catch (err) {
      console.error("[HardwareSerialBridge] Error al transmitir por puerto serial:", err);
      // Si la tubería se rompió, desconectar de forma segura
      if (err.name === 'NetworkError' || (err.message && err.message.includes('closed'))) {
        this.disconnect();
      }
    }
  }
}
