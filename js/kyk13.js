/*
 * Dispositivo de transferencia electrónica KYK-13 (simulación de entrenamiento).
 *
 * - Interruptor de función: Z ALL (borra todas las posiciones), OFF/CHECK, ON.
 * - Selector de dirección: posiciones 1 a 6.
 * - Botón INICIAR y lámpara de paridad.
 * - Protocolo de llenado DS-102 (llenado común).
 *
 * En OFF/CHECK, al pulsar INICIAR la lámpara destella si la posición
 * seleccionada contiene una clave (comprobación de paridad).
 * En ON, al pulsar INICIAR se transfiere la clave de la posición seleccionada
 * al equipo conectado (que debe estar esperando la carga, p. ej. radio en LD);
 * la lámpara destella si la transferencia es correcta.
 * En ON también puede recibir una clave desde el SKL en la posición seleccionada.
 *
 * Las claves son etiquetas ficticias de entrenamiento.
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;
  const POSITIONS = 6;
  const MODES = ['ZALL', 'OFF', 'ON'];

  function defaultPositions(now) {
    const mk = (tag, type, alg, desc) => ({ tag, type, alg, desc, chk: SIM.checksum(tag), loadedAt: now, src: 'CUSTODIO' });
    const p = new Array(POSITIONS).fill(null);
    p[0] = mk('VIN-TEK-05', 'TEK', 'VINSON', 'Red SATCOM DAMA de mando (VINSON)');
    p[1] = mk('ANDVT-TEK-31', 'TEK', 'ANDVT', 'Red SATCOM 5 kHz (ANDVT)');
    return p;
  }

  class KYK13 extends SIM.Device {
    /** env.fill(key) -> { ok, reason?, slot? } : entrega al equipo conectado al conector de la radio */
    constructor(env) {
      super(env);
      if (!this.env.fill) this.env.fill = () => ({ ok: false, reason: 'Sin equipo conectado' });
      this.hardReset();
    }

    hardReset() {
      this.clearTimers();
      this.mode = 'OFF';
      this.addr = 1;
      this.positions = defaultPositions(this.env.now());
      this.lamp = false;
      this.last = null; // { text, ok } último resultado, para la interfaz
      this.checked = false; // se ha hecho al menos una comprobación de paridad
      this.changed();
    }

    get current() {
      return this.positions[this.addr - 1];
    }

    flashLamp() {
      this.lamp = true;
      const token = {};
      this._lampToken = token;
      this.emit('lamp');
      this.after(700, () => {
        if (this._lampToken === token) {
          this.lamp = false;
          this.changed();
        }
      });
    }

    result(text, ok) {
      this.last = { text, ok };
      this.emit('result', this.last);
      this.changed();
      return { ok, reason: ok ? undefined : text };
    }

    setMode(m) {
      if (!MODES.includes(m) || m === this.mode) return;
      this.mode = m;
      if (m === 'ZALL') {
        const n = this.positions.filter(Boolean).length;
        this.positions = new Array(POSITIONS).fill(null);
        this.emit('zeroize', { count: n });
        this.last = { text: `Z ALL: ${n} posiciones borradas`, ok: true };
      }
      this.changed();
    }

    setAddr(n) {
      n = Number(n);
      if (!Number.isInteger(n) || n < 1 || n > POSITIONS) return;
      this.addr = n;
      this.last = null;
      this.changed();
    }

    /** Botón INICIAR. */
    initiate() {
      const k = this.current;
      if (this.mode === 'ZALL') return this.result('El interruptor está en Z ALL: no hay operación posible', false);
      if (this.mode === 'OFF') {
        // comprobación de paridad
        if (k) {
          this.checked = true;
          this.flashLamp();
          return this.result(`Comprobación: la posición ${this.addr} contiene una clave (paridad correcta)`, true);
        }
        return this.result(`Comprobación: la posición ${this.addr} está vacía (la lámpara no destella)`, false);
      }
      if (!k) return this.result(`La posición ${this.addr} está vacía: no hay nada que transferir`, false);
      const r = this.env.fill(k);
      if (r.ok) {
        this.flashLamp();
        return this.result(`Transferida la posición ${this.addr} (${k.tag}) al slot ${SIM.pad(r.slot)} de la radio`, true);
      }
      return this.result(r.reason || 'Transferencia fallida', false);
    }

    /** Recepción de una clave desde el SKL (DS-102). */
    receive(key) {
      if (this.mode !== 'ON') return { ok: false, reason: 'El KYK-13 no está en ON: no puede recibir claves' };
      const overwritten = !!this.current;
      this.positions[this.addr - 1] = {
        tag: key.tag,
        type: key.type,
        alg: key.type === 'TEK' ? key.alg || 'VINSON' : null,
        desc: key.desc || '',
        chk: key.chk,
        loadedAt: this.env.now(),
        src: 'SKL',
      };
      this.flashLamp();
      this.last = { text: `Recibida ${key.tag} en la posición ${this.addr}`, ok: true };
      this.emit('received', { pos: this.addr, key, overwritten });
      this.changed();
      return { ok: true, slot: this.addr, overwritten };
    }

    serialize() {
      return { mode: this.mode, addr: this.addr, positions: this.positions, checked: this.checked };
    }
    load(o) {
      if (!o || typeof o !== 'object') return;
      if (MODES.includes(o.mode)) this.mode = o.mode;
      if (Number.isInteger(o.addr) && o.addr >= 1 && o.addr <= POSITIONS) this.addr = o.addr;
      if (typeof o.checked === 'boolean') this.checked = o.checked;
      if (Array.isArray(o.positions) && o.positions.length === POSITIONS) this.positions = o.positions.map((k) => (k && k.tag ? k : null));
      this.changed();
    }
  }

  KYK13.POSITIONS = POSITIONS;
  KYK13.MODES = MODES;

  /** Puente KYK-13 -> radio (por el conector FILL de la radio). */
  SIM.makeKykBridge = (getConn, radio) => (key) => {
    if (getConn().fillDevice !== 'KYK13') return { ok: false, reason: 'El KYK-13 no está conectado al conector FILL de la radio' };
    return radio.receiveFill(key, 'DS-102', 'KYK-13');
  };

  SIM.KYK13 = KYK13;
})(typeof window !== 'undefined' ? window : globalThis);
