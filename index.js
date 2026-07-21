require('dotenv').config();
const client = require('./src/bot/client');
const events = require('./src/bot/events');
const { initCronJobs } = require('./src/jobs/cron');
const db = require('./src/services/database');
const roles = require('./src/services/roles');
const rolplay = require('./src/services/rolplay');

// 1. INICIALIZACIÓN DE SERVICIOS
// (Inicialización delegada a events.js para evitar doble lectura)

// 2. PROTOCOLO DE APAGADO SEGURO
function forzarGuardadoAntesDeMorir() {
    db.forzarGuardadoSincrono();
    console.log('Base de datos guardada con éxito.');
}

process.on('exit', forzarGuardadoAntesDeMorir);
process.on('SIGINT', () => { forzarGuardadoAntesDeMorir(); process.exit(); });
process.on('SIGTERM', () => { forzarGuardadoAntesDeMorir(); process.exit(); });
process.on('uncaughtException', (err) => {
    console.error('\n💥 CRASHEO DETECTADO (uncaughtException):');
    
    // Imprime la traza completa si existe, o el error tal cual
    if (err && err.stack) {
        console.error(err.stack);
    } else {
        console.error(err);
    }

    forzarGuardadoAntesDeMorir();
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('\n💥 PROMESA RECHAZADA NO MANEJADA (unhandledRejection):');
    console.error(reason);
});
// 3. REGISTRO DE EVENTOS Y TAREAS
events.registerEvents(client);
initCronJobs(client);

// 4. INICIAR BOT
client.initialize();
