const store = require('./store.js');

const finanzas = {
    calcSaldoCuenta: function (cId) {
        let saldo = store.db.cuentas.find(c => c.id === cId)?.saldoInicial || 0;

        saldo += store.db.ventas.filter(v => v.cuentaId === cId).reduce((s, v) => s + v.totalVenta + (v.costoEnvio || 0), 0);
        saldo -= store.db.gastos.filter(g => g.cuentaId === cId).reduce((s, g) => s + g.importe, 0);

        store.db.cuentasPorPagar.forEach(d => {
            saldo -= (d.pagos || []).filter(p => p.cuentaId === cId && p.tipo === 'pago').reduce((s, p) => s + p.monto, 0);
        });

        // CORRECCIÓN: Se eliminó la resta de store.db.lotes para evitar duplicación con store.db.gastos

        saldo += store.db.movimientos.filter(m => m.cuentaId === cId && m.tipo === 'deposito').reduce((s, m) => s + m.importe, 0);
        saldo -= store.db.movimientos.filter(m => m.cuentaId === cId && m.tipo === 'retiro').reduce((s, m) => s + m.importe, 0);

        saldo += store.db.ajustesCaja.filter(a => a.cuentaId === cId && a.tipo === 'ingreso').reduce((s, a) => s + a.diferencia, 0);
        saldo -= store.db.ajustesCaja.filter(a => a.cuentaId === cId && a.tipo === 'perdida').reduce((s, a) => s + Math.abs(a.diferencia), 0);

        if (store.db.transferencias) {
            saldo -= store.db.transferencias.filter(t => t.origenId === cId).reduce((s, t) => s + t.monto, 0);
            saldo += store.db.transferencias.filter(t => t.destinoId === cId).reduce((s, t) => s + t.monto, 0);
        }

        return saldo;
    },

    calcGananciaNetaGlobal: function () {
        let ganancia = store.db.ventas.reduce((s, v) => s + v.totalVenta - v.totalCosto, 0);
        ganancia -= store.db.gastos.filter(g => g.categoria !== 'Mercadería').reduce((s, g) => s + g.importe, 0);
        ganancia += store.db.ajustesCaja.filter(a => a.tipo === 'ingreso' && !a.concepto?.includes('Envío')).reduce((s, a) => s + a.diferencia, 0);
        ganancia -= store.db.ajustesCaja.filter(a => a.tipo === 'perdida').reduce((s, a) => s + Math.abs(a.diferencia), 0);

        // CORRECCIÓN: Se eliminó el bucle de cuentasPorPagar para evitar la doble suma de los descuentos obtenidos.

        return ganancia;
    },

    calcGananciaSinAsignar: function () {
        let utilidades = this.calcGananciaNetaGlobal();
        utilidades -= store.db.movimientos.filter(m => m.tipo === 'asignacion' || m.tipo === 'reinversion').reduce((s, m) => s + m.importe, 0);
        return utilidades;
    },

    getPatrimonioNeto: function () {
        // 1. Activo Circulante: Liquidez en cuentas bancarias y caja
        let liquidez = store.db.cuentas.filter(c => !c.deleted).reduce((s, c) => s + this.calcSaldoCuenta(c.id), 0);

        // 2. Activo de Cambio: Inventario físico valorizado al costo
        let valorInventario = store.db.lotes.reduce((s, l) => s + ((parseFloat(l.cantDisponible) || 0) * (parseFloat(l.costoUnit) || 0)), 0);

        // 3. Pasivo Circulante: Deudas pendientes con proveedores
        let pasivoProveedores = store.db.cuentasPorPagar.reduce((s, d) => s + (d.monto - (d.pagos || []).reduce((x, p) => x + p.monto, 0)), 0);

        // Ecuación Patrimonial Fundamental: Patrimonio Neto = Activo - Pasivo
        return liquidez + valorInventario - pasivoProveedores;
    },

    calcSaldoSocio: function (sId) {
        let saldo = 0;
        // CORRECCIÓN: Un depósito es un Aporte de Capital. Solo la Asignación de Utilidades genera saldo a favor.
        saldo += store.db.movimientos.filter(m => m.socioId === sId && m.tipo === 'asignacion').reduce((s, m) => s + m.importe, 0);
        saldo -= store.db.movimientos.filter(m => m.socioId === sId && m.tipo === 'retiro').reduce((s, m) => s + m.importe, 0);
        return saldo;
    },

    registrarGasto: function (fecha, categoria, tipo, importe, cuentaId, descripcion) {
        const imp = parseFloat(importe);
        if (!fecha || !categoria || isNaN(imp) || imp <= 0 || !cuentaId) throw new Error('Datos de gasto inválidos');
        const nuevoGasto = { id: 'gasto_' + Date.now().toString(), fecha, categoria, tipo, importe: imp, cuentaId, descripcion };
        store.dao.guardarGasto(nuevoGasto);
        store.db.gastos.push(nuevoGasto);
    },

    crearCuenta: function (nombre, saldoInicial) {
        if (!nombre) throw new Error('Nombre requerido');
        const nuevaCta = { id: 'cta_' + Date.now().toString(), nombre, saldoInicial: parseFloat(saldoInicial) || 0, deleted: false };
        store.dao.guardarCuenta(nuevaCta);
        store.db.cuentas.push(nuevaCta);
    },

    eliminarCuenta: function (cId) {
        const saldo = this.calcSaldoCuenta(cId);
        if (Math.abs(saldo) > 0.001) throw new Error(`No se puede eliminar. La cuenta tiene un saldo de $${saldo.toFixed(2)}. Vacíala mediante una transferencia primero.`);
        const cta = store.db.cuentas.find(c => c.id === cId);
        if (cta) {
            cta.deleted = true;
            store.dao.guardarCuenta(cta);
        }
    },

    registrarTransferencia: function (origenId, destinoId, monto, fecha) {
        const m = parseFloat(monto);
        if (!origenId || !destinoId) throw new Error('Debe seleccionar cuenta de origen y destino');
        if (origenId === destinoId) throw new Error('La cuenta de origen y destino no pueden ser la misma');
        if (isNaN(m) || m <= 0) throw new Error('Monto a transferir inválido');
        if (!fecha) throw new Error('Debe especificar una fecha');

        const saldoOrigen = this.calcSaldoCuenta(origenId);
        if (saldoOrigen < m) throw new Error('Saldo insuficiente en la cuenta de origen para realizar la transferencia');

        const nuevaTransf = {
            id: 'transf_' + Date.now().toString(),
            origenId,
            destinoId,
            monto: m,
            fecha
        };
        store.dao.guardarTransferencia(nuevaTransf);
        store.db.transferencias.push(nuevaTransf);
    },

    ajustarCaja: function (cId, saldoReal, fecha) {
        const sr = parseFloat(saldoReal);
        if (isNaN(sr)) return false;
        const sist = this.calcSaldoCuenta(cId);
        const dif = sr - sist;
        if (Math.abs(dif) < 0.01) return false;

        const nuevoAjuste = {
            id: 'ajuste_' + Date.now().toString(),
            cuentaId: cId,
            fecha: fecha,
            diferencia: dif,
            tipo: dif > 0 ? 'ingreso' : 'perdida',
            concepto: 'Ajuste manual de saldo'
        };
        store.dao.guardarAjusteCaja(nuevoAjuste);
        store.db.ajustesCaja.push(nuevoAjuste);
        return true;
    }
};

module.exports = finanzas;