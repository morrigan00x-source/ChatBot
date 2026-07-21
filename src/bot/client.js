const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const constants = require('../config/constants'); // Está perfecto que importes tus constantes aquí si las usas

const client = new Client({
    // Le damos un nombre a la sesión para evitar corrupción de carpetas
    authStrategy: new LocalAuth({ clientId: 'bot-principal' }),
    
    // ESTO ES VITAL: Fuerza a usar una versión estable de WhatsApp Web para que no se rompa con las actualizaciones
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    
    puppeteer: {
        headless: true,
        protocolTimeout: 300000, // <-- ESTO DA 5 MINUTOS DE TIEMPO DE ESPERA
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', 
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));

module.exports = client;