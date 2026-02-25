const store = require('./store.js');

const proveedores = {
    agregar: function(nombre, contacto, tel, diasPedido, diasEntrega) {
        if (!nombre) throw new Error('El nombre del proveedor es obligatorio.');
        const nuevoProv = { 
            id: Date.now().toString(), 
            nombre: nombre.trim(), 
            contacto: contacto ? contacto.trim() : '', 
            tel: tel ? tel.trim() : '', 
            diasPedido: diasPedido || [], 
            diasEntrega: diasEntrega || [], 
            deleted: false 
        };
        store.db.proveedores.push(nuevoProv);
        return nuevoProv;
    },

    editar: function(id, nombre, contacto, tel, diasPedido, diasEntrega) {
        const p = store.db.proveedores.find(x => x.id === id);
        if (!p) throw new Error('Proveedor no encontrado en la base de datos.');
        p.nombre = nombre.trim(); 
        p.contacto = contacto ? contacto.trim() : ''; 
        p.tel = tel ? tel.trim() : ''; 
        p.diasPedido = diasPedido || []; 
        p.diasEntrega = diasEntrega || [];
        return p;
    },

    eliminar: function(id) {
        const p = store.db.proveedores.find(x => x.id === id);
        if (!p) throw new Error('Proveedor no encontrado.');
        
        const deudasPendientes = store.db.cuentasPorPagar.filter(d => d.proveedorId === id && !d.pagado);
        if (deudasPendientes.length > 0) throw new Error('No se puede eliminar: el proveedor tiene deudas comerciales pendientes.');
        
        p.deleted = true;
        return p;
    },

    registrarDeuda: function(proveedorId, fecha, monto, descripcion) {
        if (!proveedorId || !fecha || isNaN(monto) || monto <= 0) throw new Error('Datos de deuda inválidos o incompletos.');
        const nuevaDeuda = { id: Date.now().toString(), proveedorId: proveedorId, fecha: fecha, monto: parseFloat(monto), descripcion: descripcion ? descripcion.trim() : '', pagado: false, pagos: [] };
        store.db.cuentasPorPagar.push(nuevaDeuda);
        return nuevaDeuda;
    },

    registrarPagoDeuda: function(deudaId, montoPagar, descuentoObtenido, cuentaId, fechaPago) {
        const d = store.db.cuentasPorPagar.find(x => x.id === deudaId);
        if (!d) throw new Error('El registro de deuda no existe.');
        const monto = parseFloat(montoPagar) || 0; 
        const desc = parseFloat(descuentoObtenido) || 0; 
        const totalSaldado = monto + desc;
        
        if (totalSaldado <= 0) throw new Error('Monto inválido.');
        const yaPagado = d.pagos.reduce((acumulado, p) => acumulado + p.monto, 0);
        
        if (totalSaldado > (d.monto - yaPagado + 0.01)) throw new Error('El pago y descuento exceden el saldo deudor actual.');
        
        if (monto > 0) d.pagos.push({ fecha: fechaPago, monto: monto, cuentaId: cuentaId, tipo: 'pago' });
        
        if (desc > 0) {
            d.pagos.push({ fecha: fechaPago, monto: desc, cuentaId: null, tipo: 'descuento' });
            store.db.ajustesCaja.push({ 
                id: Date.now().toString() + '_desc', 
                cuentaId: 'virtual_desc', 
                fecha: fechaPago, 
                diferencia: desc, 
                tipo: 'ingreso', 
                concepto: 'Descuentos obtenidos - ' + (store.db.proveedores.find(p => p.id === d.proveedorId)?.nombre || '') 
            });
        }
        d.pagado = (yaPagado + totalSaldado >= d.monto - 0.01);
        return d;
    }
};

module.exports = proveedores;