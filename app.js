const store = require('./store.js');
const finanzas = require('./finanzas.js');

// Cargar Controladores de Interfaz (inyectan funciones al objeto window)
require('./ui_pos.js');
require('./ui_compras.js');
require('./ui_stock.js');
require('./ui_finanzas.js');

// Utilidades locales
const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

window.showToast = function(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show ' + type;
    setTimeout(() => t.className = '', 2500);
};

// ================= NAVEGACIÓN Y CONFIGURACIÓN =================
window.showSection = function(id, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('sec-' + id).classList.add('active');
    if (btn) btn.classList.add('active');
    
    if (id === 'pos') { window.renderProductGrid(); setTimeout(() => document.getElementById('pos-barcode').focus(), 80); }
    if (id === 'stock') window.renderTablaProductos();
    if (id === 'ventas') window.renderTablaVentas();
    if (id === 'proveedores') { window.renderTablaProveedores(); window.renderTablaDeudas(); }
    if (id === 'gastos') { window.renderTablaGastos(); window.renderEnviosPendientes(); }
    if (id === 'finanzas') { window.renderCuentas(); window.renderFinanzasTotales(); window.renderCashflow(); }
    if (id === 'socios') window.renderSocios();
    if (id === 'indicadores') window.renderIndicadores();
    if (id === 'informes') {
        document.getElementById('inf-desde').value = new Date(new Date().setDate(1)).toISOString().slice(0, 10);
        document.getElementById('inf-hasta').value = today();
        window.showInfTab('resumen', document.querySelector('.tab-pill'));
    }
    if (id === 'config') window.cargarConfig();
};

window.showProvTab = function(id, btn) {
    document.querySelectorAll('.prov-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('#sec-proveedores .tab-pill').forEach(b => b.classList.remove('active'));
    document.getElementById('prov-' + id).style.display = 'block';
    btn.classList.add('active');
};

window.showInfTab = function(id, btn) {
    document.querySelectorAll('.inf-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('#sec-informes .tab-pill').forEach(b => b.classList.remove('active'));
    document.getElementById('inf-' + id).style.display = 'block';
    btn.classList.add('active');
};

window.populateSelects = function() {
    const provs = '<option value="">— Seleccionar —</option>' + store.db.proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    document.querySelectorAll('#np-proveedor, #ep-prod-proveedor, #deuda-prov, #comp-proveedor').forEach(s => { const val = s.value; s.innerHTML = provs; s.value = val; });
    
    const ctas = store.db.cuentas.map(c => `<option value="${c.id}">${c.nombre} (${fmt(finanzas.calcSaldoCuenta(c.id))})</option>`).join('');
    document.querySelectorAll('#comp-cuenta, #pd-cuenta, #gasto-cuenta, #mov-cuenta, #envios-cuenta').forEach(s => { const val = s.value; s.innerHTML = ctas; s.value = val || (store.db.cuentas[0]?.id || ''); });
    
    const socs = '<option value="">— Seleccionar —</option>' + store.db.socios.filter(s => !s.deleted).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    document.querySelectorAll('#mov-socio, #rs-socio').forEach(s => { const val = s.value; s.innerHTML = socs; s.value = val; });
    
    document.getElementById('medios-pago-btns').innerHTML = store.db.cuentas.map(c => `<button class="medio-btn${c.id === store.medioSeleccionado ? ' selected' : ''}" onclick="window.selectMedio('${c.id}',this)">${c.nombre}</button>`).join('');
    document.getElementById('vent-filtro-medio').innerHTML = '<option value="">Todas</option>' + store.db.cuentas.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
};

window.cargarConfig = function() {
    const c = store.db.config;
    ['nombre','direccion','tel','email','ig','fb','descEfectivo','colorAccent','colorInk'].forEach(k => {
        const el = document.getElementById('cfg-'+k.replace(/([A-Z])/g, "-$1").toLowerCase());
        if(el) el.value = c[k] || '';
    });
    if (c.logo) document.getElementById('cfg-logo-preview').innerHTML = `<img src="${c.logo}" style="max-height:60px;">`;
    if (store.dbFilePath) document.getElementById('ruta-guardado').textContent = store.dbFilePath;
};

window.guardarConfig = function() {
    ['nombre','direccion','tel','email','ig','fb','colorAccent','colorInk'].forEach(k => store.db.config[k] = document.getElementById('cfg-'+k.replace(/([A-Z])/g, "-$1").toLowerCase()).value);
    store.saveDB();
    window.aplicarBranding();
    window.showToast('Guardado');
};

window.guardarDescEfectivo = function() {
    store.db.config.descEfectivo = parseFloat(document.getElementById('cfg-desc-efectivo').value) || 0;
    store.saveDB();
    window.showToast('Regla guardada');
    if(typeof window.renderCarrito === 'function') window.renderCarrito();
};

window.cargarLogo = function(e) {
    const r = new FileReader();
    r.onload = ev => {
        store.db.config.logo = ev.target.result;
        window.cargarConfig();
        window.aplicarBranding();
    };
    r.readAsDataURL(e.target.files[0]);
};

window.aplicarBranding = function() {
    const c = store.db.config;
    document.documentElement.style.setProperty('--c1', c.colorAccent || '#C4432A');
    document.documentElement.style.setProperty('--c2', c.colorInk || '#1A1612');
    const h = document.getElementById('header-logo');
    if (c.logo) { h.src = c.logo; h.classList.add('visible'); }
    else { h.classList.remove('visible'); }
    document.getElementById('header-title').innerHTML = c.nombre ? `<span style="color:var(--c1)">${c.nombre}</span>` : `Libre<span>POS</span>`;
};

window.exportarDatos = function() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(store.db)], { type: 'application/json' }));
    a.download = 'LibrePOS-' + today() + '.json';
    a.click();
};

window.importarDatos = function(e) {
    const r = new FileReader();
    r.onload = ev => {
        Object.assign(store.db, JSON.parse(ev.target.result));
        store.saveDB();
        location.reload();
    };
    r.readAsText(e.target.files[0]);
};

// INIT GLOBAL
window.aplicarBranding();
window.populateSelects();
['comp','gasto','deuda','mov'].forEach(p => {
    const el = document.getElementById(`${p}-fecha`);
    if(el) el.value = today();
});