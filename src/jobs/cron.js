const constants = require('../config/constants');
const db = require('../services/database');
const roles = require('../services/roles');
const gemini = require('../services/gemini');

let temporizadorGlobal = Date.now();

function initCronJobs(client) {
    setInterval(async () => {
        const tiempoTranscurrido = Date.now() - temporizadorGlobal;
        if (new Date().getHours() <= 23 && new Date().getHours() >= constants.TIEMPOS.CORTE_DIARIO_MS){ // lo cambiaremos para que sea al minuto constants.TIEMPOS.CORTE_DIARIO_MS
            const grupos = db.getAllGrupos();
            console.log(`se activo el anuncio cada 24h`)
            for (const idGrupo of grupos) {
                const info = db.getGrupo(idGrupo);
                if (info.mensajes && info.mensajes.length > 0) {
                    const resumenDiario = await gemini.generarResumenConGemini(info.mensajes);
                    try {
                        await client.sendMessage(idGrupo, `*RESUMEN DIARIO - ${info.nombreActual}*\n\n${resumenDiario}`);
                    } catch(e) {}
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                // Mantenemos los ultimos 30 mensajes como colchon
                info.mensajes = info.mensajes.slice(-30);
            }
            db.marcarCambios();
            temporizadorGlobal = Date.now();
            console.log('ciclo diario completado. RAM liberada y JSONs reseteados.');
        }
    }, 60000*60*4); // 1 min

    setInterval(async () => {
        console.log(`se activo el cron de anuncios`)
        roles.limpiarAvisosExpirados();
        const ahora = Date.now();
        const anuncios = roles.getProgramaciones();
        const fechaUltimoCorte = roles.getFechaUltimoCorte();
        if (3* 60 * 60 * 1000 <= ahora - fechaUltimoCorte && new Date().getHours() < 24 && new Date().getHours() >= 7){ 
            for (const anuncio of anuncios) {
                try {
                    await client.sendMessage(anuncio.grupoDestino, `*Aviso programado de ${anuncio.nombreVocero}:*\n\n${anuncio.contenido}`);
                } catch(e) {
                    console.error(`❌ Error al enviar anuncio ${anuncio.grupoDestino}`);
                }

            }
        }
        roles.setFechaUltimoCorte();
    }, 60000*5); // 1 min
}
module.exports = { initCronJobs };