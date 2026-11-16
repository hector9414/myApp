/* Interfaz principal: conecta los modelos con la página. */
(function () {
  'use strict';
  const SIM = window.SIM;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const STORE = 'sim-prc117f-skl-v5';

  const DEFAULT_CONN = { j1: 'NONE', j5: false, j8: 'NONE', az: 0, el: 0, cik: true };
  const conn = Object.assign({}, DEFAULT_CONN);
  const prefs = { hints: true, voice: false, call: 'Lobo 2', scenario: 'bit' };
  let completed = {};

  const radio = new SIM.Radio({ getConn: () => conn });
  const skl = new SIM.SKL({ cik: () => conn.cik });
  SIM.connectFill(() => conn, radio, skl);
  const net = new SIM.Net(radio, { myCall: () => prefs.call.trim() || 'Lobo 2' });
  radio.env.net = net;

  // ------------------------------------------------------------------ persistencia
  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { data = null; }
    if (!data) return;
    try {
      radio.load(data.radio);
      skl.load(data.skl);
      if (data.conn) for (const k of Object.keys(DEFAULT_CONN)) if (k in data.conn) conn[k] = data.conn[k];
      conn.j1 = conn.j1 === 'SKL' ? 'NONE' : conn.j1; // al abrir, nunca con el SKL ya conectado
      if (data.prefs) Object.assign(prefs, data.prefs);
      if (data.completed) completed = data.completed;
    } catch (e) { /* estado corrupto: se ignora */ }
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify({ radio: radio.serialize(), skl: skl.serialize(), conn, prefs, completed }));
      } catch (e) { /* almacenamiento no disponible */ }
    }, 400);
  }

  // ------------------------------------------------------------------ avisos y registro
  function toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  const logEl = $('#log');
  function addLog({ dir, from, text, meta, quality }) {
    const li = document.createElement('li');
    li.className = 'log-' + dir.toLowerCase();
    const badge = { TX: 'TX', RX: 'RX', INFO: 'INFO', HINT: 'AYUDA', FILL: 'COMSEC', WARN: 'ALERTA' }[dir] || dir;
    li.innerHTML = `<time>${SIM.hhmmss(Date.now())}</time><span class="badge">${badge}</span><div class="log-body"></div>`;
    const body = li.querySelector('.log-body');
    if (from) {
      const b = document.createElement('b');
      b.textContent = from + ': ';
      body.appendChild(b);
    }
    body.appendChild(document.createTextNode(text));
    if (meta || quality) {
      const m = document.createElement('small');
      m.textContent = [meta, quality ? 'calidad: ' + quality : ''].filter(Boolean).join(' · ');
      body.appendChild(m);
    }
    logEl.appendChild(li);
    while (logEl.children.length > 200) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }
  const hint = (text) => prefs.hints && addLog({ dir: 'HINT', text });

  // ------------------------------------------------------------------ radio
  // Ángulos del interruptor como en el manual: OFF arriba-izq., PT arriba, ..., Z-ALL abajo, CLR abajo-izq.
  const SW_ANGLE = { OFF: -70, PT: -35, CT: 0, TD: 35, RV: 70, LD: 105, ZALL: 152, CLR: 208 };
  const escHtml = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lcdHtml = (t) => escHtml(t).replace(/\u0001/g, '<span class="blink">').replace(/\u0002/g, '</span>');
  const row3 = (r, cls) => (r ? `<div class="${cls}"><span class="l">${lcdHtml(r.l)}</span><span class="c">${lcdHtml(r.c)}</span><span class="r">${lcdHtml(r.r)}</span></div>` : `<div class="${cls}"></div>`);

  /** Dibuja la pantalla gráfica del KDU a partir de la descripción del modelo. */
  function lcdMarkup(d) {
    if (!d.lit) return '';
    let status = '<div class="lcd-st"></div>';
    if (d.status && d.status.title !== undefined) {
      status = `<div class="lcd-st"><span class="st-l">${lcdHtml(d.status.title)}</span><span class="st-r">${escHtml(d.status.sw)}</span></div>`;
    } else if (d.status) {
      const st = d.status;
      status = `<div class="lcd-st"><span class="st-l"><b class="rti">${st.rt}</b> BAT <i class="lbat"><b style="width:${st.bat}%"></b></i> ${escHtml(st.mode)} ${escHtml(st.crypto)}</span><span class="st-r">${escHtml(st.sw)}</span></div>`;
    }
    const icons = d.icons ? `<span class="lcd-ic"><i class="cyc">⟳</i><i class="meter"><b style="width:${Math.round(d.meter * 100)}%"></b></i></span>` : '';
    const r0 = d.rows[0] || {};
    const big1 = `<div class="lcd-big">${row3(r0, 'cols')}${icons}</div>`;
    let rest;
    if (d.grid) {
      rest = `<div class="lcd-grid" style="--n:${d.grid.length}">${d.grid.map((g) => `<div><b>${lcdHtml(g[0])}</b><small>${lcdHtml(g[1])}</small></div>`).join('')}</div>`;
    } else {
      rest = `<div class="lcd-big">${row3(d.rows[1], 'cols')}</div>${row3(d.foot, 'lcd-foot cols')}`;
    }
    return status + big1 + rest;
  }

  let lastLcd = '';
  function renderRadio() {
    const d = radio.display();
    const lcd = $('#radio-lcd');
    const html = lcdMarkup(d);
    if (html !== lastLcd) {
      lastLcd = html;
      lcd.innerHTML = html;
    }
    lcd.classList.toggle('on', d.lit);
    lcd.dataset.light = d.lit ? String(d.light || 0) : '0';
    lcd.setAttribute('aria-label', d.text.filter(Boolean).map(SIM.plain).join('. '));
    $('#func-switch').style.setProperty('--angle', SW_ANGLE[radio.sw] + 'deg');
    $$('.fs-pos').forEach((b) => {
      b.classList.toggle('active', b.dataset.sw === radio.sw);
      b.setAttribute('aria-pressed', String(b.dataset.sw === radio.sw));
    });
    const bat = Math.ceil(radio.battery);
    $('#bat-meter b').style.width = bat + '%';
    $('#bat-meter').classList.toggle('low', bat <= 15);
    $('#bat-bar').style.width = bat + '%';
    $('#bat-bar').className = bat <= 15 ? 'low' : '';
    $('#bat-text').textContent = bat + ' %';
    $('#bat-text2').textContent = bat + ' %';
    SIM.audio.volume = radio.volume / 8;
    $('#ptt').classList.toggle('tx', radio.tx);
  }

  function renderConn() {
    $$('input[name="j1"]').forEach((r) => { r.checked = r.value === conn.j1; });
    $$('input[name="j8"]').forEach((r) => { r.checked = r.value === conn.j8; });
    $('#conn-j5').checked = conn.j5;
    if (document.activeElement !== $('#conn-az')) $('#conn-az').value = conn.az;
    if (document.activeElement !== $('#conn-el')) $('#conn-el').value = conn.el;
    $('#pointing').disabled = conn.j8 !== 'SATCOM';
    $('#port-j1').classList.toggle('connected', conn.j1 !== 'NONE');
    $('#port-j1').classList.toggle('fill', conn.j1 === 'SKL');
    $('#j1-what').textContent = { NONE: '', HANDSET: 'H-250', SKL: 'SKL' }[conn.j1];
    $('#port-j5').classList.toggle('connected', conn.j5);
    $('#j5-what').textContent = conn.j5 ? 'PALA VHF' : '';
    $('#port-j8').classList.toggle('connected', conn.j8 !== 'NONE');
    $('#j8-what').textContent = { NONE: '', FLEX: 'FLEX VHF/UHF', SATCOM: 'SATCOM' }[conn.j8];
    $('#skl-fill').classList.toggle('connected', conn.j1 === 'SKL');
    $('#cik-slot').classList.toggle('connected', conn.cik);
    $('#handset').classList.toggle('disconnected', conn.j1 !== 'HANDSET');
    $('#handset-state').textContent = conn.j1 === 'HANDSET' ? 'conectado a J1' : 'no conectado';
    $('#ptt').disabled = conn.j1 !== 'HANDSET';
  }

  // ------------------------------------------------------------------ SKL
  let lastSkl = '';
  let lastDlgKey = '';
  let sipCaps = false;
  let sipTarget = null; // nombre del último campo con foco (para el Input Panel)
  function renderSKL() {
    const el = $('#skl-screen');
    el.className = 'skl-screen' + (skl.power ? ' on' : '');
    const html = SIM.renderSKL(skl, { hints: prefs.hints, caps: sipCaps });
    if (html !== lastSkl) {
      // conserva lo tecleado en los campos del diálogo abierto
      const dlgKey = skl.dlg ? skl.dlg.type + ':' + skl.dialogs.length : '';
      const saved = {};
      if (dlgKey && dlgKey === lastDlgKey) el.querySelectorAll('.ce-dlg input').forEach((i) => { saved[i.name + ':' + i.type + ':' + i.value] = i.type === 'checkbox' || i.type === 'radio' ? i.checked : i.value; });
      const savedText = {};
      if (dlgKey && dlgKey === lastDlgKey) el.querySelectorAll('.ce-dlg input[type="text"], .ce-dlg input[type="password"]').forEach((i) => { savedText[i.name] = i.value; });
      const focused = document.activeElement && el.contains(document.activeElement) ? document.activeElement.name : null;
      lastSkl = html;
      el.innerHTML = html;
      if (dlgKey && dlgKey === lastDlgKey) {
        el.querySelectorAll('.ce-dlg input').forEach((i) => {
          if (i.type === 'checkbox' || i.type === 'radio') {
            const k = i.name + ':' + i.type + ':' + i.value;
            if (k in saved) i.checked = saved[k];
          } else if (i.name in savedText) i.value = savedText[i.name];
        });
        if (focused) {
          const f = el.querySelector(`.ce-dlg [name="${CSS.escape(focused)}"]`);
          if (f) f.focus({ preventScroll: true });
        }
      } else {
        const first = el.querySelector('.ce-dlg input:not([readonly])');
        if (first) first.focus({ preventScroll: true });
      }
      lastDlgKey = dlgKey;
    }
    $('#skl-kov').className = 'kov ' + (skl.kov === 'GREEN' ? 'green' : '');
    const b = Math.ceil(skl.battery);
    const col = b > 40 ? 'g' : b > 10 ? 'a' : 'r';
    $('#skl-bat-bar').style.width = b + '%';
    $('#skl-bat-bar').className = col === 'r' ? 'low' : col === 'a' ? 'mid' : '';
    $('#skl-bat-text').textContent = b + ' %';
  }

  // ------------------------------------------------------------------ ejercicios
  function renderScenarios() {
    const ctx = { radio, skl, net, conn };
    const results = {};
    SIM.SCENARIOS.forEach((sc) => {
      results[sc.id] = SIM.evaluateScenario(sc, ctx);
      if (!completed[sc.id] && results[sc.id].every((c) => c.ok)) {
        completed[sc.id] = true;
        toast(`Ejercicio completado: ${sc.title}`, 'ok');
        addLog({ dir: 'INFO', text: `✔ Ejercicio completado: ${sc.title}` });
        save();
      }
    });
    $('#sc-list').innerHTML = SIM.SCENARIOS.map((sc, i) => `
      <button type="button" class="sc-item${prefs.scenario === sc.id ? ' active' : ''}${completed[sc.id] ? ' done' : ''}" data-sc="${sc.id}">
        <span class="sc-num">${completed[sc.id] ? '✓' : i + 1}</span>
        <span class="sc-name">${sc.title}</span>
        <span class="sc-level">${sc.level}</span>
      </button>`).join('');
    const sc = SIM.SCENARIOS.find((s) => s.id === prefs.scenario);
    const det = $('#sc-detail');
    if (!sc) {
      det.innerHTML = '<p class="muted">Seleccione un ejercicio o practique libremente.</p>';
      return;
    }
    const res = results[sc.id];
    const done = res.filter((c) => c.ok).length;
    det.innerHTML = `
      <h3>${sc.title}</h3>
      <p class="goal">${sc.goal}</p>
      <ol class="steps">${sc.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      <div class="progress"><div style="width:${Math.round((done / res.length) * 100)}%"></div></div>
      <ul class="checks">${res.map((c) => `<li class="${c.ok ? 'ok' : ''}"><span>${c.ok ? '✓' : '○'}</span>${c.label}</li>`).join('')}</ul>`;
  }

  function renderStations() {
    const N = SIM.Net;
    $('#stations').innerHTML = N.STATIONS.map((s) => `<li><b>${s.call}</b>: ${s.desc}</li>`).join('')
      + `<li><b>Satélite ${N.SATELLITE.name}</b>: azimut ${N.SATELLITE.az}°, elevación ${N.SATELLITE.el}° (prueba RSSI ≥ 80).</li>`
      + '<li><b>Códigos de frecuencia SATCOM (tabla de entrenamiento)</b>: 009-128 = 25 kHz, 129-239 = 5 kHz, 999 = manual. El 150 es RX 247,70500 / TX 296,20500 MHz.</li>';
  }

  let frame = null;
  function renderAll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      renderRadio();
      renderConn();
      renderSKL();
      renderScenarios();
    });
  }

  // ------------------------------------------------------------------ eventos de los modelos
  /** Conectar un dispositivo de llenado a J1 fuera de LD/RV hace transmitir a la radio (aviso del curso). */
  function checkFillHazard() {
    if (conn.j1 === 'SKL' && radio.operating) {
      radio.fillHazard();
    }
  }

  radio.on('change', () => { renderAll(); save(); });
  radio.on('beep', () => SIM.audio.beep());
  radio.on('squelch-tail', () => SIM.audio.noise(180));
  radio.on('fill', (e) => {
    const where = e.loadset ? `loadset ${e.loadset}` : `${e.req.crypto} ${e.req.keyType}${e.req.keyType === 'KEK' || e.req.keyType === 'TRKEK' ? '' : ' ' + SIM.pad(e.req.num)}`;
    if (e.ok) addLog({ dir: 'FILL', text: `Radio: FILL DONE · ${e.key ? e.key.tag + ' → ' : ''}${where}${e.protocol ? ' (' + e.protocol + ')' : ''}.` });
    else {
      addLog({ dir: 'WARN', text: `Radio: BAD FILL · ${where}.` });
      if (e.reason) hint(e.reason);
    }
  });
  radio.on('zeroize', (e) => addLog({ dir: 'FILL', text: e.black && e.all ? 'Radio: CLR · programación y COMSEC borrados.' : e.black ? 'Radio: ZERO · programación borrada (COMSEC conservado).' : `Radio: ${e.source} · COMSEC y TRANSEC borrados.` }));
  radio.on('bit', (r) => addLog({ dir: 'INFO', text: `Radio: ${r.pass ? 'BIT PASSED' : 'BIT FAILED'}.` }));
  radio.on('tod', (e) => addLog({ dir: 'INFO', text: `Radio: TOD ${e.kind}${e.via ? ' por ' + e.via : ''} establecido.` }));
  radio.on('rssi', (r) => addLog({ dir: 'INFO', text: `Radio: prueba RSSI ${r.score} (${r.score >= 80 ? 'apuntamiento correcto' : 'reoriente la antena'}).` }));
  radio.on('dama', (d) => {
    if (d.ok) addLog({ dir: 'INFO', text: `DAMA: ${d.status}${d.dest ? ' → ' + d.dest.join(', ') : ''}.` });
    else {
      addLog({ dir: 'WARN', text: `DAMA: error ${d.code}.` });
      if (d.reason) hint(`DAMA error ${d.code}: ${d.reason}.`);
    }
  });
  radio.on('hazard', () => {
    addLog({ dir: 'WARN', text: 'Radio: dispositivo de llenado conectado a J1 fuera de LD/RV. La radio ha transmitido automáticamente.' });
    toast('¡Peligro! Conecte el dispositivo de llenado solo con el interruptor en LD o RV, y desconéctelo antes de volver a PT/CT/TD.', 'warn');
  });
  radio.on('dead', () => toast('La batería de la radio se ha agotado. Reemplácela en «Conexiones».', 'warn'));
  skl.on('change', () => { renderAll(); save(); });
  net.on('log', (l) => {
    addLog(l);
    if (l.dir === 'RX') {
      SIM.audio.noise(90);
      if (prefs.voice && l.text && !l.text.startsWith('[')) SIM.audio.speak(l.text);
    }
  });
  net.on('hint', hint);
  net.on('contact', renderAll);

  // ------------------------------------------------------------------ controles de la radio
  $('.kdu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    SIM.audio.unlock();
    radio.press(b.dataset.key);
  });

  $$('.fs-pos').forEach((b) => b.addEventListener('click', () => {
    SIM.audio.unlock();
    const pos = b.dataset.sw;
    if (pos === 'ZALL' && !window.confirm('Z-ALL: se borrarán todas las claves COMSEC y los datos de salto (TRANSEC). La programación se conserva.\n\n¿Continuar?')) return;
    if (pos === 'CLR' && !window.confirm('CLR: desconecta la batería de mantenimiento y borra TODA la programación y el COMSEC.\n\n¿Continuar?')) return;
    const wasLd = radio.sw === 'LD';
    radio.setSwitch(pos);
    if (wasLd && conn.j1 === 'SKL' && ['PT', 'CT', 'TD'].includes(pos)) setTimeout(checkFillHazard, 0);
  }));

  let pttActive = false;
  function pttStart() {
    if (pttActive) return;
    SIM.audio.unlock();
    SIM.audio.stopSpeech();
    const r = radio.pttDown();
    if (!r.ok) {
      toast(r.reason, 'warn');
      return;
    }
    pttActive = true;
    SIM.audio.beep(1000, 60);
  }
  function pttStop() {
    if (!pttActive) return;
    pttActive = false;
    radio.pttUp($('#tx-text').value.trim());
  }
  const ptt = $('#ptt');
  ptt.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { ptt.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
    pttStart();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => ptt.addEventListener(ev, pttStop));
  ptt.addEventListener('contextmenu', (e) => e.preventDefault());
  $('#tx-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
      toast('Mensaje listo: mantenga pulsado PTT (o la barra espaciadora) para transmitir.');
    }
  });

  // teclado físico
  const KEYMAP = {
    Enter: 'ENT', Backspace: 'CLR', Escape: 'CLR', Delete: 'CLR',
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    PageUp: 'PRE+', PageDown: 'PRE-',
  };
  const typing = (el) => el && ((el.tagName === 'INPUT' && !['checkbox', 'radio'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.isContentEditable);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) pttStart();
      return;
    }
    if (e.target.tagName === 'BUTTON' && e.key === 'Enter' && !e.target.closest('.radio')) return;
    const k = /^[0-9]$/.test(e.key) ? e.key : KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    SIM.audio.unlock();
    radio.press(k);
    const b = document.querySelector(`.kdu [data-key="${CSS.escape(k === 'UP' ? '6' : k === 'DOWN' ? '9' : k)}"]`);
    if (b) {
      b.classList.add('pressed');
      setTimeout(() => b.classList.remove('pressed'), 120);
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key !== ' ' || typing(e.target)) return;
    e.preventDefault();
    pttStop();
  });
  window.addEventListener('blur', pttStop);

  // ------------------------------------------------------------------ controles del SKL
  $('#skl-power').addEventListener('click', () => { SIM.audio.unlock(); skl.powerButton(); });
  $('#skl-zero').addEventListener('click', () => {
    if (!skl.power) return toast('El SKL está apagado.', 'warn');
    if (window.confirm('ZEROIZE del SKL: se borrarán TODAS las claves y la tarjeta KOV-21 quedará sin inicializar.\n\n¿Continuar?')) skl.zeroize();
  });
  /** Recoge los campos del diálogo abierto (texto, contraseñas, radios, casillas y listas). */
  function dialogFields(form) {
    const f = {};
    if (!form) return f;
    form.querySelectorAll('input, select').forEach((i) => {
      if (!i.name) return;
      if (i.type === 'checkbox') {
        if (i.name === 'keys') {
          f.keys = f.keys || [];
          if (i.checked) f.keys.push(i.value);
        } else f[i.name] = i.checked;
      } else if (i.type === 'radio') {
        if (i.checked) f[i.name] = i.value;
      } else f[i.name] = i.value;
    });
    return f;
  }
  const sklScreen = $('#skl-screen');
  sklScreen.addEventListener('click', (e) => {
    const db = e.target.closest('[data-dlg-btn]');
    if (db) {
      SIM.audio.beep(2400, 25);
      if (db.dataset.dlgBtn === 'Clear') {
        db.closest('form').querySelectorAll('input:not([readonly])').forEach((i) => { i.value = ''; });
        return;
      }
      skl.act('dlg', { btn: db.dataset.dlgBtn, fields: dialogFields(db.closest('form')) });
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) {
      if (skl.menu || skl.startMenu || skl.switcher) skl.act('menuClose');
      return;
    }
    if (b.tagName === 'INPUT') return;
    e.stopPropagation();
    SIM.audio.beep(2400, 15);
    skl.act(b.dataset.act, b.dataset.arg);
  });
  // campos que cambian el diálogo en vivo (Protocol, Activate Mode, Transfer Type, casillas)
  sklScreen.addEventListener('change', (e) => {
    if (!e.target.matches('[data-live]')) return;
    skl.act('dlgField', { fields: dialogFields(e.target.closest('form')) });
  });
  sklScreen.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' && !['checkbox', 'radio'].includes(e.target.type)) sipTarget = e.target.name;
  });
  // Input Panel (teclado en pantalla de Windows CE)
  sklScreen.addEventListener('mousedown', (e) => { if (e.target.closest('[data-kb]')) e.preventDefault(); });
  sklScreen.addEventListener('click', (e) => {
    const kb = e.target.closest('[data-kb]');
    if (!kb) return;
    e.stopPropagation();
    const k = kb.dataset.kb;
    const form = sklScreen.querySelector('.ce-dlg');
    const inputs = form ? [...form.querySelectorAll('input[type="text"]:not([readonly]), input[type="password"]')] : [];
    let target = inputs.find((i) => i.name === sipTarget) || inputs[0];
    if (k === 'CAP' || k === 'Shift') {
      sipCaps = !sipCaps;
      lastSkl = '';
      renderSKL();
      return;
    }
    if (!target) return;
    if (k === '⌫') target.value = target.value.slice(0, -1);
    else if (k === 'Tab') {
      target = inputs[(inputs.indexOf(target) + 1) % inputs.length];
      sipTarget = target.name;
    } else if (k === '↵') {
      const def = form.querySelector('.ce-btn.def[data-dlg-btn]');
      if (def) def.click();
      return;
    } else if (k === 'Esc') {
      const c = form.querySelector('[data-dlg-btn="Cancel"]');
      if (c) c.click();
      return;
    } else if (k.length === 1 || k === ' ') {
      target.value += sipCaps && /[a-z]/.test(k) ? k.toUpperCase() : k;
    }
    target.focus({ preventScroll: true });
  }, true);
  sklScreen.addEventListener('dblclick', (e) => {
    const n = e.target.closest('[data-node]');
    if (n) skl.act('open', n.dataset.node);
  });
  sklScreen.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const form = e.target.closest('.ce-dlg');
    if (!form) return;
    e.preventDefault();
    const def = form.querySelector('.ce-btn.def[data-dlg-btn]');
    if (def) def.click();
  });
  $$('[data-hw]').forEach((b) => b.addEventListener('click', () => {
    SIM.audio.unlock();
    skl.act('hw', b.dataset.hw);
    if (b.dataset.hw === '4') toast('Botón 4: activa la cruceta (modo ratón).');
  }));

  // ------------------------------------------------------------------ conexiones
  $$('input[name="j1"]').forEach((r) => r.addEventListener('change', () => {
    const prev = conn.j1;
    conn.j1 = r.value;
    if (prev === 'HANDSET') pttStop();
    if (conn.j1 === 'SKL') checkFillHazard();
    renderAll();
    save();
  }));
  $$('input[name="j8"]').forEach((r) => r.addEventListener('change', () => { conn.j8 = r.value; renderAll(); save(); }));
  // Conectores del panel frontal: al pulsarlos se cambia lo que hay conectado
  $$('[data-port]').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.port;
    if (p === 'j1') {
      const prev = conn.j1;
      conn.j1 = { NONE: 'HANDSET', HANDSET: 'SKL', SKL: 'NONE' }[conn.j1];
      if (prev === 'HANDSET') pttStop();
      if (conn.j1 === 'SKL') checkFillHazard();
      toast(`J1: ${{ NONE: 'desconectado', HANDSET: 'microteléfono H-250', SKL: 'SKL (cable de llenado)' }[conn.j1]}.`);
    } else if (p === 'j5') {
      conn.j5 = !conn.j5;
      toast(`J5: ${conn.j5 ? 'antena de pala VHF conectada' : 'sin antena'}.`);
    } else {
      conn.j8 = { NONE: 'FLEX', FLEX: 'SATCOM', SATCOM: 'NONE' }[conn.j8];
      toast(`J8: ${{ NONE: 'sin antena', FLEX: 'antena flexible VHF/UHF', SATCOM: 'antena SATCOM' }[conn.j8]}.`);
    }
    renderAll();
    save();
  }));
  $('#conn-j5').addEventListener('change', (e) => { conn.j5 = e.target.checked; renderAll(); save(); });
  const clampIn = (el, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(el.value) || 0)));
  $('#conn-az').addEventListener('change', (e) => { conn.az = clampIn(e.target, 0, 359); renderAll(); save(); });
  $('#conn-el').addEventListener('change', (e) => { conn.el = clampIn(e.target, 0, 90); renderAll(); save(); });
  $('#bat-replace').addEventListener('click', () => { radio.replaceBattery(); toast('Batería de la radio reemplazada.', 'ok'); });
  $('#skl-bat-replace').addEventListener('click', () => { skl.replaceBattery(); toast('Batería del SKL recargada.', 'ok'); });

  // ------------------------------------------------------------------ cabecera
  $('#my-call').addEventListener('input', (e) => { prefs.call = e.target.value; save(); });
  $('#pref-hints').addEventListener('change', (e) => { prefs.hints = e.target.checked; lastSkl = ''; renderAll(); save(); });
  $('#pref-voice').addEventListener('change', (e) => { prefs.voice = e.target.checked; if (!prefs.voice) SIM.audio.stopSpeech(); save(); });
  $('#btn-reset').addEventListener('click', () => {
    if (!window.confirm('Se borrarán presets, claves, auditoría y progreso de los ejercicios. ¿Reiniciar?')) return;
    try { localStorage.removeItem(STORE); } catch (e) { /* nada */ }
    net.reset();
    radio.hardReset();
    skl.hardReset();
    Object.assign(conn, DEFAULT_CONN);
    completed = {};
    logEl.innerHTML = '';
    addLog({ dir: 'INFO', text: 'Simulador reiniciado.' });
    renderAll();
  });
  $('#log-clear').addEventListener('click', () => { logEl.innerHTML = ''; });
  $('#btn-extdb').addEventListener('click', () => {
    skl.loadExtendedDb();
    toast('BD ampliada cargada en el SKL: LOS VINSON, TSK DAMA, MWOD y el loadset del RT1 PRC117F (pestaña Plats).', 'ok');
    addLog({ dir: 'INFO', text: 'Instructor: base de datos ampliada cargada en el SKL.' });
  });
  $('#sc-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sc]');
    if (!b) return;
    prefs.scenario = prefs.scenario === b.dataset.sc ? null : b.dataset.sc;
    renderAll();
    save();
  });

  // ------------------------------------------------------------------ arranque
  load();
  $('#my-call').value = prefs.call;
  $('#pref-hints').checked = prefs.hints;
  $('#pref-voice').checked = prefs.voice;
  renderStations();
  renderAll();
  addLog({ dir: 'INFO', text: 'Simulador listo. Empiece por el ejercicio 1 o practique libremente.' });

  setInterval(() => {
    radio.tick(1);
    skl.tick(1);
    net.tick();
  }, 1000);

  window.SIM_APP = { radio, skl, net, conn, prefs };
})();
