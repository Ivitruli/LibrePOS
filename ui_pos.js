const store = require('./store.js');
const posManager = require('./pos.js');
const inventario = require('./inventario.js');
const finanzas = require('./finanzas.js');
const clientes = require('./clientes.js');

const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : u === 'combo' ? Number(n).toFixed(0) + ' promo' : Number(n).toFixed(0) + ' u.';

let barcodeTimer = null;

window.handleBarcodeInput = function () {
    clearTimeout(barcodeTimer);
    const val = document.getElementById('pos-barcode').value.trim();
    barcodeTimer = setTimeout(() => {
        if (val.length >= 3) {
            const p = store.db.productos.filter(x => !x.deleted).find(x => x.barcode === val || x.codigo === val);
            if (p) { document.getElementById('pos-barcode').value = ''; window.abrirModalQty(p.id); }
        }
    }, 150);
};

window.addEventListener('keydown', e => {
    const isPosActive = document.getElementById('sec-pos').classList.contains('active');
    const isModalOpen = document.querySelector('.modal-overlay.open');
    if (e.key === 'Enter' && isPosActive && !isModalOpen && store.carrito.length > 0) {
        if (document.activeElement.id === 'pos-barcode' && document.activeElement.value.trim() !== '') return;
        e.preventDefault(); window.confirmarVenta();
    }
    if (e.key === 'Enter' && document.getElementById('modal-venta').classList.contains('open')) {
        e.preventDefault(); window.cerrarModalVenta();
    }
});

window.selectMedio = function (id, btn) {
    store.medioSeleccionado = id;
    document.querySelectorAll('.medio-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    window.renderCarrito();
};

window.toggleCartCosto = function () {
    const isCostoChecked = document.getElementById('cart-venta-costo')?.checked;
    store.carrito.forEach(i => { if (!i.isPromo) i.precioVenta = inventario.getPrecioCart(i.productoId, isCostoChecked); });
    window.renderCarrito();
};

window.abrirModalQty = function (productoId) {
    const prod = store.db.productos.find(p => p.id === productoId);
    const stock = inventario.getStock(productoId);
    if (stock <= 0) return window.showToast('Sin stock: ' + prod.nombre, 'error');

    if (prod.unidad === 'unidad') {
        const isCostoChecked = document.getElementById('cart-venta-costo')?.checked;
        const ex = store.carrito.find(c => c.productoId === prod.id && !c.isPromo);
        if (ex) {
            ex.cantidad += 1;
        } else {
            store.carrito.push({
                productoId: prod.id, nombre: prod.nombre, unidad: prod.unidad,
                cantidad: 1, precioVenta: inventario.getPrecioCart(prod.id, isCostoChecked),
                isPromo: false
            });
        }
        window.renderCarrito();
        const barcodeInput = document.getElementById('pos-barcode');
        if (barcodeInput) barcodeInput.focus();
        return;
    }

    store.selectedProductId = productoId;
    document.getElementById('modal-qty-title').textContent = prod.nombre;
    document.getElementById('modal-qty-label').textContent = prod.unidad === 'kg' ? 'Cantidad (kg)' : 'Cantidad';
    const inp = document.getElementById('modal-qty-input');
    inp.value = ''; inp.step = '0.001';
    document.getElementById('modal-stock-info').textContent = 'Stock disponible: ' + fmtQty(stock, prod.unidad);
    document.getElementById('modal-qty').classList.add('open');
    setTimeout(() => inp.select(), 60);
};

window.cerrarModalQty = function () {
    document.getElementById('modal-qty').classList.remove('open');
    store.selectedProductId = null;
};

window.confirmarAgregarCarrito = function () {
    const qty = parseFloat(document.getElementById('modal-qty-input').value);
    if (!qty || qty <= 0) return;
    const prod = store.db.productos.find(p => p.id === store.selectedProductId);
    if (qty > inventario.getStock(prod.id) + 0.001) return window.showToast('Stock insuficiente', 'error');
    const ex = store.carrito.find(c => c.productoId === prod.id && !c.isPromo);
    const isCostoChecked = document.getElementById('cart-venta-costo')?.checked;

    if (ex) ex.cantidad += qty;
    else store.carrito.push({ productoId: prod.id, nombre: prod.nombre, unidad: prod.unidad, cantidad: qty, precioVenta: inventario.getPrecioCart(prod.id, isCostoChecked), isPromo: false });

    window.cerrarModalQty();
    window.renderCarrito();
    document.getElementById('pos-barcode').focus();
};

window.agregarPromoCarrito = function (promoId) {
    const promo = (store.db.promociones || []).find(p => p.id === promoId);
    if (!promo) return;

    for (const sub of promo.items) {
        if (inventario.getStock(sub.id) < sub.cantidad) return window.showToast(`Stock insuficiente de ${sub.nombre} para armar la promo`, 'error');
    }

    const ex = store.carrito.find(c => c.productoId === promo.id && c.isPromo);
    if (ex) ex.cantidad += 1;
    else store.carrito.push({ productoId: promo.id, nombre: "⭐ " + promo.nombre, unidad: 'combo', cantidad: 1, precioVenta: promo.precioPromo, isPromo: true, items: promo.items });

    window.renderCarrito();
    window.showToast('Promo agregada al carrito');
};

window.uiAplicarDescuentoManual = function () {
    const val = document.getElementById('pos-desc-manual').value;
    posManager.aplicarDescuentoExtra(val);
    window.uiActualizarTotalPOS();
};

window.confirmarVenta = function () {
    if (!store.carrito || store.carrito.length === 0) return window.showToast('El carrito está vacío', 'error');

    // 1. Validaciones y captura de interfaz
    const isFiado = document.getElementById('chkCtaCte') && document.getElementById('chkCtaCte').checked;
    const clienteId = isFiado ? document.getElementById('pos-cliente')?.value : null;

    if (isFiado && !clienteId) return window.showToast('Seleccione un cliente para fiar', 'error');

    // Si es fiado, la plata va a la cuenta virtual. Si no, a la caja seleccionada.
    const cuentaDestino = isFiado ? 'cta_cte' : store.medioSeleccionado;
    if (!cuentaDestino) return window.showToast('Seleccione un medio de pago', 'error');

    const isEnvio = document.getElementById('chkEnvio') && document.getElementById('chkEnvio').checked;
    const costoEnvio = isEnvio ? (parseFloat(document.getElementById('inputCostoEnvio')?.value) || 0) : 0;

    // 2. Preparar el lote de la transacción
    const ventaId = 'v_' + Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const timestamp = store.now();
    const fecha = timestamp.slice(0, 10);

    let totalCosto = 0;
    const lotesConsumidos = [];
    const itemsTransaccion = [];

    // Clonamos los lotes temporalmente para simular el PEPS.
    const lotesSimulados = JSON.parse(JSON.stringify(store.db.lotes));

    // 3. Motor PEPS (Primeras Entradas, Primeras Salidas)
    for (const item of store.carrito) {
        let cantRequerida = parseFloat(item.cantidad);
        let costoCMV = 0;

        const lotesDelProducto = lotesSimulados
            .filter(l => l.productoId === item.productoId && l.cantDisponible > 0)
            .sort((a, b) => a.fecha.localeCompare(b.fecha));

        for (const lote of lotesDelProducto) {
            if (cantRequerida <= 0) break;
            const aDescontar = Math.min(lote.cantDisponible, cantRequerida);

            lotesConsumidos.push({ loteId: lote.id, cantidad: aDescontar });

            costoCMV += (aDescontar * lote.costoUnit);
            cantRequerida -= aDescontar;
            lote.cantDisponible -= aDescontar;
        }

        // INTEGRIDAD ACID: Bloqueo de venta si falta stock físico
        if (cantRequerida > 0.001) {
            return window.showToast(`Stock físico insuficiente para: ${item.nombre}. Faltan ${cantRequerida.toFixed(2)} u.`, 'error');
        }

        totalCosto += costoCMV;

        itemsTransaccion.push({
            productoId: item.productoId,
            nombre: item.nombre,
            unidad: item.unidad || 'u',
            cantidad: item.cantidad,
            precioVenta: item.precioFinal || item.precioVenta || item.precio,
            costoTotal: costoCMV,
            isPromo: item.isPromo ? 1 : 0
        });
    }

    // 4. Captura exacta utilizando el motor matemático (Evita errores de formato de texto)
    const calculoMatematico = posManager.calcularTotal(isEnvio, costoEnvio, isFiado);
    const totalVenta = calculoMatematico.totalFinal;
    const descUI = calculoMatematico.descEfectivo;

    const ventaData = {
        id: ventaId,
        timestamp: timestamp,
        fecha: fecha,
        totalVenta: totalVenta,
        totalCosto: totalCosto,
        cuentaId: cuentaDestino,
        medioPago: isFiado ? 'Cuenta Corriente' : (store.db.cuentas.find(c => c.id === cuentaDestino)?.nombre || ''),
        descEfectivo: descUI,
        descRedondeo: typeof posManager !== 'undefined' ? (posManager.descuentoManualRedondeo || 0) : 0,
        costoEnvio: costoEnvio,
        envioPagado: isEnvio,
        facturada: false
    };

    // 5. Ejecución Transaccional (SQLite)
    try {
        store.dao.registrarVentaTransaccional(ventaData, itemsTransaccion, lotesConsumidos);

        // 6. Vinculación temporal de Deuda de Cliente
        if (isFiado && clienteId && typeof clientes !== 'undefined' && clientes.registrarDeuda) {
            clientes.registrarDeuda(clienteId, totalVenta, 'Ticket: ' + ventaId.substring(0, 8), fecha, ventaId);
        }

        store.loadDB();

        // Limpiar Interfaz
        if (typeof posManager !== 'undefined' && posManager.limpiar) posManager.limpiar();
        if (typeof window.uiActualizarTotalPOS === 'function') window.uiActualizarTotalPOS();

        const cartDiv = document.getElementById('cart-items');
        if (cartDiv) cartDiv.innerHTML = '<div class="p-1 text-center text-muted">Seleccioná productos</div>';

        const modal = document.getElementById('modal-venta');
        if (modal) {
            modal.classList.add('open');
            const res = document.getElementById('resumen-venta');
            if (res) res.innerHTML = `<h3 class="text-green text-center" style="font-size:2rem; margin:1rem 0;">${fmt(totalVenta)}</h3>`;
        } else {
            window.showToast('Venta registrada con éxito');
        }

    } catch (error) {
        console.error("Rollback ejecutado. Error SQLite:", error);
        store.loadDB();
        window.showToast('Error crítico: Venta revertida. ' + error.message, 'error');
    }
};

window.cerrarModalVenta = function () {
    document.getElementById('modal-venta').classList.remove('open');
    document.getElementById('pos-barcode').focus();
};

window.cambiarQtyCarrito = function (i, d) {
    const item = store.carrito[i];
    const s = (item.unidad === 'unidad' || item.unidad === 'combo') ? 1 : .1;
    item.cantidad = Math.max(s, item.cantidad + d * s);
    window.renderCarrito();
};

window.setQtyCarrito = function (i, v) {
    store.carrito[i].cantidad = parseFloat(v) || .001;
    window.renderCarrito();
};

window.quitarDeCarrito = function (i) {
    store.carrito.splice(i, 1);
    window.renderCarrito();
};

window.limpiarCarrito = function () {
    posManager.limpiar();
    window.renderCarrito();
};

window.uiActualizarTotalPOS = function () {
    const chkEnvio = document.getElementById('chkEnvio').checked;
    const inputEnvio = document.getElementById('inputCostoEnvio');
    inputEnvio.style.display = chkEnvio ? 'block' : 'none';

    const isFiado = document.getElementById('chkCtaCte')?.checked || false;

    const calculo = posManager.calcularTotal(chkEnvio, chkEnvio ? inputEnvio.value : null, isFiado);

    document.getElementById('btnRedondeo').innerText = `Redondear (Sug: -$${calculo.sugerido})`;

    const descuentoTotalAplicado = calculo.descRedondeo + calculo.descExtra;
    document.getElementById('lblDescuentoAplicado').innerText = `-$${descuentoTotalAplicado.toFixed(2)}`;

    if (chkEnvio && inputEnvio.value === '') inputEnvio.value = calculo.envio;

    if (calculo.descEfectivo > 0 && !isFiado) {
        document.getElementById('cart-desc-row').style.display = 'block';
        document.getElementById('cart-desc-row').textContent = `💵 Descuento (Excl. Promos): −${fmt(calculo.descEfectivo)}`;
        document.getElementById('cart-total-sin-desc-row').style.display = 'flex';
        document.getElementById('cart-total-sin-desc').textContent = fmt(calculo.subtotal);
    } else {
        document.getElementById('cart-desc-row').style.display = 'none';
        document.getElementById('cart-total-sin-desc-row').style.display = 'none';
    }
    document.getElementById('cart-total').innerText = `$${calculo.totalFinal.toFixed(2)}`;
};

window.uiAplicarRedondeo = function () {
    const chk = document.getElementById('chkEnvio').checked;
    const isFiado = document.getElementById('chkCtaCte')?.checked || false;
    posManager.aplicarRedondeo(posManager.calcularTotal(chk, null, isFiado).sugerido);
    window.uiActualizarTotalPOS();
};

window.renderCarrito = function () {
    const c = document.getElementById('cart-items');
    if (!store.carrito.length) {
        c.innerHTML = '<div style="padding:2rem 1rem;text-align:center;color:var(--muted);font-size:.82rem;">Seleccioná productos</div>';
        document.getElementById('cart-total').textContent = '$0';
        return;
    }

    // CORRECCIÓN: Estructura HTML del ítem del carrito para mantener todo en línea y optimizar espacio
    c.innerHTML = store.carrito.map((i, idx) => `
        <div class="cart-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px dashed var(--border);">
            <div style="flex: 1; min-width: 0; padding-right: 10px;">
                <div class="cart-item-name" style="font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${i.nombre}">${i.nombre}</div>
                <div style="font-size:.65rem;color:var(--muted);">${fmt(i.precioVenta)} / ${i.unidad}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="display: flex; align-items: center; background: var(--surface2); border-radius: 4px; padding: 2px;">
                    <button class="qty-btn" onclick="cambiarQtyCarrito(${idx},-1)" style="width: 20px; height: 20px; padding: 0; display: flex; align-items: center; justify-content: center;">−</button>
                    <input type="number" class="mono" value="${i.cantidad}" onchange="setQtyCarrito(${idx},this.value)" style="width:40px; text-align:center; padding:0; margin:0; border:none; background:transparent; font-size: 0.75rem;" ${i.isPromo ? 'readonly' : ''}>
                    <button class="qty-btn" onclick="cambiarQtyCarrito(${idx},1)" style="width: 20px; height: 20px; padding: 0; display: flex; align-items: center; justify-content: center;">+</button>
                </div>
                <div class="mono" style="font-size:.8rem; font-weight: 600; width: 60px; text-align: right;">${fmt(i.cantidad * i.precioVenta)}</div>
                <button onclick="quitarDeCarrito(${idx})" style="font-size:.7rem; color:var(--accent); background:none; border:none; cursor:pointer; padding: 0 5px;">✕</button>
            </div>
        </div>
    `).join('');

    window.uiActualizarTotalPOS();
};

window.renderProductGrid = function () {
    const f = (document.getElementById('pos-search').value || '').toLowerCase();
    let ps = store.db.productos.filter(p => !p.deleted);
    if (f) ps = ps.filter(p => p.nombre.toLowerCase().includes(f) || p.barcode?.includes(f) || p.codigo?.toLowerCase().includes(f));
    document.getElementById('product-grid').innerHTML = ps.map(p => {
        const s = inventario.getStock(p.id);
        return `<div class="product-card" onclick="abrirModalQty('${p.id}')"><div class="pname">${p.nombre}</div><div style="font-family:'DM Mono',font-size:.7rem;color:${s > 0 ? 'var(--green)' : 'var(--accent)'}">${s > 0 ? fmtQty(s, p.unidad) : 'Sin stock'}</div></div>`;
    }).join('');
};

window.renderPromosActivasPOS = function () {
    const container = document.getElementById('pos-promos-container');
    if (!container) return;
    const promos = (store.db.promociones || []).filter(p => p.activa);
    if (promos.length === 0) {
        container.innerHTML = '<span style="font-size:.8rem;color:var(--muted);">No hay promociones activas. Creálas en el menú Ventas.</span>';
        return;
    }
    container.innerHTML = promos.map(p => `
        <button class="btn btn-sm" style="background:var(--green-light); border:1px solid var(--green); color:var(--green); font-weight:bold; white-space:nowrap;" onclick="agregarPromoCarrito('${p.id}')">
            ⭐ ${p.nombre} — ${fmt(p.precioPromo)}
        </button>
    `).join('');
};

window.filterProducts = function () {
    window.renderProductGrid();
};

setTimeout(() => {
    if (typeof window.renderPromosActivasPOS === 'function') window.renderPromosActivasPOS();
    if (typeof window.renderProductGrid === 'function') window.renderProductGrid();
    if (typeof window.renderCarrito === 'function') window.renderCarrito();
}, 150);

module.exports = {};