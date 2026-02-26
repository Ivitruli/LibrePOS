const store = require('./store.js');
const proveedores = require('./proveedores.js');
const finanzas = require('./finanzas.js');
const socios = require('./socios.js');
const reportes = require('./reportes.js');
const inventario = require('./inventario.js');

// Utilidades locales
const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : u === '100g' ? Number(n).toFixed(1) + '×100g' : Number(n).toFixed(0) + ' u.';
const fmtFecha = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; };
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// CORRECCIÓN: store.now() ya es un string, no hace falta toISOString()
const today = () => store.now().slice(0, 10);

let chartCashflow = null;
let promoItems = []; // Array temporal para armar el combo en el modal

// ================= VENTAS Y ANÁLISIS =================
window.showVentTab = function(id, btn) {
    document.querySelectorAll('.vent-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('#sec-ventas .tab-pill').forEach(b => b.classList.remove('active'));
    document.getElementById('vent-' + id).style.display = 'block';
    btn.classList.add('active');
    if(id === 'promo') window.renderPromosActivas();
};

window.renderTablaVentas = function() {
    document.getElementById('tabla-ventas-menu').innerHTML = [...store.db.ventas].reverse().map(v => `<tr><td class="mono">${new Date(v.timestamp).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td><td style="font-size:.78rem;">${store.db.ventaItems.filter(i => i.ventaId === v.id).map(i => (i.isPromo ? '⭐ ' : '') + i.nombre).join(', ')}</td><td class="mono">${fmt(v.totalVenta + v.costoEnvio)}</td><td class="mono">${v.descEfectivo > 0 ? fmt(v.descEfectivo) : '—'}</td><td><span class="badge badge-ink">${v.medioPago}</span></td><td><input type="checkbox" ${v.facturada ? 'checked' : ''} onchange="store.db.ventas.find(x=>x.id==='${v.id}').facturada=this.checked;store.saveDB();"></td></tr>`).join('');
};

window.generarAnalisisPromociones = function() {
    try {
        const promos = reportes.generarAnalisisPromociones(10);
        const tbody = document.getElementById('tabla-promociones');
        if (!promos.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay suficientes datos de ventas conjuntas para generar sugerencias.</td></tr>';
            return;
        }
        tbody.innerHTML = promos.map(p => `<tr>
            <td><strong>${p.nombres.join(' + ')}</strong><br><span style="font-size:0.75rem;color:var(--muted)">Precio individual sumado: ${fmt(p.precioNormal)}</span></td>
            <td class="mono">${p.frecuencia} veces</td>
            <td><span style="color:var(--green);font-weight:bold;">Sugerido: ${fmt(p.precioPromo)}</span><br><span style="font-size:0.75rem;color:var(--accent)">(-${p.porcentaje}%)</span></td>
            <td><button class="btn btn-sm btn-primary" onclick='window.abrirModalNuevaPromo(${JSON.stringify("Promo: " + p.nombres.join(" + "))}, ${JSON.stringify(p.ids)}, ${p.porcentaje})'>Crear Promo</button></td>
        </tr>`).join('');
    } catch (e) {
        window.showToast(e.message, 'error');
    }
};

// ================= GESTIÓN DE PROMOCIONES (COMBOS) =================
window.abrirModalNuevaPromo = function(nombre = '', ids = [], desc = 15) {
    if (!store.db.promociones) store.db.promociones = [];
    promoItems = [];
    document.getElementById('promo-nombre').value = nombre || '';
    document.getElementById('promo-desc').value = desc || 15;
    
    document.getElementById('promo-add-prod').innerHTML = '<option value="">— Producto —</option>' + store.db.productos.filter(p => !p.deleted).map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
    
    if (ids && ids.length) {
        ids.forEach(id => {
            const prod = store.db.productos.find(p => p.id === id);
            if (prod) {
                promoItems.push({ id: prod.id, nombre: prod.nombre, cantidad: 1, costoU: inventario.getCostoMasAlto(prod.id), precioU: inventario.calcPrecioFinal(prod.id), unidad: prod.unidad });
            }
        });
    }
    window.calcularTotalesPromo();
    document.getElementById('modal-promo').classList.add('open');
};

window.agregarProductoPromo = function() {
    const pId = document.getElementById('promo-add-prod').value;
    const qty = parseFloat(document.getElementById('promo-add-qty').value);
    if(!pId || !qty || qty <= 0) return;
    const prod = store.db.productos.find(p => p.id === pId);
    
    const exist = promoItems.find(i => i.id === pId);
    if(exist) exist.cantidad += qty;
    else promoItems.push({ id: prod.id, nombre: prod.nombre, cantidad: qty, costoU: inventario.getCostoMasAlto(prod.id), precioU: inventario.calcPrecioFinal(prod.id), unidad: prod.unidad });
    
    document.getElementById('promo-add-qty').value = 1;
    window.calcularTotalesPromo();
};

window.quitarProductoPromo = function(idx) {
    promoItems.splice(idx, 1);
    window.calcularTotalesPromo();
};

window.calcularTotalesPromo = function() {
    const tbody = document.getElementById('tabla-promo-items');
    tbody.innerHTML = promoItems.map((i, idx) => `<tr><td>${i.nombre}</td><td class="mono">${i.cantidad}</td><td class="mono">${fmt(i.costoU)}</td><td class="mono">${fmt(i.precioU * i.cantidad)}</td><td><button class="btn btn-sm btn-danger" onclick="window.quitarProductoPromo(${idx})">✕</button></td></tr>`).join('');
    
    const costoTotal = promoItems.reduce((s, i) => s + (i.costoU * i.cantidad), 0);
    const precioNormal = promoItems.reduce((s, i) => s + (i.precioU * i.cantidad), 0);
    const desc = parseFloat(document.getElementById('promo-desc').value) || 0;
    
    let precioPromo = precioNormal * (1 - desc/100);
    if (precioPromo < costoTotal * 1.1) precioPromo = costoTotal * 1.1; 

    document.getElementById('promo-costo').textContent = fmt(costoTotal);
    document.getElementById('promo-normal').textContent = fmt(precioNormal);
    document.getElementById('promo-final').textContent = fmt(precioPromo);
};

window.guardarPromoManual = function() {
    const nombre = document.getElementById('promo-nombre').value.trim();
    if(!nombre || promoItems.length < 1) return window.showToast('Faltan datos o productos para el combo', 'error');
    
    const costoTotal = promoItems.reduce((s, i) => s + (i.costoU * i.cantidad), 0);
    const precioNormal = promoItems.reduce((s, i) => s + (i.precioU * i.cantidad), 0);
    const desc = parseFloat(document.getElementById('promo-desc').value) || 0;
    let precioPromo = precioNormal * (1 - desc/100);
    if (precioPromo < costoTotal * 1.1) precioPromo = costoTotal * 1.1;

    if (!store.db.promociones) store.db.promociones = [];
    store.db.promociones.push({ id: Date.now().toString(), nombre, items: promoItems, precioPromo, activa: true });
    
    store.saveDB();
    document.getElementById('modal-promo').classList.remove('open');
    window.renderPromosActivas();
    if(typeof window.renderPromosActivasPOS === 'function') window.renderPromosActivasPOS();
    window.showToast('Promoción guardada y activa en el POS');
};

window.renderPromosActivas = function() {
    if (!store.db.promociones) store.db.promociones = [];
    const c = document.getElementById('lista-promos-activas');
    if(!c) return;
    if(store.db.promociones.length === 0) {
        c.innerHTML = '<div style="color:var(--muted);font-size:.85rem;">No hay promociones creadas.</div>'; return;
    }
    c.innerHTML = store.db.promociones.map(p => `
        <div style="background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:1rem; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
                <div style="font-weight:bold; font-size:1.1rem; color:var(--green);">⭐ ${p.nombre}</div>
                <div style="font-size:0.8rem; color:var(--muted); margin-top:5px; padding-left:10px; border-left:2px solid var(--border);">
                    ${p.items.map(i => `${i.cantidad}x ${i.nombre}`).join('<br>')}
                </div>
            </div>
            <div style="margin-top:1rem; display:flex; justify-content:space-between; align-items:flex-end; border-top:1px dashed var(--border); padding-top:.5rem;">
                <div class="mono" style="font-size:1.4rem; font-weight:bold;">${fmt(p.precioPromo)}</div>
                <button class="btn btn-sm btn-danger" onclick="if(confirm('¿Eliminar promoción?')){ store.db.promociones = store.db.promociones.filter(x=>x.id!=='${p.id}'); store.saveDB(); window.renderPromosActivas(); if(typeof window.renderPromosActivasPOS === 'function') window.renderPromosActivasPOS(); }">✕ Borrar</button>
            </div>
        </div>
    `).join('');
};

// ================= PROVEEDORES Y DEUDAS =================
window.agregarProveedor = function() { try { proveedores.agregar(document.getElementById('prov-nombre').value, document.getElementById('prov-contacto').value, document.getElementById('prov-tel').value, Array.from(document.getElementById('prov-dias-pedido').selectedOptions).map(o=>o.value), Array.from(document.getElementById('prov-dias-entrega').selectedOptions).map(o=>o.value)); store.saveDB(); window.renderTablaProveedores(); if(typeof window.populateSelects === 'function') window.populateSelects(); window.showToast('Proveedor agregado'); } catch(e) { window.showToast(e.message,'error'); } };
window.abrirEditarProv = function(id) { const p = store.db.proveedores.find(x => x.id === id); if (!p) return; document.getElementById('eprov-id').value = id; document.getElementById('eprov-nombre').value = p.nombre; document.getElementById('eprov-contacto').value = p.contacto || ''; document.getElementById('eprov-tel').value = p.tel || ''; Array.from(document.getElementById('eprov-dias-pedido').options).forEach(o => o.selected = (p.diasPedido || []).includes(o.value)); Array.from(document.getElementById('eprov-dias-entrega').options).forEach(o => o.selected = (p.diasEntrega || []).includes(o.value)); document.getElementById('modal-edit-prov').classList.add('open'); };
window.guardarEditProv = function() { try { proveedores.editar(document.getElementById('eprov-id').value, document.getElementById('eprov-nombre').value, document.getElementById('eprov-contacto').value, document.getElementById('eprov-tel').value, Array.from(document.getElementById('eprov-dias-pedido').selectedOptions).map(o=>o.value), Array.from(document.getElementById('eprov-dias-entrega').selectedOptions).map(o=>o.value)); store.saveDB(); document.getElementById('modal-edit-prov').classList.remove('open'); window.renderTablaProveedores(); window.showToast('Proveedor actualizado'); } catch(e) { window.showToast(e.message, 'error'); } };
window.eliminarProveedor = function(id) { try { if(confirm('¿Eliminar proveedor? Historial de compras se mantendrá.')) { proveedores.eliminar(id); store.saveDB(); window.renderTablaProveedores(); if(typeof window.populateSelects === 'function') window.populateSelects(); window.showToast('Proveedor eliminado'); } } catch(e) { window.showToast(e.message, 'error'); } };
window.registrarDeuda = function() { try { proveedores.registrarDeuda(document.getElementById('deuda-prov').value, document.getElementById('deuda-fecha').value, document.getElementById('deuda-monto').value, document.getElementById('deuda-desc').value); store.saveDB(); window.renderTablaDeudas(); window.showToast('Deuda registrada'); } catch(e) { window.showToast(e.message, 'error'); } };
window.abrirPagoDeuda = function(id) { document.getElementById('pd-id').value = id; document.getElementById('pd-monto').value = '0'; document.getElementById('pd-descuento').value = '0'; document.getElementById('modal-pago-deuda').classList.add('open'); };
window.confirmarPagoDeuda = function() { try { proveedores.registrarPagoDeuda(document.getElementById('pd-id').value, document.getElementById('pd-monto').value, document.getElementById('pd-descuento').value, document.getElementById('pd-cuenta').value, today()); store.saveDB(); document.getElementById('modal-pago-deuda').classList.remove('open'); window.renderTablaDeudas(); window.renderFinanzasTotales(); window.showToast('Pago registrado'); } catch(e) { window.showToast(e.message, 'error'); } };

window.renderTablaProveedores = function() { document.getElementById('tabla-proveedores-container').innerHTML = store.db.proveedores.filter(p=>!p.deleted).map(p => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:start;"><div class="card-title" style="margin-bottom:0;border:none;">${p.nombre}</div><div><button class="btn btn-secondary btn-sm" onclick="window.abrirEditarProv('${p.id}')">✏</button> <button class="btn btn-danger btn-sm" onclick="window.eliminarProveedor('${p.id}')">✕</button></div></div><div style="font-size:.8rem;color:var(--muted)">📞 ${p.tel || '—'} | Pedido: ${(p.diasPedido || []).map(d => DIAS_SEMANA[d]).join(', ')} | Entrega: ${(p.diasEntrega || []).map(d => DIAS_SEMANA[d]).join(', ')}</div></div>`).join(''); };
window.renderTablaDeudas = function() { document.getElementById('tabla-deudas').innerHTML = store.db.cuentasPorPagar.filter(d => !d.pagado).map(d => `<tr><td class="mono">${fmtFecha(d.fecha)}</td><td>${store.db.proveedores.find(x => x.id === d.proveedorId)?.nombre}</td><td>${d.descripcion}</td><td class="mono">${fmt(d.monto)}</td><td class="mono" style="color:var(--accent);font-weight:600;">${fmt(d.monto - d.pagos.reduce((s,p)=>s+p.monto,0))}</td><td><button class="btn btn-green btn-sm" onclick="window.abrirPagoDeuda('${d.id}')">Pagar</button></td></tr>`).join(''); };

// ================= GASTOS Y ENVÍOS =================
window.renderEnviosPendientes = function() {
    const pend = store.db.ventas.filter(v => v.costoEnvio > 0 && !v.envioPagado);
    const total = pend.reduce((s, v) => s + v.costoEnvio, 0);
    const el = document.getElementById('envios-pendientes-total'); if(el) el.textContent = fmt(total);
    return { pend, total };
};
window.pagarCadete = function() {
    try {
        const { pend, total } = window.renderEnviosPendientes();
        if (total <= 0) return window.showToast('No hay envíos pendientes', 'error');
        const cId = document.getElementById('envios-cuenta').value; if (!cId) return window.showToast('Seleccioná una cuenta', 'error');
        finanzas.registrarGasto(today(), 'Logística / Envíos', 'variable', total, cId, 'Liquidación a Cadete');
        pend.forEach(v => v.envioPagado = true); store.saveDB(); window.renderEnviosPendientes(); window.renderTablaGastos(); window.renderFinanzasTotales(); window.showToast('Cadete pagado correctamente');
    } catch(e) { window.showToast(e.message, 'error'); }
};

window.registrarGasto = function() { try { finanzas.registrarGasto(document.getElementById('gasto-fecha').value, document.getElementById('gasto-cat').value, document.getElementById('gasto-tipo').value, document.getElementById('gasto-importe').value, document.getElementById('gasto-cuenta').value, document.getElementById('gasto-desc').value); store.saveDB(); window.renderTablaGastos(); window.renderFinanzasTotales(); window.showToast('Gasto ok'); } catch(e) { window.showToast(e.message, 'error'); } };
window.renderTablaGastos = function() { 
    const agrupados = {};
    store.db.gastos.forEach(g => { const k = `${g.fecha}_${g.categoria}_${g.descripcion || ''}`; if (!agrupados[k]) agrupados[k] = { ...g, ids: [g.id] }; else { agrupados[k].importe += g.importe; agrupados[k].ids.push(g.id); } });
    const arr = Object.values(agrupados).sort((a,b) => b.fecha.localeCompare(a.fecha));
    document.getElementById('tabla-gastos').innerHTML = arr.map(g => `<tr><td class="mono">${fmtFecha(g.fecha)}</td><td>${g.categoria}${g.ids.length > 1 ? ` <span style="font-size:.7rem;color:var(--muted)">(x${g.ids.length})</span>` : ''}</td><td><span class="badge ${g.tipo === 'fijo' ? 'badge-purple' : 'badge-ink'}">${g.tipo}</span></td><td>${g.descripcion || '—'}</td><td class="mono">${fmt(g.importe)}</td><td>${store.db.cuentas.find(x => x.id === g.cuentaId)?.nombre || 'Varios'}</td><td><button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar registro${g.ids.length>1?'s agrupados':''}?')){store.db.gastos=store.db.gastos.filter(x=> !${JSON.stringify(g.ids)}.includes(x.id));store.saveDB();window.renderTablaGastos();window.renderFinanzasTotales();}">✕</button></td></tr>`).join(''); 
};

// ================= FINANZAS Y CAJA =================
window.crearCuenta = function() { try { finanzas.crearCuenta(document.getElementById('nueva-cta-nombre').value, document.getElementById('nueva-cta-saldo').value); store.saveDB(); window.renderCuentas(); if(typeof window.populateSelects === 'function') window.populateSelects(); } catch(e) { window.showToast(e.message, 'error'); } };
window.ajustarCaja = function(cId, inp) { const aj = finanzas.ajustarCaja(cId, inp.value, today()); if(aj) { store.saveDB(); window.renderCuentas(); window.renderFinanzasTotales(); window.showToast('Ajuste guardado'); } };
window.eliminarCuenta = function(cId) { try { if(confirm('¿Estás seguro de querer ocultar y borrar esta cuenta? (Solo será posible si su saldo es exactamente $0)')) { finanzas.eliminarCuenta(cId); store.saveDB(); window.renderCuentas(); if(typeof window.populateSelects === 'function') window.populateSelects(); window.showToast('Cuenta eliminada y ocultada correctamente'); } } catch(e) { window.showToast(e.message, 'error'); } };

// CORRECCIÓN: Inyección de saldos y fechas en los desplegables de transferencia
window.renderCuentas = function() { 
    document.getElementById('lista-cuentas').innerHTML = store.db.cuentas.filter(c => !c.deleted).map(c => `<div class="account-card"><div style="display:flex;justify-content:space-between;"><div class="account-name">${c.nombre}</div><button class="btn btn-danger btn-sm" onclick="window.eliminarCuenta('${c.id}')" title="Borrar cuenta" style="padding: 2px 6px;">✕</button></div><div class="account-bal">${fmt(finanzas.calcSaldoCuenta(c.id))}</div><div style="display:flex;gap:.3rem;margin-top:.5rem;"><input type="number" placeholder="Saldo Real" id="real-${c.id}" style="padding:.3rem;font-size:.8rem;"><button class="btn btn-secondary btn-sm" onclick="window.ajustarCaja('${c.id}', document.getElementById('real-${c.id}'))">Ajustar</button></div></div>`).join(''); 
    
    const opcionesCuentas = store.db.cuentas.filter(c => !c.deleted).map(c => `<option value="${c.id}">${c.nombre} (${fmt(finanzas.calcSaldoCuenta(c.id))})</option>`).join('');
    if(document.getElementById('transf-origen')) document.getElementById('transf-origen').innerHTML = opcionesCuentas;
    if(document.getElementById('transf-destino')) document.getElementById('transf-destino').innerHTML = opcionesCuentas;
    if(document.getElementById('transf-fecha') && !document.getElementById('transf-fecha').value) document.getElementById('transf-fecha').value = today();
};

window.registrarTransferencia = function() {
    try { 
        const origen = document.getElementById('transf-origen').value; 
        const destino = document.getElementById('transf-destino').value; 
        const monto = document.getElementById('transf-monto').value; 
        const fecha = document.getElementById('transf-fecha').value; 
        finanzas.registrarTransferencia(origen, destino, monto, fecha); 
        store.saveDB(); 
        window.renderCuentas(); 
        window.renderFinanzasTotales(); 
        window.showToast('Transferencia registrada exitosamente'); 
        document.getElementById('transf-monto').value = ''; 
    } catch(e) { window.showToast(e.message, 'error'); }
};

window.renderFinanzasTotales = function() { document.getElementById('fin-capital').textContent = fmt(finanzas.getPatrimonioNeto() - finanzas.calcGananciaNetaGlobal()); document.getElementById('fin-ganancia').textContent = fmt(finanzas.calcGananciaSinAsignar()); document.getElementById('fin-liquidez').textContent = fmt(store.db.cuentas.reduce((s, c) => s + finanzas.calcSaldoCuenta(c.id), 0)); };
window.renderCashflow = function() {
    const ctx = document.getElementById('chart-cashflow'); if (!ctx) return; 
    if (chartCashflow) chartCashflow.destroy();
    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 29 + i); return d.toISOString().slice(0, 10); });
    const ing = days.map(d => store.db.ventas.filter(v => v.fecha === d).reduce((s, v) => s + v.totalVenta, 0) + store.db.movimientos.filter(m => m.fecha === d && m.tipo === 'deposito').reduce((s, m) => s + m.importe, 0) + store.db.ajustesCaja.filter(a => a.fecha === d && a.tipo === 'ingreso').reduce((s, a) => s + a.diferencia, 0));
    const egr = days.map(d => store.db.gastos.filter(g => g.fecha === d).reduce((s, g) => s + g.importe, 0) + store.db.cuentasPorPagar.reduce((s, deuda) => s + (deuda.pagos || []).filter(p => p.fecha === d && p.tipo==='pago').reduce((x, p) => x + p.monto, 0), 0) + store.db.lotes.filter(l => l.fecha === d && l.cuentaId).reduce((s, l) => s + (l.cantOriginal * l.costoUnit), 0) + store.db.movimientos.filter(m => m.fecha === d && m.tipo === 'retiro').reduce((s, m) => s + m.importe, 0) + store.db.ajustesCaja.filter(a => a.fecha === d && a.tipo === 'perdida').reduce((s, a) => s + Math.abs(a.diferencia), 0));
    chartCashflow = new Chart(ctx, { type: 'bar', data: { labels: days.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)), datasets: [{ label: 'Ingresos Reales (Caja)', data: ing, backgroundColor: 'rgba(42,107,60,.8)' }, { label: 'Egresos Reales (Pagos)', data: egr, backgroundColor: 'rgba(196,67,42,.8)' }] }, options: { responsive: true, maintainAspectRatio: false } });
};

// ================= SOCIOS =================
window.agregarSocio = function() { try { socios.agregar(document.getElementById('socio-nombre').value, document.getElementById('socio-dni').value); store.saveDB(); window.renderSocios(); if(typeof window.populateSelects === 'function') window.populateSelects(); window.showToast('Socio agregado'); } catch(e) { window.showToast(e.message, 'error'); } };
window.eliminarSocio = function(id) { try { if(confirm('¿Eliminar?')) { socios.eliminar(id); store.saveDB(); window.renderSocios(); if(typeof window.populateSelects === 'function') window.populateSelects(); window.showToast('Eliminado'); } } catch(e) { window.showToast(e.message, 'error'); } };
window.registrarMovimientoSocio = function() { try { socios.registrarMovimiento(document.getElementById('mov-socio').value, document.getElementById('mov-tipo').value, document.getElementById('mov-importe').value, document.getElementById('mov-cuenta').value, document.getElementById('mov-fecha').value); store.saveDB(); window.renderSocios(); window.renderFinanzasTotales(); window.showToast('Registrado'); } catch(e) { window.showToast(e.message, 'error'); } };
window.abrirRetiroSocio = function() { document.getElementById('rs-prod').innerHTML = '<option value="">— Seleccionar —</option>' + store.db.productos.filter(p => !p.deleted && inventario.getStock(p.id) > 0).map(p => `<option value="${p.id}">${p.nombre} (Stock: ${inventario.getStock(p.id)})</option>`).join(''); document.getElementById('modal-retiro-socio').classList.add('open'); };
window.confirmarRetiroSocio = function() { try { const pId = document.getElementById('rs-prod').value; const qty = parseFloat(document.getElementById('rs-qty').value); if(document.getElementById('rs-accion').value === 'descontar') { const { costoTotal } = inventario.consumirPEPS(pId, qty); socios.registrarMovimiento(document.getElementById('rs-socio').value, 'retiro', costoTotal, '', today()); } else { inventario.consumirParaMuestra(pId, qty, today()); } store.saveDB(); if(typeof window.renderTablaProductos === 'function') window.renderTablaProductos(); document.getElementById('modal-retiro-socio').classList.remove('open'); window.showToast('Retiro registrado'); } catch(e) { window.showToast(e.message, 'error'); } };
window.renderSocios = function() { document.getElementById('soc-neta').textContent = fmt(finanzas.calcGananciaNetaGlobal()); document.getElementById('soc-disp').textContent = fmt(finanzas.calcGananciaSinAsignar()); document.getElementById('lista-socios').innerHTML = store.db.socios.filter(s => !s.deleted).map(s => { const saldo = finanzas.calcSaldoSocio(s.id); return `<div style="display:inline-flex;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:.3rem .6rem;margin:.2rem;font-size:.85rem;"><span style="font-weight:600;margin-right:.5rem;">${s.nombre}</span> <span class="badge ${saldo >= 0 ? 'badge-green' : 'badge-red'}">Saldo: ${fmt(saldo)}</span><button onclick="window.eliminarSocio('${s.id}')" style="background:none;border:none;color:var(--accent);cursor:pointer;margin-left:.4rem;font-weight:600;">✕</button></div>`; }).join(''); };

// ================= INDICADORES E INFORMES =================
window.renderIndicadores = function() {
    const pN = finanzas.getPatrimonioNeto(); const mes = today().slice(0, 7);
    const gfijos = store.db.gastos.filter(g => g.tipo === 'fijo' && g.fecha.startsWith(mes)).reduce((s, g) => s + g.importe, 0);
    const vtasM = store.db.ventas.filter(v => v.fecha.startsWith(mes)).reduce((s, v) => s + v.totalVenta, 0);
    const costM = store.db.ventas.filter(v => v.fecha.startsWith(mes)).reduce((s, v) => s + v.totalCosto, 0);
    const pEq = vtasM > costM ? gfijos / ((vtasM - costM) / vtasM) : 0;
    const stockV = store.db.productos.filter(p => !p.deleted).reduce((s, p) => s + (inventario.getStock(p.id) * inventario.getCostoMasAlto(p.id)), 0);
    const rot = stockV > 0 ? (store.db.ventaItems.reduce((s, vi) => s + vi.costoTotal, 0) / stockV).toFixed(1) : 0;
    document.getElementById('dash-indicadores').innerHTML = `<div class="stat-card"><div class="stat-label">Patrimonio Neto</div><div class="stat-value">${fmt(pN)}</div></div><div class="stat-card"><div class="stat-label">Pto de Equilibrio (Mes)</div><div class="stat-value">${fmt(pEq)}</div></div><div class="stat-card"><div class="stat-label">Rotación Inventario</div><div class="stat-value">${rot}x</div></div>`;
};

window.generarInforme = function() {
    const { vts, vIng, vCosto } = reportes.getDatosInformeVentas(document.getElementById('inf-desde').value, document.getElementById('inf-hasta').value);
    document.getElementById('stat-grid').innerHTML = `<div class="stat-card"><div class="stat-label">Ventas Periodo</div><div class="stat-value">${fmt(vIng)}</div></div><div class="stat-card"><div class="stat-label">Costo (CMV)</div><div class="stat-value">${fmt(vCosto)}</div></div><div class="stat-card"><div class="stat-label">Margen Bruto</div><div class="stat-value">${fmt(vIng - vCosto)}</div></div>`;
    document.getElementById('tabla-inf-ventas').innerHTML = vts.map(v => `<tr><td class="mono">${fmtFecha(v.fecha)}</td><td>${store.db.ventaItems.filter(i => i.ventaId === v.id).map(i => (i.isPromo ? '⭐ ' : '') + i.nombre).join(', ')}</td><td class="mono">${fmt(v.totalCosto)}</td><td class="mono">${fmt(v.totalVenta)}</td><td class="mono">${fmt(v.totalVenta - v.totalCosto)}</td></tr>`).join('');
    
    const asientos = reportes.generarAsientosDiario(document.getElementById('inf-desde').value, document.getElementById('inf-hasta').value);
    let htmlDiario = ''; let tDebe = 0; let tHaber = 0;
    asientos.forEach(as => { htmlDiario += `<tr class="diario-header"><td class="mono" colspan="4">${fmtFecha(as.f)} | 📑 ${as.r}</td></tr>`; as.ls.forEach(l => { tDebe += l.d; tHaber += l.h; htmlDiario += `<tr class="diario-row"><td style="width:15%"></td><td class="diario-cuenta ${l.h > 0 ? 'haber' : ''}">${l.c}</td><td class="mono" style="text-align:right;color:var(--blue);">${l.d > 0 ? fmt(l.d) : ''}</td><td class="mono" style="text-align:right;color:var(--accent);">${l.h > 0 ? fmt(l.h) : ''}</td></tr>`; }); });
    if (!asientos.length) htmlDiario = '<tr><td colspan="4" style="text-align:center;">Sin registros</td></tr>';
    else htmlDiario += `<tr style="font-weight:900;background:var(--amber-light);"><td colspan="2" style="text-align:right">TOTALES</td><td class="mono" style="text-align:right;">${fmt(tDebe)}</td><td class="mono" style="text-align:right;">${fmt(tHaber)}</td></tr>`;
    document.getElementById('tabla-diario').innerHTML = htmlDiario;
};

window.generarReporteVencimientos = function() {
    const dias = parseInt(document.getElementById('venc-dias').value) || 30;
    const resultados = reportes.getProximosVencimientos(dias);
    const tbody = document.getElementById('tabla-inf-vencimientos');
    
    if (!resultados.length) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--green);font-weight:bold;">No hay productos que venzan en los próximos ${dias} días.</td></tr>`; return; }
    tbody.innerHTML = resultados.map(r => `<tr><td><strong>${r.producto}</strong></td><td>${r.proveedor}</td><td class="mono">${fmtFecha(r.vencimiento)}</td><td class="mono">${fmtQty(r.stock, r.unidad)}</td><td><span class="badge ${r.diasRestantes <= 7 ? 'badge-red' : 'badge-amber'}">${r.diasRestantes} días</span></td></tr>`).join('');
};

window.generarPDFPedidos = function() { reportes.generarPDFPedidos(); };
window.generarListaPrecios = function() { reportes.generarListaPrecios(); };

module.exports = {};