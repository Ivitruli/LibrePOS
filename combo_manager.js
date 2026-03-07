const store = require('./store.js');
const comboCalculador = require('./combo_calculador.js');
const comboDAO = require('./combo_dao.js');

const comboManager = {
    /**
     * Obtiene todos los combos activos en la base
     */
    obtenerTodos: function () {
        return (store.db.promociones || []).filter(p => p.activa);
    },

    /**
     * Obtiene el análisis matemático de un combo simulado antes de guardarlo
     */
    simularCombo: function (arrayItems, descuentoEfectivo) {
        // arrayItems debe ser: [{ id: 'prod_1', cantidad: 2 }, ...]
        return comboCalculador.calcularSugerenciaCombo(arrayItems, descuentoEfectivo);
    },

    /**
     * Valida si el precio manual ingresado es apto para no generar pérdida
     */
    chequearPrecioManual: function (arrayItems, precioFijado, descuentoEfectivo) {
        return comboCalculador.validarPrecioFijo(arrayItems, precioFijado, descuentoEfectivo);
    },

    /**
     * Crea y guarda un nuevo combo validando las reglas de negocio (o actualiza uno existente)
     */
    crearCombo: function (nombre, arrayItems, precioFijado, idExistente = null) {
        if (!nombre || nombre.trim() === '') throw new Error('El combo debe tener un nombre.');
        if (!arrayItems || arrayItems.length < 2) throw new Error('Un combo requiere al menos 2 productos.');

        // Validación del 5% mínimo y no-perforación de CMV con chequeo de Manager
        const validacion = this.chequearPrecioManual(arrayItems, parseFloat(precioFijado), 10); // Asumimos 10% cash discount tope global

        if (!validacion.esValido) {
            throw new Error(validacion.motivo);
        }

        const idComboDestino = idExistente || 'promo_' + Date.now().toString();

        const nuevoCombo = {
            id: idComboDestino,
            nombre: nombre.trim(),
            items: arrayItems,
            precioPromo: parseFloat(precioFijado),
            activa: true
        };

        // Si ya existía, lo quitamos de la memoria ram local antes de pisarlo para evitar duplicidad de render
        if (idExistente) {
            store.db.promociones = store.db.promociones.filter(p => p.id !== idExistente);
        }

        comboDAO.guardar(nuevoCombo); // esto hace un INSERT OR REPLACE interno en la bbdd

        // Sincronizar UI
        if (!store.db.promociones) store.db.promociones = [];
        store.db.promociones.push(nuevoCombo);

        return nuevoCombo;
    },

    /**
     * Elimina un combo
     */
    eliminarCombo: function (idCombo) {
        comboDAO.eliminar(idCombo);
        store.db.promociones = store.db.promociones.filter(p => p.id !== idCombo);
    }
};

module.exports = comboManager;
