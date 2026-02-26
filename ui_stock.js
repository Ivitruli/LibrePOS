const store = require('./store.js');
const inventario = require('./inventario.js');
const reportes = require('./reportes.js');

let arrayPreciosDesact = [];

// Utilidades locales
const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : u === '100g' ? Number(n).toFixed(1) + '×100g' : Number(n).toFixed(0) + ' u.';
const today = () => store.now().toISOString().slice(0, 10);

function getProveedorLoteReciente(pId) {
    const lotes = store.db.lotes.filter(l => l.productoId === pId).sort((a,b) => b.fecha.localeCompare(a.fecha));
    return lotes.length && lotes[0].proveedorId ? store.db.proveedores.find(x => x.id === lotes[0].proveedorId)?.nombre || 'S/P' : 'S/P';
}

window.renderTablaProductos = function() {
    const f = (document.getElementById('stock-search').value || '').toLowerCase();
    const sort = document.getElementById('stock-sort').value;
    let ps = store.db.productos.filter(p => !p.deleted);
    if (f) ps = ps.filter(p => p.nombre.toLowerCase().includes(f) || p.barcode?.includes(f) || p.codigo?.toLowerCase().includes(f));
    
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
        return `<tr data-pid="${p.id}"><td class="mono" style="font-size:.7rem">${p.codigo}</td><td><strong>${p.nombre}</strong><div style="font-size:0.65rem;color:var(--muted)">Prov: ${getProveedorLoteReciente(p.id)}</div></td><td>${p.unidad}</td><td class="mono">${p.stockMinimo || 0}</td><td class="mono" style="color:${st <= (p.stockMinimo || 0) ? 'var(--accent)' : 'inherit'}">${fmtQty(st, p.unidad)}</td><td class="mono">${fmt(ca)}</td><td><input class="edit-inline" data-f="fijo" value="${ex.fijo || 0}" oninput="window.recalcInline(this)"></td><td><input class="edit-inline" data-f="imp" value="${ex.imp || 0}" oninput="window.recalcInline(this)"></td><td><input class="edit-inline" data-f="gan" value="${ex.gan || 30}" oninput="window.recalcInline(this)"></td><td><input class="edit-inline" data-f="desc" value="${ex.desc || 0}" oninput="window.recalcInline(this)"></td><td style="text-align:center;"><input type="checkbox" data-f="alCosto" ${ex.alCosto ? 'checked' : ''} onchange="window.recalcInline(this)"></td><td class="mono" id="pf-${p.id}"><strong>${fmt(inventario.calcPrecioFinal(p.id))}</strong></td><td style="white-space:nowrap;"><button class="btn btn-secondary btn-sm" onclick="window.abrirEditarProd('${p.id}')">✏</button> <button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar?')){store.db.productos.find(x=>x.id==='${p.id}').deleted=true;store.saveDB();window.renderTablaProductos();if(typeof window.renderProductGrid === 'function') window.renderProductGrid();}">✕</button></td></tr>`;
    }).join('');
};

window.recalcInline = function(inp) {
    const tr = inp.closest('tr'); const pId = tr.dataset.pid; const c = inventario.getCostoMasAlto(pId);
    const v = f => parseFloat(tr.querySelector(`[data-f="${f}"]`)?.value) || 0;
    const alCosto = tr.querySelector(`[data-f="alCosto"]`)?.checked || false;
    let raw = alCosto ? (c + v('fijo')) * (1 + v('imp') / 100) : (c + v('fijo')) * (1 + v('imp') / 100) * (1 + v('gan') / 100) * (1 - v('desc') / 100);
    tr.querySelector(`#pf-${pId}`).innerHTML = `<strong>${fmt(Math.ceil(raw/10)*10)}</strong>`;
};

window.guardarPreciosTodos = function() {
    document.querySelectorAll('#tabla-productos tr[data-pid]').forEach(row => {
        const pid = row.dataset.pid; const getVal = f => parseFloat(row.querySelector(`[data-f="${f}"]`)?.value) || 0;
        store.db.preciosExtra[pid] = { ...store.db.preciosExtra[pid], fijo: getVal('fijo'), imp: getVal('imp'), gan: getVal('gan'), desc: getVal('desc'), alCosto: row.querySelector(`[data-f="alCosto"]`)?.checked || false };
    });
    store.saveDB(); window.renderTablaProductos(); window.showToast('Precios guardados');
};

window.abrirEditarProd = function(id) {
    const p = store.db.productos.find(x => x.id === id); if (!p) return;
    document.getElementById('ep-prod-id').value = id; document.getElementById('ep-prod-codigo').value = p.codigo; document.getElementById('ep-prod-nombre').value = p.nombre; document.getElementById('ep-prod-unidad').value = p.unidad; document.getElementById('ep-prod-marca').value = p.marca || ''; document.getElementById('ep-prod-min').value = p.stockMinimo || '';
    document.getElementById('modal-edit-prod').classList.add('open');
};

window.guardarEditProd = function() {
    const p = store.db.productos.find(x => x.id === document.getElementById('ep-prod-id').value); if (!p) return;
    p.codigo = document.getElementById('ep-prod-codigo').value.trim() || p.codigo; p.nombre = document.getElementById('ep-prod-nombre').value.trim() || p.nombre; p.unidad = document.getElementById('ep-prod-unidad').value; p.marca = document.getElementById('ep-prod-marca').value.trim(); p.stockMinimo = parseFloat(document.getElementById('ep-prod-min').value) || 0;
    store.saveDB(); document.getElementById('modal-edit-prod').classList.remove('open'); window.renderTablaProductos(); window.showToast('Producto actualizado');
};

window.abrirModalMuestras = function() {
    document.getElementById('mu-prod').innerHTML = '<option value="">— Seleccionar —</option>' + store.db.productos.filter(p => !p.deleted && inventario.getStock(p.id) > 0).map(p => `<option value="${p.id}">${p.nombre} (Stock: ${inventario.getStock(p.id)})</option>`).join('');
    document.getElementById('mu-qty').value = ''; document.getElementById('mu-fecha').value = today();
    document.getElementById('modal-muestras').classList.add('open');
};

window.confirmarMuestra = function() {
    try {
        inventario.consumirParaMuestra(document.getElementById('mu-prod').value, parseFloat(document.getElementById('mu-qty').value), document.getElementById('mu-fecha').value);
        store.saveDB(); window.renderTablaProductos(); document.getElementById('modal-muestras').classList.remove('open'); window.showToast('Gasto registrado');
    } catch(e) { window.showToast(e.message, 'error'); }
};

window.abrirModalPreciosDesactualizados = function() {
    arrayPreciosDesact = inventario.getPreciosDesactualizados();
    document.getElementById('tabla-precios-desact').innerHTML = arrayPreciosDesact.map(p => `<tr><td>${p.nombre}</td><td class="mono" style="color:var(--muted)">${fmt(p.impreso)}</td><td class="mono" style="color:var(--accent);font-weight:bold;">${fmt(p.calculado)}</td><td><button class="btn btn-sm btn-green" onclick="window.marcarPrecioListo('${p.id}')">Listo ✓</button></td></tr>`).join('');
    if(arrayPreciosDesact.length === 0) document.getElementById('tabla-precios-desact').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;">Todos los precios en góndola coinciden con el sistema.</td></tr>';
    document.getElementById('modal-precios').classList.add('open');
};

window.marcarPrecioListo = function(pId) {
    inventario.marcarPrecioActualizado(pId);
    window.abrirModalPreciosDesactualizados();
    window.renderTablaProductos();
};

window.generarPDFEtiquetas = function() {
    if(arrayPreciosDesact.length) {
        reportes.generarPDFEtiquetas(arrayPreciosDesact);
        arrayPreciosDesact.forEach(p => inventario.marcarPrecioActualizado(p.id));
        window.abrirModalPreciosDesactualizados();
        window.renderTablaProductos();
    } else {
        window.showToast('No hay precios desactualizados','error');
    }
};

window.imprimirCodigosBarra = function() {
    try {
        const ps = store.db.productos.filter(p => !p.deleted && (p.codigo || p.barcode));
        if(!ps.length) return window.showToast('No hay productos con código asignado', 'error');
        reportes.generarPDFCodigosBarra(ps);
        window.showToast('PDF generado correctamente');
    } catch(e) { window.showToast(e.message, 'error'); }
};

module.exports = {};