/*
 * Modelo del cargador de claves SKL AN/PYQ-10 (simulación de entrenamiento).
 *
 * Flujo: encendido -> CIK -> PIN -> menú principal. Permite consultar la base
 * de datos de claves, emitir (fill) claves a la radio por el cable de llenado
 * con protocolo DS-101 / DS-102, ver la auditoría, generar claves de
 * entrenamiento, borrar claves y hacer zeroize del equipo.
 *
 * Todas las claves son etiquetas ficticias. No hay material criptográfico.
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;

  const DAY = 86400000;
  const TRAINING_PIN = '1234';
  const MAX_ATTEMPTS = 3;
  const KEY_TYPES = {
    TEK: 'Clave de cifrado de tráfico (COMSEC)',
    TSK: 'Clave TRANSEC / salto de frecuencia SINCGARS',
    WOD: 'Palabra del día HAVE QUICK II',
    KEK: 'Clave de cifrado de claves (OTAR)',
  };

  function makeKey(now, tag, type, desc, effDays, expDays) {
    return {
      id: tag,
      tag,
      type,
      desc,
      eff: now + effDays * DAY,
      exp: now + expDays * DAY,
      chk: SIM.checksum(tag),
      issued: 0,
      cls: 'ENTRENAMIENTO',
    };
  }

  function defaultKeys(now) {
    return [
      makeKey(now, 'ALFA-TEK-01', 'TEK', 'Red de mando LOS (VHF FM)', -10, 20),
      makeKey(now, 'ALFA-TEK-00', 'TEK', 'Red de mando, periodo anterior', -40, -2),
      makeKey(now, 'BRAVO-TEK-02', 'TEK', 'Red de maniobra SINCGARS', -5, 25),
      makeKey(now, 'SINC-HOP-12', 'TSK', 'TRANSEC / conjunto de saltos SINCGARS', -5, 25),
      makeKey(now, 'HQ-WOD-NOV', 'WOD', 'Palabra del día HAVE QUICK II', -3, 27),
      makeKey(now, 'SAT-TEK-07', 'TEK', 'Red SATCOM táctica', -7, 23),
      makeKey(now, 'KEK-RED-01', 'KEK', 'Cifrado de claves para OTAR', -30, 60),
    ];
  }

  /** Puente entre el SKL y la radio: comprueba el cable antes de entregar la clave. */
  SIM.makeFillBridge = (getConn, radio) => (key, protocol) => {
    if (!getConn().fillCable) return { ok: false, reason: 'No hay cable de llenado conectado entre el SKL y la radio' };
    return radio.receiveFill(key, protocol);
  };

  class SKL extends SIM.Device {
    /**
     * env.cik() -> bool (CIK insertado)
     * env.fill(key, protocol) -> { ok, reason?, slot? }
     */
    constructor(env) {
      super(env);
      if (!this.env.cik) this.env.cik = () => true;
      if (!this.env.fill) this.env.fill = () => ({ ok: false, reason: 'Sin destino' });
      this.hardReset();
    }

    hardReset() {
      this.clearTimers();
      this.power = false;
      this.booted = false;
      this.loggedIn = false;
      this.screen = 'OFF';
      this.pin = '';
      this.attempts = 0;
      this.locked = false;
      this.keys = defaultKeys(this.env.now());
      this.audit = [];
      this.selected = [];
      this.protocol = 'DS-101';
      this.detailId = null;
      this.issue = null;
      this.message = null;
      this.confirm = null;
      this.changed();
    }

    isExpired(k) {
      return k.exp < this.env.now();
    }
    isPending(k) {
      return k.eff > this.env.now();
    }
    keyById(id) {
      return this.keys.find((k) => k.id === id);
    }

    log(action, detail, ok = true) {
      this.audit.unshift({ t: this.env.now(), action, detail, ok });
      if (this.audit.length > 200) this.audit.length = 200;
    }

    nav(screen) {
      this.screen = screen;
      this.message = null;
      this.changed();
    }

    // ---------------------------------------------------------------- energía
    powerButton() {
      if (this.power) this.powerOff();
      else this.powerOn();
    }

    powerOn() {
      this.power = true;
      this.booted = false;
      this.screen = 'BOOT';
      this.changed();
      this.after(1800, () => {
        this.booted = true;
        this.screen = this.locked ? 'LOCKED' : this.env.cik() ? 'PIN' : 'CIK';
        this.pin = '';
        this.changed();
      });
    }

    powerOff() {
      this.clearTimers();
      if (this.loggedIn) this.log('CIERRE DE SESION', 'Apagado del equipo');
      this.power = false;
      this.booted = false;
      this.loggedIn = false;
      this.issue = null;
      this.screen = 'OFF';
      this.changed();
    }

    /** Avisar al SKL de que se ha insertado o retirado el CIK. */
    cikChanged() {
      if (!this.power || !this.booted) return;
      if (!this.env.cik()) {
        if (this.loggedIn) this.log('CIERRE DE SESION', 'CIK retirado');
        this.clearTimers();
        this.loggedIn = false;
        this.issue = null;
        this.screen = this.locked ? 'LOCKED' : 'CIK';
      } else if (this.screen === 'CIK') {
        this.screen = 'PIN';
        this.pin = '';
      }
      this.changed();
    }

    // ---------------------------------------------------------------- acciones
    act(action, arg) {
      if (!this.power || !this.booted) return;
      const fn = this['a_' + action];
      if (fn) fn.call(this, arg);
      this.changed();
    }

    a_pinDigit(d) {
      if (this.screen !== 'PIN' || this.pin.length >= 8) return;
      this.pin += String(d);
      this.message = null;
    }
    a_pinBack() {
      this.pin = this.pin.slice(0, -1);
    }
    a_pinOk() {
      if (this.screen !== 'PIN') return;
      if (!this.env.cik()) return this.nav('CIK');
      if (this.pin === TRAINING_PIN) {
        this.loggedIn = true;
        this.attempts = 0;
        this.pin = '';
        this.log('INICIO DE SESION', 'Operador');
        this.nav('HOME');
        return;
      }
      this.attempts++;
      this.pin = '';
      this.log('PIN INCORRECTO', `Intento ${this.attempts} de ${MAX_ATTEMPTS}`, false);
      if (this.attempts >= MAX_ATTEMPTS) {
        this.locked = true;
        this.log('BLOQUEO', 'Demasiados intentos de PIN', false);
        return this.nav('LOCKED');
      }
      this.message = `PIN incorrecto. Quedan ${MAX_ATTEMPTS - this.attempts} intentos.`;
    }
    a_adminUnlock() {
      this.locked = false;
      this.attempts = 0;
      this.log('DESBLOQUEO', 'Por el instructor');
      this.nav(this.env.cik() ? 'PIN' : 'CIK');
    }

    a_go(screen) {
      if (!this.loggedIn) return;
      if (screen === 'ISSUE') this.selected = this.selected.filter((id) => this.keyById(id));
      this.nav(screen);
    }
    a_logout() {
      this.log('CIERRE DE SESION', 'Operador');
      this.loggedIn = false;
      this.nav('PIN');
    }

    a_detail(id) {
      if (!this.keyById(id)) return;
      this.detailId = id;
      this.nav('DETAIL');
    }

    a_toggleSelect(id) {
      if (!this.keyById(id)) return;
      const i = this.selected.indexOf(id);
      if (i >= 0) this.selected.splice(i, 1);
      else this.selected.push(id);
    }

    a_issueReview() {
      if (!this.selected.length) {
        this.message = 'Seleccione al menos una clave.';
        return;
      }
      this.nav('ISSUE_CONFIRM');
    }

    a_setProtocol(p) {
      if (p === 'DS-101' || p === 'DS-102') {
        this.protocol = p;
        this.log('CONFIGURACION', `Protocolo de llenado ${p}`);
      }
    }

    a_issueGo() {
      if (!this.selected.length) return;
      this.issue = { queue: this.selected.slice(), idx: 0, results: [] };
      this.nav('ISSUING');
      this.issueStep();
    }

    issueStep() {
      const job = this.issue;
      if (!job) return;
      if (job.idx >= job.queue.length) {
        this.selected = [];
        this.nav('ISSUE_RESULT');
        return;
      }
      this.after(1200, () => {
        if (this.issue !== job) return;
        const key = this.keyById(job.queue[job.idx]);
        let r;
        if (!key) r = { ok: false, reason: 'Clave inexistente' };
        else if (this.isExpired(key)) r = { ok: false, reason: 'Clave CADUCADA: emisión bloqueada por el SKL' };
        else if (this.isPending(key)) r = { ok: false, reason: 'Clave aún no vigente' };
        else r = this.env.fill(key, this.protocol);
        if (key && r.ok) key.issued++;
        job.results.push({ tag: key ? key.tag : job.queue[job.idx], ok: r.ok, reason: r.reason, slot: r.slot, overwritten: r.overwritten });
        this.log('EMISION (FILL)', `${key ? key.tag : '?'} -> AN/PRC-117F ${r.ok ? 'slot ' + SIM.pad(r.slot) : ''} [${this.protocol}]${r.ok ? '' : ' : ' + r.reason}`, r.ok);
        job.idx++;
        this.changed();
        this.issueStep();
      });
    }

    a_newKey(type) {
      if (!KEY_TYPES[type]) return;
      let tag;
      do tag = `ENT-${type}-${String(Math.floor(this.env.random() * 900) + 100)}`;
      while (this.keyById(tag));
      const k = makeKey(this.env.now(), tag, type, 'Clave generada para entrenamiento', 0, 30);
      this.keys.push(k);
      this.log('GENERACION', `${tag} (${type})`);
      this.detailId = tag;
      this.nav('DETAIL');
    }

    a_askDelete(id) {
      if (!this.keyById(id)) return;
      this.detailId = id;
      this.nav('DEL_CONFIRM');
    }
    a_delete(id) {
      const k = this.keyById(id);
      if (!k) return;
      this.keys = this.keys.filter((x) => x.id !== id);
      this.selected = this.selected.filter((x) => x !== id);
      this.log('BORRADO DE CLAVE', k.tag);
      this.nav('KEYS');
    }

    a_zeroize() {
      const n = this.keys.length;
      this.keys = [];
      this.selected = [];
      this.log('ZEROIZE', `${n} claves eliminadas`);
      this.nav('HOME');
      this.message = 'Zeroize completado: base de datos vacía.';
    }

    a_restoreDb() {
      this.keys = defaultKeys(this.env.now());
      this.selected = [];
      this.log('RESTAURAR BD', 'Base de datos de entrenamiento');
      this.message = 'Base de datos de entrenamiento restaurada.';
    }

    // ---------------------------------------------------------------- persistencia
    serialize() {
      return { keys: this.keys, audit: this.audit.slice(0, 100), protocol: this.protocol, locked: this.locked, attempts: this.attempts };
    }
    load(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.keys)) this.keys = o.keys.filter((k) => k && k.tag && k.type);
      if (Array.isArray(o.audit)) this.audit = o.audit.filter((a) => a && a.action);
      if (o.protocol === 'DS-101' || o.protocol === 'DS-102') this.protocol = o.protocol;
      if (typeof o.locked === 'boolean') this.locked = o.locked;
      if (Number.isInteger(o.attempts)) this.attempts = o.attempts;
      this.changed();
    }
  }

  SKL.TRAINING_PIN = TRAINING_PIN;
  SKL.KEY_TYPES = KEY_TYPES;
  SKL.defaultKeys = defaultKeys;
  SIM.SKL = SKL;
})(typeof window !== 'undefined' ? window : globalThis);
