const store = require('./store.js');
const inventario = require('./inventario.js');

const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let carritoHistorico = [];

window.abrirModalVentaHistorica = function() {
    carritoHistorico = [];
    
    // Cargar cuentas disponibles
    const selectCuenta = document.getElementById('vh-cuenta');
    selectCuenta.innerHTML = store.db.cuentas.filter(c => !c.deleted).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    
    // Poner fecha y hora actual por defecto para facilitar la edición
    const now = store.now(); // Formato: YYYY-MM-DDTHH:mm:ss
    document.getElementById('vh-fecha').value = now.slice(0, 10);
    document.getElementById('vh-hora').value = now.slice(11, 16);
    
    document.getElementById('vh-prod-search').value = '';
    document.getElementById('vh-prod-select').style.display = 'none';
    
    window.renderCarritoHistorico();
    document.getElementById('modal-venta-historica').classList.add('open');
};

window.cerrarModalVentaHistorica = function() {
    document.getElementById('modal-venta-historica').classList.remove('open');
};

window.buscarProdVentaHistorica = function() {
    const query = document.getElementById('vh-prod-search').value.toLowerCase();
    const select = document.getElementById('vh-prod-select');
    
    if (query.length < 2) {
        select.style.display = 'none';
        return;
    }

    const filtrados = store.db.productos.filter(p => !p.deleted && (p.nombre.toLowerCase().includes(query) || p.barcode?.includes(query) || p.codigo?.toLowerCase().includes(query)));
    
    if (filtrados.length > 0) {
        select.innerHTML = filtrados.map(p => `<option value="${p.id}">${p.nombre} (${fmt(inventario.getPrecioCart(p.id))})</option>`).join('');
        select.style.display = 'block';
    } else {
        select.style.display = 'none';
    }
};

window.agregarItemVentaHistorica = function() {
    const select = document.getElementById('vh-prod-select');
    if (select.style.display === 'none' || !select.value) return window.showToast('Buscá y seleccioná un producto', 'error');
    
    const qty = parseFloat(document.getElementById('vh-qty').value);
    if (!qty || qty <= 0) return window.showToast('Cantidad inválida', 'error');

    const prod = store.db.productos.find(p => p.id === select.value);
    if (!prod) return;

    // Validar stock: aunque la venta sea vieja, la mercadería física falta HOY
    if (qty > inventario.getStock(prod.id) + 0.001) {
         return window.showToast('Stock actual insuficiente para descontar esta venta', 'error');
    }

    const precioU = inventario.getPrecioCart(prod.id);
    const ex = carritoHistorico.find(i => i.productoId === prod.id);
    
    if (ex) {
        ex.cantidad += qty;
    } else {
        carritoHistorico.push({
            productoId: prod.id,
            nombre: prod.nombre,
            unidad: prod.unidad,
            cantidad: qty,
            precioVenta: precioU
        });
    }

    document.getElementById('vh-prod-search').value = '';
    select.style.display = 'none';
    document.getElementById('vh-qty').value = '1';
    window.renderCarritoHistorico();
};

window.quitarItemHistorico = function(idx) {
    carritoHistorico.splice(idx, 1);
    window.renderCarritoHistorico();
};

window.renderCarritoHistorico = function() {
    const tbody = document.getElementById('tabla-vh-items');
    let html = '';
    let total = 0;
    let costoTotalEstimado = 0;

    if (carritoHistorico.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Sin productos cargados.</td></tr>';
        document.getElementById('vh-total-final').innerText = '$0.00';
        document.getElementById('vh-costo-total').innerText = '$0.00';
        return;
    }

    carritoHistorico.forEach((item, idx) => {
        const subtotal = item.cantidad * item.precioVenta;
        total += subtotal;
        
        const costoU = inventario.getPrecioCart(item.productoId, true); // true = costo
        costoTotalEstimado += costoU * item.cantidad;

        html += `<tr>
            <td>${item.nombre}</td>
            <td class="mono">${item.cantidad}</td>
            <td class="mono">${fmt(item.precioVenta)}</td>
            <td class="mono" style="font-weight:bold; color:var(--ink);">${fmt(subtotal)}</td>
            <td><button class="btn btn-secondary btn-sm" style="padding: 2px 5px; color: var(--accent);" onclick="window.quitarItemHistorico(${idx})">✕</button></td>
        </tr>`;
    });

    tbody.innerHTML = html;
    document.getElementById('vh-total-final').innerText = fmt(total);
    document.getElementById('vh-costo-total').innerText = fmt(costoTotalEstimado);
};

window.confirmarVentaHistorica = function() {
    if (carritoHistorico.length === 0) return window.showToast('El carrito está vacío', 'error');
    
    const fecha = document.getElementById('vh-fecha').value;
    const hora = document.getElementById('vh-hora').value;
    const cuentaId = document.getElementById('vh-cuenta').value;
    
    if (!fecha || !hora) return window.showToast('Debe ingresar fecha y hora exactas', 'error');
    if (!cuentaId) return window.showToast('Debe seleccionar una cuenta de cobro', 'error');

    // MÁGIA: Construir el timestamp falso/personalizado para engañar a los reportes
    const customTs = `${fecha}T${hora}:00`;
    const vId = 'vh_' + Date.now().toString(); 
    
    const cuenta = store.db.cuentas.find(c => c.id === cuentaId);
    let totalVenta = 0, totalCosto = 0;

    try {
        for (const i of carritoHistorico) {
            if (i.cantidad > inventario.getStock(i.productoId) + 0.001) throw new Error('Stock insuficiente de: ' + i.nombre);
        }

        for (const i of carritoHistorico) {
            const { costoTotal } = inventario.consumirPEPS(i.productoId, i.cantidad);
            const sub = i.cantidad * i.precioVenta;
            
            totalVenta += sub;
            totalCosto += costoTotal;
            
            store.db.ventaItems.push({
                ventaId: vId,
                productoId: i.productoId,
                nombre: i.nombre,
                unidad: i.unidad,
                cantidad: i.cantidad,
                precioVenta: i.precioVenta,
                costoTotal: costoTotal,
                isPromo: false
            });
        }

        store.db.ventas.push({
            id: vId,
            timestamp: customTs,
            fecha: fecha,
            totalVenta: totalVenta,
            totalCosto: totalCosto,
            cuentaId: cuenta.id,
            medioPago: cuenta.nombre,
            descEfectivo: 0,
            descRedondeo: 0,
            costoEnvio: 0,
            envioPagado: false,
            facturada: false,
            esHistorica: true 
        });

        store.saveDB();
        window.showToast('Venta atrasada registrada con éxito');
        window.cerrarModalVentaHistorica();
        
        if (typeof window.renderTablaVentas === 'function') window.renderTablaVentas();
        if (typeof window.renderProductGrid === 'function') window.renderProductGrid();
        
    } catch (e) {
        window.showToast(e.message, 'error');
    }
};