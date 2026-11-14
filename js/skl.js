/*
 * Modelo del Simple Key Loader AN/PYQ-10 (simulación de entrenamiento).
 *
 * Basado en el curso del SKL (carpeta Manuals/):
 *   - Encendido -> inicialización -> inicio de sesión (usuario y contraseña).
 *   - CIK: solo se inserta o retira con el equipo apagado.
 *   - Escritorio Core Library -> UAS (User Application Software) con las
 *     pestañas Plats, Eqs, Keys y SOI.
 *   - Carga de claves: Keys > seleccionar > LOAD > Protocol DS-101 / DS-102,
 *     Activation Mode KYK-13 > OK > «Ready to send key» > OK >
 *     «Press INITIATE button…» -> se pulsa ENT en la radio.
 *   - Loadset SINCGARS: Plats > loadset > LOAD > ICOM (+ hora) > asistente.
 *   - Auditoría: solo con cuenta SSO (Tools > SSO > Audit Functions).
 *   - Luz KOV, botón de zeroize, batería (verde/ámbar/rojo; a 1 % se apaga).
 *
 * Todas las claves son etiquetas ficticias de entrenamiento (ETD).
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;
  const DAY = 86400000;

  const ACCOUNTS = {
    operador: { pass: 'Operador1', role: 'USER' },
    sso: { pass: 'Sso12345', role: 'SSO' },
  };
  const MAX_ATTEMPTS = 3;

  function mk(now, tag, bank, type, desc, effDays, expDays, extra) {
    return Object.assign({
      id: tag, tag, bank, type, desc,
      edition: 'AB', segment: 1,
      eff: now + effDays * DAY, exp: now + expDays * DAY,
      variable: true, issued: 0, chk: SIM.checksum(tag),
    }, extra || {});
  }

  function defaultKeys(now) {
    return [
      mk(now, 'ETD-VIN-0001', 'VINSON', 'TEK', 'Red LOS de Cóndor 3', -10, 20),
      mk(now, 'ETD-VIN-0000', 'VINSON', 'TEK', 'Red LOS, periodo anterior', -40, -2),
      mk(now, 'ETD-AND-0031', 'ANDVT', 'TEK', 'SATCOM dedicado 5 kHz (Base Centauro)', -7, 23),
      mk(now, 'ETD-AND-0044', 'ANDVT', 'TEK', 'Red DAMA de Nodo Orión', -7, 23),
      mk(now, 'ETD-SAT-0007', 'SATELLITE', 'TSK', 'TSK de orderwire DAMA (EOW)', -7, 23),
      mk(now, 'ETD-MWOD', 'HAVEQUICK', 'WOD', 'MWOD HAVEQUICK del mes (posición = día UTC)', -10, 30),
      mk(now, 'ETD-KG8-0002', 'KG-84', 'TEK', 'Datos KG-84 (pendiente de variable)', -1, 29, { variable: false }),
      mk(now, 'ETD-VIN-KEK1', 'VINSON', 'KEK', 'KEK VINSON para OTAR', -30, 60),
    ];
  }

  function defaultLoadsets() {
    return [{
      name: 'LS-MANIOBRA',
      platform: 'VEH MANDO',
      teks: ['ETD-VIN-0101', 'ETD-VIN-0102', 'ETD-VIN-0103', 'ETD-VIN-0104', 'ETD-VIN-0105'],
      kek: 'ETD-VIN-KEK6',
      coldStart: 'ETD-HOP-H0',
      hopsets: [
        { tag: 'ETD-HOP-H1', netId: 345 },
        { tag: 'ETD-HOP-H2', netId: 346 },
        { tag: 'ETD-HOP-H3', netId: 400 },
        { tag: 'ETD-HOP-H4', netId: 401 },
        { tag: 'ETD-HOP-H5', netId: 500 },
        { tag: 'ETD-HOP-H6', netId: 501 },
      ],
    }];
  }

  const PLATFORMS = [{ name: 'VEH MANDO', bussed: 'Non-Bussed', equipment: ['AN/PRC-117F (RT-1796)'] }];
  const EQUIPMENT = [{ name: 'AN/PRC-117F', type: 'RT-1796', fills: 'J1 AUDIO/DATA/FILL', protocols: 'DS-101 / DS-102' }];

  /**
   * Conecta el SKL con la radio por el conector J1.
   * getConn().j1 === 'SKL' indica que el cable de llenado está en J1.
   */
  SIM.connectFill = (getConn, radio, skl) => {
    radio.env.fillPull = (req) => skl.providePull(req, getConn());
    skl.env.pushLoadset = (ls, includeTime) => {
      if (getConn().j1 !== 'SKL') return { ok: false, reason: 'El SKL no está conectado a J1 de la radio' };
      return radio.receiveLoadset(ls, includeTime);
    };
  };

  class SKL extends SIM.Device {
    /** env.cik() -> bool ; env.pushLoadset(ls, includeTime) -> { ok, reason } */
    constructor(env) {
      super(env);
      if (!this.env.cik) this.env.cik = () => true;
      if (!this.env.pushLoadset) this.env.pushLoadset = () => ({ ok: false, reason: 'Sin equipo' });
      this.hardReset();
    }

    hardReset() {
      this.clearTimers();
      this.power = false;
      this.booted = false;
      this.user = null;
      this.screen = 'OFF';
      this.tab = 'KEYS';
      this.attempts = 0;
      this.locked = false;
      this.kov = 'OFF';
      this.battery = 100;
      this.keys = defaultKeys(this.env.now());
      this.loadsets = defaultLoadsets();
      this.audit = [];
      this.selected = [];
      this.selLoadset = null;
      this.protocol = 'DS-102';
      this.activation = 'KYK-13';
      this.send = null;
      this.icom = null;
      this.dialog = null;
      this.message = null;
      this.uasOpen = false;
      this.lowWarned = false;
      this.changed();
    }

    get loggedIn() {
      return !!this.user;
    }
    get isSSO() {
      return !!this.user && this.user.role === 'SSO';
    }
    keyById(id) {
      return this.keys.find((k) => k.id === id);
    }
    keyStatus(k) {
      const now = this.env.now();
      if (!k.variable) return 'TAG';
      if (k.exp < now) return 'RED';
      if (k.eff > now) return 'PENDING';
      return 'YELLOW';
    }

    log(action, detail, ok = true) {
      this.audit.unshift({ t: this.env.now(), user: this.user ? this.user.name : '-', action, detail, ok });
      if (this.audit.length > 300) this.audit.length = 300;
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
      if (this.battery <= 1) return;
      this.power = true;
      this.booted = false;
      this.screen = 'BOOT';
      this.cikAtBoot = this.env.cik();
      this.changed();
      this.after(2000, () => {
        this.booted = true;
        this.screen = this.locked ? 'LOCKED' : this.env.cik() ? 'LOGIN' : 'CIK';
        this.changed();
      });
    }

    powerOff() {
      if (this.uasOpen || this.user) {
        this.log('APAGADO', this.uasOpen ? 'Apagado con la UAS abierta (orden correcto: salir de UAS, cerrar sesión, apagar)' : 'Apagado sin cerrar sesión', false);
      }
      this.clearTimers();
      this.power = false;
      this.booted = false;
      this.user = null;
      this.uasOpen = false;
      this.send = null;
      this.icom = null;
      this.dialog = null;
      this.kov = 'OFF';
      this.screen = 'OFF';
      this.changed();
    }

    /** Avisar de que se ha insertado o retirado el CIK. */
    cikChanged() {
      if (!this.power) return;
      this.log('ALARMA', 'CIK insertado/retirado con el equipo encendido (solo debe hacerse apagado)', false);
      this.user = null;
      this.uasOpen = false;
      this.send = null;
      this.icom = null;
      this.dialog = null;
      this.kov = 'OFF';
      this.screen = this.env.cik() ? 'LOGIN' : 'CIK';
      this.message = 'Alarma: el CIK solo se inserta o retira con el SKL apagado.';
      this.changed();
    }

    tick(dt) {
      if (!this.power) return;
      const before = Math.ceil(this.battery);
      this.battery = Math.max(0, this.battery - dt * 0.004);
      if (this.battery <= 2 && !this.lowWarned) {
        this.lowWarned = true;
        this.message = 'Batería al 2 %: recargue o cambie el paquete de baterías.';
      }
      if (this.battery <= 1) {
        this.log('APAGADO AUTOMATICO', 'Batería al 1 %', false);
        this.powerOff();
        return;
      }
      if (Math.ceil(this.battery) !== before) this.changed();
    }

    replaceBattery() {
      this.battery = 100;
      this.lowWarned = false;
      this.changed();
    }

    /** Botón físico de zeroize: borra todas las claves y la base de datos. */
    zeroize() {
      if (!this.power) return;
      const n = this.keys.length + this.loadsets.length;
      this.keys = [];
      this.loadsets = [];
      this.selected = [];
      this.send = null;
      this.icom = null;
      this.dialog = null;
      this.log('ZEROIZE', `Botón de zeroize: ${n} elementos eliminados; KOV-21 a cero`);
      this.kov = this.user ? 'GREEN' : 'OFF';
      this.message = 'ZEROIZE completado: base de datos vacía.';
      this.changed();
    }

    // ---------------------------------------------------------------- acciones de la interfaz
    act(action, arg) {
      if (!this.power || !this.booted) return;
      const fn = this['a_' + action];
      if (fn) fn.call(this, arg);
      this.changed();
    }

    a_login(arg) {
      if (this.screen !== 'LOGIN') return;
      if (!this.env.cik()) return this.nav('CIK');
      const name = String((arg && arg.user) || '').trim().toLowerCase();
      const acc = ACCOUNTS[name];
      if (acc && arg.pass === acc.pass) {
        this.user = { name, role: acc.role };
        this.attempts = 0;
        this.kov = 'GREEN';
        this.log('INICIO DE SESION', `${name} (${acc.role})`);
        this.nav('DESKTOP');
        return;
      }
      this.attempts++;
      this.log('INICIO DE SESION FALLIDO', `Usuario «${name || '?'}» · intento ${this.attempts} de ${MAX_ATTEMPTS}`, false);
      if (this.attempts >= MAX_ATTEMPTS) {
        this.locked = true;
        this.log('BLOQUEO', 'Demasiados intentos fallidos', false);
        return this.nav('LOCKED');
      }
      this.message = `Usuario o contraseña incorrectos. Quedan ${MAX_ATTEMPTS - this.attempts} intentos.`;
    }

    a_adminUnlock() {
      this.locked = false;
      this.attempts = 0;
      this.log('DESBLOQUEO', 'Por el instructor');
      this.nav(this.env.cik() ? 'LOGIN' : 'CIK');
    }

    a_logout() {
      if (this.uasOpen) {
        this.message = 'Primero salga de la UAS (orden: salir de UAS, cerrar sesión, apagar).';
        return;
      }
      this.log('CIERRE DE SESION', this.user ? this.user.name : '');
      this.user = null;
      this.screen = 'LOGOUT';
      this.after(1500, () => {
        this.kov = 'OFF';
        this.screen = 'LOGIN';
        this.changed();
      });
    }

    a_launchUAS() {
      if (!this.user) return;
      this.screen = 'UAS_LOADING';
      this.after(1800, () => {
        this.screen = 'UAS_STARTUP';
        this.changed();
      });
    }
    a_startupOk() {
      this.uasOpen = true;
      this.log('UAS', 'Aplicación de usuario iniciada');
      this.nav('UAS');
    }
    a_exitUAS() {
      this.uasOpen = false;
      this.send = null;
      this.icom = null;
      this.dialog = null;
      this.nav('DESKTOP');
    }
    a_tab(t) {
      if (['PLATS', 'EQS', 'KEYS', 'SOI'].includes(t)) {
        this.tab = t;
        this.dialog = null;
      }
    }
    a_tools() {
      this.dialog = 'TOOLS';
    }
    a_audit() {
      if (!this.isSSO) {
        this.dialog = 'DENIED';
        this.log('AUDITORIA', 'Acceso denegado: requiere SSO', false);
        return;
      }
      this.log('AUDITORIA', 'Consulta del registro de auditoría');
      this.dialog = null;
      this.nav('AUDIT');
    }
    a_back() {
      this.dialog = null;
      this.nav(this.uasOpen ? 'UAS' : 'DESKTOP');
    }
    a_closeDlg() {
      this.dialog = null;
    }

    a_toggleKey(id) {
      if (!this.keyById(id)) return;
      const i = this.selected.indexOf(id);
      if (i >= 0) this.selected.splice(i, 1);
      else this.selected.push(id);
    }
    a_keyInfo(id) {
      if (!this.keyById(id)) return;
      this.infoId = id;
      this.dialog = 'KEYINFO';
    }

    a_expired() {
      this.dialog = 'EXPIRED';
    }
    a_destroyExpired() {
      const exp = this.keys.filter((k) => this.keyStatus(k) === 'RED');
      this.keys = this.keys.filter((k) => this.keyStatus(k) !== 'RED');
      this.selected = this.selected.filter((id) => this.keyById(id));
      exp.forEach((k) => this.log('DESTRUCCION', `Clave caducada ${k.tag}`));
      this.message = exp.length ? `${exp.length} clave(s) caducada(s) destruida(s).` : 'No hay claves caducadas.';
      this.dialog = null;
    }

    // ---- carga de claves individuales
    a_load() {
      if (this.tab === 'PLATS') return this.a_loadLoadset();
      if (this.tab !== 'KEYS') {
        this.message = 'Seleccione claves en la pestaña Keys o un loadset en Plats.';
        return;
      }
      const keys = this.selected.map((id) => this.keyById(id)).filter(Boolean);
      if (!keys.length) {
        this.message = 'Seleccione al menos una clave.';
        return;
      }
      const bad = keys.find((k) => this.keyStatus(k) === 'TAG');
      if (bad) {
        this.message = `${bad.tag}: es solo una etiqueta (KEY TAG), falta la variable.`;
        return;
      }
      const red = keys.find((k) => this.keyStatus(k) === 'RED');
      if (red) {
        this.message = `${red.tag}: clave caducada (RED KEY). No se puede cargar; destrúyala (View > Expired Keys).`;
        this.log('CARGA RECHAZADA', `${red.tag} caducada`, false);
        return;
      }
      this.dialog = 'LOAD';
    }
    a_setProtocol(p) {
      if (p === 'DS-101' || p === 'DS-102') this.protocol = p;
    }
    a_setActivation(a) {
      this.activation = a;
    }
    a_loadOk() {
      const queue = this.selected.slice();
      this.send = { queue, idx: 0, stage: 'READY', protocol: this.protocol, activation: this.protocol === 'DS-102' ? this.activation : 'DS-101' };
      this.dialog = null;
      this.screen = 'SEND';
    }
    a_readyOk() {
      if (!this.send) return;
      this.send.stage = 'WAIT';
      this.log('CARGA', `Preparada ${this.currentSendKey().tag} [${this.send.protocol}${this.send.protocol === 'DS-102' ? ' ' + this.send.activation : ''}]`);
    }
    a_cancelSend() {
      if (this.send && this.send.stage !== 'DONE') this.log('CARGA', 'Cancelada por el operador', false);
      this.send = null;
      this.nav('UAS');
    }
    a_nextKey() {
      if (!this.send) return;
      this.send.idx++;
      this.send.stage = this.send.idx < this.send.queue.length ? 'READY' : 'DONE';
    }
    currentSendKey() {
      return this.send ? this.keyById(this.send.queue[this.send.idx]) : null;
    }

    /** La radio pide la clave (ENT en «PRESS ENTER TO INITIATE»). */
    providePull(req, conn) {
      if (conn.j1 !== 'SKL') return { ok: false, reason: 'No hay dispositivo de llenado conectado en J1' };
      if (req.device === 'CYZ10-RDS') return { ok: false, wait: true, reason: 'Esperando loadset' };
      if (!this.power || !this.user || !this.send || this.send.stage !== 'WAIT') {
        return { ok: false, wait: true, reason: 'El SKL no estaba en «Press INITIATE button…» cuando se pulsó ENT en la radio' };
      }
      const s = this.send;
      const want = req.device === 'KYK-13' ? 'DS-102' : 'DS-101';
      if (s.protocol !== want) {
        this.log('CARGA', `Fallo: la radio espera ${want} y el SKL envía ${s.protocol}`, false);
        return { ok: false, reason: `Protocolo distinto: la radio (FILL DEVICE ${req.device}) espera ${want} y el SKL envía ${s.protocol}` };
      }
      if (want === 'DS-102' && s.activation !== 'KYK-13') return { ok: false, reason: 'En DS-102 el modo de activación debe ser KYK-13' };
      const key = this.currentSendKey();
      key.issued++;
      s.stage = 'SENT';
      this.log('CLAVE TRANSMITIDA', `${key.tag} -> AN/PRC-117F (${req.crypto} ${req.keyType}${req.keyType === 'KEK' || req.keyType === 'TRKEK' ? '' : ' ' + SIM.pad(req.num)}) [${s.protocol}]`);
      this.changed();
      return { ok: true, key: { tag: key.tag, bank: key.bank, type: key.type }, protocol: s.protocol };
    }

    // ---- loadset SINCGARS por ICOM
    a_selectLoadset(name) {
      this.selLoadset = this.selLoadset === name ? null : name;
    }
    a_loadLoadset() {
      const ls = this.loadsets.find((l) => l.name === this.selLoadset);
      if (!ls) {
        this.message = 'Seleccione un loadset en la pestaña Plats.';
        return;
      }
      this.icom = { ls, includeTime: false, stage: 'MODE', status: [] };
      this.screen = 'ICOM';
    }
    a_icomTime() {
      if (this.icom) this.icom.includeTime = !this.icom.includeTime;
    }
    a_icomNext() {
      const order = ['MODE', 'WIZARD', 'CONNECT', 'PROFILES'];
      const i = order.indexOf(this.icom.stage);
      if (i >= 0 && i < order.length - 1) this.icom.stage = order[i + 1];
    }
    a_icomSend() {
      const ic = this.icom;
      if (!ic || ic.stage !== 'PROFILES') return;
      const r = this.env.pushLoadset(ic.ls, ic.includeTime);
      ic.stage = 'SENDING';
      ic.status = ['Initializing Fill Port…', 'Press LOAD Button.'];
      if (!r.ok) {
        this.after(1200, () => {
          ic.stage = 'FAIL';
          ic.status.push('Error: ' + r.reason);
          this.log('LOADSET', `${ic.ls.name}: fallo (${r.reason})`, false);
          this.changed();
        });
        return;
      }
      const steps = [...ic.ls.teks.map((_, i) => `Sending TEK #${i + 1}`), 'Sending KEK #6', 'Sending Cold Start TSK', ...ic.ls.hopsets.map((_, i) => `Sending Hopset #${i + 1}`), 'Sending Lockouts'];
      steps.forEach((st, i) => this.after(250 * (i + 1), () => {
        ic.status.push(st);
        this.changed();
      }));
      this.after(250 * (steps.length + 1), () => {
        ic.stage = 'DONE';
        ic.status.push('ICOM transfer successful. Re-load equipment.');
        this.log('LOADSET', `${ic.ls.name} -> AN/PRC-117F (ICOM${ic.includeTime ? ', con hora' : ''})`);
        this.changed();
      });
    }
    a_icomClose() {
      this.icom = null;
      this.nav('UAS');
    }

    // ---------------------------------------------------------------- persistencia
    serialize() {
      return { v: 2, keys: this.keys, loadsets: this.loadsets, audit: this.audit.slice(0, 150), locked: this.locked, attempts: this.attempts, protocol: this.protocol, activation: this.activation, battery: this.battery };
    }
    load(o) {
      if (!o || typeof o !== 'object' || o.v !== 2) return;
      if (Array.isArray(o.keys)) this.keys = o.keys.filter((k) => k && k.tag && k.bank);
      if (Array.isArray(o.loadsets)) this.loadsets = o.loadsets.filter((l) => l && l.name && Array.isArray(l.hopsets));
      if (Array.isArray(o.audit)) this.audit = o.audit.filter((a) => a && a.action);
      if (typeof o.locked === 'boolean') this.locked = o.locked;
      if (Number.isInteger(o.attempts)) this.attempts = o.attempts;
      if (o.protocol === 'DS-101' || o.protocol === 'DS-102') this.protocol = o.protocol;
      if (typeof o.activation === 'string') this.activation = o.activation;
      if (Number.isFinite(o.battery)) this.battery = Math.max(2, Math.min(100, o.battery));
      this.changed();
    }
  }

  SKL.ACCOUNTS = ACCOUNTS;
  SKL.PLATFORMS = PLATFORMS;
  SKL.EQUIPMENT = EQUIPMENT;
  SKL.defaultKeys = defaultKeys;
  SIM.SKL = SKL;
})(typeof window !== 'undefined' ? window : globalThis);
