const store = require('./store.js');

window.abrirModalVentaHistorica = function() {
    const selectCuenta = document.getElementById('vh-cuenta');
    selectCuenta.innerHTML = store.db.cuentas.filter(c => !c.deleted).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    
    const now = store.now();
    document.getElementById('vh-fecha').value = now.slice(0, 10);
    document.getElementById('vh-hora').value = now.slice(11, 16);
    document.getElementById('vh-monto').value = '';
    document.getElementById('vh-desc').value = '';
    
    document.getElementById('modal-venta-historica').classList.add('open');
};

window.cerrarModalVentaHistorica = function() {
    document.getElementById('modal-venta-historica').classList.remove('open');
};

window.confirmarVentaHistorica = function() {
    const fecha = document.getElementById('vh-fecha').value;
    const hora = document.getElementById('vh-hora').value;
    const monto = parseFloat(document.getElementById('vh-monto').value);
    const cuentaId = document.getElementById('vh-cuenta').value;
    const desc = document.getElementById('vh-desc').value.trim() || 'Venta de contingencia (Sin detalle)';
    
    if (!fecha || !hora) return window.showToast('Debe ingresar fecha y hora', 'error');
    if (!monto || monto <= 0) return window.showToast('Debe ingresar un monto válido', 'error');
    if (!cuentaId) return window.showToast('Debe seleccionar una cuenta', 'error');

    const customTs = `${fecha}T${hora}:00`;
    const vId = 'vh_' + Date.now().toString(); 
    const cuenta = store.db.cuentas.find(c => c.id === cuentaId);

    try {
        // Creamos un item genérico para que no falle el renderizado del historial
        store.db.ventaItems.push({
            ventaId: vId,
            productoId: 'item_contingencia',
            nombre: desc,
            unidad: 'global',
            cantidad: 1,
            precioVenta: monto,
            costoTotal: 0,
            isPromo: false
        });

        store.db.ventas.push({
            id: vId,
            timestamp: customTs,
            fecha: fecha,
            totalVenta: monto,
            totalCosto: 0, // El costo se imputará luego mediante la Auditoría
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
        window.showToast('Ingreso atrasado registrado con éxito');
        window.cerrarModalVentaHistorica();
        
        if (typeof window.renderTablaVentas === 'function') window.renderTablaVentas();
        
    } catch (e) {
        window.showToast(e.message, 'error');
    }
};