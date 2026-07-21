const fs = require('fs');
const path = require('path');
const { RUTAS } = require('../config/constants');

// Caché en memoria para grupos
const historialCache = {};
const debounceTimers = {};

function initDirectories() {
    if (!fs.existsSync(RUTAS.HISTORIALES)) fs.mkdirSync(RUTAS.HISTORIALES, { recursive: true });
    if (!fs.existsSync(RUTAS.EVIDENCIAS)) fs.mkdirSync(RUTAS.EVIDENCIAS, { recursive: true });
}

function cargarTodosLosHistoriales() {
    initDirectories();
    const archivos = fs.readdirSync(RUTAS.HISTORIALES);
    archivos.forEach(archivo => {
        if (archivo.endsWith('.json')) {
            const idGrupo = archivo.replace('.json', '');
            try {
                const contenido = fs.readFileSync(path.join(RUTAS.HISTORIALES, archivo), 'utf-8');
                const data = JSON.parse(contenido);
                
                if (!data || !data.idUnico || !Array.isArray(data.mensajes)) {
                    historialCache[idGrupo] = { idUnico: idGrupo, nombreActual: "Grupo Desconocido", banderaRolplay: false, rol: "" ,mensajes: [], usuarios: {} };
                    marcarCambios(idGrupo);
                } else {
                    historialCache[idGrupo] = data; 
                    if (!historialCache[idGrupo].usuarios) historialCache[idGrupo].usuarios = {};
                }
            } catch (e) {
                historialCache[idGrupo] = { idUnico: idGrupo, nombreActual: "Grupo Desconocido", banderaRolplay: false, mensajes: [], usuarios: {} };
            }
        }
    });
}

function getGrupo(idGrupo) {
    if (!historialCache[idGrupo]) {
        historialCache[idGrupo] = {
            idUnico: idGrupo,
            nombreActual: "Grupo Desconocido",
            banderaRolplay: false,
            rol: "",
            mensajes: [],
            usuarios: {}
        };
        marcarCambios(idGrupo);
    }
    return historialCache[idGrupo];
}

function setNombreGrupo(idGrupo, nombreReal) {
    const grupo = getGrupo(idGrupo);
    if (grupo.nombreActual !== nombreReal) {
        grupo.nombreActual = nombreReal;
        marcarCambios(idGrupo);
    }
}

function getUsuario(idGrupo, idUsuario) {
    const grupo = getGrupo(idGrupo);
    if (!grupo.usuarios[idUsuario]) {
        grupo.usuarios[idUsuario] = {
            incidencias: 0,
            prioridadContexto: false,
            cooldownReset: null,
            semanasPenalizacion: 0
        };
        marcarCambios(idGrupo);
    }
    return grupo.usuarios[idUsuario];
}

/**
 * Marca un grupo para ser guardado usando un sistema de Debounce (WAL).
 * Si hay múltiples llamadas rápidas para el mismo grupo, el timer se reinicia.
 * Solo guarda a disco físico tras 3 segundos de inactividad de ese grupo.
 */
function marcarCambios(idGrupo) {
    if (!idGrupo) {
        console.warn("db.marcarCambios() llamado sin idGrupo específico.");
        return;
    }

    if (debounceTimers[idGrupo]) {
        clearTimeout(debounceTimers[idGrupo]);
    }

    // Debounce individual de 3 segundos
    debounceTimers[idGrupo] = setTimeout(() => {
        const rutaArchivo = path.join(RUTAS.HISTORIALES, `${idGrupo}.json`);
        fs.writeFile(rutaArchivo, JSON.stringify(historialCache[idGrupo], null, 2), 'utf-8', (err) => {
            if (err) console.error(`Error al guardar JSON de ${idGrupo}:`, err);
        });
        delete debounceTimers[idGrupo];
    }, 3000);
}

function getAllGrupos() {
    return Object.keys(historialCache);
}

function forzarGuardadoSincrono() {
    console.log('\nGuardando caché de historiales en disco de forma síncrona...');
    for (const idGrupo in historialCache) {
        if (debounceTimers[idGrupo]) {
            clearTimeout(debounceTimers[idGrupo]);
            delete debounceTimers[idGrupo];
        }
        const rutaArchivo = path.join(RUTAS.HISTORIALES, `${idGrupo}.json`);
        fs.writeFileSync(rutaArchivo, JSON.stringify(historialCache[idGrupo], null, 2), 'utf-8');
    }
}


module.exports = {
    initDirectories,
    cargarTodosLosHistoriales,
    getGrupo,
    setNombreGrupo,
    getUsuario,
    marcarCambios,
    forzarGuardadoSincrono,
    getAllGrupos
};
