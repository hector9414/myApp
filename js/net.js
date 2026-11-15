/*
 * Red de radio simulada (SOI de entrenamiento): estaciones virtuales que
 * responden cuando la radio está configurada como su red, satélite para la
 * prueba RSSI y controlador DAMA.
 *
 * Todos los datos son ficticios.
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;
  const pad = SIM.pad;
  const near = (a, b) => Math.abs(a - b) < 0.000005;

  /** Datos del satélite de entrenamiento para apuntar la antena. */
  const SATELLITE = { name: 'SAT-ENT 105W', az: 135, el: 40 };

  /** Controlador DAMA de entrenamiento. */
  const DAMA = { channel: 54, networkAddr: 51234, knownTBA: [10452], owTsk: 'ETD 07 5AT900 A-1', maxPrecedence: 'PRIORITY' };

  const STATIONS = [
    {
      id: 'HALCON', call: 'Halcón 6', type: 'LOS', freq: 45.5, mod: 'FM', sq: 'TONE', crypto: null, distanceKm: 3,
      soi: 'LOS 45.50000 FM PT TONE',
      desc: 'Puesto de mando de compañía · LOS 45.50000 MHz FM · PT · squelch TONE · 3 km',
      chatter: ['A todas las estaciones de esta red, aquí Halcón 6. Reporte de situación en diez minutos. Corto.'],
      replies: ['Sin novedad en el puesto de mando.', 'Continúe con la misión.'],
    },
    {
      id: 'CONDOR', call: 'Cóndor 3', type: 'LOS', freq: 62.75, mod: 'FM', sq: 'TONE', crypto: { mode: 'VINSON', tag: 'ETD 02 5AT900 A-1' }, distanceKm: 15,
      soi: 'LOS 62.75000 FM CT VINSON ETD 02',
      desc: 'Pelotón destacado · LOS 62.75000 MHz FM · CT VINSON (ETD 02 5AT900, segmento 1) · 15 km',
      chatter: ['Aquí Cóndor 3. En posición, sin contacto. Corto.'],
      replies: ['Red cifrada verificada.', 'Mantengo posición.'],
    },
    {
      id: 'JAGUAR', call: 'Jaguar 1', type: 'SINCGARS', netId: 345, hop: 'ETD 21 5AT900 A-1', crypto: { mode: 'VINSON', tag: 'ETD 11 5AT900 A-1' }, distanceKm: 8,
      soi: 'SINCGARS F345 CT VINSON (LOADSET C1)',
      desc: 'Elemento de maniobra · SINCGARS red F345 (loadset RT1 PRC117F, hopset H1) · CT VINSON TEK C1 (ETD 11) · 8 km',
      chatter: ['Aquí Jaguar 1. Iniciando movimiento hacia la fase dos. Corto.'],
      replies: ['Sincronizado en salto de frecuencia.', 'Le tengo en la red de maniobra.'],
    },
    {
      id: 'AGUILA', call: 'Águila 2', type: 'HAVEQUICK', hqNet: '00.300', wod: 'ETD 50 5AT900 A-1', crypto: null, distanceKm: 40, airborne: true,
      soi: 'HAVEQUICK NET 00.300 PT MWOD ETD 50',
      desc: 'Aeronave de apoyo · HAVEQUICK II red 00.300 · MWOD ETD 50 5AT900 en la posición del día UTC · TOD · PT · 40 km (en vuelo)',
      chatter: ['Aquí Águila 2, en órbita sobre el punto de control. Corto.'],
      replies: ['Le tengo en salto HAVEQUICK.', 'Disponible para apoyo durante veinte minutos.'],
    },
    {
      id: 'CENTAURO', call: 'Base Centauro', type: 'SAT', code: 150, crypto: { mode: 'ANDVT', tag: (t) => SIM.satcomTag(t) },
      soi: 'SATCOM CODE 150 (5K) CT ANDVT ETD 01 (MES)',
      desc: 'Base de operaciones · SATCOM dedicado código 150 (5 kHz) · CT ANDVT (ETD 01 5AT900, segmento del mes en curso) · antena SATCOM apuntada',
      chatter: ['Aquí Base Centauro. Ventana de satélite estable. Corto.'],
      replies: ['Enlace satelital en banda estrecha confirmado.', 'Mensaje copiado, se retransmite al escalón superior.'],
    },
    {
      id: 'ORION', call: 'Nodo Orión', type: 'DAMA', netAddr: DAMA.networkAddr, crypto: { mode: 'ANDVT', tag: (t) => SIM.satcomTag(t) },
      soi: `DAMA CH ${pad(DAMA.channel, 3)} NET ${DAMA.networkAddr} TBA ${DAMA.knownTBA[0]}`,
      desc: `Nodo de mando · DAMA canal ${pad(DAMA.channel, 3)} (25 kHz AC) · dirección de red ${DAMA.networkAddr} · su TBA: ${DAMA.knownTBA[0]} · TSK de orderwire ${DAMA.owTsk} · CT ANDVT (ETD 01 5AT900, segmento del mes) · config. 060 · precedencia ROUTINE`,
      chatter: ['Aquí Nodo Orión. Red DAMA operativa, mantengan disciplina de red. Corto.'],
      replies: ['Le tengo en la red DAMA.', 'Asignación DAMA verificada.'],
    },
  ];

  function stationFreqs(st) {
    if (st.type === 'SAT') return SIM.Radio.satCode(st.code);
    return null;
  }

  class Net extends SIM.Emitter {
    constructor(radio, env) {
      super();
      this.radio = radio;
      this.env = SIM.env(env);
      if (!this.env.myCall) this.env.myCall = () => 'Lobo 2';
      this.stations = STATIONS;
      this.contacts = {};
      this._timers = [];
      this.nextChatter = this.env.now() + 40000;
      radio.on('transmit', (e) => this.onTransmit(e));
    }

    /** Puntuación RSSI (0-100) según la antena y su apuntamiento. */
    pointing(conn) {
      if (conn.j8 !== 'SATCOM') return conn.j8 === 'FLEX' ? 12 : 0;
      let dAz = Math.abs(((Number(conn.az) || 0) - SATELLITE.az + 540) % 360 - 180);
      const dEl = Math.abs((Number(conn.el) || 0) - SATELLITE.el);
      return Math.max(0, Math.min(99, Math.round(99 - 3 * (dAz + dEl))));
    }
    rssi(s) {
      return this.pointing(s.conn);
    }

    findStation(s) {
      if (s.dama) return null;
      const n = s.net;
      return this.stations.find((st) => {
        if (n.type === 'LOS') return st.type === 'LOS' && near(st.freq, n.tx);
        if (n.type === 'SAT') {
          if (st.type !== 'SAT') return false;
          const f = stationFreqs(st);
          return near(f.tx, s.sat.tx) && near(f.rx, s.sat.rx);
        }
        if (n.hop === 'SINCGARS') return st.type === 'SINCGARS' && s.hopNetId === st.netId;
        return st.type === 'HAVEQUICK' && st.hqNet === n.hqNet;
      });
    }

    /** Comprueba la parte criptográfica. Devuelve null si es correcta o el motivo del fallo. */
    cryptoCheck(st, encrypted, mode, tag) {
      if (st.crypto) {
        if (!encrypted) return `${st.call} opera cifrado (CT ${st.crypto.mode}); su transmisión salió en claro (interruptor en PT o COMSEC NONE).`;
        if (mode !== st.crypto.mode) return `${st.call} usa ${st.crypto.mode}; su preset usa ${mode}.`;
        const want = typeof st.crypto.tag === 'function' ? st.crypto.tag(this.env.now()) : st.crypto.tag;
        if (tag !== want) return `La TEK seleccionada no es la de la red de ${st.call} (${want}): no pueden descifrarle.`;
        return null;
      }
      if (encrypted) return `${st.call} opera en claro (PT): no puede descifrar su transmisión. Ponga el interruptor en PT o COMSEC en NONE.`;
      return null;
    }

    /** Evalúa si una transmisión llega a alguna estación y si se podrá oír la respuesta. */
    evaluate(s) {
      const fail = (reason, station) => ({ ok: false, reason, station: station || null });
      const c = s.conn;
      if (s.dama) return this.evaluateDama(s);
      const n = s.net;
      // antena
      if (s.port === 'J5' && !c.j5) return fail('Por debajo de 90 MHz (y en SINCGARS) se necesita la antena de pala VHF en J5.');
      if (s.port === 'J8') {
        if (n.type === 'SAT' && c.j8 !== 'SATCOM') return fail('SATCOM necesita la antena SATCOM en J8.');
        if (n.type !== 'SAT' && c.j8 !== 'FLEX') return fail('Entre 90 y 512 MHz se necesita la antena flexible VHF/UHF en J8.');
      }
      const st = this.findStation(s);
      if (!st) {
        if (n.type === 'SAT') {
          const sw = this.stations.find((x) => x.type === 'SAT' && near(stationFreqs(x).tx, s.sat.rx) && near(stationFreqs(x).rx, s.sat.tx));
          if (sw) return fail('Frecuencias SATCOM invertidas: TX debe ser la de subida (292-318 MHz) y RX la de bajada (243-270 MHz).');
          return fail('Nadie escucha en ese canal SATCOM: compruebe el código de frecuencia en la SOI.');
        }
        if (n.type === 'HOP' && n.hop === 'SINCGARS') {
          if (!s.hopTag) return fail('El compartimento de hopset seleccionado está vacío: cargue el loadset SINCGARS.');
          return fail(`El hopset del compartimento ${pad(n.hopset)} es de la red F${pad(s.hopNetId, 3)}: elija el compartimento con la red de la SOI.`);
        }
        return fail('Nadie escucha en este canal: compruebe frecuencia, red y tipo de red según la SOI.');
      }
      if (st.type === 'LOS') {
        if (st.mod !== n.mod) return fail(`${st.call} opera en ${st.mod}; su preset transmite en ${n.mod}.`, st);
        if (st.sq === 'TONE' && n.sq !== 'TONE') return fail(`${st.call} usa squelch por tono: sin SQ = TONE su radio no envía el tono de 150 Hz y no le abren el squelch.`, st);
      }
      if (st.type === 'SINCGARS') {
        if (s.hopTag !== st.hop) return fail('El hopset no coincide con el de la red SINCGARS.', st);
        if (!s.todSinc) return fail('Sin hora de red SINCGARS no hay sincronización de saltos.', st);
      }
      if (st.type === 'HAVEQUICK') {
        if (!s.todHQ) return fail('Sin TOD no es posible el salto HAVEQUICK.', st);
        if (s.wodTag !== st.wod) return fail('La MWOD cargada para el día UTC actual no es la de la red.', st);
      }
      const encrypted = s.secure && n.crypto !== 'NONE';
      if (st.type === 'SAT' && !encrypted) return fail('SATCOM en claro no está permitido: interruptor en CT y COMSEC ANDVT/VINSON.', st);
      const cr = this.cryptoCheck(st, encrypted, n.crypto, s.keyTag);
      if (cr) return fail(cr, st);
      let quality = 'fuerte y claro';
      if (st.type === 'SAT') {
        const score = this.pointing(c);
        if (score < 80) return fail(`Antena SATCOM mal apuntada (RSSI ${score}). Use la SOI (Az ${SATELLITE.az}°, El ${SATELLITE.el}°) y repita la prueba RSSI (CALL).`, st);
        if (score < 90) quality = 'débil pero legible';
      } else {
        const range = s.rangeKm * (st.airborne ? 3 : 1);
        const m = range / st.distanceKm;
        if (m < 1) return fail(`Fuera de alcance: ${st.call} está a ${st.distanceKm} km y con ${s.powerW} W llega a unos ${Math.round(range)} km. Suba la potencia (PWR u OPT > POWER).`, st);
        if (m < 1.4) quality = 'débil pero legible';
      }
      if (st.type === 'LOS' && !near(n.rx, st.freq)) return fail(`${st.call} le oye, pero su frecuencia de recepción (${n.rx.toFixed(5)}) no es la de la red: no oirá la respuesta.`, st);
      return { ok: true, station: st, quality };
    }

    evaluateDama(s) {
      const st = this.stations.find((x) => x.type === 'DAMA');
      if (!s.call || !s.call.dest.includes(st.netAddr)) return { ok: false, reason: 'La llamada DAMA activa no está dirigida a la red de Nodo Orión.' };
      const encrypted = s.secure && s.cfg.crypto !== 'NONE';
      const cr = this.cryptoCheck(st, encrypted, s.cfg.crypto, s.keyTag);
      if (cr) return { ok: false, reason: cr, station: st };
      return { ok: true, station: st, quality: 'fuerte y claro' };
    }

    // ---------------------------------------------------------------- DAMA (controlador)
    damaAcquire(s) {
      const c = s.conn;
      if (c.j8 !== 'SATCOM') return { ok: false, reason: 'Sin antena SATCOM en J8' };
      if (this.pointing(c) < 80) return { ok: false, reason: 'Antena mal apuntada' };
      if (s.net.channel !== DAMA.channel) return { ok: false, reason: `El canal ${pad(s.net.channel, 3)} no es un canal DAMA de la SOI` };
      if (s.net.ow === 'ON' && s.tskTag !== DAMA.owTsk) return { ok: false, reason: 'La TSK de orderwire no es la del controlador' };
      return { ok: true };
    }
    damaLogin(s) {
      if (!DAMA.knownTBA.includes(s.net.tba)) return { ok: false, code: 77, reason: `El controlador no tiene registrada la TBA ${pad(s.net.tba, 5)}` };
      return { ok: true };
    }
    damaCall(s, { dest, prec }) {
      const order = ['ROUTINE', 'PRIORITY', 'IMMEDIATE', 'FLASH', 'FLASH OVERRIDE', 'EMERGENCY ACTION'];
      if (order.indexOf(prec) > order.indexOf(DAMA.maxPrecedence)) return { ok: false, code: 71, reason: 'Precedencia no autorizada' };
      if (s.cfg.code25 !== '060' || s.cfg.crypto !== 'ANDVT') return { ok: false, code: 81, reason: 'Configuración no soportada: use ANDVT y código 060' };
      if (!dest || !dest.ac25.includes(DAMA.networkAddr)) return { ok: false, code: 82, reason: 'Destino desconocido para el controlador' };
      return { ok: true };
    }

    todAvailable(s) {
      return !s.dama && s.net.type === 'HOP' && s.net.hop === 'HAVEQUICK' && s.conn.j8 === 'FLEX' && s.net.hqNet === '00.300';
    }

    // ---------------------------------------------------------------- tráfico
    later(ms, fn) {
      this._timers.push(this.env.setTimeout(fn, ms));
    }

    describe(s) {
      if (s.dama) return `DAMA ${s.presetNum}-${s.net.name} · canal ${pad(s.net.channel, 3)} · ${s.cfg.crypto}${s.keyTag ? ' ' + s.keyTag : ''}`;
      const n = s.net;
      const ch = n.type === 'LOS' ? `LOS ${n.mod} T ${n.tx.toFixed(5)} / R ${n.rx.toFixed(5)}`
        : n.type === 'SAT' ? `SATCOM código ${pad(n.code, 3)} (${s.sat.bw} kHz)`
          : n.hop === 'SINCGARS' ? `SINCGARS hopset ${pad(n.hopset)}${s.hopNetId != null ? ' F' + pad(s.hopNetId, 3) : ''}`
            : `HAVEQUICK red ${n.hqNet}`;
      const enc = s.secure && n.crypto !== 'NONE' ? `CT ${n.crypto}${s.keyTag ? ' ' + s.keyTag : ' (sin clave)'}` : 'PT';
      return `${pad(s.presetNum)}-${n.name} · ${ch} · ${enc} · ${s.powerW} W`;
    }

    onTransmit({ snapshot, text, dur }) {
      this.emit('log', { dir: 'TX', from: this.env.myCall(), text: text || '(portadora sin mensaje)', meta: this.describe(snapshot) });
      if (dur < 400) {
        this.emit('hint', 'Transmisión demasiado corta: mantenga pulsado el PTT mientras habla.');
        return;
      }
      const r = this.evaluate(snapshot);
      if (!r.ok) {
        this.emit('log', { dir: 'INFO', text: 'Sin respuesta.' });
        this.emit('hint', r.reason);
        return;
      }
      const st = r.station;
      this.later(1400 + this.env.random() * 1200, () => {
        const reply = this.compose(st, r.quality, text);
        if (!this.radio.receive({ from: st.call, clear: true, dur: Math.max(2500, reply.length * 55) })) return;
        this.contacts[st.id] = (this.contacts[st.id] || 0) + 1;
        this.emit('log', { dir: 'RX', from: st.call, text: reply, quality: r.quality });
        this.emit('contact', st.id);
      });
    }

    compose(st, quality, text) {
      const me = this.env.myCall();
      const t = (text || '').toLowerCase();
      let extra;
      if (/situaci|novedad|sitrep|reporte/.test(t)) extra = 'Reporte recibido, sin novedad en mi sector.';
      else if (/prueba|verific|check|escucha|recibe/.test(t)) extra = '';
      else extra = st.replies[Math.floor(this.env.random() * st.replies.length)];
      return `${me}, aquí ${st.call}. Le recibo ${quality}.${extra ? ' ' + extra : ''} Cambio.`;
    }

    tick() {
      const now = this.env.now();
      if (now < this.nextChatter) return;
      this.nextChatter = now + 35000 + this.env.random() * 35000;
      const radio = this.radio;
      if (!radio.operating || radio.tx || radio.rx || radio.mode !== 'NORMAL') return;
      const s = radio.linkSnapshot();
      const r = this.evaluate(s);
      const st = r.station || this.findStation(s);
      if (!st) return;
      const msg = st.chatter[0];
      if (r.ok) {
        if (radio.receive({ from: st.call, clear: true, dur: Math.max(2500, msg.length * 55) })) this.emit('log', { dir: 'RX', from: st.call, text: msg });
      } else if (st.crypto && radio.receive({ from: st.call, clear: false, dur: 3000 })) {
        this.emit('log', { dir: 'RX', from: '?', text: '[señal cifrada ininteligible]' });
        this.emit('hint', `Está recibiendo tráfico cifrado de ${st.call}: ${r.reason}`);
      }
    }

    reset() {
      this._timers.forEach((id) => this.env.clearTimeout(id));
      this._timers = [];
      this.contacts = {};
    }
  }

  Net.STATIONS = STATIONS;
  Net.SATELLITE = SATELLITE;
  Net.DAMA = DAMA;
  SIM.Net = Net;
})(typeof window !== 'undefined' ? window : globalThis);
