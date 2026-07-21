const fs = require('fs');
const path = require('path');
const db = require('./database');
const { RUTAS, TIEMPOS } = require('../config/constants');

/**
 * Revisa si el periodo de penalización de un infractor ha expirado.
 * @param {string} idGrupo 
 * @param {string} idUsuario 
 * @returns {boolean} True si se limpió la penalización.
 */
function revisarCooldown(idGrupo, idUsuario) {
    const usuario = db.getUsuario(idGrupo, idUsuario);
    if (usuario.cooldownReset && Date.now() >= usuario.cooldownReset) {
        // Expiró el cooldown, limpiamos las incidencias
        usuario.incidencias = 0;
        usuario.prioridadContexto = false;
        usuario.semanasPenalizacion = 0;
        usuario.cooldownReset = null;
        db.marcarCambios(idGrupo);
        return true; 
    }
    return false;
}

/**
 * Registra una infracción para un usuario, aumentando la penalización
 * de manera matemática y generando evidencias si es reincidente (>=3).
 * @param {string} idGrupo 
 * @param {string} idUsuario 
 * @param {string} mensajeOfensivo 
 * @param {Array} contextoMensajes 
 */
function registrarInfraccion(idGrupo, idUsuario, mensajeOfensivo, contextoMensajes = []) {
    // 1. Revisar si el cooldown anterior ya expiró, para resetearlo si es el caso
    revisarCooldown(idGrupo, idUsuario);
    
    const usuario = db.getUsuario(idGrupo, idUsuario);
    
    // 2. Aumentar incidencias
    usuario.incidencias += 1;
    usuario.prioridadContexto = true;
    
    // 3. Algoritmo Matemático: [Número de Incidencias] semanas
    // Si comete otra infracción en medio del cooldown, el timer se reinicia desde cero.
    usuario.semanasPenalizacion = usuario.incidencias;
    const tiempoPenalizacionMs = usuario.semanasPenalizacion * TIEMPOS.SEMANA_MS;
    usuario.cooldownReset = Date.now() + tiempoPenalizacionMs;
    
    db.marcarCambios(idGrupo);

    // 4. Generación de Evidencia inmutable (a partir de 3ra incidencia)
    if (usuario.incidencias >= 3) {
        guardarEvidencia(idUsuario, idGrupo, mensajeOfensivo, contextoMensajes, usuario.incidencias);
    }

    return usuario;
}

function guardarEvidencia(idUsuario, idGrupo, mensajeOfensivo, contextoMensajes, numIncidencia) {
    // Limpiamos el ID del usuario para el nombre del archivo
    const cleanId = idUsuario.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `EV_${cleanId}.json`;
    const filePath = path.join(RUTAS.EVIDENCIAS, fileName);
    
    let evidenciaDb = [];
    if (fs.existsSync(filePath)) {
        try {
            evidenciaDb = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch(e) {
            evidenciaDb = [];
        }
    }

    evidenciaDb.push({
        fecha: new Date().toISOString(),
        grupo: idGrupo,
        incidencia: numIncidencia,
        mensajeOfensivo: mensajeOfensivo,
        contextoPrevio: contextoMensajes.slice(-5) // Guardar últimos 5 mensajes de contexto
    });

    fs.writeFile(filePath, JSON.stringify(evidenciaDb, null, 2), 'utf-8', (err) => {
        if (err) console.error(`❌ Error al guardar evidencia de ${idUsuario}:`, err);
    });
}

module.exports = {
    registrarInfraccion,
    revisarCooldown
};
