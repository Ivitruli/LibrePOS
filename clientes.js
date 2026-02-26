const store = require('./store.js');

const clientes = {
    agregar: function(nombre, telefono, direccion, limiteCredito) {
        if (!nombre || nombre.trim() === '') throw new Error('El nombre del cliente es obligatorio.');
        const nuevoCliente = {
            id: 'cli_' + Date.now().toString(),
            nombre: nombre.trim(),
            telefono: telefono ? telefono.trim() : '',
            direccion: direccion ? direccion.trim() : '',
            limiteCredito: parseFloat(limiteCredito) || 0,
            deleted: false
        };
        if (!store.db.clientes) store.db.clientes = [];
        store.db.clientes.push(nuevoCliente);
    },

    editar: function(id, nombre, telefono, direccion, limiteCredito) {
        const cli = store.db.clientes.find(c => c.id === id);
        if (!cli) throw new Error('Cliente no encontrado.');
        if (!nombre || nombre.trim() === '') throw new Error('El nombre del cliente es obligatorio.');
        
        cli.nombre = nombre.trim();
        cli.telefono = telefono ? telefono.trim() : '';
        cli.direccion = direccion ? direccion.trim() : '';
        cli.limiteCredito = parseFloat(limiteCredito) || 0;
    },

    eliminar: function(id) {
        const cli = store.db.clientes.find(c => c.id === id);
        if (!cli) throw new Error('Cliente no encontrado.');
        const deuda = this.getDeudaTotal(id);
        if (deuda > 0) throw new Error(`No se puede eliminar. El cliente mantiene una deuda de $${deuda.toFixed(2)}.`);
        cli.deleted = true;
    },

    getDeudaTotal: function(clienteId) {
        if (!store.db.cuentasCorrientes) return 0;
        const movimientos = store.db.cuentasCorrientes.filter(m => m.clienteId === clienteId);
        const cargos = movimientos.filter(m => m.tipo === 'cargo').reduce((acc, val) => acc + val.monto, 0);
        const pagos = movimientos.filter(m => m.tipo === 'pago').reduce((acc, val) => acc + val.monto, 0);
        return cargos - pagos;
    },

    registrarDeuda: function(clienteId, monto, descripcion, fecha, ventaId = null) {
        const m = parseFloat(monto);
        if (isNaN(m) || m <= 0) throw new Error('Monto de deuda inválido.');
        
        const cli = store.db.clientes.find(c => c.id === clienteId);
        if (!cli) throw new Error('Cliente no encontrado.');

        const deudaActual = this.getDeudaTotal(clienteId);
        if (cli.limiteCredito > 0 && (deudaActual + m) > cli.limiteCredito) {
            throw new Error(`Límite de crédito excedido. Límite: $${cli.limiteCredito.toFixed(2)}, Deuda Actual: $${deudaActual.toFixed(2)}`);
        }

        if (!store.db.cuentasCorrientes) store.db.cuentasCorrientes = [];
        store.db.cuentasCorrientes.push({
            id: 'cc_' + Date.now().toString(),
            clienteId,
            tipo: 'cargo',
            monto: m,
            descripcion: descripcion || 'Compra en cuenta corriente',
            fecha: fecha || (new Date(Date.now() - new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 10),
            ventaId
        });
    },

    registrarPago: function(clienteId, monto, cuentaId, fecha, descripcion) {
        const m = parseFloat(monto);
        if (isNaN(m) || m <= 0) throw new Error('Monto inválido.');
        if (!cuentaId) throw new Error('Debe seleccionar una cuenta de destino o elegir desestimar la deuda.');

        const esIncobrable = (cuentaId === 'incobrable');
        const descFinal = descripcion || (esIncobrable ? 'Deuda desestimada (Pérdida)' : 'Pago / Entrega a cuenta');

        if (!store.db.cuentasCorrientes) store.db.cuentasCorrientes = [];
        store.db.cuentasCorrientes.push({
            id: 'cc_' + Date.now().toString(),
            clienteId,
            tipo: 'pago',
            monto: m,
            cuentaId: cuentaId,
            descripcion: descFinal,
            fecha: fecha || (new Date(Date.now() - new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 10)
        });

        if (esIncobrable) {
            // Registramos un Gasto asociado a una cuenta virtual ('cta_cte') para que afecte la Ganancia global sin restar dinero físico.
            if (!store.db.gastos) store.db.gastos = [];
            store.db.gastos.push({
                id: Date.now().toString() + '_incobrable',
                fecha: fecha || (new Date(Date.now() - new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 10),
                categoria: 'Pérdida por Deuda (Incobrable)',
                tipo: 'variable',
                importe: m,
                cuentaId: 'cta_cte',
                descripcion: 'Deuda desestimada de: ' + (store.db.clientes.find(c => c.id === clienteId)?.nombre || 'Cliente')
            });
        } else {
            // Ingreso real a la caja correspondiente
            if (!store.db.ajustesCaja) store.db.ajustesCaja = [];
            store.db.ajustesCaja.push({
                id: Date.now().toString() + '_pago_cc',
                cuentaId: cuentaId,
                fecha: fecha || (new Date(Date.now() - new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 10),
                diferencia: m,
                tipo: 'ingreso',
                concepto: 'Cobro de Cuenta Corriente: ' + (store.db.clientes.find(c => c.id === clienteId)?.nombre || 'Cliente')
            });
        }
    }
};

module.exports = clientes;