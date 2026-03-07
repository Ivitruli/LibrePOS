const store = require('./store.js');
const inventario = require('./inventario.js');

const comboCalculador = {
    /**
     * Extrae el Costo Puro (CMV) y el Precio Base Original ignorando ofertas individuales
     */
    _analizarProductoBase: function (pid) {
        const costoActivo = inventario.getCostoMasAlto(pid) || 0;
        if (costoActivo === 0) return { costo: 0, precioBase: 0 };

        // AISLAMIENTO: Ignoramos promociones individuales ('desc') o banderas ('alCosto')
        const ruleKey = pid; // Simplificado al id. (el sistema original evalúa proveedor también pero para precio base general tomamos la regla principal)
        const ex = store.db.preciosExtra[ruleKey] || { fijo: 0, imp: 0, gan: 30 };

        let precioBaseBruto = (costoActivo + (ex.fijo || 0)) * (1 + (ex.imp || 0) / 100) * (1 + (ex.gan || 30) / 100);
        let precioBaseRedondeado = Math.ceil(precioBaseBruto / 10) * 10;

        return {
            costo: costoActivo,
            precioBase: precioBaseRedondeado
        };
    },

    /**
     * Calcula la rentabilidad y sugiere el descuento máximo y precio recomendado
     * @param {Array} items - Arreglo de objetos { id: 'prod_1', cantidad: 2 }
     * @param {Number} descuentoGlobalEfectivo - Porcentaje de desc. global de la tienda (ej. 10%)
     */
    calcularSugerenciaCombo: function (items, descuentoGlobalEfectivo = 10) {
        let costoTotalCMV = 0;
        let precioListaTotal = 0;

        for (const item of items) {
            const analisis = this._analizarProductoBase(item.id);
            costoTotalCMV += (analisis.costo * item.cantidad);
            precioListaTotal += (analisis.precioBase * item.cantidad);
        }

        if (costoTotalCMV === 0 || precioListaTotal === 0) {
            return { costoCMV: 0, precioLista: 0, precioMinimoPermitido: 0, descuentoMax_PCT: 0 };
        }

        // CÁLCULO EN CASCADA Y PROTECCIÓN DE RENTABILIDAD
        // Simulamos peor escenario: cliente paga en efectivo y se aplica el descuentoGlobalEfectivo (ej 10%).
        // PrecioCombo * (1 - 0.10) > CMV -> PrecioCombo > CMV / (1 - 0.10)
        // Para proteger la ganancia, exigimos un piso mínimo de 5% sobre el costo.

        const margenSeguridad = 1.05;
        const precioMinimoPermitido = (costoTotalCMV * margenSeguridad) / (1 - (descuentoGlobalEfectivo / 100));

        let descuentoMaximoPermitido = 0;
        if (precioListaTotal > precioMinimoPermitido) {
            descuentoMaximoPermitido = 100 - ((precioMinimoPermitido * 100) / precioListaTotal);
        }

        return {
            costoCMV: parseFloat(costoTotalCMV.toFixed(2)),
            precioLista: parseFloat(precioListaTotal.toFixed(2)),
            precioMinimoPermitido: Math.ceil(precioMinimoPermitido / 10) * 10,
            descuentoMax_PCT: Math.floor(descuentoMaximoPermitido) // Redondeo hacia abajo para proteger al vendedor
        };
    },

    /**
     * Valida un precio fijo manual ingresado por el usuario asegurando que nunca perfore el CMV en caja.
     */
    validarPrecioFijo: function (items, precioFijado, descuentoGlobalEfectivo = 10) {
        let costoTotalCMV = 0;
        for (const item of items) {
            const costo = inventario.getCostoMasAlto(item.id) || 0;
            costoTotalCMV += (costo * item.cantidad);
        }

        const precioPeorEscenario = precioFijado * (1 - (descuentoGlobalEfectivo / 100));

        return {
            esValido: precioPeorEscenario > costoTotalCMV,
            rentabilidadMinimaAbsoluta: precioPeorEscenario - costoTotalCMV,
            motivo: precioPeorEscenario <= costoTotalCMV ? `El precio generaría pérdida (${precioPeorEscenario} neto vs ${costoTotalCMV} CMV)` : 'Rentable'
        };
    }
};

module.exports = comboCalculador;
