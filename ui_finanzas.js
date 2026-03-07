const store = require('./store.js');
const proveedores = require('./proveedores.js');
const finanzas = require('./finanzas.js');
const socios = require('./socios.js');
const reportes = require('./reportes.js');
const inventario = require('./inventario.js');

// Utilidades locales
const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : Number(n).toFixed(0) + ' u.';
const fmtFecha = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; };
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// CORRECCIÓN: store.now() ya es un string, no hace falta toISOString()
const today = () => store.now().slice(0, 10);

let chartCashflow = null;
let promoItems = []; // Array temporal para armar el combo en el modal

// ================= VENTAS Y ANÁLISIS =================
window.showVentTab = function (id, btn) {
    document.querySelectorAll('.vent-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('#sec-ventas .tab-pill').forEach(b => b.classList.remove('active'));
    document.getElementById('vent-' + id).style.display = 'block';
    btn.classList.add('active');
    if (id === 'promo') window.uiCombos.renderGrillaPromosActivas();
};

window.renderTablaVentas = function () {
    document.getElementById('tabla-ventas-menu').innerHTML = [...store.db.ventas].reverse().map(v => `<tr><td class="mono">${new Date(v.timestamp).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td><td style="font-size:.78rem;">${store.db.ventaItems.filter(i => i.ventaId === v.id).map(i => (i.isPromo ? '⭐ ' : '') + i.nombre).join(', ')}</td><td class="mono">${fmt(v.totalVenta + v.costoEnvio)}</td><td class="mono">${v.descEfectivo > 0 ? fmt(v.descEfectivo) : '—'}</td><td><span class="badge badge-ink">${v.medioPago}</span></td><td><input type="checkbox" ${v.facturada ? 'checked' : ''} onchange="store.db.ventas.find(x=>x.id==='${v.id}').facturada=this.checked;/* store.saveDB() removido */"></td></tr>`).join('');
};



// ================= PROVEEDORES Y DEUDAS =================
window.agregarProveedor = function () {
    try {
        proveedores.agregar(document.getElementById('prov-nombre').value, document.getElementById('prov-contacto').value, document.getElementById('prov-tel').value, '', '', Array.from(document.getElementById('prov-dias-pedido').selectedOptions).map(o => o.value), Array.from(document.getElementById('prov-dias-entrega').selectedOptions).map(o => o.value));
        window.renderTablaProveedores();
        if (typeof window.populateSelects === 'function') window.populateSelects();

        document.getElementById('prov-nombre').value = '';
        document.getElementById('prov-contacto').value = '';
        document.getElementById('prov-tel').value = '';
        document.getElementById('prov-dias-pedido').selectedIndex = -1;
        document.getElementById('prov-dias-entrega').selectedIndex = -1;

        window.showToast('Proveedor agregado');
    } catch (e) { window.showToast(e.message, 'error'); }
};
window.abrirEditarProv = function (id) { const p = store.db.proveedores.find(x => x.id === id); if (!p) return; document.getElementById('eprov-id').value = id; document.getElementById('eprov-nombre').value = p.nombre; document.getElementById('eprov-contacto').value = p.contacto || ''; document.getElementById('eprov-tel').value = p.tel || ''; Array.from(document.getElementById('eprov-dias-pedido').options).forEach(o => o.selected = (p.diasPedido || []).includes(o.value)); Array.from(document.getElementById('eprov-dias-entrega').options).forEach(o => o.selected = (p.diasEntrega || []).includes(o.value)); document.getElementById('modal-edit-prov').classList.add('open'); };
window.guardarEditProv = function () { try { proveedores.editar(document.getElementById('eprov-id').value, document.getElementById('eprov-nombre').value, document.getElementById('eprov-contacto').value, document.getElementById('eprov-tel').value, '', '', Array.from(document.getElementById('eprov-dias-pedido').selectedOptions).map(o => o.value), Array.from(document.getElementById('eprov-dias-entrega').selectedOptions).map(o => o.value)); document.getElementById('modal-edit-prov').classList.remove('open'); window.renderTablaProveedores(); window.showToast('Proveedor actualizado'); } catch (e) { window.showToast(e.message, 'error'); } };
window.eliminarProveedor = function (id) { try { if (confirm('¿Eliminar proveedor? Historial de compras se mantendrá.')) { proveedores.eliminar(id); window.renderTablaProveedores(); if (typeof window.populateSelects === 'function') window.populateSelects(); window.showToast('Proveedor eliminado'); } } catch (e) { window.showToast(e.message, 'error'); } };
window.registrarDeuda = function () { try { proveedores.registrarDeuda(document.getElementById('deuda-prov').value, document.getElementById('deuda-fecha').value, document.getElementById('deuda-monto').value, document.getElementById('deuda-desc').value); window.renderTablaDeudas(); window.showToast('Deuda registrada'); } catch (e) { window.showToast(e.message, 'error'); } };
window.abrirPagoDeuda = function (id) {
    const d = store.db.cuentasPorPagar.find(x => x.id === id);
    if (!d) return;
    const pagado = d.pagos.reduce((s, p) => s + p.monto, 0);
    const restante = parseFloat((d.monto - pagado).toFixed(2));

    document.getElementById('pd-id').value = id;
    document.getElementById('pd-monto').value = restante > 0 ? restante : '0';
    document.getElementById('pd-descuento').value = '0';
    document.getElementById('modal-pago-deuda').classList.add('open');
};
window.confirmarPagoDeuda = function () { try { proveedores.registrarPagoDeuda(document.getElementById('pd-id').value, document.getElementById('pd-monto').value, document.getElementById('pd-descuento').value, document.getElementById('pd-cuenta').value, today()); /* store.saveDB() removido */ document.getElementById('modal-pago-deuda').classList.remove('open'); window.renderTablaDeudas(); window.renderFinanzasTotales(); window.showToast('Pago registrado'); } catch (e) { window.showToast(e.message, 'error'); } };

window.renderTablaProveedores = function () { document.getElementById('tabla-proveedores-container').innerHTML = store.db.proveedores.filter(p => !p.deleted).map(p => `<div class="card"><div style="display:flex;justify-content:space-between;align-items:start;"><div class="card-title" style="margin-bottom:0;border:none;">${p.nombre}</div><div><button class="btn btn-secondary btn-sm" onclick="window.abrirEditarProv('${p.id}')">✏️ Modificar</button> <button class="btn btn-danger btn-sm" onclick="window.eliminarProveedor('${p.id}')">🗑️</button></div></div><div style="font-size:.8rem;color:var(--muted)">📞 ${p.tel || '—'} | Pedido: ${(p.diasPedido || []).map(d => DIAS_SEMANA[d]).join(', ')} | Entrega: ${(p.diasEntrega || []).map(d => DIAS_SEMANA[d]).join(', ')}</div></div>`).join(''); };
window.renderTablaDeudas = function () { document.getElementById('tabla-deudas').innerHTML = store.db.cuentasPorPagar.filter(d => !d.pagado).map(d => `<tr><td class="mono">${fmtFecha(d.fecha)}</td><td>${store.db.proveedores.find(x => x.id === d.proveedorId)?.nombre}</td><td>${d.descripcion}</td><td class="mono">${fmt(d.monto)}</td><td class="mono" style="color:var(--accent);font-weight:600;">${fmt(d.monto - d.pagos.reduce((s, p) => s + p.monto, 0))}</td><td><button class="btn btn-success btn-sm" onclick="window.abrirPagoDeuda('${d.id}')">✅ Pagar</button></td></tr>`).join(''); };

// ================= GASTOS Y ENVÍOS =================
window.renderEnviosPendientes = function () {
    const pend = store.db.ventas.filter(v => v.costoEnvio > 0 && !v.envioPagado);
    const total = pend.reduce((s, v) => s + v.costoEnvio, 0);
    const el = document.getElementById('envios-pendientes-total'); if (el) el.textContent = fmt(total);
    return { pend, total };
};
window.pagarCadete = function () {
    try {
        const { pend, total } = window.renderEnviosPendientes();
        if (total <= 0) return window.showToast('No hay envíos pendientes', 'error');
        const cId = document.getElementById('envios-cuenta').value; if (!cId) return window.showToast('Seleccioná una cuenta', 'error');
        finanzas.registrarGasto(today(), 'Logística / Envíos', 'variable', total, cId, 'Liquidación a Cadete');
        pend.forEach(v => v.envioPagado = true); window.renderEnviosPendientes(); window.renderTablaGastos(); window.renderFinanzasTotales(); window.showToast('Cadete pagado correctamente');
    } catch (e) { window.showToast(e.message, 'error'); }
};

window.registrarGasto = function () {
    try {
        const estado = document.getElementById('gasto-estado').value;
        const cuenta = document.getElementById('gasto-cuenta').value;

        finanzas.registrarGasto(
            document.getElementById('gasto-fecha').value,
            document.getElementById('gasto-cat').value,
            document.getElementById('gasto-tipo').value,
            document.getElementById('gasto-importe').value,
            cuenta,
            document.getElementById('gasto-desc').value,
            estado
        );

        window.renderTablaGastos();
        window.renderTablaGastosProgramados();
        window.renderFinanzasTotales();
        window.renderCuentas();
        window.showToast('Gasto registrado exitosamente');
    } catch (e) {
        window.showToast(e.message, 'error');
    }
};

window.renderTablaGastos = function () {
    const agrupados = {};
    // Feature: Solo mostrar en historial los que ya están pagados
    store.db.gastos.filter(g => g.estado === 'pagado').forEach(g => {
        const k = `${g.fecha}_${g.categoria}_${g.descripcion || ''}`;
        if (!agrupados[k]) agrupados[k] = { ...g, ids: [g.id] };
        else { agrupados[k].importe += g.importe; agrupados[k].ids.push(g.id); }
    });

    const arr = Object.values(agrupados).sort((a, b) => b.fecha.localeCompare(a.fecha));

    document.getElementById('tabla-gastos').innerHTML = arr.map(g => `<tr><td class="mono">${fmtFecha(g.fecha)}</td><td>${g.categoria}${g.ids.length > 1 ? ` <span style="font-size:.7rem;color:var(--muted)">(x${g.ids.length})</span>` : ''}</td><td><span class="badge ${g.tipo === 'fijo' ? 'badge-purple' : 'badge-ink'}">${g.tipo}</span></td><td>${g.descripcion || '—'}</td><td class="mono">${fmt(g.importe)}</td><td>${store.db.cuentas.find(x => x.id === g.cuentaId)?.nombre || 'Varios'}</td><td><button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar registro${g.ids.length > 1 ? 's agrupados' : ''}?')){ finanzas.eliminarGastos(${JSON.stringify(g.ids).replace(/"/g, "'")}); window.renderTablaGastos(); window.renderFinanzasTotales(); }">✕</button></td></tr>`).join('');
};

window.renderTablaGastosProgramados = function () {
    const pendientes = store.db.gastos.filter(g => g.estado === 'pendiente').sort((a, b) => a.fecha.localeCompare(b.fecha));
    const tbody = document.getElementById('tabla-gastos-pendientes');
    if (!tbody) return;

    if (pendientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);">No hay gastos programados pendientes.</td></tr>';
        return;
    }

    const opcionesCuentas = store.db.cuentas.filter(c => !c.deleted).map(c => `<option value="${c.id}">${c.nombre} (${fmt(finanzas.calcSaldoCuenta(c.id))})</option>`).join('');

    tbody.innerHTML = pendientes.map(g => `
        <tr>
            <td class="mono" style="color:var(--accent); font-weight:bold;">${fmtFecha(g.fecha)}</td>
            <td>${g.categoria}</td>
            <td>${g.descripcion || '—'}</td>
            <td class="mono text-accent" style="font-size:1.1rem;">${fmt(g.importe)}</td>
            <td><select id="pagar-cuenta-${g.id}" class="form-control form-control-sm" style="max-width:200px;">${opcionesCuentas}</select></td>
            <td><button class="btn btn-success btn-sm" onclick="window.liquidarGastoProgramado('${g.id}')">💸 Liquidar</button></td>
        </tr>
    `).join('');
};

window.liquidarGastoProgramado = function (id) {
    try {
        const cuentaId = document.getElementById('pagar-cuenta-' + id).value;
        if (!cuentaId) return window.showToast('Debe seleccionar una cuenta para pagar', 'error');

        finanzas.liquidarGastoProgramado(id, cuentaId);

        window.renderTablaGastosProgramados();
        window.renderTablaGastos();
        window.renderFinanzasTotales();
        window.renderCuentas();
        window.showToast('Gasto liquidado correctamente', 'success');
    } catch (e) {
        window.showToast(e.message, 'error');
    }
};

// ================= FINANZAS Y CAJA =================
window.crearCuenta = function () {
    try {
        finanzas.crearCuenta(document.getElementById('nueva-cta-nombre').value, document.getElementById('nueva-cta-saldo').value);
        /* store.saveDB() removido */
        window.renderCuentas();
        if (typeof window.populateSelects === 'function') window.populateSelects();
        document.getElementById('nueva-cta-nombre').value = '';
        document.getElementById('nueva-cta-saldo').value = '';
        window.showToast('Cuenta creada correctamente', 'success');
    } catch (e) {
        window.showToast(e.message, 'error');
    }
};
window.ajustarCaja = function (cId, inp) { const aj = finanzas.ajustarCaja(cId, inp.value, today()); if (aj) { /* store.saveDB() removido */ window.renderCuentas(); window.renderFinanzasTotales(); window.showToast('Ajuste guardado'); } };
window.eliminarCuenta = function (cId) { try { if (confirm('¿Estás seguro de querer ocultar y borrar esta cuenta? (Solo será posible si su saldo es exactamente $0)')) { finanzas.eliminarCuenta(cId); /* store.saveDB() removido */ window.renderCuentas(); if (typeof window.populateSelects === 'function') window.populateSelects(); window.showToast('Cuenta eliminada y ocultada correctamente'); } } catch (e) { window.showToast(e.message, 'error'); } };

// CORRECCIÓN: Inyección de saldos y fechas en los desplegables de transferencia
window.renderCuentas = function () {
    document.getElementById('lista-cuentas').innerHTML = store.db.cuentas.filter(c => !c.deleted).map(c => `<div class="account-card"><div style="display:flex;justify-content:space-between;"><div class="account-name">${c.nombre}</div><button class="btn btn-danger btn-sm" onclick="window.eliminarCuenta('${c.id}')" title="Borrar cuenta" style="padding: 2px 6px;">🗑️</button></div><div class="account-bal">${fmt(finanzas.calcSaldoCuenta(c.id))}</div><div style="display:flex;gap:.3rem;margin-top:.5rem;"><input type="number" placeholder="Saldo Real" id="real-${c.id}" style="padding:.3rem;font-size:.8rem;"><button class="btn btn-primary btn-sm" onclick="window.ajustarCaja('${c.id}', document.getElementById('real-${c.id}'))">⚖️ Ajustar</button></div></div>`).join('');

    const opcionesCuentas = store.db.cuentas.filter(c => !c.deleted).map(c => `<option value="${c.id}">${c.nombre} (${fmt(finanzas.calcSaldoCuenta(c.id))})</option>`).join('');
    if (document.getElementById('transf-origen')) document.getElementById('transf-origen').innerHTML = opcionesCuentas;
    if (document.getElementById('transf-destino')) document.getElementById('transf-destino').innerHTML = opcionesCuentas;
    if (document.getElementById('transf-fecha') && !document.getElementById('transf-fecha').value) document.getElementById('transf-fecha').value = today();
};

window.registrarTransferencia = function () {
    try {
        const origen = document.getElementById('transf-origen').value;
        const destino = document.getElementById('transf-destino').value;
        const monto = document.getElementById('transf-monto').value;
        const fecha = document.getElementById('transf-fecha').value;
        finanzas.registrarTransferencia(origen, destino, monto, fecha);
        /* store.saveDB() removido */
        window.renderCuentas();
        window.renderFinanzasTotales();
        window.showToast('Transferencia registrada exitosamente');
        document.getElementById('transf-monto').value = '';
    } catch (e) { window.showToast(e.message, 'error'); }
};

window.renderFinanzasTotales = function () { document.getElementById('fin-capital').textContent = fmt(finanzas.getPatrimonioNeto() - finanzas.calcGananciaNetaGlobal()); document.getElementById('fin-ganancia').textContent = fmt(finanzas.calcGananciaSinAsignar()); document.getElementById('fin-liquidez').textContent = fmt(store.db.cuentas.reduce((s, c) => s + finanzas.calcSaldoCuenta(c.id), 0)); };
window.renderCashflow = function () {
    const ctx = document.getElementById('chart-cashflow'); if (!ctx) return;
    if (chartCashflow) chartCashflow.destroy();

    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 29 + i); return d.toISOString().slice(0, 10); });

    const ing = days.map(d => store.db.ventas.filter(v => v.fecha === d).reduce((s, v) => s + v.totalVenta, 0) + store.db.movimientos.filter(m => m.fecha === d && m.tipo === 'deposito').reduce((s, m) => s + m.importe, 0) + store.db.ajustesCaja.filter(a => a.fecha === d && a.tipo === 'ingreso').reduce((s, a) => s + a.diferencia, 0));

    // CORRECCIÓN: Egresos calculados sin la extracción de lotes
    const egr = days.map(d => store.db.gastos.filter(g => g.fecha === d).reduce((s, g) => s + g.importe, 0) + store.db.cuentasPorPagar.reduce((s, deuda) => s + (deuda.pagos || []).filter(p => p.fecha === d && p.tipo === 'pago').reduce((x, p) => x + p.monto, 0), 0) + store.db.movimientos.filter(m => m.fecha === d && m.tipo === 'retiro').reduce((s, m) => s + m.importe, 0) + store.db.ajustesCaja.filter(a => a.fecha === d && a.tipo === 'perdida').reduce((s, a) => s + Math.abs(a.diferencia), 0));

    chartCashflow = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)),
            datasets: [
                { label: 'Ingresos Reales (Caja)', data: ing, backgroundColor: 'rgba(42,107,60,.8)' },
                { label: 'Egresos Reales (Pagos)', data: egr, backgroundColor: 'rgba(196,67,42,.8)' }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
};

// ================= SOCIOS =================
window.agregarSocio = function () { try { socios.agregar(document.getElementById('socio-nombre').value, document.getElementById('socio-dni').value); /* store.saveDB() removido */ window.renderSocios(); if (typeof window.populateSelects === 'function') window.populateSelects(); window.showToast('Socio agregado'); } catch (e) { window.showToast(e.message, 'error'); } };
window.eliminarSocio = function (id) { try { if (confirm('¿Eliminar?')) { socios.eliminar(id); /* store.saveDB() removido */ window.renderSocios(); if (typeof window.populateSelects === 'function') window.populateSelects(); window.showToast('Eliminado'); } } catch (e) { window.showToast(e.message, 'error'); } };
window.registrarMovimientoSocio = function () { try { socios.registrarMovimiento(document.getElementById('mov-socio').value, document.getElementById('mov-tipo').value, document.getElementById('mov-importe').value, document.getElementById('mov-cuenta').value, document.getElementById('mov-fecha').value); /* store.saveDB() removido */ window.renderSocios(); window.renderFinanzasTotales(); window.renderCuentas(); window.showToast('Registrado'); } catch (e) { window.showToast(e.message, 'error'); } };
window.abrirRetiroSocio = function () { document.getElementById('rs-prod').innerHTML = '<option value="">— Seleccionar —</option>' + store.db.productos.filter(p => !p.deleted && inventario.getStock(p.id) > 0).map(p => `<option value="${p.id}">${p.nombre} (Stock: ${inventario.getStock(p.id)})</option>`).join(''); document.getElementById('modal-retiro-socio').classList.add('open'); };
window.confirmarRetiroSocio = function () { try { const pId = document.getElementById('rs-prod').value; const qty = parseFloat(document.getElementById('rs-qty').value); if (document.getElementById('rs-accion').value === 'descontar') { const { costoTotal, lotesConsumidos } = inventario.consumirPEPS(pId, qty); socios.registrarMovimiento(document.getElementById('rs-socio').value, 'retiro', costoTotal, '', today(), lotesConsumidos); } else { inventario.consumirParaMuestra(pId, qty, today()); } if (typeof window.renderTablaProductos === 'function') window.renderTablaProductos(); document.getElementById('modal-retiro-socio').classList.remove('open'); window.showToast('Retiro registrado bajo régimen transaccional SQLite'); } catch (e) { window.showToast(e.message, 'error'); } };
window.renderSocios = function () { document.getElementById('soc-neta').textContent = fmt(finanzas.calcGananciaNetaGlobal()); document.getElementById('soc-disp').textContent = fmt(finanzas.calcGananciaSinAsignar()); document.getElementById('lista-socios').innerHTML = store.db.socios.filter(s => !s.deleted).map(s => { const saldo = finanzas.calcSaldoSocio(s.id); return `<div style="display:inline-flex;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:.3rem .6rem;margin:.2rem;font-size:.85rem;"><span style="font-weight:600;margin-right:.5rem;">${s.nombre}</span> <span class="badge ${saldo >= 0 ? 'badge-green' : 'badge-red'}">Saldo: ${fmt(saldo)}</span><button onclick="window.eliminarSocio('${s.id}')" style="background:none;border:none;color:var(--alert);cursor:pointer;margin-left:.4rem;font-weight:600;">🗑️</button></div>`; }).join(''); };

// ================= INDICADORES E INFORMES =================
window.renderIndicadores = function () {
    const d = finanzas.getDiagnosticoRatios();
    const fDec = n => (n === null || isNaN(n)) ? '—' : Number(n).toFixed(2);

    const evaluar = (val, thresholds) => {
        if (val === null || isNaN(val)) return { icon: '⚪', color: 'var(--muted)', txt: 'Faltan datos' };
        if (val >= thresholds.verde[0] && val <= thresholds.verde[1]) return { icon: '🟢', color: '#10b981', txt: 'Saludable' };
        if (val >= thresholds.amarillo[0] && val <= thresholds.amarillo[1]) return { icon: '🟡', color: '#f59e0b', txt: 'Atención' };
        return { icon: '🔴', color: '#ef4444', txt: 'Riesgo Financiero' };
    };

    const cards = [
        {
            titulo: '💧 Liquidez (Solvencia Corta)',
            ratios: [
                {
                    nom: 'L. Corriente', val: fDec(d.liquidez.corriente), ev: evaluar(d.liquidez.corriente, { verde: [1.5, 999], amarillo: [1.0, 1.49] }),
                    info: 'Mide si tienes activos cortos (Caja + Stock + Fiados) para pagar tus deudas a proveedores de inmediato. Por cada $1 que debes, tenés este monto para afrontarlo.'
                },
                {
                    nom: 'L. Ácida', val: fDec(d.liquidez.acida), ev: evaluar(d.liquidez.acida, { verde: [1.0, 999], amarillo: [0.5, 0.99] }),
                    info: 'Prueba suprema: si mañana cae un misil y no lográs vender NINGÚN producto nuevo del inventario, ¿todavía podés pagar la deuda solo juntando efectivo y cobrando fiados?'
                },
                {
                    nom: 'L. Inmediata', val: fDec(d.liquidez.inmediata), ev: evaluar(d.liquidez.inmediata, { verde: [0.3, 999], amarillo: [0.1, 0.29] }),
                    info: 'El efectivo instantáneo hoy en cajas o cuentas bancarias comparado contra tus deudas.'
                }
            ]
        },
        {
            titulo: '📦 Administración de Activos',
            ratios: [
                {
                    nom: 'Rot. de Inventario', val: fDec(d.activos.rotacionInventarios) + 'x', ev: evaluar(d.activos.rotacionInventarios, { verde: [2.0, 999], amarillo: [1.0, 1.99] }),
                    info: 'Cuántas veces vacías y vuelves a llenar tu estantería entera al mes (Venta Real mensual vs Stock Total). Si es < 1, significa que acumulas mercadería estancada.'
                },
                {
                    nom: 'Días Cobranza', val: fDec(d.activos.diasCobranza) + 'd', ev: evaluar(d.activos.diasCobranza ? -d.activos.diasCobranza : null, { verde: [-30, 0], amarillo: [-60, -31] }),
                    info: '¿Cuántos días tarda en promedio tus clientes en pagarte el fiado de Cuentas Corrientes?'
                },
                {
                    nom: 'Días Pago', val: fDec(d.activos.diasPago) + 'd', ev: evaluar(d.activos.diasPago, { verde: [0, 999], amarillo: [0, 0] }),
                    info: '¿Cuántos días tardas TÚ en pagarle al proveedor? Truco: Lo ideal es que siempre cobres tu fiado (Días Cobranza) más rápido de lo que le pagas a tu proveedor (Días Pago).'
                }
            ]
        },
        {
            titulo: '🏦 Admnistración de Deuda',
            ratios: [
                {
                    nom: 'Nivel Endeudamiento', val: fDec(d.deudas.nivel * 100) + '%', ev: evaluar(d.deudas.nivel, { verde: [0, 0.50], amarillo: [0.51, 0.70] }),
                    info: 'Del 100% de los bienes que hay en tu local... ¿Qué porcentaje le pertenece a la deuda que tenés tomada con los Proveedores? Recomendación: Mantener por debajo del 50%.'
                },
                {
                    nom: 'Cobertura Intereses', val: d.deudas.cobertura === -1 ? 'S/D' : fDec(d.deudas.cobertura) + 'x', ev: evaluar(d.deudas.cobertura, { verde: [3.0, 999], amarillo: [1.5, 2.99] }),
                    info: 'Por cada 1 peso que debes pagarle al sistema financiero en Banco/Comisiones, ¿cuántas veces podés pagarlo de sobra con tu ganancia normal neta?'
                }
            ]
        },
        {
            titulo: '📈 Rentabilidad (30 Días)',
            ratios: [
                {
                    nom: 'Margen ROS', val: fDec(d.rentabilidad.ventasROS) + '%', ev: evaluar(d.rentabilidad.ventasROS, { verde: [15.0, 100], amarillo: [5.0, 14.99] }),
                    info: 'Rentabilidad Operativa (ROS). Por cada 100 pesos brutos que lográs vendar al mes en la caja registradora, ¿cuántos pesos puros terminan de verdad en tu bolsillo de ganancia?'
                },
                {
                    nom: 'Rendimiento ROE', val: fDec(d.rentabilidad.netaROE) + '%', ev: evaluar(d.rentabilidad.netaROE, { verde: [5.0, 100], amarillo: [1.0, 4.99] }),
                    info: 'Rentabilidad Neta Patrimonial. Indicador estrella de inversores: ¿cuánto porcentaje le saqué a la plata invertida este mes? Comparalo mes a mes con la tasa de un Plazo Fijo.'
                },
                {
                    nom: 'Pto. Equilibrio', val: fmt(d.rentabilidad.puntoEquilibrio), ev: { icon: '⚖️', color: 'var(--blue)', txt: 'Meta Básica' },
                    info: 'El volumen exacto de dinero que tenés que vender en la caja para quedar en EMPATE 0. Si vendés menos que esto, perdés plata.'
                }
            ]
        }
    ];

    let html = `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; width: 100%; margin-bottom:1rem;">`;

    cards.forEach(c => {
        html += `<div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1.2rem; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <div style="font-weight:700; color:var(--ink); font-size:1rem; margin-bottom:1rem; border-bottom:1px solid var(--border); padding-bottom:.5rem;">${c.titulo}</div>
            <div style="display:flex; flex-direction:column; gap:1rem;">`;

        c.ratios.forEach(r => {
            html += `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1;">
                    <div style="font-size:.85rem; font-weight:600; color:var(--ink);">${r.nom} <span onclick="window.alert('${r.info.replace(/'/g, "\\'")}')" style="cursor:pointer; color:var(--blue); font-size:1.1rem; margin-left:4px;">ⓘ</span></div>
                    <div style="font-size:.7rem; color:${r.ev.color}; font-weight:600; margin-top:2px;">${r.ev.icon} ${r.ev.txt}</div>
                </div>
                <div style="font-size:1.15rem; font-weight:800; font-family:'JetBrains Mono', monospace; color:var(--ink);">${r.val}</div>
            </div>`;
        });

        html += `</div></div>`;
    });

    html += `</div>
    <div style="background:var(--surface2); border:1px solid var(--border); border-radius:12px; padding:1.2rem 1.5rem; display:flex; justify-content:space-between; align-items:center;">
        <div>
            <div style="font-size:.85rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing: 1px;">Patrimonio Neto Global</div>
            <div style="font-size:.8rem; color:var(--ink); max-width:500px; margin-top:5px;">El valor puro de tu empresa a día de hoy ($ Caja + $ Mercadería Al Costo + Cta. Cte. Pendientes de Cobro - Dudas Proveedores). Representa tu capital base sólido.</div>
        </div>
        <div style="font-size:1.8rem; font-family:'JetBrains Mono', monospace; font-weight:900; color:var(--accent);">${fmt(d.rentabilidad.patrimonio)}</div>
    </div>`;

    document.getElementById('dash-indicadores').innerHTML = html;
};

window.generarInforme = function () {
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

window.generarReporteVencimientos = function () {
    const dias = parseInt(document.getElementById('venc-dias').value) || 30;
    const resultados = reportes.getProximosVencimientos(dias);
    const tbody = document.getElementById('tabla-inf-vencimientos');

    if (!resultados.length) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--green);font-weight:bold;">No hay productos que venzan en los próximos ${dias} días.</td></tr>`; return; }
    tbody.innerHTML = resultados.map(r => `<tr><td><strong>${r.producto}</strong></td><td>${r.proveedor}</td><td class="mono">${fmtFecha(r.vencimiento)}</td><td class="mono">${fmtQty(r.stock, r.unidad)}</td><td><span class="badge ${r.diasRestantes <= 7 ? 'badge-red' : 'badge-amber'}">${r.diasRestantes} días</span></td></tr>`).join('');
};

window.generarPDFPedidos = function () { reportes.generarPDFPedidos(); };
window.generarListaPrecios = function () { reportes.generarListaPrecios(); };

module.exports = {};