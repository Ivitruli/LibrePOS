# Planificación de Nuevas Características (Marzo 2026)

Este documento detalla los pasos modulares necesarios para implementar las funcionalidades solicitadas: "Sugerir último precio del proveedor en compras" y "Planificar gastos y ejecutar el pago".

*Nota técnica: Todo el código subyacente y la lógica SQL/JS ya fue desarrollada e inyectada exitosamente en la versión actual (puedes revisarlo en `store.js`, `database.js`, `ui_compras.js` y `ui_finanzas.js`). Si tienes problemas corriendo Electron (`npm start`), reinicia tu sistema operativo o asegúrate de tener cerrado todo proceso de `electron.exe` para que se apliquen los cambios.*

---

## 🟢 Etapa 1: Último Precio por Proveedor (Módulo Compras)

**Objetivo:** Agilizar la carga de compras trayendo a pantalla el historial del proveedor.

1. **Creación del DAO (Data Access Object) [✅ COMPLETADO]**: 
   - Se añadió el método `obtenerUltimoCosto(productoId, proveedorId)` en `store.js`.
   - Lógica: `SELECT costo_unit FROM lotes WHERE producto_id = ? AND proveedor_id = ? ORDER BY fecha DESC LIMIT 1`.
2. **Conexión en Interfaz de Usuario [✅ COMPLETADO]**:
   - En `ui_compras.js` se intervino la función `_seleccionarProd(prod)`.
   - Al escanear el código de un producto, si existe un Proveedor seleccionado (`comp-proveedor`), se acciona automáticamente la base de datos rellenando el input de "Costo Unitario" y recalculando la sumatoria.

---

## 🔵 Etapa 2: Gastos Programados y Pagos Diferidos (Módulo Finanzas)

**Objetivo:** Permitir cargar gastos que aún no han sido cobrados (tipo cheque o cuenta corriente de servicios) y pagarlos posteriormente sin desbalancear la caja inmediatamente.

1. **Adaptación Estructural (Backend) [✅ COMPLETADO]**:
   - En `database.js` instalamos un auto-parche (con retrocompatibilidad) que inyectó silenciosamente la columna `estado TEXT DEFAULT 'pagado'` a tu tabla `gastos` actual.
2. **Ingreso y Filtrado de RAM [✅ COMPLETADO]**:
   - Se adaptó `finanzas.js` y `store.js` (`loadDB` y `registrarGasto`) para atrapar y tolerar el estado `pendiente` además de `pagado`.
   - **Crucial:** Reprogramamos los contadores matemáticos de `calcSaldoCuenta` y `calcGananciaNetaGlobal` para que filtren la resta con `g.estado === 'pagado'`. Un gasto "programado" es "invisible" económicamente para tu Caja hasta que se liquida.
3. **Desarrollo Frontend HTML [✅ COMPLETADO]**:
   - En `index.html` > Sección Gastos agregamos el selector `<select id="gasto-estado">` (Pagado Ahora / Programado).
   - Creamos una tabla superior jerárquica con alertas visuales que mostrará únicamente los Gastos Programados / Pendientes.
4. **Liquidación de Pagos [✅ COMPLETADO]**:
   - Creado el método interactivo `liquidarGastoProgramado(idGasto)` en `ui_finanzas.js`.
   - Cuando desees pagar un Gasto Programado, presionas "Liquidar", eliges si sacas la plata de Caja Efectivo o MercadoPago, y un `UPDATE SQL` lo pasa al historial consolidado real y te debita los fondos.
