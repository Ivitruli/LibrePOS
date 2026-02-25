const store = require('./store.js');
const proveedores = require('./proveedores.js');

const compras = {
    // Genera un código EAN-13 válido para uso interno (Prefijo 200)
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

    // Procesa una factura/remito con múltiples productos
    registrarRemito: function(proveedorId, comprobante, fecha, items, estadoPago, cuentaId) {
        if (!items || items.length === 0) {
            throw new Error('El comprobante no tiene productos asignados.');
        }

        let costoTotalRemito = 0;

        items.forEach(item => {
            const cant = parseFloat(item.cantidad);
            const costo = parseFloat(item.costoUnitario);
            costoTotalRemito += (cant * costo);

            store.db.lotes.push({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
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

        if (estadoPago === 'adeudado' && proveedorId) {
            proveedores.registrarDeuda(
                proveedorId,
                fecha,
                costoTotalRemito,
                'Factura/Remito: ' + (comprobante || 'S/N')
            );
        }

        return costoTotalRemito;
    }
};

module.exports = compras;