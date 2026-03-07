const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const dbManager = require('./database.js');

const DB_KEY = 'librepos_data';

const store = {
    dbFilePath: localStorage.getItem('librepos_db_path') || null,
    db: {
        productos: [], lotes: [], ventas: [], ventaItems: [], gastos: [], proveedores: [], socios: [],
        movimientos: [], preciosExtra: {}, clientes: [], cuentasCorrientes: [], cuentas: [],
        ajustesCaja: [], cuentasPorPagar: [], config: {}, promociones: []
    },
    carrito: [],
    selectedProductId: null,
    medioSeleccionado: '',

    loadDB: function () {
        try {
            // --- 1. CARGA DESDE SQLITE ---
            const sqlitePath = localStorage.getItem('librepos_sqlite_path') || __dirname;
            dbManager.conectar(sqlitePath);

            // Creación defensiva de la tabla
            dbManager.db.exec('CREATE TABLE IF NOT EXISTS configuracion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);');

            this.db.productos = dbManager.db.prepare('SELECT * FROM productos').all().map(p => ({
                id: p.id, codigo: p.codigo, barcode: p.barcode, nombre: p.nombre, marca: p.marca,
                unidad: p.unidad, stockMinimo: p.stock_minimo, deleted: p.deleted === 1
            }));

            this.db.lotes = dbManager.db.prepare('SELECT * FROM lotes').all().map(l => ({
                id: l.id, productoId: l.producto_id, fecha: l.fecha, vencimiento: l.vencimiento,
                cantOriginal: l.cant_original, cantDisponible: l.cant_disponible, costoUnit: l.costo_unit,
                cuentaId: l.cuenta_id, proveedorId: l.proveedor_id, comprobante: l.comprobante
            }));

            this.db.cuentas = dbManager.db.prepare("SELECT * FROM cuentas WHERE id != 'cta_cte'").all().map(c => ({
                id: c.id, nombre: c.nombre, saldoInicial: c.saldo_inicial, deleted: c.deleted === 1
            }));
            // Carga de Clientes y Cuentas Corrientes
            this.db.clientes = dbManager.db.prepare('SELECT * FROM clientes').all().map(c => ({
                id: c.id, nombre: c.nombre, telefono: c.telefono, direccion: c.direccion,
                limiteCredito: c.limite_credito, deleted: c.deleted === 1
            }));

            this.db.cuentasCorrientes = dbManager.db.prepare('SELECT * FROM cuentas_corrientes').all().map(cc => ({
                id: cc.id, clienteId: cc.cliente_id, tipo: cc.tipo, monto: cc.monto,
                descripcion: cc.descripcion, fecha: cc.fecha, ventaId: cc.venta_id, cuentaId: cc.cuenta_id
            }));

            // Carga de Proveedores
            this.db.proveedores = dbManager.db.prepare('SELECT * FROM proveedores').all().map(p => ({
                id: p.id,
                nombre: p.nombre,
                telefono: p.telefono,
                email: p.email,
                direccion: p.direccion,
                diasPedido: JSON.parse(p.dias_pedido || '[]'),
                diasEntrega: JSON.parse(p.dias_entrega || '[]'),
                deleted: p.deleted === 1
            }));

            this.db.preciosExtra = {};
            const politicas = dbManager.db.prepare('SELECT * FROM politicas_precio').all();
            for (const pol of politicas) {
                this.db.preciosExtra[pol.producto_id] = {
                    fijo: pol.fijo, imp: pol.imp, gan: pol.gan, desc: pol.descuento,
                    alCosto: pol.al_costo === 1, precioImpreso: pol.precio_impreso
                };
            }

            // Historial de Ventas y Movimientos (Restaurado para Cálculo de Saldos UI)
            this.db.ventas = dbManager.db.prepare('SELECT * FROM ventas').all().map(v => ({
                id: v.id, timestamp: v.timestamp, fecha: v.fecha, totalVenta: v.total_venta,
                totalCosto: v.total_costo, cuentaId: v.cuenta_id, medioPago: v.medio_pago,
                descEfectivo: v.desc_efectivo, descRedondeo: v.desc_redondeo,
                costoEnvio: v.costo_envio, envioPagado: v.envio_pagado === 1,
                facturada: v.facturada === 1, esHistorica: false
            }));

            this.db.ventaItems = dbManager.db.prepare('SELECT * FROM detalle_ventas').all().map(vi => ({
                ventaId: vi.venta_id, productoId: vi.producto_id, nombre: vi.nombre,
                unidad: vi.unidad, cantidad: vi.cantidad, precioVenta: vi.precio_venta,
                costoTotal: vi.costo_total, isPromo: vi.is_promo === 1
            }));

            this.db.movimientos = dbManager.db.prepare('SELECT * FROM movimientos').all().map(m => ({
                id: m.id, cuentaId: m.cuenta_id, fecha: m.fecha, tipo: m.tipo,
                categoria: m.categoria, importe: m.importe, descripcion: m.descripcion,
                socioId: m.socio_id || null
            }));

            // Finanzas y Gastos
            this.db.gastos = dbManager.db.prepare('SELECT * FROM gastos WHERE deleted = 0').all().map(g => ({
                id: g.id, fecha: g.fecha, categoria: g.categoria, tipo: g.tipo,
                importe: g.importe, cuentaId: g.cuenta_id, descripcion: g.descripcion,
                estado: g.estado || 'pagado'
            }));

            this.db.cuentasPorPagar = dbManager.db.prepare('SELECT * FROM cuentas_por_pagar').all().map(d => ({
                id: d.id, proveedorId: d.proveedor_id, fecha: d.fecha, monto: d.monto,
                descripcion: d.descripcion, estado: d.estado, pagos: []
            }));

            const pagos = dbManager.db.prepare('SELECT * FROM pagos_deuda').all();
            for (const p of pagos) {
                const deuda = this.db.cuentasPorPagar.find(d => d.id === p.deuda_id);
                if (deuda) {
                    deuda.pagos.push({ id: p.id, fecha: p.fecha, monto: p.monto, cuentaId: p.cuenta_id, tipo: p.tipo });
                }
            }

            // Creación defensiva de tablas de finanzas extras si no existen
            dbManager.db.exec(`
                CREATE TABLE IF NOT EXISTS ajustes_caja (
                    id TEXT PRIMARY KEY, cuenta_id TEXT NOT NULL, fecha TEXT NOT NULL,
                    diferencia REAL NOT NULL, tipo TEXT NOT NULL, concepto TEXT,
                    FOREIGN KEY (cuenta_id) REFERENCES cuentas(id) ON DELETE RESTRICT
                );
                CREATE TABLE IF NOT EXISTS transferencias (
                    id TEXT PRIMARY KEY, origen_id TEXT NOT NULL, destino_id TEXT NOT NULL,
                    monto REAL NOT NULL, fecha TEXT NOT NULL,
                    FOREIGN KEY (origen_id) REFERENCES cuentas(id) ON DELETE RESTRICT,
                    FOREIGN KEY (destino_id) REFERENCES cuentas(id) ON DELETE RESTRICT
                );
            `);

            this.db.ajustesCaja = dbManager.db.prepare('SELECT * FROM ajustes_caja').all().map(a => ({
                id: a.id, cuentaId: a.cuenta_id, fecha: a.fecha, diferencia: a.diferencia,
                tipo: a.tipo, concepto: a.concepto
            }));

            this.db.transferencias = dbManager.db.prepare('SELECT * FROM transferencias').all().map(t => ({
                id: t.id, origenId: t.origen_id, destinoId: t.destino_id, monto: t.monto, fecha: t.fecha
            }));

            this.db.promociones = dbManager.db.prepare('SELECT * FROM promociones').all().map(p => ({
                id: p.id, nombre: p.nombre, items: JSON.parse(p.items),
                precioPromo: p.precio_promo, activa: p.activa === 1
            }));

            this.db.config = {};
            const configRows = dbManager.db.prepare('SELECT * FROM configuracion').all();
            for (const row of configRows) {
                try { this.db.config[row.clave] = JSON.parse(row.valor); }
                catch (e) { this.db.config[row.clave] = row.valor; }
            }

            this.db.socios = dbManager.db.prepare('SELECT * FROM socios').all().map(s => ({
                id: s.id, nombre: s.nombre, dni: s.dni, deleted: s.deleted === 1
            }));

        } catch (error) {
            console.error("Error al cargar la base de datos híbrida:", error);
        }
    },

    elegirCarpetaGuardado: async function (onSuccess) {
        const carpeta = await ipcRenderer.invoke('dialog:openDirectory');
        if (carpeta) {
            try {
                const oldFolder = dbManager.rutaCarpeta || __dirname;
                if (oldFolder !== carpeta) {
                    dbManager.desconectar();
                    // IMPORTANTE: SQLite tarda unos ms en soltar los archivos físicos en Windows.
                    // Aplicamos un mini-timeout para darle tiempo al OS a liberar el lock.
                    setTimeout(() => {
                        try {
                            const files = ['librepos.sqlite', 'librepos.sqlite-wal', 'librepos.sqlite-shm'];
                            for (const f of files) {
                                const oldF = path.join(oldFolder, f);
                                const newF = path.join(carpeta, f);
                                if (fs.existsSync(oldF) && !fs.existsSync(newF)) {
                                    fs.copyFileSync(oldF, newF);
                                    try { fs.unlinkSync(oldF); } catch (e) { console.warn("Lock activo en:", oldF); }
                                } else if (fs.existsSync(oldF)) {
                                    try { fs.unlinkSync(oldF); } catch (e) { console.warn("Lock activo en:", oldF); }
                                }
                            }
                        } catch (err) { console.error('Error en timeout de guardado:', err); }

                        localStorage.setItem('librepos_sqlite_path', carpeta);
                        if (onSuccess) onSuccess(carpeta);
                    }, 500); // 500ms de gracia
                    return; // Terminamos aquí por el timeout. El flujo sigue adentro.
                }
            } catch (error) { console.error('Error al mover BD:', error); }

            localStorage.setItem('librepos_sqlite_path', carpeta);
            if (onSuccess) onSuccess(carpeta);
        }
    },

    dao: {
        guardarProducto: function (producto) {
            try {
                const existe = dbManager.db.prepare('SELECT id FROM productos WHERE id = ?').get(producto.id);
                if (existe) {
                    const stmt = dbManager.db.prepare(`
                        UPDATE productos SET codigo = @codigo, barcode = @barcode, nombre = @nombre, 
                        marca = @marca, unidad = @unidad, stock_minimo = @stockMinimo, deleted = @deleted WHERE id = @id
                    `);
                    stmt.run({
                        id: producto.id, codigo: producto.codigo, barcode: producto.barcode,
                        nombre: producto.nombre, marca: producto.marca, unidad: producto.unidad,
                        stockMinimo: producto.stockMinimo || 0, deleted: producto.deleted ? 1 : 0
                    });
                } else {
                    const stmt = dbManager.db.prepare(`
                        INSERT INTO productos (id, codigo, barcode, nombre, marca, unidad, stock_minimo, deleted)
                        VALUES (@id, @codigo, @barcode, @nombre, @marca, @unidad, @stockMinimo, @deleted)
                    `);
                    stmt.run({
                        id: producto.id, codigo: producto.codigo, barcode: producto.barcode,
                        nombre: producto.nombre, marca: producto.marca, unidad: producto.unidad,
                        stockMinimo: producto.stockMinimo || 0, deleted: producto.deleted ? 1 : 0
                    });
                }
            } catch (error) { throw new Error("Fallo al guardar el producto."); }
        },

        guardarPoliticaPrecio: function (pid, pol) {
            try {
                const stmt = dbManager.db.prepare(`
                    INSERT OR REPLACE INTO politicas_precio (producto_id, fijo, imp, gan, descuento, al_costo, precio_impreso)
                    VALUES (@productoId, @fijo, @imp, @gan, @desc, @alCosto, @precioImpreso)
                `);
                stmt.run({
                    productoId: pid, fijo: pol.fijo || 0, imp: pol.imp || 0, gan: pol.gan || 30,
                    desc: pol.desc || 0, alCosto: pol.alCosto ? 1 : 0, precioImpreso: pol.precioImpreso || 0
                });
            } catch (e) { console.error("Error SQL guardarPoliticaPrecio:", e); }
        },

        guardarPreciosMasivo: function (arrayPoliticas) {
            try {
                dbManager.ejecutarTransaccion(() => {
                    const stmt = dbManager.db.prepare(`
                        INSERT OR REPLACE INTO politicas_precio (producto_id, fijo, imp, gan, descuento, al_costo, precio_impreso)
                        VALUES (@productoId, @fijo, @imp, @gan, @desc, @alCosto, @precioImpreso)
                    `);
                    for (const pol of arrayPoliticas) {
                        stmt.run(pol);
                    }
                });
            } catch (error) { throw new Error("Fallo al ejecutar transacción masiva."); }
        },

        registrarMuestraTransaccional: function (gasto, lotesConsumidos) {
            try {
                dbManager.ejecutarTransaccion(() => {
                    const updateLote = dbManager.db.prepare('UPDATE lotes SET cant_disponible = cant_disponible - @cantidad WHERE id = @id');
                    for (const consumo of lotesConsumidos) updateLote.run({ cantidad: consumo.cantidad, id: consumo.loteId });

                    const insertGasto = dbManager.db.prepare(`
                        INSERT INTO gastos (id, fecha, categoria, tipo, importe, cuenta_id, descripcion, deleted, estado)
                        VALUES (@id, @fecha, @categoria, @tipo, @importe, @cuentaId, @descripcion, 0, 'pagado')
                    `);
                    insertGasto.run({
                        id: gasto.id, fecha: gasto.fecha, categoria: gasto.categoria, tipo: gasto.tipo,
                        importe: gasto.importe, cuentaId: gasto.cuentaId, descripcion: gasto.descripcion
                    });
                });
            } catch (error) { throw new Error("Fallo crítico en baja de stock."); }
        },

        registrarAuditoriaTransaccional: function (gastos, nuevosLotes, lotesConsumidos) {
            try {
                dbManager.ejecutarTransaccion(() => {
                    // 1. Descontar stock de lotes existentes (Faltantes)
                    const updateLote = dbManager.db.prepare('UPDATE lotes SET cant_disponible = cant_disponible - @cantidad WHERE id = @id');
                    for (const consumo of lotesConsumidos) updateLote.run({ cantidad: consumo.cantidad, id: consumo.loteId });

                    // 2. Registrar los Gastos referemtes a las pérdidas
                    const insertGasto = dbManager.db.prepare(`
                        INSERT INTO gastos (id, fecha, categoria, tipo, importe, cuenta_id, descripcion, deleted, estado)
                        VALUES (@id, @fecha, @categoria, @tipo, @importe, @cuentaId, @descripcion, 0, 'pagado')
                    `);
                    for (const gasto of gastos) {
                        insertGasto.run({
                            id: gasto.id, fecha: gasto.fecha, categoria: gasto.categoria, tipo: gasto.tipo,
                            importe: gasto.importe, cuentaId: gasto.cuentaId, descripcion: gasto.descripcion
                        });
                    }

                    // 3. Registrar los nuevos Lotes (Sobrantes)
                    const insertLote = dbManager.db.prepare(`
                        INSERT INTO lotes (id, producto_id, fecha, vencimiento, cant_original, cant_disponible, costo_unit, proveedor_id, comprobante)
                        VALUES (@id, @productoId, @fecha, @vencimiento, @cantOriginal, @cantDisponible, @costoUnit, @proveedorId, @comprobante)
                    `);
                    for (const lote of nuevosLotes) {
                        insertLote.run({
                            id: lote.id, productoId: lote.productoId, fecha: lote.fecha,
                            vencimiento: lote.vencimiento, cantOriginal: lote.cantOriginal,
                            cantDisponible: lote.cantDisponible, costoUnit: lote.costoUnit,
                            proveedorId: lote.proveedorId || null, comprobante: lote.comprobante
                        });
                    }
                });
            } catch (error) { throw new Error("Fallo guardando transacción de auditoría."); }
        },


        registrarVentaTransaccional: function (venta, items, lotesConsumidos) {
            try {
                dbManager.ejecutarTransaccion(() => {
                    const insertVenta = dbManager.db.prepare(`
                        INSERT INTO ventas (id, timestamp, fecha, total_venta, total_costo, cuenta_id, medio_pago, desc_efectivo, desc_redondeo, costo_envio, envio_pagado, facturada)
                        VALUES (@id, @timestamp, @fecha, @totalVenta, @totalCosto, @cuentaId, @medioPago, @descEfectivo, @descRedondeo, @costoEnvio, @envioPagado, @facturada)
                    `);
                    insertVenta.run({
                        id: venta.id, timestamp: venta.timestamp, fecha: venta.fecha,
                        totalVenta: venta.totalVenta, totalCosto: venta.totalCosto,
                        cuentaId: venta.cuentaId, medioPago: venta.medioPago,
                        descEfectivo: venta.descEfectivo, descRedondeo: venta.descRedondeo,
                        costoEnvio: venta.costoEnvio, envioPagado: venta.envioPagado ? 1 : 0, facturada: 0
                    });

                    const insertItem = dbManager.db.prepare(`
                        INSERT INTO detalle_ventas (venta_id, producto_id, nombre, unidad, cantidad, precio_venta, costo_total, is_promo)
                        VALUES (@ventaId, @productoId, @nombre, @unidad, @cantidad, @precioVenta, @costoTotal, @isPromo)
                    `);
                    for (const item of items) {
                        insertItem.run({
                            ventaId: venta.id, productoId: item.productoId, nombre: item.nombre,
                            unidad: item.unidad, cantidad: item.cantidad, precioVenta: item.precioVenta,
                            costoTotal: item.costoTotal, isPromo: item.isPromo
                        });
                    }

                    const updateLote = dbManager.db.prepare('UPDATE lotes SET cant_disponible = cant_disponible - @cantidad WHERE id = @id');
                    for (const lote of lotesConsumidos) updateLote.run({ cantidad: lote.cantidad, id: lote.loteId });

                    if (venta.cuentaId !== 'cta_cte') {
                        const insertMov = dbManager.db.prepare(`
                            INSERT INTO movimientos (id, cuenta_id, fecha, tipo, categoria, importe, descripcion)
                            VALUES (@id, @cuentaId, @fecha, @tipo, @categoria, @importe, @descripcion)
                        `);
                        insertMov.run({
                            id: 'mov_' + venta.id, cuentaId: venta.cuentaId, fecha: venta.fecha,
                            tipo: 'ingreso', categoria: 'Venta POS', importe: venta.totalVenta,
                            descripcion: 'Ticket: ' + venta.id.substring(0, 8)
                        });
                    }
                });
            } catch (error) { throw new Error("Fallo crítico al registrar la venta: " + error.message); }
        },
        registrarCompraTransaccional: function (lotesAInsertar, datosFinancieros) {
            try {
                let nuevaDeuda = null;

                // 1. Crear temporalmente el objeto deuda para memoria RAM
                if (datosFinancieros.estadoPago === 'deuda') {
                    nuevaDeuda = {
                        id: 'cxp_' + Date.now().toString(),
                        proveedorId: datosFinancieros.proveedorId,
                        fecha: datosFinancieros.fecha,
                        monto: datosFinancieros.costoTotal,
                        descripcion: 'Remito: ' + (datosFinancieros.comprobante || 'S/N'),
                        estado: 'pendiente'
                    };
                }

                // 2. Disparar la transacción ACID en SQLite para Lotes, Pagos y Deudas
                dbManager.ejecutarTransaccion(() => {
                    if (nuevaDeuda) {
                        const insertDeuda = dbManager.db.prepare(`
                            INSERT INTO cuentas_por_pagar (id, proveedor_id, fecha, monto, descripcion, estado)
                            VALUES (@id, @proveedorId, @fecha, @monto, @descripcion, @estado)
                        `);
                        insertDeuda.run({
                            id: nuevaDeuda.id, proveedorId: nuevaDeuda.proveedorId, fecha: nuevaDeuda.fecha,
                            monto: nuevaDeuda.monto, descripcion: nuevaDeuda.descripcion, estado: nuevaDeuda.estado
                        });
                    }

                    const insertLote = dbManager.db.prepare(`
                        INSERT INTO lotes (id, producto_id, fecha, vencimiento, cant_original, cant_disponible, costo_unit, cuenta_id, proveedor_id, comprobante)
                        VALUES (@id, @productoId, @fecha, @vencimiento, @cantOriginal, @cantDisponible, @costoUnit, @cuentaId, @proveedorId, @comprobante)
                    `);

                    for (const lote of lotesAInsertar) {
                        insertLote.run({
                            id: lote.id, productoId: lote.productoId, fecha: lote.fecha,
                            vencimiento: lote.vencimiento, cantOriginal: lote.cantOriginal,
                            cantDisponible: lote.cantDisponible, costoUnit: lote.costoUnit,
                            cuentaId: lote.cuentaId, proveedorId: lote.proveedorId, comprobante: lote.comprobante
                        });
                    }

                    if (datosFinancieros.estadoPago === 'pagado') {
                        const gastoId = 'g_' + Date.now().toString();

                        const insertGasto = dbManager.db.prepare(`
                            INSERT INTO gastos (id, fecha, categoria, tipo, importe, cuenta_id, descripcion, deleted)
                            VALUES (@id, @fecha, @categoria, @tipo, @importe, @cuentaId, @descripcion, 0)
                        `);
                        insertGasto.run({
                            id: gastoId, fecha: datosFinancieros.fecha, categoria: 'Compra de Mercadería',
                            tipo: 'variable', importe: datosFinancieros.costoTotal, cuentaId: datosFinancieros.cuentaId,
                            descripcion: 'Remito: ' + (datosFinancieros.comprobante || 'S/N')
                        });

                        const insertMov = dbManager.db.prepare(`
                            INSERT INTO movimientos (id, cuenta_id, fecha, tipo, categoria, importe, descripcion)
                            VALUES (@id, @cuentaId, @fecha, @tipo, @categoria, @importe, @descripcion)
                        `);
                        insertMov.run({
                            id: 'mov_' + gastoId, cuentaId: datosFinancieros.cuentaId, fecha: datosFinancieros.fecha,
                            tipo: 'egreso', categoria: 'Compra de Mercadería', importe: datosFinancieros.costoTotal,
                            descripcion: 'Pago Remito: ' + (datosFinancieros.comprobante || 'S/N')
                        });
                    }
                });

            } catch (error) {
                console.error("Error SQL registrarCompra:", error);
                throw new Error("Fallo en la transacción de compra.");
            }
        },
        guardarConfiguracion: function (clave, valor) {
            try {
                // Defensa contra cierres repentinos de DB (ej. cambio de carpetas incompleto)
                if (!dbManager.db) {
                    const sqlitePath = localStorage.getItem('librepos_sqlite_path') || __dirname;
                    dbManager.conectar(sqlitePath);
                }

                // Creación defensiva por si la base se borra
                dbManager.db.exec('CREATE TABLE IF NOT EXISTS configuracion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);');

                // Formato robusto a prueba de fallos
                const stmt = dbManager.db.prepare(`
                    INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (@clave, @valor)
                `);
                stmt.run({ clave: clave, valor: String(valor) });
            } catch (error) {
                console.error("Error SQL Config:", error);
                throw new Error("Fallo al guardar ajustes.");
            }
        },
        // --- DAO CLIENTES Y CUENTAS CORRIENTES ---
        guardarCliente: function (cliente) {
            try {
                const existe = dbManager.db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente.id);
                if (existe) {
                    const stmt = dbManager.db.prepare(`
                        UPDATE clientes SET nombre = @nombre, telefono = @telefono, direccion = @direccion, limite_credito = @limiteCredito, deleted = @deleted WHERE id = @id
                    `);
                    stmt.run({
                        id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono,
                        direccion: cliente.direccion, limiteCredito: cliente.limiteCredito || 0,
                        deleted: cliente.deleted ? 1 : 0
                    });
                } else {
                    const stmt = dbManager.db.prepare(`
                        INSERT INTO clientes (id, nombre, telefono, direccion, limite_credito, deleted)
                        VALUES (@id, @nombre, @telefono, @direccion, @limiteCredito, @deleted)
                    `);
                    stmt.run({
                        id: cliente.id, nombre: cliente.nombre, telefono: cliente.telefono,
                        direccion: cliente.direccion, limiteCredito: cliente.limiteCredito || 0,
                        deleted: cliente.deleted ? 1 : 0
                    });
                }
            } catch (error) {
                console.error("Error SQL guardarCliente:", error);
                throw new Error("Fallo al guardar el cliente en la base de datos.");
            }
        },

        registrarMovimientoCtaCte: function (mov) {
            try {
                const stmt = dbManager.db.prepare(`
                    INSERT INTO cuentas_corrientes (id, cliente_id, tipo, monto, descripcion, fecha, venta_id, cuenta_id)
                    VALUES (@id, @clienteId, @tipo, @monto, @descripcion, @fecha, @ventaId, @cuentaId)
                `);
                stmt.run({
                    id: mov.id, clienteId: mov.clienteId, tipo: mov.tipo, monto: mov.monto,
                    descripcion: mov.descripcion, fecha: mov.fecha,
                    ventaId: mov.ventaId || null, cuentaId: mov.cuentaId || null
                });
            } catch (error) {
                console.error("Error SQL registrarMovimientoCtaCte:", error);
                throw new Error("Fallo al registrar el movimiento en la cuenta corriente.");
            }
        },
        // --- DAO PROVEEDORES ---
        guardarProveedor: function (proveedor) {
            try {
                // SQLite Scheme validation: Verificamos qué columnas existen realmente porque había 2 scripts CREATE TABLE en conflicto:
                const columnasInfo = dbManager.db.pragma('table_info(proveedores)');
                const hasContacto = columnasInfo.some(c => c.name === 'contacto');
                const hasEmail = columnasInfo.some(c => c.name === 'email');
                const hasDireccion = columnasInfo.some(c => c.name === 'direccion');
                const hasTelefono = columnasInfo.some(c => c.name === 'telefono');
                const hasTelCorto = columnasInfo.some(c => c.name === 'tel');

                const existe = dbManager.db.prepare('SELECT id FROM proveedores WHERE id = ?').get(proveedor.id);

                // Construcción dinámica del Query para evitar crasheos por Schema viejo
                let campos = ['nombre', 'deleted'];
                let valores = ['@nombre', '@deleted'];
                let asignaciones = ['nombre = @nombre', 'deleted = @deleted'];

                let bindParams = {
                    id: proveedor.id,
                    nombre: proveedor.nombre,
                    deleted: proveedor.deleted ? 1 : 0
                };

                if (hasContacto) { campos.push('contacto'); valores.push('@contacto'); asignaciones.push('contacto = @contacto'); bindParams.contacto = proveedor.contacto || ''; }
                if (hasEmail) { campos.push('email'); valores.push('@email'); asignaciones.push('email = @email'); bindParams.email = proveedor.email || ''; }
                if (hasDireccion) { campos.push('direccion'); valores.push('@direccion'); asignaciones.push('direccion = @direccion'); bindParams.direccion = proveedor.direccion || ''; }
                if (hasTelefono) { campos.push('telefono'); valores.push('@telefono'); asignaciones.push('telefono = @telefono'); bindParams.telefono = proveedor.telefono || ''; }
                if (hasTelCorto) { campos.push('tel'); valores.push('@tel'); asignaciones.push('tel = @tel'); bindParams.tel = proveedor.telefono || ''; }

                // Estos siempre son esperados
                campos.push('dias_pedido', 'dias_entrega');
                valores.push('@diasPedido', '@diasEntrega');
                asignaciones.push('dias_pedido = @diasPedido', 'dias_entrega = @diasEntrega');
                bindParams.diasPedido = JSON.stringify(proveedor.diasPedido || []);
                bindParams.diasEntrega = JSON.stringify(proveedor.diasEntrega || []);

                if (existe) {
                    const stmt = dbManager.db.prepare(`UPDATE proveedores SET ${asignaciones.join(', ')} WHERE id = @id`);
                    stmt.run(bindParams);
                } else {
                    const stmt = dbManager.db.prepare(`INSERT INTO proveedores (id, ${campos.join(', ')}) VALUES (@id, ${valores.join(', ')})`);
                    stmt.run(bindParams);
                }
            } catch (error) {
                console.error("Error SQL guardarProveedor:", error);
                throw new Error("Fallo al guardar el proveedor en la base de datos.");
            }
        },
        guardarCuentaPorPagar: function (deuda) {
            try {
                const stmt = dbManager.db.prepare(`
                    INSERT OR REPLACE INTO cuentas_por_pagar (id, proveedor_id, fecha, monto, descripcion, estado)
                    VALUES (@id, @proveedorId, @fecha, @monto, @descripcion, @estado)
                `);
                stmt.run({
                    id: deuda.id, proveedorId: deuda.proveedorId, fecha: deuda.fecha,
                    monto: deuda.monto, descripcion: deuda.descripcion,
                    estado: deuda.estado || (deuda.pagado ? 'pagado' : 'pendiente')
                });
            } catch (error) {
                console.error("Error SQL guardarCuentaPorPagar:", error);
                throw new Error("Fallo al guardar cuenta por pagar en la base de datos.");
            }
        },
        guardarPagoDeuda: function (pagoDeuda) {
            try {
                const stmt = dbManager.db.prepare(`
                    INSERT INTO pagos_deuda (id, deuda_id, fecha, monto, cuenta_id, tipo)
                    VALUES (@id, @deudaId, @fecha, @monto, @cuentaId, @tipo)
                `);
                stmt.run({
                    id: pagoDeuda.id, deudaId: pagoDeuda.deudaId, fecha: pagoDeuda.fecha,
                    monto: pagoDeuda.monto, cuentaId: pagoDeuda.cuentaId, tipo: pagoDeuda.tipo
                });
            } catch (error) {
                console.error("Error SQL guardarPagoDeuda:", error);
                throw new Error("Fallo al registrar el pago de deuda en la base de datos.");
            }
        },
        // --- DAO COMPRAS ---
        obtenerUltimoCosto: function (productoId, proveedorId) {
            try {
                if (!dbManager.db) return null;
                const stmt = dbManager.db.prepare(`
                    SELECT costo_unit FROM lotes 
                    WHERE producto_id = ? AND proveedor_id = ? 
                    ORDER BY fecha DESC LIMIT 1
                `);
                const result = stmt.get(productoId, proveedorId);
                return result ? result.costo_unit : null;
            } catch (error) {
                console.error("Error SQL obtenerUltimoCosto:", error);
                return null;
            }
        },
        // --- DAO FINANZAS ---
        guardarCuenta: function (cuenta) {
            try {
                const existe = dbManager.db.prepare('SELECT id FROM cuentas WHERE id = ?').get(cuenta.id);
                if (existe) {
                    const stmt = dbManager.db.prepare(`
                        UPDATE cuentas SET nombre = @nombre, saldo_inicial = @saldoInicial, deleted = @deleted WHERE id = @id
                    `);
                    stmt.run({
                        id: cuenta.id, nombre: cuenta.nombre, saldoInicial: cuenta.saldoInicial, deleted: cuenta.deleted ? 1 : 0
                    });
                } else {
                    const stmt = dbManager.db.prepare(`
                        INSERT INTO cuentas (id, nombre, saldo_inicial, deleted)
                        VALUES (@id, @nombre, @saldoInicial, @deleted)
                    `);
                    stmt.run({
                        id: cuenta.id, nombre: cuenta.nombre, saldoInicial: cuenta.saldoInicial, deleted: cuenta.deleted ? 1 : 0
                    });
                }
            } catch (error) {
                console.error("SQL_ERROR_CUENTA:", error);
                throw new Error("Fallo al guardar cuenta: " + error.message);
            }
        },
        guardarGasto: function (gasto) {
            try {
                // Retrocompatibilidad defensiva: Si no viene estado, se asume 'pagado'
                const estado = gasto.estado || 'pagado';
                const stmt = dbManager.db.prepare(`
                    INSERT INTO gastos (id, fecha, categoria, tipo, importe, cuenta_id, descripcion, deleted, estado)
                    VALUES (@id, @fecha, @categoria, @tipo, @importe, @cuentaId, @descripcion, 0, @estado)
                `);
                stmt.run({
                    id: gasto.id, fecha: gasto.fecha, categoria: gasto.categoria,
                    tipo: gasto.tipo, importe: gasto.importe, cuentaId: gasto.cuentaId,
                    descripcion: gasto.descripcion, estado: estado
                });
            } catch (error) { throw new Error("Fallo al guardar gasto en BD."); }
        },
        eliminarGastos: function (idsArray) {
            try {
                dbManager.ejecutarTransaccion(() => {
                    const stmt = dbManager.db.prepare("UPDATE gastos SET deleted = 1 WHERE id = ?");
                    for (const id of idsArray) {
                        stmt.run(id);
                    }
                });
            } catch (error) { throw new Error("Fallo al eliminar gastos de la Base de Datos."); }
        },
        liquidarGastoProgramado: function (gastoId, cuentaId) {
            try {
                const stmt = dbManager.db.prepare(`
                    UPDATE gastos SET estado = 'pagado', cuenta_id = @cuentaId WHERE id = @id
                `);
                stmt.run({ id: gastoId, cuentaId: cuentaId });
            } catch (error) { throw new Error("Fallo al liquidar gasto programado en BD."); }
        },
        guardarAjusteCaja: function (ajuste) {
            try {
                const stmt = dbManager.db.prepare(`
                    INSERT INTO ajustes_caja (id, cuenta_id, fecha, diferencia, tipo, concepto)
                    VALUES (@id, @cuentaId, @fecha, @diferencia, @tipo, @concepto)
                `);
                stmt.run({
                    id: ajuste.id, cuentaId: ajuste.cuentaId, fecha: ajuste.fecha,
                    diferencia: ajuste.diferencia, tipo: ajuste.tipo, concepto: ajuste.concepto
                });
            } catch (error) { throw new Error("Fallo al registrar ajuste en BD."); }
        },
        registrarRetiroSocioTransaccional: function (mov, lotesConsumidos) {
            try {
                dbManager.ejecutarTransaccion(() => {
                    const insertMov = dbManager.db.prepare(`
                        INSERT INTO movimientos (id, socio_id, cuenta_id, fecha, tipo, importe, descripcion)
                        VALUES (@id, @socioId, @cuentaId, @fecha, @tipo, @importe, @descripcion)
                    `);
                    insertMov.run({
                        id: mov.id, socioId: mov.socioId, cuentaId: mov.cuentaId || '', fecha: mov.fecha,
                        tipo: mov.tipo, importe: mov.importe, descripcion: mov.descripcion
                    });

                    const updateLote = dbManager.db.prepare('UPDATE lotes SET cant_disponible = cant_disponible - @cantidad WHERE id = @id');
                    for (const lote of lotesConsumidos) {
                        updateLote.run({ cantidad: lote.cantidad, id: lote.loteId });
                    }
                });
            } catch (error) { throw new Error("Fallo crítico en retiro de socio: " + error.message); }
        },
        guardarTransferencia: function (transferencia) {
            try {
                const stmt = dbManager.db.prepare(`
                    INSERT INTO transferencias (id, origen_id, destino_id, monto, fecha)
                    VALUES (@id, @origenId, @destinoId, @monto, @fecha)
                `);
                stmt.run({
                    id: transferencia.id, origenId: transferencia.origenId, destinoId: transferencia.destinoId,
                    monto: transferencia.monto, fecha: transferencia.fecha
                });
            } catch (error) { throw new Error("Fallo al registrar transferencia en BD."); }
        },
        // --- DAO PROMOCIONES ---
        guardarPromocion: function (promo) {
            try {
                const existe = dbManager.db.prepare('SELECT id FROM promociones WHERE id = ?').get(promo.id);
                if (existe) {
                    const stmt = dbManager.db.prepare(`
                        UPDATE promociones SET nombre = @nombre, items = @items, precio_promo = @precioPromo, activa = @activa WHERE id = @id
                    `);
                    stmt.run({
                        id: promo.id, nombre: promo.nombre, items: JSON.stringify(promo.items),
                        precioPromo: promo.precioPromo, activa: promo.activa ? 1 : 0
                    });
                } else {
                    const stmt = dbManager.db.prepare(`
                        INSERT INTO promociones (id, nombre, items, precio_promo, activa)
                        VALUES (@id, @nombre, @items, @precioPromo, @activa)
                    `);
                    stmt.run({
                        id: promo.id, nombre: promo.nombre, items: JSON.stringify(promo.items),
                        precioPromo: promo.precioPromo, activa: promo.activa ? 1 : 0
                    });
                }
            } catch (error) { throw new Error("Fallo al guardar promoción en BD."); }
        },
        eliminarPromocion: function (id) {
            try {
                const stmt = dbManager.db.prepare('DELETE FROM promociones WHERE id = ?');
                stmt.run(id);
            } catch (error) { throw new Error("Fallo al eliminar promoción en BD."); }
        },
        // --- DAO SOCIOS Y MOVIMIENTOS ---
        guardarSocio: function (socio) {
            try {
                const existe = dbManager.db.prepare('SELECT id FROM socios WHERE id = ?').get(socio.id);
                if (existe) {
                    const stmt = dbManager.db.prepare(`
                        UPDATE socios SET nombre = @nombre, dni = @dni, deleted = @deleted WHERE id = @id
                    `);
                    stmt.run({
                        id: socio.id, nombre: socio.nombre, dni: socio.dni || '', deleted: socio.deleted ? 1 : 0
                    });
                } else {
                    const stmt = dbManager.db.prepare(`
                        INSERT INTO socios (id, nombre, dni, deleted)
                        VALUES (@id, @nombre, @dni, @deleted)
                    `);
                    stmt.run({
                        id: socio.id, nombre: socio.nombre, dni: socio.dni || '', deleted: socio.deleted ? 1 : 0
                    });
                }
            } catch (error) { throw new Error("Fallo al guardar socio en BD"); }
        },
        guardarMovimiento: function (mov) {
            try {
                const stmt = dbManager.db.prepare(`
                    INSERT INTO movimientos (id, cuenta_id, fecha, tipo, categoria, importe, descripcion)
                    VALUES (@id, @cuentaId, @fecha, @tipo, @categoria, @importe, @descripcion)
                `);
                // Adaptamos la columna cuenta_id e inyectamos el ID de socio en el concepto para evitar cambiar la BD a esta altura
                stmt.run({
                    id: mov.id,
                    cuentaId: mov.cuentaId || 'movSocio',
                    fecha: mov.fecha,
                    tipo: mov.tipo,
                    categoria: 'Socio:' + (mov.socioId || ''),
                    importe: mov.importe,
                    descripcion: mov.descripcion
                });
            } catch (error) { throw new Error("Fallo al registrar movimiento en BD."); }
        },

        // --- DAO MINERÍA DE DATOS (MARKET BASKET ANALYSIS) ---
        /**
         * Analiza SQLite buscando combinaciones de 2 a 4 productos frecuentemente vendidos en el mismo ticket
         * Ignora tickets que ya contienen promos o ventas unitarias.
         */
        obtenerSugerenciasMarketBasket: function (limite = 10) {
            try {
                // Paso 1: Venta ID = Tickets con más de 1 item, ignorando Combos ya armados
                const queryVentas = `
                    SELECT venta_id 
                    FROM detalle_ventas 
                    WHERE venta_id NOT IN (
                        SELECT venta_id FROM detalle_ventas WHERE is_promo = 1
                    )
                    GROUP BY venta_id 
                    HAVING COUNT(DISTINCT producto_id) >= 2
                `;

                const ventasValidas = dbManager.db.prepare(queryVentas).all().map(v => v.venta_id);
                if (ventasValidas.length === 0) return [];

                // Traemos los detalles para apilarlos
                const placeHolders = ventasValidas.map(() => '?').join(',');
                const detalles = dbManager.db.prepare(`
                    SELECT venta_id, producto_id, nombre 
                    FROM detalle_ventas 
                    WHERE venta_id IN (${placeHolders})
                    ORDER BY venta_id, producto_id
                `).all(...ventasValidas);

                const ticketsParams = {};
                detalles.forEach(d => {
                    if (!ticketsParams[d.venta_id]) ticketsParams[d.venta_id] = [];
                    if (!ticketsParams[d.venta_id].find(p => p.id === d.producto_id)) {
                        ticketsParams[d.venta_id].push({ id: d.producto_id, nombre: d.nombre });
                    }
                });

                const combinacionesFrecuencias = {};

                const obtenerCombinaciones = (arr, k) => {
                    let result = [];
                    if (k === 1) return arr.map(e => [e]);
                    arr.forEach((e, i) => {
                        let smallerCombinations = obtenerCombinaciones(arr.slice(i + 1), k - 1);
                        smallerCombinations.forEach(sc => result.push([e].concat(sc)));
                    });
                    return result;
                };

                Object.values(ticketsParams).forEach(ticket => {
                    ticket.sort((a, b) => a.id.localeCompare(b.id));

                    for (let n = 2; n <= Math.min(4, ticket.length); n++) {
                        const combos = obtenerCombinaciones(ticket, n);
                        combos.forEach(c => {
                            const hash = c.map(p => p.id).join('||');
                            if (!combinacionesFrecuencias[hash]) combinacionesFrecuencias[hash] = { items: c, frecuencia: 0 };
                            combinacionesFrecuencias[hash].frecuencia++;
                        });
                    }
                });

                const topAsociaciones = Object.values(combinacionesFrecuencias)
                    .filter(c => c.frecuencia > 1)
                    .sort((a, b) => b.frecuencia - a.frecuencia)
                    .slice(0, limite);

                return topAsociaciones;

            } catch (error) {
                console.error("Error SQL MarketBasket:", error);
                return [];
            }
        }
    }
};

store.now = function () {
    const local = new Date().toLocaleString('sv-SE');
    return local.replace(' ', 'T');
};

store.db = store.loadDB() || store.db;

module.exports = store;