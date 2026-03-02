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

        // Corrección de bifurcación contable
        if (estadoPago === 'adeudado' && proveedorId) {
            proveedores.registrarDeuda(proveedorId, fecha, costoTotalRemito, 'Factura/Remito: ' + (comprobante || 'S/N'));
        } else if (estadoPago === 'pagado' && cuentaId) {
            finanzas.registrarGasto(fecha, 'Mercadería', 'variable', costoTotalRemito, cuentaId, 'Compra a Proveedor: ' + (comprobante || 'S/N'));
        }

        return costoTotalRemito;
    }
};

module.exports = compras;