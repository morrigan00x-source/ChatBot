const fs = require('fs');
const path = require('path');
const { RUTAS, TIEMPOS } = require('../config/constants');

let rolesCache = {};
let controlAvisos = {
    fechaUltimoCorte: Date.now(),
    programaciones: []
};



function initRoles() {
    if (fs.existsSync(RUTAS.ROLES)) {
        try {
            const directorioBase = path.dirname(RUTAS.ROLES);
                if (!fs.existsSync(directorioBase)) {
                    fs.mkdirSync(directorioBase, { recursive: true });
                }
            rolesCache = JSON.parse(fs.readFileSync(RUTAS.ROLES, 'utf-8'));
        } catch(e) {
            rolesCache = {};
        }
    }
    if (fs.existsSync(RUTAS.ANUNCIOS)) {
        try {
            const directorioBase = path.dirname(RUTAS.ANUNCIOS);
                if (!fs.existsSync(directorioBase)) {
                    fs.mkdirSync(directorioBase, { recursive: true });
                }
            
            controlAvisos = JSON.parse(fs.readFileSync(RUTAS.ANUNCIOS, 'utf-8'))
            if (!controlAvisos.programaciones) {
                controlAvisos.programaciones = []
            }
        } catch(e) {
            // en caso de que se corrompa control avisos
            controlAvisos = {
                programaciones: []
            }
        }
    }
}

function guardarRoles() {
    const directorioBase = path.dirname(RUTAS.ROLES);
    if (!fs.existsSync(directorioBase)) {
        fs.mkdirSync(directorioBase, { recursive: true });
    }
    fs.writeFileSync(RUTAS.ROLES, JSON.stringify(rolesCache, null, 2), 'utf-8', (err) => {
         if (err) console.error("Error al guardar roles", err);
    });
}

function guardarAnuncios() {
    const directorioBase = path.dirname(RUTAS.ANUNCIOS);
    if (!fs.existsSync(directorioBase)) {
        fs.mkdirSync(directorioBase, { recursive: true });
    }
    fs.writeFileSync(RUTAS.ANUNCIOS, JSON.stringify(controlAvisos, null, 2), 'utf-8', (err) => {
        if (err) console.error("ERROR al guardar los anuncios", err);
    });
}


function asignarVocero(idUsuario, idGrupo, nombreVocero) {
    if (!rolesCache[idUsuario]) rolesCache[idUsuario] = { grupos: {} };
    if (!rolesCache[idUsuario].grupos) rolesCache[idUsuario].grupos = {}; // Compatibilidad con caché vieja
    
    rolesCache[idUsuario].grupos[idGrupo] = nombreVocero;
    guardarRoles();
    return true;
}

function revocarVocero(idUsuario, idGrupo) {
    if (rolesCache[idUsuario] && rolesCache[idUsuario].grupos && rolesCache[idUsuario].grupos[idGrupo]) {
        delete rolesCache[idUsuario].grupos[idGrupo];
        guardarRoles();
        return true;
    }
    return false;
}

function esVoceroEnGrupo(idUsuario, idGrupo) {
    if (!rolesCache[idUsuario] || !rolesCache[idUsuario].grupos) return false;
    return !!rolesCache[idUsuario].grupos[idGrupo];
}

function getNombreVocero(idUsuario, idGrupo) {
    if (!rolesCache[idUsuario] || !rolesCache[idUsuario].grupos) return null;
    return rolesCache[idUsuario].grupos[idGrupo] || null;
}

function generarIdAviso() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Registra un aviso programado en memoria.
 */
function programarAnuncio(idUsuario, idGrupo, contenido, diasDuracion) {
    const nombreVocero = getNombreVocero(idUsuario, idGrupo);
    if (!nombreVocero) return false;
    
    const idAviso = generarIdAviso();
    const fechaExpiracion = Date.now() + (diasDuracion * 24 * 60 * 60 * 1000);

    controlAvisos.programaciones.push({
        idAviso,
        idUsuario,
        nombreVocero,
        contenido,
        grupoDestino: idGrupo,
        fechaExpiracion
    });

    guardarAnuncios();
    return idAviso;
}

function obtenerAvisosDeUsuario(idUsuario) {
    return controlAvisos.programaciones.filter(p => p.idUsuario === idUsuario);
}

function eliminarAvisoProgramado(idAviso) {
    const inicial = controlAvisos.programaciones.length;
    controlAvisos.programaciones = controlAvisos.programaciones.filter(p => p.idAviso !== idAviso);
    guardarAnuncios();
    return controlAvisos.programaciones.length < inicial;
}

function limpiarAvisosExpirados() {
    const ahora = Date.now();
    controlAvisos.programaciones = controlAvisos.programaciones.filter(p => ahora < p.fechaExpiracion);
}

function getProgramaciones() {
    return controlAvisos.programaciones;
}

function getFechaUltimoCorte() {
    return controlAvisos.fechaUltimoCorte;
}

function setFechaUltimoCorte() {
    controlAvisos.fechaUltimoCorte = Date.now();
guardarAnuncios();
}




module.exports = {
    initRoles,
    asignarVocero,
    revocarVocero,
    esVoceroEnGrupo,
    getNombreVocero,
    programarAnuncio,
    obtenerAvisosDeUsuario,
    eliminarAvisoProgramado,
    limpiarAvisosExpirados,
    getProgramaciones,
    getFechaUltimoCorte,
    setFechaUltimoCorte
};
const fs = require('fs');
const path = require('path');
const { RUTAS, TIEMPOS } = require('../config/constants');

let rolesCache = {};
let controlAvisos = {
    fechaUltimoCorte: Date.now(),
    programaciones: []
};



function initRoles() {
    if (fs.existsSync(RUTAS.ROLES)) {
        try {
            const directorioBase = path.dirname(RUTAS.ROLES);
                if (!fs.existsSync(directorioBase)) {
                    fs.mkdirSync(directorioBase, { recursive: true });
                }
            rolesCache = JSON.parse(fs.readFileSync(RUTAS.ROLES, 'utf-8'));
        } catch(e) {
            rolesCache = {};
        }
    }
    if (fs.existsSync(RUTAS.ANUNCIOS)) {
        try {
            const directorioBase = path.dirname(RUTAS.ANUNCIOS);
                if (!fs.existsSync(directorioBase)) {
                    fs.mkdirSync(directorioBase, { recursive: true });
                }
            
            controlAvisos = JSON.parse(fs.readFileSync(RUTAS.ANUNCIOS, 'utf-8'))
            if (!controlAvisos.programaciones) {
                controlAvisos.programaciones = []
            }
        } catch(e) {
            // en caso de que se corrompa control avisos
            controlAvisos = {
                programaciones: []
            }
        }
    }
}

function guardarRoles() {
    const directorioBase = path.dirname(RUTAS.ROLES);
    if (!fs.existsSync(directorioBase)) {
        fs.mkdirSync(directorioBase, { recursive: true });
    }
    fs.writeFileSync(RUTAS.ROLES, JSON.stringify(rolesCache, null, 2), 'utf-8', (err) => {
         if (err) console.error("Error al guardar roles", err);
    });
}

function guardarAnuncios() {
    const directorioBase = path.dirname(RUTAS.ANUNCIOS);
    if (!fs.existsSync(directorioBase)) {
        fs.mkdirSync(directorioBase, { recursive: true });
    }
    fs.writeFileSync(RUTAS.ANUNCIOS, JSON.stringify(controlAvisos, null, 2), 'utf-8', (err) => {
        if (err) console.error("ERROR al guardar los anuncios", err);
    });
}


function asignarVocero(idUsuario, idGrupo, nombreVocero) {
    if (!rolesCache[idUsuario]) rolesCache[idUsuario] = { grupos: {} };
    if (!rolesCache[idUsuario].grupos) rolesCache[idUsuario].grupos = {}; // Compatibilidad con caché vieja
    
    rolesCache[idUsuario].grupos[idGrupo] = nombreVocero;
    guardarRoles();
    return true;
}

function revocarVocero(idUsuario, idGrupo) {
    if (rolesCache[idUsuario] && rolesCache[idUsuario].grupos && rolesCache[idUsuario].grupos[idGrupo]) {
        delete rolesCache[idUsuario].grupos[idGrupo];
        guardarRoles();
        return true;
    }
    return false;
}

function esVoceroEnGrupo(idUsuario, idGrupo) {
    if (!rolesCache[idUsuario] || !rolesCache[idUsuario].grupos) return false;
    return !!rolesCache[idUsuario].grupos[idGrupo];
}

function getNombreVocero(idUsuario, idGrupo) {
    if (!rolesCache[idUsuario] || !rolesCache[idUsuario].grupos) return null;
    return rolesCache[idUsuario].grupos[idGrupo] || null;
}

function generarIdAviso() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Registra un aviso programado en memoria.
 */
function programarAnuncio(idUsuario, idGrupo, contenido, diasDuracion) {
    const nombreVocero = getNombreVocero(idUsuario, idGrupo);
    if (!nombreVocero) return false;
    
    const idAviso = generarIdAviso();
    const fechaExpiracion = Date.now() + (diasDuracion * 24 * 60 * 60 * 1000);

    controlAvisos.programaciones.push({
        idAviso,
        idUsuario,
        nombreVocero,
        contenido,
        grupoDestino: idGrupo,
        fechaExpiracion
    });

    guardarAnuncios();
    return idAviso;
}

function obtenerAvisosDeUsuario(idUsuario) {
    return controlAvisos.programaciones.filter(p => p.idUsuario === idUsuario);
}

function eliminarAvisoProgramado(idAviso) {
    const inicial = controlAvisos.programaciones.length;
    controlAvisos.programaciones = controlAvisos.programaciones.filter(p => p.idAviso !== idAviso);
    guardarAnuncios();
    return controlAvisos.programaciones.length < inicial;
}

function limpiarAvisosExpirados() {
    const ahora = Date.now();
    controlAvisos.programaciones = controlAvisos.programaciones.filter(p => ahora < p.fechaExpiracion);
}

function getProgramaciones() {
    return controlAvisos.programaciones;
}

function getFechaUltimoCorte() {
    return controlAvisos.fechaUltimoCorte;
}

function setFechaUltimoCorte() {
    controlAvisos.fechaUltimoCorte = Date.now();
guardarAnuncios();
}




module.exports = {
    initRoles,
    asignarVocero,
    revocarVocero,
    esVoceroEnGrupo,
    getNombreVocero,
    programarAnuncio,
    obtenerAvisosDeUsuario,
    eliminarAvisoProgramado,
    limpiarAvisosExpirados,
    getProgramaciones,
    getFechaUltimoCorte,
    setFechaUltimoCorte
};
