const store = require('./store.js');

const finanzas = {
    calcSaldoCuenta: function (cId) {
        let saldo = store.db.cuentas.find(c => c.id === cId)?.saldoInicial || 0;

        saldo += store.db.ventas.filter(v => v.cuentaId === cId).reduce((s, v) => s + v.totalVenta + (v.costoEnvio || 0), 0);
        // FEATURE: Solo deducir gastos si están pagados
        saldo -= store.db.gastos.filter(g => g.cuentaId === cId && g.estado === 'pagado').reduce((s, g) => s + g.importe, 0);

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
        // FEATURE: Solo afectar la ganancia neta si el gasto ya fue ejecutado
        ganancia -= store.db.gastos.filter(g => g.categoria !== 'Mercadería' && g.estado === 'pagado').reduce((s, g) => s + g.importe, 0);
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

    registrarGasto: function (fecha, categoria, tipo, importe, cuentaId, descripcion, estado = 'pagado') {
        const imp = parseFloat(importe);
        if (!fecha || !categoria || isNaN(imp) || imp <= 0) throw new Error('Datos de gasto inválidos');
        // Si el estado es pendiente, se permite no asignar cuenta momentáneamente (se asume cuenta "" temporaria)
        if (estado === 'pagado' && !cuentaId) throw new Error('Debe especificar una cuenta para liquidar inmediatamente el gasto');

        const nuevoGasto = { id: 'gasto_' + Date.now().toString(), fecha, categoria, tipo, importe: imp, cuentaId: cuentaId || '', descripcion, estado };
        store.dao.guardarGasto(nuevoGasto);
        store.loadDB();
    },

    eliminarGastos: function (idsArray) {
        if (!Array.isArray(idsArray) || idsArray.length === 0) throw new Error('No hay gastos para eliminar');
        store.dao.eliminarGastos(idsArray);
        store.loadDB();
    },

    liquidarGastoProgramado: function (gastoId, cuentaId) {
        if (!gastoId || !cuentaId) throw new Error('Datos inválidos para liquidar el gasto');
        store.dao.liquidarGastoProgramado(gastoId, cuentaId);
        store.loadDB();
    },

    crearCuenta: function (nombre, saldoInicial) {
        if (!nombre) throw new Error('Nombre requerido');
        const nuevaCta = { id: 'cta_' + Date.now().toString(), nombre, saldoInicial: parseFloat(saldoInicial) || 0, deleted: false };
        store.dao.guardarCuenta(nuevaCta);
        store.loadDB();
    },

    eliminarCuenta: function (cId) {
        const saldo = this.calcSaldoCuenta(cId);
        if (Math.abs(saldo) > 0.001) throw new Error(`No se puede eliminar. La cuenta tiene un saldo de $${saldo.toFixed(2)}. Vacíala mediante una transferencia primero.`);
        const cta = store.db.cuentas.find(c => c.id === cId);
        if (cta) {
            cta.deleted = true;
            store.dao.guardarCuenta(cta);
            store.loadDB();
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
        store.loadDB();
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
        store.loadDB();
        return true;
    },

    // --- MÓDULO DE RATIOS FINANCIEROS EDUCATIVOS ---
    getDiagnosticoRatios: function () {
        // Balances Base
        const liquidezTotal = store.db.cuentas.filter(c => !c.deleted).reduce((s, c) => s + this.calcSaldoCuenta(c.id), 0);
        const valorInventario = store.db.lotes.reduce((s, l) => s + ((parseFloat(l.cantDisponible) || 0) * (parseFloat(l.costoUnit) || 0)), 0);
        const deudaProveedores = store.db.cuentasPorPagar.reduce((s, d) => s + (d.monto - (d.pagos || []).reduce((x, p) => x + p.monto, 0)), 0);

        // Deuda de Clientes (Cuentas Corrientes)
        const dbCtasCtes = store.db.cuentasCorrientes || [];
        const clientesCargos = dbCtasCtes.filter(m => m.tipo === 'cargo').reduce((acc, val) => acc + val.monto, 0);
        const clientesPagos = dbCtasCtes.filter(m => m.tipo === 'pago').reduce((acc, val) => acc + val.monto, 0);
        const cuentasPorCobrar = clientesCargos - clientesPagos;

        // Variables Macroeconómicas Mensuales (Línea de corte: Últimos 30 días)
        const hace30DiasObj = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const hace30Dias = hace30DiasObj.toISOString().slice(0, 10);

        const ventasMes = store.db.ventas.filter(v => v.fecha >= hace30Dias);
        const comprasMes = store.db.cuentasPorPagar.filter(c => c.fecha >= hace30Dias);

        const ventasTotalesMes = ventasMes.reduce((s, v) => s + v.totalVenta + (v.costoEnvio || 0), 0);
        const costoMercaderiaVendidaMes = ventasMes.reduce((s, v) => s + v.totalCosto, 0);
        const ventasFiadoMes = ventasMes.filter(v => v.medioPago === 'Cuenta Corriente').reduce((s, v) => s + v.totalVenta, 0);
        const comprasFiadoMes = comprasMes.reduce((s, c) => s + c.monto, 0);

        const gananciaOperativa = this.calcGananciaNetaGlobal();
        const interesesBancarios = store.db.gastos.filter(g =>
            (g.categoria.toLowerCase().includes('interés') ||
                g.categoria.toLowerCase().includes('comision') ||
                g.categoria.toLowerCase().includes('banco') ||
                g.categoria.toLowerCase().includes('financiero'))
            && g.estado === 'pagado'
        ).reduce((s, g) => s + g.importe, 0);

        // Subconjuntos contables
        const activoCorriente = liquidezTotal + valorInventario + cuentasPorCobrar;
        const pasivoCorriente = deudaProveedores;

        // --- CÁLCULOS: LIQUIDEZ ---
        // (pasivoCorriente aislado en null en lugar de Infinite para el front)
        const liquidezCorriente = pasivoCorriente === 0 ? null : activoCorriente / pasivoCorriente;
        const liquidezAcida = pasivoCorriente === 0 ? null : (activoCorriente - valorInventario) / pasivoCorriente;
        const liquidezInmediata = pasivoCorriente === 0 ? null : liquidezTotal / pasivoCorriente;

        // --- CÁLCULOS: ACTIVOS ---
        const rotacionInventarios = valorInventario === 0 ? null : costoMercaderiaVendidaMes / valorInventario;
        const rotacionCreditos = cuentasPorCobrar === 0 ? null : ventasFiadoMes / cuentasPorCobrar;
        const diasPromedioCobranza = ventasFiadoMes === 0 ? 0 : (cuentasPorCobrar * 30) / ventasFiadoMes;
        const rotacionDeudas = deudaProveedores === 0 ? null : comprasFiadoMes / deudaProveedores;
        const diasPromedioPago = comprasFiadoMes === 0 ? 0 : (deudaProveedores * 30) / comprasFiadoMes;
        const rotacionActivosTotales = activoCorriente === 0 ? null : ventasTotalesMes / activoCorriente;

        // --- CÁLCULOS: DEUDAS ---
        const deudaNivel = activoCorriente === 0 ? 0 : pasivoCorriente / activoCorriente;
        const coberturaIntereses = interesesBancarios === 0 ? null : gananciaOperativa / interesesBancarios;

        // --- CÁLCULOS: RENTABILIDAD ---
        const rentabilidadVentas = ventasTotalesMes === 0 ? 0 : (gananciaOperativa / ventasTotalesMes) * 100;
        const patrimonioNeto = this.getPatrimonioNeto() + cuentasPorCobrar; // Ajustado con Cuentas Corrientes que aumentan el Patrimonio
        const rentabilidadNeta = patrimonioNeto === 0 ? 0 : (gananciaOperativa / Math.abs(patrimonioNeto)) * 100;

        // Punto de Equilibrio Modificado (Mes Actual Puro Temporal)
        const mesStr = new Date().toISOString().slice(0, 7);
        const gfijos = store.db.gastos.filter(g => g.tipo === 'fijo' && g.fecha.startsWith(mesStr) && g.estado === 'pagado').reduce((s, g) => s + g.importe, 0);
        const vtasMesActual = store.db.ventas.filter(v => v.fecha.startsWith(mesStr)).reduce((s, v) => s + v.totalVenta, 0);
        const costMesActual = store.db.ventas.filter(v => v.fecha.startsWith(mesStr)).reduce((s, v) => s + v.totalCosto, 0);
        const pEq = vtasMesActual > costMesActual ? gfijos / ((vtasMesActual - costMesActual) / vtasMesActual) : 0;

        return {
            liquidez: {
                corriente: isNaN(liquidezCorriente) ? 0 : liquidezCorriente,
                acida: isNaN(liquidezAcida) ? 0 : liquidezAcida,
                inmediata: isNaN(liquidezInmediata) ? 0 : liquidezInmediata
            },
            activos: {
                rotacionInventarios: isNaN(rotacionInventarios) ? 0 : rotacionInventarios,
                rotacionCreditos: isNaN(rotacionCreditos) ? 0 : rotacionCreditos,
                diasCobranza: isNaN(diasPromedioCobranza) ? 0 : diasPromedioCobranza,
                rotacionDeudas: isNaN(rotacionDeudas) ? 0 : rotacionDeudas,
                diasPago: isNaN(diasPromedioPago) ? 0 : diasPromedioPago,
                rotacionActivos: isNaN(rotacionActivosTotales) ? 0 : rotacionActivosTotales
            },
            deudas: {
                nivel: isNaN(deudaNivel) ? 0 : deudaNivel,
                cobertura: isNaN(coberturaIntereses) ? -1 : coberturaIntereses
            },
            rentabilidad: {
                ventasROS: isNaN(rentabilidadVentas) ? 0 : rentabilidadVentas,
                netaROE: isNaN(rentabilidadNeta) ? 0 : rentabilidadNeta,
                puntoEquilibrio: isNaN(pEq) ? 0 : pEq,
                patrimonio: patrimonioNeto,
                ganancia: gananciaOperativa
            }
        };
    }
};

module.exports = finanzas;