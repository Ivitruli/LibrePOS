const store = require('./store.js');
const finanzas = require('./finanzas.js');

const socios = {
    agregar: function (nombre, dni) {
        if (!nombre || !dni) throw new Error('Nombre y DNI son obligatorios.');
        const n = nombre.trim();
        const d = dni.trim();

        let exist = store.db.socios.find(s => s.dni === d);
        if (exist && !exist.deleted) throw new Error('El DNI ya pertenece a un socio activo.');

        if (exist && exist.deleted) {
            exist.deleted = false;
            exist.nombre = n;
            store.dao.guardarSocio(exist);
            store.loadDB();
            return { socio: exist, reactivado: true };
        } else {
            const nuevo = { id: 'socio_' + Date.now().toString(), nombre: n, dni: d, deleted: false };
            store.dao.guardarSocio(nuevo);
            store.loadDB();
            return { socio: nuevo, reactivado: false };
        }
    },

    eliminar: function (id) {
        const s = store.db.socios.find(x => x.id === id);
        if (!s) throw new Error('Socio no encontrado.');

        if (Math.abs(finanzas.calcSaldoSocio(id)) > 0.01) {
            throw new Error('El saldo del socio debe ser exactamente $0 para poder eliminarlo.');
        }

        s.deleted = true;
        store.dao.guardarSocio(s);
        store.loadDB();
        return s;
    },

    registrarMovimiento: function (socioId, tipo, importe, cuentaId, fecha, lotesConsumidos = null) {
        const imp = parseFloat(importe);
        if (!imp || imp <= 0) throw new Error('Monto inválido.');

        if (tipo === 'reinversion') {
            const dispGlobal = finanzas.calcGananciaSinAsignar();
            if (imp > dispGlobal + 0.01) throw new Error('El monto supera la Ganancia Sin Asignar.');

            const mov = { id: 'mov_' + Date.now().toString(), socioId: null, cuentaId: '', fecha: fecha, tipo: tipo, importe: imp, descripcion: 'Reinversión al Capital Propio' };
            store.dao.guardarMovimiento(mov);
            store.loadDB();
            return mov;
        }

        if (!socioId) throw new Error('Seleccione un socio.');
        const sName = store.db.socios.find(x => x.id === socioId)?.nombre || 'Desconocido';

        if (tipo === 'asignacion') {
            const dispGlobal = finanzas.calcGananciaSinAsignar();
            if (imp > dispGlobal + 0.01) throw new Error('El monto supera la Ganancia Sin Asignar.');

            const mov = { id: 'mov_' + Date.now().toString(), socioId: socioId, cuentaId: '', fecha: fecha, tipo: tipo, importe: imp, descripcion: 'Asignación de Utilidades a ' + sName };
            store.dao.guardarMovimiento(mov);
            store.loadDB();
            return mov;
        }

        if (tipo === 'retiro') {
            if (cuentaId) {
                const saldoCaja = finanzas.calcSaldoCuenta(cuentaId);
                if (imp > saldoCaja + 0.01) {
                    throw new Error(`Fondo insuficiente. La cuenta seleccionada solo dispone de $${saldoCaja.toFixed(2)}`);
                }
            }

            const desc = cuentaId ? 'Retiro de Fondos / Préstamo a ' : 'Retiro de Mercadería en especie - ';
            const mov = { id: 'mov_' + Date.now().toString(), socioId: socioId, cuentaId: cuentaId, fecha: fecha, tipo: tipo, importe: imp, descripcion: desc + sName };

            if (lotesConsumidos && lotesConsumidos.length > 0) {
                store.dao.registrarRetiroSocioTransaccional(mov, lotesConsumidos);
                store.loadDB(); // Sincronizamos la UI forzosamente ya que se modificó inventario
            } else {
                store.dao.guardarMovimiento(mov);
                store.loadDB();
            }
            return mov;
        }

        if (tipo === 'deposito') {
            // CORRECCIÓN: Ahora se considera un Aporte de Capital puro, no una deuda exigible
            const mov = { id: 'mov_' + Date.now().toString(), socioId: socioId, cuentaId: cuentaId, fecha: fecha, tipo: tipo, importe: imp, descripcion: 'Aporte de Capital de ' + sName };
            store.dao.guardarMovimiento(mov);
            store.loadDB();
            return mov;
        }

        throw new Error('Tipo de operación no reconocida.');
    }
};

module.exports = socios;