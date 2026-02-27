const store = require('./store.js');
const clientes = require('./clientes.js');

const fmt = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtFecha = iso => { if (!iso) return '—'; const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; };

window.agregarCliente = function() {
    try {
        clientes.agregar(
            document.getElementById('cli-nombre').value,
            document.getElementById('cli-tel').value,
            document.getElementById('cli-dir').value,
            document.getElementById('cli-limite').value
        );
        store.saveDB();
        window.renderTablaClientes();
        if (typeof window.populateSelects === 'function') window.populateSelects();
        window.showToast('Cliente agregado exitosamente');
        
        document.getElementById('cli-nombre').value = '';
        document.getElementById('cli-tel').value = '';
        document.getElementById('cli-dir').value = '';
        document.getElementById('cli-limite').value = '';
    } catch(e) { window.showToast(e.message, 'error'); }
};

window.abrirEditarCliente = function(id) {
    const c = store.db.clientes.find(x => x.id === id);
    if (!c) return;
    document.getElementById('ecli-id').value = id;
    document.getElementById('ecli-nombre').value = c.nombre;
    document.getElementById('ecli-tel').value = c.telefono;
    document.getElementById('ecli-dir').value = c.direccion;
    document.getElementById('ecli-limite').value = c.limiteCredito;
    document.getElementById('modal-edit-cliente').classList.add('open');
};

window.guardarEditCliente = function() {
    try {
        clientes.editar(
            document.getElementById('ecli-id').value,
            document.getElementById('ecli-nombre').value,
            document.getElementById('ecli-tel').value,
            document.getElementById('ecli-dir').value,
            document.getElementById('ecli-limite').value
        );
        store.saveDB();
        document.getElementById('modal-edit-cliente').classList.remove('open');
        window.renderTablaClientes();
        if (typeof window.populateSelects === 'function') window.populateSelects();
        window.showToast('Cliente actualizado');
    } catch(e) { window.showToast(e.message, 'error'); }
};

window.eliminarCliente = function(id) {
    try {
        if(confirm('¿Está seguro de eliminar este cliente? El historial quedará huérfano.')) {
            clientes.eliminar(id);
            store.saveDB();
            window.renderTablaClientes();
            if (typeof window.populateSelects === 'function') window.populateSelects();
            window.showToast('Cliente eliminado');
        }
    } catch(e) { window.showToast(e.message, 'error'); }
};

window.abrirCobroCliente = function(id) {
    const deuda = clientes.getDeudaTotal(id);
    if (deuda <= 0) return window.showToast('El cliente no registra deuda.', 'error');
    
    document.getElementById('cobro-cli-id').value = id;
    document.getElementById('cobro-monto').value = deuda;
    document.getElementById('cobro-fecha').value = (new Date(Date.now() - new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
    document.getElementById('cobro-desc').value = 'Pago a cuenta';
    document.getElementById('modal-cobro-cliente').classList.add('open');
};

window.confirmarCobroCliente = function() {
    try {
        clientes.registrarPago(
            document.getElementById('cobro-cli-id').value,
            document.getElementById('cobro-monto').value,
            document.getElementById('cobro-cuenta').value,
            document.getElementById('cobro-fecha').value,
            document.getElementById('cobro-desc').value
        );
        store.saveDB();
        document.getElementById('modal-cobro-cliente').classList.remove('open');
        window.renderTablaClientes();
        if (typeof window.renderFinanzasTotales === 'function') window.renderFinanzasTotales();
        window.showToast('Cobro registrado exitosamente y fondos ingresados a la cuenta');
    } catch(e) { window.showToast(e.message, 'error'); }
};

window.verHistorialCliente = function(id) {
    const c = store.db.clientes.find(x => x.id === id);
    const movs = (store.db.cuentasCorrientes || []).filter(m => m.clienteId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    
    document.getElementById('historial-cli-nombre').textContent = c.nombre;
    const tbody = document.getElementById('tabla-historial-cliente');
    
    if (movs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay movimientos registrados.</td></tr>';
    } else {
        tbody.innerHTML = movs.map(m => `
            <tr>
                <td class="mono">${fmtFecha(m.fecha)}</td>
                <td>${m.descripcion}</td>
                <td class="mono" style="color:var(--accent); text-align:right;">${m.tipo === 'cargo' ? fmt(m.monto) : ''}</td>
                <td class="mono" style="color:var(--green); text-align:right;">${m.tipo === 'pago' ? fmt(m.monto) : ''}</td>
            </tr>
        `).join('');
    }
    document.getElementById('modal-historial-cliente').classList.add('open');
};

window.renderTablaClientes = function() {
    const container = document.getElementById('tabla-clientes-container');
    if (!container) return;
    
    const clis = (store.db.clientes || []).filter(c => !c.deleted);
    if (clis.length === 0) {
        container.innerHTML = '<div style="color:var(--muted); padding: 1rem 0;">No hay clientes registrados.</div>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Nombre y Dirección</th>
                    <th>Teléfono</th>
                    <th>Límite de Crédito</th>
                    <th>Deuda Actual</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${clis.map(c => {
                    const deuda = clientes.getDeudaTotal(c.id);
                    const exc = c.limiteCredito > 0 && deuda > c.limiteCredito;
                    return `
                    <tr>
                        <td><strong>${c.nombre}</strong><br><span style="font-size:0.75rem;color:var(--muted)">${c.direccion || '—'}</span></td>
                        <td>${c.telefono || '—'}</td>
                        <td class="mono">${c.limiteCredito > 0 ? fmt(c.limiteCredito) : 'Ilimitado'}</td>
                        <td class="mono" style="color:${exc ? 'var(--accent)' : deuda > 0 ? 'var(--amber)' : 'var(--ink)'}; font-weight:bold;">
                            ${fmt(deuda)}
                        </td>
                        <td>
                            <div style="display:flex; gap:5px;">
                                <button class="btn btn-sm btn-success" onclick="window.abrirCobroCliente('${c.id}')" ${deuda <= 0 ? 'disabled' : ''}>✅ Cobrar</button>
                                <button class="btn btn-sm btn-secondary" onclick="window.verHistorialCliente('${c.id}')">📄 Historial</button>
                                <button class="btn btn-sm btn-secondary" onclick="window.abrirEditarCliente('${c.id}')">✏️ Modificar</button>
                                <button class="btn btn-sm btn-danger" onclick="window.eliminarCliente('${c.id}')">🗑️</button>
                            </div>
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
};

module.exports = {};