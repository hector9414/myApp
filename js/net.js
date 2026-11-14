/*
 * Red de radio simulada: estaciones virtuales que responden a las
 * transmisiones del alumno cuando la configuración de la radio coincide con
 * la de su red (canal, modulación, claves, TOD, antena y alcance).
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;

  const STATIONS = [
    {
      id: 'HALCON',
      call: 'Halcón 6',
      mode: 'LOS', mod: 'FM', freq: 45.5, bw: 25,
      crypto: null, distanceKm: 3,
      desc: 'Puesto de mando de compañía · LOS FM 45.5000 MHz · en claro (PT) · 3 km',
      chatter: [
        'A todas las estaciones de esta red, aquí Halcón 6. Reporte de situación en diez minutos. Corto.',
        'Aquí Halcón 6. Verificación de comunicaciones, respondan por orden. Cambio.',
      ],
      replies: ['Sin novedad en el puesto de mando.', 'Continúe con la misión.'],
    },
    {
      id: 'CONDOR',
      call: 'Cóndor 3',
      mode: 'LOS', mod: 'FM', freq: 62.75, bw: 25,
      crypto: 'ALFA-TEK-01', distanceKm: 12,
      desc: 'Pelotón destacado · LOS FM 62.7500 MHz · cifrado CT (ALFA-TEK-01) · 12 km',
      chatter: ['Aquí Cóndor 3. En posición, sin contacto. Corto.'],
      replies: ['Red cifrada verificada.', 'Mantengo posición.'],
    },
    {
      id: 'JAGUAR',
      call: 'Jaguar 1',
      mode: 'SINCGARS', netId: 345,
      tsk: 'SINC-HOP-12', crypto: 'BRAVO-TEK-02', distanceKm: 8,
      desc: 'Elemento de maniobra · SINCGARS red 345 · TSK SINC-HOP-12 · CT BRAVO-TEK-02 · 8 km',
      chatter: ['Aquí Jaguar 1. Iniciando movimiento hacia la fase dos. Corto.'],
      replies: ['Sincronizado en salto de frecuencia.', 'Le tengo en la red de maniobra.'],
    },
    {
      id: 'AGUILA',
      call: 'Águila 2',
      mode: 'HQ', hqNet: 300,
      wod: 'HQ-WOD-NOV', crypto: null, distanceKm: 40, airborne: true,
      desc: 'Aeronave de apoyo · HAVE QUICK II red 300 · WOD HQ-WOD-NOV · TOD requerido · 40 km (en vuelo)',
      chatter: ['Aquí Águila 2, en órbita sobre el punto de control. Corto.'],
      replies: ['Le tengo en salto HAVE QUICK.', 'Disponible para apoyo durante veinte minutos.'],
    },
    {
      id: 'CENTAURO',
      call: 'Base Centauro',
      mode: 'SATCOM', satType: 'DEDICADO', tx: 311.15, rx: 254.15, bw: 5,
      crypto: 'ANDVT-TEK-31', alg: 'ANDVT',
      desc: 'Base de operaciones · SATCOM dedicado 5 kHz · TX (subida) 311.1500 / RX (bajada) 254.1500 MHz · CT ANDVT con ANDVT-TEK-31 · antena SATCOM · mín. 10 W',
      chatter: ['Aquí Base Centauro. Ventana de satélite estable. Corto.'],
      replies: ['Enlace satelital en banda estrecha confirmado.', 'Mensaje copiado, se retransmite al escalón superior.'],
    },
    {
      id: 'ORION',
      call: 'Nodo Orión',
      mode: 'SATCOM', satType: 'DAMA', sat: 'SAT-2', net: 7, bw: 25, assignedAddr: 10452,
      crypto: 'VIN-TEK-05', alg: 'VINSON',
      desc: 'Nodo de mando · SATCOM DAMA 25 kHz · satélite SAT-2, red 07 · su dirección de terminal asignada: 10452 · CT VINSON con VIN-TEK-05 · acceso DAMA requerido',
      chatter: ['Aquí Nodo Orión. Red DAMA operativa, mantengan disciplina de red. Corto.'],
      replies: ['Le tengo en la red DAMA.', 'Asignación DAMA verificada.'],
    },
  ];

  function sameChannel(st, p) {
    if (st.mode !== p.mode) return false;
    if (st.mode === 'LOS') return Math.abs(st.freq - p.freq) < 0.0005;
    if (st.mode === 'SINCGARS') return st.netId === p.netId;
    if (st.mode === 'HQ') return st.hqNet === p.hqNet;
    if (st.satType !== p.satType) return false;
    if (st.satType === 'DAMA') return st.sat === p.damaSat && st.net === p.damaNet;
    return Math.abs(st.tx - p.satTx) < 0.0005 && Math.abs(st.rx - p.satRx) < 0.0005;
  }

  function describeChannel(s) {
    const p = s.preset;
    const ch =
      p.mode === 'LOS' ? `LOS ${p.mod} ${p.freq.toFixed(4)} MHz`
        : p.mode === 'SINCGARS' ? `SINCGARS red ${SIM.pad(p.netId, 3)}`
          : p.mode === 'HQ' ? `HAVE QUICK red ${SIM.pad(p.hqNet, 3)}`
            : p.satType === 'DAMA' ? `SATCOM DAMA ${p.damaSat} red ${SIM.pad(p.damaNet)} ${p.satBw}K dir ${SIM.pad(p.damaAddr, 5)}`
              : `SATCOM ${p.satBw}K TX ${p.satTx.toFixed(4)} / RX ${p.satRx.toFixed(4)} MHz`;
    return `P${SIM.pad(s.presetNum)} · ${ch} · ${p.crypto}${p.crypto === 'CT' ? ' ' + p.cryptoMode + ' ' + (s.keyTag || '?') : ''} · ${s.powerW} W`;
  }

  class Net extends SIM.Emitter {
    /** env.myCall() -> indicativo del alumno */
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

    /** Evalúa si una transmisión con esta configuración llegaría a alguna estación. */
    evaluate(s) {
      const p = s.preset;
      const c = s.conn;
      const fail = (reason, station) => ({ ok: false, reason, station: station || null });
      if (c.antenna === 'NONE') return fail('Sin antena conectada: la radio no radia (alarma VSWR). Conecte una antena.');
      const st = this.stations.find((x) => sameChannel(x, p));
      if (!st) {
        if (p.mode === 'LOS') {
          const near = this.stations.find((x) => x.mode === 'LOS' && Math.abs(x.freq - p.freq) < 0.1);
          if (near) return fail(`No hay ninguna estación exactamente en ${p.freq.toFixed(4)} MHz. Revise la frecuencia (dígitos y decimales).`);
        }
        if (p.mode === 'SATCOM') {
          if (p.satType === 'DEDICADO') {
            const swapped = this.stations.find((x) => x.mode === 'SATCOM' && x.satType === 'DEDICADO' && Math.abs(x.tx - p.satRx) < 0.0005 && Math.abs(x.rx - p.satTx) < 0.0005);
            if (swapped) return fail('Frecuencias SATCOM invertidas: FREC TX debe ser la de subida (292-318 MHz) y FREC RX la de bajada (243-270 MHz).');
            const half = this.stations.find((x) => x.mode === 'SATCOM' && x.satType === 'DEDICADO' && (Math.abs(x.tx - p.satTx) < 0.0005 || Math.abs(x.rx - p.satRx) < 0.0005));
            if (half) return fail('Solo coincide una de las dos frecuencias del canal SATCOM: revise la pareja TX/RX en la orden de comunicaciones.');
          } else {
            const net = this.stations.find((x) => x.mode === 'SATCOM' && x.satType === 'DAMA' && x.net === p.damaNet);
            if (net) return fail(`La red DAMA ${SIM.pad(p.damaNet)} está en ${net.sat}, no en ${p.damaSat}.`);
          }
        }
        return fail('Nadie escucha en este canal: compruebe modo, frecuencia, número de red o canal según la orden de comunicaciones.');
      }
      if (st.mode === 'LOS' && st.mod !== p.mod) return fail(`${st.call} opera en ${st.mod}; su radio transmite en ${p.mod}.`, st);
      if (st.mode === 'LOS' && st.bw !== p.bw) return fail(`El ancho de canal no coincide: la red usa ${st.bw} kHz.`, st);
      if (st.mode === 'SATCOM' && c.antenna !== 'SATCOM') return fail('SATCOM necesita la antena SATCOM direccional.', st);
      if (st.mode === 'SATCOM' && st.bw !== p.satBw) return fail(`El ancho de canal SATCOM no coincide: la red usa ${st.bw} kHz.`, st);
      if (st.mode === 'SATCOM' && st.satType === 'DAMA') {
        if (p.damaAddr !== st.assignedAddr) return fail(`El controlador DAMA no reconoce la dirección de terminal ${SIM.pad(p.damaAddr, 5)}: use la asignada en la orden de comunicaciones.`, st);
        if (!s.damaOk) return fail('Sin acceso DAMA concedido: PGM > ACCESO DAMA.', st);
      }
      if (st.mode !== 'SATCOM' && c.antenna === 'SATCOM') return fail('La antena SATCOM no sirve para enlaces terrestres LOS/SINCGARS/HQ: conecte el látigo.', st);
      if (st.mode === 'SINCGARS' && s.transecTag !== st.tsk) return fail('La TSK cargada no coincide con la de la red SINCGARS: no hay sincronización de saltos.', st);
      if (st.mode === 'HQ') {
        if (s.transecTag !== st.wod) return fail('La WOD (palabra del día) no coincide con la de la red HAVE QUICK.', st);
        if (!s.todValid) return fail('Sin hora TOD sincronizada no es posible el salto HAVE QUICK.', st);
      }
      if (st.crypto) {
        if (p.crypto !== 'CT') return fail(`${st.call} opera cifrado (CT); su transmisión en claro (PT) no es aceptada.`, st);
        const alg = st.alg || 'VINSON';
        if (p.cryptoMode !== alg) return fail(`${st.call} usa modo cripto ${alg}; su radio transmite en ${p.cryptoMode}.`, st);
        if (s.keyTag !== st.crypto) return fail('La TEK seleccionada no es la de la red: la estación no puede descifrar su transmisión.', st);
      } else if (p.crypto === 'CT') {
        return fail(`${st.call} opera en claro (PT): no puede descifrar su transmisión CT.`, st);
      }
      if (st.mode === 'SATCOM') {
        if (s.powerW < 10) return fail('Potencia insuficiente para el enlace satelital (mínimo ALTA, 10 W).', st);
        return { ok: true, station: st, quality: 'fuerte y claro' };
      }
      const rangeKm = s.powerKm * (st.airborne ? 3 : 1);
      const margin = rangeKm / st.distanceKm;
      if (margin < 1) return fail(`Fuera de alcance: ${st.call} está a ${st.distanceKm} km y con ${s.powerW} W llega a unos ${rangeKm} km. Aumente la potencia.`, st);
      return { ok: true, station: st, quality: margin >= 1.6 ? 'fuerte y claro' : 'débil pero legible' };
    }

    /** ¿Se recibe en claro lo que emite una estación en el canal actual? */
    canHear(st, s) {
      const p = s.preset;
      const c = s.conn;
      if (c.antenna === 'NONE') return false;
      if (st.mode === 'SATCOM' ? c.antenna !== 'SATCOM' : c.antenna === 'SATCOM') return false;
      if (st.mode === 'LOS' && (st.mod !== p.mod || st.bw !== p.bw)) return false;
      if (st.mode === 'SINCGARS' && s.transecTag !== st.tsk) return false;
      if (st.mode === 'HQ' && (s.transecTag !== st.wod || !s.todValid)) return false;
      if (st.mode === 'SATCOM' && (st.bw !== p.satBw || (st.satType === 'DAMA' && !s.damaOk))) return false;
      return true;
    }
    decrypts(st, s) {
      if (!st.crypto) return true; // la 117F admite recepción en claro aunque esté en CT
      return s.preset.crypto === 'CT' && s.preset.cryptoMode === (st.alg || 'VINSON') && s.keyTag === st.crypto;
    }

    later(ms, fn) {
      this._timers.push(this.env.setTimeout(fn, ms));
    }

    onTransmit({ snapshot, text, dur }) {
      this.emit('log', { dir: 'TX', from: this.env.myCall(), text: text || '(portadora sin mensaje)', meta: describeChannel(snapshot) });
      if (dur < 400) {
        this.emit('hint', 'Transmisión demasiado corta: mantenga pulsado el PTT mientras habla (al menos medio segundo).');
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
        const ok = this.radio.receive({ from: st.call, clear: true, dur: Math.max(2500, reply.length * 55) });
        if (!ok) return;
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
      else if (/prueba|verific|check|escucha|me recibe|recibe/.test(t)) extra = '';
      else extra = st.replies[Math.floor(this.env.random() * st.replies.length)];
      return `${me}, aquí ${st.call}. Le recibo ${quality}.${extra ? ' ' + extra : ''} Cambio.`;
    }

    /** Tráfico espontáneo de la red (llamar periódicamente). */
    tick() {
      const now = this.env.now();
      if (now < this.nextChatter) return;
      this.nextChatter = now + 35000 + this.env.random() * 35000;
      const radio = this.radio;
      if (!radio.operating || radio.tx || radio.rx) return;
      const s = radio.linkSnapshot();
      const st = this.stations.find((x) => sameChannel(x, s.preset));
      if (!st || !this.canHear(st, s)) return;
      const msg = st.chatter[Math.floor(this.env.random() * st.chatter.length)];
      if (this.decrypts(st, s)) {
        if (radio.receive({ from: st.call, clear: true, dur: Math.max(2500, msg.length * 55) })) this.emit('log', { dir: 'RX', from: st.call, text: msg });
      } else if (radio.receive({ from: st.call, clear: false, dur: 3000 })) {
        this.emit('log', { dir: 'RX', from: '?', text: '[señal cifrada ininteligible]' });
        this.emit('hint', `Está recibiendo tráfico cifrado de ${st.call}. Necesita estar en CT con la TEK de esa red.`);
      }
    }

    reset() {
      this._timers.forEach((id) => this.env.clearTimeout(id));
      this._timers = [];
      this.contacts = {};
    }
  }

  Net.STATIONS = STATIONS;
  Net.sameChannel = sameChannel;
  SIM.Net = Net;
})(typeof window !== 'undefined' ? window : globalThis);
