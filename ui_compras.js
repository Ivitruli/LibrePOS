const store = require('./store.js');
const compras = require('./compras.js');

// Exponemos el módulo de compras al objeto window para que los botones del HTML puedan llamar a generarCodigoInterno()
window.compras = compras;

let carritoRemito = [];

// Utilidades locales de formato
const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtFecha = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; };

window.togglePagoCompra = function(val) {
    document.getElementById('comp-cuenta-wrap').style.display = val === 'pagado' ? 'block' : 'none';
};

window.buscarProdCompra = function() {
    const bc = document.getElementById('comp-barcode').value.trim();
    if (!bc) return;
    const prod = store.db.productos.filter(x => !x.deleted).find(p => p.barcode === bc || p.codigo === bc);
    if (prod) {
        document.getElementById('comp-prod-nombre').value = prod.nombre + (prod.marca ? ' (' + prod.marca + ')' : '');
        document.getElementById('comp-prod-id').value = prod.id;
        document.getElementById('comp-cantidad').focus();
    } else {
        document.getElementById('np-codigo').value = bc;
        document.getElementById('modal-np').classList.add('open');
        setTimeout(() => document.getElementById('np-nombre').focus(), 80);
    }
};

window.guardarNuevoProd = function() {
    const codigo = document.getElementById('np-codigo').value.trim();
    const nombre = document.getElementById('np-nombre').value.trim();
    const marca = document.getElementById('np-marca').value.trim();
    const unidad = document.getElementById('np-unidad').value;
    
    if (!codigo || !nombre) return window.showToast('Código y nombre son obligatorios', 'error');
    let exist = store.db.productos.find(p => p.codigo === codigo || p.barcode === codigo);
    if (exist && !exist.deleted) return window.showToast('Código ya existe', 'error');
    
    let pId;
    if (exist && exist.deleted) {
        exist.deleted = false; exist.nombre = nombre; exist.marca = marca; exist.unidad = unidad; pId = exist.id;
    } else {
        pId = Date.now().toString();
        store.db.productos.push({ id: pId, codigo, barcode: codigo, nombre, marca, unidad, deleted: false });
    }
    
    if (!store.db.preciosExtra[pId]) store.db.preciosExtra[pId] = { fijo: 0, imp: 0, gan: 30, desc: 0, alCosto: false, precioImpreso: 0 };
    store.saveDB();
    
    document.getElementById('modal-np').classList.remove('open');
    document.getElementById('comp-prod-nombre').value = nombre;
    document.getElementById('comp-prod-id').value = pId;
    document.getElementById('comp-barcode').value = codigo;
    document.getElementById('comp-cantidad').focus();
};

window.agregarItemRemito = function() {
    const pId = document.getElementById('comp-prod-id').value;
    const cant = parseFloat(document.getElementById('comp-cantidad').value);
    const costo = parseFloat(document.getElementById('comp-costo').value);
    const venc = document.getElementById('comp-venc').value;
    
    if (!pId || !cant || isNaN(costo)) return window.showToast('Faltan datos del producto', 'error');
    const p = store.db.productos.find(x => x.id === pId);
    
    carritoRemito.push({ productoId: pId, codigo: p.codigo, nombre: p.nombre, cantidad: cant, costoUnitario: costo, vencimiento: venc });
    window.renderTablaRemito();
    
    ['comp-barcode', 'comp-prod-nombre', 'comp-prod-id', 'comp-cantidad', 'comp-costo', 'comp-venc'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('comp-barcode').focus();
};

window.quitarItemRemito = function(idx) {
    carritoRemito.splice(idx, 1);
    window.renderTablaRemito();
};

window.renderTablaRemito = function() {
    let total = 0;
    document.getElementById('tabla-remito-items').innerHTML = carritoRemito.map((item, i) => {
        const sub = item.cantidad * item.costoUnitario; total += sub;
        return `<tr><td class="mono">${item.codigo}</td><td>${item.nombre}</td><td class="mono">${item.cantidad}</td><td class="mono">${fmt(item.costoUnitario)}</td><td class="mono">${fmt(sub)}</td><td>${fmtFecha(item.vencimiento)}</td><td><button class="btn btn-danger btn-sm" onclick="quitarItemRemito(${i})">🗑️</button></td></tr>`;
    }).join('');
    document.getElementById('comp-total-remito').textContent = fmt(total);
};

window.confirmarRemitoCompleto = function() {
    try {
        compras.registrarRemito(
            document.getElementById('comp-proveedor').value,
            document.getElementById('comp-comprobante').value,
            document.getElementById('comp-fecha').value,
            carritoRemito,
            document.getElementById('comp-pago').value,
            document.getElementById('comp-cuenta').value
        );
        store.saveDB();
        if (typeof window.populateSelects === 'function') window.populateSelects();
        window.showToast('Remito registrado con éxito');
        
        carritoRemito = [];
        window.renderTablaRemito();
        document.getElementById('comp-comprobante').value = '';
    } catch (e) {
        window.showToast(e.message, 'error');
    }
};

module.exports = {};