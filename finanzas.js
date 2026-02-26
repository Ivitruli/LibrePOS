const store = require('./store.js');

const finanzas = {
    calcSaldoCuenta: function(cId) {
        let saldo = store.db.cuentas.find(c => c.id === cId)?.saldoInicial || 0;
        
        saldo += store.db.ventas.filter(v => v.cuentaId === cId).reduce((s, v) => s + v.totalVenta + (v.costoEnvio || 0), 0);
        saldo -= store.db.gastos.filter(g => g.cuentaId === cId).reduce((s, g) => s + g.importe, 0);
        
        store.db.cuentasPorPagar.forEach(d => {
            saldo -= (d.pagos || []).filter(p => p.cuentaId === cId && p.tipo === 'pago').reduce((s, p) => s + p.monto, 0);
        });
        
        saldo -= store.db.lotes.filter(l => l.cuentaId === cId).reduce((s, l) => s + (l.cantOriginal * l.costoUnit), 0);
        
        saldo += store.db.movimientos.filter(m => m.cuentaId === cId && m.tipo === 'deposito').reduce((s, m) => s + m.importe, 0);
        saldo -= store.db.movimientos.filter(m => m.cuentaId === cId && m.tipo === 'retiro').reduce((s, m) => s + m.importe, 0);
        
        saldo += store.db.ajustesCaja.filter(a => a.cuentaId === cId && a.tipo === 'ingreso').reduce((s, a) => s + a.diferencia, 0);
        saldo -= store.db.ajustesCaja.filter(a => a.cuentaId === cId && a.tipo === 'perdida').reduce((s, a) => s + Math.abs(a.diferencia), 0);

        // Incorporación del cálculo de transferencias internas
        if (store.db.transferencias) {
            saldo -= store.db.transferencias.filter(t => t.origenId === cId).reduce((s, t) => s + t.monto, 0);
            saldo += store.db.transferencias.filter(t => t.destinoId === cId).reduce((s, t) => s + t.monto, 0);
        }

        return saldo;
    },

    calcGananciaNetaGlobal: function() {
        let ganancia = store.db.ventas.reduce((s, v) => s + v.totalVenta - v.totalCosto, 0);
        ganancia -= store.db.gastos.reduce((s, g) => s + g.importe, 0);
        ganancia += store.db.ajustesCaja.filter(a => a.tipo === 'ingreso' && !a.concepto?.includes('Envío')).reduce((s, a) => s + a.diferencia, 0);
        ganancia -= store.db.ajustesCaja.filter(a => a.tipo === 'perdida').reduce((s, a) => s + Math.abs(a.diferencia), 0);
        store.db.cuentasPorPagar.forEach(d => {
            ganancia += (d.pagos || []).filter(p => p.tipo === 'descuento').reduce((s, p) => s + p.monto, 0);
        });
        return ganancia;
    },

    calcGananciaSinAsignar: function() {
        let utilidades = this.calcGananciaNetaGlobal();
        utilidades -= store.db.movimientos.filter(m => m.tipo === 'asignacion' || m.tipo === 'reinversion').reduce((s, m) => s + m.importe, 0);
        return utilidades;
    },

    getPatrimonioNeto: function() {
        let capSocios = store.db.movimientos.filter(m => m.tipo === 'deposito').reduce((s, m) => s + m.importe, 0);
        let capReinvertido = store.db.movimientos.filter(m => m.tipo === 'reinversion').reduce((s, m) => s + m.importe, 0);
        return capSocios + capReinvertido + this.calcGananciaSinAsignar();
    },

    calcSaldoSocio: function(sId) {
        let saldo = 0;
        // CORRECCIÓN: Un depósito es un Aporte de Capital. Solo la Asignación de Utilidades genera saldo a favor.
        saldo += store.db.movimientos.filter(m => m.socioId === sId && m.tipo === 'asignacion').reduce((s, m) => s + m.importe, 0);
        saldo -= store.db.movimientos.filter(m => m.socioId === sId && m.tipo === 'retiro').reduce((s, m) => s + m.importe, 0);
        return saldo;
    },

    registrarGasto: function(fecha, categoria, tipo, importe, cuentaId, descripcion) {
        const imp = parseFloat(importe);
        if (!fecha || !categoria || isNaN(imp) || imp <= 0 || !cuentaId) throw new Error('Datos de gasto inválidos');
        store.db.gastos.push({ id: Date.now().toString(), fecha, categoria, tipo, importe: imp, cuentaId, descripcion });
    },

    crearCuenta: function(nombre, saldoInicial) {
        if (!nombre) throw new Error('Nombre requerido');
        store.db.cuentas.push({ id: Date.now().toString(), nombre, saldoInicial: parseFloat(saldoInicial) || 0, deleted: false });
    },

    eliminarCuenta: function(cId) {
        const saldo = this.calcSaldoCuenta(cId);
        if (Math.abs(saldo) > 0.001) throw new Error(`No se puede eliminar. La cuenta tiene un saldo de $${saldo.toFixed(2)}. Vacíala mediante una transferencia primero.`);
        const cta = store.db.cuentas.find(c => c.id === cId);
        if (cta) cta.deleted = true;
    },

    registrarTransferencia: function(origenId, destinoId, monto, fecha) {
        const m = parseFloat(monto);
        if (!origenId || !destinoId) throw new Error('Debe seleccionar cuenta de origen y destino');
        if (origenId === destinoId) throw new Error('La cuenta de origen y destino no pueden ser la misma');
        if (isNaN(m) || m <= 0) throw new Error('Monto a transferir inválido');
        if (!fecha) throw new Error('Debe especificar una fecha');
        
        const saldoOrigen = this.calcSaldoCuenta(origenId);
        if (saldoOrigen < m) throw new Error('Saldo insuficiente en la cuenta de origen para realizar la transferencia');

        if (!store.db.transferencias) store.db.transferencias = [];
        store.db.transferencias.push({
            id: Date.now().toString(),
            origenId,
            destinoId,
            monto: m,
            fecha
        });
    },

    ajustarCaja: function(cId, saldoReal, fecha) {
        const sr = parseFloat(saldoReal);
        if (isNaN(sr)) return false;
        const sist = this.calcSaldoCuenta(cId);
        const dif = sr - sist;
        if (Math.abs(dif) < 0.01) return false;
        
        store.db.ajustesCaja.push({
            id: Date.now().toString(),
            cuentaId: cId,
            fecha: fecha,
            diferencia: dif,
            tipo: dif > 0 ? 'ingreso' : 'perdida',
            concepto: 'Ajuste manual de saldo'
        });
        return true;
    }
};

module.exports = finanzas;