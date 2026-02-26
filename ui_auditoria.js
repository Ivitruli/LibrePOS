const store = require('./store.js');
const inventario = require('./inventario.js');
const finanzas = require('./finanzas.js');

const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : u === '100g' ? Number(n).toFixed(1) + '×100g' : Number(n).toFixed(0) + ' u.';

// Objeto temporal para guardar lo que el usuario va tipeando antes de confirmar
let auditoriaCambios = {};

window.abrirModalAuditoria = function() {
    auditoriaCambios = {}; // Limpiamos la memoria
    document.getElementById('aud-search').value = '';
    document.getElementById('aud-filtro').value = 'todos';
    window.renderTablaAuditoria();
    document.getElementById('modal-auditoria').classList.add('open');
};

window.cerrarModalAuditoria = function() {
    document.getElementById('modal-auditoria').classList.remove('open');
};

window.filtrarAuditoria = function() {
    window.renderTablaAuditoria();
};

window.actualizarStockReal = function(productoId, valor) {
    if (valor === '') {
        delete auditoriaCambios[productoId];
    } else {
        auditoriaCambios[productoId] = parseFloat(valor);
    }
    // Re-renderizar solo la fila modificada para no perder el foco del input
    const stockSistema = inventario.getStock(productoId);
    const diffCell = document.getElementById('diff-' + productoId);
    
    if (diffCell && auditoriaCambios[productoId] !== undefined) {
        const diff = auditoriaCambios[productoId] - stockSistema;
        if (Math.abs(diff) < 0.001) {
            diffCell.innerHTML = '<span style="color:var(--muted)">0</span>';
        } else if (diff > 0) {
            diffCell.innerHTML = `<span style="color:var(--green); font-weight:bold;">+${diff.toFixed(3).replace(/\.?0+$/, '')}</span>`;
        } else {
            diffCell.innerHTML = `<span style="color:var(--accent); font-weight:bold;">${diff.toFixed(3).replace(/\.?0+$/, '')}</span>`;
        }
    } else if (diffCell) {
        diffCell.innerHTML = '-';
    }
};

window.renderTablaAuditoria = function() {
    const term = document.getElementById('aud-search').value.toLowerCase();
    const soloDiff = document.getElementById('aud-filtro').value === 'diferencia';
    const tbody = document.getElementById('tabla-auditoria-items');
    
    let html = '';
    let productos = store.db.productos.filter(p => !p.deleted);

    // Aplicar filtros
    if (term) {
        productos = productos.filter(p => p.nombre.toLowerCase().includes(term) || p.barcode?.includes(term) || p.codigo?.toLowerCase().includes(term));
    }
    
    if (soloDiff) {
        productos = productos.filter(p => auditoriaCambios[p.id] !== undefined && Math.abs(auditoriaCambios[p.id] - inventario.getStock(p.id)) >= 0.001);
    }

    productos.forEach(p => {
        const stockSistema = inventario.getStock(p.id);
        const valorReal = auditoriaCambios[p.id] !== undefined ? auditoriaCambios[p.id] : '';
        
        let diffHtml = '-';
        if (valorReal !== '') {
            const diff = valorReal - stockSistema;
            if (Math.abs(diff) < 0.001) diffHtml = '<span style="color:var(--muted)">0</span>';
            else if (diff > 0) diffHtml = `<span style="color:var(--green); font-weight:bold;">+${diff.toFixed(3).replace(/\.?0+$/, '')}</span>`;
            else diffHtml = `<span style="color:var(--accent); font-weight:bold;">${diff.toFixed(3).replace(/\.?0+$/, '')}</span>`;
        }

        html += `
        <tr>
            <td class="mono" style="font-size:0.75rem;">${p.codigo || p.barcode || '-'}</td>
            <td>${p.nombre}</td>
            <td class="mono" style="text-align:center; color:var(--muted);">${fmtQty(stockSistema, p.unidad)}</td>
            <td style="text-align:center;">
                <input type="number" class="edit-inline" style="width: 80px; text-align: center;" 
                       value="${valorReal}" placeholder="${stockSistema.toFixed(3).replace(/\.?0+$/, '')}" 
                       oninput="window.actualizarStockReal('${p.id}', this.value)" min="0" step="${p.unidad === 'unidad' ? '1' : '0.001'}">
            </td>
            <td style="text-align:center;" id="diff-${p.id}">${diffHtml}</td>
        </tr>`;
    });

    if (productos.length === 0) {
        html = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No se encontraron productos.</td></tr>';
    }

    tbody.innerHTML = html;
};

window.confirmarAuditoria = function() {
    const ts = store.now();
    const fecha = ts.slice(0, 10);
    let cambiosAplicados = 0;
    let costoPerdidaTotal = 0;

    try {
        for (const pId in auditoriaCambios) {
            const stockReal = parseFloat(auditoriaCambios[pId]);
            if (isNaN(stockReal) || stockReal < 0) continue;

            const prod = store.db.productos.find(p => p.id === pId);
            const stockSistema = inventario.getStock(pId);
            const diff = stockReal - stockSistema;

            if (Math.abs(diff) < 0.001) continue; // No hubo diferencia real

            if (diff < 0) {
                // FALTANTE: Se consumen lotes PEPS y se registra gasto
                const qtyPerdida = Math.abs(diff);
                const { costoTotal } = inventario.consumirPEPS(pId, qtyPerdida);
                costoPerdidaTotal += costoTotal;

                // Registramos la pérdida como un gasto sin afectar una cuenta bancaria real
                // Usamos 'ajuste_inv' como ID de cuenta fantasma para que no reste de la caja.
                store.db.gastos.push({
                    id: 'g_ajuste_' + Date.now().toString() + Math.random().toString().slice(2,5),
                    fecha: fecha,
                    categoria: 'Retiro Mercadería',
                    tipo: 'variable',
                    importe: costoTotal,
                    cuentaId: 'ajuste_inv', 
                    medio: 'Ajuste Físico de Stock',
                    descripcion: `Faltante detectado en Auditoría: ${prod.nombre} (${qtyPerdida} ${prod.unidad})`
                });

            } else if (diff > 0) {
                // SOBRANTE: Se crea un nuevo lote con la cantidad encontrada usando el costo de referencia
                store.db.lotes.push({
                    id: 'lote_ajuste_' + Date.now().toString() + Math.random().toString().slice(2,5),
                    productoId: pId,
                    cantidadOriginal: diff,
                    cantidadActual: diff,
                    costoUnitario: prod.costo || 0,
                    fechaIngreso: fecha,
                    vencimiento: ''
                });
            }
            cambiosAplicados++;
        }

        if (cambiosAplicados === 0) {
            return window.showToast('No se detectaron diferencias para ajustar', 'error');
        }

        store.saveDB();
        window.cerrarModalAuditoria();
        window.showToast(`Auditoría finalizada. Se ajustaron ${cambiosAplicados} productos.`);
        
        // Refrescar vistas si están abiertas
        if (typeof window.renderTablaProductos === 'function') window.renderTablaProductos();
        if (typeof window.renderTablaGastos === 'function') window.renderTablaGastos();
        
    } catch (e) {
        window.showToast(e.message, 'error');
    }
};