const path = require('path');

module.exports = {
    RUTAS: {
        //SHELL: path.join(__dirname, '..', '..', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'), //para windows
        //SHELL: path.join(__dirname, '..', '..', 'chrome-headless-shell-linux64', 'chrome-headless-shell'), //para linux
        HISTORIALES: path.join(__dirname, '..', '..', 'historial_chats'),
        EVIDENCIAS: path.join(__dirname, '..', '..', 'evidencias_moderacion'),
        ROLES: path.join(__dirname, '..', '..', 'GESTION', 'roles.json'), // le quite el .json por si no jala
        ANUNCIOS: path.join(__dirname, '..', '..', 'GESTION', 'anuncios.json'), // le quite el .json por si no jala
        ROLERPLAY: path.join(__dirname,'..', '..', 'ROLPLAY', 'personajes.json') // le quite el .json por si no jala
    },
    BOT_JID: '', // Se llenará al iniciar el cliente
    TIEMPOS: {
        SEMANA_MS: 7 * 24 * 60 * 60 * 1000,
        ANUNCIO_RECURRENTE_MS: 3 * 60 * 60 * 1000, // 3 horas
        CORTE_DIARIO_MS: 24 * 60 * 60 * 1000
    }
};
