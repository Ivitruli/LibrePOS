const store = require('./store.js');
const inventario = require('./inventario.js');

const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n, u) => u === 'kg' ? Number(n).toFixed(3) + ' kg' : u === '100g' ? Number(n).toFixed(1) + '×100g' : Number(n).toFixed(0) + ' u.';
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

function etiq(nombreCuenta, tipo, isDebe) {
    let marca = '';
    if (tipo === 'A') marca = isDebe ? '(+A)' : '(-A)'; 
    else if (tipo === 'P') marca = isDebe ? '(-P)' : '(+P)'; 
    else if (tipo === 'PN') marca = isDebe ? '(-PN)' : '(+PN)'; 
    else if (tipo === 'R+') marca = isDebe ? '(-R+)' : '(+R+)'; 
    else if (tipo === 'R-') marca = isDebe ? '(+R-)' : '(-R-)'; 
    else if (tipo === 'P/A') marca = isDebe ? '(-P/+A)' : '(+P/-A)'; 
    return `${marca} ${nombreCuenta}`;
}

const reportes = {
    getDatosInformeVentas: function(desde, hasta) {
        const vts = store.db.ventas.filter(v => v.fecha >= desde && v.fecha <= hasta);
        const vIng = vts.reduce((s, v) => s + v.totalVenta, 0); 
        const vCosto = vts.reduce((s, v) => s + v.totalCosto, 0);
        return { vts, vIng, vCosto };
    },

    generarAsientosDiario: function(desde, hasta) {
        let asientos = [];
        
        const ventasPorDia = {};
        store.db.ventas.filter(v => v.fecha >= desde && v.fecha <= hasta).forEach(v => {
            if (!ventasPorDia[v.fecha]) ventasPorDia[v.fecha] = { cuentas: {}, totalVenta: 0, totalCosto: 0 };
            if (!ventasPorDia[v.fecha].cuentas[v.cuentaId]) ventasPorDia[v.fecha].cuentas[v.cuentaId] = 0;
            ventasPorDia[v.fecha].cuentas[v.cuentaId] += v.totalVenta;
            ventasPorDia[v.fecha].totalVenta += v.totalVenta;
            ventasPorDia[v.fecha].totalCosto += v.totalCosto;
        });
        Object.keys(ventasPorDia).forEach(fecha => {
            const vd = ventasPorDia[fecha]; let ls = [];
            Object.keys(vd.cuentas).forEach(cId => { let cName = store.db.cuentas.find(x => x.id === cId)?.nombre || 'Caja'; ls.push({ c: etiq(cName, 'A', true), d: vd.cuentas[cId], h: 0 }); });
            if (vd.totalCosto > 0) ls.push({ c: etiq('Costo Mercaderías (CMV)', 'R-', true), d: vd.totalCosto, h: 0 });
            ls.push({ c: etiq('Ventas', 'R+', false), d: 0, h: vd.totalVenta });
            if (vd.totalCosto > 0) ls.push({ c: etiq('Mercadería', 'A', false), d: 0, h: vd.totalCosto });
            asientos.push({ f: fecha + 'T23:59', r: 'Ventas Agrupadas del Día', ls: ls });
        });

        store.db.lotes.filter(l => l.fecha >= desde && l.fecha <= hasta).forEach(l => {
            let p = store.db.productos.find(x => x.id === l.productoId); 
            let m = l.cantOriginal * l.costoUnit; 
            let ls = [{ c: etiq('Mercadería', 'A', true), d: m, h: 0 }];
            if (l.cuentaId) { let cName = store.db.cuentas.find(c => c.id === l.cuentaId)?.nombre || 'Caja'; ls.push({ c: etiq(cName, 'A', false), d: 0, h: m }); } 
            else { ls.push({ c: etiq('Proveedores (Comercial)', 'P', false), d: 0, h: m }); }
            asientos.push({ f: l.fecha + 'T00:01', r: 'Compra: ' + (p ? p.nombre : 'Genérica'), ls: ls });
        });

        store.db.cuentasPorPagar.forEach(deuda => {
            (deuda.pagos || []).filter(p => p.fecha >= desde && p.fecha <= hasta).forEach(p => { 
                let rDesc = p.tipo === 'descuento' ? 'Descuento Obtenido (Proveedor)' : 'Pago a Proveedor';
                let cName = store.db.cuentas.find(x => x.id === p.cuentaId)?.nombre || (p.tipo === 'descuento' ? 'Resultado Positivo' : 'Caja'); 
                let cTipo = p.tipo === 'descuento' ? 'R+' : 'A';
                let ls = [{ c: etiq('Proveedores (Comercial)', 'P', true), d: p.monto, h: 0 }, { c: etiq(cName, cTipo, false), d: 0, h: p.monto }];
                asientos.push({ f: p.fecha + 'T00:02', r: rDesc, ls: ls }); 
            });
        });

        store.db.gastos.filter(g => g.fecha >= desde && g.fecha <= hasta).forEach(g => { 
            let cName = store.db.cuentas.find(x => x.id === g.cuentaId)?.nombre || 'Caja'; 
            asientos.push({ f: g.fecha + 'T00:03', r: 'Registro de Gasto', ls: [{ c: etiq('Gastos - ' + g.categoria, 'R-', true), d: g.importe, h: 0 }, { c: etiq(cName, 'A', false), d: 0, h: g.importe }] }); 
        });

        store.db.movimientos.filter(m => m.fecha >= desde && m.fecha <= hasta).forEach(m => {
            let s = store.db.socios.find(x => x.id === m.socioId)?.nombre || 'Socio Desconocido'; let cName = store.db.cuentas.find(x => x.id === m.cuentaId)?.nombre || 'Caja';
            if (m.tipo === 'retiro') asientos.push({ f: m.fecha + 'T00:04', r: 'Retiro / Préstamo Socio', ls: [{ c: etiq('Cuenta Particular: ' + s, 'P/A', true), d: m.importe, h: 0 }, { c: etiq(cName, 'A', false), d: 0, h: m.importe }] });
            if (m.tipo === 'deposito') asientos.push({ f: m.fecha + 'T00:04', r: 'Aporte / Devolución Préstamo', ls: [{ c: etiq(cName, 'A', true), d: m.importe, h: 0 }, { c: etiq('Cuenta Particular: ' + s, 'P/A', false), d: 0, h: m.importe }] });
            if (m.tipo === 'asignacion') asientos.push({ f: m.fecha + 'T00:04', r: 'Asignación Utilidades', ls: [{ c: etiq('Resultados Acumulados', 'PN', true), d: m.importe, h: 0 }, { c: etiq('Cuenta Particular: ' + s, 'P/A', false), d: 0, h: m.importe }] });
            if (m.tipo === 'reinversion') asientos.push({ f: m.fecha + 'T00:04', r: 'Reinversión Utilidades', ls: [{ c: etiq('Resultados Acumulados', 'PN', true), d: m.importe, h: 0 }, { c: etiq('Capital Social Re-invertido', 'PN', false), d: 0, h: m.importe }] });
        });

        store.db.ajustesCaja.filter(a => a.fecha >= desde && a.fecha <= hasta).forEach(a => {
            let rDesc = a.concepto || (a.tipo === 'ingreso' ? 'Sobrante Caja' : 'Faltante Caja');
            let cName = store.db.cuentas.find(x => x.id === a.cuentaId)?.nombre || (a.cuentaId === 'virtual_desc' ? 'Ajuste Contable' : 'Caja');
            if (a.tipo === 'ingreso') asientos.push({ f: a.fecha + 'T00:05', r: rDesc, ls: [{ c: etiq(cName, 'A', true), d: a.diferencia, h: 0 }, { c: etiq('Ajuste / Resultado Positivo', 'R+', false), d: 0, h: a.diferencia }] });
            else asientos.push({ f: a.fecha + 'T00:05', r: rDesc, ls: [{ c: etiq('Ajuste / Resultado Negativo', 'R-', true), d: Math.abs(a.diferencia), h: 0 }, { c: etiq(cName, 'A', false), d: 0, h: Math.abs(a.diferencia) }] });
        });

        if (store.db.transferencias) {
            store.db.transferencias.filter(t => t.fecha >= desde && t.fecha <= hasta).forEach(t => {
                let cOrig = store.db.cuentas.find(c => c.id === t.origenId)?.nombre || 'Caja';
                let cDest = store.db.cuentas.find(c => c.id === t.destinoId)?.nombre || 'Caja';
                asientos.push({ f: t.fecha + 'T00:06', r: 'Transferencia Interna de Fondos', ls: [{ c: etiq(cDest, 'A', true), d: t.monto, h: 0 }, { c: etiq(cOrig, 'A', false), d: 0, h: t.monto }] });
            });
        }
        
        return asientos.sort((a, b) => a.f.localeCompare(b.f));
    },

    getProximosVencimientos: function(diasTarget) {
        const hoy = new Date();
        const limite = new Date(hoy.getTime() + diasTarget * 86400000);
        const limiteStr = limite.toISOString().slice(0, 10);
        const hoyStr = hoy.toISOString().slice(0, 10);

        let resultados = [];
        store.db.lotes.filter(l => l.cantDisponible > 0 && l.vencimiento).forEach(l => {
            if (l.vencimiento <= limiteStr) {
                const p = store.db.productos.find(x => x.id === l.productoId);
                if (!p || p.deleted) return;
                const prov = store.db.proveedores.find(x => x.id === l.proveedorId)?.nombre || 'Sin Proveedor';
                const diffTime = Math.ceil((new Date(l.vencimiento) - new Date(hoyStr)) / (1000 * 60 * 60 * 24));
                
                resultados.push({ producto: p.nombre, proveedor: prov, vencimiento: l.vencimiento, stock: l.cantDisponible, unidad: p.unidad, diasRestantes: diffTime });
            }
        });
        return resultados.sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
    },

    generarAnalisisPromociones: function(topK = 10) {
        const transacciones = store.db.ventas.map(v => 
            store.db.ventaItems.filter(vi => vi.ventaId === v.id && !vi.isPromo).map(vi => vi.productoId)
        ).filter(t => t.length > 1);

        const frecuencias = {}; const itemNames = {}; const itemPrices = {}; const itemCosts = {};

        store.db.productos.filter(p => !p.deleted).forEach(p => {
            itemNames[p.id] = p.nombre;
            itemPrices[p.id] = inventario.calcPrecioFinal(p.id);
            itemCosts[p.id] = inventario.getCostoMasAlto(p.id);
        });

        transacciones.forEach(t => {
            const itemsUnicos = [...new Set(t)].sort();
            for (let i = 0; i < itemsUnicos.length; i++) {
                for (let j = i + 1; j < itemsUnicos.length; j++) {
                    const key2 = `${itemsUnicos[i]}|${itemsUnicos[j]}`;
                    frecuencias[key2] = (frecuencias[key2] || 0) + 1;
                    
                    for (let k = j + 1; k < itemsUnicos.length; k++) {
                         const key3 = `${itemsUnicos[i]}|${itemsUnicos[j]}|${itemsUnicos[k]}`;
                         frecuencias[key3] = (frecuencias[key3] || 0) + 1;
                    }
                }
            }
        });

        const descEfectivoGlobal = parseFloat(store.db.config?.descEfectivo) || 0;

        const combinaciones = Object.keys(frecuencias)
            .map(k => {
                const ids = k.split('|');
                if (ids.some(id => !itemNames[id])) return null; 
                
                const nombres = ids.map(id => itemNames[id]);
                const precioNormal = ids.reduce((sum, id) => sum + (itemPrices[id] || 0), 0);
                const costoTotal = ids.reduce((sum, id) => sum + (itemCosts[id] || 0), 0);

                const precioEfectivo = precioNormal * (1 - descEfectivoGlobal / 100);
                
                // Sugerimos un 5% extra sobre el descuento en efectivo
                let precioPromo = precioNormal * (1 - (descEfectivoGlobal + 5) / 100);
                
                // Piso estricto: Ganancia mínima del 10% sobre el costo
                const precioMinimoCosto = costoTotal * 1.10;
                if (precioPromo < precioMinimoCosto) precioPromo = precioMinimoCosto;

                // Si por el costo la promo queda más cara que comprar separado en efectivo, la descartamos
                if (precioPromo >= precioEfectivo && descEfectivoGlobal > 0) return null;

                const porcentajeSug = ((1 - (precioPromo / precioNormal)) * 100).toFixed(1);

                return { ids, nombres, frecuencia: frecuencias[k], precioNormal, costoTotal, precioPromo, porcentaje: porcentajeSug };
            })
            .filter(c => c && c.frecuencia > 1)
            .sort((a, b) => b.frecuencia - a.frecuencia)
            .slice(0, topK);

        return combinaciones;
    },

    // PDF Functions
    generarPDFPedidos: function() {
        if (!window.jspdf) throw new Error('Biblioteca jsPDF no cargada');
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); const cfg = store.db.config; let y = 15;
        if (cfg.logo) { try { const imgProps = doc.getImageProperties(cfg.logo); const ratio = imgProps.width / imgProps.height; const w = 22 * ratio; doc.addImage(cfg.logo, 'PNG', 10, y - 5, w, 22); y += 20; } catch (e) {} }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Pedidos Sugeridos (Reposición)', cfg.logo ? 35 : 105, y, { align: cfg.logo ? 'left' : 'center' }); y += 8;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Fecha: ' + new Date().toLocaleDateString('es-AR'), cfg.logo ? 35 : 105, y, { align: cfg.logo ? 'left' : 'center' }); y += 10;
        
        const aPedir = {};
        store.db.productos.filter(p => !p.deleted).forEach(p => {
            const st = inventario.getStock(p.id); const min = parseFloat(p.stockMinimo); let umbral = min;
            if (isNaN(umbral)) { const v30 = store.db.ventaItems.filter(vi => vi.productoId === p.id && store.db.ventas.find(v => v.id === vi.ventaId && new Date(v.timestamp) > new Date(Date.now() - 30 * 86400000))).reduce((s, vi) => s + vi.cantidad, 0); umbral = Math.ceil(v30 / 4); }
            if (st <= umbral && umbral > 0) { 
                const prov = store.db.proveedores.find(x => x.id === p.proveedorId); const provN = prov ? prov.nombre : 'Sin Proveedor (Catálogo anterior)'; 
                if (!aPedir[provN]) aPedir[provN] = { diasP: prov ? prov.diasPedido : [], items: [] }; 
                aPedir[provN].items.push([p.nombre, p.marca || '-', fmtQty(st, p.unidad), fmtQty(umbral, p.unidad), fmtQty(umbral - st > 0 ? umbral - st : 1, p.unidad)]); 
            }
        });

        const hoyDia = new Date().getDay();
        Object.entries(aPedir).forEach(([prov, data]) => {
            if (y > 250) { doc.addPage(); y = 20; } doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 22, 18);
            let sug = '';
            if (data.diasP.length > 0) { const dpNum = data.diasP.map(Number); let sigDia = dpNum.find(d => d >= hoyDia); if (sigDia === undefined) sigDia = dpNum[0]; const diff = sigDia >= hoyDia ? sigDia - hoyDia : (7 - hoyDia) + sigDia; const dPed = new Date(); dPed.setDate(dPed.getDate() + diff); sug = ` (Próx. pedido: ${DIAS_SEMANA[sigDia]} ${dPed.toLocaleDateString('es-AR')})`; }
            doc.text(`Proveedor: ${prov}${sug}`, 10, y); y += 3;
            doc.autoTable({ startY: y, head: [['Producto', 'Marca', 'Stock Actual', 'Stock Minimo', 'Sugerido a Comprar']], body: data.items, styles: { fontSize: 8 }, headStyles: { fillColor: [26, 22, 18] } }); y = doc.lastAutoTable.finalY + 10;
        });
        if (Object.keys(aPedir).length === 0) doc.text('No hay productos por debajo del stock mínimo.', 10, y);
        doc.save('pedidos-' + today() + '.pdf');
    },

    generarListaPrecios: function() {
        if (!window.jspdf) throw new Error('Biblioteca jsPDF no cargada');
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); const cfg = store.db.config; let y = 15;
        if (cfg.logo) { try { const imgProps = doc.getImageProperties(cfg.logo); const ratio = imgProps.width / imgProps.height; const w = 22 * ratio; doc.addImage(cfg.logo, 'PNG', 105 - w / 2, y - 5, w, 22); y += 24; } catch (e) {} }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(cfg.nombre || 'Lista de Precios', 105, y, { align: 'center' }); y += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        if (cfg.direccion) { doc.text(cfg.direccion, 105, y, { align: 'center' }); y += 5; }
        if (cfg.tel || cfg.ig || cfg.fb) { doc.text([cfg.tel, cfg.ig, cfg.fb].filter(Boolean).join(' | '), 105, y, { align: 'center' }); y += 5; }
        doc.text('Fecha: ' + new Date().toLocaleDateString('es-AR'), 105, y, { align: 'center' }); y += 10;
        
        const rows = store.db.productos.filter(p => !p.deleted).map(p => [p.nombre.substring(0, 40), p.marca || '', fmt(inventario.calcPrecioFinal(p.id))]);
        doc.autoTable({ startY: y, head: [['Producto', 'Marca', 'Precio']], body: rows, headStyles: { fillColor: [26, 22, 18] } }); 
        doc.save('precios-' + today() + '.pdf');
    },

    generarPDFEtiquetas: function(productosObjArr) {
        if (!window.jspdf || !window.JsBarcode) throw new Error('Bibliotecas jsPDF o JsBarcode no cargadas');
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); let x = 10, y = 15; const width = 60, height = 35;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('Etiquetas / Precios Actualizados', 105, 10, { align: 'center' });
        productosObjArr.forEach((p) => {
            const prod = store.db.productos.find(x => x.id === p.id); const codigo = prod.codigo || prod.barcode;
            if (x + width > 200) { x = 10; y += height + 5; }
            if (y + height > 280) { doc.addPage(); x = 10; y = 15; }
            doc.setDrawColor(150); doc.rect(x, y, width, height);
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(p.nombre.substring(0, 30), x + 2, y + 6);
            doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.text(fmt(p.calculado), x + width - 2, y + 13, { align: 'right' });
            if (codigo) {
                try {
                    const canvas = document.createElement('canvas'); window.JsBarcode(canvas, codigo, { format: "CODE128", width: 2, height: 45, displayValue: true, fontSize: 14, margin: 0 });
                    const imgData = canvas.toDataURL("image/png"); const imgP = doc.getImageProperties(imgData); const maxW = 50; const maxH = 17;
                    const ratio = Math.min(maxW / imgP.width, maxH / imgP.height); const finalW = imgP.width * ratio; const finalH = imgP.height * ratio;
                    const centerX = x + 5 + (maxW - finalW) / 2; doc.addImage(imgData, 'PNG', centerX, y + 15, finalW, finalH);
                } catch(e) {}
            }
            x += width + 5;
        });
        doc.save('etiquetas-actualizar-' + today() + '.pdf');
    },

    generarPDFCodigosBarra: function(productos) {
        if (!window.jspdf || !window.JsBarcode) throw new Error('Bibliotecas jsPDF o JsBarcode no cargadas');
        const { jsPDF } = window.jspdf; const doc = new jsPDF(); let x = 10, y = 15; const width = 60, height = 35;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('Catálogo - Códigos de Barras', 105, 10, { align: 'center' });
        productos.forEach((p) => {
            const codigo = p.codigo || p.barcode; if (!codigo) return;
            if (x + width > 200) { x = 10; y += height + 5; }
            if (y + height > 280) { doc.addPage(); x = 10; y = 15; }
            doc.setDrawColor(150); doc.rect(x, y, width, height);
            doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(p.nombre.substring(0, 30), x + 2, y + 6);
            try {
                const canvas = document.createElement('canvas'); window.JsBarcode(canvas, codigo, { format: "CODE128", width: 2, height: 45, displayValue: true, fontSize: 14, margin: 0 });
                const imgData = canvas.toDataURL("image/png"); const imgP = doc.getImageProperties(imgData); const maxW = 50; const maxH = 22;
                const ratio = Math.min(maxW / imgP.width, maxH / imgP.height); const finalW = imgP.width * ratio; const finalH = imgP.height * ratio;
                const centerX = x + 5 + (maxW - finalW) / 2; doc.addImage(imgData, 'PNG', centerX, y + 9, finalW, finalH);
            } catch(e) {}
            x += width + 5;
        });
        doc.save('codigos-barras-' + today() + '.pdf');
    }
};

module.exports = reportes;