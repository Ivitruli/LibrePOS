const store = require('./store.js');

const comboDAO = {
    /**
     * Guarda un combo en la tabla `promociones` o lo actualiza si ya existe
     */
    guardar: function (comboData) {
        // Aprovechamos el método existente en la arquitectura si está sano, o proveemos uno purista.
        // store.dao.guardarPromocion ya se encuentra en store.js y ataca SQLite.
        store.dao.guardarPromocion(comboData);
    },

    /**
     * Elimina lógicamente o físicamente un combo
     */
    eliminar: function (idCombo) {
        store.dao.eliminarPromocion(idCombo);
    },

    /**
     * Sincroniza la caché RAM inyectando el arreglo `store.db.promociones` si el `loadDB` lo pide
     */
    recargarMemoria: function () {
        // LibrePOS globaliza recargas en store.loadDB(). 
        // Si hay una desconexión, este DAO permite forzar actualizaciones parciales.
        store.loadDB();
    }
};

module.exports = comboDAO;
