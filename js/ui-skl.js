/*
 * Pantalla del SKL AN/PYQ-10: reproduce la interfaz Windows CE del manual
 * técnico TM 11-5810-410-13&P y del curso (Core Library, UAS, menús,
 * árboles, diálogos, Input Panel y barra de tareas).
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = (s) => esc(s).replace(/\n/g, '<br>');

  // ------------------------------------------------------------------ iconos (CSS, sin imágenes externas)
  const ICON = {
    st: '<i class="ic ic-st">ST</i>',
    ed: '<i class="ic ic-ed">Ed</i>',
    YELLOW: '<i class="ic ic-key y" title="Key variable stored"></i>',
    PENDING: '<i class="ic ic-key y" title="Not yet effective"></i>',
    RED: '<i class="ic ic-key r" title="Key variable date has expired"></i>',
    TAG: '<i class="ic ic-seg" title="Key variable is needed">Seg</i>',
    EXPTAG: '<i class="ic ic-exp" title="Segment date has expired">Exp</i>',
    eq: '<i class="ic ic-eq"></i>',
    loc: '<i class="ic ic-loc">LOC</i>',
    plat: '<i class="ic ic-plat">♆</i>',
    soi: '<i class="ic ic-soi"></i>',
    soiitem: '<i class="ic ic-dot"></i>',
    hop: '<i class="ic ic-hop">FH</i>',
  };
  const MSGICON = { i: '<i class="ce-mi i">i</i>', '?': '<i class="ce-mi q">?</i>', '!': '<i class="ce-mi w">!</i>' };

  // ------------------------------------------------------------------ menús
  const SEP = { sep: true };
  const it = (label, cmd, extra) => Object.assign({ label, cmd }, extra || {});
  const dis = (label, extra) => Object.assign({ label, disabled: true }, extra || {});

  function coreMenus(skl) {
    const u = !!skl.user;
    return {
      Session: [
        it('Login', 'login', { disabled: u }),
        it('Logout', 'logout', { disabled: !u }),
        it('Protocol', 'protocol'),
        it('Reset Card', 'resetCard'),
      ],
      Tools: [
        { label: 'User', sub: [
          it('Change Password', 'changePw', { disabled: !u }),
          it('Get Card Time/Date', 'getTime', { disabled: !u }),
          it('Get Card Status', 'cardStatus', { disabled: !u }),
          it('Card Self-Test', 'selfTest', { disabled: !u }),
        ] },
        { label: 'SSO', sub: [
          it('Set Card Time/Date', 'setTime'),
          { label: 'User Management', sub: [dis('Add User...'), dis('Delete User...'), dis('Unlock User...')] },
          { label: 'Audit Functions', sub: [it('View Audit Trail...', 'viewAudit'), dis('Upload Audit Trail...'), it('Delete Audit Trail...', 'deleteAudit')] },
          { label: 'Firmware Controls', sub: [dis('Update Firmware...')] },
          { label: 'File Controls', sub: [dis('Import...'), dis('Export...')] },
        ] },
      ],
      Launch: [it('Launch UAS', 'launchUAS')],
      Help: [it('About Core Lib...', 'about')],
    };
  }

  function uasMenus(skl) {
    const kind = skl.selectedKind();
    let head;
    if (skl.tab === 'KEYS') {
      const label = kind === 'seg' ? 'Delete Segment' : kind === 'ed' ? 'Delete Edition' : 'Delete Key Tag';
      head = [it(label, 'deleteSel', { key: 'Del', disabled: !/^(st|ed|seg)$/.test(kind) }), dis('Add ...', { key: 'Ctrl+N' }), dis('Edit ...', { key: 'Enter' })];
    } else if (skl.tab === 'PLATS') {
      head = [dis(kind === 'pe' ? 'Unassign Equipment' : 'Delete Platform', { key: 'Del' }), dis('Add Platform...', { key: 'Ctrl+N' }), dis('Edit Platform...', { key: 'Enter' })];
    } else if (skl.tab === 'EQS') {
      head = [dis('Delete Equipment', { key: 'Del' }), dis('Add Equipment...', { key: 'Ctrl+N' }), dis('Edit Equipment...', { key: 'Enter' })];
    } else {
      head = [dis('Unassign Edition'), dis('Add ...', { key: 'Ctrl+N' }), dis('Edit ...', { key: 'Enter' })];
    }
    return {
      File: [
        ...head,
        dis('Empty Quick Reference'),
        it('Delete Database...', 'deleteDb'),
        SEP,
        { label: 'Transmit', sub: [
          it('Load...', 'load'),
          dis('Load Modern Keys...'),
          it('Load Selected Keys...', 'loadSelectedKeys', { disabled: skl.tab !== 'KEYS' }),
          dis('Load Selected Locations...'),
          dis('Load EPLRS...'),
          dis('Load PRC-137...'),
          dis('Load Benign Fill...'),
          { label: 'Load Mode 5 IFF', sub: [dis('Load...')] },
          dis('Database...'),
          dis('ECU Commands...'),
        ] },
        { label: 'Receive', sub: [dis('Database...'), dis('Key...'), dis('Key Needed...')] },
        { label: 'OTAD', sub: [dis('Transmit...'), dis('Receive...')] },
        SEP,
        dis('Create Key Tags...'),
        { label: 'Assign', sub: [dis('Key Tags...'), dis('EP...'), dis('Message Data...'), dis('Equipment...')] },
        SEP,
        it('Save Database...', 'saveDb'),
        it('Exit', 'exit'),
      ],
      View: [
        dis('Find...'),
        SEP,
        it('Current Selection', 'currentSel'),
        dis('File Header...'),
        { label: 'Keys', sub: [it('Expired Keys...', 'expired'), dis('Matching Keys...'), dis('Modern Keys...'), dis('TrKEKs...')] },
        { label: 'SOI', sub: [dis('Edition...')] },
        dis('Host Configuration Registers'),
        it('Summary Status...', 'summary'),
        dis('KLS...'),
        SEP,
        dis('Move Up'),
        dis('Move Down'),
        SEP,
        it('Refresh', 'refresh'),
        it('Expand Tree', 'expandTree'),
        { label: 'Tree', sub: [it('Collapse All', 'collapseTree')] },
      ],
      Settings: [it('Date Load...', 'settingsNotSim'), it('Options...', 'settingsNotSim'), it('Filter...', 'settingsNotSim'), dis('Show All'), it('Font...', 'settingsNotSim')],
    };
  }

  /** Lista desplegable; open = ruta abierta («File/Transmit»). */
  function dropdown(items, path, open) {
    return `<ul class="ce-dd">${items.map((m) => {
      if (m.sep) return '<li class="sep"></li>';
      const p = `${path}/${m.label}`;
      if (m.sub) {
        const isOpen = open === p || open.startsWith(p + '/');
        return `<li class="sub${isOpen ? ' hl' : ''}" data-act="menu" data-arg="${esc(p)}"><span>${esc(m.label)}</span><b>▸</b>${isOpen ? dropdown(m.sub, p, open) : ''}</li>`;
      }
      if (m.disabled) return `<li class="dis"><span>${esc(m.label)}</span>${m.key ? `<em>${m.key}</em>` : ''}</li>`;
      return `<li data-act="cmd" data-arg="${m.cmd}"><span>${esc(m.label)}</span>${m.key ? `<em>${m.key}</em>` : ''}</li>`;
    }).join('')}</ul>`;
  }

  function menuBar(menus, skl, extra = '') {
    const top = skl.menu ? skl.menu.split('/')[0] : null;
    return `<div class="ce-menubar"><div class="ce-menus">${Object.keys(menus).map((name) => `
      <div class="ce-mi-top${top === name ? ' on' : ''}" data-act="menu" data-arg="${name}">${name}${top === name ? dropdown(menus[name], name, skl.menu) : ''}</div>`).join('')}</div>
      ${extra}<button type="button" class="ce-x" data-act="${skl.win === 'UAS' ? 'cmd' : 'focus'}" data-arg="${skl.win === 'UAS' ? 'exit' : 'DESKTOP'}" aria-label="Cerrar">×</button></div>`;
  }

  // ------------------------------------------------------------------ árbol
  function tree(skl) {
    const rows = skl.visibleNodes();
    if (!rows.length) return '<div class="ce-tree empty"></div>';
    return `<div class="ce-tree" role="tree">${rows.map((n) => {
      const exp = n.children.length ? `<b class="ce-exp" data-act="toggle" data-arg="${esc(n.id)}">${skl.expanded.has(n.id) ? '−' : '+'}</b>` : '<b class="ce-exp none"></b>';
      const sel = skl.sel[skl.tab] === n.id ? ' sel' : '';
      return `<div class="ce-node${sel}" style="--d:${n.depth}" data-act="select" data-arg="${esc(n.id)}" data-node="${esc(n.id)}" role="treeitem">${exp}${ICON[n.icon] || ''}<span>${esc(n.label)}</span></div>`;
    }).join('')}</div>`;
  }

  // ------------------------------------------------------------------ diálogos
  const B = (label, opts = {}) => `<button type="button" class="ce-btn${opts.def ? ' def' : ''}" ${opts.disabled ? 'disabled' : `data-dlg-btn="${esc(label)}"`}>${esc(opts.text || label)}</button>`;
  function dlgBox(title, body, buttons, opts = {}) {
    return `<div class="ce-modal${opts.full ? ' full' : ''}${opts.top ? ' top' : ''}"><form class="ce-dlg" data-dlg="${esc(opts.type || '')}" onsubmit="return false">
      <div class="ce-title"><span>${esc(title)}</span>${opts.okInTitle ? '<button type="button" class="ce-tok" data-dlg-btn="OK">OK</button>' : ''}${opts.noX ? '' : `<button type="button" class="ce-x" data-dlg-btn="${opts.closeBtn || 'Cancel'}">×</button>`}</div>
      ${opts.sub ? `<div class="ce-sub">${esc(opts.sub)}</div>` : ''}
      <div class="ce-dbody">${body}</div>
      ${buttons ? `<div class="ce-dbtns">${buttons}</div>` : ''}
    </form></div>`;
  }
  const field = (label, name, value = '', type = 'text', ro = false) =>
    `<label class="ce-field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${ro ? 'readonly' : ''} autocomplete="off" autocapitalize="off" spellcheck="false"></label>`;
  const sel = (name, options, value, disabled) => `<select name="${name}" data-live="1"${disabled ? ' disabled' : ''}>${options.map((o) => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const radio = (name, value, label, checked, live) => `<label class="ce-radio"><input type="radio" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}${live ? ' data-live="1"' : ''}> ${esc(label)}</label>`;
  const box = (title, inner) => `<fieldset class="ce-group"><legend>${esc(title)}</legend>${inner}</fieldset>`;

  /** Ventana Status del manual (lista de mensajes, Continue desactivado y Cancel/Close). */
  function statusWin(lines, done, overlay = '') {
    return dlgBox('Status', `<div class="ce-list status">${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>${overlay}`,
      `${B('Continue', { disabled: true })}${B(done ? 'Close' : 'Cancel')}<span class="ce-skl-logo">SKL</span>`, { sub: 'Status', full: true, type: 'STATUS', noX: true });
  }

  function dialogHtml(skl, d, opts) {
    switch (d.type) {
      case 'MSG':
        return dlgBox(d.title, `<div class="ce-msg">${MSGICON[d.icon] || ''}<p>${nl(d.text)}</p></div>`, d.buttons.length === 1 ? '' : d.buttons.map((b, i) => B(b, { def: i === 0 })).join(''), { okInTitle: d.buttons.length === 1, closeBtn: d.buttons[d.buttons.length - 1], type: 'MSG' });
      case 'LOWBAT':
        return dlgBox('Main Batteries Very Low', `<div class="ce-msg">${MSGICON['!']}<p>Your main batteries are running very low on power. Please change the batteries at your next opportunity.<br><br>Consult the manufacturer's instructions for directions on replacing or charging the main batteries.<br><br>Warning: To avoid data loss, be sure to turn off your device before removing the batteries.</p></div>`, '', { closeBtn: 'OK', type: 'LOWBAT' });
      case 'DEFAULT_SSO':
        return dlgBox('Default SSO Login', `<p>This is an UNINITIALIZED DTD 2000 INFOSEC Card. Would you like to initialize this card and pair it to this host computer?</p>
          ${field('User', 'user', 'SSO')}${field('Password:', 'pass', 'DEFAULTPIN')}`, B('Cancel') + B('OK', { def: true }), { type: 'DEFAULT_SSO', top: true });
      case 'LOGON':
        return dlgBox('Logon', `${field('User ID:', 'user')}${field('Password:', 'pass', '', 'password')}
          ${opts.hints ? '<p class="ce-hint">Cuentas de entrenamiento: OPERADOR / Operador1 · SSO / Sso12345</p>' : ''}`, B('Clear') + B('Cancel') + B('OK', { def: true }), { type: 'LOGON', top: true });
      case 'CHANGE_PW':
        return dlgBox('Change Password', `${field('User ID:', 'uid', d.userId, 'text', true)}${field('Old Password:', 'old', '', 'password')}${field('New Password:', 'new', '', 'password')}${field('Confirm Password:', 'confirm', '', 'password')}`, B('Clear') + B('Cancel') + B('OK', { def: true }), { type: 'CHANGE_PW', top: true });
      case 'STARTUP':
        return dlgBox('Startup Information', `<div class="ce-list"><div class="ce-lh">Item</div>${skl.startupInfo().map((l) => `<div>${esc(l)}</div>`).join('')}</div>`, `<span class="grow"></span>${B('OK', { def: true })}`, { sub: 'Startup Information', full: true, type: 'STARTUP', noX: true });
      case 'LAUNCH':
        return dlgBox('Launch UAS', '<p>Installed applications. Choose one:</p><div class="ce-list sel1"><div class="on">SKL</div></div>', B('Cancel') + B('OK', { def: true }), { type: 'LAUNCH' });
      case 'PROTOCOL': {
        const p = skl.coreProtocol;
        return dlgBox('Protocol', box('Protocol Selection:', radio('protocol', 'DS-101', 'DS-101', p.protocol === 'DS-101') + radio('protocol', 'RS-232', 'RS-232', p.protocol === 'RS-232'))
          + `<div class="ce-cols">${box('Baud Rate:', ['1200', '2400', '4800', '9600'].map((b) => radio('baud', b, b, p.baud === b)).join(''))}${box('Timeout', ['Slow', 'Medium', 'Fast'].map((b) => radio('timeout', b, b, p.timeout === b)).join(''))}</div>`,
        B('Cancel') + B('OK', { def: true }), { type: 'PROTOCOL' });
      }
      case 'RESET_CARD':
        return dlgBox('Confirm Card Reset', '<p>Warning: Card Reset will result in user being logged off the card.</p><p>Do you wish to continue Card Reset?</p>', B('No', { def: true }) + B('Yes'), { closeBtn: 'No', type: 'RESET_CARD' });
      case 'GET_TIME':
        return dlgBox('Get Card Date/Time', `<p>Set Host PC time and date to the card time and date?</p>
          ${radio('mode', 'YES', 'YES, set host time/date to card time/date.', true)}${radio('mode', 'NO', 'NO, display card time/date (only).', false)}`, B('Cancel') + B('OK', { def: true }), { type: 'GET_TIME' });
      case 'SET_TIME': {
        const t = new Date(skl.env.now());
        return dlgBox('Set Card Date/Time', `<p>Card Time:</p><div class="ce-box">${esc(t.toLocaleTimeString('en-US'))}</div><p>Card Date:</p><div class="ce-box">${esc(t.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</div><p class="ce-hint">Set date first then time.</p>`, B('Cancel') + B('OK', { def: true }), { full: true, type: 'SET_TIME' });
      }
      case 'ABOUT':
        return dlgBox('About Core Lib', '<div class="ce-msg">' + MSGICON.i + '<p>Core Library (SIM)<br>AN/PYQ-10 Simple Key Loader<br>Entrenador: sin material criptográfico real.</p></div>', '', { okInTitle: true, closeBtn: 'OK', type: 'ABOUT' });
      case 'AUDIT':
        return dlgBox('AUDIT TRAIL', `<div class="ce-list audit">${skl.auditRows().map((a) => `<div class="${a.ok ? '' : 'bad'}"><code>${esc(a.when)}</code> ${esc(a.text)}</div>`).join('')}</div>`, `<span class="grow"></span>${B('OK', { def: true })}<span class="grow"></span>`, { full: true, closeBtn: 'OK', type: 'AUDIT' });
      case 'SUMMARY':
        return dlgBox('Summary Status', `<div class="ce-list"><div class="ce-lh two"><span>Item</span><span>Count</span></div>${skl.summary().map(([a, b]) => `<div class="two"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('')}</div>`, `<span class="grow"></span>${B('Close', { def: true })}`, { sub: 'Summary Status', full: true, closeBtn: 'Close', type: 'SUMMARY' });
      case 'SEGMENT': {
        const k = skl.keyById(d.key);
        if (!k) return '';
        const ids = skl.keys.map((x) => x.id);
        const i = ids.indexOf(k.id);
        const row = (l, v) => `<div class="ce-kv"><span>${l}</span><b>${esc(v)}</b></div>`;
        return dlgBox('Segment', [
          row('Short Title:', k.st), row('Edition:', k.edition), row('Segment Number:', k.segment), row('Key Use:', k.type),
          row('CT3 Key Type:', k.type), row('Key Source:', k.source), row('Effective Date:', SIM.SKL.fmtKeyDate(k.eff)),
          row('Expires After:', SIM.SKL.fmtKeyDate(k.exp)), row('Classification:', k.cls),
        ].join(''), B('Back', { text: '<< Back', disabled: i <= 0 }) + B('Next', { text: 'Next >>', disabled: i >= ids.length - 1, def: true }) + B('Close'), { sub: `Segment Info ${k.segment}`, full: true, closeBtn: 'Close', type: 'SEGMENT' });
      }
      case 'EXPIRED': {
        const list = skl.keys.filter((k) => ['RED', 'EXPTAG'].includes(skl.keyStatus(k)));
        return dlgBox('Expired Keys', `<div class="ce-list grid3"><div class="ce-lh g3"><span>Short Title</span><span>E.</span><span>Text ID</span></div>
          ${list.map((k) => `<label class="g3"><span><input type="checkbox" name="keys" value="${esc(k.id)}"> ${ICON[skl.keyStatus(k)]} ${esc(k.st)}</span><span>${esc(k.edition)}.</span><span>${esc(k.text)}</span></label>`).join('') || '<div>(none)</div>'}</div>`,
        B('Delete') + B('Delete All', { text: 'Delete All' }) + B('Close'), { sub: 'Expired Keys', full: true, closeBtn: 'Close', type: 'EXPIRED' });
      }
      case 'KEY_SELECT': {
        const rows = d.order.map((id) => skl.keyById(id)).filter(Boolean).filter((k) => !['TAG', 'EXPTAG'].includes(skl.keyStatus(k)));
        return dlgBox('Key Load Select Keys', `<div class="ce-list grid4"><div class="ce-lh g4"><span>Short Title</span><span>Ed</span><span>Seg</span><span>Text ID</span></div>
          ${rows.map((k) => `<label class="g4${d.focus === k.id ? ' on' : ''}" data-act="dlgFocus" data-arg="${esc(k.id)}"><span><input type="checkbox" name="keys" value="${esc(k.id)}" data-live="1"${d.checked.includes(k.id) ? ' checked' : ''}> ${ICON[skl.keyStatus(k)]}${esc(k.st)}</span><span>${esc(k.edition)}</span><span>${k.segment}</span><span>${esc(k.text)}</span></label>`).join('')}</div>
          <div class="ce-dbtns inner">${B('Select All')}${B('Deselect All')}${B('Up')}${B('Down')}</div>`,
        B('OK', { def: true }) + B('Cancel'), { sub: 'Selected Keys', full: true, type: 'KEY_SELECT' });
      }
      case 'KEY_SETTINGS': {
        const v = d.v;
        const P = v.protocol;
        return dlgBox('Key Load Settings', `<div class="ce-kls">
          <label class="lbl">Protocol:${sel('protocol', ['DS-102', 'DS-101', 'RS-232'], P)}</label>
          <label class="lbl">Bus Address:<input name="bus" value="${esc(v.bus)}"${P === 'DS-101' ? '' : ' disabled'}></label>
          <label class="lbl">Activate Mode:${sel('activate', SIM.SKL.ACTIVATE[P], v.activate, P === 'DS-101')}</label>
          <label class="lbl">Baud Rate:${sel('baud', ['1200', '2400', '4800', '9600'], v.baud, P !== 'RS-232')}</label>
          <div class="chk"><label class="ce-check${P === 'DS-101' ? '' : ' dis'}"><input type="checkbox" name="wakeup" data-live="1"${v.wakeup ? ' checked' : ''}${P === 'DS-101' ? '' : ' disabled'}> Send WakeUp</label>
            <label class="ce-check${P === 'DS-102' ? ' dis' : ''}"><input type="checkbox" name="tag"${v.tag ? ' checked' : ''}${P === 'DS-102' ? ' disabled' : ''}> Send Tag</label></div>
          <label class="lbl inline">Seconds:<input name="seconds" value="${esc(v.seconds)}"${P === 'DS-101' && v.wakeup ? '' : ' disabled'}></label>
          <span></span><label class="lbl">Mode:${sel('mode', ['Fill', 'Issue'], v.mode, P === 'DS-102')}</label>
          <span></span><label class="lbl">Timeout:${sel('timeout', ['Slow', 'Medium', 'Fast'], v.timeout, P === 'DS-102')}</label>
          </div>${opts.hints ? '<p class="ce-hint">AN/PRC-117F con FILL DEVICE KYK-13: Protocol DS-102 y Activate Mode KYK-13.</p>' : ''}`,
        `<span class="grow"></span>${B('OK', { def: true })}${B('Cancel')}<span class="grow"></span>`, { sub: 'Key Load Settings', full: true, type: 'KEY_SETTINGS' });
      }
      case 'READY': {
        const k = skl.currentSendKey();
        if (!k) return '';
        const r = (l, v, cls = '') => `<label class="ce-rf ${cls}"><span>${l}</span><b>${esc(v)}</b></label>`;
        return dlgBox('Ready to Send Key', `<div class="ce-ready">${r('Short Title:', k.st, 'w hl')}
          <div class="two">${r('Edition:', k.edition)}${r('Segment:', k.segment)}</div>${r('Text ID:', k.text, 'w')}
          <div class="two">${r('KMID:', '')}${r('Universal:', '')}</div>${r('Classification:', k.cls, 'w')}${r('Line 1:', '', 'w')}${r('Line 2:', '', 'w')}
          <label class="ce-check center"><input type="checkbox" name="every" value="1"${skl.displayEvery ? ' checked' : ''}> Display for Every Key</label></div>`,
        `<span class="grow"></span>${B('OK', { def: true })}${B('Cancel')}<span class="grow"></span>`, { sub: 'Connect to Receive Equipment', full: true, type: 'READY' });
      }
      case 'STATUS': {
        const lines = d.kind === 'ICOM' ? (skl.icom ? skl.icom.lines : ['Operation Successful.']) : skl.send ? skl.send.lines : ['Operation Successful.'];
        return statusWin(lines, d.done);
      }
      case 'RELOAD':
        return dlgBox('SKL', `<div class="ce-msg">${MSGICON['?']}<p>Re-load equipment?</p></div>${d.reason && opts.hints ? `<p class="ce-hint">${esc(d.reason)}</p>` : ''}`, B('Yes', { def: true }) + B('No'), { closeBtn: 'No', type: 'RELOAD' });
      case 'SINC_MODE': {
        const icom = d.v.transfer === 'ICOM';
        return dlgBox('SINCGARS Mode', box('Transfer Type', radio('transfer', 'ICOM', 'ICOM Transfer', icom, true) + radio('transfer', 'NON-ICOM', 'Non-ICOM Transfer', !icom, true))
          + `<label class="ce-check${icom ? '' : ' dis'}"><input type="checkbox" name="includeTime" value="1"${d.v.includeTime ? ' checked' : ''}${icom ? '' : ' disabled'}> Include Time</label>`,
        `<span class="grow"></span>${B('OK', { def: true })}<span class="grow"></span>`, { sub: 'SINCGARS Mode', full: true, type: 'SINC_MODE', noX: true });
      }
      case 'ECU_WIZ': {
        const ls = skl.icom ? skl.icom.ls : null;
        if (d.step === 0) {
          return dlgBox('Load ECU Wizard', `<div class="ce-kv2"><span>Equipment Type:</span><b>${esc(ls ? ls.type : '')}</b></div><div class="ce-kv2"><span>Equipment Name:</span><b>${esc(ls ? ls.name : '')}</b></div>
            ${box('Tip', '<div class="ce-tipbox"><i class="ce-bulb"></i><p>Please make sure you are connected to the selected equipment and press Next to continue.</p></div>')}`,
          B('Back', { text: '<< Back', disabled: true }) + B('Next', { text: 'Next >>', def: true }) + B('Send', { disabled: true }) + B('Cancel'), { sub: 'Connect To', full: true, type: 'ECU_WIZ' });
        }
        const steps = ['Connect cable to the AUD/DATA/FILL (J1) port', 'Set FUNCT switch to LD', 'Select FILL DEVICE: CYZ10-RDS', 'Press ENT (FILL IN PROGRESS)'];
        return dlgBox('Load ECU Wizard', `<p>The following instructions will lead you through the load process step by step:</p><div class="ce-list">${steps.map((s) => `<label><input type="checkbox"> ${esc(s)}</label>`).join('')}</div>`,
          B('Back', { text: '<< Back' }) + B('Next', { text: 'Next >>', disabled: true }) + B('Send', { def: true }) + B('Cancel'), { sub: 'Profiles', full: true, type: 'ECU_WIZ' });
      }
      case 'CONFIRM_SAVE':
        return dlgBox('SKL', `<div class="ce-msg">${MSGICON['!']}<p>The database has changed. Do you want to save the changes?</p></div>`, B('Yes', { def: true }) + B('No'), { closeBtn: 'No', type: 'CONFIRM_SAVE' });
      default:
        return '';
    }
  }

  // ------------------------------------------------------------------ teclado en pantalla (Input Panel)
  function inputPanel(caps) {
    const rows = [
      ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '⌫'],
      ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
      ['CAP', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
      ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '↵'],
      ['Ctl', 'áü', '`', '\\', ' ', '↓', '↑', '←', '→'],
    ];
    return `<div class="ce-sip"><div class="ce-sip-t">Input Panel</div>${rows.map((r) => `<div class="ce-sip-r">${r.map((k) => {
      const shown = caps && k.length === 1 && /[a-z]/.test(k) ? k.toUpperCase() : k;
      const cls = k === ' ' ? ' sp' : k.length > 1 ? ' w' : '';
      return `<button type="button" class="ce-k${cls}${k === 'CAP' && caps ? ' on' : ''}" data-kb="${esc(k)}">${esc(shown === ' ' ? '' : shown)}</button>`;
    }).join('')}</div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------ ventanas
  const VEHICLE = `<svg class="ce-veh" viewBox="0 0 220 110" aria-hidden="true"><g fill="#7c8475"><rect x="20" y="48" width="170" height="34" rx="6"/><path d="M58 48 L78 22 H150 L168 48 Z"/><rect x="150" y="14" width="40" height="10" rx="2" fill="#5d6458"/><rect x="88" y="27" width="26" height="16" fill="#cfd5c8"/><rect x="120" y="27" width="26" height="16" fill="#cfd5c8"/></g><g fill="#2f332c"><circle cx="58" cy="86" r="16"/><circle cx="160" cy="86" r="16"/></g><g fill="#9aa093"><circle cx="58" cy="86" r="6"/><circle cx="160" cy="86" r="6"/></g></svg>`;

  function desktop() {
    return `<div class="ce-desktop">
      <button type="button" class="ce-dicon" data-act="cmd" data-arg="refresh"><i class="ic-big cal"></i>calibrate</button>
      <button type="button" class="ce-dicon" data-act="focus" data-arg="CORELIB"><i class="ic-big core"></i>CoreLib</button>
      <button type="button" class="ce-dicon" data-act="cmd" data-arg="refresh"><i class="ic-big set"></i>SKL Settings</button>
      <div class="ce-logo-big">SIMPLE<br>KEY<br>LOADER</div>
    </div>`;
  }

  function coreLib(skl) {
    return `<div class="ce-win">${menuBar(coreMenus(skl), skl)}<div class="ce-body center">${VEHICLE}</div></div>`;
  }

  function uas(skl) {
    const icons = `<div class="ce-tools"><button type="button" class="ce-ti recv" data-act="cmd" data-arg="recv" title="Receive"><i></i>RECV</button><button type="button" class="ce-ti load" data-act="cmd" data-arg="load" title="Load"><i></i>LOAD</button></div>`;
    const tabs = [['PLATS', '♆', 'Plats'], ['EQS', '🖧', 'Eqs'], ['KEYS', '⚿', 'Keys'], ['SOI', '▣', 'SOI']]
      .map(([id, ic, l]) => `<button type="button" class="ce-tab${skl.tab === id ? ' on' : ''}" data-act="tab" data-arg="${id}"><i>${ic}</i>${l}</button>`).join('');
    return `<div class="ce-win">${menuBar(uasMenus(skl), skl, icons)}<div class="ce-tabs">${tabs}</div><div class="ce-body">${tree(skl)}</div></div>`;
  }

  function taskbar(skl) {
    const b = Math.ceil(skl.battery);
    const col = b > 40 ? 'g' : b > 10 ? 'a' : 'r';
    const app = skl.shutdown ? 'Shutdown!' : skl.win === 'UAS' ? 'SKL' : skl.win === 'CORELIB' ? 'CoreLib' : 'Desktop';
    const appIcon = skl.win === 'UAS' ? '<i class="ic-app sk"></i>' : '<i class="ic-app core"></i>';
    return `<div class="ce-task">
      <button type="button" class="ce-start" data-act="start" aria-label="Inicio"><i></i></button>
      <button type="button" class="ce-app" data-act="switcher">${appIcon}${esc(app)}</button>
      <span class="ce-tray"><i class="ce-bat ${col}" title="Batería ${b} %"><b style="height:${Math.max(8, b)}%"></b></i><small>${Math.min(100, Math.round(b / 10) * 10)}</small><span>${esc(skl.dateText)}</span></span>
      <button type="button" class="${skl.sip ? 'ce-kbd' : 'ce-pen'}" data-act="sip" title="Input Panel" aria-label="Input Panel"></button>
      <button type="button" class="ce-sw" data-act="switcher" aria-label="Cambiar de programa"><i></i></button>
      ${skl.startMenu ? `<div class="ce-startmenu"><div class="ce-sm-side">Windows CE</div><ul class="ce-dd"><li class="sub hl"><span>Programs</span><b>▸</b><ul class="ce-dd"><li data-act="cmd" data-arg="refresh"><span>calibrate</span></li><li data-act="focus" data-arg="CORELIB"><span>CoreLib</span></li><li data-act="cmd" data-arg="refresh"><span>SKL Settings</span></li></ul></li></ul></div>` : ''}
      ${skl.switcher ? `<div class="ce-switch"><ul class="ce-dd">${skl.uasOpen ? '<li data-act="focus" data-arg="UAS"><span>SKL</span></li>' : ''}<li data-act="focus" data-arg="CORELIB"><span>CoreLib</span></li><li data-act="focus" data-arg="DESKTOP"><span>Desktop</span></li></ul></div>` : ''}
    </div>`;
  }

  SIM.renderSKL = (skl, opts = {}) => {
    if (!skl.power) return '';
    if (skl.win === 'BOOT') return '<div class="ce-boot"><div class="ce-logo-big">SIMPLE<br>KEY<br>LOADER</div><p>Windows CE · Core Library</p></div>';
    const main = skl.win === 'UAS' ? uas(skl) : skl.win === 'CORELIB' ? coreLib(skl) : desktop();
    const progress = skl.progress ? `<div class="ce-modal full"><div class="ce-dlg"><div class="ce-title"><span>Progress</span></div><div class="ce-sub">Progress</div><div class="ce-dbody"><p class="ce-prog">${esc(skl.progress.text)}</p></div></div></div>` : '';
    // diálogos apilados: la ventana Status queda debajo del cuadro de mensaje
    const stack = skl.dialogs.slice(-2);
    const dlgs = stack.length === 2 && ['STATUS'].includes(stack[0].type) && ['MSG', 'RELOAD'].includes(stack[1].type)
      ? dialogHtml(skl, stack[0], opts) + dialogHtml(skl, stack[1], opts)
      : skl.dlg ? dialogHtml(skl, skl.dlg, opts) : '';
    const sd = skl.shutdown ? `<div class="ce-modal"><div class="ce-shut"><p>Shutdown in</p><b>${skl.shutdown.n}</b><p>seconds!</p><small>Press power button to abort.</small></div></div>` : '';
    const sip = skl.sip ? inputPanel(!!opts.caps) : '';
    return `<div class="ce-screen${skl.nvg ? ' nvg' : ''}${skl.sip ? ' with-sip' : ''}" style="--bright:${0.55 + skl.bright * 0.12}">
      <div class="ce-area">${main}${progress}${dlgs}${sd}</div>${sip}${taskbar(skl)}</div>`;
  };
})(window);
