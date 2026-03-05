const store = require('./store.js');

const defaultColors = {
    bg: '#F5F0E8',         // Fondo General
    surface: '#FDFAF4',    // Fondo Tarjetas
    color2: '#1A1612',     // Fondo Cabecera
    text: '#1A1612',       // Texto Principal
    muted: '#7A7060',      // Texto Secundario
    hText: '#FFFFFF',      // Texto Cabecera / Menú
    color1: '#C4432A',     // Color Principal (Botones)
    btnText: '#FFFFFF',    // Texto de Botones Principales
    success: '#2A6B3C',    // Acción Positiva (Verde)
    alert: '#C4432A'       // Énfasis y Alertas (Rojo/Naranja)
};

window.aplicarColores = function() {
    if (!store.db.config) return;
    const root = document.documentElement; 
    
    // 1. Aplicar Fondos y Textos base
    if (store.db.config.bg) root.style.setProperty('--bg', store.db.config.bg);
    if (store.db.config.surface) root.style.setProperty('--surface', store.db.config.surface);
    if (store.db.config.color2) root.style.setProperty('--c2', store.db.config.color2);
    
    if (store.db.config.text) {
        root.style.setProperty('--text', store.db.config.text);
        root.style.setProperty('--ink', store.db.config.text); 
    }
    if (store.db.config.muted) root.style.setProperty('--muted', store.db.config.muted);

    // 2. Aplicar Botones y Acciones
    if (store.db.config.color1) root.style.setProperty('--c1', store.db.config.color1);
    if (store.db.config.btnText) root.style.setProperty('--btn-text', store.db.config.btnText);
    
    if (store.db.config.success) {
        root.style.setProperty('--success', store.db.config.success);
        root.style.setProperty('--green', store.db.config.success); // Mantenemos compatibilidad temporal
    }
    
    if (store.db.config.alert) {
        root.style.setProperty('--alert', store.db.config.alert);
        root.style.setProperty('--accent', store.db.config.alert); // Mantenemos compatibilidad temporal
    }

    // 3. Reglas CSS Forzadas (Cabecera y Pestañas)
    let hStyle = document.getElementById('header-custom-style');
    if (!hStyle) {
        hStyle = document.createElement('style');
        hStyle.id = 'header-custom-style';
        document.head.appendChild(hStyle);
    }
    
    const colorCabecera = store.db.config.hText || defaultColors.hText;
    const colorActivo = store.db.config.color1 || defaultColors.color1;
    const colorFondoActivo = store.db.config.surface || defaultColors.surface;
    
    hStyle.innerHTML = `
        header, .header, #header, .top-bar { color: ${colorCabecera} !important; }
        .nav-tab:not(.active), .header button, .top-bar button { color: ${colorCabecera} !important; }
        .nav-tab.active { color: ${colorActivo} !important; background-color: ${colorFondoActivo} !important; }
    `;

    // 4. Nombre del local
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        const nombreLocal = store.db.config.nombre || '';
        headerTitle.innerHTML = nombreLocal 
            ? `<span style="color: ${colorCabecera}; font-weight: bold;">${nombreLocal}</span>` 
            : `<span style="color: ${colorCabecera};">Libre</span><span style="color: var(--c1);">POS</span>`;
    }

    // 5. Mostrar Logo
    const hLogo = document.getElementById('header-logo');
    if (hLogo) {
        if (store.db.config.logo) {
            hLogo.src = store.db.config.logo;
            hLogo.classList.add('visible');
        } else {
            hLogo.classList.remove('visible');
        }
    }
};

window.restaurarColoresPorDefecto = function() {
    try {
        for (const [clave, valor] of Object.entries(defaultColors)) {
            store.dao.guardarConfiguracion(clave, valor);
        }
        store.loadDB();
        window.cargarInputsConfig();
        window.aplicarColores();
        window.showToast('Colores originales restaurados.');
    } catch (error) {
        console.error("Error al restaurar colores:", error);
        window.showToast('Error al restaurar colores en base de datos', 'error');
    }
};

window.cargarLogo = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const dataUrl = e.target.result;
        document.getElementById('cfg-logo-preview').innerHTML = `<img src="${dataUrl}" style="max-height:60px; border-radius:5px; border: 1px solid var(--border);">`;
        
        try {
            store.dao.guardarConfiguracion('logo', dataUrl);
            store.loadDB();
            
            const hLogo = document.getElementById('header-logo');
            if (hLogo) {
                hLogo.src = dataUrl;
                hLogo.classList.add('visible');
            }
        } catch (error) {
            console.error("Error al guardar logo:", error);
            window.showToast('Error al procesar el logo en base de datos', 'error');
        }
    };
    reader.readAsDataURL(file);
};

window.guardarConfig = function() {
    try {
        const configs = {};
        
        ['nombre','direccion','tel','email','ig','fb', 'descEfectivo'].forEach(k => {
            const el = document.getElementById('cfg-'+k);
            if (el) configs[k] = el.value;
        });
        
        // Guardar los 10 colores
        configs.bg = document.getElementById('cfg-bg').value;
        configs.surface = document.getElementById('cfg-surface').value;
        configs.color2 = document.getElementById('cfg-c2').value;
        configs.text = document.getElementById('cfg-text').value;
        configs.muted = document.getElementById('cfg-muted').value;
        configs.hText = document.getElementById('cfg-h-text').value;
        configs.color1 = document.getElementById('cfg-c1').value;
        configs.btnText = document.getElementById('cfg-btn-text').value;
        configs.success = document.getElementById('cfg-success').value;
        configs.alert = document.getElementById('cfg-alert').value;
        
        // Inyectamos todas las claves en SQLite a través del DAO
        for (const [clave, valor] of Object.entries(configs)) {
            if (valor !== undefined) {
                store.dao.guardarConfiguracion(clave, valor);
            }
        }
        
        store.loadDB(); // Sincroniza SQLite -> RAM
        window.aplicarColores();
        window.showToast('Configuración guardada en la base de datos.');
    } catch (error) {
        console.error("Error al guardar config:", error);
        window.showToast('Fallo al guardar configuración', 'error');
    }
};

window.elegirCarpetaGuardado = async function() {
    try {
        await store.elegirCarpetaGuardado(function(rutaAsignada) {
            const inputRuta = document.getElementById('ruta-guardado'); 
            if (inputRuta) {
                inputRuta.innerText = `Carpeta vinculada: ${rutaAsignada}`;
            }
            
            store.dao.guardarConfiguracion('carpetaNombre', rutaAsignada);
            store.loadDB();
            
            window.showToast('Directorio de guardado vinculado con éxito');
        });
    } catch (error) {
        window.showToast('Error al seleccionar carpeta: ' + error.message, 'error');
    }
};

window.exportarDatos = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(store.db));
    const a = document.createElement('a');
    a.href = dataStr;
    const fecha = store.now().slice(0, 10); // Restaurado al reloj local
    a.download = `LibrePOS_Backup_${fecha}.json`;
    a.click();
};

window.importarDatos = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedDB = JSON.parse(e.target.result);
            if (importedDB && importedDB.productos) {
                store.db = importedDB;
                /* store.saveDB() removido */
                window.showToast('Restaurado con éxito. Reiniciando...');
                setTimeout(() => location.reload(), 1500);
            }
        } catch (err) { window.showToast('Error en archivo', 'error'); }
    };
    reader.readAsText(file);
};

window.cargarInputsConfig = function() {
    if(!store.db.config) return;
    
    ['nombre','direccion','tel','email','ig','fb', 'descEfectivo'].forEach(k => {
        if(document.getElementById('cfg-'+k)) document.getElementById('cfg-'+k).value = store.db.config[k] || '';
    });
    
    // Cargar los 10 colores con fallback a defaultColors si están vacíos en la BD
    if (document.getElementById('cfg-bg')) document.getElementById('cfg-bg').value = store.db.config.bg || defaultColors.bg;
    if (document.getElementById('cfg-surface')) document.getElementById('cfg-surface').value = store.db.config.surface || defaultColors.surface;
    if (document.getElementById('cfg-c2')) document.getElementById('cfg-c2').value = store.db.config.color2 || defaultColors.color2;
    if (document.getElementById('cfg-text')) document.getElementById('cfg-text').value = store.db.config.text || defaultColors.text;
    if (document.getElementById('cfg-muted')) document.getElementById('cfg-muted').value = store.db.config.muted || defaultColors.muted;
    if (document.getElementById('cfg-h-text')) document.getElementById('cfg-h-text').value = store.db.config.hText || defaultColors.hText;
    if (document.getElementById('cfg-c1')) document.getElementById('cfg-c1').value = store.db.config.color1 || defaultColors.color1;
    if (document.getElementById('cfg-btn-text')) document.getElementById('cfg-btn-text').value = store.db.config.btnText || defaultColors.btnText;
    if (document.getElementById('cfg-success')) document.getElementById('cfg-success').value = store.db.config.success || defaultColors.success;
    if (document.getElementById('cfg-alert')) document.getElementById('cfg-alert').value = store.db.config.alert || defaultColors.alert;
    
    if (store.db.config.logo) {
        document.getElementById('cfg-logo-preview').innerHTML = `<img src="${store.db.config.logo}" style="max-height:60px; border-radius:5px; border: 1px solid var(--border);">`;
    }
    if (store.db.config.carpetaNombre) {
        document.getElementById('ruta-guardado').innerText = `Carpeta vinculada: ${store.db.config.carpetaNombre}`;
    }
};

setTimeout(() => {
    if (typeof window.cargarInputsConfig === 'function') window.cargarInputsConfig();
    if (typeof window.aplicarColores === 'function') window.aplicarColores();
}, 200);

module.exports = {};