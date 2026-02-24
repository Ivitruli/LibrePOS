/* ================= 1. MODELO Y DATOS (DB) ================= */
const DB_KEY = 'librepos_db_v6';
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

let carrito = [];
let selectedProductId = null;
let medioSeleccionado = '';
let chartCashflow = null;
let barcodeTimer = null;

function emptyDB() {
  return {
    productos: [], lotes: [], ventas: [], ventaItems: [], gastos: [], proveedores: [], socios: [], movimientos: [], preciosExtra: {},
    cuentas: [
      { id: 'c1', nombre: 'Efectivo', saldoInicial: 0 },
      { id: 'c2', nombre: 'UALA', saldoInicial: 0 },
      { id: 'c3', nombre: 'Mercado Pago', saldoInicial: 0 },
      { id: 'c4', nombre: 'BNA', saldoInicial: 0 },
      { id: 'c5', nombre: 'Cuenta DNI', saldoInicial: 0 }
    ],
    ajustesCaja: [], cuentasPorPagar: [],
    config: { descEfectivo: 10, nombre: '', direccion: '', tel: '', email: '', logo: '', ig: '', fb: '', colorAccent: '#C4432A', colorInk: '#1A1612', demoLoaded: false }
  };
}

function loadDB() {
  try {
    const r = localStorage.getItem(DB_KEY);
    if (r) {
      const d = JSON.parse(r);
      const e = emptyDB();
      Object.keys(e).forEach(k => { if (d[k] === undefined) d[k] = e[k]; });
      
      // MIGRACIONES DE SEGURIDAD Y LIMPIEZA
      if (d.proveedores) d.proveedores.forEach(p => { if (!Array.isArray(p.diasPedido)) p.diasPedido = []; if (!Array.isArray(p.diasEntrega)) p.diasEntrega = []; });
      if (d.gastos) d.gastos.forEach(g => { if (!g.tipo) g.tipo = 'variable'; if (!g.cuentaId) { const c = d.cuentas.find(x => x.nombre === g.medio); g.cuentaId = c ? c.id : 'c1'; } });
      if (d.ventas) d.ventas.forEach(v => { if (!v.cuentaId) { const c = d.cuentas.find(x => x.nombre === v.medioPago); v.cuentaId = c ? c.id : 'c1'; } });
      if (d.productos) d.productos.forEach(p => { if (!d.preciosExtra[p.id]) d.preciosExtra[p.id] = { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false }; });
      if (d.socios) d.socios.forEach(s => { if (s.deleted === undefined) s.deleted = false; if (!s.dni) s.dni = ''; });
      
      // Migrar variables de ganancia global viejas a movimientos contables formales
      if (d.gananciasRepartidas > 0) {
        d.movimientos.push({ id: 'mig_1', socioId: d.socios[0]?.id, fecha: new Date().toISOString().slice(0, 10), tipo: 'asignacion', importe: d.gananciasRepartidas, descripcion: 'Migración Histórica: Utilidades' });
        delete d.gananciasRepartidas;
      }
      if (d.gananciasReinvertidas > 0) {
        d.movimientos.push({ id: 'mig_2', socioId: null, fecha: new Date().toISOString().slice(0, 10), tipo: 'reinversion', importe: d.gananciasReinvertidas, descripcion: 'Migración Histórica: Reinversión' });
        delete d.gananciasReinvertidas;
      }
      return d;
    }
  } catch (e) {}
  return emptyDB();
}

function saveDB() {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

let db = loadDB();

// -- DATOS DE DEMOSTRACIÓN --
if (db.productos.length === 0 && !db.config.demoLoaded) {
  db.config.demoLoaded = true;
  db.socios.push({ id: 's1', nombre: 'Martín', dni: '30123456', deleted: false }, { id: 's2', nombre: 'Sofía', dni: '32654987', deleted: false });
  db.proveedores.push({ id: 'p1', nombre: 'Distribuidora TodoSur', contacto: 'Carlos', tel: '011-4444-5555', diasPedido: ['1'], diasEntrega: ['3'] });
  db.productos.push({ id: 'pd1', codigo: 'YER-01', nombre: 'Yerba Mate 1kg', marca: 'Taragüi', proveedorId: 'p1', unidad: 'unidad', stockMinimo: 10, deleted: false });
  db.productos.push({ id: 'pd2', codigo: 'QSO-01', nombre: 'Queso Cremoso', marca: 'La Paulina', proveedorId: 'p1', unidad: 'kg', stockMinimo: 5, deleted: false });
  
  db.lotes.push({ id: 'l1', productoId: 'pd1', fecha: new Date().toISOString().slice(0, 10), cantOriginal: 20, cantDisponible: 18, costoUnit: 2500, precioVenta: 4000, cuentaId: 'c1' });
  db.lotes.push({ id: 'l2', productoId: 'pd2', fecha: new Date().toISOString().slice(0, 10), cantOriginal: 10, cantDisponible: 10, costoUnit: 4000, precioVenta: 6000, cuentaId: 'c1' });
  db.preciosExtra['pd1'] = { fijo: 0, imp: 21, gan: 30, desc: 0, alCosto: false };
  db.preciosExtra['pd2'] = { fijo: 0, imp: 0, gan: 40, desc: 0, alCosto: false };
  
  db.cuentas.find(c => c.id === 'c1').saldoInicial = 150000;
  db.cuentas.find(c => c.id === 'c3').saldoInicial = 80000;
  
  const vId = 'v_demo';
  db.ventas.push({ id: vId, timestamp: new Date().toISOString(), fecha: new Date().toISOString().slice(0, 10), totalVenta: 8000, totalCosto: 5000, cuentaId: 'c1', medioPago: 'Efectivo', descEfectivo: 0, facturada: false });
  db.ventaItems.push({ ventaId: vId, productoId: 'pd1', nombre: 'Yerba Mate 1kg', unidad: 'unidad', cantidad: 2, precioVenta: 4000, costoTotal: 5000 });
  
  db.cuentasPorPagar.push({ id: 'd_demo', proveedorId: 'p1', fecha: new Date().toISOString().slice(0, 10), monto: 25000, descripcion: 'Mercadería en consignación', pagado: false, pagos: [] });
  saveDB();
}

if (db.cuentas.length > 0) medioSeleccionado = db.cuentas[0].id;


/* ================= 2. HELPERS CONTABLES Y GETTERS ================= */

const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : u === '100g' ? Number(n).toFixed(1) + '×100g' : Number(n).toFixed(0) + ' u.';
const today = () => new Date().toISOString().slice(0, 10);
const fmtFecha = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; };
const roundUp10 = n => Math.ceil(n / 10) * 10;
const showToast = (msg, type = 'success') => { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'show ' + type; setTimeout(() => t.className = '', 2500); };

function getStock(pid) {
  return db.lotes.filter(l => l.productoId === pid).reduce((s, l) => s + l.cantDisponible, 0);
}

function getCostoActual(pid) {
  const ls = db.lotes.filter(l => l.productoId === pid && l.cantDisponible > 0);
  return ls.length ? ls[ls.length - 1].costoUnit : 0;
}

function calcPrecioFinal(pid, forceAlCosto = false) {
  const costo = getCostoActual(pid) || 0;
  if (costo === 0) return 0;
  const ex = db.preciosExtra[pid] || { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false };
  const isAlCosto = forceAlCosto || ex.alCosto;
  let raw = 0;
  if (isAlCosto) {
    raw = (costo + (ex.fijo || 0)) * (1 + (ex.imp || 0) / 100);
  } else {
    raw = (costo + (ex.fijo || 0)) * (1 + (ex.imp || 0) / 100) * (1 + (ex.gan || 0) / 100) * (1 - (ex.desc || 0) / 100);
  }
  return roundUp10(raw);
}

function getPrecioCart(pid) {
  return calcPrecioFinal(pid, document.getElementById('cart-venta-costo')?.checked);
}

function isCostoProd(pid) {
  return document.getElementById('cart-venta-costo')?.checked || (db.preciosExtra[pid] && db.preciosExtra[pid].alCosto);
}

function calcSaldoCuenta(cId) {
  const c = db.cuentas.find(x => x.id === cId);
  if (!c) return 0;
  let saldo = parseFloat(c.saldoInicial) || 0;
  db.ventas.filter(v => v.cuentaId === cId).forEach(v => saldo += v.totalVenta);
  db.gastos.filter(g => g.cuentaId === cId).forEach(g => saldo -= g.importe);
  db.lotes.filter(l => l.cuentaId === cId).forEach(l => saldo -= (l.cantOriginal * l.costoUnit));
  db.cuentasPorPagar.forEach(d => { if (Array.isArray(d.pagos)) d.pagos.filter(p => p.cuentaId === cId).forEach(p => saldo -= p.monto); });
  db.movimientos.filter(m => m.cuentaId === cId).forEach(m => {
    if (m.tipo === 'retiro') saldo -= m.importe;
    if (m.tipo === 'deposito') saldo += m.importe;
  });
  db.ajustesCaja.filter(a => a.cuentaId === cId).forEach(a => {
    if (a.tipo === 'ingreso') saldo += a.diferencia;
    else saldo -= Math.abs(a.diferencia);
  });
  return saldo;
}

function calcGananciaNetaGlobal() {
  const ing = db.ventas.reduce((s, v) => s + v.totalVenta, 0);
  const cmv = db.ventaItems.reduce((s, vi) => s + vi.costoTotal, 0);
  const gas = db.gastos.reduce((s, g) => s + g.importe, 0);
  let ajusteNeto = 0;
  db.ajustesCaja.forEach(a => { if (a.tipo === 'ingreso') ajusteNeto += a.diferencia; else ajusteNeto -= Math.abs(a.diferencia); });
  return ing - cmv - gas + ajusteNeto;
}

function calcSaldoSocio(socioId) {
  let saldo = 0;
  db.movimientos.filter(m => m.socioId === socioId).forEach(m => {
    if (m.tipo === 'deposito' || m.tipo === 'asignacion') saldo += m.importe;
    if (m.tipo === 'retiro') saldo -= m.importe;
  });
  return saldo;
}

function calcGananciaSinAsignar() {
  const asig = db.movimientos.filter(x => x.tipo === 'asignacion').reduce((s, x) => s + x.importe, 0);
  const reinv = db.movimientos.filter(x => x.tipo === 'reinversion').reduce((s, x) => s + x.importe, 0);
  return calcGananciaNetaGlobal() - asig - reinv;
}

function getPatrimonioNeto() {
  const caja = db.cuentas.reduce((s, c) => s + calcSaldoCuenta(c.id), 0);
  const stockV = db.productos.filter(p => !p.deleted).reduce((s, p) => s + (getStock(p.id) * getCostoActual(p.id)), 0);
  const pasivosComerciales = db.cuentasPorPagar.filter(d => !d.pagado).reduce((s, d) => s + (d.monto - (d.pagos || []).reduce((x, p) => x + p.monto, 0)), 0);
  let pasivoSocios = 0;
  let activoSocios = 0;
  
  db.socios.filter(s => !s.deleted).forEach(s => {
    let saldo = calcSaldoSocio(s.id);
    if (saldo > 0) pasivoSocios += saldo;
    if (saldo < 0) activoSocios += Math.abs(saldo);
  });
  return caja + stockV + activoSocios - pasivosComerciales - pasivoSocios;
}
/* ================= 3. CONTROLADORES (POS Y LOGICA NEGOCIO) ================= */

function handleBarcodeInput() {
  clearTimeout(barcodeTimer);
  const val = document.getElementById('pos-barcode').value;
  barcodeTimer = setTimeout(() => {
    if (val.length >= 4) {
      const p = db.productos.filter(x => !x.deleted).find(x => x.barcode === val.trim() || x.codigo === val.trim());
      if (p) { document.getElementById('pos-barcode').value = ''; abrirModalQty(p.id); }
    }
  }, 150);
}

function handleBarcodeKey(e) {
  if (e.key === 'Enter') {
    clearTimeout(barcodeTimer);
    const val = document.getElementById('pos-barcode').value.trim();
    if (!val) return;
    const p = db.productos.filter(x => !x.deleted).find(x => x.barcode === val || x.codigo === val);
    if (p) {
      document.getElementById('pos-barcode').value = '';
      abrirModalQty(p.id);
    } else {
      showToast('No encontrado', 'error');
    }
  }
}

// Enter Global y Cierre de Ventana (Puntos 23 y 30)
window.addEventListener('keydown', e => {
  const isPosActive = document.getElementById('sec-pos').classList.contains('active');
  const isModalOpen = document.querySelector('.modal-overlay.open');
  
  // Enter global para confirmar venta
  if (e.key === 'Enter' && isPosActive && !isModalOpen && carrito.length > 0) {
    if (document.activeElement.id === 'pos-barcode' && document.activeElement.value.trim() !== '') return;
    e.preventDefault();
    confirmarVenta();
  }
  // Cierre de ventana modal venta
  if (e.key === 'Enter' && document.getElementById('modal-venta').classList.contains('open')) {
    e.preventDefault();
    cerrarModalVenta();
  }
});

function selectMedio(id, btn) {
  medioSeleccionado = id;
  document.querySelectorAll('.medio-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  renderCarrito();
}

function toggleCartCosto() {
  carrito.forEach(i => i.precioVenta = getPrecioCart(i.productoId));
  renderCarrito();
}

function confirmarAgregarCarrito() {
  const qty = parseFloat(document.getElementById('modal-qty-input').value);
  if (!qty || qty <= 0) return;
  const prod = db.productos.find(p => p.id === selectedProductId);
  if (qty > getStock(prod.id) + 0.001) { showToast('Stock insuficiente', 'error'); return; }
  
  const ex = carrito.find(c => c.productoId === prod.id);
  if (ex) {
    ex.cantidad += qty;
  } else {
    carrito.push({ productoId: prod.id, nombre: prod.nombre, unidad: prod.unidad, cantidad: qty, precioVenta: getPrecioCart(prod.id) });
  }
  cerrarModalQty();
  renderCarrito();
  document.getElementById('pos-barcode').focus();
}

function calcDescEfectivo() {
  const c = db.cuentas.find(x => x.id === medioSeleccionado);
  if (!c || c.nombre.toLowerCase() !== 'efectivo') return 0;
  return carrito.filter(i => {
    if (isCostoProd(i.productoId)) return false;
    const ex = db.preciosExtra[i.productoId] || {};
    return !ex.desc || ex.desc === 0;
  }).reduce((s, i) => s + i.cantidad * i.precioVenta, 0) * (db.config.descEfectivo / 100);
}

function consumirPEPS(pId, cant) {
  const lotes = db.lotes.filter(l => l.productoId === pId && l.cantDisponible > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  let rest = cant, costoT = 0, movs = [];
  for (const l of lotes) {
    if (rest <= 0) break;
    const c = Math.min(l.cantDisponible, rest);
    costoT += c * l.costoUnit;
    movs.push({ lId: l.id, c });
    l.cantDisponible -= c;
    rest -= c;
  }
  if (rest > 0.0001) throw new Error('Error PEPS');
  return { costoTotal: costoT, movs };
}

function confirmarVenta() {
  if (!carrito.length) return;
  const descMonto = calcDescEfectivo();
  const ts = new Date().toISOString();
  const vId = Date.now().toString();
  let totV = 0, totC = 0, items = [];
  
  try {
    for (const i of carrito) {
      if (i.cantidad > getStock(i.productoId) + 0.001) throw new Error('Stock falto: ' + i.nombre);
    }
    for (const i of carrito) {
      const { costoTotal, movs } = consumirPEPS(i.productoId, i.cantidad);
      const sub = i.cantidad * i.precioVenta;
      totV += sub;
      totC += costoTotal;
      db.ventaItems.push({ ventaId: vId, productoId: i.productoId, nombre: i.nombre, unidad: i.unidad, cantidad: i.cantidad, precioVenta: i.precioVenta, costoTotal });
      items.push({ nombre: i.nombre, q: i.cantidad, u: i.unidad, s: sub });
    }
    const c = db.cuentas.find(x => x.id === medioSeleccionado);
    db.ventas.push({ id: vId, timestamp: ts, fecha: ts.slice(0, 10), totalVenta: totV - descMonto, totalCosto: totC, cuentaId: c.id, medioPago: c.nombre, descEfectivo: descMonto, facturada: false });
    saveDB();
    populateSelects();
    
    document.getElementById('resumen-venta').innerHTML = `<table style="width:100%;font-size:.82rem;margin-bottom:.8rem;">${items.map(r => `<tr><td>${r.nombre}</td><td class="mono" align="right">${fmtQty(r.q, r.u)}</td><td class="mono" align="right">${fmt(r.s)}</td></tr>`).join('')}</table>${descMonto > 0 ? `<div style="color:var(--green)">Desc. Efec: -${fmt(descMonto)}</div>` : ''}<div style="font-size:1.4rem;font-weight:900;border-top:2px solid #ccc;padding-top:.5rem;">Total: ${fmt(totV - descMonto)}</div>`;
    document.getElementById('modal-venta').classList.add('open');
    limpiarCarrito();
    renderProductGrid();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function cerrarModalVenta() { document.getElementById('modal-venta').classList.remove('open'); document.getElementById('pos-barcode').focus(); }
function cambiarQtyCarrito(i, d) { const item = carrito[i]; const s = item.unidad === 'unidad' ? 1 : .1; item.cantidad = Math.max(s, item.cantidad + d * s); renderCarrito(); }
function setQtyCarrito(i, v) { carrito[i].cantidad = parseFloat(v) || .001; renderCarrito(); }
function quitarDeCarrito(i) { carrito.splice(i, 1); renderCarrito(); }
function limpiarCarrito() { carrito = []; renderCarrito(); }
function filterProducts() { renderProductGrid(document.getElementById('pos-search').value); }
function cerrarModalQty() { document.getElementById('modal-qty').classList.remove('open'); selectedProductId = null; }
function abrirModalQty(productoId) {
  const prod = db.productos.find(p => p.id === productoId);
  const stock = getStock(productoId);
  if (stock <= 0) { showToast('Sin stock: ' + prod.nombre, 'error'); return; }
  selectedProductId = productoId;
  document.getElementById('modal-qty-title').textContent = prod.nombre;
  document.getElementById('modal-qty-label').textContent = prod.unidad === 'kg' ? 'Cantidad (kg)' : prod.unidad === '100g' ? 'Cantidad (×100g)' : 'Cantidad (unidades)';
  const inp = document.getElementById('modal-qty-input');
  inp.value = prod.unidad === 'unidad' ? '1' : '';
  inp.step = prod.unidad === 'unidad' ? '1' : '0.001';
  document.getElementById('modal-stock-info').textContent = 'Stock disponible: ' + fmtQty(stock, prod.unidad);
  document.getElementById('modal-qty').classList.add('open');
  setTimeout(() => inp.select(), 60);
}


/* ================= COMPRAS Y STOCK ================= */

function buscarProdCompra() {
  const bc = document.getElementById('comp-barcode').value.trim();
  if (!bc) return;
  const prod = db.productos.filter(x => !x.deleted).find(p => p.barcode === bc || p.codigo === bc);
  if (prod) {
    document.getElementById('comp-prod-nombre').value = prod.nombre + (prod.marca ? ' (' + prod.marca + ')' : '');
    document.getElementById('comp-prod-id').value = prod.id;
    document.getElementById('comp-cantidad').focus();
  } else {
    document.getElementById('np-barcode').value = bc;
    document.getElementById('np-codigo').value = bc;
    document.getElementById('modal-np').classList.add('open');
    setTimeout(() => document.getElementById('np-nombre').focus(), 80);
  }
}

function guardarNuevoProd() {
  const codigo = document.getElementById('np-codigo').value.trim();
  const nombre = document.getElementById('np-nombre').value.trim();
  const barcode = document.getElementById('np-barcode').value.trim();
  const marca = document.getElementById('np-marca').value.trim();
  const proveedorId = document.getElementById('np-proveedor').value;
  const unidad = document.getElementById('np-unidad').value;
  
  if (!codigo || !nombre) { showToast('Código y nombre son obligatorios', 'error'); return; }
  let exist = db.productos.find(p => p.codigo === codigo || (barcode && p.barcode === barcode));
  if (exist && !exist.deleted) { showToast('Código ya existe en catálogo', 'error'); return; }
  
  let pId;
  if (exist && exist.deleted) {
    exist.deleted = false; exist.nombre = nombre; exist.marca = marca; exist.proveedorId = proveedorId; exist.unidad = unidad;
    pId = exist.id; showToast('Producto reactivado');
  } else {
    pId = Date.now().toString();
    db.productos.push({ id: pId, codigo, nombre, barcode, marca, proveedorId, unidad, deleted: false });
    showToast('Producto registrado');
  }
  db.preciosExtra[pId] = { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false };
  
  saveDB();
  document.getElementById('modal-np').classList.remove('open');
  document.getElementById('comp-prod-nombre').value = nombre + (marca ? ' (' + marca + ')' : '');
  document.getElementById('comp-prod-id').value = pId;
  ['np-codigo', 'np-nombre', 'np-marca'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('comp-cantidad').focus();
}

function calcularPrecio() {
  const costo = parseFloat(document.getElementById('comp-costo').value) || 0;
  const fijo = parseFloat(document.getElementById('calc-fijo').value) || 0;
  const imp = parseFloat(document.getElementById('calc-imp').value) || 0;
  const gan = parseFloat(document.getElementById('calc-gan').value) || 0;
  const desc = parseFloat(document.getElementById('calc-desc').value) || 0;
  
  if (!costo) { document.getElementById('precio-result-txt').textContent = ''; return; }
  const raw = (costo + fijo) * (1 + imp / 100) * (1 + gan / 100) * (1 - desc / 100);
  const redondeado = roundUp10(raw);
  document.getElementById('comp-precio').value = redondeado;
  document.getElementById('precio-result-txt').textContent = `Final sugerido: ${fmt(redondeado)}`;
}

function togglePagoCompra(val) {
  document.getElementById('comp-cuenta-wrap').style.display = val === 'pagado' ? 'block' : 'none';
}

function registrarCompra() {
  const pId = document.getElementById('comp-prod-id').value;
  const f = document.getElementById('comp-fecha').value;
  const cant = parseFloat(document.getElementById('comp-cantidad').value);
  const costo = parseFloat(document.getElementById('comp-costo').value);
  const pagoEst = document.getElementById('comp-pago').value;
  const cId = document.getElementById('comp-cuenta').value;
  
  if (!pId || !f || !cant || !costo) return showToast('Faltan datos', 'error');
  
  db.lotes.push({ id: Date.now().toString(), productoId: pId, fecha: f, vencimiento: document.getElementById('comp-venc').value || null, cantOriginal: cant, cantDisponible: cant, costoUnit: costo, cuentaId: pagoEst === 'pagado' ? cId : null });
  db.preciosExtra[pId] = { fijo: parseFloat(document.getElementById('calc-fijo').value) || 0, imp: parseFloat(document.getElementById('calc-imp').value) || 0, gan: parseFloat(document.getElementById('calc-gan').value) || 0, desc: parseFloat(document.getElementById('calc-desc').value) || 0, alCosto: false };
  
  if (pagoEst === 'adeudado') {
    const p = db.productos.find(x => x.id === pId);
    db.cuentasPorPagar.push({ id: Date.now().toString(), proveedorId: p.proveedorId, fecha: f, monto: cant * costo, descripcion: 'Compra Lote ' + p.nombre, pagado: false, pagos: [] });
  }
  
  saveDB();
  populateSelects();
  showToast('Compra registrada');
  ['comp-barcode', 'comp-prod-nombre', 'comp-cantidad', 'comp-costo', 'comp-precio'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('comp-barcode').focus();
}

function abrirEditarProd(prodId) {
  const p = db.productos.find(x => x.id === prodId);
  if (!p) return;
  document.getElementById('ep-prod-id').value = prodId;
  document.getElementById('ep-prod-codigo').value = p.codigo;
  document.getElementById('ep-prod-nombre').value = p.nombre;
  document.getElementById('ep-prod-unidad').value = p.unidad;
  document.getElementById('ep-prod-marca').value = p.marca || '';
  document.getElementById('ep-prod-min').value = p.stockMinimo || '';
  document.getElementById('ep-prod-proveedor').value = p.proveedorId || '';
  document.getElementById('modal-edit-prod').classList.add('open');
}

function guardarEditProd() {
  const p = db.productos.find(x => x.id === document.getElementById('ep-prod-id').value);
  if (!p) return;
  p.codigo = document.getElementById('ep-prod-codigo').value.trim() || p.codigo;
  p.nombre = document.getElementById('ep-prod-nombre').value.trim() || p.nombre;
  p.unidad = document.getElementById('ep-prod-unidad').value;
  p.marca = document.getElementById('ep-prod-marca').value.trim();
  p.stockMinimo = parseFloat(document.getElementById('ep-prod-min').value) || 0;
  p.proveedorId = document.getElementById('ep-prod-proveedor').value;
  saveDB();
  document.getElementById('modal-edit-prod').classList.remove('open');
  renderTablaProductos();
  showToast('Producto actualizado');
}

function eliminarProducto(id) {
  if (!confirm('¿Eliminar producto? Será ocultado del catálogo y no se sugerirán compras.')) return;
  const p = db.productos.find(x => x.id === id);
  if (p) p.deleted = true;
  saveDB();
  renderTablaProductos();
  renderProductGrid();
  showToast('Producto eliminado');
}

function guardarPreciosTodos() {
  document.querySelectorAll('#tabla-productos tr[data-pid]').forEach(row => {
    const pid = row.dataset.pid;
    const getVal = f => parseFloat(row.querySelector(`[data-f="${f}"]`)?.value) || 0;
    const isAlCosto = row.querySelector(`[data-f="alCosto"]`)?.checked || false;
    const fijo = getVal('fijo'), imp = getVal('imp'), gan = getVal('gan'), desc = getVal('desc');
    db.preciosExtra[pid] = { fijo, imp, gan, desc, alCosto: isAlCosto };
  });
  saveDB();
  renderTablaProductos();
  showToast('Precios guardados');
}

function abrirRetiroSocio() {
  const prods = '<option value="">— Seleccionar —</option>' + db.productos.filter(p => !p.deleted && getStock(p.id) > 0).map(p => `<option value="${p.id}">${p.nombre} (Stock: ${getStock(p.id)})</option>`).join('');
  document.getElementById('rs-prod').innerHTML = prods;
  document.getElementById('rs-qty').value = '';
  document.getElementById('modal-retiro-socio').classList.add('open');
}

function confirmarRetiroSocio() {
  const pid = document.getElementById('rs-prod').value;
  const qty = parseFloat(document.getElementById('rs-qty').value);
  const socioId = document.getElementById('rs-socio').value;
  const accion = document.getElementById('rs-accion').value;
  
  if (!pid || !qty || (accion === 'descontar' && !socioId)) return showToast('Completa los campos', 'error');
  if (qty > getStock(pid) + 0.001) return showToast('Stock insuficiente', 'error');
  
  const { costoTotal } = consumirPEPS(pid, qty);
  const p = db.productos.find(x => x.id === pid);
  
  if (accion === 'descontar') {
    db.movimientos.push({ id: Date.now().toString(), socioId, cuentaId: '', fecha: today(), tipo: 'retiro', importe: costoTotal, descripcion: 'Retiro mercadería: ' + p.nombre });
  } else {
    db.gastos.push({ id: Date.now().toString(), fecha: today(), categoria: 'Retiro Mercadería', tipo: 'variable', importe: costoTotal, cuentaId: 'c1', descripcion: 'Retiro (Gasto Negocio): ' + p.nombre });
  }
  
  saveDB();
  populateSelects();
  document.getElementById('modal-retiro-socio').classList.remove('open');
  renderTablaProductos();
  showToast('Retiro registrado correctamente');
}
/* ================= PROVEEDORES, GASTOS Y FINANZAS ================= */

function agregarProveedor() {
  const n = document.getElementById('prov-nombre').value.trim();
  if (!n) return;
  const getSel = id => Array.from(document.getElementById(id).selectedOptions).map(o => o.value);
  db.proveedores.push({ id: Date.now().toString(), nombre: n, contacto: document.getElementById('prov-contacto').value, tel: document.getElementById('prov-tel').value, diasPedido: getSel('prov-dias-pedido'), diasEntrega: getSel('prov-dias-entrega') });
  saveDB();
  renderTablaProveedores();
  populateSelects();
  showToast('Proveedor agregado');
}

function abrirEditarProv(id) {
  const p = db.proveedores.find(x => x.id === id);
  if (!p) return;
  document.getElementById('eprov-id').value = id;
  document.getElementById('eprov-nombre').value = p.nombre;
  document.getElementById('eprov-contacto').value = p.contacto || '';
  document.getElementById('eprov-tel').value = p.tel || '';
  Array.from(document.getElementById('eprov-dias-pedido').options).forEach(o => o.selected = (p.diasPedido || []).includes(o.value));
  Array.from(document.getElementById('eprov-dias-entrega').options).forEach(o => o.selected = (p.diasEntrega || []).includes(o.value));
  document.getElementById('modal-edit-prov').classList.add('open');
}

function guardarEditProv() {
  const p = db.proveedores.find(x => x.id === document.getElementById('eprov-id').value);
  if (!p) return;
  const getSel = id => Array.from(document.getElementById(id).selectedOptions).map(o => o.value);
  p.nombre = document.getElementById('eprov-nombre').value;
  p.contacto = document.getElementById('eprov-contacto').value;
  p.tel = document.getElementById('eprov-tel').value;
  p.diasPedido = getSel('eprov-dias-pedido');
  p.diasEntrega = getSel('eprov-dias-entrega');
  saveDB();
  document.getElementById('modal-edit-prov').classList.remove('open');
  renderTablaProveedores();
  showToast('Proveedor actualizado');
}

function registrarDeuda() {
  db.cuentasPorPagar.push({ id: Date.now().toString(), proveedorId: document.getElementById('deuda-prov').value, fecha: document.getElementById('deuda-fecha').value, monto: parseFloat(document.getElementById('deuda-monto').value), descripcion: document.getElementById('deuda-desc').value, pagado: false, pagos: [] });
  saveDB();
  populateSelects();
  renderTablaDeudas();
  showToast('Deuda registrada');
}

function confirmarPagoDeuda() {
  const dId = document.getElementById('pd-id').value;
  const m = parseFloat(document.getElementById('pd-monto').value);
  const cId = document.getElementById('pd-cuenta').value;
  const d = db.cuentasPorPagar.find(x => x.id === dId);
  if (!d || !m) return;
  const yaPagado = d.pagos.reduce((s, p) => s + p.monto, 0);
  if (m > d.monto - yaPagado + 0.01) return showToast('Monto excede deuda', 'error');
  
  d.pagos.push({ fecha: today(), monto: m, cuentaId: cId });
  d.pagado = (yaPagado + m >= d.monto - 0.01);
  saveDB();
  populateSelects();
  document.getElementById('modal-pago-deuda').classList.remove('open');
  renderTablaDeudas();
  showToast('Pago registrado');
}

function registrarGasto() {
  const f = document.getElementById('gasto-fecha').value;
  const imp = parseFloat(document.getElementById('gasto-importe').value);
  if (!f || !imp) return;
  db.gastos.push({ id: Date.now().toString(), fecha: f, categoria: document.getElementById('gasto-cat').value, tipo: document.getElementById('gasto-tipo').value, importe: imp, cuentaId: document.getElementById('gasto-cuenta').value, descripcion: document.getElementById('gasto-desc').value });
  saveDB();
  populateSelects();
  renderTablaGastos();
  showToast('Gasto ok');
}

function crearCuenta() {
  const n = document.getElementById('nueva-cta-nombre').value.trim();
  const s = parseFloat(document.getElementById('nueva-cta-saldo').value) || 0;
  if (!n) return;
  db.cuentas.push({ id: 'c' + Date.now(), nombre: n, saldoInicial: s });
  saveDB();
  renderCuentas();
  populateSelects();
  document.getElementById('nueva-cta-nombre').value = '';
}

function ajustarCaja(cId, inputEl) {
  const real = parseFloat(inputEl.value);
  const sis = calcSaldoCuenta(cId);
  if (isNaN(real) || Math.abs(real - sis) < 0.01) return;
  const dif = real - sis;
  db.ajustesCaja.push({ id: Date.now().toString(), cuentaId: cId, fecha: today(), diferencia: dif, tipo: dif > 0 ? 'ingreso' : 'perdida' });
  saveDB();
  populateSelects();
  renderCuentas();
  renderFinanzasTotales();
  showToast(`Ajuste de ${fmt(dif)} guardado`);
}


/* ================= SOCIOS Y MOVIMIENTOS ================= */

function agregarSocio() {
  const n = document.getElementById('socio-nombre').value.trim();
  const d = document.getElementById('socio-dni').value.trim();
  if (!n || !d) { showToast('Nombre y DNI obligatorios', 'error'); return; }
  let exist = db.socios.find(s => s.dni === d);
  if (exist && !exist.deleted) return showToast('El DNI ya pertenece a un socio', 'error');
  if (exist && exist.deleted) { exist.deleted = false; exist.nombre = n; showToast('Socio reactivado'); }
  else { db.socios.push({ id: Date.now().toString(), nombre: n, dni: d, deleted: false }); showToast('Socio agregado'); }
  saveDB();
  document.getElementById('socio-nombre').value = '';
  document.getElementById('socio-dni').value = '';
  renderSocios();
  populateSelects();
}

function eliminarSocio(id) {
  const s = db.socios.find(x => x.id === id);
  if (!s) return;
  if (Math.abs(calcSaldoSocio(id)) > 0.01) return showToast('El saldo debe ser exactamente $0 para eliminarlo.', 'error');
  if (!confirm('¿Eliminar al socio ' + s.nombre + '?')) return;
  s.deleted = true;
  saveDB();
  renderSocios();
  populateSelects();
  showToast('Socio ocultado (Borrado Lógico)');
}

function registrarMovimientoSocio() {
  const sId = document.getElementById('mov-socio').value;
  const t = document.getElementById('mov-tipo').value;
  const imp = parseFloat(document.getElementById('mov-importe').value);
  const cId = document.getElementById('mov-cuenta').value;
  
  if (!imp) return showToast('Monto inválido', 'error');
  
  if (t === 'reinversion') {
    const dispGlobal = calcGananciaSinAsignar();
    if (imp > dispGlobal + 0.01) return showToast('Monto supera la Ganancia Sin Asignar de la empresa', 'error');
    db.movimientos.push({ id: Date.now().toString(), socioId: null, cuentaId: '', fecha: document.getElementById('mov-fecha').value, tipo: t, importe: imp, descripcion: 'Reinversión al Capital Propio' });
    showToast('Capital reinvertido en la empresa');
  } else {
    if (!sId) return showToast('Seleccione un socio', 'error');
    const sName = db.socios.find(x => x.id === sId).nombre;
    
    if (t === 'asignacion') {
      const dispGlobal = calcGananciaSinAsignar();
      if (imp > dispGlobal + 0.01) return showToast('Monto supera la Ganancia Sin Asignar', 'error');
      db.movimientos.push({ id: Date.now().toString(), socioId: sId, cuentaId: '', fecha: document.getElementById('mov-fecha').value, tipo: t, importe: imp, descripcion: 'Asignación de Ganancias a ' + sName });
      showToast('Ganancia asignada al saldo del socio');
    } else if (t === 'retiro') {
      db.movimientos.push({ id: Date.now().toString(), socioId: sId, cuentaId: cId, fecha: document.getElementById('mov-fecha').value, tipo: t, importe: imp, descripcion: 'Retiro de Fondos / Préstamo a ' + sName });
      showToast('Retiro de fondos registrado');
    } else if (t === 'deposito') {
      db.movimientos.push({ id: Date.now().toString(), socioId: sId, cuentaId: cId, fecha: document.getElementById('mov-fecha').value, tipo: t, importe: imp, descripcion: 'Aporte/Devolución de ' + sName });
      showToast('Aporte de capital registrado');
    }
  }
  saveDB();
  populateSelects();
  renderSocios();
  renderFinanzasTotales();
  document.getElementById('mov-importe').value = '';
}
/* ================= VISTAS Y RENDERIZADO ================= */

function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  
  if (id === 'pos') { renderProductGrid(); setTimeout(() => document.getElementById('pos-barcode').focus(), 80); }
  if (id === 'stock') renderTablaProductos();
  if (id === 'ventas') renderTablaVentas();
  if (id === 'proveedores') { renderTablaProveedores(); renderTablaDeudas(); }
  if (id === 'gastos') renderTablaGastos();
  if (id === 'finanzas') { renderCuentas(); renderFinanzasTotales(); renderCashflow(); }
  if (id === 'socios') renderSocios();
  if (id === 'indicadores') renderIndicadores();
  if (id === 'informes') { document.getElementById('inf-desde').value = new Date(new Date().setDate(1)).toISOString().slice(0, 10); document.getElementById('inf-hasta').value = today(); showInfTab('resumen', document.querySelector('.tab-pill')); }
  if (id === 'config') cargarConfig();
}

function showProvTab(id, btn) {
  document.querySelectorAll('.prov-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('#sec-proveedores .tab-pill').forEach(b => b.classList.remove('active'));
  document.getElementById('prov-' + id).style.display = 'block';
  btn.classList.add('active');
}

function showInfTab(id, btn) {
  document.querySelectorAll('.inf-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('#sec-informes .tab-pill').forEach(b => b.classList.remove('active'));
  document.getElementById('inf-' + id).style.display = 'block';
  btn.classList.add('active');
}

function renderCarrito() {
  const c = document.getElementById('cart-items');
  if (!carrito.length) {
    c.innerHTML = '<div style="padding:2rem 1rem;text-align:center;color:var(--muted);font-size:.82rem;">Seleccioná productos</div>';
    document.getElementById('cart-total').textContent = '$0';
    document.getElementById('cart-desc-row').style.display = 'none';
    document.getElementById('cart-total-sin-desc-row').style.display = 'none';
    return;
  }
  let totB = 0;
  c.innerHTML = carrito.map((i, idx) => {
    const s = i.cantidad * i.precioVenta;
    totB += s;
    return `<div class="cart-item">
      <div>
        <div class="cart-item-name">${i.nombre}</div>
        <div style="font-size:.69rem;color:var(--muted);">${fmt(i.precioVenta)} × ${fmtQty(i.cantidad, i.unidad)}</div>
      </div>
      <div style="text-align:right;">
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="cambiarQtyCarrito(${idx},-1)">−</button>
          <input type="number" class="mono" value="${i.cantidad}" onchange="setQtyCarrito(${idx},this.value)" style="width:50px;text-align:center;padding:.2rem;margin:0 .2rem;">
          <button class="qty-btn" onclick="cambiarQtyCarrito(${idx},1)">+</button>
        </div>
        <div class="mono" style="font-size:.75rem;margin-top:.18rem;">${fmt(s)}</div>
        <button onclick="quitarDeCarrito(${idx})" style="font-size:.68rem;color:var(--accent);background:none;border:none;cursor:pointer;margin-top:2px;">✕</button>
      </div>
    </div>`;
  }).join('');
  
  const desc = calcDescEfectivo();
  const totF = totB - desc;
  
  if (desc > 0) {
    document.getElementById('cart-desc-row').style.display = 'block';
    document.getElementById('cart-desc-row').textContent = `💵 Descuento ${db.config.descEfectivo}%: −${fmt(desc)}`;
    document.getElementById('cart-total-sin-desc-row').style.display = 'flex';
    document.getElementById('cart-total-sin-desc').textContent = fmt(totB);
  } else {
    document.getElementById('cart-desc-row').style.display = 'none';
    document.getElementById('cart-total-sin-desc-row').style.display = 'none';
  }
  document.getElementById('cart-total').textContent = fmt(totF);
}

function renderProductGrid() {
  const f = (document.getElementById('pos-search').value || '').toLowerCase();
  const grid = document.getElementById('product-grid');
  let ps = db.productos.filter(p => !p.deleted);
  if (f) ps = ps.filter(p => p.nombre.toLowerCase().includes(f) || p.barcode?.includes(f) || p.codigo.toLowerCase().includes(f));
  grid.innerHTML = ps.map(p => {
    const s = getStock(p.id);
    return `<div class="product-card" onclick="abrirModalQty('${p.id}')">
      <div class="pname">${p.nombre}</div>
      <div style="font-family:'DM Mono',font-size:.7rem;color:${s > 0 ? 'var(--green)' : 'var(--accent)'}">${s > 0 ? fmtQty(s, p.unidad) : 'Sin stock'}</div>
    </div>`;
  }).join('');
}

function renderTablaProductos() {
  const f = (document.getElementById('stock-search').value || '').toLowerCase();
  const tb = document.getElementById('tabla-productos');
  let ps = db.productos.filter(p => !p.deleted);
  if (f) ps = ps.filter(p => p.nombre.toLowerCase().includes(f) || p.codigo.toLowerCase().includes(f));
  
  tb.innerHTML = ps.map(p => {
    const pv = db.proveedores.find(x => x.id === p.proveedorId)?.nombre || '';
    const st = getStock(p.id);
    const ex = db.preciosExtra[p.id] || {};
    const ca = getCostoActual(p.id);
    return `<tr data-pid="${p.id}">
      <td>${pv}</td>
      <td class="mono" style="font-size:.7rem">${p.codigo}</td>
      <td><strong>${p.nombre}</strong></td>
      <td>${p.unidad}</td>
      <td class="mono">${p.stockMinimo || 0}</td>
      <td class="mono" style="color:${st <= (p.stockMinimo || 0) ? 'var(--accent)' : 'inherit'}">${fmtQty(st, p.unidad)}</td>
      <td class="mono">${fmt(ca)}</td>
      <td><input class="edit-inline" data-f="fijo" value="${ex.fijo || 0}" oninput="recalcInline(this)"></td>
      <td><input class="edit-inline" data-f="imp" value="${ex.imp || 0}" oninput="recalcInline(this)"></td>
      <td><input class="edit-inline" data-f="gan" value="${ex.gan || 30}" oninput="recalcInline(this)"></td>
      <td><input class="edit-inline" data-f="desc" value="${ex.desc || 0}" oninput="recalcInline(this)"></td>
      <td style="text-align:center;"><input type="checkbox" data-f="alCosto" ${ex.alCosto ? 'checked' : ''} onchange="recalcInline(this)"></td>
      <td class="mono" id="pf-${p.id}"><strong>${fmt(calcPrecioFinal(p.id))}</strong></td>
      <td style="white-space:nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="abrirEditarProd('${p.id}')">✏</button> 
        <button class="btn btn-danger btn-sm" onclick="eliminarProducto('${p.id}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function recalcInline(inp) {
  const tr = inp.closest('tr');
  const pId = tr.dataset.pid;
  const c = getCostoActual(pId);
  if (!c) return;
  const v = f => parseFloat(tr.querySelector(`[data-f="${f}"]`)?.value) || 0;
  const alCosto = tr.querySelector(`[data-f="alCosto"]`)?.checked || false;
  let raw = 0;
  if (alCosto) {
    raw = (c + v('fijo')) * (1 + v('imp') / 100);
  } else {
    raw = (c + v('fijo')) * (1 + v('imp') / 100) * (1 + v('gan') / 100) * (1 - v('desc') / 100);
  }
  tr.querySelector(`#pf-${pId}`).innerHTML = `<strong>${fmt(roundUp10(raw))}</strong>`;
}

function renderTablaVentas() {
  const tb = document.getElementById('tabla-ventas-menu');
  const vts = [...db.ventas].reverse();
  tb.innerHTML = vts.map(v => `<tr>
    <td class="mono">${new Date(v.timestamp).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td>
    <td style="font-size:.78rem;">${db.ventaItems.filter(i => i.ventaId === v.id).map(i => i.nombre).join(', ')}</td>
    <td class="mono">${fmt(v.totalVenta)}</td>
    <td class="mono">${v.descEfectivo > 0 ? fmt(v.descEfectivo) : '—'}</td>
    <td><span class="badge badge-ink">${v.medioPago}</span></td>
    <td><input type="checkbox" ${v.facturada ? 'checked' : ''} onchange="db.ventas.find(x=>x.id==='${v.id}').facturada=this.checked;saveDB();"></td>
  </tr>`).join('');
}

function renderTablaProveedores() {
  document.getElementById('tabla-proveedores-container').innerHTML = db.proveedores.map(p => `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:start;">
      <div class="card-title" style="margin-bottom:0;border:none;">${p.nombre}</div>
      <button class="btn btn-secondary btn-sm" onclick="abrirEditarProv('${p.id}')">✏ Editar</button>
    </div>
    <div style="font-size:.8rem;color:var(--muted)">📞 ${p.tel || '—'} | Días pedido: ${(p.diasPedido || []).map(d => DIAS_SEMANA[d]).join(', ') || '—'} | Entrega: ${(p.diasEntrega || []).map(d => DIAS_SEMANA[d]).join(', ') || '—'}</div>
  </div>`).join('');
}

function renderTablaDeudas() {
  document.getElementById('tabla-deudas').innerHTML = db.cuentasPorPagar.filter(d => !d.pagado).map(d => {
    const pv = db.proveedores.find(x => x.id === d.proveedorId)?.nombre;
    const pag = d.pagos.reduce((s, p) => s + p.monto, 0);
    const falta = d.monto - pag;
    return `<tr>
      <td class="mono">${fmtFecha(d.fecha)}</td>
      <td>${pv}</td>
      <td>${d.descripcion}</td>
      <td class="mono">${fmt(d.monto)}</td>
      <td class="mono" style="color:var(--accent);font-weight:600;">${fmt(falta)}</td>
      <td><button class="btn btn-green btn-sm" onclick="abrirPagoDeuda('${d.id}')">Pagar</button></td>
    </tr>`;
  }).join('');
}

function renderTablaGastos() {
  document.getElementById('tabla-gastos').innerHTML = [...db.gastos].reverse().map(g => `<tr>
    <td class="mono">${fmtFecha(g.fecha)}</td>
    <td>${g.categoria}</td>
    <td><span class="badge ${g.tipo === 'fijo' ? 'badge-purple' : 'badge-ink'}">${g.tipo}</span></td>
    <td>${g.descripcion || '—'}</td>
    <td class="mono">${fmt(g.importe)}</td>
    <td>${db.cuentas.find(x => x.id === g.cuentaId)?.nombre || '—'}</td>
    <td><button class="btn btn-danger btn-sm" onclick="if(confirm('Eliminar?')){db.gastos=db.gastos.filter(x=>x.id!=='${g.id}');saveDB();renderTablaGastos();renderFinanzasTotales();populateSelects();}">✕</button></td>
  </tr>`).join('');
}

function renderCuentas() {
  document.getElementById('lista-cuentas').innerHTML = db.cuentas.map(c => `<div class="account-card">
    <div class="account-name">${c.nombre}</div>
    <div class="account-bal">${fmt(calcSaldoCuenta(c.id))} <span style="font-size:.7rem;color:var(--muted);font-weight:400;font-family:'DM Sans'">Sistema</span></div>
    <div style="display:flex;gap:.3rem;margin-top:.5rem;">
      <input type="number" placeholder="Saldo Real" id="real-${c.id}" style="padding:.3rem;font-size:.8rem;">
      <button class="btn btn-secondary btn-sm" onclick="ajustarCaja('${c.id}', document.getElementById('real-${c.id}'))">Ajustar</button>
    </div>
  </div>`).join('');
}

function renderFinanzasTotales() {
  document.getElementById('fin-capital').textContent = fmt(getPatrimonioNeto() - calcGananciaNetaGlobal());
  document.getElementById('fin-ganancia').textContent = fmt(calcGananciaSinAsignar());
  document.getElementById('fin-liquidez').textContent = fmt(db.cuentas.reduce((s, c) => s + calcSaldoCuenta(c.id), 0));
}

function renderSocios() {
  document.getElementById('soc-neta').textContent = fmt(calcGananciaNetaGlobal());
  document.getElementById('soc-disp').textContent = fmt(calcGananciaSinAsignar());
  
  document.getElementById('lista-socios').innerHTML = db.socios.filter(s => !s.deleted).map(s => {
    const saldo = calcSaldoSocio(s.id);
    return `<div style="display:inline-flex;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:.3rem .6rem;margin:.2rem;font-size:.85rem;">
      <span style="font-weight:600;margin-right:.5rem;">${s.nombre}</span> 
      <span class="badge ${saldo >= 0 ? 'badge-green' : 'badge-red'}">Saldo: ${fmt(saldo)}</span>
      <button onclick="eliminarSocio('${s.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;margin-left:.4rem;font-weight:600;" title="Ocultar (Borrado Lógico)">✕</button>
    </div>`;
  }).join('');
}

function renderIndicadores() {
  const caja = db.cuentas.reduce((s, c) => s + calcSaldoCuenta(c.id), 0);
  const stockV = db.productos.filter(p => !p.deleted).reduce((s, p) => s + (getStock(p.id) * getCostoActual(p.id)), 0);
  const pasivosCom = db.cuentasPorPagar.filter(d => !d.pagado).reduce((s, d) => s + (d.monto - (d.pagos || []).reduce((x, p) => x + p.monto, 0)), 0);
  
  let pasivoSocios = 0; 
  let activoSocios = 0;
  
  db.socios.forEach(s => { 
    let saldo = calcSaldoSocio(s.id); 
    if (saldo > 0) pasivoSocios += saldo; 
    if (saldo < 0) activoSocios += Math.abs(saldo); 
  });
  
  const patrimonio = caja + stockV + activoSocios - pasivosCom - pasivoSocios;
  
  const mesActual = today().slice(0, 7);
  const gfijos = db.gastos.filter(g => g.tipo === 'fijo' && g.fecha.startsWith(mesActual)).reduce((s, g) => s + g.importe, 0);
  const vtasM = db.ventas.filter(v => v.fecha.startsWith(mesActual)).reduce((s, v) => s + v.totalVenta, 0);
  const costM = db.ventas.filter(v => v.fecha.startsWith(mesActual)).reduce((s, v) => s + v.totalCosto, 0);
  const mgProm = vtasM > 0 ? (vtasM - costM) / vtasM : 0; 
  const pEq = mgProm > 0 ? gfijos / mgProm : 0;
  
  const cmvTotal = db.ventaItems.reduce((s, vi) => s + vi.costoTotal, 0); 
  const rotacion = stockV > 0 ? (cmvTotal / stockV).toFixed(1) : 0;
  const rentabilidad = (patrimonio - calcGananciaNetaGlobal()) > 0 ? (calcGananciaNetaGlobal() / (patrimonio - calcGananciaNetaGlobal())) * 100 : 0;
  
  document.getElementById('dash-indicadores').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Patrimonio Neto</div>
      <div class="stat-value">${fmt(patrimonio)}</div>
      <div class="stat-sub">Activos (Caja+Stock+Préstamos: ${fmt(caja + stockV + activoSocios)})<br>− Pasivos (Comercial+Saldos Socios: ${fmt(pasivosCom + pasivoSocios)})</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Punto de Equilibrio (Mes)</div>
      <div class="stat-value">${fmt(pEq)}</div>
      <div class="stat-sub">Ventas necesarias para cubrir los ${fmt(gfijos)} de Gastos Fijos mensuales.</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Rotación de Inventario</div>
      <div class="stat-value">${rotacion}x</div>
      <div class="stat-sub">Veces que renovaste tu stock actual (CMV / Valor Stock)</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Rentabilidad sobre Capital</div>
      <div class="stat-value">${rentabilidad.toFixed(1)}%</div>
      <div class="stat-sub">Ganancia Global / Capital Propio Inicial</div>
    </div>`;
}

function renderCashflow() {
  const ctx = document.getElementById('chart-cashflow'); 
  if (!ctx) return; 
  if (chartCashflow) chartCashflow.destroy();
  
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i); return d.toISOString().slice(0, 10);
  });
  
  const ing = days.map(d => 
    db.ventas.filter(v => v.fecha === d).reduce((s, v) => s + v.totalVenta, 0) + 
    db.movimientos.filter(m => m.fecha === d && m.tipo === 'deposito').reduce((s, m) => s + m.importe, 0) + 
    db.ajustesCaja.filter(a => a.fecha === d && a.tipo === 'ingreso').reduce((s, a) => s + a.diferencia, 0)
  );
  
  const egr = days.map(d => 
    db.gastos.filter(g => g.fecha === d).reduce((s, g) => s + g.importe, 0) + 
    db.cuentasPorPagar.reduce((s, deuda) => s + (deuda.pagos || []).filter(p => p.fecha === d).reduce((x, p) => x + p.monto, 0), 0) + 
    db.lotes.filter(l => l.fecha === d && l.cuentaId).reduce((s, l) => s + (l.cantOriginal * l.costoUnit), 0) + 
    db.movimientos.filter(m => m.fecha === d && m.tipo === 'retiro').reduce((s, m) => s + m.importe, 0) + 
    db.ajustesCaja.filter(a => a.fecha === d && a.tipo === 'perdida').reduce((s, a) => s + Math.abs(a.diferencia), 0)
  );
  
  chartCashflow = new Chart(ctx, { 
    type: 'bar', 
    data: {
      labels: days.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)), 
      datasets: [
        { label: 'Ingresos Reales (Caja)', data: ing, backgroundColor: 'rgba(42,107,60,.8)' },
        { label: 'Egresos Reales (Gastos+Compras pagadas)', data: egr, backgroundColor: 'rgba(196,67,42,.8)' }
      ]
    }, 
    options: { responsive: true, maintainAspectRatio: false } 
  });
}

// Etiquetador Patrimonial
function etiq(nombreCuenta, tipo, isDebe) {
  let marca = '';
  if (tipo === 'A') marca = isDebe ? '(+A)' : '(-A)';
  else if (tipo === 'P') marca = isDebe ? '(-P)' : '(+P)';
  else if (tipo === 'PN') marca = isDebe ? '(-PN)' : '(+PN)';
  else if (tipo === 'R+') marca = isDebe ? '(-R+)' : '(+R+)';
  else if (tipo === 'R-') marca = isDebe ? '(+R-)' : '(-R-)';
  else if (tipo === 'P/A') marca = isDebe ? '(-P/+A)' : '(+P/-A)'; 
  return `${marca} ${nombreCuenta}`;
}

function generarInforme() {
  const d = document.getElementById('inf-desde').value;
  const h = document.getElementById('inf-hasta').value;
  
  // Resumen
  const vts = db.ventas.filter(v => v.fecha >= d && v.fecha <= h);
  const vIng = vts.reduce((s, v) => s + v.totalVenta, 0);
  const vCosto = vts.reduce((s, v) => s + v.totalCosto, 0);
  
  document.getElementById('stat-grid').innerHTML = `
    <div class="stat-card"><div class="stat-label">Ventas Periodo</div><div class="stat-value">${fmt(vIng)}</div></div>
    <div class="stat-card"><div class="stat-label">Costo (CMV)</div><div class="stat-value">${fmt(vCosto)}</div></div>
    <div class="stat-card"><div class="stat-label">Margen Bruto</div><div class="stat-value">${fmt(vIng - vCosto)}</div><div class="stat-sub">${vIng > 0 ? ((vIng - vCosto) / vIng * 100).toFixed(1) : 0}%</div></div>
  `;
  document.getElementById('tabla-inf-ventas').innerHTML = vts.map(v => `<tr><td class="mono">${fmtFecha(v.fecha)}</td><td>${db.ventaItems.filter(i => i.ventaId === v.id).map(i => i.nombre).join(', ')}</td><td class="mono">${fmt(v.totalCosto)}</td><td class="mono">${fmt(v.totalVenta)}</td><td class="mono">${fmt(v.totalVenta - v.totalCosto)}</td></tr>`).join('');
  
  // Libro Diario Generador Automático
  let asientos = [];
  
  // Agrupar Ventas por Día
  const ventasPorDia = {};
  db.ventas.filter(v => v.fecha >= d && v.fecha <= h).forEach(v => {
    if (!ventasPorDia[v.fecha]) ventasPorDia[v.fecha] = { cuentas: {}, totalVenta: 0, totalCosto: 0 };
    if (!ventasPorDia[v.fecha].cuentas[v.cuentaId]) ventasPorDia[v.fecha].cuentas[v.cuentaId] = 0;
    ventasPorDia[v.fecha].cuentas[v.cuentaId] += v.totalVenta;
    ventasPorDia[v.fecha].totalVenta += v.totalVenta;
    ventasPorDia[v.fecha].totalCosto += v.totalCosto;
  });
  
  Object.keys(ventasPorDia).forEach(fecha => {
    const vd = ventasPorDia[fecha];
    let ls = [];
    Object.keys(vd.cuentas).forEach(cId => {
      let cName = db.cuentas.find(x => x.id === cId)?.nombre || 'Caja';
      ls.push({ c: etiq(cName, 'A', true), d: vd.cuentas[cId], h: 0 });
    });
    if (vd.totalCosto > 0) ls.push({ c: etiq('Costo Mercaderías (CMV)', 'R-', true), d: vd.totalCosto, h: 0 });
    ls.push({ c: etiq('Ventas', 'R+', false), d: 0, h: vd.totalVenta });
    if (vd.totalCosto > 0) ls.push({ c: etiq('Mercadería', 'A', false), d: 0, h: vd.totalCosto });
    asientos.push({ f: fecha + 'T23:59', r: 'Ventas Agrupadas del Día', ls: ls });
  });

  // Compras
  db.lotes.filter(l => l.fecha >= d && l.fecha <= h).forEach(l => {
    let p = db.productos.find(x => x.id === l.productoId);
    let m = l.cantOriginal * l.costoUnit; 
    let ls = [{ c: etiq('Mercadería', 'A', true), d: m, h: 0 }];
    if (l.cuentaId) {
      let cName = db.cuentas.find(c => c.id === l.cuentaId)?.nombre || 'Caja';
      ls.push({ c: etiq(cName, 'A', false), d: 0, h: m });
    } else {
      ls.push({ c: etiq('Proveedores (Comercial)', 'P', false), d: 0, h: m });
    }
    asientos.push({ f: l.fecha + 'T00:01', r: 'Compra: ' + (p ? p.nombre : 'Genérica'), ls: ls });
  });

  // Pagos a Deudas
  db.cuentasPorPagar.forEach(deuda => {
    (deuda.pagos || []).filter(p => p.fecha >= d && p.fecha <= h).forEach(p => {
      let cName = db.cuentas.find(x => x.id === p.cuentaId)?.nombre || 'Caja';
      asientos.push({ f: p.fecha + 'T00:02', r: 'Pago a Proveedor', ls: [
        { c: etiq('Proveedores (Comercial)', 'P', true), d: p.monto, h: 0 }, 
        { c: etiq(cName, 'A', false), d: 0, h: p.monto }
      ] });
    });
  });

  // Gastos
  db.gastos.filter(g => g.fecha >= d && g.fecha <= h).forEach(g => {
    let cName = db.cuentas.find(x => x.id === g.cuentaId)?.nombre || 'Caja';
    asientos.push({ f: g.fecha + 'T00:03', r: 'Registro de Gasto', ls: [
      { c: etiq('Gastos - ' + g.categoria, 'R-', true), d: g.importe, h: 0 }, 
      { c: etiq(cName, 'A', false), d: 0, h: g.importe }
    ] });
  });

  // Movimientos Socios
  db.movimientos.filter(m => m.fecha >= d && m.fecha <= h).forEach(m => {
    let s = db.socios.find(x => x.id === m.socioId)?.nombre || 'Socio Desconocido'; 
    let cName = db.cuentas.find(x => x.id === m.cuentaId)?.nombre || 'Caja';
    
    if (m.tipo === 'retiro') {
      asientos.push({ f: m.fecha + 'T00:04', r: 'Retiro / Préstamo Socio', ls: [
        { c: etiq('Cuenta Particular: ' + s, 'P/A', true), d: m.importe, h: 0 }, 
        { c: etiq(cName, 'A', false), d: 0, h: m.importe }
      ] });
    }
    if (m.tipo === 'deposito') {
      asientos.push({ f: m.fecha + 'T00:04', r: 'Aporte / Devolución Préstamo', ls: [
        { c: etiq(cName, 'A', true), d: m.importe, h: 0 }, 
        { c: etiq('Cuenta Particular: ' + s, 'P/A', false), d: 0, h: m.importe }
      ] });
    }
    if (m.tipo === 'asignacion') {
      asientos.push({ f: m.fecha + 'T00:04', r: 'Asignación Utilidades', ls: [
        { c: etiq('Resultados Acumulados', 'PN', true), d: m.importe, h: 0 }, 
        { c: etiq('Cuenta Particular: ' + s, 'P/A', false), d: 0, h: m.importe }
      ] });
    }
    if (m.tipo === 'reinversion') {
      asientos.push({ f: m.fecha + 'T00:04', r: 'Reinversión Utilidades', ls: [
        { c: etiq('Resultados Acumulados', 'PN', true), d: m.importe, h: 0 }, 
        { c: etiq('Capital Social Re-invertido', 'PN', false), d: 0, h: m.importe }
      ] });
    }
  });

  // Ajustes de Caja
  db.ajustesCaja.filter(a => a.fecha >= d && a.fecha <= h).forEach(a => {
    let cName = db.cuentas.find(x => x.id === a.cuentaId)?.nombre || 'Caja';
    if (a.tipo === 'ingreso') {
      asientos.push({ f: a.fecha + 'T00:05', r: 'Sobrante de Caja Detectado', ls: [
        { c: etiq(cName, 'A', true), d: a.diferencia, h: 0 }, 
        { c: etiq('Ajuste Caja (Ganancia)', 'R+', false), d: 0, h: a.diferencia }
      ] });
    } else {
      asientos.push({ f: a.fecha + 'T00:05', r: 'Faltante de Caja Detectado', ls: [
        { c: etiq('Ajuste Caja (Pérdida)', 'R-', true), d: Math.abs(a.diferencia), h: 0 }, 
        { c: etiq(cName, 'A', false), d: 0, h: Math.abs(a.diferencia) }
      ] });
    }
  });
  
  asientos.sort((a, b) => a.f.localeCompare(b.f));
  
  let htmlDiario = ''; 
  let tDebe = 0; 
  let tHaber = 0;
  
  asientos.forEach(as => {
    htmlDiario += `<tr class="diario-header"><td class="mono" colspan="4">${fmtFecha(as.f)} | 📑 ${as.r}</td></tr>`;
    as.ls.forEach(linea => {
      tDebe += linea.d; tHaber += linea.h;
      htmlDiario += `<tr class="diario-row">
        <td style="width:15%"></td>
        <td class="diario-cuenta ${linea.h > 0 ? 'haber' : ''}">${linea.c}</td>
        <td class="mono" style="text-align:right; font-weight:600; color:var(--blue);">${linea.d > 0 ? fmt(linea.d) : ''}</td>
        <td class="mono" style="text-align:right; font-weight:600; color:var(--accent);">${linea.h > 0 ? fmt(linea.h) : ''}</td>
      </tr>`;
    });
  });
  
  if (asientos.length === 0) {
    htmlDiario = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:2rem;">No hay registros contables en este período</td></tr>';
  } else {
    htmlDiario += `<tr style="font-weight:900;background:var(--amber-light);border-top:2px solid var(--amber);">
      <td colspan="2" style="text-align:right">TOTALES PERÍODO</td>
      <td class="mono" style="text-align:right;">${fmt(tDebe)}</td>
      <td class="mono" style="text-align:right;">${fmt(tHaber)}</td>
    </tr>`;
  }
  
  document.getElementById('tabla-diario').innerHTML = htmlDiario;
  document.getElementById('informe-body').style.display = 'block';
}

function generarPDFPedidos() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const cfg = db.config;
  let y = 15;
  
  if (cfg.logo) {
    try {
      const imgProps = doc.getImageProperties(cfg.logo);
      const ratio = imgProps.width / imgProps.height;
      const w = 22 * ratio;
      doc.addImage(cfg.logo, 'PNG', 10, y - 5, w, 22);
      y += 20;
    } catch (e) {}
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Pedidos Sugeridos (Reposición)', cfg.logo ? 35 : 105, y, { align: cfg.logo ? 'left' : 'center' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Fecha: ' + new Date().toLocaleDateString('es-AR'), cfg.logo ? 35 : 105, y, { align: cfg.logo ? 'left' : 'center' });
  y += 10;
  
  const aPedir = {};
  db.productos.filter(p => !p.deleted).forEach(p => {
    const st = getStock(p.id);
    const min = parseFloat(p.stockMinimo);
    let umbral = min;
    
    if (isNaN(umbral)) {
      const v30 = db.ventaItems.filter(vi => vi.productoId === p.id && db.ventas.find(v => v.id === vi.ventaId && new Date(v.timestamp) > new Date(Date.now() - 30 * 86400000))).reduce((s, vi) => s + vi.cantidad, 0);
      umbral = Math.ceil(v30 / 4);
    }
    
    if (st <= umbral && umbral > 0) {
      const prov = db.proveedores.find(x => x.id === p.proveedorId);
      const provN = prov ? prov.nombre : 'Sin Proveedor';
      if (!aPedir[provN]) aPedir[provN] = { diasP: prov ? prov.diasPedido : [], items: [] };
      aPedir[provN].items.push([p.nombre, p.marca || '-', fmtQty(st, p.unidad), fmtQty(umbral, p.unidad), fmtQty(umbral - st > 0 ? umbral - st : 1, p.unidad)]);
    }
  });

  const hoyDia = new Date().getDay();
  Object.entries(aPedir).forEach(([prov, data]) => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 22, 18);
    
    let sug = '';
    if (data.diasP.length > 0) {
      const dpNum = data.diasP.map(Number);
      let sigDia = dpNum.find(d => d >= hoyDia);
      if (sigDia === undefined) sigDia = dpNum[0];
      const diff = sigDia >= hoyDia ? sigDia - hoyDia : (7 - hoyDia) + sigDia;
      const dPed = new Date();
      dPed.setDate(dPed.getDate() + diff);
      sug = ` (Próx. pedido: ${DIAS_SEMANA[sigDia]} ${dPed.toLocaleDateString('es-AR')})`;
    }
    
    doc.text(`Proveedor: ${prov}${sug}`, 10, y);
    y += 3;
    doc.autoTable({ startY: y, head: [['Producto', 'Marca', 'Stock Actual', 'Stock Minimo', 'Sugerido a Comprar']], body: data.items, styles: { fontSize: 8 }, headStyles: { fillColor: [26, 22, 18] } });
    y = doc.lastAutoTable.finalY + 10;
  });
  
  if (Object.keys(aPedir).length === 0) doc.text('No hay productos por debajo del stock mínimo.', 10, y);
  
  doc.save('pedidos-' + today() + '.pdf');
  showToast('PDF Pedidos descargado');
}

function generarListaPrecios() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const cfg = db.config;
  let y = 15;
  
  if (cfg.logo) {
    try {
      const imgProps = doc.getImageProperties(cfg.logo);
      const ratio = imgProps.width / imgProps.height;
      const w = 22 * ratio;
      doc.addImage(cfg.logo, 'PNG', 105 - w / 2, y - 5, w, 22);
      y += 24;
    } catch (e) {}
  }
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(cfg.nombre || 'Lista de Precios', 105, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (cfg.direccion) { doc.text(cfg.direccion, 105, y, { align: 'center' }); y += 5; }
  if (cfg.tel || cfg.ig || cfg.fb) { doc.text([cfg.tel, cfg.ig, cfg.fb].filter(Boolean).join(' | '), 105, y, { align: 'center' }); y += 5; }
  doc.text('Fecha: ' + new Date().toLocaleDateString('es-AR'), 105, y, { align: 'center' });
  y += 10;
  
  const rows = db.productos.filter(p => !p.deleted).map(p => [p.nombre.substring(0, 40), p.marca || '', fmt(calcPrecioFinal(p.id))]);
  doc.autoTable({ startY: y, head: [['Producto', 'Marca', 'Precio']], body: rows, headStyles: { fillColor: [26, 22, 18] } });
  doc.save('precios-' + today() + '.pdf');
}

// -- Helpers Config & Selects --

function populateSelects() {
  const provs = '<option value="">— Seleccionar —</option>' + db.proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  document.querySelectorAll('#np-proveedor, #ep-prod-proveedor, #deuda-prov').forEach(s => { const val = s.value; s.innerHTML = provs; s.value = val; });
  
  const ctas = db.cuentas.map(c => `<option value="${c.id}">${c.nombre} (${fmt(calcSaldoCuenta(c.id))})</option>`).join('');
  document.querySelectorAll('#comp-cuenta, #pd-cuenta, #gasto-cuenta, #mov-cuenta').forEach(s => { const val = s.value; s.innerHTML = ctas; s.value = val || (db.cuentas[0] ? db.cuentas[0].id : ''); });
  
  const socs = '<option value="">— Seleccionar —</option>' + db.socios.filter(s => !s.deleted).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
  document.querySelectorAll('#mov-socio, #rs-socio').forEach(s => { const val = s.value; s.innerHTML = socs; s.value = val; });
  
  document.getElementById('medios-pago-btns').innerHTML = db.cuentas.map(c => `<button class="medio-btn${c.id === medioSeleccionado ? ' selected' : ''}" onclick="selectMedio('${c.id}',this)">${c.nombre}</button>`).join('');
  document.getElementById('vent-filtro-medio').innerHTML = '<option value="">Todas</option>' + db.cuentas.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
}

function cargarConfig() {
  const c = db.config;
  document.getElementById('cfg-nombre').value = c.nombre || '';
  document.getElementById('cfg-direccion').value = c.direccion || '';
  document.getElementById('cfg-tel').value = c.tel || '';
  document.getElementById('cfg-email').value = c.email || '';
  document.getElementById('cfg-ig').value = c.ig || '';
  document.getElementById('cfg-fb').value = c.fb || '';
  document.getElementById('cfg-desc-efectivo').value = c.descEfectivo || 10;
  document.getElementById('cfg-c1').value = c.colorAccent || '#C4432A';
  document.getElementById('cfg-c2').value = c.colorInk || '#1A1612';
  if (c.logo) document.getElementById('cfg-logo-preview').innerHTML = `<img src="${c.logo}" style="max-height:60px;">`;
}

function cargarLogo(e) {
  const r = new FileReader();
  r.onload = ev => {
    db.config.logo = ev.target.result;
    cargarConfig();
    aplicarBranding();
  };
  r.readAsDataURL(e.target.files[0]);
}

function guardarConfig() {
  db.config.nombre = document.getElementById('cfg-nombre').value;
  db.config.direccion = document.getElementById('cfg-direccion').value;
  db.config.tel = document.getElementById('cfg-tel').value;
  db.config.email = document.getElementById('cfg-email').value;
  db.config.ig = document.getElementById('cfg-ig').value;
  db.config.fb = document.getElementById('cfg-fb').value;
  db.config.colorAccent = document.getElementById('cfg-c1').value;
  db.config.colorInk = document.getElementById('cfg-c2').value;
  saveDB();
  aplicarBranding();
  showToast('Guardado');
}

function guardarDescEfectivo() {
  db.config.descEfectivo = parseFloat(document.getElementById('cfg-desc-efectivo').value) || 0;
  saveDB();
  showToast('Regla de efectivo guardada');
  renderCarrito();
}

function aplicarBranding() {
  const c = db.config;
  document.documentElement.style.setProperty('--c1', c.colorAccent || '#C4432A');
  document.documentElement.style.setProperty('--c2', c.colorInk || '#1A1612');
  const h = document.getElementById('header-logo');
  if (c.logo) { h.src = c.logo; h.classList.add('visible'); } else { h.classList.remove('visible'); }
  document.getElementById('header-title').innerHTML = c.nombre ? `<span style="color:var(--c1)">${c.nombre}</span>` : `Libre<span>POS</span>`;
}

function exportarDatos() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], { type: 'application/json' }));
  a.download = 'LibrePOS-' + today() + '.json';
  a.click();
}

function importarDatos(e) {
  const r = new FileReader();
  r.onload = ev => {
    Object.assign(db, JSON.parse(ev.target.result));
    saveDB();
    location.reload();
  };
  r.readAsText(e.target.files[0]);
}

// Init (Arranque de la página)
aplicarBranding();
populateSelects();
document.getElementById('comp-fecha').value = today();
document.getElementById('gasto-fecha').value = today();
document.getElementById('deuda-fecha').value = today();
document.getElementById('mov-fecha').value = today();