﻿const qrcode = require('qrcode-terminal');
const db = require('../services/database');
const moderation = require('../services/moderation');
const roles = require('../services/roles');
const gemini = require('../services/gemini');
const roleplay = require('../services/rolplay');
const fs = require('fs');
const path = require('path');
const { RUTAS } = require('../config/constants');


function registerEvents(client) {
    // 1. Evento para pintar el código QR si la sesión expiró o es nueva
    client.on('qr', (qr) => {
        console.log('Escanea este código QR con tu WhatsApp para iniciar sesión:');
        qrcode.generate(qr, { small: true });
    });

    // 2. Evento cuando el bot ya se conectó e inició sesión con éxito
    client.on('ready', () => {
        console.log('Bot activo, escuchando chats...');
        db.cargarTodosLosHistoriales();
        roles.initRoles();
        roleplay.initDirectories();
        roleplay.cargarRolesGames();
    });
    let chatsBloqueados = {};

    // 3. Evento que captura todos los mensajes nuevos del chat
    client.on('message_create', async (msg) => {
        let chat;
        try {
            chat = await msg.getChat(); // O client.getChatById(msg.from)
        } catch (err) {
            console.warn(`⚠️ No se pudo obtener el chat para ${msg.from}:`, err.message || err);
            return; // Ignoramos este mensaje para que no rompa la ejecución del bot
        }
        const args = msg.body ? msg.body.trim().split(' ') : [];
        const comando = args[0];
        const idChat = msg.fromMe ? msg.to : msg.from;

        const infoChat = db.getGrupo(idChat);
        let mensajes = [];
        const banderaRolplay = infoChat.banderaRolplay;
        if (chatsBloqueados[idChat] === undefined) {
            chatsBloqueados[idChat] = false;
        }


        const idRemitente = msg.fromMe ? (msg.author) : (msg.author || msg.from);


        // =========================================================
        // COMANDOS DE ROLPLAY
        // =========================================================

        // Mensajes ordinarios (No empiezan con '!')!comando.startsWith('!')
        if (infoChat.nombreActual !== 'Grupo Desconocido') { // bandera o busqueda?        
            if (msg.type === 'sticker') {
                const nuevoMensaje = {
                    id: idRemitente,
                    msg: `Sticker recibido`,
                    fecha: msg.timestamp
                };
                infoChat.mensajes.push(nuevoMensaje);
                db.marcarCambios(idChat);
            }
            else if (msg.hasMedia) {//analisis de archivos distintos a texto simple
                try {
                    const media = msg.downloadMedia().then(async (med) => {
                        if (!med) {
                            console.log(`Archivo corrputo o indescargable ${msg.body}, ${msg.from}`)
                            await client.sendMessage(msg.fromMe, `No se pudo descargar el archivo del grupo ${chat.name}`)
                            const nuevoMensaje = {
                                id: idRemitente,
                                msg: `Archivo no se pudo descargar`,
                                fecha: msg.timestamp
                            };
                            infoChat.mensajes.push(nuevoMensaje);
                            db.marcarCambios(idChat);

                        }
                        const historial = db.getGrupo(idChat);
                        const timestampD = msg.timestamp;

                        const resumenArch = gemini.analizarArchi(med)
                        const indice = historial.mensajes.findIndex(m => m.fecha >= timestampD)
                        if (!(indice === ``)) {
                            const mensaje = {
                                id: idRemitente,
                                msg: resumenArch,
                                fecha: msg.timestamp
                            }
                            if (indice === -1) {
                                historial.mensajes.push(mensaje)
                            } else {
                                historial.mensajes.splice(indice, 0, mensaje)
                            }

                            infoChat.mensajes = historial.mensajes
                            db.marcarCambios(idChat)
                            console.log(`El archivo ${med.filename} del grupo ${idChat} se resumio correctamente`)
                        }
                    });
                } catch (e) {
                    console.log(`Error al procesar archivo: ${e}`)
                    return;
                }

            }
            else if (!comando.startsWith('!') && !(comando === ``) && !msg.hasMedia && !(comando.startsWith(`*RESUMEN DIARIO`) || comando.startsWith(`*Aviso programado`) || comando.startsWith(`Generando resumen`))) {
                // Estructura limpia para almacenar en el historial JSON
                const nuevoMensaje = {
                    id: msg.fromMe ? (infoChat.banderaRolplay ? (msg.body.startsWith(`human:`) ? idRemitente : '  [PERSONAJE ROLEPLAY]') : idRemitente) : idRemitente,
                    msg: msg.body,
                    fecha: msg.timestamp
                };

                infoChat.mensajes.push(nuevoMensaje);

                console.log(`[Mensaje Recibido] Grupo: ${infoChat.nombreActual || idChat} | De: ${idRemitente} | Texto: "${msg.body}"`);

                db.marcarCambios(idChat);
            }

        }
        if (banderaRolplay && chatsBloqueados[idChat] !== true) {
            chatsBloqueados[idChat] = true;

            try {
                // Usamos la variable local limpia para que no choque con los comandos de abajo
                mensajes = await roleplay.conversacionRolplay(idChat, infoChat.rol, ``);

                for (const mensaje of mensajes) {
                    await client.sendMessage(idChat, mensaje);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                console.error(`[Error Fatal Rolplay] Rompió en el chat ${idChat}:`, error);
            } finally {
                // CORRECCIÓN 3: El bloque finally asegura que el candado se libere 
                // pase lo que pase, evitando que el bot se quede mudo si Gemini falla.
                chatsBloqueados[idChat] = false;
            }
        }


        // =========================================================
        // COMANDOS GLOBALES
        // =========================================================
        if (comando === '!roleplay' && args.length > 1) {
            const tipo = args[1];
            //console.log(`[Rolplay] Comando !roleplay recibido en el grupo ${idChat} con el personaje "${tipo}".`);
            const infoExtra = args.slice(2).join(' '); // Información adicional opcional
            //console.log(`[Rolplay] Información adicional recibida: "${infoExtra}"`);
            mensajes = await roleplay.conversacionRolplay(idChat, tipo, infoExtra);
            for (const mensaje of mensajes) {
                await client.sendMessage(idChat, mensaje);
                console.log(`[Rolplay] Mensaje enviado al grupo ${idChat}: "${mensaje}"`);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            infoChat.banderaRolplay = true;
            infoChat.rol = tipo;
            db.marcarCambios(idChat);
            return;
        }

        if (comando === '!roleplay_off') {
            infoChat.banderaRolplay = false;
            infoChat.rol = "";
            await client.sendMessage(idChat, "Modo rolplay desactivado.");
            return;
        }
        // =========================================================
        // CONTEXTO DE CHAT GRUPAL (chat.isGroup === true)
        // =========================================================

        if (chat.isGroup) {
            console.log(`[Mensaje Recibido] Del grupo: ${infoChat.nombreActual || idChat} | De: ${msg.author || msg.from} | Texto: "${msg.body}"`);

            // Si es un grupo nuevo, se registra y guarda de inmediato para debug
            if (infoChat.nombreActual === 'Grupo Desconocido' && msg.body === '!SuperBot_init') {
                db.setNombreGrupo(idChat, chat.name);
                const rutaArchivo = path.join(RUTAS.HISTORIALES, `${idChat}.json`);
                // Forzamos la escritura inicial para que el debugger lo detecte
                fs.writeFileSync(rutaArchivo, JSON.stringify(db.getGrupo(idChat), null, 2), 'utf-8');
                console.log(`[Sistema] Grupo nuevo ${chat.name} (${idChat}) detectado y registrado.`);
            }


            if (infoChat.nombreActual !== 'Grupo Desconocido') {
                if (comando === '!resumir-ya') {
                    console.log(`comando resumir ya recibido en grupo ${idChat}`);
                    if (infoChat.mensajes && infoChat.mensajes.length > 0) {
                        await client.sendMessage(idChat, "Generando resumen, por favor espera...");
                        const resumen = await gemini.generarResumenConGemini(infoChat.mensajes);
                        if (resumen != `VACÍO`)
                            await client.sendMessage(idChat, resumen);
                        console.log(`[Resumen Enviado] Se ha mandado el resumen al grupo: ${idChat}`);
                    }
                    return;
                }

                if (comando === `!id`) {
                    await client.sendMessage(idChat, idChat)
                }
            }

            // =========================================================
            // SUITE DE COMANDOS DE PRUEBA E INYECCIÓN DE DATOS
            // =========================================================

            if (comando === '!test-flujo-vacio') {
                const rafaga = ['hola', 'jajaja', 'ok', 'xd', 'lol', 'buen dia', 'simon', 'ya', 'no se', 'x2'];
                const timestamp = Math.floor(Date.now() / 1000);

                rafaga.forEach((texto, index) => {
                    infoChat.mensajes.push({ id: 'tester_vacio@c.us', msg: texto, fecha: timestamp + index });
                });

                console.log('[TEST FLUJO VACÍO] Generando resumen con Gemini de los mensajes en RAM...');
                const resumen = await gemini.generarResumenConGemini(infoChat.mensajes);
                await client.sendMessage(idChat, resumen);
                console.log('[TEST FLUJO VACÍO] Resultado Gemini enviado al grupo.');
                return;
            }

            if (comando === '!test-moderacion-full') {
                const testUserId = 'test_user_mod@c.us';
                const contextoFalso = ['mensaje previo normal 1', 'mensaje previo normal 2'];

                console.log('[TEST MODERACIÓN] Simulando 4 infracciones en el mismo segundo...');
                for (let i = 1; i <= 4; i++) {
                    moderation.registrarInfraccion(idChat, testUserId, `Insulto de prueba simulado`, contextoFalso);
                }
                return;
            }

            if (comando === '!test-sharding-aislado') {
                const idFalso = '99999@g.us';
                const grupoFalso = db.getGrupo(idFalso);
                for (let i = 1; i <= 5; i++) {
                    grupoFalso.mensajes.push({ id: 'tester_sharding@c.us', msg: `Mensaje estructurado test`, fecha: Math.floor(Date.now() / 1000) });
                }
                db.marcarCambios(idFalso);
                console.log('[TEST SHARDING] Grupo aislado "99999@g.us" inyectado en RAM y marcado en el debounce para persistencia física.');
                return;
            }


        } else {
            // =========================================================
            // CONTEXTO DE CHAT PRIVADO (chat.isGroup === false)
            // =========================================================
            console.log(`[Mensaje Recibido] De: ${idRemitente} | Texto: "${msg.body}", {chatName: ${chat.name || 'Privado'}, chatId: ${idChat}}`);

            if (infoChat.nombreActual === 'Grupo Desconocido' && msg.body === '!SuperBot_init') {
                db.setNombreGrupo(idChat, chat.name);
                const rutaArchivo = path.join(RUTAS.HISTORIALES, `${idChat}.json`);
                // Forzamos la escritura inicial para que el debugger lo detecte
                fs.writeFileSync(rutaArchivo, JSON.stringify(db.getGrupo(idChat), null, 2), 'utf-8');
                console.log(`[Sistema] Chat nuevo ${chat.name} (${idChat}) detectado y registrado.`);
            }

            if (comando === `!id`) {
                await client.sendMessage(msg.from, `Tu ID: ${msg.to} \nChat ID: ${msg.from}`)
            }
            if (comando === '!vocero' && args.length >= 3 && msg.fromMe) {
                const targetGrupo = args[1];
                // simple validacion para que no crashee
                if (!targetGrupo.includes('@')) return;
                const nombreVocero = args.slice(2).join(' ');
                roles.asignarVocero(msg.to, targetGrupo, nombreVocero);
                await client.sendMessage(msg.to, `Ahora eres un vocero en el grupo ${targetGrupo}`);
                return;
            }
            //para eliminar a un vocero
            if (comando === '!eliminar-vocero' && args.length >= 2 && msg.fromMe) {
                const targetGrupo = args[1];
                const eliminado = roles.revocarVocero(msg.to, targetGrupo);
                if (eliminado) {
                    await client.sendMessage(msg.to, `Ahora no eres un vocero en el grupo ${targetGrupo}`);
                } else {
                    await client.sendMessage(msg.to, `No eres un vocero en el grupo ${targetGrupo}`);
                }
            }

            if (comando === '!aviso' && args.length >= 4) {
                client.sendMessage(msg.to, `se programo el aviso: ${args.slice(3).join(' ')}`)
                const idChat = args[1];
                const diasDuracion = parseInt(args[2], 10);
                const contenido = args.slice(3).join(' ');

                const nombreVocero = roles.getNombreVocero(msg.from, idChat);
                if (nombreVocero) {
                    roles.programarAnuncio(msg.from, idChat, contenido, diasDuracion);
                }
                return;
            }

            if (comando === '!eliminar-aviso' && args.length >= 2) {
                const idAviso = args[1];
                const eliminado = roles.eliminarAvisoProgramado(idAviso);

                await client.sendMessage(msg.to, `aviso eliminado: ${idAviso}`)
            }

            //obtener id del aviso
            if (comando === '!id-avisos' && args.length === 1) {
                const idUsuario = msg.from;
                const avisos = roles.obtenerAvisosDeUsuario(idUsuario);
                console.log(`entro a avisos id`)
                if (avisos.length > 0) {
                    for (const aviso of avisos) {
                        await client.sendMessage(msg.to, `id del aviso: ${aviso.idAviso}, contenido: ${aviso.contenido}`)
                    }
                }
                else {
                    await client.sendMessage(msg.to, `no hay avisos programados`)
                }

            }

            //rol mode hehehe
            if (comando === '!rol-mode' && args.length > 1) {

            }
        }
    });
}

module.exports = { registerEvents };