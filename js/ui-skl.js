/* Pantalla táctil del SKL AN/PYQ-10: genera el HTML de cada pantalla. */
(function (g) {
  'use strict';
  const SIM = g.SIM;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const btn = (label, act, arg, cls = '') =>
    `<button type="button" class="sk-btn ${cls}" data-act="${act}"${arg != null ? ` data-arg="${esc(arg)}"` : ''}>${label}</button>`;
  const win = (title, body, extra = '') => `<div class="sk-win"><div class="sk-wtitle"><span>${esc(title)}</span>${extra}</div>${body}</div>`;
  const msg = (skl) => (skl.message ? `<p class="sk-msg">${esc(skl.message)}</p>` : '');
  const STATUS = {
    YELLOW: ['🔑', 'ok', 'Clave almacenada'],
    RED: ['🔑', 'bad', 'Clave caducada (RED KEY)'],
    TAG: ['🏷️', 'tag', 'Etiqueta sin variable (KEY TAG)'],
    PENDING: ['🔑', 'warn', 'Aún no vigente'],
  };
  function keyIcon(skl, k) {
    const [i, cls, t] = STATUS[skl.keyStatus(k)];
    return `<span class="sk-kicon ${cls}" title="${t}">${i}</span>`;
  }
  function dialog(title, body, buttons) {
    return `<div class="sk-modal"><div class="sk-dlg"><div class="sk-wtitle"><span>${esc(title)}</span></div><div class="sk-dbody">${body}</div><div class="sk-row end">${buttons}</div></div></div>`;
  }

  function uasDialog(skl) {
    switch (skl.dialog) {
      case 'LOAD': {
        const proto = ['DS-101', 'DS-102'].map((p) => `<label class="sk-radio"><input type="radio" name="sk-proto" data-act="setProtocol" data-arg="${p}"${skl.protocol === p ? ' checked' : ''}> ${p}</label>`).join('');
        const act = skl.protocol === 'DS-102'
          ? `<p class="sk-lbl">Activation Mode</p><label class="sk-radio"><input type="radio" name="sk-act" data-act="setActivation" data-arg="KYK-13"${skl.activation === 'KYK-13' ? ' checked' : ''}> KYK-13</label>`
          : '<p class="sk-small">DS-101: el tipo de clave viaja con la clave y la radio lo comprueba.</p>';
        return dialog('Load', `<p class="sk-lbl">Protocol</p><div class="sk-row">${proto}</div>${act}<p class="sk-small">${skl.selected.length} clave(s) seleccionada(s).</p>`, btn('Cancel', 'closeDlg', null, 'ghost') + btn('OK', 'loadOk', null, 'primary'));
      }
      case 'KEYINFO': {
        const k = skl.keyById(skl.infoId);
        if (!k) return '';
        return dialog('Key Information', `<table class="sk-table">
          <tr><th>Short Title</th><td>${esc(k.tag)}</td></tr>
          <tr><th>Edition / Seg.</th><td>${esc(k.edition)} / ${k.segment}</td></tr>
          <tr><th>Tipo</th><td>${esc(k.bank)} ${esc(k.type)}</td></tr>
          <tr><th>Uso</th><td>${esc(k.desc)}</td></tr>
          <tr><th>Estado</th><td>${STATUS[skl.keyStatus(k)][2]}</td></tr>
          <tr><th>Vigencia</th><td>${SIM.fmtDate(k.eff)} → ${SIM.fmtDate(k.exp)}</td></tr>
          <tr><th>Transmitida</th><td>${k.issued} vez/veces</td></tr></table>`, btn('OK', 'closeDlg', null, 'primary'));
      }
      case 'EXPIRED': {
        const list = skl.keys.filter((k) => skl.keyStatus(k) === 'RED');
        return dialog('Expired Keys', list.length ? `<ul class="sk-ul">${list.map((k) => `<li>${esc(k.tag)} (${SIM.fmtDate(k.exp)})</li>`).join('')}</ul>` : '<p>No hay claves caducadas.</p>',
          btn('Cancel', 'closeDlg', null, 'ghost') + (list.length ? btn('Destroy', 'destroyExpired', null, 'danger') : ''));
      }
      case 'TOOLS':
        return dialog('Tools', `<div class="sk-col">${btn('SSO ▸ Audit Functions', 'audit')}<p class="sk-small">Las funciones de auditoría requieren una cuenta SSO.</p></div>`, btn('Close', 'closeDlg', null, 'ghost'));
      case 'DENIED':
        return dialog('Access denied', '<p>Debe iniciar sesión como <b>SSO</b> para usar las funciones de auditoría.</p>', btn('OK', 'closeDlg', null, 'primary'));
      default:
        return '';
    }
  }

  function tabKeys(skl) {
    if (!skl.keys.length) return '<p class="sk-small">Base de datos vacía.</p>';
    return `<table class="sk-grid"><thead><tr><th></th><th></th><th>Short Title</th><th>Tipo</th></tr></thead><tbody>${skl.keys.map((k) => `
      <tr class="${skl.selected.includes(k.id) ? 'sel' : ''}">
        <td><input type="checkbox" aria-label="Seleccionar ${esc(k.tag)}" data-act="toggleKey" data-arg="${esc(k.id)}"${skl.selected.includes(k.id) ? ' checked' : ''}></td>
        <td>${keyIcon(skl, k)}</td>
        <td><button type="button" class="sk-link" data-act="keyInfo" data-arg="${esc(k.id)}">${esc(k.tag)}</button></td>
        <td>${esc(k.bank)} ${esc(k.type)}</td></tr>`).join('')}</tbody></table>`;
  }
  function tabPlats(skl) {
    const p = SIM.SKL.PLATFORMS[0];
    const ls = skl.loadsets.map((l) => `<button type="button" class="sk-tree ls${skl.selLoadset === l.name ? ' sel' : ''}" data-act="selectLoadset" data-arg="${esc(l.name)}">📦 ${esc(l.name)} <small>(${l.teks.length} TEK, KEK, ${l.hopsets.length} hopsets)</small></button>`).join('');
    return `<div class="sk-tree">🚙 ${esc(p.name)} <small>(${esc(p.bussed)})</small></div>
      <div class="sk-tree l2">📻 ${esc(p.equipment[0])}</div>
      <div class="sk-tree l3">${ls || '<span class="sk-small">Sin loadsets</span>'}</div>
      <p class="sk-small">Seleccione el loadset y pulse LOAD (arriba a la derecha).</p>`;
  }
  function tabEqs() {
    return SIM.SKL.EQUIPMENT.map((e) => `<table class="sk-table"><tr><th>Equipo</th><td>${esc(e.name)}</td></tr><tr><th>Tipo</th><td>${esc(e.type)}</td></tr><tr><th>Fill port</th><td>${esc(e.fills)}</td></tr><tr><th>Protocolos</th><td>${esc(e.protocols)}</td></tr></table>`).join('');
  }
  function tabSoi() {
    const N = SIM.Net;
    const st = N.STATIONS.map((s) => `<li><b>${esc(s.call)}</b>: ${esc(s.desc)}</li>`).join('');
    return `<p class="sk-lbl">SOI de entrenamiento</p><ul class="sk-ul small">${st}</ul>
      <p class="sk-small">Satélite ${esc(N.SATELLITE.name)}: azimut ${N.SATELLITE.az}°, elevación ${N.SATELLITE.el}°.</p>`;
  }

  function uas(skl) {
    const tabs = [['PLATS', 'Plats'], ['EQS', 'Eqs'], ['KEYS', 'Keys'], ['SOI', 'SOI']]
      .map(([id, l]) => `<button type="button" class="sk-tab${skl.tab === id ? ' on' : ''}" data-act="tab" data-arg="${id}">${l}</button>`).join('');
    const content = { KEYS: tabKeys, PLATS: tabPlats, EQS: tabEqs, SOI: tabSoi }[skl.tab](skl);
    const bar = `<div class="sk-menubar">${btn('View ▸ Expired', 'expired', null, 'mini')}${btn('Tools', 'tools', null, 'mini')}${btn('Exit', 'exitUAS', null, 'mini')}<span class="grow"></span>${btn('⬆ LOAD', 'load', null, 'mini primary')}</div>`;
    return win(`UAS · ${skl.user.name}`, `${bar}<div class="sk-tabs">${tabs}</div><div class="sk-body">${msg(skl)}${content}</div>${uasDialog(skl)}`);
  }

  function sendScreen(skl) {
    const s = skl.send;
    const k = skl.currentSendKey();
    const n = `${Math.min(s.idx + 1, s.queue.length)} de ${s.queue.length}`;
    const mode = `${s.protocol}${s.protocol === 'DS-102' ? ' · ' + s.activation : ''}`;
    let body;
    let buttons;
    if (s.stage === 'READY') {
      body = `<p><b>Ready to send key</b></p><p>${esc(k ? k.tag : '')} (${n})</p><p class="sk-small">${mode}</p>`;
      buttons = btn('Cancel', 'cancelSend', null, 'ghost') + btn('OK', 'readyOk', null, 'primary');
    } else if (s.stage === 'WAIT') {
      body = `<div class="sk-spinner"></div><p><b>Press INITIATE button…</b></p><p class="sk-small">Pulse ENT en la radio («PRESS ENTER TO INITIATE»). Clave: ${esc(k ? k.tag : '')} · ${mode}</p>`;
      buttons = btn('Cancel', 'cancelSend', null, 'ghost');
    } else if (s.stage === 'SENT') {
      const more = s.idx + 1 < s.queue.length;
      body = `<p class="ok">✓ <b>Transfer successful</b></p><p>${esc(k ? k.tag : '')}</p>${more ? '<p class="sk-small">Prepare la radio para la siguiente clave (MORE FILL DATA? YES) y continúe.</p>' : ''}`;
      buttons = more ? btn('Next key', 'nextKey', null, 'primary') : btn('Done', 'cancelSend', null, 'primary');
    } else {
      body = '<p>Envío finalizado.</p>';
      buttons = btn('Close', 'cancelSend', null, 'primary');
    }
    return win('Load · Status', `<div class="sk-center">${body}<div class="sk-row">${buttons}</div></div>`);
  }

  function icomScreen(skl) {
    const ic = skl.icom;
    let body;
    if (ic.stage === 'MODE') {
      body = `<p class="sk-lbl">SINCGARS Mode</p><p>Transfer type: <b>ICOM</b></p>
        <label class="sk-check"><input type="checkbox" data-act="icomTime"${ic.includeTime ? ' checked' : ''}> Include time (send time)</label>
        <div class="sk-row end">${btn('Cancel', 'icomClose', null, 'ghost')}${btn('OK', 'icomNext', null, 'primary')}</div>`;
    } else if (ic.stage === 'WIZARD') {
      body = `<p class="sk-lbl">Load ECU Wizard</p><p>Loadset: <b>${esc(ic.ls.name)}</b></p><p>Equipment: AN/PRC-117F (RT-1796)</p>
        <div class="sk-row end">${btn('Cancel', 'icomClose', null, 'ghost')}${btn('Next »', 'icomNext', null, 'primary')}</div>`;
    } else if (ic.stage === 'CONNECT') {
      body = `<p class="sk-lbl">Connect to</p><ol class="sk-ul"><li>Interruptor de la radio en LD.</li><li>Conecte el cable al J1 AUD/DATA/FILL.</li><li>FILL DEVICE: CYZ10-RDS y ENT en la radio.</li></ol>
        <div class="sk-row end">${btn('Cancel', 'icomClose', null, 'ghost')}${btn('Next »', 'icomNext', null, 'primary')}</div>`;
    } else if (ic.stage === 'PROFILES') {
      body = `<p class="sk-lbl">Profiles</p><p>Compruebe que la radio muestra <b>FILL IN PROGRESS</b> y pulse Send.</p>
        <div class="sk-row end">${btn('Cancel', 'icomClose', null, 'ghost')}${btn('Send', 'icomSend', null, 'primary')}</div>`;
    } else {
      body = `<p class="sk-lbl">Status</p><ul class="sk-status-list">${ic.status.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${ic.stage === 'SENDING' ? '<div class="sk-spinner"></div>' : `<div class="sk-row end">${btn('Close', 'icomClose', null, 'primary')}</div>`}`;
    }
    return win('Load · SINCGARS', `<div class="sk-body">${body}</div>`);
  }

  const screens = {
    OFF: () => '',
    BOOT: () => '<div class="sk-center"><div class="sk-logo">AN/PYQ-10</div><p>Power On · Initialization</p><div class="sk-spinner"></div></div>',
    CIK: (skl) => `<div class="sk-center"><div class="sk-icon">🔑</div><p><b>Inserte el CIK</b></p><p class="sk-small">Apague el SKL, inserte el CIK («Conexiones») y vuelva a encenderlo.</p>${msg(skl)}</div>`,
    LOCKED: () => `<div class="sk-center"><div class="sk-icon">⛔</div><p><b>Cuenta bloqueada</b></p><p class="sk-small">Se superó el número de intentos de inicio de sesión.</p>${btn('Desbloqueo (instructor)', 'adminUnlock')}</div>`,
    LOGIN: (skl, o) => win('Log On', `<form class="sk-body sk-login" data-form="login">
        <label class="sk-lbl">User name<input name="user" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        <label class="sk-lbl">Password<input name="pass" type="password" autocomplete="off"></label>
        ${msg(skl)}
        <div class="sk-row end"><button type="submit" class="sk-btn primary">Log On</button></div>
        ${o.hints ? '<p class="sk-small">Cuentas de entrenamiento: <b>operador</b> / Operador1 · <b>sso</b> / Sso12345</p>' : ''}
      </form>`),
    LOGOUT: () => '<div class="sk-center"><div class="sk-spinner"></div><p>Cerrando sesión…</p><p class="sk-small">Espere a que se apague la luz KOV.</p></div>',
    DESKTOP: (skl) => win(`Core Library · ${skl.user.name} (${skl.user.role})`, `<div class="sk-body">
        <div class="sk-desk">
          <button type="button" class="sk-ico" data-act="launchUAS"><span>🗝️</span>UAS</button>
          <button type="button" class="sk-ico" data-act="tools"><span>🧰</span>Tools</button>
          <button type="button" class="sk-ico" data-act="logout"><span>🚪</span>Log Off</button>
        </div>${msg(skl)}
        <p class="sk-small">Orden de apagado: salir de la UAS, cerrar sesión (Log Off) y pulsar el botón de encendido.</p>
      </div>${uasDialog(skl)}`),
    UAS_LOADING: () => '<div class="sk-center"><div class="sk-spinner"></div><p>Please wait…</p><p class="sk-small">Checking and decrypting database</p></div>',
    UAS_STARTUP: () => dialog('Startup Information', '<p>Base de datos cargada.</p><p class="sk-small">Material de ENTRENAMIENTO (ETD). No contiene claves reales.</p>', btn('OK', 'startupOk', null, 'primary')),
    UAS: uas,
    SEND: sendScreen,
    ICOM: icomScreen,
    AUDIT: (skl) => win('Audit Trail (SSO)', `<div class="sk-body"><ol class="sk-audit">${skl.audit.map((a) => `<li class="${a.ok ? '' : 'bad'}"><time>${SIM.hhmmss(a.t)}</time> <b>${esc(a.action)}</b> <span>${esc(a.user)}</span> ${esc(a.detail)}</li>`).join('') || '<li>Sin registros.</li>'}</ol></div>`, btn('◄', 'back', null, 'mini')),
  };

  SIM.renderSKL = (skl, opts) => {
    const fn = screens[skl.screen] || screens.OFF;
    return fn(skl, opts || {});
  };
})(window);
