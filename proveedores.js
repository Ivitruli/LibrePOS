const store = require('./store.js');
const dbManager = require('./database.js');

const proveedores = {
    // --- 1. MÉTODOS CRUD CON SQLITE ---
    agregar: function (nombre, contacto, tel, email, direccion, diasPedido, diasEntrega) {
        if (!nombre) throw new Error('El nombre del proveedor es obligatorio.');

        const nuevoProv = {
            id: 'prov_' + Date.now().toString(),
            nombre: nombre.trim(),
            contacto: contacto ? contacto.trim() : '',
            telefono: tel ? tel.trim() : '',
            email: email ? email.trim() : '',
            direccion: direccion ? direccion.trim() : '',
            diasPedido: diasPedido || [],
            diasEntrega: diasEntrega || [],
            deleted: false
        };

        // 1. Guardar en SQLite
        store.dao.guardarProveedor(nuevoProv);

        // 2. Reflejar en memoria RAM para UI en tiempo real
        store.db.proveedores.push(nuevoProv);

        return nuevoProv;
    },

    editar: function (id, nombre, contacto, tel, email, direccion, diasPedido, diasEntrega) {
        const p = store.db.proveedores.find(x => x.id === id);
        if (!p) throw new Error('Proveedor no encontrado en la base de datos.');

        // 1. Modificar el objeto
        p.nombre = nombre.trim();
        p.contacto = contacto ? contacto.trim() : '';
        p.telefono = tel ? tel.trim() : '';
        p.email = email ? email.trim() : '';
        p.direccion = direccion ? direccion.trim() : '';
        p.diasPedido = diasPedido || [];
        p.diasEntrega = diasEntrega || [];

        // 2. Actualizar en SQLite
        store.dao.guardarProveedor(p);

        return p;
    },

    eliminar: function (id) {
        const p = store.db.proveedores.find(x => x.id === id);
        if (!p) throw new Error('Proveedor no encontrado.');

        // VALIDACIÓN: No eliminar si hay deuda
        const deudasPendientes = store.db.cuentasPorPagar.filter(d => d.proveedorId === id && (!d.estado || d.estado === 'pendiente' || !d.pagado));
        if (deudasPendientes.length > 0) throw new Error('No se puede eliminar: el proveedor tiene deudas comerciales pendientes.');

        // 1. Marcar como borrado lógico
        p.deleted = true;

        // 2. Actualizar en SQLite
        store.dao.guardarProveedor(p);

        return p;
    },

    // --- 2. MÉTODOS DE FINANZAS DE PROVEEDORES ---
    registrarDeuda: function (proveedorId, fecha, monto, descripcion) {
        if (!proveedorId || !fecha || isNaN(monto) || monto <= 0) throw new Error('Datos de deuda inválidos o incompletos.');

        const nuevaDeuda = {
            id: 'cxp_' + Date.now().toString(),
            proveedorId: proveedorId,
            fecha: fecha,
            monto: parseFloat(monto),
            descripcion: descripcion ? descripcion.trim() : '',
            estado: 'pendiente',
            pagos: []
        };

        // Persistir atómicamente en SQLite
        store.dao.guardarCuentaPorPagar(nuevaDeuda);

        if (!store.db.cuentasPorPagar) store.db.cuentasPorPagar = [];
        store.db.cuentasPorPagar.push(nuevaDeuda);

        return nuevaDeuda;
    },

    registrarPagoDeuda: function (deudaId, montoPagar, descuentoObtenido, cuentaId, fechaPago) {
        const d = store.db.cuentasPorPagar.find(x => x.id === deudaId);
        if (!d) throw new Error('El registro de deuda no existe.');

        const monto = parseFloat(montoPagar) || 0;
        const desc = parseFloat(descuentoObtenido) || 0;
        const totalSaldado = monto + desc;

        if (totalSaldado <= 0) throw new Error('Monto inválido.');
        const yaPagado = (d.pagos || []).reduce((acumulado, p) => acumulado + p.monto, 0);

        if (totalSaldado > (d.monto - yaPagado + 0.01)) throw new Error('El pago y descuento exceden el saldo deudor actual.');

        const nuevosPagos = [];
        let nuevoAjuste = null;
        let dEstadoNuevo = (yaPagado + totalSaldado >= d.monto - 0.01) ? 'pagado' : 'pendiente';

        if (monto > 0) {
            nuevosPagos.push({ id: 'pago_' + Date.now().toString() + '_1', deudaId: d.id, fecha: fechaPago, monto: monto, cuentaId: cuentaId, tipo: 'pago' });
        }

        if (desc > 0) {
            nuevosPagos.push({ id: 'pago_' + Date.now().toString() + '_2', deudaId: d.id, fecha: fechaPago, monto: desc, cuentaId: null, tipo: 'descuento' });
            nuevoAjuste = {
                id: 'ajuste_' + Date.now().toString() + '_desc',
                cuentaId: 'virtual_desc',
                fecha: fechaPago,
                diferencia: desc,
                tipo: 'ingreso',
                concepto: 'Descuentos obtenidos - ' + (store.db.proveedores.find(p => p.id === d.proveedorId)?.nombre || '')
            };
        }

        // Ejecutar el lote de updates en SQLite garantizando atomicidad
        dbManager.ejecutarTransaccion(() => {
            for (const p of nuevosPagos) {
                store.dao.guardarPagoDeuda(p);
            }
            if (nuevoAjuste) {
                store.dao.guardarAjusteCaja(nuevoAjuste);
            }
            d.estado = dEstadoNuevo;
            d.pagado = (dEstadoNuevo === 'pagado'); // Wrapper viejo
            store.dao.guardarCuentaPorPagar(d);
        });

        // Confirmar en RAM solo tras éxito de de BD
        if (!d.pagos) d.pagos = [];
        for (const p of nuevosPagos) {
            d.pagos.push(p);
        }
        if (nuevoAjuste) {
            if (!store.db.ajustesCaja) store.db.ajustesCaja = [];
            store.db.ajustesCaja.push(nuevoAjuste);
        }

        return d;
    }
};

module.exports = proveedores;