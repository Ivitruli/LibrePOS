const store = require('./store.js');

const posManager = {
    descuentoManualRedondeo: 0,
    descuentoManualExtra: 0,

    limpiar: function() {
        store.carrito = [];
        store.selectedProductId = null;
        if (document.getElementById('pos-barcode')) document.getElementById('pos-barcode').value = '';
        if (document.getElementById('chkEnvio')) document.getElementById('chkEnvio').checked = false;
        if (document.getElementById('inputCostoEnvio')) {
            document.getElementById('inputCostoEnvio').value = '';
            document.getElementById('inputCostoEnvio').style.display = 'none';
        }
        if (document.getElementById('chkCtaCte')) {
            document.getElementById('chkCtaCte').checked = false;
            document.getElementById('pos-cliente-wrap').style.display = 'none';
        }
        if (document.getElementById('pos-desc-manual')) {
            document.getElementById('pos-desc-manual').value = '';
        }
        this.descuentoManualRedondeo = 0;
        this.descuentoManualExtra = 0;
    },

    aplicarRedondeo: function(monto) {
        this.descuentoManualRedondeo = parseFloat(monto) || 0;
    },

    aplicarDescuentoExtra: function(monto) {
        this.descuentoManualExtra = parseFloat(monto) || 0;
    },

    calcularTotal: function(isEnvio, costoEnvioInput, isFiado = false) {
        let subtotal = 0;
        let subtotalSujetoADescuento = 0;
        
        store.carrito.forEach(item => {
            const totalItem = item.cantidad * item.precioVenta;
            subtotal += totalItem;
            
            // Regla de negocio: Promociones, productos al costo o con descuento propio NO reciben el descuento global
            const ex = store.db.preciosExtra[item.productoId] || {};
            const tieneDescuentoPropio = (parseFloat(ex.desc) || 0) > 0;
            
            if (!item.isPromo && !ex.alCosto && !tieneDescuentoPropio) {
                subtotalSujetoADescuento += totalItem;
            }
        });

        const cuentaSeleccionada = store.db.cuentas.find(c => c.id === store.medioSeleccionado);
        const isEfectivo = cuentaSeleccionada && cuentaSeleccionada.nombre.toLowerCase().includes('efectivo');
        
        let descEfectivo = 0;
        // Si es venta a Cuenta Corriente (Fiado), no aplica descuento por efectivo
        if (isEfectivo && !isFiado) {
            const porcentajeDesc = parseFloat(store.db.config?.descEfectivo) || 0;
            descEfectivo = subtotalSujetoADescuento * (porcentajeDesc / 100);
        }

        let envio = 0;
        if (isEnvio) {
            envio = parseFloat(costoEnvioInput) || 0;
        }

        let totalParcial = subtotal - descEfectivo + envio;
        
        // Sugerencia de redondeo (hacia abajo al múltiplo de 100 más cercano)
        let sugerido = totalParcial % 100;
        
        let totalFinal = totalParcial - this.descuentoManualRedondeo - this.descuentoManualExtra;

        return {
            subtotal,
            descEfectivo,
            envio,
            sugerido,
            descRedondeo: this.descuentoManualRedondeo,
            descExtra: this.descuentoManualExtra,
            totalFinal
        };
    }
};

module.exports = posManager;