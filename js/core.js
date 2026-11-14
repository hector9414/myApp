/*
 * Utilidades comunes del simulador.
 * Este archivo no depende del DOM: se puede cargar tanto en el navegador
 * como en Node (para las pruebas automáticas).
 */
(function (g) {
  'use strict';
  const SIM = (g.SIM = g.SIM || {});

  SIM.pad = (n, w = 2) => String(n).padStart(w, '0');

  // Marcadores de texto parpadeante en la pantalla (no ocupan columnas).
  SIM.B0 = '\u0001';
  SIM.B1 = '\u0002';
  SIM.blink = (s) => SIM.B0 + s + SIM.B1;
  /** Longitud visible (sin marcadores de parpadeo). */
  SIM.vlen = (s) => String(s).replace(/[\u0001\u0002]/g, '').length;
  SIM.plain = (s) => String(s).replace(/[\u0001\u0002]/g, '');

  /** Ajusta un texto a un ancho fijo visible (rellena o recorta), respetando los marcadores. */
  SIM.fit = (s, w) => {
    s = String(s == null ? '' : s);
    let out = '';
    let n = 0;
    let open = false;
    for (const ch of s) {
      if (ch === SIM.B0) { open = true; out += ch; continue; }
      if (ch === SIM.B1) { open = false; out += ch; continue; }
      if (n >= w) break;
      out += ch;
      n++;
    }
    if (open) out += SIM.B1;
    return out + ' '.repeat(Math.max(0, w - n));
  };

  /** Texto a la izquierda y a la derecha en una línea de ancho fijo. */
  SIM.lr = (left, right, w) => {
    left = String(left);
    right = String(right);
    const space = w - SIM.vlen(right);
    if (space <= 0) return SIM.fit(right, w);
    return SIM.fit(left, space - 1) + ' ' + right;
  };

  /** Fecha/hora UTC con el formato de la radio: DD/MM/YYYY HH:MM:SS */
  SIM.utcStamp = (t) => {
    const d = new Date(t);
    const p = SIM.pad;
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  };

  /** Suma de control ficticia (4 hex) para identificar claves de entrenamiento. */
  SIM.checksum = (str) => {
    let h = 0x811c9dc5;
    for (const ch of String(str)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  };

  SIM.hhmmss = (t) => {
    const d = new Date(t);
    return `${SIM.pad(d.getHours())}:${SIM.pad(d.getMinutes())}:${SIM.pad(d.getSeconds())}`;
  };

  SIM.fmtDate = (t) => {
    const d = new Date(t);
    return `${SIM.pad(d.getDate())}/${SIM.pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  /** Emisor de eventos mínimo. */
  SIM.Emitter = class Emitter {
    constructor() {
      this._l = {};
    }
    on(type, fn) {
      (this._l[type] = this._l[type] || []).push(fn);
      return () => {
        this._l[type] = (this._l[type] || []).filter((f) => f !== fn);
      };
    }
    emit(type, data) {
      (this._l[type] || []).slice().forEach((f) => f(data));
    }
  };

  /** Entorno por defecto (temporizadores reales). Las pruebas inyectan uno falso. */
  SIM.defaultEnv = () => ({
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: (id) => clearTimeout(id),
    now: () => Date.now(),
    random: () => Math.random(),
  });

  /** Mezcla un entorno parcial con el entorno por defecto. */
  SIM.env = (partial) => Object.assign(SIM.defaultEnv(), partial || {});

  /** Clase base con temporizadores que se cancelan al apagar el equipo. */
  SIM.Device = class Device extends SIM.Emitter {
    constructor(env) {
      super();
      this.env = SIM.env(env);
      this._timers = new Set();
    }
    after(ms, fn) {
      const id = this.env.setTimeout(() => {
        this._timers.delete(id);
        fn();
      }, ms);
      this._timers.add(id);
      return id;
    }
    clearTimers() {
      for (const id of this._timers) this.env.clearTimeout(id);
      this._timers.clear();
    }
    changed() {
      this.emit('change');
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SIM;
})(typeof window !== 'undefined' ? window : globalThis);
