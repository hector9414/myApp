/*
 * Modelo del Simple Key Loader AN/PYQ-10 (simulación de entrenamiento).
 *
 * Reproduce la interfaz Windows CE del curso del SKL (Manuals/):
 *   - Escritorio, barra de tareas (inicio, programa activo, batería, fecha) y
 *     menú Inicio (Programs > calibrate, CoreLib, SKL Settings).
 *   - Core Library: menús Session / Tools / Launch / Help, inicialización de
 *     la tarjeta INFOSEC (Default SSO Login con DEFAULTPIN, emparejado del
 *     KOV-21, «Use External CIK?», Change Password) e inicio de sesión.
 *   - UAS (se abre automáticamente tras iniciar sesión): menús File / View /
 *     Settings, iconos RECV y LOAD, pestañas Plats / Eqs / Keys / SOI en árbol.
 *   - Carga de claves: Protocol DS-101 / DS-102 y Activation Mode KYK-13,
 *     «Ready to Send Key», ventana Status con «Press INITIATE Button…».
 *   - Loadset SINCGARS por ICOM (SINCGARS Mode, Load ECU Wizard).
 *   - Expired Keys, Segment (información de clave), Summary Status,
 *     AUDIT TRAIL (solo SSO), apagado con cuenta atrás de 10 s, KOV, zeroize.
 *
 * Todas las claves son ficticias (designación ETD de entrenamiento).
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;
  const DAY = 86400000;
  const MAX_ATTEMPTS = 3;
  const ACCOUNT = '5AT900'; // cuenta COMSEC ficticia

  function mk(now, st, desig, suffix, text, bank, type, desc, effD, expD, extra) {
    return Object.assign({
      id: st, tag: st, edition: 'A', segment: 1, desig, suffix, text, bank, type, desc,
      eff: now + effD * DAY, exp: now + expD * DAY, variable: true, issued: 0,
      source: 'KOK-22(KP)', cls: 'Unclassified',
    }, extra || {});
  }

  function defaultKeys(now) {
    return [
      mk(now, `ETD 01 ${ACCOUNT}`, 'T000', '1', 'LOS TEK', 'VINSON', 'TEK', 'Red LOS de Cóndor 3 (VINSON)', -10, 20),
      mk(now, `ETD 02 ${ACCOUNT}`, 'T000', '2', 'OLD TEK', 'VINSON', 'TEK', 'Red LOS, periodo anterior', -40, -2),
      mk(now, `ETD 31 ${ACCOUNT}`, 'T000', '31', 'SAT TEK', 'ANDVT', 'TEK', 'SATCOM dedicado 5 kHz (Base Centauro)', -7, 23),
      mk(now, `ETD 44 ${ACCOUNT}`, 'T000', '44', 'DAMA TEK', 'ANDVT', 'TEK', 'DAMA (Nodo Orión)', -7, 23),
      mk(now, `ETD 07 ${ACCOUNT}`, 'S000', '7', 'EOW TSK', 'SATELLITE', 'TSK', 'Orderwire DAMA', -7, 23),
      mk(now, `ETD 50 ${ACCOUNT}`, 'W000', '11', 'MWOD', 'HAVEQUICK', 'WOD', 'MWOD HAVEQUICK del mes', -10, 30),
      mk(now, `ETD 60 ${ACCOUNT}`, 'T000', '60', 'DATA TEK', 'KG-84', 'TEK', 'KG-84 (falta la variable)', -1, 29, { variable: false }),
      mk(now, `ETD 04 ${ACCOUNT}`, 'KAAA', '3', '1QTR KEK', 'VINSON', 'KEK', 'KEK VINSON', -30, 60),
    ];
  }

  function defaultLoadset() {
    return {
      name: 'SINCGARS',
      type: 'RT-1523',
      teks: [11, 12, 13, 14, 15].map((n) => `ETD ${n} ${ACCOUNT}`),
      kek: `ETD 16 ${ACCOUNT}`,
      coldStart: `ETD 20 ${ACCOUNT}`,
      hopsets: [345, 346, 400, 401, 500, 501].map((netId, i) => ({ tag: `ETD ${21 + i} ${ACCOUNT}`, netId })),
    };
  }

  /** Conecta el SKL con la radio por el conector J1. */
  SIM.connectFill = (getConn, radio, skl) => {
    radio.env.fillPull = (req) => skl.providePull(req, getConn());
    skl.env.pushLoadset = (ls, includeTime) => {
      if (getConn().j1 !== 'SKL') return { ok: false, reason: 'El SKL no está conectado a J1 de la radio' };
      return radio.receiveLoadset(ls, includeTime);
    };
  };

  const fmtAudit = (t) => {
    const d = new Date(t);
    const p = SIM.pad;
    return `${p(d.getMonth() + 1)} / ${p(d.getDate())} / ${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const fmtShortDate = (t) => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
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
      this.win = 'DESKTOP';
      this.dialogs = [];
      this.menu = null;
      this.startMenu = false;
      this.switcher = false;
      this.user = null;
      this.uasOpen = false;
      this.tab = 'PLATS';
      this.sel = { PLATS: null, EQS: null, KEYS: null, SOI: null };
      this.expanded = new Set(['soi:ed', 'soi:grp', 'soi:g1', 'soi:tp1', 'plat:VEH MANDO', 'eq:SINCGARS']);
      this.card = 'UNINIT';
      this.ssoPass = null;
      this.users = { OPERADOR: { pass: 'Operador1' } };
      this.attempts = 0;
      this.locked = false;
      this.kov = 'OFF';
      this.battery = 100;
      this.nvg = false;
      this.bright = 3;
      this.keys = defaultKeys(this.env.now());
      this.loadset = defaultLoadset();
      this.audit = [];
      this.protocol = 'DS-102';
      this.activation = 'KYK-13';
      this.send = null;
      this.icom = null;
      this.dirty = false;
      this.progress = null;
      this.shutdown = null;
      this.lowWarnAt = 0;
      this.log('Audit Trail Initialized.');
      this.changed();
    }

    // ---------------------------------------------------------------- utilidades
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
      if (!k.variable) return k.exp < now ? 'EXPTAG' : 'TAG';
      if (k.exp < now) return 'RED';
      if (k.eff > now) return 'PENDING';
      return 'YELLOW';
    }
    segLabel(k) {
      return `${k.segment}-${k.desig}-${k.suffix}-${k.text}`;
    }
    log(text, ok = true) {
      this.audit.unshift({ t: this.env.now(), text, ok });
      if (this.audit.length > 300) this.audit.length = 300;
    }
    get dateText() {
      return fmtShortDate(this.env.now());
    }
    get dlg() {
      return this.dialogs[this.dialogs.length - 1] || null;
    }
    push(d) {
      this.dialogs.push(d);
      this.menu = null;
      this.startMenu = false;
      this.switcher = false;
    }
    pop() {
      this.dialogs.pop();
    }
    /** Cuadro de mensaje estilo Windows CE. */
    msgBox(title, text, icon = 'i', next, buttons = ['OK']) {
      this.push({ type: 'MSG', title, text, icon, buttons, next });
    }
    confirm(title, text, yes, icon = '!') {
      this.push({ type: 'MSG', title, text, icon, buttons: ['Yes', 'No'], next: (b) => { if (b === 'Yes') yes(); } });
    }
    showProgress(text, ms, next) {
      this.progress = { text };
      this.changed();
      this.after(ms, () => {
        this.progress = null;
        if (next) next();
        this.changed();
      });
    }

    // ---------------------------------------------------------------- energía
    powerButton() {
      if (!this.power) return this.powerOn();
      if (this.shutdown) {
        // abortar el apagado
        this.clearShutdown();
        return this.changed();
      }
      this.shutdown = { n: 10 };
      const tick = () => {
        if (!this.shutdown) return;
        this.shutdown.n--;
        if (this.shutdown.n <= 0) return this.powerOff();
        this._shTimer = this.after(1000, tick);
        this.changed();
      };
      this._shTimer = this.after(1000, tick);
      this.changed();
    }
    clearShutdown() {
      if (this._shTimer) this.env.clearTimeout(this._shTimer);
      this._timers.delete(this._shTimer);
      this.shutdown = null;
    }

    powerOn() {
      if (this.battery <= 1) return;
      this.power = true;
      this.booted = false;
      this.win = 'BOOT';
      this.dialogs = [];
      this.changed();
      this.after(2000, () => {
        this.booted = true;
        this.win = 'CORELIB';
        this.startCoreLib();
        this.changed();
      });
    }

    startCoreLib() {
      if (!this.env.cik()) {
        this.msgBox('Core Lib', 'No CIK detected. Turn the SKL off, insert the CIK and turn it on again.', '!');
        return;
      }
      if (this.locked) return this.msgBox('Core Lib', 'Max logon attempts. The account is locked.', '!', null, ['OK', 'Desbloqueo (instructor)']);
      if (this.card === 'UNINIT') this.push({ type: 'DEFAULT_SSO' });
      else this.push({ type: 'LOGIN' });
    }

    powerOff() {
      if (this.uasOpen || this.user) this.log(this.uasOpen ? 'Power off with UAS open (order: Exit UAS, Logout, Power).' : 'Power off without logout.', false);
      this.clearTimers();
      this.power = false;
      this.booted = false;
      this.user = null;
      this.uasOpen = false;
      this.send = null;
      this.icom = null;
      this.dialogs = [];
      this.menu = null;
      this.progress = null;
      this.shutdown = null;
      this.kov = 'OFF';
      this.win = 'DESKTOP';
      this.changed();
    }

    /** Se insertó o retiró el CIK. */
    cikChanged() {
      if (!this.power) return;
      this.log('Alarm: CIK removed/inserted while powered.', false);
      this.user = null;
      this.uasOpen = false;
      this.send = null;
      this.icom = null;
      this.dialogs = [];
      this.kov = 'OFF';
      this.win = 'CORELIB';
      this.msgBox('Core Lib', 'CIK change detected. Insert or remove the CIK only while the SKL is turned off.', '!');
      this.changed();
    }

    tick(dt) {
      if (!this.power) return;
      const before = Math.ceil(this.battery);
      this.battery = Math.max(0, this.battery - dt * 0.004);
      if (this.battery <= 1) {
        this.log('Automatic shutdown: battery 1%.', false);
        return this.powerOff();
      }
      if (this.battery <= 2 && this.env.now() - this.lowWarnAt > 30000) {
        this.lowWarnAt = this.env.now();
        this.push({ type: 'LOWBAT' });
      }
      if (Math.ceil(this.battery) !== before) this.changed();
    }
    replaceBattery() {
      this.battery = 100;
      this.dialogs = this.dialogs.filter((d) => d.type !== 'LOWBAT');
      this.changed();
    }

    /** Botón físico de zeroize: borra las claves y pone a cero la tarjeta KOV-21. */
    zeroize() {
      if (!this.power) return;
      const n = this.keys.length;
      this.keys = [];
      this.loadset = null;
      this.send = null;
      this.icom = null;
      this.user = null;
      this.uasOpen = false;
      this.card = 'UNINIT';
      this.kov = 'OFF';
      this.dialogs = [];
      this.win = 'CORELIB';
      this.log(`INFOSEC zeroized (${n} keys).`);
      this.msgBox('Core Lib', 'INFOSEC card zeroized. All key material has been deleted.', '!', () => this.startCoreLib());
      this.changed();
    }

    // ---------------------------------------------------------------- despacho
    act(action, arg) {
      if (!this.power || !this.booted) return;
      const fn = this['a_' + action];
      if (fn) fn.call(this, arg);
      this.changed();
    }

    a_start() {
      this.startMenu = !this.startMenu;
      this.switcher = false;
      this.menu = null;
    }
    a_switcher() {
      this.switcher = !this.switcher;
      this.startMenu = false;
      this.menu = null;
    }
    a_focus(w) {
      this.startMenu = false;
      this.switcher = false;
      if (w === 'UAS' && !this.uasOpen) return;
      if (['DESKTOP', 'CORELIB', 'UAS'].includes(w)) this.win = w;
    }
    a_menu(path) {
      this.startMenu = false;
      this.switcher = false;
      if (this.dlg) return;
      if (this.menu === path) this.menu = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null;
      else this.menu = path;
    }
    a_menuClose() {
      this.menu = null;
      this.startMenu = false;
      this.switcher = false;
    }
    a_cmd(id) {
      this.menu = null;
      this.startMenu = false;
      this.switcher = false;
      const fn = this['c_' + id];
      if (fn) fn.call(this);
      else this.msgBox('SKL', 'Función no simulada en el entrenador.', 'i');
    }
    a_dlg(arg) {
      const d = this.dlg;
      if (!d) return;
      const fn = this['d_' + d.type];
      if (fn) fn.call(this, arg.btn, arg.fields || {}, d);
    }
    a_tab(t) {
      if (['PLATS', 'EQS', 'KEYS', 'SOI'].includes(t)) this.tab = t;
      this.menu = null;
    }
    a_select(id) {
      this.sel[this.tab] = id;
      this.menu = null;
    }
    a_toggle(id) {
      if (this.expanded.has(id)) this.expanded.delete(id);
      else this.expanded.add(id);
      this.sel[this.tab] = id;
    }
    a_open(id) {
      this.sel[this.tab] = id;
      const k = this.keyFromNode(id);
      if (k) return this.showSegment(k);
      this.a_toggle(id);
    }
    /** Botones físicos: 1-4, cruceta y brillo. */
    a_hw(b) {
      if (b === '1') return this.a_start();
      if (b === '2') {
        if (this.user && !this.uasOpen && !this.dlg) return this.c_launchUAS();
        if (this.uasOpen) this.win = 'UAS';
        return;
      }
      if (b === '3') {
        this.nvg = !this.nvg;
        return;
      }
      if (b === '4') return;
      if (b === 'BRIGHT+') this.bright = Math.min(4, this.bright + 1);
      if (b === 'BRIGHT-') this.bright = Math.max(1, this.bright - 1);
      if (['UP', 'DOWN', 'OK', 'LEFT', 'RIGHT'].includes(b)) this.navTree(b);
    }
    navTree(b) {
      if (this.win !== 'UAS' || this.dlg) return;
      const flat = this.visibleNodes();
      if (!flat.length) return;
      const cur = flat.findIndex((n) => n.id === this.sel[this.tab]);
      if (b === 'UP') this.sel[this.tab] = flat[Math.max(0, cur - 1)].id;
      else if (b === 'DOWN') this.sel[this.tab] = flat[Math.min(flat.length - 1, cur + 1)].id;
      else if (cur >= 0) {
        const n = flat[cur];
        if (b === 'RIGHT') this.expanded.add(n.id);
        else if (b === 'LEFT') this.expanded.delete(n.id);
        else this.a_open(n.id);
      }
    }

    // ---------------------------------------------------------------- árboles de la UAS
    tree(tab = this.tab) {
      const N = (id, label, icon, children, extra) => Object.assign({ id, label, icon, children: children || [] }, extra || {});
      if (tab === 'KEYS') {
        return this.keys.map((k) => N(`st:${k.id}`, k.tag, 'st', [
          N(`ed:${k.id}`, k.edition, 'ed', [N(`seg:${k.id}`, this.segLabel(k), this.keyStatus(k), [], { key: k.id })]),
        ]));
      }
      const ls = this.loadset;
      const lsNode = (prefix) => (ls ? N(`${prefix}:SINCGARS`, 'SINCGARS', 'eq', [
        ...ls.teks.map((t, i) => N(`${prefix}:loc:C${i + 1}`, `C${i + 1}`, 'loc', [N(`${prefix}:k:C${i + 1}`, `${t} TEK`, 'YELLOW')])),
        N(`${prefix}:loc:C6`, 'C6', 'loc', [N(`${prefix}:k:C6`, `${ls.kek} KEK`, 'YELLOW')]),
        N(`${prefix}:loc:H0`, 'H0', 'loc'),
        ...ls.hopsets.map((h, i) => N(`${prefix}:loc:H${i + 1}`, `H${i + 1}`, 'loc', [N(`${prefix}:h:${i}`, `F${SIM.pad(h.netId, 3)}`, 'hop')])),
      ], { loadset: true }) : null);
      if (tab === 'EQS') {
        return [lsNode('eq'), N('eq:RT1 PRC117F', 'RT1 PRC117F', 'eq', [N('eq:RT1 PRC117F:loc', 'J1 ADF', 'loc')])].filter(Boolean);
      }
      if (tab === 'PLATS') {
        return [
          N('plat:VEH MANDO', 'VEH MANDO', 'plat', [lsNode('pe'), N('pe:RT1 PRC117F', 'RT1 PRC117F', 'eq')].filter(Boolean)),
          N('plat:TOC', 'BDE TOC', 'plat'),
        ];
      }
      // SOI: edición, grupo, periodos, pirotecnia, humos y referencia rápida
      const st = SIM.Net ? SIM.Net.STATIONS : [];
      const sat = SIM.Net ? SIM.Net.SATELLITE : { name: '', az: 0, el: 0 };
      return [
        N('soi:ed', 'Edition A', 'ed'),
        N('soi:grp', 'Group', 'soi', [
          N('soi:g1', '1-12 INF - STD', 'soi', [
            N('soi:tp1', 'Time Period: 1', 'soi', st.map((s) => N(`soi:st:${s.id}`, `${s.call.toUpperCase()}: ${s.soi}`, 'soiitem'))),
            ...[2, 3, 4, 5].map((n) => N(`soi:tp${n}`, `Time Period: ${n}`, 'soi')),
          ]),
        ]),
        N('soi:pyro', 'Pyro', 'soi'),
        N('soi:smoke', 'Smoke', 'soi'),
        N('soi:qr', 'Quick Reference', 'soi', [
          N('soi:qr:sat', `SAT ${sat.name}: AZ ${sat.az} EL ${sat.el}`, 'soiitem'),
          N('soi:qr:codes', 'SATCOM CODES: 009-128 25K, 129-239 5K', 'soiitem'),
        ]),
      ];
    }
    visibleNodes() {
      const out = [];
      const walk = (nodes, depth) => nodes.forEach((n) => {
        out.push(Object.assign({ depth }, n));
        if (n.children.length && this.expanded.has(n.id)) walk(n.children, depth + 1);
      });
      walk(this.tree(), 0);
      return out;
    }
    keyFromNode(id) {
      if (!id) return null;
      const m = /^(st|ed|seg):(.+)$/.exec(id);
      return m ? this.keyById(m[2]) : null;
    }
    selectedIsLoadset() {
      const id = this.sel[this.tab] || '';
      return (this.tab === 'PLATS' || this.tab === 'EQS') && /SINCGARS/.test(id) && !!this.loadset;
    }

    // ---------------------------------------------------------------- diálogos
    d_MSG(btn, f, d) {
      this.pop();
      if (btn === 'Desbloqueo (instructor)') {
        this.locked = false;
        this.attempts = 0;
        this.log('Account unlocked (instructor).');
        return this.startCoreLib();
      }
      if (d.next) d.next(btn);
    }
    d_LOWBAT() {
      this.pop();
    }
    d_DEFAULT_SSO(btn, f) {
      if (btn !== 'OK') return this.pop();
      if (String(f.user || '').toUpperCase() === 'SSO' && f.pass === 'DEFAULTPIN') {
        this.pop();
        this.log('SSO created.');
        this.msgBox('Core Lib', 'INFOSEC Card Serial Number KOV-21 0020705 has been paired with this Host PC. logon will continue', 'i', () => {
          this.push({ type: 'MSG', title: 'Core Lib', text: 'Use External CIK?', icon: '?', buttons: ['OK'], next: () => this.push({ type: 'CHANGE_PW', userId: 'SSO', init: true }) });
        });
        return;
      }
      this.log('Unsuccessful SSO logon attempt.', false);
      this.msgBox('Core Lib', 'Invalid user ID or password.', '!');
    }
    d_CHANGE_PW(btn, f, d) {
      if (btn === 'Cancel') {
        this.pop();
        if (d.init) this.startCoreLib();
        return;
      }
      if (btn !== 'OK') return;
      const current = d.userId === 'SSO' ? (d.init ? 'DEFAULTPIN' : this.ssoPass) : this.users[d.userId] && this.users[d.userId].pass;
      if (f.old !== current) return this.msgBox('Core Lib', 'Old password is incorrect.', '!');
      if (!f.new || f.new.length < 8 || !/[A-Za-z]/.test(f.new) || !/[0-9]/.test(f.new)) return this.msgBox('Core Lib', 'The new password must have at least 8 characters, letters and numbers.', '!');
      if (f.new !== f.confirm) return this.msgBox('Core Lib', 'New password and confirmation do not match.', '!');
      this.pop();
      if (d.userId === 'SSO') this.ssoPass = f.new;
      else this.users[d.userId].pass = f.new;
      this.log(`${d.userId} password changed.`);
      this.msgBox('Core Lib', 'Password successfully updated.', 'i', () => {
        if (!d.init) return;
        this.card = 'READY';
        this.user = { name: 'SSO', role: 'SSO' };
        this.kov = 'GREEN';
        this.log('SSO Logged on.');
        this.showProgress('Please wait, encrypting and saving database in progress...', 1800, () => this.push({ type: 'STARTUP', autoUAS: true }));
      });
    }
    d_LOGIN(btn, f) {
      if (btn !== 'OK') return this.pop();
      const name = String(f.user || '').trim().toUpperCase();
      const ok = name === 'SSO' ? f.pass === this.ssoPass && !!this.ssoPass : !!this.users[name] && this.users[name].pass === f.pass;
      if (ok) {
        this.pop();
        this.attempts = 0;
        this.user = { name, role: name === 'SSO' ? 'SSO' : 'USER' };
        this.kov = 'GREEN';
        this.log(name === 'SSO' ? 'SSO Logged on.' : `User (${name}) Logged on.`);
        // la UAS se lanza automáticamente al iniciar sesión
        this.showProgress('Please wait, checking and decrypting database in progress...', 1800, () => this.push({ type: 'STARTUP', autoUAS: true }));
        return;
      }
      this.attempts++;
      this.log(name === 'SSO' ? 'Unsuccessful SSO logon attempt.' : `Unsuccessful User logon attempt (${name || '?'}).`, false);
      if (this.attempts >= MAX_ATTEMPTS) {
        this.locked = true;
        this.pop();
        this.log(name === 'SSO' ? 'SSO Max logon attempts.' : 'User Max logon attempts.', false);
        return this.msgBox('Core Lib', 'Max logon attempts. The account is locked.', '!', null, ['OK', 'Desbloqueo (instructor)']);
      }
      this.msgBox('Core Lib', `Invalid user ID or password. ${MAX_ATTEMPTS - this.attempts} attempt(s) left.`, '!');
    }
    d_STARTUP(btn, f, d) {
      this.pop();
      if (d.autoUAS) this.openUAS();
    }
    d_LAUNCH(btn) {
      this.pop();
      if (btn === 'OK') this.showProgress('Please wait, checking and decrypting database in progress...', 1500, () => this.push({ type: 'STARTUP', autoUAS: true }));
    }
    d_PROTOCOL(btn, f) {
      this.pop();
      if (btn === 'OK' && (f.protocol === 'DS-101' || f.protocol === 'DS-102')) {
        this.protocol = f.protocol;
        this.log(`Default fill protocol: ${f.protocol}.`);
      }
    }
    d_GET_TIME(btn, f) {
      this.pop();
      if (btn !== 'OK') return;
      const t = new Date(this.env.now());
      const s = `${SIM.pad(t.getMonth() + 1)}/${SIM.pad(t.getDate())}/${t.getFullYear()}   ${SIM.hhmmss(t)}`;
      this.msgBox('Core Lib', `${f.mode === 'NO' ? 'Card Time:' : 'New System Clock Time:'}\n${s}`, 'i');
    }
    d_SET_TIME(btn) {
      this.pop();
      if (btn === 'OK') this.log(`Date/Time changed to ${fmtAudit(this.env.now())}.`);
    }
    d_ABOUT() {
      this.pop();
    }
    d_AUDIT() {
      this.pop();
    }
    d_SUMMARY() {
      this.pop();
    }
    d_SEGMENT(btn, f, d) {
      if (btn === 'Close') return this.pop();
      const ids = this.keys.map((k) => k.id);
      const i = ids.indexOf(d.key);
      if (btn === 'Next' && i < ids.length - 1) d.key = ids[i + 1];
      if (btn === 'Back' && i > 0) d.key = ids[i - 1];
    }
    d_EXPIRED(btn, f) {
      if (btn === 'Close') return this.pop();
      const expired = this.keys.filter((k) => ['RED', 'EXPTAG'].includes(this.keyStatus(k)));
      const chosen = btn === 'Delete All' ? expired.map((k) => k.id) : [].concat(f.keys || []);
      if (!chosen.length) return this.msgBox('SKL', 'Select the expired key(s) to delete.', '!');
      this.confirm('SKL', 'Delete selected Segments?', () => {
        this.keys = this.keys.filter((k) => !chosen.includes(k.id));
        chosen.forEach((id) => this.log(`Key zeroized: ${id}.`));
        this.dirty = true;
        this.msgBox('SKL', 'Selected expired key(s) deleted.', '!');
      });
    }
    d_LOAD_SEL(btn, f) {
      if (btn !== 'OK') return this.pop();
      const chosen = [].concat(f.keys || []).filter((id) => this.keyById(id));
      if (!chosen.length) return this.msgBox('SKL', 'Select at least one key.', '!');
      this.pop();
      this.startKeyLoad(chosen);
    }
    d_LOAD_OPTS(btn, f, d) {
      if (btn !== 'OK') {
        this.pop();
        this.send = null;
        return;
      }
      if (f.protocol === 'DS-101' || f.protocol === 'DS-102') this.protocol = f.protocol;
      if (f.activation) this.activation = f.activation;
      this.pop();
      this.send = { queue: d.queue, idx: 0, stage: 'READY', protocol: this.protocol, activation: this.protocol === 'DS-102' ? this.activation : 'DS-101', lines: [] };
      this.push({ type: 'READY' });
    }
    d_READY(btn) {
      this.pop();
      if (btn !== 'OK' || !this.send) {
        if (this.send) this.log('Key transfer cancelled.', false);
        this.send = null;
        return;
      }
      const k = this.currentSendKey();
      this.send.stage = 'WAIT';
      this.send.lines.push('Initializing Fill Port…', `Key: ${k.tag} (${this.segLabel(k)})`, 'Press INITIATE Button…');
      this.push({ type: 'STATUS', kind: 'KEY' });
    }
    d_STATUS(btn, f, d) {
      if (btn !== 'Cancel') return;
      this.pop();
      if (d.kind === 'KEY' && this.send) {
        this.log('Key transfer cancelled.', false);
        this.send = null;
      }
      if (d.kind === 'ICOM') this.icom = null;
    }
    d_SINC_MODE(btn, f) {
      this.pop();
      if (btn !== 'OK') {
        this.icom = null;
        return;
      }
      this.icom.transfer = f.transfer || 'ICOM';
      this.icom.includeTime = !!f.sendTime;
      this.push({ type: 'ECU_WIZ', step: 0 });
    }
    d_ECU_WIZ(btn, f, d) {
      if (btn === 'Cancel') {
        this.pop();
        this.icom = null;
        return;
      }
      if (btn === 'Back') d.step = Math.max(0, d.step - 1);
      if (btn === 'Next') d.step = Math.min(2, d.step + 1);
      if (btn === 'Send' && d.step === 2) {
        this.pop();
        this.sendLoadset();
      }
    }
    d_CONFIRM_SAVE(btn) {
      this.pop();
      if (btn === 'Yes') {
        this.dirty = false;
        this.log('Database saved.');
      }
      this.closeUAS();
    }

    // ---------------------------------------------------------------- comandos de menú (Core Library)
    c_login() {
      if (this.user) return;
      if (this.card === 'UNINIT') return this.push({ type: 'DEFAULT_SSO' });
      this.push({ type: 'LOGIN' });
    }
    c_logout() {
      if (!this.user) return;
      if (this.uasOpen) return this.msgBox('Core Lib', 'Exit the UAS before logging out (File > Exit).', '!');
      this.log(this.isSSO ? 'SSO Logged off.' : `User (${this.user.name}) Logged off.`);
      this.user = null;
      this.showProgress('Logging out...', 1500, () => {
        this.kov = 'OFF';
      });
    }
    c_protocol() {
      this.push({ type: 'PROTOCOL' });
    }
    c_resetCard() {
      if (!this.isSSO) return this.msgBox('Core Lib', 'SSO privileges are required.', '!');
      this.confirm('Core Lib', 'Reset the INFOSEC card? All key material will be zeroized.', () => this.zeroize());
    }
    c_getTime() {
      if (!this.user) return this.msgBox('Core Lib', 'Please log in first.', '!');
      this.push({ type: 'GET_TIME' });
    }
    c_changePw() {
      if (!this.user) return this.msgBox('Core Lib', 'Please log in first.', '!');
      this.push({ type: 'CHANGE_PW', userId: this.user.name, init: false });
    }
    c_setTime() {
      if (!this.isSSO) return this.msgBox('Core Lib', 'SSO privileges are required.', '!');
      this.push({ type: 'SET_TIME' });
    }
    c_viewAudit() {
      if (!this.isSSO) {
        this.log('Audit access denied (not SSO).', false);
        return this.msgBox('Core Lib', 'SSO privileges are required for Audit Functions.', '!');
      }
      this.log('Audit Trail viewed.');
      this.push({ type: 'AUDIT' });
    }
    c_deleteAudit() {
      if (!this.isSSO) return this.msgBox('Core Lib', 'SSO privileges are required.', '!');
      this.confirm('Core Lib', 'Delete the audit trail? Upload it first if required.', () => {
        this.audit = [];
        this.log('Audit Trail deleted by SSO.');
      });
    }
    c_launchUAS() {
      if (!this.user) return this.msgBox('Core Lib', 'Please log in first (Session > Login).', '!');
      if (this.uasOpen) {
        this.win = 'UAS';
        return;
      }
      this.push({ type: 'LAUNCH' });
    }
    c_about() {
      this.push({ type: 'ABOUT' });
    }

    openUAS() {
      this.uasOpen = true;
      this.win = 'UAS';
      this.tab = 'PLATS';
      this.log('UAS (SKL) started.');
    }
    closeUAS() {
      this.uasOpen = false;
      this.win = 'CORELIB';
      this.send = null;
      this.icom = null;
    }

    // ---------------------------------------------------------------- comandos de menú (UAS)
    c_exit() {
      if (this.dirty) return this.push({ type: 'CONFIRM_SAVE' });
      this.closeUAS();
    }
    c_saveDb() {
      this.showProgress('Please wait, encrypting and saving database in progress...', 1200, () => {
        this.dirty = false;
        this.log('Database saved.');
      });
    }
    c_deleteDb() {
      this.confirm('SKL', 'Delete the entire database?', () => {
        const n = this.keys.length;
        this.keys = [];
        this.loadset = null;
        this.dirty = true;
        this.log(`Database deleted (${n} keys).`);
      });
    }
    c_deleteKeyTag() {
      const k = this.keyFromNode(this.sel.KEYS);
      if (this.tab !== 'KEYS' || !k) return this.msgBox('SKL', 'Select a key in the Keys tab.', '!');
      this.confirm('SKL', 'Delete selected Segments?', () => {
        this.keys = this.keys.filter((x) => x.id !== k.id);
        this.log(`Key zeroized: ${k.tag}.`);
        this.dirty = true;
      });
    }
    c_currentSel() {
      const k = this.keyFromNode(this.sel[this.tab]);
      if (!k) return this.msgBox('SKL', 'Select a key segment.', 'i');
      this.showSegment(k);
    }
    showSegment(k) {
      this.push({ type: 'SEGMENT', key: k.id });
    }
    c_expired() {
      this.push({ type: 'EXPIRED' });
    }
    c_summary() {
      this.push({ type: 'SUMMARY' });
    }
    c_refresh() {}
    c_expandTree() {
      const walk = (nodes) => nodes.forEach((n) => {
        if (n.children.length) {
          this.expanded.add(n.id);
          walk(n.children);
        }
      });
      walk(this.tree());
    }
    c_collapseTree() {
      const ids = new Set();
      const walk = (nodes) => nodes.forEach((n) => { ids.add(n.id); walk(n.children); });
      walk(this.tree());
      ids.forEach((id) => this.expanded.delete(id));
    }
    c_settingsProtocol() {
      this.push({ type: 'PROTOCOL' });
    }
    c_load() {
      // Transmit > Load... / icono LOAD: carga lo seleccionado
      if (this.selectedIsLoadset()) return this.startIcom();
      const k = this.keyFromNode(this.sel[this.tab]);
      if (this.tab === 'KEYS' && k) return this.startKeyLoad([k.id]);
      this.msgBox('SKL', 'Select a key (Keys tab) or the SINCGARS equipment (Plats/Eqs tab) to load.', 'i');
    }
    c_loadSelectedKeys() {
      this.push({ type: 'LOAD_SEL' });
    }
    c_recv() {
      this.msgBox('SKL', 'Receive: función no simulada en el entrenador.', 'i');
    }

    // ---------------------------------------------------------------- carga de claves
    startKeyLoad(ids) {
      const keys = ids.map((id) => this.keyById(id)).filter(Boolean);
      const tag = keys.find((k) => ['TAG', 'EXPTAG'].includes(this.keyStatus(k)));
      if (tag) return this.msgBox('SKL', `${tag.tag}: Key variable is needed (KEY TAG).`, '!');
      const red = keys.find((k) => this.keyStatus(k) === 'RED');
      if (red) {
        this.log(`Key load refused (expired): ${red.tag}.`, false);
        return this.msgBox('SKL', `${red.tag}: key variable date has expired (RED KEY). Destroy it with View > Keys > Expired Keys.`, '!');
      }
      this.push({ type: 'LOAD_OPTS', queue: keys.map((k) => k.id) });
    }
    currentSendKey() {
      return this.send ? this.keyById(this.send.queue[this.send.idx]) : null;
    }

    /** La radio pide la clave (ENT en «PRESS ENTER TO INITIATE»). */
    providePull(req, conn) {
      if (conn.j1 !== 'SKL') return { ok: false, reason: 'No hay dispositivo de llenado conectado en J1' };
      if (req.device === 'CYZ10-RDS') return { ok: false, wait: true, reason: 'Esperando loadset' };
      if (!this.power || !this.user || !this.send || this.send.stage !== 'WAIT') {
        return { ok: false, wait: true, reason: 'El SKL no estaba en «Press INITIATE Button…» cuando se pulsó ENT en la radio' };
      }
      const s = this.send;
      const want = req.device === 'KYK-13' ? 'DS-102' : 'DS-101';
      if (s.protocol !== want) {
        s.lines.push(`Fill failed: equipment expects ${want}.`);
        this.log(`Key transfer failed: protocol ${s.protocol}, equipment expects ${want}.`, false);
        this.changed();
        return { ok: false, reason: `Protocolo distinto: la radio (FILL DEVICE ${req.device}) espera ${want} y el SKL envía ${s.protocol}` };
      }
      if (want === 'DS-102' && s.activation !== 'KYK-13') return { ok: false, reason: 'En DS-102 el modo de activación debe ser KYK-13' };
      const key = this.currentSendKey();
      key.issued++;
      s.stage = 'SENT';
      s.lines.push(`Sending ${key.text}…`, 'Transfer successful.');
      this.log(`Key transmitted: ${key.tag} ${this.segLabel(key)} to AN/PRC-117F via ${s.protocol}${s.protocol === 'DS-102' ? ' (KYK-13)' : ''}.`);
      this.dirty = true;
      // siguiente clave o fin
      this.after(900, () => {
        if (this.send !== s) return;
        this.dialogs = this.dialogs.filter((d) => d.type !== 'STATUS');
        s.idx++;
        if (s.idx < s.queue.length) {
          s.stage = 'READY';
          s.lines = [];
          this.push({ type: 'READY' });
        } else {
          this.send = null;
          this.msgBox('SKL', 'Operation Successful.', '!');
        }
        this.changed();
      });
      this.changed();
      return { ok: true, key: { tag: key.tag, bank: key.bank, type: key.type }, protocol: s.protocol };
    }

    // ---------------------------------------------------------------- loadset SINCGARS (ICOM)
    startIcom() {
      if (!this.loadset) return this.msgBox('SKL', 'No loadset in the database.', '!');
      this.icom = { ls: this.loadset, transfer: 'ICOM', includeTime: false, lines: [] };
      this.showProgress('Gathering data...', 800, () => this.push({ type: 'SINC_MODE' }));
    }
    sendLoadset() {
      const ic = this.icom;
      if (!ic) return;
      ic.lines = ['Press LOAD Button.'];
      this.push({ type: 'STATUS', kind: 'ICOM' });
      if (ic.transfer !== 'ICOM') {
        this.after(1200, () => {
          ic.lines.push('Error: el AN/PRC-117F carga el loadset en modo ICOM.');
          this.changed();
        });
        return;
      }
      const r = this.env.pushLoadset(ic.ls, ic.includeTime);
      if (!r.ok) {
        this.after(1200, () => {
          ic.lines.push('Equipment not responding.', `Error: ${r.reason}`);
          this.log(`Loadset transfer failed: ${r.reason}.`, false);
          this.changed();
        });
        return;
      }
      const steps = [...ic.ls.teks.map((_, i) => `Sending TEK #${i + 1}`), 'Sending KEK #6', 'Sending Cold Start TSK', ...ic.ls.hopsets.map((_, i) => `Sending Hopset #${i + 1}`), 'Sending Lockouts'];
      steps.forEach((st, i) => this.after(250 * (i + 1), () => {
        ic.lines.push(st);
        this.changed();
      }));
      this.after(250 * (steps.length + 1), () => {
        ic.lines.push('Re-load equipment.');
        this.log(`Loadset ${ic.ls.name} transmitted to AN/PRC-117F (ICOM${ic.includeTime ? ', time' : ''}).`);
        this.dialogs = this.dialogs.filter((d) => d.type !== 'STATUS');
        this.icom = null;
        this.msgBox('SKL', 'ICOM transfer successful.', '!');
        this.changed();
      });
    }

    // ---------------------------------------------------------------- datos para la interfaz
    summary() {
      const c = (type) => this.keys.filter((k) => k.type === type).length;
      const now = this.env.now();
      return [
        ['SKL Ver 4.0 (SIM)', ''],
        ['SKL Database Version: 2.33', ''],
        ['Highest Key Classification: Unclassified', ''],
        ['Platform', '2'],
        ['Equipment', String(this.loadset ? 2 : 1)],
        ['Segment', String(this.keys.length)],
        ['TEK', String(c('TEK'))],
        ['KEK', String(c('KEK'))],
        ['TSK', String(c('TSK'))],
        ['WOD', String(c('WOD'))],
        ['ICOM TSK', String(this.loadset ? this.loadset.hopsets.length : 0)],
        ['Key Needed', String(this.keys.filter((k) => !k.variable).length)],
        ['Expired Key', String(this.keys.filter((k) => k.exp < now).length)],
        ['Audit records', String(this.audit.length)],
      ];
    }
    auditRows() {
      return this.audit.slice().reverse().map((a) => ({ when: fmtAudit(a.t), text: a.text, ok: a.ok }));
    }
    startupInfo() {
      return [
        'SKL Ver 4.0 (SIM) - Entrenamiento',
        'SKL Database Version: 2.33',
        'Highest SOI Classification: Unclassified',
        'Highest Key Classification: Unclassified',
        'Audit Free Space:',
        `   Total bytes used: ${this.audit.length * 64}`,
        '   % of bytes free: 99.7',
      ];
    }

    // ---------------------------------------------------------------- persistencia
    serialize() {
      return {
        v: 3, card: this.card, ssoPass: this.ssoPass, users: this.users, keys: this.keys, loadset: this.loadset,
        audit: this.audit.slice(0, 150), locked: this.locked, attempts: this.attempts,
        protocol: this.protocol, activation: this.activation, battery: this.battery,
      };
    }
    load(o) {
      if (!o || typeof o !== 'object' || o.v !== 3) return;
      if (o.card === 'UNINIT' || o.card === 'READY') this.card = o.card;
      if (typeof o.ssoPass === 'string') this.ssoPass = o.ssoPass;
      if (o.users && typeof o.users === 'object') this.users = o.users;
      if (Array.isArray(o.keys)) this.keys = o.keys.filter((k) => k && k.tag && k.bank);
      if (o.loadset === null || (o.loadset && Array.isArray(o.loadset.hopsets))) this.loadset = o.loadset;
      if (Array.isArray(o.audit)) this.audit = o.audit.filter((a) => a && a.text);
      if (typeof o.locked === 'boolean') this.locked = o.locked;
      if (Number.isInteger(o.attempts)) this.attempts = o.attempts;
      if (o.protocol === 'DS-101' || o.protocol === 'DS-102') this.protocol = o.protocol;
      if (typeof o.activation === 'string') this.activation = o.activation;
      if (Number.isFinite(o.battery)) this.battery = Math.max(3, Math.min(100, o.battery));
      this.changed();
    }
  }

  SKL.ACCOUNT = ACCOUNT;
  SKL.defaultKeys = defaultKeys;
  SKL.fmtAudit = fmtAudit;
  SIM.SKL = SKL;
})(typeof window !== 'undefined' ? window : globalThis);
