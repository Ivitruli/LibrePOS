const store = require('./store.js');
const comboManager = require('./combo_manager.js');

window.uiCombos = {
    productosPendientes: [], // Cache temporal para el modal
    comboEditandoId: null,   // Guarda el ID original cuando estamos editando

    abrirModalNuevoCombo: function () {
        this.comboEditandoId = null;
        this.productosPendientes = [];
        document.getElementById('combo-nombre').value = '';
        document.getElementById('combo-precio-final').value = '';
        document.getElementById('combo-search').value = '';
        document.getElementById('combo-alerta-rentabilidad').style.display = 'none';

        this.renderTablaItems();
        this.calcularRentabilidadEnTiempoReal();
        this.renderSugerenciasInteligentes();

        document.getElementById('modal-combo').classList.add('open');
        this.configurarBuscadorProductos();
    },

    configurarBuscadorProductos: function () {
        const searchInput = document.getElementById('combo-search');
        const resultsDiv = document.getElementById('combo-search-results');

        // Removemos listeners previos clonando el nodo para evitar duplicidades
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);

        newSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (query.length < 2) {
                resultsDiv.classList.add('hidden');
                return;
            }

            const coincidencias = store.db.productos.filter(p => !p.deleted && (p.nombre.toLowerCase().includes(query) || (p.codigo && p.codigo.includes(query))));

            if (coincidencias.length === 0) {
                resultsDiv.innerHTML = '<div class="p-sm text-muted">No hay resultados</div>';
            } else {
                resultsDiv.innerHTML = coincidencias.slice(0, 10).map(p => `
                    <div class="autocomplete-item" onclick="window.uiCombos.seleccionarProductoBusqueda('${p.id}', '${p.nombre.replace(/'/g, "\\'")}')">
                        ${p.nombre} <span class="text-muted" style="font-size: 0.8em">(${p.unidad || 'Unidad'})</span>
                    </div>
                `).join('');
            }
            resultsDiv.classList.remove('hidden');
        });

        // Esconder si clicamos afuera
        document.addEventListener('click', (e) => {
            if (!newSearchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
                resultsDiv.classList.add('hidden');
            }
        });
    },

    seleccionarProductoBusqueda: function (idProd, nombreProd) {
        document.getElementById('combo-search').value = nombreProd;
        document.getElementById('combo-search').dataset.prodId = idProd;
        document.getElementById('combo-search-results').classList.add('hidden');
        document.getElementById('combo-qty').focus();
    },

    agregarItemPendiente: function () {
        const inputBusqueda = document.getElementById('combo-search');
        const pid = inputBusqueda.dataset.prodId;
        const nombre = inputBusqueda.value;
        const cant = parseFloat(document.getElementById('combo-qty').value);

        if (!pid || !nombre) return window.showToast('Buscá y seleccioná un producto primero', 'error');
        if (isNaN(cant) || cant <= 0) return window.showToast('Cantidad inválida', 'error');

        // Validar si ya existe para sumar cantidad o agregar nuevo
        const existente = this.productosPendientes.find(p => p.id === pid);
        if (existente) {
            existente.cantidad += cant;
        } else {
            this.productosPendientes.push({ id: pid, nombre: nombre, cantidad: cant });
        }

        inputBusqueda.value = '';
        delete inputBusqueda.dataset.prodId;
        document.getElementById('combo-qty').value = '1';

        this.renderTablaItems();
        this.calcularRentabilidadEnTiempoReal();
    },

    quitarItemPendiente: function (pid) {
        this.productosPendientes = this.productosPendientes.filter(p => p.id !== pid);
        this.renderTablaItems();
        this.calcularRentabilidadEnTiempoReal();
    },

    renderTablaItems: function () {
        const tbody = document.getElementById('combo-items-tbody');
        const inventario = require('./inventario.js');
        const calculador = require('./combo_calculador.js');

        if (this.productosPendientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Aún no hay productos en el combo</td></tr>';
            return;
        }

        tbody.innerHTML = this.productosPendientes.map(p => {
            const analisis = calculador._analizarProductoBase(p.id);
            return `
            <tr>
                <td>${p.nombre}</td>
                <td class="mono">${p.cantidad}</td>
                <td class="mono">${window.fmt(analisis.costo * p.cantidad)}</td>
                <td class="mono">${window.fmt(analisis.precioBase * p.cantidad)}</td>
                <td><button class="btn btn-sm btn-danger inner-btn" onclick="window.uiCombos.quitarItemPendiente('${p.id}')">✕</button></td>
            </tr>`;
        }).join('');
    },

    calcularRentabilidadEnTiempoReal: function () {
        if (this.productosPendientes.length === 0) {
            document.getElementById('combo-lbl-costo').textContent = '$0.00';
            document.getElementById('combo-lbl-precio-base').textContent = '$0.00';
            document.getElementById('combo-lbl-precio-piso').textContent = '$0.00';
            document.getElementById('combo-lbl-desc-max').textContent = '0%';
            document.getElementById('combo-precio-final').value = '';
            document.getElementById('combo-alerta-rentabilidad').style.display = 'none';
            return;
        }

        const sugerencia = comboManager.simularCombo(this.productosPendientes, 10);

        document.getElementById('combo-lbl-costo').textContent = window.fmt(sugerencia.costoCMV);
        document.getElementById('combo-lbl-precio-base').textContent = window.fmt(sugerencia.precioLista);

        const pisoLbl = document.getElementById('combo-lbl-precio-piso');
        pisoLbl.textContent = window.fmt(sugerencia.precioMinimoPermitido);

        const descMaxLbl = document.getElementById('combo-lbl-desc-max');
        descMaxLbl.textContent = sugerencia.descuentoMax_PCT + '%';

        // Auto sugerir el precio lista por primera vez si está vacío
        const inputPrecioFinal = document.getElementById('combo-precio-final');
        if (!inputPrecioFinal.value || parseFloat(inputPrecioFinal.value) === 0) {
            inputPrecioFinal.value = sugerencia.precioLista;
        }

        this.validarPrecioIngresado();
    },

    validarPrecioIngresado: function () {
        if (this.productosPendientes.length === 0) return;

        const precioFijado = parseFloat(document.getElementById('combo-precio-final').value);
        if (isNaN(precioFijado)) return;

        const btnGuardar = document.getElementById('btn-guardar-combo');
        const alertaTxt = document.getElementById('combo-alerta-rentabilidad');

        const validacion = comboManager.chequearPrecioManual(this.productosPendientes, precioFijado, 10);

        if (!validacion.esValido) {
            alertaTxt.textContent = `⚠️ RIESGO DE PÉRDIDA. ${validacion.motivo} (asumiendo 10% desc. caja)`;
            alertaTxt.style.display = 'block';
            btnGuardar.disabled = true;
            document.getElementById('combo-precio-final').style.color = 'var(--red)';
        } else {
            alertaTxt.style.display = 'none';
            btnGuardar.disabled = false;
            document.getElementById('combo-precio-final').style.color = 'var(--green)';
        }
    },

    guardarCombo: function () {
        try {
            const nombre = document.getElementById('combo-nombre').value;
            const precioFijado = document.getElementById('combo-precio-final').value;

            comboManager.crearCombo(nombre, this.productosPendientes, precioFijado, this.comboEditandoId);

            window.showToast(this.comboEditandoId ? 'Combo Modificado Exitosamente' : 'Combo Creado Exitosamente');
            document.getElementById('modal-combo').classList.remove('open');
            this.renderGrillaPromosActivas();
            if (typeof window.renderPromosActivasPOS === 'function') window.renderPromosActivasPOS();

        } catch (error) {
            window.showToast(error.message, 'error');
        }
    },

    renderGrillaPromosActivas: function () {
        const container = document.getElementById('lista-combos-activas');
        const promos = comboManager.obtenerTodos();

        if (!promos || promos.length === 0) {
            container.innerHTML = '<span class="text-muted" style="font-size:.8rem;">No hay promociones o combos activos actualmente.</span>';
            return;
        }

        container.innerHTML = promos.map(p => {
            const listadoNombres = p.items.map(item => `• ${item.cantidad}x ${item.nombre}`).join('<br>');
            return `
            <div class="card p-1" style="border-left: 4px solid var(--primary); margin: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05)">
                <div class="d-flex justify-between align-center mb-sm">
                    <strong style="color: var(--primary); font-size: 1.1rem">${p.nombre}</strong>
                    <div class="d-flex gap-sm">
                        <button class="btn btn-sm btn-secondary inner-btn" title="Modificar Combo" onclick="window.uiCombos.modificarComboActivo('${p.id}')">✏️ Edit</button>
                        <button class="btn btn-sm btn-danger inner-btn" title="Eliminar Combo" onclick="window.uiCombos.eliminarComboActivo('${p.id}')">✕</button>
                    </div>
                </div>
                <div class="text-sm text-muted mb-1" style="line-height: 1.4;">
                    ${listadoNombres}
                </div>
                <div class="dashed-divider mt-sm mb-sm"></div>
                <div class="d-flex justify-between align-end">
                    <span class="text-xs caps-label" style="margin: 0">Precio Combo</span>
                    <span class="mono font-bold text-lg text-green">${window.fmt(p.precioPromo)}</span>
                </div>
            </div>`;
        }).join('');
    },

    eliminarComboActivo: function (id) {
        if (!confirm('¿Estás seguro de que deseás eliminar este combo?')) return;
        try {
            comboManager.eliminarCombo(id);
            this.renderGrillaPromosActivas();
            if (typeof window.renderPromosActivasPOS === 'function') window.renderPromosActivasPOS();
            window.showToast('Combo eliminado');
        } catch (error) {
            window.showToast('Error al eliminar: ' + error.message, 'error');
        }
    },

    modificarComboActivo: function (id) {
        const combo = comboManager.obtenerTodos().find(c => c.id === id);
        if (!combo) return window.showToast('Combo no encontrado', 'error');

        this.comboEditandoId = id;
        this.productosPendientes = JSON.parse(JSON.stringify(combo.items)); // Clon profundo

        document.getElementById('combo-nombre').value = combo.nombre;
        document.getElementById('combo-precio-final').value = combo.precioPromo;
        document.getElementById('combo-search').value = '';
        document.getElementById('combo-alerta-rentabilidad').style.display = 'none';

        this.renderTablaItems();
        this.calcularRentabilidadEnTiempoReal();
        // Sugerencias deshabilitadas para no distraer la edición de este combo particular
        document.getElementById('combo-sugerencias-wrapper').style.display = 'none';

        document.getElementById('modal-combo').classList.add('open');
        this.configurarBuscadorProductos();
    },

    // --- MARKET BASKET ANALYSIS UI ---
    sugerenciasCache: null, // Para evitar minería pesada concurrente si se entra y sale rápido

    renderSugerenciasInteligentes: function () {
        const wrapper = document.getElementById('combo-sugerencias-wrapper');
        const box = document.getElementById('combo-sugerencias-box');

        // Ejecutamos Miner SQL
        const topCombos = store.dao.obtenerSugerenciasMarketBasket(10);
        this.sugerenciasCache = topCombos;

        if (!topCombos || topCombos.length === 0) {
            wrapper.style.display = 'none';
            return;
        }

        wrapper.style.display = 'block';
        box.innerHTML = topCombos.map((sug, idx) => {
            const listItemsText = sug.items.map(i => i.nombre).join(' + ');
            const emojis = ['🔥', '⭐', '⚡', '🚀'][idx % 4];
            return `
                <button class="btn btn-sm" style="background: var(--surface); color: var(--text); border: 1px solid var(--border);" 
                        onclick="window.uiCombos.aplicarSugerencia(${idx})" title="Vendido ${sug.frecuencia} veces juntas. Clickeá para autocompletar.">
                    ${emojis} ${listItemsText} <span class="text-xs text-muted">(${sug.frecuencia} tickets)</span>
                </button>
            `;
        }).join('');
    },

    aplicarSugerencia: function (idx) {
        const sugerenciaElegida = this.sugerenciasCache[idx];
        if (!sugerenciaElegida) return;

        // Limpiar para volcar nuevo
        this.productosPendientes = [];
        const comboNombreSugerido = "Promo " + sugerenciaElegida.items.map(i => i.nombre.split(' ')[0]).join(' y ');

        sugerenciaElegida.items.forEach(prod => {
            this.productosPendientes.push({ id: prod.id, nombre: prod.nombre, cantidad: 1 });
        });

        document.getElementById('combo-nombre').value = comboNombreSugerido;
        window.showToast('Sugerencia inteligente cargada en la tabla');

        this.renderTablaItems();
        this.calcularRentabilidadEnTiempoReal();
    }
};
