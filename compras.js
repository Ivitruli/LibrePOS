const store = require('./store.js');
const proveedores = require('./proveedores.js');
const finanzas = require('./finanzas.js'); // Inyección de dependencia financiera

const compras = {
    generarCodigoInterno: function() {
        const prefijo = "200";
        const timestamp = Date.now().toString().slice(-9);
        const base = prefijo + timestamp;
        
        let suma = 0;
        for (let i = 0; i < 12; i++) {
            suma += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const verificador = (10 - (suma % 10)) % 10;
        
        return base + verificador;
    },

registrarRemito: function(proveedorId, comprobante, fecha, items, estadoPago, cuentaId, cargosExtra = 0) {
        if (!items || items.length === 0) {
            throw new Error('El comprobante no tiene productos asignados.');
        }

        let costoTotalRemito = parseFloat(cargosExtra) || 0;
        const lotesAInsertar = [];

        items.forEach(item => {
            const cant = parseFloat(item.cantidad);
            const costo = parseFloat(item.costoUnitario);
            costoTotalRemito += (cant * costo);

            lotesAInsertar.push({
                id: 'lote_' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
                productoId: item.productoId,
                fecha: fecha,
                vencimiento: item.vencimiento || null,
                cantOriginal: cant,
                cantDisponible: cant,
                costoUnit: costo,
                cuentaId: estadoPago === 'pagado' ? cuentaId : null,
                proveedorId: proveedorId || null,
                comprobante: comprobante ? comprobante.trim() : ''
            });
        });

        const datosFinancieros = {
            estadoPago: estadoPago,
            proveedorId: proveedorId,
            fecha: fecha,
            costoTotal: costoTotalRemito,
            cuentaId: cuentaId,
            comprobante: comprobante
        };

        try {
            // Disparamos la transacción ACID en SQLite
            store.dao.registrarCompraTransaccional(lotesAInsertar, datosFinancieros);
            
            // Sincronizamos la RAM para que la interfaz se actualice al instante
            store.loadDB(); 
        } catch (error) {
            console.error("Error en transacción de compra:", error);
            store.loadDB(); // Limpieza de seguridad
            throw new Error("Fallo al registrar la compra en la base de datos: " + error.message);
        }
    }
};

module.exports = compras;