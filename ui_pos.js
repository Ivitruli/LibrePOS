const store = require('./store.js');
const posManager = require('./pos.js');
const inventario = require('./inventario.js');
const finanzas = require('./finanzas.js');
const clientes = require('./clientes.js');

// Utilidades locales de formato
const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : u === '100g' ? Number(n).toFixed(1) + '×100g' : u === 'combo' ? Number(n).toFixed(0) + ' promo' : Number(n).toFixed(0) + ' u.';

let barcodeTimer = null;

window.handleBarcodeInput = function() {
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

window.selectMedio = function(id, btn) {
    store.medioSeleccionado = id;
    document.querySelectorAll('.medio-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    window.renderCarrito();
};

window.toggleCartCosto = function() {
    const isCostoChecked = document.getElementById('cart-venta-costo')?.checked;
    store.carrito.forEach(i => { if(!i.isPromo) i.precioVenta = inventario.getPrecioCart(i.productoId, isCostoChecked); });
    window.renderCarrito();
};

window.abrirModalQty = function(productoId) {
    const prod = store.db.productos.find(p => p.id === productoId);
    const stock = inventario.getStock(productoId);
    if (stock <= 0) return window.showToast('Sin stock: ' + prod.nombre, 'error');
    store.selectedProductId = productoId;
    document.getElementById('modal-qty-title').textContent = prod.nombre;
    document.getElementById('modal-qty-label').textContent = prod.unidad === 'kg' ? 'Cantidad (kg)' : prod.unidad === '100g' ? 'Cantidad (×100g)' : 'Cantidad (unidades)';
    const inp = document.getElementById('modal-qty-input');
    inp.value = prod.unidad === 'unidad' ? '1' : ''; inp.step = prod.unidad === 'unidad' ? '1' : '0.001';
    document.getElementById('modal-stock-info').textContent = 'Stock disponible: ' + fmtQty(stock, prod.unidad);
    document.getElementById('modal-qty').classList.add('open');
    setTimeout(() => inp.select(), 60);
};

window.cerrarModalQty = function() {
    document.getElementById('modal-qty').classList.remove('open');
    store.selectedProductId = null;
};

window.confirmarAgregarCarrito = function() {
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

window.agregarPromoCarrito = function(promoId) {
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

window.confirmarVenta = function() {
    if (!store.carrito.length) return;
    const chkEnvio = document.getElementById('chkEnvio').checked;
    const inputEnvio = document.getElementById('inputCostoEnvio');
    const valorInput = chkEnvio ? inputEnvio.value : null;
    
    const isFiado = document.getElementById('chkCtaCte').checked;
    const clienteId = document.getElementById('pos-cliente').value;

    if (isFiado && !clienteId) return window.showToast('Debe seleccionar un cliente para vender a Cuenta Corriente', 'error');

    const calculo = posManager.calcularTotal(chkEnvio, valorInput, isFiado);
    const ts = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
    const vId = Date.now().toString();
    let totV = 0, totC = 0, items = [];
    
    try {
        const subtotalSinEnvio = calculo.totalFinal - calculo.envio;

        // Si es a cuenta corriente, intentamos registrar la deuda PRIMERO. 
        // Si excede el límite, el throw Error frenará la venta sin descontar stock.
        if (isFiado) {
            clientes.registrarDeuda(clienteId, subtotalSinEnvio, 'Compra en POS', ts.slice(0, 10), vId);
        }

        for (const i of store.carrito) {
            if (i.isPromo) {
                for (const sub of i.items) if (inventario.getStock(sub.id) < (sub.cantidad * i.cantidad) - 0.001) throw new Error(`Stock insuficiente para armar promo: ${sub.nombre}`);
            } else {
                if (i.cantidad > inventario.getStock(i.productoId) + 0.001) throw new Error('Stock falto: ' + i.nombre);
            }
        }

        for (const i of store.carrito) {
            if (i.isPromo) {
                let costoTotalPromo = 0;
                for (const sub of i.items) {
                    const { costoTotal } = inventario.consumirPEPS(sub.id, sub.cantidad * i.cantidad);
                    costoTotalPromo += costoTotal;
                }
                const sub = i.cantidad * i.precioVenta; totV += sub; totC += costoTotalPromo;
                store.db.ventaItems.push({ ventaId: vId, productoId: i.productoId, nombre: i.nombre, unidad: 'combo', cantidad: i.cantidad, precioVenta: i.precioVenta, costoTotal: costoTotalPromo, isPromo: true, items: i.items });
                items.push({ nombre: i.nombre, q: i.cantidad, u: 'combo', s: sub });
            } else {
                const { costoTotal } = inventario.consumirPEPS(i.productoId, i.cantidad);
                const sub = i.cantidad * i.precioVenta; totV += sub; totC += costoTotal;
                store.db.ventaItems.push({ ventaId: vId, productoId: i.productoId, nombre: i.nombre, unidad: i.unidad, cantidad: i.cantidad, precioVenta: i.precioVenta, costoTotal, isPromo: false });
                items.push({ nombre: i.nombre, q: i.cantidad, u: i.unidad, s: sub });
            }
        }
        
        // Asignación de cuenta: Si es fiado, va a la cuenta virtual 'cta_cte' para no sumar a la caja real.
        const c = isFiado ? { id: 'cta_cte', nombre: 'Cuenta Corriente' } : store.db.cuentas.find(x => x.id === store.medioSeleccionado);
        
        store.db.ventas.push({ id: vId, timestamp: ts, fecha: ts.slice(0, 10), totalVenta: subtotalSinEnvio, totalCosto: totC, cuentaId: c.id, medioPago: c.nombre, descEfectivo: calculo.descEfectivo, descRedondeo: calculo.descRedondeo, costoEnvio: calculo.envio, envioPagado: false, facturada: false });
        
        // El envío se cobra siempre en efectivo/cuenta real en el momento, incluso si la mercadería es fiada. 
        // Si quisieran fiar el envío, habría que ajustar esta lógica, pero por defecto los servicios extra se cobran en el medio seleccionado.
        if (calculo.envio > 0 && !isFiado) {
            store.db.ajustesCaja.push({ id: Date.now().toString() + '_envio_in', cuentaId: c.id, fecha: ts.slice(0, 10), diferencia: calculo.envio, tipo: 'ingreso', concepto: 'Cobro de Envío al cliente' });
        }
        
        if (calculo.descRedondeo > 0) finanzas.registrarGasto(ts.slice(0, 10), 'Otros', 'variable', calculo.descRedondeo, isFiado ? 'cta_cte' : c.id, 'Redondeo POS');
        
        store.saveDB();
        if (typeof window.populateSelects === 'function') window.populateSelects();
        
        let msjFiado = isFiado ? `<div style="background:var(--amber-light);color:var(--amber);padding:5px;text-align:center;font-weight:bold;margin-bottom:10px;">Fiado a: ${store.db.clientes.find(x=>x.id===clienteId)?.nombre}</div>` : '';
        
        document.getElementById('resumen-venta').innerHTML = `${msjFiado}<table style="width:100%;font-size:.82rem;margin-bottom:.8rem;">${items.map(r => `<tr><td>${r.nombre}</td><td class="mono" align="right">${fmtQty(r.q, r.u)}</td><td class="mono" align="right">${fmt(r.s)}</td></tr>`).join('')}</table><div style="font-size:1.4rem;font-weight:900;border-top:2px solid #ccc;padding-top:.5rem;">Total: ${fmt(calculo.totalFinal)}</div>`;
        document.getElementById('modal-venta').classList.add('open');
        posManager.limpiar();
        window.renderCarrito();
        window.renderProductGrid();
        if(typeof window.renderTablaClientes === 'function') window.renderTablaClientes(); // Actualizar deuda visualmente
    } catch (e) { window.showToast(e.message, 'error'); }
};

window.cerrarModalVenta = function() {
    document.getElementById('modal-venta').classList.remove('open');
    document.getElementById('pos-barcode').focus();
};

window.cambiarQtyCarrito = function(i, d) {
    const item = store.carrito[i];
    const s = (item.unidad === 'unidad' || item.unidad === 'combo') ? 1 : .1;
    item.cantidad = Math.max(s, item.cantidad + d * s);
    window.renderCarrito();
};

window.setQtyCarrito = function(i, v) {
    store.carrito[i].cantidad = parseFloat(v) || .001;
    window.renderCarrito();
};

window.quitarDeCarrito = function(i) {
    store.carrito.splice(i, 1);
    window.renderCarrito();
};

window.limpiarCarrito = function() {
    posManager.limpiar();
    window.renderCarrito();
};

window.uiActualizarTotalPOS = function() {
    const chkEnvio = document.getElementById('chkEnvio').checked;
    const inputEnvio = document.getElementById('inputCostoEnvio');
    inputEnvio.style.display = chkEnvio ? 'block' : 'none';
    
    const isFiado = document.getElementById('chkCtaCte')?.checked || false;
    
    const calculo = posManager.calcularTotal(chkEnvio, chkEnvio ? inputEnvio.value : null, isFiado);
    
    document.getElementById('btnRedondeo').innerText = `Redondear (Sug: -$${calculo.sugerido})`;
    document.getElementById('lblDescuentoAplicado').innerText = `-$${calculo.descRedondeo.toFixed(2)}`;
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

window.uiAplicarRedondeo = function() {
    const chk = document.getElementById('chkEnvio').checked;
    const isFiado = document.getElementById('chkCtaCte')?.checked || false;
    posManager.aplicarRedondeo(posManager.calcularTotal(chk, null, isFiado).sugerido);
    window.uiActualizarTotalPOS();
};

window.renderCarrito = function() {
    const c = document.getElementById('cart-items');
    if (!store.carrito.length) {
        c.innerHTML = '<div style="padding:2rem 1rem;text-align:center;color:var(--muted);font-size:.82rem;">Seleccioná productos</div>';
        document.getElementById('cart-total').textContent = '$0';
        return;
    }
    c.innerHTML = store.carrito.map((i, idx) => `<div class="cart-item"><div><div class="cart-item-name">${i.nombre}</div><div style="font-size:.69rem;color:var(--muted);">${fmt(i.precioVenta)} × ${fmtQty(i.cantidad, i.unidad)}</div></div><div style="text-align:right;"><div class="cart-item-qty"><button class="qty-btn" onclick="cambiarQtyCarrito(${idx},-1)">−</button><input type="number" class="mono" value="${i.cantidad}" onchange="setQtyCarrito(${idx},this.value)" style="width:50px;text-align:center;padding:.2rem;margin:0 .2rem;" ${i.isPromo?'readonly':''}><button class="qty-btn" onclick="cambiarQtyCarrito(${idx},1)">+</button></div><div class="mono" style="font-size:.75rem;margin-top:.18rem;">${fmt(i.cantidad * i.precioVenta)}</div><button onclick="quitarDeCarrito(${idx})" style="font-size:.68rem;color:var(--accent);background:none;border:none;cursor:pointer;margin-top:2px;">✕</button></div></div>`).join('');
    window.uiActualizarTotalPOS();
};

window.renderProductGrid = function() {
    const f = (document.getElementById('pos-search').value || '').toLowerCase();
    let ps = store.db.productos.filter(p => !p.deleted);
    if (f) ps = ps.filter(p => p.nombre.toLowerCase().includes(f) || p.barcode?.includes(f) || p.codigo?.toLowerCase().includes(f));
    document.getElementById('product-grid').innerHTML = ps.map(p => {
        const s = inventario.getStock(p.id);
        return `<div class="product-card" onclick="abrirModalQty('${p.id}')"><div class="pname">${p.nombre}</div><div style="font-family:'DM Mono',font-size:.7rem;color:${s > 0 ? 'var(--green)' : 'var(--accent)'}">${s > 0 ? fmtQty(s, p.unidad) : 'Sin stock'}</div></div>`;
    }).join('');
};

window.renderPromosActivasPOS = function() {
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

window.filterProducts = function() {
    window.renderProductGrid();
};

// Inicialización de la vista POS
setTimeout(() => {
    if (typeof window.renderPromosActivasPOS === 'function') window.renderPromosActivasPOS();
}, 500);

module.exports = {};