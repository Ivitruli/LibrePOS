const store = require('./store.js');

const posManager = {
    descuentoRedondeo: 0,
    costoEnvio: parseFloat(localStorage.getItem('librepos_last_shipping')) || 0,

    calcularTotal: function(aplicaEnvio, inputEnvioValor) {
        // 1. Calcular el Subtotal Puro
        const subtotal = store.carrito.reduce((sum, item) => {
            const precioUnitario = parseFloat(item.precioVenta) || 0;
            const qty = parseFloat(item.cantidad) || 0;
            return sum + (precioUnitario * qty);
        }, 0);

        // 2. Actualizar costo de envío si el usuario escribió algo
        if (inputEnvioValor !== null && inputEnvioValor !== "") {
            this.costoEnvio = parseFloat(inputEnvioValor) || 0;
            localStorage.setItem('librepos_last_shipping', this.costoEnvio);
        }

        // 3. Descuento en Efectivo (Leyendo la configuración global)
        const cuenta = store.db.cuentas.find(c => c.id === store.medioSeleccionado);
        const esEfectivo = cuenta ? cuenta.nombre.toLowerCase() === 'efectivo' : false;
        const pctEfectivo = store.db.config.descEfectivo || 0;

        let descEfectivo = 0;
        if (esEfectivo) {
            // Aplica descuento solo a productos que no estén "al costo" (regla original de tu negocio)
            descEfectivo = store.carrito.reduce((sum, item) => {
                const ex = store.db.preciosExtra[item.productoId] || {};
                if (ex.alCosto || ex.desc > 0) return sum;
                return sum + (parseFloat(item.cantidad) * parseFloat(item.precioVenta));
            }, 0) * (pctEfectivo / 100);
        }

        // 4. Redondeo Sugerido (Calculado SOBRE el saldo ya descontado en efectivo)
        const subtotalPostEfectivo = subtotal - descEfectivo;
        const subtotalSanitizado = Math.round(subtotalPostEfectivo * 100) / 100;
        const sugerido = Math.floor(subtotalSanitizado) % 100; // Extrae el pico para redondear a centena

        // 5. Armar el Total Final
        const totalConDescuentos = subtotalSanitizado - this.descuentoRedondeo;
        const totalFinal = aplicaEnvio ? totalConDescuentos + this.costoEnvio : totalConDescuentos;

        return {
            subtotal: subtotal,
            descEfectivo: descEfectivo,
            sugerido: sugerido,
            descRedondeo: this.descuentoRedondeo,
            envio: this.costoEnvio,
            totalFinal: Math.max(0, totalFinal) // Blindaje contra totales negativos
        };
    },

    aplicarRedondeo: function(monto) {
        this.descuentoRedondeo = parseFloat(monto) || 0;
    },

    limpiar: function() {
        this.descuentoRedondeo = 0;
        store.carrito = [];
    }
};

module.exports = posManager;