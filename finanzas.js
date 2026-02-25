const store = require('./store.js');
const inventario = require('./inventario.js');

const finanzas = {
    calcSaldoCuenta: function(cId) {
        const c = store.db.cuentas.find(x => x.id === cId);
        if (!c) return 0;
        let saldo = parseFloat(c.saldoInicial) || 0;
        
        store.db.ventas.filter(v => v.cuentaId === cId).forEach(v => saldo += v.totalVenta);
        store.db.gastos.filter(g => g.cuentaId === cId).forEach(g => saldo -= g.importe);
        store.db.lotes.filter(l => l.cuentaId === cId).forEach(l => saldo -= (l.cantOriginal * l.costoUnit));
        store.db.cuentasPorPagar.forEach(d => { 
            if (Array.isArray(d.pagos)) d.pagos.filter(p => p.cuentaId === cId).forEach(p => saldo -= (p.tipo === 'pago' ? p.monto : 0)); 
        });
        store.db.movimientos.filter(m => m.cuentaId === cId).forEach(m => {
            if (m.tipo === 'retiro') saldo -= m.importe;
            if (m.tipo === 'deposito') saldo += m.importe;
        });
        store.db.ajustesCaja.filter(a => a.cuentaId === cId).forEach(a => {
            if (a.tipo === 'ingreso') saldo += a.diferencia;
            else saldo -= Math.abs(a.diferencia);
        });
        
        return saldo;
    },

    calcGananciaNetaGlobal: function() {
        const ing = store.db.ventas.reduce((s, v) => s + v.totalVenta, 0);
        const cmv = store.db.ventaItems.reduce((s, vi) => s + vi.costoTotal, 0);
        const gas = store.db.gastos.reduce((s, g) => s + g.importe, 0);
        let ajusteNeto = 0;
        store.db.ajustesCaja.forEach(a => { 
            if (a.tipo === 'ingreso') ajusteNeto += a.diferencia; 
            else ajusteNeto -= Math.abs(a.diferencia); 
        });
        return ing - cmv - gas + ajusteNeto;
    },

    calcSaldoSocio: function(socioId) {
        let saldo = 0;
        store.db.movimientos.filter(m => m.socioId === socioId).forEach(m => {
            if (m.tipo === 'deposito' || m.tipo === 'asignacion') saldo += m.importe;
            if (m.tipo === 'retiro') saldo -= m.importe;
        });
        return saldo;
    },

    calcGananciaSinAsignar: function() {
        const asig = store.db.movimientos.filter(x => x.tipo === 'asignacion').reduce((s, x) => s + x.importe, 0);
        const reinv = store.db.movimientos.filter(x => x.tipo === 'reinversion').reduce((s, x) => s + x.importe, 0);
        return this.calcGananciaNetaGlobal() - asig - reinv;
    },

    getPatrimonioNeto: function() {
        const caja = store.db.cuentas.reduce((s, c) => s + this.calcSaldoCuenta(c.id), 0);
        const stockV = store.db.productos.filter(p => !p.deleted).reduce((s, p) => s + (inventario.getStock(p.id) * inventario.getCostoMasAlto(p.id)), 0);
        const pasivosComerciales = store.db.cuentasPorPagar.filter(d => !d.pagado).reduce((s, d) => s + (d.monto - (d.pagos || []).reduce((x, p) => x + p.monto, 0)), 0);
        
        let pasivoSocios = 0; 
        let activoSocios = 0;
        store.db.socios.filter(s => !s.deleted).forEach(s => {
            let saldo = this.calcSaldoSocio(s.id);
            if (saldo > 0) pasivoSocios += saldo;
            if (saldo < 0) activoSocios += Math.abs(saldo);
        });
        
        return caja + stockV + activoSocios - pasivosComerciales - pasivoSocios;
    },

    crearCuenta: function(nombre, saldoInicial) {
        if (!nombre) throw new Error('El nombre de la cuenta es obligatorio.');
        const nuevaCuenta = {
            id: 'c' + Date.now(),
            nombre: nombre.trim(),
            saldoInicial: parseFloat(saldoInicial) || 0
        };
        store.db.cuentas.push(nuevaCuenta);
        return nuevaCuenta;
    },

    ajustarCaja: function(cuentaId, saldoReal, fecha) {
        const real = parseFloat(saldoReal);
        const sis = this.calcSaldoCuenta(cuentaId);
        if (isNaN(real) || Math.abs(real - sis) < 0.01) return null;
        
        const dif = real - sis;
        const ajuste = {
            id: Date.now().toString(),
            cuentaId: cuentaId,
            fecha: fecha,
            diferencia: dif,
            tipo: dif > 0 ? 'ingreso' : 'perdida',
            concepto: dif > 0 ? 'Sobrante Caja' : 'Faltante Caja'
        };
        store.db.ajustesCaja.push(ajuste);
        return ajuste;
    },

    registrarGasto: function(fecha, categoria, tipo, importe, cuentaId, descripcion) {
        const imp = parseFloat(importe);
        if (!fecha || isNaN(imp) || imp <= 0) throw new Error('Fecha e importe son obligatorios.');
        
        const nuevoGasto = {
            id: Date.now().toString(),
            fecha: fecha,
            categoria: categoria,
            tipo: tipo,
            importe: imp,
            cuentaId: cuentaId,
            descripcion: descripcion ? descripcion.trim() : ''
        };
        store.db.gastos.push(nuevoGasto);
        return nuevoGasto;
    }
};

module.exports = finanzas;