/*
 * Modelo del Simple Key Loader AN/PYQ-10 (simulación de entrenamiento).
 *
 * Reproduce la interfaz Windows CE descrita en el manual técnico
 * TM 11-5810-410-13&P (PYQ10_tech_20070901) y en el curso del SKL:
 *   - Core Library: ventana «Logon» (User ID / Password, Clear / Cancel / OK)
 *     con Input Panel; menús Session (Login, Logout, Protocol, Reset Card),
 *     Tools (User ▸ / SSO ▸), Launch y Help. Tras un logon válido la UAS
 *     se abre automáticamente («Startup Information» > OK).
 *   - El CIK va insertado en el SKL (no se retira en los procedimientos).
 *   - UAS: menús File / View / Settings, iconos RECV y LOAD, pestañas
 *     Plats / Eqs / Keys / SOI en árbol (Short Title > Edition > Segment).
 *   - Carga de claves: File > Transmit > Load Selected Keys > «Key Load
 *     Select Keys» > «Key Load Settings» (Protocol, Activate Mode, Bus
 *     Address, Baud Rate, Send WakeUp, Send Tag, Seconds, Mode, Timeout) >
 *     «Ready to Send Key» (Connect to Receive Equipment) > «Status»
 *     («Press INITIATE Button....») > «Operation Successful.».
 *   - Loadset por ICOM: SINCGARS Mode > Load ECU Wizard (Connect To,
 *     Profiles) > Status («Press LOAD Button.») > «Re-load equipment?».
 *
 * La base de datos por defecto contiene un único Short Title SATCOM con
 * 12 segmentos (uno por mes). Todo el material es ficticio (ETD).
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;
  const DAY = 86400000;
  const MAX_FAILS = 10; // manual: 10 fallos seguidos borran la cuenta (SSO: zeroize)
  const ACCOUNT = '5AT900'; // cuenta COMSEC ficticia
  const SAT_ST = `ETD 01 ${ACCOUNT}`;
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  /** Etiqueta con la que la radio identifica un segmento: «ETD 01 5AT900 A-11». */
  const tagOf = (st, ed, seg) => `${st} ${ed}-${seg}`;
  /** Segmento SATCOM vigente en una fecha (uno por mes). */
  SIM.satcomTag = (t) => tagOf(SAT_ST, 'A', new Date(t).getMonth() + 1);

  function seg(o) {
    return Object.assign({
      edition: 'A', segment: 1, variable: true, issued: 0, source: 'KOK-22(KP)', cls: 'Unclassified',
    }, o, { id: `${o.st}|${o.edition || 'A'}|${o.segment || 1}`, tag: tagOf(o.st, o.edition || 'A', o.segment || 1) });
  }

  /** Base de datos por defecto: un Short Title SATCOM con 12 segmentos (ENE-DIC del año en curso). */
  function defaultKeys(now) {
    const y = new Date(now).getFullYear();
    return MONTHS.map((m, i) => seg({
      st: SAT_ST, segment: i + 1, desig: 'T000', suffix: String(i + 1), text: `${m} TEK`, bank: 'SATCOM', type: 'TEK',
      desc: `TEK SATCOM del mes ${m} (VINSON / ANDVT)`,
      eff: new Date(y, i, 1).getTime(), exp: new Date(y, i + 1, 1).getTime() - 1,
    }));
  }

  /** Material adicional para los demás ejercicios (botón del instructor). */
  function extendedKeys(now) {
    const d = (n) => now + n * DAY;
    return [
      seg({ st: `ETD 02 ${ACCOUNT}`, desig: 'T000', suffix: '2', text: 'LOS TEK', bank: 'VINSON', type: 'TEK', desc: 'Red LOS de Cóndor 3 (VINSON)', eff: d(-10), exp: d(20) }),
      seg({ st: `ETD 03 ${ACCOUNT}`, desig: 'T000', suffix: '3', text: 'OLD TEK', bank: 'VINSON', type: 'TEK', desc: 'Red LOS, periodo anterior', eff: d(-40), exp: d(-2) }),
      seg({ st: `ETD 07 ${ACCOUNT}`, desig: 'S000', suffix: '7', text: 'EOW TSK', bank: 'SATELLITE', type: 'TSK', desc: 'Orderwire DAMA', eff: d(-7), exp: d(23) }),
      seg({ st: `ETD 50 ${ACCOUNT}`, desig: 'W000', suffix: '11', text: 'MWOD', bank: 'HAVEQUICK', type: 'WOD', desc: 'MWOD HAVEQUICK del mes', eff: d(-10), exp: d(30) }),
      seg({ st: `ETD 60 ${ACCOUNT}`, desig: 'T000', suffix: '60', text: 'DATA TEK', bank: 'KG-84', type: 'TEK', desc: 'KG-84 (falta la variable)', eff: d(-1), exp: d(29), variable: false }),
      seg({ st: `ETD 04 ${ACCOUNT}`, desig: 'KAAA', suffix: '3', text: '1QTR KEK', bank: 'VINSON', type: 'KEK', desc: 'KEK VINSON', eff: d(-30), exp: d(60) }),
    ];
  }

  function extendedLoadset() {
    return {
      name: 'RT1 PRC117F',
      type: 'PRC-117F',
      platform: 'CDR HMMV',
      teks: [11, 12, 13, 14, 15].map((n) => `ETD ${n} ${ACCOUNT} A-1`),
      kek: `ETD 16 ${ACCOUNT} A-1`,
      coldStart: `ETD 20 ${ACCOUNT} A-1`,
      hopsets: [345, 346, 400, 401, 500, 501].map((netId, i) => ({ tag: `ETD ${21 + i} ${ACCOUNT} A-1`, netId })),
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
  const fmtKeyDate = (t) => {
    const d = new Date(t);
    return `${SIM.pad(d.getMonth() + 1)}/${SIM.pad(d.getDate())}/${d.getFullYear()}`;
  };

  /** Opciones de «Activate Mode» del diálogo Key Load Settings (manual, figuras 34-36). */
  const ACTIVATE = {
    'DS-102': ['DS-102', 'KYK-13', 'KYX-15', 'KEMPLE', 'KOI-18', 'NCD LD'],
    'DS-101': ['DS-101'],
    'RS-232': ['RS-232', 'STE'],
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
      this.sip = false; // Input Panel (teclado en pantalla)
      this.user = null;
      this.uasOpen = false;
      this.tab = 'PLATS';
      this.sel = { PLATS: null, EQS: null, KEYS: null, SOI: null };
      this.expanded = new Set(['soi:ed', 'soi:grp', 'soi:g1', 'soi:tp1']);
      this.card = 'READY';
      this.accounts = { SSO: { pass: 'Sso12345', fails: 0, role: 'SSO' }, OPERADOR: { pass: 'Operador1', fails: 0, role: 'USER' } };
      this.kov = 'OFF';
      this.battery = 100;
      this.nvg = false;
      this.bright = 3;
      this.keys = defaultKeys(this.env.now());
      this.loadset = null;
      this.extended = false;
      this.audit = [];
      this.loadSettings = { protocol: 'DS-102', activate: 'DS-102', bus: '255', baud: '2400', wakeup: false, tag: false, seconds: '5', mode: 'Fill', timeout: 'Slow' };
      this.coreProtocol = { protocol: 'DS-101', baud: '2400', timeout: 'Medium' };
      this.displayEvery = true;
      this.send = null;
      this.icom = null;
      this.dirty = false;
      this.progress = null;
      this.shutdown = null;
      this.lowWarnAt = 0;
      this.log('Audit Trail Initialized.');
      this.changed();
    }

    /** Añade el material de los demás ejercicios (LOS, DAMA TSK, MWOD y loadset SINCGARS). */
    loadExtendedDb() {
      if (this.extended) return;
      const ids = new Set(this.keys.map((k) => k.id));
      extendedKeys(this.env.now()).forEach((k) => { if (!ids.has(k.id)) this.keys.push(k); });
      this.loadset = extendedLoadset();
      this.extended = true;
      this.expanded.add('plat:CDR HMMV');
      this.log('Database received (training material).');
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
      if (['LOGON', 'CHANGE_PW'].includes(d.type)) this.sip = true;
    }
    pop() {
      const d = this.dialogs.pop();
      if (d && ['LOGON', 'CHANGE_PW'].includes(d.type)) this.sip = false;
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
        this.win = 'CORELIB'; // la Core Library arranca sola al encender
        this.startCoreLib();
        this.changed();
      });
    }

    startCoreLib() {
      if (!this.env.cik()) {
        this.msgBox('Core Lib', 'No CIK detected. Turn the SKL off, insert the CIK and turn it on again.', '!');
        return;
      }
      if (this.card === 'UNINIT') this.push({ type: 'DEFAULT_SSO' });
      else this.push({ type: 'LOGON' });
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
      this.sip = false;
      this.progress = null;
      this.shutdown = null;
      this.kov = 'OFF';
      this.win = 'DESKTOP';
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

    /** Botón físico de zeroize (o 10 fallos de logon del SSO): borra todo y la tarjeta queda sin inicializar. */
    zeroize(reason = 'Zeroize button') {
      if (!this.power) return;
      const n = this.keys.length;
      this.keys = [];
      this.loadset = null;
      this.send = null;
      this.icom = null;
      this.user = null;
      this.uasOpen = false;
      this.card = 'UNINIT';
      this.accounts = { SSO: { pass: 'DEFAULTPIN', fails: 0, role: 'SSO' } };
      this.kov = 'OFF';
      this.dialogs = [];
      this.sip = false;
      this.win = 'CORELIB';
      this.log(`INFOSEC zeroized (${reason}, ${n} segments).`);
      this.msgBox('Core Lib', 'INFOSEC card zeroized. All Mission Database items and user accounts have been deleted.', '!', () => this.startCoreLib());
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
    a_sip() {
      this.sip = !this.sip;
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
    /** Cambios en vivo dentro de un diálogo (p. ej. Protocol en Key Load Settings). */
    a_dlgField(arg) {
      const d = this.dlg;
      if (!d) return;
      if (d.type === 'KEY_SETTINGS') {
        Object.assign(d.v, arg.fields || {});
        if (!ACTIVATE[d.v.protocol].includes(d.v.activate)) d.v.activate = ACTIVATE[d.v.protocol][0];
        if (d.v.protocol !== 'DS-101') d.v.wakeup = false;
      }
      if (d.type === 'SINC_MODE') Object.assign(d.v, arg.fields || {});
      if (d.type === 'KEY_SELECT') d.checked = [].concat((arg.fields && arg.fields.keys) || []);
    }
    a_dlgFocus(id) {
      const d = this.dlg;
      if (d && d.type === 'KEY_SELECT') d.focus = id;
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
      if (k && /^seg:/.test(id)) return this.showSegment(k);
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
        // Short Title > Edition > Segment (manual: «Key Knowledge»)
        const byST = new Map();
        this.keys.forEach((k) => {
          if (!byST.has(k.st)) byST.set(k.st, new Map());
          const eds = byST.get(k.st);
          if (!eds.has(k.edition)) eds.set(k.edition, []);
          eds.get(k.edition).push(k);
        });
        return [...byST.entries()].map(([st, eds]) => N(`st:${st}`, st, 'st', [...eds.entries()].map(([ed, segs]) => N(`ed:${st}|${ed}`, ed, 'ed',
          segs.map((k) => N(`seg:${k.id}`, this.segLabel(k), this.keyStatus(k), [], { key: k.id }))))));
      }
      const ls = this.loadset;
      const lsNode = (prefix) => (ls ? N(`${prefix}:eq`, ls.name, 'eq', [
        ...ls.teks.map((t, i) => N(`${prefix}:loc:C${i + 1}`, `C${i + 1}`, 'loc', [N(`${prefix}:k:C${i + 1}`, `${t} TEK`, 'YELLOW')])),
        N(`${prefix}:loc:C6`, 'C6', 'loc', [N(`${prefix}:k:C6`, `${ls.kek} KEK`, 'YELLOW')]),
        N(`${prefix}:loc:H0`, 'H0', 'loc'),
        ...ls.hopsets.map((h, i) => N(`${prefix}:loc:H${i + 1}`, `H${i + 1}`, 'loc', [N(`${prefix}:h:${i}`, `F${SIM.pad(h.netId, 3)}`, 'hop')])),
      ], { loadset: true }) : null);
      if (tab === 'EQS') return [lsNode('eq')].filter(Boolean);
      if (tab === 'PLATS') return ls ? [N(`plat:${ls.platform}`, ls.platform, 'plat', [lsNode('pe')])] : [];
      // SOI
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
          N('soi:qr:key', `SATCOM TEK: ${SAT_ST} (SEGMENT = MONTH)`, 'soiitem'),
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
      let m = /^seg:(.+)$/.exec(id);
      if (m) return this.keyById(m[1]);
      m = /^ed:(.+)\|(.+)$/.exec(id);
      if (m) return this.keys.find((k) => k.st === m[1] && k.edition === m[2]) || null;
      m = /^st:(.+)$/.exec(id);
      if (m) return this.keys.find((k) => k.st === m[1]) || null;
      return null;
    }
    selectedKind() {
      const id = this.sel[this.tab] || '';
      return id.split(':')[0];
    }
    selectedIsLoadset() {
      const id = this.sel[this.tab] || '';
      return (this.tab === 'PLATS' || this.tab === 'EQS') && !!this.loadset && /^(plat|pe|eq)/.test(id);
    }

    // ---------------------------------------------------------------- diálogos
    d_MSG(btn, f, d) {
      this.pop();
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
          this.push({
            type: 'MSG', title: 'Core Lib', text: 'Use External CIK?', icon: '?', buttons: ['OK'],
            next: () => {
              this.card = 'READY';
              this.accounts = { SSO: { pass: 'Sso12345', fails: 0, role: 'SSO' }, OPERADOR: { pass: 'Operador1', fails: 0, role: 'USER' } };
              this.logon('SSO');
            },
          });
        });
        return;
      }
      this.log('Unsuccessful SSO logon attempt.', false);
      this.msgBox('Core Lib', 'Invalid User ID or Password.', '!');
    }
    d_LOGON(btn, f) {
      if (btn !== 'OK') return this.pop();
      const name = String(f.user || '').trim();
      const acc = this.accounts[name.toUpperCase()];
      if (acc && f.pass === acc.pass) {
        this.pop();
        acc.fails = 0;
        return this.logon(name.toUpperCase());
      }
      if (acc) acc.fails++;
      const label = name.toUpperCase() === 'SSO' ? 'SSO' : `User (${name || '?'})`;
      this.log(`Unsuccessful ${label} logon attempt.`, false);
      if (acc && acc.fails >= MAX_FAILS) {
        this.pop();
        if (acc.role === 'SSO') return this.zeroize('10 consecutive SSO logon failures');
        delete this.accounts[name.toUpperCase()];
        this.log(`${label} deleted (10 consecutive logon failures).`, false);
        return this.msgBox('Core Lib', 'Ten consecutive logon failures. The user account has been deleted.', '!');
      }
      this.msgBox('Core Lib', 'Invalid User ID or Password.', '!');
    }
    /** Logon correcto: KOV en verde, Startup Information y la UAS se abre sola. */
    logon(name) {
      const acc = this.accounts[name];
      this.user = { name, role: acc ? acc.role : 'USER' };
      this.kov = 'GREEN';
      this.log(name === 'SSO' ? 'SSO Logged on.' : `User (${name}) Logged on.`);
      this.showProgress('Please wait, checking and decrypting database in progress...', 1800, () => this.push({ type: 'STARTUP', autoUAS: true }));
    }
    d_CHANGE_PW(btn, f, d) {
      if (btn === 'Cancel') return this.pop();
      if (btn !== 'OK') return;
      const acc = this.accounts[d.userId];
      if (!acc || f.old !== acc.pass) return this.msgBox('Core Lib', 'Old password is incorrect.', '!');
      if (!f.new || f.new.length < 6 || f.new.length > 12 || /\s/.test(f.new)) return this.msgBox('Core Lib', 'The new password must be 6 to 12 characters long. Spaces are not allowed.', '!');
      if (f.new !== f.confirm) return this.msgBox('Core Lib', 'New password and confirmation do not match.', '!');
      this.pop();
      acc.pass = f.new;
      this.log(`${d.userId === 'SSO' ? 'SSO' : `User (${d.userId})`} password changed.`);
      this.msgBox('Core Lib', 'Password successfully updated.', 'i');
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
      if (btn === 'OK') {
        Object.assign(this.coreProtocol, f);
        this.log(`Core Library protocol: ${this.coreProtocol.protocol}.`);
      }
    }
    d_RESET_CARD(btn) {
      this.pop();
      if (btn !== 'Yes') return;
      this.user = null;
      this.kov = 'OFF';
      this.log('INFOSEC card reset.');
      this.showProgress('Resetting card...', 1500, () => this.msgBox('Core Lib', 'Card was reset. User logged off.\nTo continue, please log on.', 'i'));
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
        chosen.forEach((id) => this.log(`Segment zeroized: ${id.replace(/\|/g, ' ')}.`));
        this.dirty = true;
        this.msgBox('SKL', 'Selected expired key(s) deleted.', '!');
      });
    }
    d_KEY_SELECT(btn, f, d) {
      if (btn === 'Cancel') return this.pop();
      const selectable = this.keys.filter((k) => this.keyStatus(k) !== 'TAG' && this.keyStatus(k) !== 'EXPTAG');
      if (btn === 'Select All') {
        d.checked = selectable.map((k) => k.id);
        return;
      }
      if (btn === 'Deselect All') {
        d.checked = [];
        return;
      }
      if (btn === 'Up' || btn === 'Down') {
        const id = d.focus;
        const i = d.order.indexOf(id);
        const j = btn === 'Up' ? i - 1 : i + 1;
        if (i >= 0 && j >= 0 && j < d.order.length) [d.order[i], d.order[j]] = [d.order[j], d.order[i]];
        return;
      }
      if (btn !== 'OK') return;
      const chosen = d.order.filter((id) => [].concat(f.keys || []).includes(id));
      if (!chosen.length) return this.msgBox('SKL', 'Select at least one key.', '!');
      this.pop();
      this.startKeyLoad(chosen);
    }
    d_KEY_SETTINGS(btn, f, d) {
      if (btn !== 'OK') {
        this.pop();
        this.send = null;
        return;
      }
      Object.assign(d.v, f);
      this.loadSettings = Object.assign({}, d.v);
      this.pop();
      this.send = { queue: d.queue, idx: 0, stage: 'READY', settings: Object.assign({}, d.v), lines: [] };
      this.nextKeyStep();
    }
    nextKeyStep() {
      if (this.displayEvery) this.push({ type: 'READY' });
      else this.beginWait();
    }
    d_READY(btn, f) {
      this.pop();
      if (btn !== 'OK' || !this.send) {
        if (this.send) this.log('Key transfer cancelled.', false);
        this.send = null;
        return;
      }
      this.displayEvery = !!f.every;
      this.beginWait();
    }
    beginWait() {
      this.send.stage = 'WAIT';
      this.send.lines = [this.send.settings.protocol === 'DS-101' ? 'Attempting to Connect .....' : 'Press INITIATE Button....'];
      if (!this.dialogs.some((d) => d.type === 'STATUS')) this.push({ type: 'STATUS', kind: 'KEY', done: false });
    }
    d_STATUS(btn, f, d) {
      if (btn !== 'Cancel' && btn !== 'Close') return;
      this.pop();
      if (d.kind === 'KEY' && this.send) {
        this.log('Key transfer cancelled.', false);
        this.send = null;
      }
      if (d.kind === 'ICOM') this.icom = null;
    }
    d_SINC_MODE(btn, f, d) {
      if (btn !== 'OK') {
        this.pop();
        this.icom = null;
        return;
      }
      this.pop();
      this.icom.transfer = f.transfer || d.v.transfer;
      this.icom.includeTime = this.icom.transfer === 'ICOM' && !!f.includeTime;
      this.push({ type: 'ECU_WIZ', step: 0 });
    }
    d_ECU_WIZ(btn, f, d) {
      if (btn === 'Cancel') {
        this.pop();
        this.icom = null;
        return;
      }
      if (btn === 'Back') d.step = 0;
      if (btn === 'Next') d.step = 1;
      if (btn === 'Send' && d.step === 1) {
        this.pop();
        this.sendLoadset();
      }
    }
    d_RELOAD(btn, f, d) {
      this.pop();
      if (btn === 'Yes') {
        this.dialogs = this.dialogs.filter((x) => x.type !== 'STATUS');
        return d.again();
      }
      d.done();
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
      this.push({ type: 'LOGON' });
    }
    c_logout() {
      if (!this.user) return;
      if (this.uasOpen) return this.msgBox('Core Lib', 'You must first completely exit the SKL UAS program (File > Exit).', '!');
      this.log(this.isSSO ? 'SSO Logged off.' : `User (${this.user.name}) Logged off.`);
      this.user = null;
      this.showProgress('Logging off...', 1500, () => {
        this.kov = 'OFF';
      });
    }
    c_protocol() {
      this.push({ type: 'PROTOCOL' });
    }
    c_resetCard() {
      this.push({ type: 'RESET_CARD' });
    }
    c_getTime() {
      if (!this.user) return this.msgBox('Core Lib', 'Please log on first.', '!');
      this.push({ type: 'GET_TIME' });
    }
    c_changePw() {
      if (!this.user) return this.msgBox('Core Lib', 'Please log on first.', '!');
      this.push({ type: 'CHANGE_PW', userId: this.user.name });
    }
    c_cardStatus() {
      if (!this.user) return this.msgBox('Core Lib', 'Please log on first.', '!');
      this.msgBox('Card Status', `KOV-21 0020705\nState: Operational\nUser: ${this.user.name}\nCIK: Inserted\nSegments: ${this.keys.length}`, 'i');
    }
    c_selfTest() {
      if (!this.user) return this.msgBox('Core Lib', 'Please log on first.', '!');
      this.showProgress('Card self-test in progress...', 1500, () => {
        this.log('Card self-test passed.');
        this.msgBox('Core Lib', 'Card Self-Test passed.', 'i');
      });
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
      if (!this.user) return this.msgBox('Core Lib', 'Please log on first (Session > Login).', '!');
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
      this.tab = this.loadset ? 'PLATS' : 'KEYS';
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
      this.confirm('SKL', 'Delete the entire Mission Database?', () => {
        const n = this.keys.length;
        this.keys = [];
        this.loadset = null;
        this.dirty = true;
        this.log(`Database deleted (${n} segments).`);
      });
    }
    c_deleteSel() {
      // File > Delete Key Tag / Delete Edition / Delete Segment (según lo seleccionado)
      const id = this.sel.KEYS || '';
      if (this.tab !== 'KEYS' || !/^(st|ed|seg):/.test(id)) return this.msgBox('SKL', 'Select a Short Title, Edition or Segment in the Keys tab.', '!');
      const kind = id.split(':')[0];
      const match = (k) => (kind === 'seg' ? `seg:${k.id}` === id : kind === 'ed' ? `ed:${k.st}|${k.edition}` === id : `st:${k.st}` === id);
      const n = this.keys.filter(match).length;
      this.confirm('SKL', `Delete selected ${kind === 'seg' ? 'Segment' : kind === 'ed' ? 'Edition' : 'Key Tag'}? (${n} segment(s))`, () => {
        this.keys.filter(match).forEach((k) => this.log(`Segment zeroized: ${k.tag}.`));
        this.keys = this.keys.filter((k) => !match(k));
        this.sel.KEYS = null;
        this.dirty = true;
        this.msgBox('SKL', 'Selected item deleted.', '!');
      });
    }
    c_currentSel() {
      const k = /^seg:/.test(this.sel[this.tab] || '') ? this.keyFromNode(this.sel[this.tab]) : null;
      if (!k) return this.msgBox('SKL', 'Select a key Segment.', 'i');
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
    c_load() {
      // File > Transmit > Load... / icono LOAD
      if (this.selectedIsLoadset()) return this.startIcom();
      const id = this.sel[this.tab] || '';
      if (this.tab === 'KEYS' && /^seg:/.test(id)) return this.startKeyLoad([id.slice(4)]);
      if (this.tab === 'KEYS') return this.msgBox('SKL', 'Select a key Segment, or use File > Transmit > Load Selected Keys.', 'i');
      this.msgBox('SKL', 'Select the Platform or Equipment to load.', 'i');
    }
    c_loadSelectedKeys() {
      if (this.tab !== 'KEYS') return this.msgBox('SKL', 'Load Selected Keys is only available from the Keys tab.', 'i');
      this.push({ type: 'KEY_SELECT', checked: [], order: this.keys.map((k) => k.id), focus: null });
    }
    c_recv() {
      this.msgBox('SKL', 'Receive: función no simulada en el entrenador.', 'i');
    }
    c_settingsNotSim() {
      this.msgBox('SKL', 'Opción del menú Settings no simulada en el entrenador.', 'i');
    }

    // ---------------------------------------------------------------- carga de claves
    startKeyLoad(ids) {
      const keys = ids.map((id) => this.keyById(id)).filter(Boolean);
      const tag = keys.find((k) => ['TAG', 'EXPTAG'].includes(this.keyStatus(k)));
      if (tag) return this.msgBox('SKL', `${tag.st} ${tag.edition} ${tag.segment}: Key variable is needed (KEY TAG).`, '!');
      const red = keys.find((k) => this.keyStatus(k) === 'RED');
      if (red) {
        this.log(`Key load refused (expired): ${red.tag}.`, false);
        return this.msgBox('SKL', `${red.st} ${red.edition} segment ${red.segment}: key variable date has expired (RED KEY).`, '!');
      }
      this.push({ type: 'KEY_SETTINGS', queue: keys.map((k) => k.id), v: Object.assign({}, this.loadSettings) });
    }
    currentSendKey() {
      return this.send ? this.keyById(this.send.queue[this.send.idx]) : null;
    }

    /** La radio pide la clave (ENT en «PRESS ENTER TO INITIATE»). */
    providePull(req, conn) {
      if (conn.j1 !== 'SKL') return { ok: false, reason: 'No hay dispositivo de llenado conectado en J1' };
      if (req.device === 'CYZ10-RDS') return { ok: false, wait: true, reason: 'Esperando loadset' };
      if (!this.power || !this.user || !this.send || this.send.stage !== 'WAIT') {
        return { ok: false, wait: true, reason: 'El SKL no estaba en «Press INITIATE Button....» cuando se pulsó ENT en la radio' };
      }
      const s = this.send;
      const st = s.settings;
      const want = req.device === 'KYK-13' ? 'DS-102' : 'DS-101';
      const fail = (reason, line) => {
        s.lines.push(line || 'Transfer failed.');
        this.log(`Key transfer failed: ${reason}`, false);
        this.changed();
        return { ok: false, reason };
      };
      if (st.protocol !== want) return fail(`la radio (FILL DEVICE ${req.device}) espera ${want} y el SKL emula ${st.protocol}.`, 'No response from equipment.');
      if (want === 'DS-102' && st.activate !== 'KYK-13') return fail(`con FILL DEVICE KYK-13 el Activate Mode del SKL debe ser KYK-13 (está en ${st.activate}).`, 'No response from equipment.');
      const key = this.currentSendKey();
      key.issued++;
      s.stage = 'SENT';
      s.lines.push('Transmit In Progress ....');
      this.log(`Key transmitted: ${key.tag} (${this.segLabel(key)}) to AN/PRC-117F, ${st.protocol}/${st.activate}.`);
      this.dirty = true;
      this.after(900, () => {
        if (this.send !== s) return;
        s.idx++;
        if (s.idx < s.queue.length) {
          s.stage = 'READY';
          s.lines = [];
          this.dialogs = this.dialogs.filter((d) => d.type !== 'STATUS');
          this.nextKeyStep();
        } else {
          s.lines = ['Operation Successful.'];
          const sd = this.dialogs.find((d) => d.type === 'STATUS');
          if (sd) sd.done = true;
          this.send = null;
          this.msgBox('SKL', 'Operation Successful.', '!');
        }
        this.changed();
      });
      this.changed();
      return { ok: true, key: { tag: key.tag, bank: key.bank, type: key.type }, protocol: st.protocol };
    }

    // ---------------------------------------------------------------- loadset (ICOM)
    startIcom() {
      if (!this.loadset) return this.msgBox('SKL', 'No equipment in the Mission Database.', '!');
      this.icom = { ls: this.loadset, transfer: 'NON-ICOM', includeTime: false, lines: [] };
      this.showProgress('Gathering data...', 800, () => this.push({ type: 'SINC_MODE', v: { transfer: 'NON-ICOM', includeTime: false } }));
    }
    sendLoadset() {
      const ic = this.icom;
      if (!ic) return;
      ic.lines = ['Press LOAD Button.'];
      this.push({ type: 'STATUS', kind: 'ICOM', done: false });
      const finish = () => {
        this.dialogs = this.dialogs.filter((d) => d.type !== 'STATUS');
        ic.lines = ['Operation Successful.'];
        this.push({ type: 'STATUS', kind: 'ICOM', done: true });
        this.msgBox('SKL', 'Operation Successful.', '!');
        this.log(`Loadset ${ic.ls.name} transmitted (${ic.transfer}${ic.includeTime ? ', time' : ''}).`);
      };
      const again = () => this.push({ type: 'SINC_MODE', v: { transfer: ic.transfer, includeTime: ic.includeTime } });
      if (ic.transfer !== 'ICOM') {
        this.after(1500, () => {
          ic.lines.push('No response from equipment.');
          this.push({ type: 'RELOAD', again, done: () => { this.icom = null; this.dialogs = this.dialogs.filter((d) => d.type !== 'STATUS'); } });
          this.changed();
        });
        return;
      }
      const r = this.env.pushLoadset(ic.ls, ic.includeTime);
      if (!r.ok) {
        this.after(1500, () => {
          ic.lines.push('No response from equipment.');
          this.log(`Loadset transfer failed: ${r.reason}.`, false);
          this.push({ type: 'RELOAD', again, done: () => { this.icom = null; this.dialogs = this.dialogs.filter((d) => d.type !== 'STATUS'); }, reason: r.reason });
          this.changed();
        });
        return;
      }
      const steps = [...ic.ls.teks.map((_, i) => `Sending TEK #${i + 1}`), 'Sending KEK #6', 'Sending Cold Start TSK', ...ic.ls.hopsets.map((_, i) => `Sending Hopset #${i + 1}`), 'Lockout #8 is empty. Sending empty cell...'];
      steps.forEach((stp, i) => this.after(250 * (i + 1), () => {
        ic.lines.push(stp);
        this.changed();
      }));
      this.after(250 * (steps.length + 1), () => {
        this.push({ type: 'RELOAD', again, done: () => { finish(); this.icom = null; } });
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
        ['Platform', String(this.loadset ? 1 : 0)],
        ['Equipment', String(this.loadset ? 1 : 0)],
        ['Segment', String(this.keys.length)],
        ['TEK', String(c('TEK'))],
        ['KEK', String(c('KEK'))],
        ['TSK', String(c('TSK'))],
        ['WOD', String(c('WOD'))],
        ['ICOM TSK', String(this.loadset ? this.loadset.hopsets.length : 0)],
        ['Key Needed', String(this.keys.filter((k) => !k.variable).length)],
        ['Expired Key', String(this.keys.filter((k) => k.exp < now).length)],
      ];
    }
    auditRows() {
      return this.audit.slice().reverse().map((a) => ({ when: fmtAudit(a.t), text: a.text, ok: a.ok }));
    }
    startupInfo() {
      return [
        'SKL Ver 4.0 (SIM)',
        'SKL Database Version: 2.33',
        'Highest SOI Classification: Unclassified',
        'Highest Key Classification: Unclassified',
        'Audit Free Space:',
        '   Total bytes free: 2092366',
        `   Total bytes used: ${this.audit.length * 64}`,
        '   % of bytes free: 99.77',
      ];
    }

    // ---------------------------------------------------------------- persistencia
    serialize() {
      return {
        v: 4, card: this.card, accounts: this.accounts, keys: this.keys, loadset: this.loadset, extended: this.extended,
        audit: this.audit.slice(0, 150), loadSettings: this.loadSettings, coreProtocol: this.coreProtocol,
        displayEvery: this.displayEvery, battery: this.battery,
      };
    }
    load(o) {
      if (!o || typeof o !== 'object' || o.v !== 4) return;
      if (o.card === 'UNINIT' || o.card === 'READY') this.card = o.card;
      if (o.accounts && typeof o.accounts === 'object') this.accounts = o.accounts;
      if (Array.isArray(o.keys)) this.keys = o.keys.filter((k) => k && k.tag && k.st);
      if (o.loadset === null || (o.loadset && Array.isArray(o.loadset.hopsets))) this.loadset = o.loadset;
      if (typeof o.extended === 'boolean') this.extended = o.extended;
      if (Array.isArray(o.audit)) this.audit = o.audit.filter((a) => a && a.text);
      if (o.loadSettings) this.loadSettings = Object.assign(this.loadSettings, o.loadSettings);
      if (o.coreProtocol) this.coreProtocol = Object.assign(this.coreProtocol, o.coreProtocol);
      if (typeof o.displayEvery === 'boolean') this.displayEvery = o.displayEvery;
      if (Number.isFinite(o.battery)) this.battery = Math.max(3, Math.min(100, o.battery));
      this.changed();
    }
  }

  SKL.ACCOUNT = ACCOUNT;
  SKL.SAT_ST = SAT_ST;
  SKL.ACTIVATE = ACTIVATE;
  SKL.defaultKeys = defaultKeys;
  SKL.fmtAudit = fmtAudit;
  SKL.fmtKeyDate = fmtKeyDate;
  SIM.SKL = SKL;
})(typeof window !== 'undefined' ? window : globalThis);
