const Database = require('better-sqlite3');
const path = require('path');

class DBManager {
    constructor() {
        this.db = null;
    }

    // Única instancia de conexión
    conectar(rutaCarpeta = __dirname) {
        if (this.db) return;

        const dbPath = path.join(rutaCarpeta, 'librepos.sqlite');
        this.db = new Database(dbPath);

        // PRAGMAS Obligatorios
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');

        this.inicializarEsquema();
    }

    inicializarEsquema() {
        try {
            const schema = `
                CREATE TABLE IF NOT EXISTS cuentas (
                    id TEXT PRIMARY KEY,
                    nombre TEXT NOT NULL,
                    saldo_inicial REAL DEFAULT 0,
                    deleted INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS productos (
                    id TEXT PRIMARY KEY,
                    codigo TEXT,
                    barcode TEXT,
                    nombre TEXT NOT NULL,
                    marca TEXT,
                    unidad TEXT,
                    stock_minimo REAL DEFAULT 0,
                    deleted INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS lotes (
                    id TEXT PRIMARY KEY,
                    producto_id TEXT NOT NULL,
                    fecha TEXT NOT NULL,
                    vencimiento TEXT,
                    cant_original REAL NOT NULL,
                    cant_disponible REAL NOT NULL,
                    costo_unit REAL NOT NULL,
                    cuenta_id TEXT,
                    proveedor_id TEXT,
                    comprobante TEXT,
                    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
                );

                CREATE TABLE IF NOT EXISTS ventas (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    fecha TEXT NOT NULL,
                    total_venta REAL NOT NULL,
                    total_costo REAL NOT NULL,
                    cuenta_id TEXT NOT NULL,
                    medio_pago TEXT,
                    desc_efectivo REAL DEFAULT 0,
                    desc_redondeo REAL DEFAULT 0,
                    costo_envio REAL DEFAULT 0,
                    envio_pagado INTEGER DEFAULT 0,
                    facturada INTEGER DEFAULT 0,
                    FOREIGN KEY (cuenta_id) REFERENCES cuentas(id) ON DELETE RESTRICT
                );

                CREATE TABLE IF NOT EXISTS detalle_ventas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    venta_id TEXT NOT NULL,
                    producto_id TEXT NOT NULL,
                    nombre TEXT NOT NULL,
                    unidad TEXT,
                    cantidad REAL NOT NULL,
                    precio_venta REAL NOT NULL,
                    costo_total REAL NOT NULL,
                    is_promo INTEGER DEFAULT 0,
                    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
                    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
                );

                CREATE TABLE IF NOT EXISTS movimientos (
                    id TEXT PRIMARY KEY,
                    cuenta_id TEXT NOT NULL,
                    fecha TEXT NOT NULL,
                    tipo TEXT NOT NULL,
                    categoria TEXT,
                    importe REAL NOT NULL,
                    descripcion TEXT,
                    FOREIGN KEY (cuenta_id) REFERENCES cuentas(id) ON DELETE RESTRICT
                );

                CREATE TABLE IF NOT EXISTS proveedores (
                    id TEXT PRIMARY KEY,
                    nombre TEXT NOT NULL,
                    contacto TEXT,
                    tel TEXT,
                    dias_pedido TEXT,
                    dias_entrega TEXT,
                    deleted INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
                    id TEXT PRIMARY KEY,
                    proveedor_id TEXT NOT NULL,
                    fecha TEXT NOT NULL,
                    monto REAL NOT NULL,
                    descripcion TEXT,
                    estado TEXT DEFAULT 'pendiente',
                    FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT
                );

                CREATE TABLE IF NOT EXISTS pagos_deuda (
                    id TEXT PRIMARY KEY,
                    deuda_id TEXT NOT NULL,
                    fecha TEXT NOT NULL,
                    monto REAL NOT NULL,
                    cuenta_id TEXT,
                    tipo TEXT NOT NULL,
                    FOREIGN KEY (deuda_id) REFERENCES cuentas_por_pagar(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS gastos (
                    id TEXT PRIMARY KEY,
                    fecha TEXT NOT NULL,
                    categoria TEXT NOT NULL,
                    tipo TEXT NOT NULL,
                    importe REAL NOT NULL,
                    cuenta_id TEXT NOT NULL,
                    descripcion TEXT,
                    deleted INTEGER DEFAULT 0,
                    FOREIGN KEY (cuenta_id) REFERENCES cuentas(id) ON DELETE RESTRICT
                );

                CREATE TABLE IF NOT EXISTS politicas_precio (
                    producto_id TEXT PRIMARY KEY,
                    fijo REAL DEFAULT 0,
                    imp REAL DEFAULT 0,
                    gan REAL DEFAULT 30,
                    descuento REAL DEFAULT 0,
                    al_costo INTEGER DEFAULT 0,
                    precio_impreso REAL DEFAULT 0,
                    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
                );
                
                CREATE TABLE IF NOT EXISTS clientes (
                    id TEXT PRIMARY KEY,
                    nombre TEXT NOT NULL,
                    telefono TEXT,
                    direccion TEXT,
                    limite_credito REAL DEFAULT 0,
                    deleted INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS proveedores (
                    id TEXT PRIMARY KEY,
                    nombre TEXT NOT NULL,
                    telefono TEXT,
                    email TEXT,
                    direccion TEXT,
                    dias_pedido TEXT, -- Lo guardaremos como JSON (ej: '["Lunes", "Jueves"]')
                    dias_entrega TEXT, -- Lo guardaremos como JSON
                    deleted INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS cuentas_corrientes (
                    id TEXT PRIMARY KEY,
                    cliente_id TEXT NOT NULL,
                    tipo TEXT NOT NULL, -- 'cargo' (deuda por venta) o 'pago' (abono de saldo)
                    monto REAL NOT NULL,
                    descripcion TEXT,
                    fecha TEXT NOT NULL,
                    venta_id TEXT,
                    cuenta_id TEXT, -- ID de la caja/banco donde ingresó la plata si fue un pago
                    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT
                );

                CREATE TABLE IF NOT EXISTS configuracion (
                    clave TEXT PRIMARY KEY,
                    valor TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS promociones (
                    id TEXT PRIMARY KEY,
                    nombre TEXT NOT NULL,
                    items TEXT NOT NULL, -- JSON array of items
                    precio_promo REAL NOT NULL,
                    activa INTEGER DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS socios (
                    id TEXT PRIMARY KEY,
                    nombre TEXT NOT NULL,
                    dni TEXT,
                    deleted INTEGER DEFAULT 0
                );
            `;
            this.db.exec(schema);
            // Sembrado de datos obligatorios (Seed)
            this.db.exec(`
                INSERT OR IGNORE INTO cuentas (id, nombre, saldo_inicial, deleted) 
                VALUES ('c1', 'Caja Efectivo', 0, 0);
                
                INSERT OR IGNORE INTO cuentas (id, nombre, saldo_inicial, deleted) 
                VALUES ('c2', 'Banco / Virtual', 0, 0);

                INSERT OR IGNORE INTO cuentas (id, nombre, saldo_inicial, deleted) 
                VALUES ('cta_cte', 'Cuenta Corriente (Fiados)', 0, 0);
            `);
        } catch (error) {
            console.error("Error SQL al inicializar el esquema:", error.message);
            throw error; // Frena la ejecución si el SQL está mal
        }
    }

    // Envoltorio transaccional ACID universal
    ejecutarTransaccion(operacionFn) {
        if (!this.db) throw new Error("Base de datos no conectada");
        const transaccion = this.db.transaction(operacionFn);
        return transaccion();
    }
}

// Exportamos una única instancia (Singleton)
const dbManager = new DBManager();
module.exports = dbManager;