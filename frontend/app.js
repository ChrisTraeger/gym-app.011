(function () {

  const API = '';
  let token = localStorage.getItem('gym_token') || '';
  let gymConfig = { nombre: 'GYM', planes: [] };
  let clientes = {};
  let filtroActual = 'todos';
  let clienteEditandoId = null;
  let clienteRenovandoId = null;
  let chartMesInst = null;

  // ── HELPERS ──────────────────────────────────────────────
  function getFechaHoy() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  }
  function getEstado(c) {
    if (!c.fecha_vence) return 'activo';
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const diff = Math.round((new Date(c.fecha_vence+'T00:00:00') - hoy) / 86400000);
    if (diff < 0) return 'vencido';
    if (diff <= 3) return 'por-vencer';
    return 'activo';
  }
  function diasRestantes(c) {
    if (!c.fecha_vence) return null;
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    return Math.round((new Date(c.fecha_vence+'T00:00:00') - hoy) / 86400000);
  }
  function fmtCOP(v) {
    if (!v) return '—';
    if (v >= 1000000) return '$'+(v/1000000).toFixed(1)+'M';
    if (v >= 1000) return '$'+Math.round(v/1000)+'K';
    return '$'+Math.round(v);
  }
  function fmtFecha(f) {
    if (!f) return '—';
    const [y,m,d] = f.split('-');
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${parseInt(d)} ${meses[parseInt(m)-1]} ${y}`;
  }
  function iniciales(nombre) {
    return (nombre||'?').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
  }
  function apiReq(path, options={}) {
    return fetch(API+path, {
      ...options,
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(options.headers||{}) }
    });
  }

  // ── LOGIN / REGISTRO ──────────────────────────────────────
  window.mostrarTab = function(tab) {
    document.getElementById('tab-login').style.display    = tab==='login' ? '' : 'none';
    document.getElementById('tab-registro').style.display = tab==='registro' ? '' : 'none';
    document.getElementById('tab-btn-login').style.opacity    = tab==='login' ? '1' : '0.4';
    document.getElementById('tab-btn-registro').style.opacity = tab==='registro' ? '1' : '0.4';
    document.getElementById('login-err').classList.remove('show');
  };

  function showErr(msg) {
    const el = document.getElementById('login-err');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('inp-pass').addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });

  async function doLogin() {
    const usuario  = document.getElementById('inp-user').value.trim();
    const password = document.getElementById('inp-pass').value;
    if (!usuario || !password) return showErr('Completa usuario y contraseña');

    const res  = await fetch(API+'/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ usuario, password })
    });
    const data = await res.json();
    if (!res.ok) return showErr(data.error || 'Error al iniciar sesión');

    token = data.token;
    localStorage.setItem('gym_token', token);
    localStorage.setItem('gym_nombre', data.gimnasio);
    gymConfig.nombre = data.gimnasio;
    mostrarApp();
  }

  window.registro = async function() {
    const gimnasio = document.getElementById('reg-gimnasio').value.trim();
    const usuario  = document.getElementById('reg-usuario').value.trim();
    const password = document.getElementById('reg-pass').value;
    if (!gimnasio || !usuario || !password) return showErr('Completa todos los campos');

    const res  = await fetch(API+'/api/auth/registro', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ gimnasio, usuario, password })
    });
    const data = await res.json();
    if (!res.ok) return showErr(data.error);

    showErr('');
    alert('✅ Cuenta creada. Ahora inicia sesión.');
    mostrarTab('login');
    document.getElementById('inp-user').value = usuario;
  };

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await apiReq('/api/auth/logout', { method:'POST' });
    token = '';
    localStorage.removeItem('gym_token');
    localStorage.removeItem('gym_nombre');
    document.getElementById('app').classList.remove('visible');
    document.getElementById('login-screen').style.display = '';
    document.getElementById('inp-pass').value = '';
  });

  // ── INICIAR APP ──────────────────────────────────────────
  async function mostrarApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    document.getElementById('topbar-nombre').textContent = localStorage.getItem('gym_nombre') || 'GYM';
    await cargarPlanes();
    await cargarClientes();
    renderStats();
  }

  if (token) mostrarApp();

  // ── TABS ─────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.pane').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('pane-'+t.dataset.tab)?.classList.add('active');
      if (t.dataset.tab === 'stats')   renderStats();
      if (t.dataset.tab === 'alertas') renderAlertas();
      if (t.dataset.tab === 'config')  renderConfig();
    });
  });

  // ── PLANES ───────────────────────────────────────────────
  async function cargarPlanes() {
    const res = await apiReq('/api/planes');
    const planes = await res.json();
    gymConfig.planes = planes.map(p => ({ id: p.id, nombre: p.nombre, dias: p.duracion_dias, precio: p.precio }));
    cargarPlanesEnSelect();
  }

  function cargarPlanesEnSelect() {
    const opts = gymConfig.planes.map(p =>
      `<option value="${p.id}" data-nombre="${p.nombre}">${p.nombre} — ${fmtCOP(p.precio)}</option>`
    ).join('');
    document.getElementById('f-plan').innerHTML      = opts;
    document.getElementById('renovar-plan').innerHTML = opts;
  }

  window.onPlanChange = function() {
    const sel  = document.getElementById('f-plan');
    const pid  = parseInt(sel.value);
    const plan = gymConfig.planes.find(p => p.id === pid);
    if (plan) document.getElementById('f-valor').value = plan.precio;
  };

  // ── CARGAR CLIENTES ──────────────────────────────────────
  async function cargarClientes() {
    const res = await apiReq('/api/clientes');
    const arr = await res.json();
    clientes = {};
    arr.forEach(c => { clientes[c.id] = c; });
    renderClientes();
    renderAlertas();
  }

  // ── RENDER CLIENTES ──────────────────────────────────────
  window.setFiltro = function(btn, filtro) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtroActual = filtro;
    renderClientes();
  };

  window.renderClientes = function() {
    const q = (document.getElementById('search-inp')?.value || '').toLowerCase();
    let arr = Object.values(clientes);
    if (q) arr = arr.filter(c =>
      (c.nombre||'').toLowerCase().includes(q) ||
      (c.cedula||'').toString().includes(q) ||
      (c.telefono||'').includes(q)
    );
    if (filtroActual !== 'todos') arr = arr.filter(c => getEstado(c) === filtroActual);
    arr.sort((a,b) => {
      const ord = { vencido:0, 'por-vencer':1, activo:2 };
      return ord[getEstado(a)] - ord[getEstado(b)];
    });

    const el = document.getElementById('lista-clientes');
    if (!arr.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div>${q?'Sin resultados':'No hay clientes aún'}</div>`;
      return;
    }
    el.innerHTML = arr.map(c => {
      const est = getEstado(c);
      const dias = diasRestantes(c);
      const badgeClass = est==='activo' ? 'badge-activo' : est==='por-vencer' ? 'badge-vence' : 'badge-vencido';
      const badgeTxt   = est==='activo' ? '✅ Al día' : est==='por-vencer' ? `⚠️ Vence en ${dias}d` : '❌ Vencido';
      return `<div class="cliente-card ${est}" onclick="verDetalle(${c.id})">
        <div class="cliente-avatar">${iniciales(c.nombre)}</div>
        <div class="cliente-info">
          <div class="cliente-nombre">${c.nombre||'—'}</div>
          <div class="cliente-plan">${c.plan||'—'}${c.cedula?' · CC '+c.cedula:''}</div>
        </div>
        <div class="cliente-right">
          <div class="estado-badge ${badgeClass}">${badgeTxt}</div>
          <div class="cliente-fecha">${fmtFecha(c.fecha_vence)}</div>
        </div>
      </div>`;
    }).join('');
  };

  // ── DETALLE ──────────────────────────────────────────────
  window.verDetalle = function(id) {
    const c = clientes[id];
    if (!c) return;
    const est = getEstado(c);
    const dias = diasRestantes(c);
    const badgeClass = est==='activo' ? 'badge-activo' : est==='por-vencer' ? 'badge-vence' : 'badge-vencido';
    const badgeTxt   = est==='activo' ? '✅ Al día' : est==='por-vencer' ? `⚠️ Vence en ${dias} días` : `❌ Venció hace ${Math.abs(dias)} días`;

    document.getElementById('detalle-content').innerHTML = `
      <div class="detalle-header">
        <div class="detalle-avatar">${iniciales(c.nombre)}</div>
        <div>
          <div class="detalle-nombre">${c.nombre}</div>
          <div class="detalle-plan"><span class="estado-badge ${badgeClass}">${badgeTxt}</span></div>
        </div>
      </div>
      <div class="detalle-row"><span class="detalle-key">Plan</span><span class="detalle-val">${c.plan||'—'}</span></div>
      <div class="detalle-row"><span class="detalle-key">Cédula</span><span class="detalle-val">${c.cedula||'—'}</span></div>
      <div class="detalle-row"><span class="detalle-key">Teléfono</span><span class="detalle-val">${c.telefono||'—'}</span></div>
      <div class="detalle-row"><span class="detalle-key">Inicio</span><span class="detalle-val">${fmtFecha(c.fecha_inicio)}</span></div>
      <div class="detalle-row"><span class="detalle-key">Vence</span><span class="detalle-val">${fmtFecha(c.fecha_vence)}</span></div>
      <div class="detalle-row"><span class="detalle-key">Valor pagado</span><span class="detalle-val">${fmtCOP(c.monto)}</span></div>
      ${c.notas?`<div class="detalle-row"><span class="detalle-key">Notas</span><span class="detalle-val">${c.notas}</span></div>`:''}
      <div class="detalle-actions">
        <button class="btn-accion btn-renovar" onclick="abrirModalRenovar(${id})">🔄 Renovar</button>
        ${c.telefono?`<button class="btn-accion btn-whatsapp" onclick="waCliente(${id})">💬 WhatsApp</button>`:''}
        <button class="btn-accion btn-editar" onclick="editarCliente(${id})">✏️ Editar</button>
        <button class="btn-accion btn-eliminar" onclick="eliminarCliente(${id})">🗑️ Eliminar</button>
      </div>`;
    document.getElementById('modal-detalle').classList.add('open');
  };

  document.getElementById('modal-detalle').addEventListener('click', function(e) {
    if (e.target===this) this.classList.remove('open');
  });

  // ── MODAL NUEVO/EDITAR ────────────────────────────────────
  window.abrirModalNuevo = function() {
    clienteEditandoId = null;
    document.getElementById('modal-titulo').textContent = 'NUEVO CLIENTE';
    document.getElementById('f-nombre').value = '';
    document.getElementById('f-cedula').value = '';
    document.getElementById('f-tel').value    = '';
    document.getElementById('f-notas').value  = '';
    document.getElementById('f-inicio').value = getFechaHoy();
    cargarPlanesEnSelect();
    const p = gymConfig.planes[0];
    if (p) document.getElementById('f-valor').value = p.precio;
    setSaveStatus('','Sin cambios');
    document.getElementById('modal-cliente').classList.add('open');
  };

  window.editarCliente = function(id) {
    const c = clientes[id];
    if (!c) return;
    clienteEditandoId = id;
    document.getElementById('modal-titulo').textContent = 'EDITAR CLIENTE';
    document.getElementById('f-nombre').value = c.nombre||'';
    document.getElementById('f-cedula').value = c.cedula||'';
    document.getElementById('f-tel').value    = c.telefono||'';
    document.getElementById('f-valor').value  = c.monto||'';
    document.getElementById('f-notas').value  = c.notas||'';
    document.getElementById('f-inicio').value = c.fecha_inicio||getFechaHoy();
    cargarPlanesEnSelect();
    // seleccionar plan actual
    const planActual = gymConfig.planes.find(p => p.nombre === c.plan);
    if (planActual) document.getElementById('f-plan').value = planActual.id;
    setSaveStatus('saved','✓ Guardado anteriormente');
    document.getElementById('modal-detalle').classList.remove('open');
    document.getElementById('modal-cliente').classList.add('open');
  };

  window.cerrarModalCliente = function() {
    document.getElementById('modal-cliente').classList.remove('open');
  };
  document.getElementById('modal-cliente').addEventListener('click', function(e) {
    if (e.target===this) cerrarModalCliente();
  });

  function setSaveStatus(estado, texto) {
    const ind = document.getElementById('save-indicator');
    const txt = document.getElementById('save-text');
    if (!ind||!txt) return;
    ind.className = 'save-indicator '+(estado||'');
    txt.textContent = texto;
  }

  window.guardarClienteManual = async function() {
    const nombre  = document.getElementById('f-nombre').value.trim();
    const plan_id = document.getElementById('f-plan').value;
    const inicio  = document.getElementById('f-inicio').value;
    if (!nombre||!plan_id||!inicio) {
      setSaveStatus('error','Faltan campos obligatorios');
      return alert('Nombre, plan y fecha son obligatorios');
    }
    setSaveStatus('saving','Guardando…');

    const body = {
      nombre,
      cedula:     document.getElementById('f-cedula').value.trim(),
      telefono:   document.getElementById('f-tel').value.trim(),
      plan_id:    parseInt(plan_id),
      monto:      parseInt(document.getElementById('f-valor').value.replace(/\D/g,''))||0,
      fecha_inicio: inicio,
      notas:      document.getElementById('f-notas').value.trim()
    };

    let res;
    if (clienteEditandoId) {
      res = await apiReq(`/api/clientes/${clienteEditandoId}`, { method:'PUT', body: JSON.stringify(body) });
    } else {
      res = await apiReq('/api/clientes', { method:'POST', body: JSON.stringify(body) });
    }
    const data = await res.json();
    if (!res.ok) { setSaveStatus('error','Error al guardar'); return alert(data.error); }

    setSaveStatus('saved','✓ Guardado');
    cerrarModalCliente();
    await cargarClientes();
    renderStats();
  };

  // ── RENOVAR ──────────────────────────────────────────────
  window.abrirModalRenovar = function(id) {
    const c = clientes[id];
    if (!c) return;
    clienteRenovandoId = id;
    const plan = gymConfig.planes.find(p => p.nombre === c.plan);
    document.getElementById('renovar-nombre-label').textContent = `Cliente: ${c.nombre} — Plan actual: ${c.plan||'—'}`;
    document.getElementById('renovar-valor').value = plan ? plan.precio : (c.monto||'');
    if (plan) document.getElementById('renovar-plan').value = plan.id;
    document.getElementById('modal-detalle').classList.remove('open');
    document.getElementById('modal-renovar').classList.add('open');
  };

  window.cerrarModalRenovar = function() {
    document.getElementById('modal-renovar').classList.remove('open');
    clienteRenovandoId = null;
  };

  window.confirmarRenovar = async function() {
    const id = clienteRenovandoId;
    if (!id) return;
    const plan_id = parseInt(document.getElementById('renovar-plan').value);
    const monto   = parseInt(document.getElementById('renovar-valor').value.replace(/\D/g,''))||0;
    const res  = await apiReq(`/api/clientes/${id}`, {
      method:'PUT', body: JSON.stringify({ plan_id, fecha_inicio: getFechaHoy(), monto })
    });
    if (!res.ok) { const d=await res.json(); return alert(d.error); }
    cerrarModalRenovar();
    await cargarClientes();
    renderStats();
  };

  document.getElementById('modal-renovar').addEventListener('click', function(e) {
    if (e.target===this) cerrarModalRenovar();
  });

  // ── ELIMINAR ─────────────────────────────────────────────
  window.eliminarCliente = async function(id) {
    if (!confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;
    await apiReq(`/api/clientes/${id}`, { method:'DELETE' });
    document.getElementById('modal-detalle').classList.remove('open');
    await cargarClientes();
    renderStats();
  };

  // ── WHATSAPP ─────────────────────────────────────────────
  window.waCliente = function(id) {
    const c = clientes[id];
    if (!c||!c.telefono) return;
    const est  = getEstado(c);
    const dias = diasRestantes(c);
    let msg = `Hola ${c.nombre.split(' ')[0]} 👋, te escribimos desde *${gymConfig.nombre}*.\n`;
    if (est==='vencido')      msg += `⚠️ Tu membresía *venció hace ${Math.abs(dias)} días*. ¡Renueva y sigue entrenando! 💪`;
    else if (est==='por-vencer') msg += `⏰ Tu membresía *vence en ${dias} días* (${fmtFecha(c.fecha_vence)}). ¡Renueva a tiempo! 💪`;
    else msg += `✅ Tu membresía está al día hasta el *${fmtFecha(c.fecha_vence)}*. ¡Sigue así! 🔥`;
    const phone = c.telefono.replace(/\D/g,'');
    window.open(`https://wa.me/57${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // ── STATS ─────────────────────────────────────────────────
  function renderStats() {
    const arr = Object.values(clientes);
    const total     = arr.length;
    const activos   = arr.filter(c => getEstado(c)==='activo').length;
    const porVencer = arr.filter(c => getEstado(c)==='por-vencer').length;
    const vencidos  = arr.filter(c => getEstado(c)==='vencido').length;

    const hoy = new Date();
    const mesActual = hoy.getMonth(); const anioActual = hoy.getFullYear();
    const ingresosMes = arr
      .filter(c => { if (!c.fecha_inicio) return false; const d = new Date(c.fecha_inicio+'T00:00:00'); return d.getMonth()===mesActual && d.getFullYear()===anioActual; })
      .reduce((s,c) => s+(parseInt(c.monto)||0), 0);

    const mesesLabels=[], mesesVals=[];
    for (let i=5; i>=0; i--) {
      const d = new Date(anioActual, mesActual-i, 1);
      const m=d.getMonth(); const y=d.getFullYear();
      const meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      mesesLabels.push(meses[m]);
      mesesVals.push(arr.filter(c => {
        if (!c.fecha_inicio) return false;
        const cd = new Date(c.fecha_inicio+'T00:00:00');
        return cd.getMonth()===m && cd.getFullYear()===y;
      }).length);
    }

    const planCount={};
    arr.forEach(c => { if(c.plan) planCount[c.plan]=(planCount[c.plan]||0)+1; });
    const topPlanes = Object.entries(planCount).sort((a,b)=>b[1]-a[1]);
    const maxPlan   = topPlanes.length ? topPlanes[0][1] : 1;

    document.getElementById('stats-content').innerHTML = `
      <div class="metrics">
        <div class="mcard"><div class="m-lbl">Total clientes</div><div class="m-val">${total}</div><div class="m-sub">registrados</div></div>
        <div class="mcard green"><div class="m-lbl">Al día</div><div class="m-val">${activos}</div><div class="m-sub">membresías activas</div></div>
        <div class="mcard yellow"><div class="m-lbl">Por vencer</div><div class="m-val">${porVencer}</div><div class="m-sub">en 3 días o menos</div></div>
        <div class="mcard red"><div class="m-lbl">Vencidos</div><div class="m-val">${vencidos}</div><div class="m-sub">sin renovar</div></div>
      </div>
      <div class="mcard" style="margin-bottom:16px">
        <div class="m-lbl">Ingresos este mes</div>
        <div class="m-val" style="font-size:32px">${fmtCOP(ingresosMes)}</div>
        <div class="m-sub">basado en registros del mes</div>
      </div>
      <div class="chart-card">
        <div class="section-title">Nuevos clientes por mes</div>
        <div style="position:relative;height:180px"><canvas id="chartMes"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="section-title">Planes más populares</div>
        ${topPlanes.length ? topPlanes.map(([n,c])=>`
          <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:12px;font-weight:700;color:var(--text);min-width:90px">${n}</span>
            <div style="flex:1;height:7px;background:var(--border);border-radius:4px;overflow:hidden">
              <div style="width:${Math.round(c/maxPlan*100)}%;height:100%;background:linear-gradient(90deg,var(--gold),#B8960C);border-radius:4px"></div>
            </div>
            <span style="font-size:12px;font-weight:700;color:var(--gold);min-width:24px;text-align:right">${c}</span>
          </div>`).join('') : '<div class="empty-state" style="padding:20px 0">Sin datos aún</div>'}
      </div>`;

    if (chartMesInst) { chartMesInst.destroy(); chartMesInst=null; }
    const ctx = document.getElementById('chartMes');
    if (ctx) {
      chartMesInst = new Chart(ctx, {
        type:'bar',
        data:{ labels:mesesLabels, datasets:[{ data:mesesVals, backgroundColor:'#D4AF37', borderRadius:6, borderSkipped:false }] },
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false} },
          scales:{
            x:{ ticks:{color:'#666',font:{size:11}}, grid:{display:false} },
            y:{ ticks:{color:'#666',font:{size:11},stepSize:1}, grid:{color:'rgba(255,255,255,0.04)'}, beginAtZero:true }
          }
        }
      });
    }
  }

  // ── ALERTAS ──────────────────────────────────────────────
  function renderAlertas() {
    const arr = Object.values(clientes)
      .filter(c => getEstado(c)!=='activo')
      .sort((a,b) => getEstado(a)==='vencido' && getEstado(b)!=='vencido' ? -1 : 1);

    const el = document.getElementById('alertas-content');
    if (!el) return;
    if (!arr.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div>¡Todo al día! No hay alertas pendientes</div>`;
      return;
    }
    el.innerHTML = `<div style="margin-bottom:14px">
      <button class="btn-gold" onclick="notificarTodos()" style="width:100%;padding:13px;font-size:13px">
        📱 Enviar WhatsApp a todos (${arr.length})
      </button>
    </div>` + arr.map(c => {
      const est  = getEstado(c);
      const dias = diasRestantes(c);
      const msg  = est==='vencido' ? `Venció hace ${Math.abs(dias)} días` : `Vence en ${dias} días`;
      return `<div class="notif-card">
        <div class="notif-dot ${est==='vencido'?'red':'yellow'}"></div>
        <div class="notif-info">
          <div class="notif-nombre">${c.nombre}</div>
          <div class="notif-msg">${msg} — ${c.plan||'—'}</div>
        </div>
        ${c.telefono?`<button class="btn-notif-wa" onclick="waCliente(${c.id})">💬 WA</button>`:''}
      </div>`;
    }).join('');
  }

  window.notificarTodos = function() {
    const arr = Object.values(clientes).filter(c => getEstado(c)!=='activo' && c.telefono);
    if (!arr.length) { alert('No hay clientes con teléfono para notificar'); return; }
    arr.forEach(c => waCliente(c.id));
  };

  // ── CONFIG ────────────────────────────────────────────────
  function renderConfig() {
    document.getElementById('config-content').innerHTML = `
      <div class="config-card">
        <h3>🏋️ Datos del Gym</h3>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">Nombre del Gym</label>
          <input class="form-inp" id="cfg-nombre" value="${gymConfig.nombre||''}" placeholder="Mi Gym">
        </div>
        <button class="btn-gold" onclick="guardarConfigGym()">💾 Guardar datos</button>
      </div>

      <div class="config-card">
        <h3>📋 Planes disponibles</h3>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px">El precio es referencia — al registrar puedes cambiarlo.</p>
        <div id="planes-lista">
          ${gymConfig.planes.map((p,i) => `
            <div class="plan-row">
              <input class="form-inp" value="${p.nombre}" placeholder="Nombre" id="plan-n-${i}" style="flex:2">
              <input class="form-inp" value="${p.dias}" placeholder="Días" id="plan-d-${i}" type="text" inputmode="numeric" style="flex:1">
              <input class="form-inp" value="${p.precio}" placeholder="Precio" id="plan-p-${i}" type="text" inputmode="numeric" style="flex:1">
              <button onclick="eliminarPlanLocal(${i})" style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:var(--red);cursor:pointer;font-size:14px">🗑️</button>
            </div>`).join('')}
        </div>
        <button onclick="agregarPlanLocal()" style="width:100%;padding:12px;background:var(--dark4);border:1px solid var(--border);border-radius:10px;color:var(--gold);font-family:'Barlow',sans-serif;font-size:13px;font-weight:700;cursor:pointer;margin-top:10px">+ Agregar plan</button>
        <button class="btn-gold" style="margin-top:10px" onclick="guardarPlanesBackend()">💾 Guardar planes</button>
      </div>

      <div class="config-card">
        <h3>🔐 Cambiar contraseña</h3>
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label">Nueva contraseña</label>
          <input class="form-inp" id="cfg-newpass" type="password" placeholder="••••••">
        </div>
        <button class="btn-gold" onclick="cambiarPass()">💾 Guardar contraseña</button>
      </div>`;
  }

  window.guardarConfigGym = async function() {
    const nombre = document.getElementById('cfg-nombre').value.trim();
    gymConfig.nombre = nombre;
    localStorage.setItem('gym_nombre', nombre);
    document.getElementById('topbar-nombre').textContent = nombre;
    await apiReq('/api/config', { method:'POST', body: JSON.stringify({ nombre }) });
    alert('✅ Datos guardados');
  };

  window.agregarPlanLocal = function() {
    gymConfig.planes.push({ id: null, nombre:'Nuevo plan', dias:30, precio:0 });
    renderConfig();
  };

  window.eliminarPlanLocal = function(i) {
    if (!confirm('¿Eliminar este plan?')) return;
    gymConfig.planes.splice(i,1);
    renderConfig();
  };

  window.guardarPlanesBackend = async function() {
    const count = gymConfig.planes.length;
    const planes = [];
    for (let i=0; i<count; i++) {
      const n = document.getElementById('plan-n-'+i)?.value.trim();
      const d = parseInt(document.getElementById('plan-d-'+i)?.value);
      const p = parseInt(document.getElementById('plan-p-'+i)?.value);
      if (n) planes.push({ nombre:n, duracion_dias:d||30, precio:p||0 });
    }
    await apiReq('/api/planes', { method:'POST', body: JSON.stringify({ planes }) });
    await cargarPlanes();
    alert('✅ Planes guardados');
  };

  window.cambiarPass = async function() {
    const np = document.getElementById('cfg-newpass').value;
    if (!np || np.length<6) return alert('La contraseña debe tener al menos 6 caracteres');
    const res = await apiReq('/api/auth/cambiar-pass', { method:'POST', body: JSON.stringify({ password: np }) });
    if (!res.ok) { const d=await res.json(); return alert(d.error); }
    alert('✅ Contraseña actualizada');
    document.getElementById('cfg-newpass').value='';
  };

})();