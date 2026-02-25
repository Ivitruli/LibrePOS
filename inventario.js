const store = require('./store.js');

const inventario = {
    getStock: function(pid) {
        return store.db.lotes
            .filter(l => l.productoId === pid)
            .reduce((s, l) => s + l.cantDisponible, 0);
    },

    // Modificado: Retorna el costo más alto entre los lotes aún disponibles
    getCostoMasAlto: function(pid) {
        const lotes = store.db.lotes.filter(l => l.productoId === pid && l.cantDisponible > 0);
        if (lotes.length === 0) return 0;
        return Math.max(...lotes.map(l => l.costoUnit));
    },

    calcPrecioFinal: function(pid, forceAlCosto = false) {
        const costo = this.getCostoMasAlto(pid) || 0;
        if (costo === 0) return 0;
        
        const ex = store.db.preciosExtra[pid] || { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false, precioImpreso: 0 };
        const isAlCosto = forceAlCosto || ex.alCosto;
        let raw = 0;
        
        if (isAlCosto) {
            raw = (costo + (ex.fijo || 0)) * (1 + (ex.imp || 0) / 100);
        } else {
            raw = (costo + (ex.fijo || 0)) * (1 + (ex.imp || 0) / 100) * (1 + (ex.gan || 0) / 100) * (1 - (ex.desc || 0) / 100);
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
        const lotes = store.db.lotes
            .filter(l => l.productoId === pId && l.cantDisponible > 0)
            .sort((a, b) => a.fecha.localeCompare(b.fecha));
            
        let rest = cant, costoT = 0, movs = [];
        
        for (const l of lotes) {
            if (rest <= 0) break;
            const c = Math.min(l.cantDisponible, rest);
            costoT += c * l.costoUnit;
            movs.push({ lId: l.id, c });
            l.cantDisponible -= c;
            rest -= c;
        }
        
        if (rest > 0.0001) throw new Error('Error PEPS: Desincronización de stock o cantidad insuficiente.');
        
        return { costoTotal: costoT, movs };
    },

    // Nuevo: Consume PEPS e imputa como gasto de publicidad (Muestras/Sorteos)
    consumirParaMuestra: function(pId, cant, fecha) {
        const { costoTotal } = this.consumirPEPS(pId, cant);
        const p = store.db.productos.find(x => x.id === pId);
        
        store.db.gastos.push({
            id: Date.now().toString() + '_muestra',
            fecha: fecha,
            categoria: 'Publicidad / Muestras',
            tipo: 'variable',
            importe: costoTotal,
            cuentaId: 'c1', 
            descripcion: 'Muestra/Sorteo: ' + (p ? p.nombre : 'Producto')
        });
        
        return costoTotal;
    },

    // Nuevo: Obtiene productos cuyo precio calculado difiere del último impreso/etiquetado
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

    // Nuevo: Actualiza la marca del precio en góndola
    marcarPrecioActualizado: function(pId) {
        const precioCalculado = this.calcPrecioFinal(pId);
        if (!store.db.preciosExtra[pId]) {
            store.db.preciosExtra[pId] = { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false, precioImpreso: 0 };
        }
        store.db.preciosExtra[pId].precioImpreso = precioCalculado;
        store.saveDB();
    }
};

module.exports = inventario;