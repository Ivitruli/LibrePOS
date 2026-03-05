const store = require('./store.js');

const inventario = {
    getStock: function(pid) {
        return store.db.lotes
            .filter(l => l.productoId === pid)
            .reduce((s, l) => s + l.cantDisponible, 0);
    },

    getCostoMasAlto: function(pid) {
        const lotes = store.db.lotes.filter(l => l.productoId === pid && l.cantDisponible > 0);
        if (lotes.length === 0) return 0;
        return Math.max(...lotes.map(l => l.costoUnit));
    },

    calcPrecioFinal: function(pid, forceAlCosto = false) {
        const lotesDisponibles = store.db.lotes
            .filter(l => l.productoId === pid && l.cantDisponible > 0)
            .sort((a, b) => a.fecha.localeCompare(b.fecha));

        let costoActivo = 0;
        let ruleKey = pid; 

        if (lotesDisponibles.length > 0) {
            const lotePeps = lotesDisponibles[0];
            costoActivo = lotePeps.costoUnit;
            if (lotePeps.proveedorId) {
                ruleKey = `${pid}_${lotePeps.proveedorId}`; 
            }
        } else {
            costoActivo = this.getCostoMasAlto(pid) || 0;
        }

        if (costoActivo === 0) return 0;
        
        const ex = store.db.preciosExtra[ruleKey] || store.db.preciosExtra[pid] || { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false, precioImpreso: 0 };
        const isAlCosto = forceAlCosto || ex.alCosto;
        let raw = 0;
        
        if (isAlCosto) {
            raw = (costoActivo + (ex.fijo || 0)) * (1 + (ex.imp || 0) / 100);
        } else {
            raw = (costoActivo + (ex.fijo || 0)) * (1 + (ex.imp || 0) / 100) * (1 + (ex.gan || 0) / 100) * (1 - (ex.desc || 0) / 100);
        }
        
        return Math.ceil(raw / 10) * 10;
    },

    getPrecioCart: function(pid, isCartVentaCostoChecked) {
        return this.calcPrecioFinal(pid, isCartVentaCostoChecked);
    },

    isCostoProd: function(pid, isCartVentaCostoChecked) {
        return isCartVentaCostoChecked || (store.db.preciosExtra[pid] && store.db.preciosExtra[pid].alCosto);
    },

    consumirPEPS: function(pId, cant) {
        // Clonación profunda: Previene la mutación de la RAM global si la transacción aborta
        const lotesSimulados = JSON.parse(JSON.stringify(store.db.lotes))
            .filter(l => l.productoId === pId && l.cantDisponible > 0)
            .sort((a, b) => a.fecha.localeCompare(b.fecha));
            
        let rest = cant, costoT = 0, movs = [];
        
        for (const l of lotesSimulados) {
            if (rest <= 0) break;
            const c = Math.min(l.cantDisponible, rest);
            costoT += c * l.costoUnit;
            movs.push({ loteId: l.id, cantidad: c });
            l.cantDisponible -= c;
            rest -= c;
        }
        
        if (rest > 0.0001) throw new Error('Stock insuficiente para registrar la muestra.');
        
        return { costoTotal: costoT, lotesConsumidos: movs };
    },

    consumirParaMuestra: function(pId, cant, fecha) {
        const { costoTotal, lotesConsumidos } = this.consumirPEPS(pId, cant);
        const p = store.db.productos.find(x => x.id === pId);
        
        const gastoData = {
            id: 'muestra_' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            fecha: fecha,
            categoria: 'Publicidad / Muestras',
            tipo: 'variable',
            importe: costoTotal,
            cuentaId: 'c1', 
            descripcion: 'Muestra/Sorteo: ' + (p ? p.nombre : 'Producto')
        };
        
        try {
            store.dao.registrarMuestraTransaccional(gastoData, lotesConsumidos);
            store.loadDB();
            return costoTotal;
        } catch (e) {
            console.error(e);
            throw new Error('Fallo al registrar la muestra en la base de datos.');
        }
    },

    getPreciosDesactualizados: function() {
        return store.db.productos.filter(p => !p.deleted).map(p => {
            const precioCalculado = this.calcPrecioFinal(p.id);
            const ex = store.db.preciosExtra[p.id] || {};
            const precioImpreso = ex.precioImpreso || 0;
            
            if (precioCalculado !== precioImpreso && this.getStock(p.id) > 0) {
                return { id: p.id, nombre: p.nombre, calculado: precioCalculado, impreso: precioImpreso };
            }
            return null;
        }).filter(item => item !== null);
    },

    marcarPrecioActualizado: function(pId) {
        const precioCalculado = this.calcPrecioFinal(pId);
        let pol = store.db.preciosExtra[pId] || { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false, precioImpreso: 0 };
        
        pol.precioImpreso = precioCalculado;
        
        // Delegamos la persistencia al DAO en SQLite
        try {
            store.dao.guardarPoliticaPrecio(pId, pol);
            // Sincronización en RAM (opcional si se ejecuta en bucles, pero segura para integridad)
            store.loadDB(); 
        } catch (e) {
            console.error("Fallo al actualizar el histórico del precio impreso:", e.message);
        }
    }
};

module.exports = inventario;