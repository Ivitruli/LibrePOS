const store = require('./store.js');
const inventario = require('./inventario.js');
const reportes = require('./reportes.js');

let arrayPreciosDesact = [];

// Utilidades locales
const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : Number(n).toFixed(0) + ' u.';
const today = () => store.now().slice(0, 10);

window.renderTablaProductos = function () {
    const f = (document.getElementById('stock-search').value || '').toLowerCase();
    const sort = document.getElementById('stock-sort').value;
    let ps = store.db.productos.filter(p => !p.deleted);
    if (f) ps = ps.filter(p => p.nombre.toLowerCase().includes(f) || p.barcode?.includes(f) || p.codigo?.toLowerCase().includes(f));

    let filasExpandidas = [];

    ps.forEach(p => {
        // Filtramos solo los lotes que tienen stock físico real
        const lotesActivos = store.db.lotes.filter(l => l.productoId === p.id && l.cantDisponible > 0);

        if (lotesActivos.length === 0) {
            // Si no hay stock, mostramos solo al último proveedor que nos vendió
            const ultimoLote = store.db.lotes.filter(l => l.productoId === p.id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
            const provId = ultimoLote?.proveedorId || 'sin_prov';
            const provNombre = ultimoLote ? (store.db.proveedores.find(x => x.id === provId)?.nombre || 'Desconocido') : 'Sin Proveedor';

            filasExpandidas.push({ ...p, provActivoId: provId, provActivoNombre: provNombre, costoEspecifico: ultimoLote?.costoUnit || 0, stockProv: 0 });
        } else {
            // Generamos una fila por cada proveedor con stock activo
            const proveedoresUnicos = [...new Set(lotesActivos.map(l => l.proveedorId))];

            proveedoresUnicos.forEach(provId => {
                const provNombre = store.db.proveedores.find(x => x.id === provId)?.nombre || 'Desconocido';
                const lotesProv = lotesActivos.filter(l => l.proveedorId === provId);
                const stockDelProv = lotesProv.reduce((acc, l) => acc + l.cantDisponible, 0);
                // Tomamos el costo del lote más reciente de ESTE proveedor
                const costoProv = lotesProv.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0].costoUnit;

                filasExpandidas.push({ ...p, provActivoId: provId, provActivoNombre: provNombre, costoEspecifico: costoProv, stockProv: stockDelProv });
            });
        }
    });

    filasExpandidas.sort((a, b) => {
        if (sort === 'nombre') return a.nombre.localeCompare(b.nombre);
        if (sort === 'prov') return a.provActivoNombre.localeCompare(b.provActivoNombre);
    });

    document.getElementById('tabla-productos').innerHTML = filasExpandidas.map(p => {
        const ruleKey = p.provActivoId !== 'sin_prov' ? `${p.id}_${p.provActivoId}` : p.id;
        const ex = store.db.preciosExtra[ruleKey] || store.db.preciosExtra[p.id] || {};
        const ca = p.costoEspecifico > 0 ? p.costoEspecifico : inventario.getCostoMasAlto(p.id);
        const marcaHtml = p.marca ? `<div style="font-size:0.65rem;color:var(--muted);text-transform:uppercase;">${p.marca}</div>` : '';

        return `
        <tr data-pid="${p.id}" data-rulekey="${ruleKey}" data-costo="${ca}">
            <td class="mono" style="font-size:.7rem">${p.codigo}</td>
            <td style="font-size:0.85rem; font-weight:600; color:var(--ink);">${p.provActivoNombre}</td>
            <td><strong>${p.nombre}</strong>${marcaHtml}</td>
            <td>${p.unidad}</td>
            <td class="mono">${p.stockMinimo || 0}</td>
            <td class="mono" style="color:${p.stockProv <= (p.stockMinimo || 0) ? 'var(--accent)' : 'inherit'}">${fmtQty(p.stockProv, p.unidad)}</td>
            <td class="mono">${fmt(ca)}</td>
            <td><input class="edit-inline" data-f="fijo" value="${ex.fijo || 0}" oninput="window.recalcInline(this)"></td>
            <td><input class="edit-inline" data-f="imp" value="${ex.imp || 0}" oninput="window.recalcInline(this)"></td>
            <td><input class="edit-inline" data-f="gan" value="${ex.gan || 30}" oninput="window.recalcInline(this)"></td>
            <td><input class="edit-inline" data-f="desc" value="${ex.desc || 0}" oninput="window.recalcInline(this)"></td>
            <td style="text-align:center;"><input type="checkbox" data-f="alCosto" ${ex.alCosto ? 'checked' : ''} onchange="window.recalcInline(this)"></td>
            <td class="mono" id="pf-${ruleKey}"><strong>$0.00</strong></td>
            <td style="white-space:nowrap;">
                <button class="btn btn-secondary btn-sm" onclick="window.abrirEditarProd('${p.id}')">✏️ Modificar</button> 
                <button class="btn btn-danger btn-sm" onclick="window.eliminarProducto('${p.id}')" title="Eliminar Producto">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    document.querySelectorAll('#tabla-productos tr[data-rulekey]').forEach(tr => {
        const inp = tr.querySelector('[data-f="fijo"]');
        if (inp) window.recalcInline(inp);
    });
};

window.recalcInline = function (inp) {
    const tr = inp.closest('tr');
    const ruleKey = tr.dataset.rulekey;
    const c = parseFloat(tr.dataset.costo) || 0;
    const v = f => parseFloat(tr.querySelector(`[data-f="${f}"]`)?.value) || 0;
    const alCosto = tr.querySelector(`[data-f="alCosto"]`)?.checked || false;

    let raw = alCosto ? (c + v('fijo')) * (1 + v('imp') / 100) : (c + v('fijo')) * (1 + v('imp') / 100) * (1 + v('gan') / 100) * (1 - v('desc') / 100);

    const celdaPrecio = document.getElementById(`pf-${ruleKey}`);
    if (celdaPrecio) {
        celdaPrecio.innerHTML = `<strong>${fmt(Math.ceil(raw / 10) * 10)}</strong>`;
    }
};

window.guardarPreciosTodos = function () {
    const paqueteDePrecios = [];

    // 1. Recolectar datos de la interfaz (Sin tocar la base de datos)
    document.querySelectorAll('#tabla-productos tr[data-pid]').forEach(row => {
        const inpGan = row.querySelector(`[data-f="gan"]`);
        if (!inpGan) return; // Saltamos filas secundarias

        const pid = row.dataset.pid;
        const getVal = f => parseFloat(row.querySelector(`[data-f="${f}"]`)?.value) || 0;

        paqueteDePrecios.push({
            productoId: pid,
            fijo: getVal('fijo'),
            imp: getVal('imp'),
            gan: getVal('gan'),
            desc: getVal('desc'),
            alCosto: row.querySelector(`[data-f="alCosto"]`)?.checked ? 1 : 0, // SQLite usa 1 o 0 para booleanos
            precioImpreso: store.db.preciosExtra[pid]?.precioImpreso || 0
        });
    });

    // 2. Enviar el paquete completo a la transacción del DAO
    if (paqueteDePrecios.length > 0) {
        try {
            store.dao.guardarPreciosMasivo(paqueteDePrecios); // Una sola llamada

            store.loadDB();
            window.renderTablaProductos();
            window.showToast('Precios guardados (Modo Transaccional)');
        } catch (error) {
            console.error("Error al guardar precios:", error.message);
            window.showToast('Error en guardado masivo', 'error');
        }
    }
};

window.eliminarProducto = function (id) {
    if (!confirm('¿Estás seguro de eliminar este producto del catálogo?')) return;

    const p = store.db.productos.find(x => x.id === id);
    if (!p) return window.showToast('Producto no encontrado', 'error');

    p.deleted = true; // Aplicamos el borrado lógico

    try {
        store.dao.guardarProducto(p); // El DAO detecta que existe y hace un UPDATE con deleted = 1
        store.loadDB();
        window.renderTablaProductos();
        window.showToast('Producto eliminado');
    } catch (e) {
        console.error("Error al eliminar:", e.message);
        window.showToast('Error al eliminar producto', 'error');
    }
};

window.abrirEditarProd = function (id) {
    const p = store.db.productos.find(x => x.id === id); if (!p) return;
    document.getElementById('ep-prod-id').value = id; document.getElementById('ep-prod-codigo').value = p.codigo; document.getElementById('ep-prod-nombre').value = p.nombre; document.getElementById('ep-prod-unidad').value = p.unidad; document.getElementById('ep-prod-marca').value = p.marca || ''; document.getElementById('ep-prod-min').value = p.stockMinimo || '';
    document.getElementById('modal-edit-prod').classList.add('open');
};

window.guardarEditProd = function () {
    const pId = document.getElementById('ep-prod-id').value;
    const p = store.db.productos.find(x => x.id === pId);
    if (!p) return window.showToast('Producto no encontrado en memoria', 'error');

    // 1. Capturar datos de la UI
    const codigo = document.getElementById('ep-prod-codigo').value.trim() || p.codigo;
    const nombre = document.getElementById('ep-prod-nombre').value.trim() || p.nombre;
    const unidad = document.getElementById('ep-prod-unidad').value;
    const marca = document.getElementById('ep-prod-marca').value.trim();
    const stockMinimo = parseFloat(document.getElementById('ep-prod-min').value) || 0;

    // 2. Preparar el objeto para la base de datos
    const productoActualizado = {
        id: pId,
        codigo: codigo,
        barcode: codigo, // Asumimos código = barcode según tu lógica
        nombre: nombre,
        marca: marca,
        unidad: unidad,
        stockMinimo: stockMinimo,
        deleted: p.deleted
    };

    try {
        // 3. Inyectar en SQLite a través del DAO (Reemplaza a store.saveDB)
        store.dao.guardarProducto(productoActualizado);

        // 4. Sincronizar memoria y actualizar UI
        store.loadDB();
        document.getElementById('modal-edit-prod').classList.remove('open');

        if (typeof window.renderTablaProductos === 'function') {
            window.renderTablaProductos();
        }
        window.showToast('Producto actualizado en la base de datos');
    } catch (error) {
        console.error("Error en guardarEditProd:", error);
        window.showToast("Error al guardar en base de datos", 'error');
    }
};

window.abrirModalMuestras = function () {
    document.getElementById('mu-prod').innerHTML = '<option value="">— Seleccionar —</option>' + store.db.productos.filter(p => !p.deleted && inventario.getStock(p.id) > 0).map(p => `<option value="${p.id}">${p.nombre} (Stock: ${inventario.getStock(p.id)})</option>`).join('');
    document.getElementById('mu-qty').value = ''; document.getElementById('mu-fecha').value = today();
    document.getElementById('modal-muestras').classList.add('open');
};

window.confirmarMuestra = function () {
    try {
        inventario.consumirParaMuestra(document.getElementById('mu-prod').value, parseFloat(document.getElementById('mu-qty').value), document.getElementById('mu-fecha').value);
        /* store.saveDB() removido */ window.renderTablaProductos(); document.getElementById('modal-muestras').classList.remove('open'); window.showToast('Gasto registrado');
    } catch (e) { window.showToast(e.message, 'error'); }
};

window.abrirModalPreciosDesactualizados = function () {
    arrayPreciosDesact = inventario.getPreciosDesactualizados();
    document.getElementById('tabla-precios-desact').innerHTML = arrayPreciosDesact.map(p => `<tr><td>${p.nombre}</td><td class="mono" style="color:var(--muted)">${fmt(p.impreso)}</td><td class="mono" style="color:var(--accent);font-weight:bold;">${fmt(p.calculado)}</td><td><button class="btn btn-sm btn-success" onclick="window.marcarPrecioListo('${p.id}')">✅ Listo</button></td></tr>`).join('');
    if (arrayPreciosDesact.length === 0) document.getElementById('tabla-precios-desact').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;">Todos los precios en góndola coinciden con el sistema.</td></tr>';
    document.getElementById('modal-precios').classList.add('open');
};

window.marcarPrecioListo = function (pId) {
    inventario.marcarPrecioActualizado(pId);
    window.abrirModalPreciosDesactualizados();
    window.renderTablaProductos();
};

window.generarPDFEtiquetas = function () {
    if (arrayPreciosDesact.length) {
        reportes.generarPDFEtiquetas(arrayPreciosDesact);
        arrayPreciosDesact.forEach(p => inventario.marcarPrecioActualizado(p.id));
        window.abrirModalPreciosDesactualizados();
        window.renderTablaProductos();
    } else {
        window.showToast('No hay precios desactualizados', 'error');
    }
};

window.imprimirCodigosBarra = function () {
    try {
        const ps = store.db.productos.filter(p => !p.deleted && (p.codigo || p.barcode));
        if (!ps.length) return window.showToast('No hay productos con código asignado', 'error');
        reportes.generarPDFCodigosBarra(ps);
        window.showToast('PDF generado correctamente');
    } catch (e) { window.showToast(e.message, 'error'); }
};

module.exports = {};