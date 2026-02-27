const store = require('./store.js');
const inventario = require('./inventario.js');
const reportes = require('./reportes.js');

let arrayPreciosDesact = [];

// Utilidades locales
const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : u === '100g' ? Number(n).toFixed(1) + '×100g' : Number(n).toFixed(0) + ' u.';
const today = () => store.now().toISOString().slice(0, 10);

window.renderTablaProductos = function() {
    const f = (document.getElementById('stock-search').value || '').toLowerCase();
    const sort = document.getElementById('stock-sort').value;
    let ps = store.db.productos.filter(p => !p.deleted);
    if (f) ps = ps.filter(p => p.nombre.toLowerCase().includes(f) || p.barcode?.includes(f) || p.codigo?.toLowerCase().includes(f));
    
    // 1. Expandir productos por proveedor (Si un producto tiene múltiples proveedores, crear filas virtuales)
    let filasExpandidas = [];
    
    ps.forEach(p => {
        // Buscar todos los proveedores únicos que alguna vez trajeron este producto
        const lotes = store.db.lotes.filter(l => l.productoId === p.id && l.proveedorId);
        const proveedoresUnicos = [...new Set(lotes.map(l => l.proveedorId))];
        
        if (proveedoresUnicos.length === 0) {
            // Producto sin historial de compras/proveedor
            filasExpandidas.push({ ...p, provActivoId: null, provActivoNombre: 'Sin Proveedor', isPrincipal: true });
        } else {
            // Crear una fila por cada proveedor
            proveedoresUnicos.forEach((provId, index) => {
                const provNombre = store.db.proveedores.find(x => x.id === provId)?.nombre || 'Desconocido';
                filasExpandidas.push({ 
                    ...p, 
                    provActivoId: provId, 
                    provActivoNombre: provNombre,
                    // Solo la primera fila del producto mostrará los inputs editables de reglas de negocio
                    isPrincipal: index === 0 
                });
            });
        }
    });
    
    // 2. Aplicar ordenamiento a las filas expandidas
    filasExpandidas.sort((a, b) => {
        if (sort === 'nombre') return a.nombre.localeCompare(b.nombre);
        if (sort === 'prov') return a.provActivoNombre.localeCompare(b.provActivoNombre);
        if (sort === 'venc') {
            const va = store.db.lotes.filter(l => l.productoId === a.id && l.vencimiento && l.cantDisponible > 0).sort((x,y) => x.vencimiento.localeCompare(y.vencimiento))[0]?.vencimiento || '9999-99-99';
            const vb = store.db.lotes.filter(l => l.productoId === b.id && l.vencimiento && l.cantDisponible > 0).sort((x,y) => x.vencimiento.localeCompare(y.vencimiento))[0]?.vencimiento || '9999-99-99';
            return va.localeCompare(vb);
        }
    });
    
    // 3. Renderizar HTML
    document.getElementById('tabla-productos').innerHTML = filasExpandidas.map(p => {
        const st = inventario.getStock(p.id); 
        const ex = store.db.preciosExtra[p.id] || {}; 
        const ca = inventario.getCostoMasAlto(p.id);
        const marcaHtml = p.marca ? `<div style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;">${p.marca}</div>` : '';
        
        // Solo renderizamos los inputs de reglas de precios si es la fila "principal" del producto.
        // Las filas secundarias (del mismo producto pero distinto proveedor) muestran guiones para no duplicar datos ni romper el guardado global.
        let reglasHtml = '';
        if (p.isPrincipal) {
            reglasHtml = `
                <td><input class="edit-inline" data-f="fijo" value="${ex.fijo || 0}" oninput="window.recalcInline(this)"></td>
                <td><input class="edit-inline" data-f="imp" value="${ex.imp || 0}" oninput="window.recalcInline(this)"></td>
                <td><input class="edit-inline" data-f="gan" value="${ex.gan || 30}" oninput="window.recalcInline(this)"></td>
                <td><input class="edit-inline" data-f="desc" value="${ex.desc || 0}" oninput="window.recalcInline(this)"></td>
                <td style="text-align:center;"><input type="checkbox" data-f="alCosto" ${ex.alCosto ? 'checked' : ''} onchange="window.recalcInline(this)"></td>
                <td class="mono" id="pf-${p.id}"><strong>${fmt(inventario.calcPrecioFinal(p.id))}</strong></td>
                <td style="white-space:nowrap;">
                    <button class="btn btn-secondary btn-sm" onclick="window.abrirEditarProd('${p.id}')">✏️ Modificar</button> 
                    <button class="btn btn-danger btn-sm" onclick="if(confirm('¿Eliminar?')){store.db.productos.find(x=>x.id==='${p.id}').deleted=true;store.saveDB();window.renderTablaProductos();if(typeof window.renderProductGrid === 'function') window.renderProductGrid();}">🗑️</button>
                </td>
            `;
        } else {
            reglasHtml = `
                <td colspan="5" style="text-align:center;color:var(--muted);font-size:0.75rem;background:var(--surface2);">— Reglas vinculadas a la fila principal —</td>
                <td class="mono" style="background:var(--surface2);"><strong>${fmt(inventario.calcPrecioFinal(p.id))}</strong></td>
                <td style="background:var(--surface2);"></td>
            `;
        }

        return `
        <tr data-pid="${p.id}">
            <td class="mono" style="font-size:.7rem">${p.codigo}</td>
            <td style="font-size:0.85rem; font-weight:600; color:var(--ink);">${p.provActivoNombre}</td>
            <td><strong>${p.nombre}</strong>${marcaHtml}</td>
            <td>${p.unidad}</td>
            <td class="mono">${p.stockMinimo || 0}</td>
            <td class="mono" style="color:${st <= (p.stockMinimo || 0) ? 'var(--accent)' : 'inherit'}">${fmtQty(st, p.unidad)}</td>
            <td class="mono">${fmt(ca)}</td>
            ${reglasHtml}
        </tr>`;
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
    // Solo buscamos en las filas que tienen los inputs (isPrincipal), para no sobreescribir con vacíos
    document.querySelectorAll('#tabla-productos tr[data-pid]').forEach(row => {
        const inpGan = row.querySelector(`[data-f="gan"]`);
        if (!inpGan) return; // Saltamos las filas secundarias
        
        const pid = row.dataset.pid; 
        const getVal = f => parseFloat(row.querySelector(`[data-f="${f}"]`)?.value) || 0;
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
    document.getElementById('tabla-precios-desact').innerHTML = arrayPreciosDesact.map(p => `<tr><td>${p.nombre}</td><td class="mono" style="color:var(--muted)">${fmt(p.impreso)}</td><td class="mono" style="color:var(--accent);font-weight:bold;">${fmt(p.calculado)}</td><td><button class="btn btn-sm btn-success" onclick="window.marcarPrecioListo('${p.id}')">✅ Listo</button></td></tr>`).join('');
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