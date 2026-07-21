// leer el archivo de personajes y precargar una cache
const fs = require('fs');
const path = require('path');
const { RUTAS } = require('../config/constants');

const db = require('../services/database');
const gemini = require('../services/gemini');
const roles = require('../services/roles');

let rPlayCache = { id: "ROLERPLAY", personajes: {} };
let personajesRP = {};

function initDirectories() {
    const directorioBase = path.dirname(RUTAS.ROLERPLAY);
    if (!fs.existsSync(directorioBase)) {
        fs.mkdirSync(directorioBase, { recursive: true });
    }    
}

async function cargarRolesGames() {
    initDirectories();

    try {
        // CORRECCIÓN 3: Leemos el archivo directamente en vez de iterarlo como directorio
        if (fs.existsSync(RUTAS.ROLERPLAY)) {
            const contenido = fs.readFileSync(RUTAS.ROLERPLAY, 'utf-8');
            const data = JSON.parse(contenido);

            if (data && data.personajes) {
                rPlayCache = data;
                personajesRP = data.personajes;
            }
        }
    } catch (e) {
        console.error(`[Rolplay] Error al cargar la caché (se creará una nueva): ${e.message}`);
    }
}

// si no existe el archi crearlos
async function marcarCambios() {
    try {
        rPlayCache.personajes = personajesRP;
        // CORRECCIÓN 4: writeFileSync no lleva "await" (es síncrono) y ahora apunta correctamente
        fs.writeFileSync(RUTAS.ROLERPLAY, JSON.stringify(rPlayCache, null, 2), 'utf-8');
        console.log(`[Rolplay] Archivo de personajes actualizado con éxito en el disco.`);
    } catch (e) {
        console.error(`[Rolplay] Error crítico al guardar en disco: ${e.message}`);
    }
}
// buscar el personaje o estereotipo y extraer (capacidad de sinonimos, para un mismo personaje) 
async function getPersonaje(tipo, infoExtra) {
    if (!personajesRP[tipo]) {
        console.log(`[Rolplay] Personaje "${tipo}" no existe. Generando cerebro en Gemini...`);
       
        // Esperamos a que Gemini cree la personalidad
        const nuevoPersonaje = await gemini.generatePersonaje(tipo, infoExtra);

        // Si por alguna razón Gemini falla, devolvemos un error y evitamos el Crash 400
        if (!nuevoPersonaje || nuevoPersonaje.includes('⚠️')) {
            console.error('[Rolplay] Gemini no pudo generar al personaje.');
            return "Eres un bot de emergencia. Hubo un error de conexión al cargar tu cerebro.";
        }
       
       await setPersonaje(tipo, nuevoPersonaje);
    } else{
    console.log(`[Rolplay] Personaje "${tipo}" encontrado en la cache.`);
}
    return personajesRP[tipo];
}

async function setPersonaje(tipo, personaje) {
    personajesRP[tipo] = personaje
    const sinonimos = await gemini.sinonimos(tipo, personaje);
   if (Array.isArray(sinonimos)) {
        for (const sinonimo of sinonimos) {
            personajesRP[sinonimo] = personaje;
        }
    }
    console.log(`[Rolplay] Personaje "${tipo}" guardado con éxito en la caché y en el archivo de personajes.`);
    await marcarCambios();
}

async function conversacionRolplay(idGrupo, tipo, infoExtra) {
    console.log(`[Rolplay] Iniciando conversación de rolplay en el grupo ${idGrupo} con el personaje "${tipo}".`);
    
    const personaje = await getPersonaje(tipo, infoExtra);
    const historial = await db.getGrupo(idGrupo);
    
    const contexto = historial.mensajes.slice(-15).map(m => {
            const horaStr = new Date(m.fecha * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            const remitente = m.id === "sistema" ? "sistema (tú)" : m.id;
            return `[${horaStr}] ${remitente}: ${m.msg}`;
        }
        ).join(`\n`);
    
        if (!contexto || contexto.trim() === "") {
        contexto = "[El chat acaba de iniciar. Reacciona de forma natural a este nuevo comienzo.]";
    }

    const mensajes = await gemini.respuestasRolplay(personaje, contexto);
    return mensajes || [];
}


// generar y guardar el rol en un archivo de roles




//con la comunicacion de eventos mandar mensajes respuesta dependiendo el personaje
// posibles sub modulos dentro:
// crear json o solo mandarlo todo en un {}, para la persistencia, no se yo, maybe una bandera 


module.exports = {
    initDirectories,
    conversacionRolplay,
    cargarRolesGames
}