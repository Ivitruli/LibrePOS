const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const DB_KEY = 'librepos_data';

const store = {
    // Variables de Estado Global
    dbFilePath: localStorage.getItem('librepos_db_path') || null,
    db: null,
    carrito: [],
    selectedProductId: null,
    medioSeleccionado: '',
    
    // Generador de DB en blanco
    emptyDB: function() {
        return {
            productos: [], lotes: [], ventas: [], ventaItems: [], gastos: [], proveedores: [], socios: [], movimientos: [], preciosExtra: {},
            clientes: [], cuentasCorrientes: [],
            cuentas: [
                { id: 'c1', nombre: 'Efectivo', saldoInicial: 0 },
                { id: 'c2', nombre: 'UALA', saldoInicial: 0 },
                { id: 'c3', nombre: 'Mercado Pago', saldoInicial: 0 },
                { id: 'c4', nombre: 'BNA', saldoInicial: 0 },
                { id: 'c5', nombre: 'Cuenta DNI', saldoInicial: 0 }
            ],
            ajustesCaja: [], cuentasPorPagar: [],
            config: { descEfectivo: 10, nombre: '', direccion: '', tel: '', email: '', logo: '', ig: '', fb: '', colorAccent: '#C4432A', colorInk: '#1A1612', demoLoaded: false }
        };
    },

    // Lector de Disco
    loadDB: function() {
        try {
            let r = null;
            if (this.dbFilePath && fs.existsSync(this.dbFilePath)) {
                r = fs.readFileSync(this.dbFilePath, 'utf-8');
            } else {
                r = localStorage.getItem(DB_KEY);
            }

            if (r) {
                const d = JSON.parse(r);
                const e = this.emptyDB();
                // Rellena claves faltantes
                Object.keys(e).forEach(k => { if (d[k] === undefined) d[k] = e[k]; });
                
                // Migraciones de seguridad
                if (d.proveedores) d.proveedores.forEach(p => { if (!Array.isArray(p.diasPedido)) p.diasPedido = []; if (!Array.isArray(p.diasEntrega)) p.diasEntrega = []; });
                if (d.gastos) d.gastos.forEach(g => { if (!g.tipo) g.tipo = 'variable'; if (!g.cuentaId) { const c = d.cuentas.find(x => x.nombre === g.medio); g.cuentaId = c ? c.id : 'c1'; } });
                if (d.ventas) d.ventas.forEach(v => { if (!v.cuentaId) { const c = d.cuentas.find(x => x.nombre === v.medioPago); v.cuentaId = c ? c.id : 'c1'; } });
                if (d.productos) d.productos.forEach(p => { if (!d.preciosExtra[p.id]) d.preciosExtra[p.id] = { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false }; });
                if (d.socios) d.socios.forEach(s => { if (s.deleted === undefined) s.deleted = false; if (!s.dni) s.dni = ''; });
                
                return d;
            }
        } catch (e) {
            console.error("Error cargando DB:", e);
        }
        return this.emptyDB();
    },

    // Escritor de Disco
    saveDB: function() {
        if (this.dbFilePath) {
            fs.writeFileSync(this.dbFilePath, JSON.stringify(this.db), 'utf-8');
        } else {
            localStorage.setItem(DB_KEY, JSON.stringify(this.db));
        }
    },

    // Selector de Carpeta
    elegirCarpetaGuardado: async function(onSuccess) {
        const carpeta = await ipcRenderer.invoke('dialog:openDirectory');
        if (carpeta) {
            this.dbFilePath = path.join(carpeta, 'librepos_db.json');
            localStorage.setItem('librepos_db_path', this.dbFilePath);
            this.saveDB();
            if (onSuccess) onSuccess(this.dbFilePath);
        }
    }
};

// Inicializar la DB al cargar el módulo
store.db = store.loadDB();

module.exports = store;