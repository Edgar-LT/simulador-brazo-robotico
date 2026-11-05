// Sistema central desacoplado de eventos Pub/Sub (EventBus)
// Permite que la física, la cinemática y el robot emitan eventos de estado
// sin conocer la existencia de la interfaz gráfica (DOM/HUD).
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const callback of set) {
      try {
        callback(payload);
      } catch (err) {
        console.error(`[EventBus] Error en listener para evento '${event}':`, err);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}

// Instancia singleton para el dominio de la celda robótica
export const globalEventBus = new EventBus();
