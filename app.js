const store = require('./store.js');
const posManager = require('./pos.js');
const inventario = require('./inventario.js');
const compras = require('./compras.js');
const proveedores = require('./proveedores.js');
const finanzas = require('./finanzas.js');
const socios = require('./socios.js');
const reportes = require('./reportes.js');

let barcodeTimer = null;
let chartCashflow = null;
let carritoRemito = []; 
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : u === '100g' ? Number(n).toFixed(1) + '×100g' : Number(n).toFixed(0) + ' u.';
const today = () => new Date().toISOString().slice(0, 10);
const fmtFecha = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; };
const showToast = (msg, type = 'success') => { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'show ' + type; setTimeout(() => t.className = '', 2500); };

// ================= POS / VENTAS =================
function handleBarcodeInput() {
    clearTimeout(barcodeTimer);
    const val = document.getElementById('pos-barcode').value.trim();
    barcodeTimer = setTimeout(() => {
        if (val.length >= 3) {
            const p = store.db.productos.filter(x => !x.deleted).find(x => x.barcode === val || x.codigo === val);
            if (p) { document.getElementById('pos-barcode').value = ''; abrirModalQty(p.id); }
        }
    }, 150);
}

window.addEventListener('keydown', e => {
    const isPosActive = document.getElementById('sec-pos').classList.contains('active');
    const isModalOpen = document.querySelector('.modal-overlay.open');
    if (e.key === 'Enter' && isPosActive && !isModalOpen && store.carrito.length > 0) {
        if (document.activeElement.id === 'pos-barcode' && document.activeElement.value.trim() !== '') return;
        e.preventDefault(); confirmarVenta();
    }
    if (e.key === 'Enter' && document.getElementById('modal-venta').classList.contains('open')) {
        e.preventDefault(); cerrarModalVenta();
    }
});

function selectMedio(id, btn) { store.medioSeleccionado = id; document.querySelectorAll('.medio-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); renderCarrito(); }
function toggleCartCosto() { const isCostoChecked = document.getElementById('cart-venta-costo')?.checked; store.carrito.forEach(i => i.precioVenta = inventario.getPrecioCart(i.productoId, isCostoChecked)); renderCarrito(); }

function abrirModalQty(productoId) {
    const prod = store.db.productos.find(p => p.id === productoId);
    const stock = inventario.getStock(productoId);
    if (stock <= 0) return showToast('Sin stock: ' + prod.nombre, 'error');
    store.selectedProductId = productoId;
    document.getElementById('modal-qty-title').textContent = prod.nombre;
    document.getElementById('modal-qty-label').textContent = prod.unidad === 'kg' ? 'Cantidad (kg)' : prod.unidad === '100g' ? 'Cantidad (×100g)' : 'Cantidad (unidades)';
    const inp = document.getElementById('modal-qty-input');
    inp.value = prod.unidad === 'unidad' ? '1' : ''; inp.step = prod.unidad === 'unidad' ? '1' : '0.001';
    document.getElementById('modal-stock-info').textContent = 'Stock disponible: ' + fmtQty(stock, prod.unidad);
    document.getElementById('modal-qty').classList.add('open'); setTimeout(() => inp.select(), 60);
}

function cerrarModalQty() { document.getElementById('modal-qty').classList.remove('open'); store.selectedProductId = null; }

function confirmarAgregarCarrito() {
    const qty = parseFloat(document.getElementById('modal-qty-input').value);
    if (!qty || qty <= 0) return;
    const prod = store.db.productos.find(p => p.id === store.selectedProductId);
    if (qty > inventario.getStock(prod.id) + 0.001) return showToast('Stock insuficiente', 'error');
    const ex = store.carrito.find(c => c.productoId === prod.id);
    const isCostoChecked = document.getElementById('cart-venta-costo')?.checked;
    
    if (ex) ex.cantidad += qty; 
    else store.carrito.push({ productoId: prod.id, nombre: prod.nombre, unidad: prod.unidad, cantidad: qty, precioVenta: inventario.getPrecioCart(prod.id, isCostoChecked) }); 
    
    cerrarModalQty(); renderCarrito(); document.getElementById('pos-barcode').focus();
}

function confirmarVenta() {
    if (!store.carrito.length) return;
    const chkEnvio = document.getElementById('chkEnvio').checked;
    const inputEnvio = document.getElementById('inputCostoEnvio');
    const valorInput = chkEnvio ? inputEnvio.value : null;

    const calculo = posManager.calcularTotal(chkEnvio, valorInput);
    const ts = new Date().toISOString(); const vId = Date.now().toString();
    let totV = 0, totC = 0, items = [];
    
    try {
        for (const i of store.carrito) if (i.cantidad > inventario.getStock(i.productoId) + 0.001) throw new Error('Stock falto: ' + i.nombre);
        for (const i of store.carrito) {
            const { costoTotal } = inventario.consumirPEPS(i.productoId, i.cantidad);
            const sub = i.cantidad * i.precioVenta; totV += sub; totC += costoTotal;
            store.db.ventaItems.push({ ventaId: vId, productoId: i.productoId, nombre: i.nombre, unidad: i.unidad, cantidad: i.cantidad, precioVenta: i.precioVenta, costoTotal });
            items.push({ nombre: i.nombre, q: i.cantidad, u: i.unidad, s: sub });
        }
        
        const c = store.db.cuentas.find(x => x.id === store.medioSeleccionado);
        const subtotalSinEnvio = calculo.totalFinal - calculo.envio;
        
        store.db.ventas.push({ id: vId, timestamp: ts, fecha: ts.slice(0, 10), totalVenta: subtotalSinEnvio, totalCosto: totC, cuentaId: c.id, medioPago: c.nombre, descEfectivo: calculo.descEfectivo, descRedondeo: calculo.descRedondeo, costoEnvio: calculo.envio, envioPagado: false, facturada: false });
        
        if (calculo.envio > 0) store.db.ajustesCaja.push({ id: Date.now().toString() + '_envio_in', cuentaId: c.id, fecha: ts.slice(0, 10), diferencia: calculo.envio, tipo: 'ingreso', concepto: 'Cobro de Envío al cliente' });
        if (calculo.descRedondeo > 0) finanzas.registrarGasto(ts.slice(0, 10), 'Otros', 'variable', calculo.descRedondeo, c.id, 'Redondeo POS');
        
        store.saveDB(); populateSelects();
        document.getElementById('resumen-venta').innerHTML = `<table style="width:100%;font-size:.82rem;margin-bottom:.8rem;">${items.map(r => `<tr><td>${r.nombre}</td><td class="mono" align="right">${fmtQty(r.q, r.u)}</td><td class="mono" align="right">${fmt(r.s)}</td></tr>`).join('')}</table><div style="font-size:1.4rem;font-weight:900;border-top:2px solid #ccc;padding-top:.5rem;">Total: ${fmt(calculo.totalFinal)}</div>`;
        document.getElementById('modal-venta').classList.add('open');
        posManager.limpiar(); renderCarrito(); renderProductGrid();
    } catch (e) { showToast(e.message, 'error'); }
}

function cerrarModalVenta() { document.getElementById('modal-venta').classList.remove('open'); document.getElementById('pos-barcode').focus(); }
function cambiarQtyCarrito(i, d) { const item = store.carrito[i]; const s = item.unidad === 'unidad' ? 1 : .1; item.cantidad = Math.max(s, item.cantidad + d * s); renderCarrito(); }
function setQtyCarrito(i, v) { store.carrito[i].cantidad = parseFloat(v) || .001; renderCarrito(); }
function quitarDeCarrito(i) { store.carrito.splice(i, 1); renderCarrito(); }
function limpiarCarrito() { posManager.limpiar(); renderCarrito(); }

function uiActualizarTotalPOS() {
    const chkEnvio = document.getElementById('chkEnvio').checked;
    const inputEnvio = document.getElementById('inputCostoEnvio');
    inputEnvio.style.display = chkEnvio ? 'block' : 'none';
    const calculo = posManager.calcularTotal(chkEnvio, chkEnvio ? inputEnvio.value : null);
    
    document.getElementById('btnRedondeo').innerText = `Redondear (Sug: -$${calculo.sugerido})`;
    document.getElementById('lblDescuentoAplicado').innerText = `-$${calculo.descRedondeo.toFixed(2)}`;
    if (chkEnvio && inputEnvio.value === '') inputEnvio.value = calculo.envio; 
    
    if (calculo.descEfectivo > 0) {
        document.getElementById('cart-desc-row').style.display = 'block'; document.getElementById('cart-desc-row').textContent = `💵 Descuento: −${fmt(calculo.descEfectivo)}`;
        document.getElementById('cart-total-sin-desc-row').style.display = 'flex'; document.getElementById('cart-total-sin-desc').textContent = fmt(calculo.subtotal);
    } else { document.getElementById('cart-desc-row').style.display = 'none'; document.getElementById('cart-total-sin-desc-row').style.display = 'none'; }
    document.getElementById('cart-total').innerText = `$${calculo.totalFinal.toFixed(2)}`; 
}

function uiAplicarRedondeo() { const chk = document.getElementById('chkEnvio').checked; posManager.aplicarRedondeo(posManager.calcularTotal(chk, null).sugerido); uiActualizarTotalPOS(); }

function renderCarrito() {
    const c = document.getElementById('cart-items');
    if (!store.carrito.length) { c.innerHTML = '<div style="padding:2rem 1rem;text-align:center;color:var(--muted);font-size:.82rem;">Seleccioná productos</div>'; document.getElementById('cart-total').textContent = '$0'; return; }
    c.innerHTML = store.carrito.map((i, idx) => `<div class="cart-item"><div><div class="cart-item-name">${i.nombre}</div><div style="font-size:.69rem;color:var(--muted);">${fmt(i.precioVenta)} × ${fmtQty(i.cantidad, i.unidad)}</div></div><div style="text-align:right;"><div class="cart-item-qty"><button class="qty-btn" onclick="cambiarQtyCarrito(${idx},-1)">−</button><input type="number" class="mono" value="${i.cantidad}" onchange="setQtyCarrito(${idx},this.value)" style="width:50px;text-align:center;padding:.2rem;margin:0 .2rem;"><button class="qty-btn" onclick="cambiarQtyCarrito(${idx},1)">+</button></div><div class="mono" style="font-size:.75rem;margin-top:.18rem;">${fmt(i.cantidad * i.precioVenta)}</div><button onclick="quitarDeCarrito(${idx})" style="font-size:.68rem;color:var(--accent);background:none;border:none;cursor:pointer;margin-top:2px;">✕</button></div></div>`).join('');
    uiActualizarTotalPOS();
}

function renderProductGrid() {
    const f = (document.getElementById('pos-search').value || '').toLowerCase();
    let ps = store.db.productos.filter(p => !p.deleted);
    if (f) ps = ps.filter(p => p.nombre.toLowerCase().includes(f) || p.barcode?.includes(f) || p.codigo?.toLowerCase().includes(f));
    document.getElementById('product-grid').innerHTML = ps.map(p => { const s = inventario.getStock(p.id); return `<div class="product-card" onclick="abrirModalQty('${p.id}')"><div class="pname">${p.nombre}</div><div style="font-family:'DM Mono',font-size:.7rem;color:${s > 0 ? 'var(--green)' : 'var(--accent)'}">${s > 0 ? fmtQty(s, p.unidad) : 'Sin stock'}</div></div>`; }).join('');
}
function filterProducts() { renderProductGrid(); }

// ================= COMPRAS / REMITOS =================
function togglePagoCompra(val) { document.getElementById('comp-cuenta-wrap').style.display = val === 'pagado' ? 'block' : 'none'; }

function buscarProdCompra() {
    const bc = document.getElementById('comp-barcode').value.trim();
    if (!bc) return;
    const prod = store.db.productos.filter(x => !x.deleted).find(p => p.barcode === bc || p.codigo === bc);
    if (prod) {
        document.getElementById('comp-prod-nombre').value = prod.nombre + (prod.marca ? ' (' + prod.marca + ')' : '');
        document.getElementById('comp-prod-id').value = prod.id; document.getElementById('comp-cantidad').focus();
    } else {
        document.getElementById('np-codigo').value = bc; document.getElementById('modal-np').classList.add('open');
        setTimeout(() => document.getElementById('np-nombre').focus(), 80);
    }
}

function guardarNuevoProd() {
    const codigo = document.getElementById('np-codigo').value.trim(); const nombre = document.getElementById('np-nombre').value.trim();
    const marca = document.getElementById('np-marca').value.trim(); const unidad = document.getElementById('np-unidad').value;
    
    if (!codigo || !nombre) return showToast('Código y nombre son obligatorios', 'error');
    let exist = store.db.productos.find(p => p.codigo === codigo || p.barcode === codigo);
    if (exist && !exist.deleted) return showToast('Código ya existe', 'error');
    
    let pId;
    if (exist && exist.deleted) { exist.deleted = false; exist.nombre = nombre; exist.marca = marca; exist.unidad = unidad; pId = exist.id; } 
    else { pId = Date.now().toString(); store.db.productos.push({ id: pId, codigo, barcode: codigo, nombre, marca, unidad, deleted: false }); }
    
    if (!store.db.preciosExtra[pId]) store.db.preciosExtra[pId] = { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false, precioImpreso: 0 };
    store.saveDB(); document.getElementById('modal-np').classList.remove('open');
    document.getElementById('comp-prod-nombre').value = nombre; document.getElementById('comp-prod-id').value = pId;
    document.getElementById('comp-barcode').value = codigo; document.getElementById('comp-cantidad').focus();
}

function agregarItemRemito() {
    const pId = document.getElementById('comp-prod-id').value; const cant = parseFloat(document.getElementById('comp-cantidad').value);
    const costo = parseFloat(document.getElementById('comp-costo').value); const venc = document.getElementById('comp-venc').value;
    if (!pId || !cant || isNaN(costo)) return showToast('Faltan datos del producto', 'error');
    const p = store.db.productos.find(x => x.id === pId);
    carritoRemito.push({ productoId: pId, codigo: p.codigo, nombre: p.nombre, cantidad: cant, costoUnitario: costo, vencimiento: venc });
    renderTablaRemito();
    ['comp-barcode', 'comp-prod-nombre', 'comp-prod-id', 'comp-cantidad', 'comp-costo', 'comp-venc'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('comp-barcode').focus();
}

function quitarItemRemito(idx) { carritoRemito.splice(idx, 1); renderTablaRemito(); }

function renderTablaRemito() {
    let total = 0;
    document.getElementById('tabla-remito-items').innerHTML = carritoRemito.map((item, i) => {
        const sub = item.cantidad * item.costoUnitario; total += sub;
        return `<tr><td class="mono">${item.codigo}</td><td>${item.nombre}</td><td class="mono">${item.cantidad}</td><td class="mono">${fmt(item.costoUnitario)}</td><td class="mono">${fmt(sub)}</td><td>${fmtFecha(item.vencimiento)}</td><td><button class="btn btn-danger btn-sm" onclick="quitarItemRemito(${i})">✕</button></td></tr>`;
    }).join('');
    document.getElementById('comp-total-remito').textContent = fmt(total);
}

function confirmarRemitoCompleto() {
    try {
        compras.registrarRemito(document.getElementById('comp-proveedor').value, document.getElementById('comp-comprobante').value, document.getElementById('comp-fecha').value, carritoRemito, document.getElementById('comp-pago').value, document.getElementById('comp-cuenta').value);
        store.saveDB(); populateSelects(); showToast('Remito registrado con éxito');
        carritoRemito = []; renderTablaRemito(); document.getElementById('comp-comprobante').value = '';
    } catch (e) { showToast(e.message, 'error'); }
}

// ================= STOCK / PRECIOS =================
function getProveedorLoteReciente(pId) {
    const lotes = store.db.lotes.filter(l => l.productoId === pId).sort((a,b) => b.fecha.localeCompare(a.fecha));
    return lotes.length && lotes[0].proveedorId ? store.db.proveedores.find(x => x.id === lotes[0].proveedorId)?.nombre || 'S/P' : 'S/P';
}

function renderTablaProductos() {
    const f = (document.getElementById('stock-search').value || '').toLowerCase(); const sort = document.getElementById('stock-sort').value;
    let ps = store.db.productos.filter(p => !p.deleted);
    if (f) ps = ps.filter(p => p.nombre.toLowerCase().includes(f) || p.codigo?.toLowerCase().includes(f));
    
    ps.sort((a, b) => {
        if (sort === 'nombre') return a.nombre.localeCompare(b.nombre);
        if (sort === 'prov') return getProveedorLoteReciente(a.id).localeCompare(getProveedorLoteReciente(b.id));
        if (sort === 'venc') {
            const va = store.db.lotes.filter(l => l.productoId === a.id && l.vencimiento && l.cantDisponible > 0).sort((x,y) => x.vencimiento.localeCompare(y.vencimiento))[0]?.vencimiento || '9999-99-99';
            const vb = store.db.lotes.filter(l => l.productoId === b.id && l.vencimiento && l.cantDisponible > 0).sort((x,y) => x.vencimiento.localeCompare(y.vencimiento))[0]?.vencimiento || '9999-99-99';
            return va.localeCompare(vb);
        }
    });
    
    document.getElementById('tabla-productos').innerHTML = ps.map(p => {
        const st = inventario.getStock(p.id); const ex = store.db.preciosExtra[p.id] || {}; const ca = inventario.getCostoMasAlto(p.id);
        return `<tr data-pid="${p.id}"><td class="mono" style="font-size:.7rem">${p.codigo}</td><td><strong>${p.nombre}</strong><div style="font-size:0.65rem;color:var(--muted)">Prov: ${getProveedorLoteReciente(p.id)}</div></td><td>${p.unidad}</td><td class="mono">${p.stockMinimo || 0}</td><td class="mono" style="color:${st <= (p.stockMinimo || 0) ? 'var(--accent)' : 'inherit'}">${fmtQty(st, p.unidad)}</td><td class="mono">${fmt(ca)}</td><td><input class="edit-inline" data-f="fijo" value="${ex.fijo || 0}" oninput="recalcInline(this)"></td><td><input class="edit-inline" data-f="imp" value="${ex.imp || 0}" oninput="recalcInline(this)"></td><td><input class="edit-inline" data-f="gan" value="${ex.gan || 30}" oninput="recalcInline(this)"></td><td><input class="edit-inline" data-f="desc" value="${ex.desc || 0}" oninput="recalcInline(this)"></td><td style="text-align:center;"><input type="checkbox" data-f="alCosto" ${ex.alCosto ? 'checked' : ''} onchange="recalcInline(this)"></td><td class="mono" id="pf-${p.id}"><strong>${fmt(inventario.calcPrecioFinal(p.id))}</strong></td><td style="white-space:nowrap;"><button class="btn btn-secondary btn-sm" onclick="abrirEditarProd('${p.id}')">✏</button> <button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar?')){store.db.productos.find(x=>x.id==='${p.id}').deleted=true;store.saveDB();renderTablaProductos();renderProductGrid();}">✕</button></td></tr>`;
    }).join('');
}

function recalcInline(inp) {
    const tr = inp.closest('tr'); const pId = tr.dataset.pid; const c = inventario.getCostoMasAlto(pId);
    const v = f => parseFloat(tr.querySelector(`[data-f="${f}"]`)?.value) || 0;
    const alCosto = tr.querySelector(`[data-f="alCosto"]`)?.checked || false;
    let raw = alCosto ? (c + v('fijo')) * (1 + v('imp') / 100) : (c + v('fijo')) * (1 + v('imp') / 100) * (1 + v('gan') / 100) * (1 - v('desc') / 100);
    tr.querySelector(`#pf-${pId}`).innerHTML = `<strong>${fmt(Math.ceil(raw/10)*10)}</strong>`;
}

function guardarPreciosTodos() {
    document.querySelectorAll('#tabla-productos tr[data-pid]').forEach(row => {
        const pid = row.dataset.pid; const getVal = f => parseFloat(row.querySelector(`[data-f="${f}"]`)?.value) || 0;
        store.db.preciosExtra[pid] = { ...store.db.preciosExtra[pid], fijo: getVal('fijo'), imp: getVal('imp'), gan: getVal('gan'), desc: getVal('desc'), alCosto: row.querySelector(`[data-f="alCosto"]`)?.checked || false };
    });
    store.saveDB(); renderTablaProductos(); showToast('Precios guardados');
}

function abrirEditarProd(id) {
    const p = store.db.productos.find(x => x.id === id); if (!p) return;
    document.getElementById('ep-prod-id').value = id; document.getElementById('ep-prod-codigo').value = p.codigo; document.getElementById('ep-prod-nombre').value = p.nombre; document.getElementById('ep-prod-unidad').value = p.unidad; document.getElementById('ep-prod-marca').value = p.marca || ''; document.getElementById('ep-prod-min').value = p.stockMinimo || '';
    document.getElementById('modal-edit-prod').classList.add('open');
}

function guardarEditProd() {
    const p = store.db.productos.find(x => x.id === document.getElementById('ep-prod-id').value); if (!p) return;
    p.codigo = document.getElementById('ep-prod-codigo').value.trim() || p.codigo; p.nombre = document.getElementById('ep-prod-nombre').value.trim() || p.nombre; p.unidad = document.getElementById('ep-prod-unidad').value; p.marca = document.getElementById('ep-prod-marca').value.trim(); p.stockMinimo = parseFloat(document.getElementById('ep-prod-min').value) || 0;
    store.saveDB(); document.getElementById('modal-edit-prod').classList.remove('open'); renderTablaProductos(); showToast('Producto actualizado');
}

// ==== Muestras / Desactualizados ====
function abrirModalMuestras() {
    document.getElementById('mu-prod').innerHTML = '<option value="">— Seleccionar —</option>' + store.db.productos.filter(p => !p.deleted && inventario.getStock(p.id) > 0).map(p => `<option value="${p.id}">${p.nombre} (Stock: ${inventario.getStock(p.id)})</option>`).join('');
    document.getElementById('mu-qty').value = ''; document.getElementById('mu-fecha').value = today();
    document.getElementById('modal-muestras').classList.add('open');
}
function confirmarMuestra() { try { inventario.consumirParaMuestra(document.getElementById('mu-prod').value, parseFloat(document.getElementById('mu-qty').value), document.getElementById('mu-fecha').value); store.saveDB(); renderTablaProductos(); document.getElementById('modal-muestras').classList.remove('open'); showToast('Gasto registrado'); } catch(e) { showToast(e.message, 'error'); } }

let arrayPreciosDesact = [];
function abrirModalPreciosDesactualizados() {
    arrayPreciosDesact = inventario.getPreciosDesactualizados();
    document.getElementById('tabla-precios-desact').innerHTML = arrayPreciosDesact.map(p => `<tr><td>${p.nombre}</td><td class="mono" style="color:var(--muted)">${fmt(p.impreso)}</td><td class="mono" style="color:var(--accent);font-weight:bold;">${fmt(p.calculado)}</td><td><button class="btn btn-sm btn-green" onclick="marcarPrecioListo('${p.id}')">Listo ✓</button></td></tr>`).join('');
    if(arrayPreciosDesact.length === 0) document.getElementById('tabla-precios-desact').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;">Todos los precios en góndola coinciden con el sistema.</td></tr>';
    document.getElementById('modal-precios').classList.add('open');
}
function marcarPrecioListo(pId) { inventario.marcarPrecioActualizado(pId); abrirModalPreciosDesactualizados(); renderTablaProductos(); }
function generarPDFEtiquetas() { if(arrayPreciosDesact.length) { reportes.generarPDFEtiquetas(arrayPreciosDesact); arrayPreciosDesact.forEach(p => inventario.marcarPrecioActualizado(p.id)); abrirModalPreciosDesactualizados(); renderTablaProductos(); } else showToast('No hay precios desactualizados','error'); }

// ================= TABLAS Y FINANZAS VARIAS =================
function renderTablaVentas() { document.getElementById('tabla-ventas-menu').innerHTML = [...store.db.ventas].reverse().map(v => `<tr><td class="mono">${new Date(v.timestamp).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td><td style="font-size:.78rem;">${store.db.ventaItems.filter(i => i.ventaId === v.id).map(i => i.nombre).join(', ')}</td><td class="mono">${fmt(v.totalVenta + v.costoEnvio)}</td><td class="mono">${v.descEfectivo > 0 ? fmt(v.descEfectivo) : '—'}</td><td><span class="badge badge-ink">${v.medioPago}</span></td><td><input type="checkbox" ${v.facturada ? 'checked' : ''} onchange="store.db.ventas.find(x=>x.id==='${v.id}').facturada=this.checked;store.saveDB();"></td></tr>`).join(''); }

function agregarProveedor() { try { proveedores.agregar(document.getElementById('prov-nombre').value, document.getElementById('prov-contacto').value, document.getElementById('prov-tel').value, Array.from(document.getElementById('prov-dias-pedido').selectedOptions).map(o=>o.value), Array.from(document.getElementById('prov-dias-entrega').selectedOptions).map(o=>o.value)); store.saveDB(); renderTablaProveedores(); populateSelects(); showToast('Proveedor agregado'); } catch(e) { showToast(e.message,'error'); } }
function abrirEditarProv(id) { const p = store.db.proveedores.find(x => x.id === id); if (!p) return; document.getElementById('eprov-id').value = id; document.getElementById('eprov-nombre').value = p.nombre; document.getElementById('eprov-contacto').value = p.contacto || ''; document.getElementById('eprov-tel').value = p.tel || ''; Array.from(document.getElementById('eprov-dias-pedido').options).forEach(o => o.selected = (p.diasPedido || []).includes(o.value)); Array.from(document.getElementById('eprov-dias-entrega').options).forEach(o => o.selected = (p.diasEntrega || []).includes(o.value)); document.getElementById('modal-edit-prov').classList.add('open'); }
function guardarEditProv() { try { proveedores.editar(document.getElementById('eprov-id').value, document.getElementById('eprov-nombre').value, document.getElementById('eprov-contacto').value, document.getElementById('eprov-tel').value, Array.from(document.getElementById('eprov-dias-pedido').selectedOptions).map(o=>o.value), Array.from(document.getElementById('eprov-dias-entrega').selectedOptions).map(o=>o.value)); store.saveDB(); document.getElementById('modal-edit-prov').classList.remove('open'); renderTablaProveedores(); showToast('Proveedor actualizado'); } catch(e) { showToast(e.message, 'error'); } }
function eliminarProveedor(id) { try { if(confirm('¿Eliminar proveedor? Historial de compras se mantendrá.')) { proveedores.eliminar(id); store.saveDB(); renderTablaProveedores(); populateSelects(); showToast('Proveedor eliminado'); } } catch(e) { showToast(e.message, 'error'); } }
function registrarDeuda() { try { proveedores.registrarDeuda(document.getElementById('deuda-prov').value, document.getElementById('deuda-fecha').value, document.getElementById('deuda-monto').value, document.getElementById('deuda-desc').value); store.saveDB(); renderTablaDeudas(); showToast('Deuda registrada'); } catch(e) { showToast(e.message, 'error'); } }
function abrirPagoDeuda(id) { document.getElementById('pd-id').value = id; document.getElementById('pd-monto').value = '0'; document.getElementById('pd-descuento').value = '0'; document.getElementById('modal-pago-deuda').classList.add('open'); }
function confirmarPagoDeuda() { try { proveedores.registrarPagoDeuda(document.getElementById('pd-id').value, document.getElementById('pd-monto').value, document.getElementById('pd-descuento').value, document.getElementById('pd-cuenta').value, today()); store.saveDB(); document.getElementById('modal-pago-deuda').classList.remove('open'); renderTablaDeudas(); renderFinanzasTotales(); showToast('Pago registrado'); } catch(e) { showToast(e.message, 'error'); } }

function renderTablaProveedores() { document.getElementById('tabla-proveedores-container').innerHTML = store.db.proveedores.filter(p=>!p.deleted).map(p => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:start;"><div class="card-title" style="margin-bottom:0;border:none;">${p.nombre}</div><div><button class="btn btn-secondary btn-sm" onclick="abrirEditarProv('${p.id}')">✏</button> <button class="btn btn-danger btn-sm" onclick="eliminarProveedor('${p.id}')">✕</button></div></div><div style="font-size:.8rem;color:var(--muted)">📞 ${p.tel || '—'} | Pedido: ${(p.diasPedido || []).map(d => DIAS_SEMANA[d]).join(', ')} | Entrega: ${(p.diasEntrega || []).map(d => DIAS_SEMANA[d]).join(', ')}</div></div>`).join(''); }
function renderTablaDeudas() { document.getElementById('tabla-deudas').innerHTML = store.db.cuentasPorPagar.filter(d => !d.pagado).map(d => `<tr><td class="mono">${fmtFecha(d.fecha)}</td><td>${store.db.proveedores.find(x => x.id === d.proveedorId)?.nombre}</td><td>${d.descripcion}</td><td class="mono">${fmt(d.monto)}</td><td class="mono" style="color:var(--accent);font-weight:600;">${fmt(d.monto - d.pagos.reduce((s,p)=>s+p.monto,0))}</td><td><button class="btn btn-green btn-sm" onclick="abrirPagoDeuda('${d.id}')">Pagar</button></td></tr>`).join(''); }

function renderEnviosPendientes() {
    const pend = store.db.ventas.filter(v => v.costoEnvio > 0 && !v.envioPagado);
    const total = pend.reduce((s, v) => s + v.costoEnvio, 0);
    const el = document.getElementById('envios-pendientes-total'); if(el) el.textContent = fmt(total);
    return { pend, total };
}
function pagarCadete() {
    try {
        const { pend, total } = renderEnviosPendientes();
        if (total <= 0) return showToast('No hay envíos pendientes', 'error');
        const cId = document.getElementById('envios-cuenta').value; if (!cId) return showToast('Seleccioná una cuenta', 'error');
        finanzas.registrarGasto(today(), 'Logística / Envíos', 'variable', total, cId, 'Liquidación a Cadete');
        pend.forEach(v => v.envioPagado = true); store.saveDB(); renderEnviosPendientes(); renderTablaGastos(); renderFinanzasTotales(); showToast('Cadete pagado correctamente');
    } catch(e) { showToast(e.message, 'error'); }
}

function registrarGasto() { try { finanzas.registrarGasto(document.getElementById('gasto-fecha').value, document.getElementById('gasto-cat').value, document.getElementById('gasto-tipo').value, document.getElementById('gasto-importe').value, document.getElementById('gasto-cuenta').value, document.getElementById('gasto-desc').value); store.saveDB(); renderTablaGastos(); renderFinanzasTotales(); showToast('Gasto ok'); } catch(e) { showToast(e.message, 'error'); } }
function renderTablaGastos() { 
    const agrupados = {};
    store.db.gastos.forEach(g => { const k = `${g.fecha}_${g.categoria}_${g.descripcion || ''}`; if (!agrupados[k]) agrupados[k] = { ...g, ids: [g.id] }; else { agrupados[k].importe += g.importe; agrupados[k].ids.push(g.id); } });
    const arr = Object.values(agrupados).sort((a,b) => b.fecha.localeCompare(a.fecha));
    document.getElementById('tabla-gastos').innerHTML = arr.map(g => `<tr><td class="mono">${fmtFecha(g.fecha)}</td><td>${g.categoria}${g.ids.length > 1 ? ` <span style="font-size:.7rem;color:var(--muted)">(x${g.ids.length})</span>` : ''}</td><td><span class="badge ${g.tipo === 'fijo' ? 'badge-purple' : 'badge-ink'}">${g.tipo}</span></td><td>${g.descripcion || '—'}</td><td class="mono">${fmt(g.importe)}</td><td>${store.db.cuentas.find(x => x.id === g.cuentaId)?.nombre || 'Varios'}</td><td><button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar registro${g.ids.length>1?'s agrupados':''}?')){store.db.gastos=store.db.gastos.filter(x=> !${JSON.stringify(g.ids)}.includes(x.id));store.saveDB();renderTablaGastos();renderFinanzasTotales();}">✕</button></td></tr>`).join(''); 
}

function crearCuenta() { try { finanzas.crearCuenta(document.getElementById('nueva-cta-nombre').value, document.getElementById('nueva-cta-saldo').value); store.saveDB(); renderCuentas(); populateSelects(); } catch(e) { showToast(e.message, 'error'); } }
function ajustarCaja(cId, inp) { const aj = finanzas.ajustarCaja(cId, inp.value, today()); if(aj) { store.saveDB(); renderCuentas(); renderFinanzasTotales(); showToast('Ajuste guardado'); } }
function renderCuentas() { document.getElementById('lista-cuentas').innerHTML = store.db.cuentas.map(c => `<div class="account-card"><div class="account-name">${c.nombre}</div><div class="account-bal">${fmt(finanzas.calcSaldoCuenta(c.id))}</div><div style="display:flex;gap:.3rem;margin-top:.5rem;"><input type="number" placeholder="Saldo Real" id="real-${c.id}" style="padding:.3rem;font-size:.8rem;"><button class="btn btn-secondary btn-sm" onclick="ajustarCaja('${c.id}', document.getElementById('real-${c.id}'))">Ajustar</button></div></div>`).join(''); }
function renderFinanzasTotales() { document.getElementById('fin-capital').textContent = fmt(finanzas.getPatrimonioNeto() - finanzas.calcGananciaNetaGlobal()); document.getElementById('fin-ganancia').textContent = fmt(finanzas.calcGananciaSinAsignar()); document.getElementById('fin-liquidez').textContent = fmt(store.db.cuentas.reduce((s, c) => s + finanzas.calcSaldoCuenta(c.id), 0)); }

function agregarSocio() { try { socios.agregar(document.getElementById('socio-nombre').value, document.getElementById('socio-dni').value); store.saveDB(); renderSocios(); populateSelects(); showToast('Socio agregado'); } catch(e) { showToast(e.message, 'error'); } }
function eliminarSocio(id) { try { if(confirm('¿Eliminar?')) { socios.eliminar(id); store.saveDB(); renderSocios(); populateSelects(); showToast('Eliminado'); } } catch(e) { showToast(e.message, 'error'); } }
function registrarMovimientoSocio() { try { socios.registrarMovimiento(document.getElementById('mov-socio').value, document.getElementById('mov-tipo').value, document.getElementById('mov-importe').value, document.getElementById('mov-cuenta').value, document.getElementById('mov-fecha').value); store.saveDB(); renderSocios(); renderFinanzasTotales(); showToast('Registrado'); } catch(e) { showToast(e.message, 'error'); } }
function abrirRetiroSocio() { document.getElementById('rs-prod').innerHTML = '<option value="">— Seleccionar —</option>' + store.db.productos.filter(p => !p.deleted && inventario.getStock(p.id) > 0).map(p => `<option value="${p.id}">${p.nombre} (Stock: ${inventario.getStock(p.id)})</option>`).join(''); document.getElementById('modal-retiro-socio').classList.add('open'); }
function confirmarRetiroSocio() { try { const pId = document.getElementById('rs-prod').value; const qty = parseFloat(document.getElementById('rs-qty').value); if(document.getElementById('rs-accion').value === 'descontar') { const { costoTotal } = inventario.consumirPEPS(pId, qty); socios.registrarMovimiento(document.getElementById('rs-socio').value, 'retiro', costoTotal, '', today()); } else { inventario.consumirParaMuestra(pId, qty, today()); } store.saveDB(); renderTablaProductos(); document.getElementById('modal-retiro-socio').classList.remove('open'); showToast('Retiro registrado'); } catch(e) { showToast(e.message, 'error'); } }
function renderSocios() { document.getElementById('soc-neta').textContent = fmt(finanzas.calcGananciaNetaGlobal()); document.getElementById('soc-disp').textContent = fmt(finanzas.calcGananciaSinAsignar()); document.getElementById('lista-socios').innerHTML = store.db.socios.filter(s => !s.deleted).map(s => { const saldo = finanzas.calcSaldoSocio(s.id); return `<div style="display:inline-flex;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:.3rem .6rem;margin:.2rem;font-size:.85rem;"><span style="font-weight:600;margin-right:.5rem;">${s.nombre}</span> <span class="badge ${saldo >= 0 ? 'badge-green' : 'badge-red'}">Saldo: ${fmt(saldo)}</span><button onclick="eliminarSocio('${s.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;margin-left:.4rem;font-weight:600;">✕</button></div>`; }).join(''); }

// ================= REPORTES E INDICADORES =================
function renderIndicadores() {
    const pN = finanzas.getPatrimonioNeto(); const mes = today().slice(0, 7);
    const gfijos = store.db.gastos.filter(g => g.tipo === 'fijo' && g.fecha.startsWith(mes)).reduce((s, g) => s + g.importe, 0);
    const vtasM = store.db.ventas.filter(v => v.fecha.startsWith(mes)).reduce((s, v) => s + v.totalVenta, 0);
    const costM = store.db.ventas.filter(v => v.fecha.startsWith(mes)).reduce((s, v) => s + v.totalCosto, 0);
    const pEq = vtasM > costM ? gfijos / ((vtasM - costM) / vtasM) : 0;
    const stockV = store.db.productos.filter(p => !p.deleted).reduce((s, p) => s + (inventario.getStock(p.id) * inventario.getCostoMasAlto(p.id)), 0);
    const rot = stockV > 0 ? (store.db.ventaItems.reduce((s, vi) => s + vi.costoTotal, 0) / stockV).toFixed(1) : 0;
    document.getElementById('dash-indicadores').innerHTML = `<div class="stat-card"><div class="stat-label">Patrimonio Neto</div><div class="stat-value">${fmt(pN)}</div></div><div class="stat-card"><div class="stat-label">Pto de Equilibrio (Mes)</div><div class="stat-value">${fmt(pEq)}</div></div><div class="stat-card"><div class="stat-label">Rotación Inventario</div><div class="stat-value">${rot}x</div></div>`;
}

function generarInforme() {
    const { vts, vIng, vCosto } = reportes.getDatosInformeVentas(document.getElementById('inf-desde').value, document.getElementById('inf-hasta').value);
    document.getElementById('stat-grid').innerHTML = `<div class="stat-card"><div class="stat-label">Ventas Periodo</div><div class="stat-value">${fmt(vIng)}</div></div><div class="stat-card"><div class="stat-label">Costo (CMV)</div><div class="stat-value">${fmt(vCosto)}</div></div><div class="stat-card"><div class="stat-label">Margen Bruto</div><div class="stat-value">${fmt(vIng - vCosto)}</div></div>`;
    document.getElementById('tabla-inf-ventas').innerHTML = vts.map(v => `<tr><td class="mono">${fmtFecha(v.fecha)}</td><td>${store.db.ventaItems.filter(i => i.ventaId === v.id).map(i => i.nombre).join(', ')}</td><td class="mono">${fmt(v.totalCosto)}</td><td class="mono">${fmt(v.totalVenta)}</td><td class="mono">${fmt(v.totalVenta - v.totalCosto)}</td></tr>`).join('');
    
    const asientos = reportes.generarAsientosDiario(document.getElementById('inf-desde').value, document.getElementById('inf-hasta').value);
    let htmlDiario = ''; let tDebe = 0; let tHaber = 0;
    asientos.forEach(as => { htmlDiario += `<tr class="diario-header"><td class="mono" colspan="4">${fmtFecha(as.f)} | 📑 ${as.r}</td></tr>`; as.ls.forEach(l => { tDebe += l.d; tHaber += l.h; htmlDiario += `<tr class="diario-row"><td style="width:15%"></td><td class="diario-cuenta ${l.h > 0 ? 'haber' : ''}">${l.c}</td><td class="mono" style="text-align:right;color:var(--blue);">${l.d > 0 ? fmt(l.d) : ''}</td><td class="mono" style="text-align:right;color:var(--accent);">${l.h > 0 ? fmt(l.h) : ''}</td></tr>`; }); });
    if (!asientos.length) htmlDiario = '<tr><td colspan="4" style="text-align:center;">Sin registros</td></tr>';
    else htmlDiario += `<tr style="font-weight:900;background:var(--amber-light);"><td colspan="2" style="text-align:right">TOTALES</td><td class="mono" style="text-align:right;">${fmt(tDebe)}</td><td class="mono" style="text-align:right;">${fmt(tHaber)}</td></tr>`;
    document.getElementById('tabla-diario').innerHTML = htmlDiario; document.getElementById('informe-body').style.display = 'block';
}

function generarPDFPedidos() { reportes.generarPDFPedidos(); }
function generarListaPrecios() { reportes.generarListaPrecios(); }
function imprimirCodigosBarra() { 
    try { 
        const ps = store.db.productos.filter(p => !p.deleted && (p.codigo || p.barcode)); 
        if(!ps.length) return showToast('No hay productos con código asignado', 'error');
        reportes.generarPDFCodigosBarra(ps); 
        showToast('PDF generado correctamente');
    } catch(e) { showToast(e.message, 'error'); } 
}

function renderCashflow() {
    const ctx = document.getElementById('chart-cashflow'); if (!ctx) return; 
    if (chartCashflow) chartCashflow.destroy();
    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 29 + i); return d.toISOString().slice(0, 10); });
    const ing = days.map(d => store.db.ventas.filter(v => v.fecha === d).reduce((s, v) => s + v.totalVenta, 0) + store.db.movimientos.filter(m => m.fecha === d && m.tipo === 'deposito').reduce((s, m) => s + m.importe, 0) + store.db.ajustesCaja.filter(a => a.fecha === d && a.tipo === 'ingreso').reduce((s, a) => s + a.diferencia, 0));
    const egr = days.map(d => store.db.gastos.filter(g => g.fecha === d).reduce((s, g) => s + g.importe, 0) + store.db.cuentasPorPagar.reduce((s, deuda) => s + (deuda.pagos || []).filter(p => p.fecha === d && p.tipo==='pago').reduce((x, p) => x + p.monto, 0), 0) + store.db.lotes.filter(l => l.fecha === d && l.cuentaId).reduce((s, l) => s + (l.cantOriginal * l.costoUnit), 0) + store.db.movimientos.filter(m => m.fecha === d && m.tipo === 'retiro').reduce((s, m) => s + m.importe, 0) + store.db.ajustesCaja.filter(a => a.fecha === d && a.tipo === 'perdida').reduce((s, a) => s + Math.abs(a.diferencia), 0));
    chartCashflow = new Chart(ctx, { type: 'bar', data: { labels: days.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)), datasets: [{ label: 'Ingresos Reales (Caja)', data: ing, backgroundColor: 'rgba(42,107,60,.8)' }, { label: 'Egresos Reales (Pagos)', data: egr, backgroundColor: 'rgba(196,67,42,.8)' }] }, options: { responsive: true, maintainAspectRatio: false } });
}

// ================= NAVEGACIÓN Y CONFIGURACIÓN =================
function showSection(id, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('sec-' + id).classList.add('active'); if (btn) btn.classList.add('active');
    
    if (id === 'pos') { renderProductGrid(); setTimeout(() => document.getElementById('pos-barcode').focus(), 80); }
    if (id === 'stock') renderTablaProductos(); if (id === 'ventas') renderTablaVentas();
    if (id === 'proveedores') { renderTablaProveedores(); renderTablaDeudas(); }
    if (id === 'gastos') { renderTablaGastos(); renderEnviosPendientes(); }
    if (id === 'finanzas') { renderCuentas(); renderFinanzasTotales(); renderCashflow(); }
    if (id === 'socios') renderSocios(); if (id === 'indicadores') renderIndicadores();
    if (id === 'informes') { document.getElementById('inf-desde').value = new Date(new Date().setDate(1)).toISOString().slice(0, 10); document.getElementById('inf-hasta').value = today(); showInfTab('resumen', document.querySelector('.tab-pill')); }
    if (id === 'config') cargarConfig();
}

function showProvTab(id, btn) { document.querySelectorAll('.prov-tab').forEach(t => t.style.display = 'none'); document.querySelectorAll('#sec-proveedores .tab-pill').forEach(b => b.classList.remove('active')); document.getElementById('prov-' + id).style.display = 'block'; btn.classList.add('active'); }
function showInfTab(id, btn) { document.querySelectorAll('.inf-tab').forEach(t => t.style.display = 'none'); document.querySelectorAll('#sec-informes .tab-pill').forEach(b => b.classList.remove('active')); document.getElementById('inf-' + id).style.display = 'block'; btn.classList.add('active'); }

function populateSelects() {
    const provs = '<option value="">— Seleccionar —</option>' + store.db.proveedores.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    document.querySelectorAll('#np-proveedor, #ep-prod-proveedor, #deuda-prov, #comp-proveedor').forEach(s => { const val = s.value; s.innerHTML = provs; s.value = val; });
    const ctas = store.db.cuentas.map(c => `<option value="${c.id}">${c.nombre} (${fmt(finanzas.calcSaldoCuenta(c.id))})</option>`).join('');
    document.querySelectorAll('#comp-cuenta, #pd-cuenta, #gasto-cuenta, #mov-cuenta, #envios-cuenta').forEach(s => { const val = s.value; s.innerHTML = ctas; s.value = val || (store.db.cuentas[0]?.id || ''); });
    const socs = '<option value="">— Seleccionar —</option>' + store.db.socios.filter(s => !s.deleted).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
    document.querySelectorAll('#mov-socio, #rs-socio').forEach(s => { const val = s.value; s.innerHTML = socs; s.value = val; });
    document.getElementById('medios-pago-btns').innerHTML = store.db.cuentas.map(c => `<button class="medio-btn${c.id === store.medioSeleccionado ? ' selected' : ''}" onclick="selectMedio('${c.id}',this)">${c.nombre}</button>`).join('');
    document.getElementById('vent-filtro-medio').innerHTML = '<option value="">Todas</option>' + store.db.cuentas.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join('');
}

function cargarConfig() {
    const c = store.db.config;
    ['nombre','direccion','tel','email','ig','fb','descEfectivo','colorAccent','colorInk'].forEach(k => { if(document.getElementById('cfg-'+k.replace(/([A-Z])/g, "-$1").toLowerCase())) document.getElementById('cfg-'+k.replace(/([A-Z])/g, "-$1").toLowerCase()).value = c[k] || ''; });
    if (c.logo) document.getElementById('cfg-logo-preview').innerHTML = `<img src="${c.logo}" style="max-height:60px;">`;
    if (store.dbFilePath) document.getElementById('ruta-guardado').textContent = store.dbFilePath;
}

function guardarConfig() {
    ['nombre','direccion','tel','email','ig','fb','colorAccent','colorInk'].forEach(k => store.db.config[k] = document.getElementById('cfg-'+k.replace(/([A-Z])/g, "-$1").toLowerCase()).value);
    store.saveDB(); aplicarBranding(); showToast('Guardado');
}
function guardarDescEfectivo() { store.db.config.descEfectivo = parseFloat(document.getElementById('cfg-desc-efectivo').value) || 0; store.saveDB(); showToast('Regla guardada'); renderCarrito(); }
function cargarLogo(e) { const r = new FileReader(); r.onload = ev => { store.db.config.logo = ev.target.result; cargarConfig(); aplicarBranding(); }; r.readAsDataURL(e.target.files[0]); }
function aplicarBranding() { const c = store.db.config; document.documentElement.style.setProperty('--c1', c.colorAccent || '#C4432A'); document.documentElement.style.setProperty('--c2', c.colorInk || '#1A1612'); const h = document.getElementById('header-logo'); if (c.logo) { h.src = c.logo; h.classList.add('visible'); } else { h.classList.remove('visible'); } document.getElementById('header-title').innerHTML = c.nombre ? `<span style="color:var(--c1)">${c.nombre}</span>` : `Libre<span>POS</span>`; }
function exportarDatos() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(store.db)], { type: 'application/json' })); a.download = 'LibrePOS-' + today() + '.json'; a.click(); }
function importarDatos(e) { const r = new FileReader(); r.onload = ev => { Object.assign(store.db, JSON.parse(ev.target.result)); store.saveDB(); location.reload(); }; r.readAsText(e.target.files[0]); }

// INIT
aplicarBranding(); populateSelects();
['comp','gasto','deuda','mov'].forEach(p => { if(document.getElementById(`${p}-fecha`)) document.getElementById(`${p}-fecha`).value = today(); });