const { GoogleGenAI } = require('@google/genai');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

const projectId = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_REGION;

console.log("DEBUG: Proyecto cargado:", projectId);

// LA INICIALIZACIÓN OFICIAL REQUERIDA PARA GCP EN EL NUEVO SDK:
const ai = new GoogleGenAI({
    enterprise: true,     // <-- Esto le ordena usar Vertex AI/GCP en vez de AI Studio
    project: projectId,   // <-- Tu ID de proyecto en la raíz
    location: location    // <-- Tu región en la raíz
});

const storage = new Storage({ projectId: projectId });
const bucketName = process.env.GCP_BUCKET_NAME;

// 2. Escudos morales al mínimo (La nueva sintaxis del SDK)
const escudosAbajo = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
];

// 3. Sistema de protección de RAM y peticiones (Cola)
class RequestQueue {
    constructor(delayMs) {
        this.queue = [];
        this.isProcessing = false;
        this.delayMs = delayMs;
    }
    
    async add(requestFn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ requestFn, resolve, reject });
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }
        this.isProcessing = true;
        const { requestFn, resolve, reject } = this.queue.shift();

        try {
            const result = await requestFn();
            resolve(result);
        } catch (error) {
            reject(error);
        }
        setTimeout(() => this.processQueue(), this.delayMs);
    }
}

const geminiQueue = new RequestQueue(400);

// ==========================================
// FUNCIONES CON EL NUEVO SDK Y MODELOS ASIGNADOS
// ==========================================

async function analizarArchi(media) {
    let fileName = `temp_media_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const fileRef = storage.bucket(bucketName).file(fileName);

    try {
        const promptArchi = `Actúas como un motor de extracción sintética y mapeo conceptual para un entorno universitario. Tu único objetivo es procesar el archivo adjunto y reducirlo a su esencia estructural más básica. No seas exhaustivo; extrae únicamente el contexto elemental y las ideas principales de alta relevancia para ahorrar tokens.

REGLA DE FORMATO ESTRICTA:
La primera línea de tu respuesta DEBE ser obligatoriamente un encabezado estructurado que indique el tipo de archivo y la acción principal, usando este formato exacto:
[TIPO DE ARCHIVO | TIPO DE ACCIÓN]
Ejemplos válidos: [FOTO | DESCRIPCIÓN VISUAL], [AUDIO | TRANSCRIPCIÓN], [DOCUMENTO | EXTRACCIÓN DE TEXTO], [EXCEL | RECABADO DE DATOS].

REGLAS DE ANÁLISIS COMPACTO POR MEDIO (Aplica la que corresponda al archivo):

1. IMÁGENES Y FOTOS:
- Identifica el tipo en una frase (ej. "Fotografía casual", "Pizarrón de clase").
- Si hay personas: Describe solo la situación general (quiénes están y qué hacen a grandes rasgos).
- Si es material académico (pizarrones, diagramas de óptica, circuitos, oscilaciones): No transcribas todo; solo nombra los temas de las ecuaciones visibles, las variables principales o el propósito del esquema.

2. VIDEOS:
- Resume en un párrafo corto la situación visual, los sujetos y el entorno general.
- Si es académico: Enlista de 3 a 5 puntos clave de los temas explicados o resultados del experimento, omitiendo detalles secundarios.

3. DOCUMENTOS Y TEXTOS (PDF, Word, Presentaciones):
- Genera un resumen ejecutivo de máximo 2 párrafos indicando el objetivo del documento.
- Extrae únicamente "Datos Críticos de Alta Relevancia": temarios generales, fechas límite, tareas, lineamientos obligatorios de laboratorio u oficios institucionales. Ignora introducciones y explicaciones largas.

4. HOJAS DE CÁLCULO Y TABLAS (Excel, CSV, Imágenes de tablas):
- Define el propósito general de la tabla en una sola oración.
- Lista únicamente el nombre de las columnas principales, las métricas clave del resumen (como totales o promedios generales) y, si los hay, datos atípicos o errores evidentes.

5. AUDIOS (Notas de voz):
- No transcribas palabra por palabra. Genera un resumen compacto (estilo minuta) que condense las ideas principales, acuerdos, preguntas hechas y las conclusiones del hablante.`;
        
        let base64Puro = media.data;
        if (base64Puro.includes(',')) base64Puro = base64Puro.split(',')[1];
        let mimeTypeLimpio = media.mimetype ? media.mimetype.split(';')[0].trim() : 'application/octet-stream';

        console.log(`[Storage] Subiendo archivo (${mimeTypeLimpio})...`);
        const buffer = Buffer.from(base64Puro, 'base64');
        await fileRef.save(buffer, { contentType: mimeTypeLimpio });

        const gsUri = `gs://${bucketName}/${fileName}`;
        console.log(`[Vertex AI] Analizando archivo desde URI: ${gsUri}`);

        // Usamos PRO para OCR profundo y PDFs largos
        const response = await geminiQueue.add(() => ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: promptArchi },
                        { fileData: { mimeType: mimeTypeLimpio, fileUri: gsUri } }
                    ]
                }
            ],
            config: { safetySettings: escudosAbajo }
        }));
        
        console.log(`[Vertex AI] ¡Extracción completada con éxito!`);
        return response.text || '⚠️ [No se pudo generar texto del archivo]';

    } catch (error) {
        console.error('Error crítico en analizarArchi:', error.message);
        return `❌ [Error procesando archivo: ${error.message}]`;
    } finally {
        try {
            const exists = await fileRef.exists();
            if (exists[0]) {
                await fileRef.delete();
                console.log(`[Storage] Archivo temporal eliminado: ${fileName}`);
            }
        } catch (cleanupError) {
            console.error(`[Storage] Error al borrar temporal:`, cleanupError.message);
        }
    }
}

async function generarResumenConGemini(mensajesAcumulados) {
    try {
        const lineasDeTexto = mensajesAcumulados.map(m => {
            const horaStr = new Date(m.fecha * 1000).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            return `[${horaStr}] ${m.id}: ${m.msg}`;
        }).join(`\n`);

        const promptBloque = `Actúas como un sintetizador visual y curador de información para un grupo escolar universitario de WhatsApp. Tu objetivo es transformar un fragmento de chat caótico en un resumen ejecutivo ultra-atractivo, dinámico y fácil de leer (máximo media página). Usa una estructura limpia, negritas estratégicas y emoticonos (tanto emojis modernos como kaomojis/retro estilo ^^, u_u, ʘ‿ʘ) para captar la atención del lector.

[REGLA DE EXTENSIÓN: Si el chat contiene un exceso extraordinario de datos ultra-críticos donde resumir destructivamente causaría un problema académico, puedes extender la longitud, pero mantén la brevedad como prioridad].

Reglas estrictas de procesamiento:

1. FILTRO DE RUIDO ABSOLUTO:
- Elimina saludos, confirmaciones cortas ("ok", "x2", "sip"), stickers, spam y bromas. Quédate solo con el núcleo de la información.

2. ESENCIA DEL CONTEXTO (¿Qué ha pasado?):
- Sintetiza de qué se habló en general, qué acuerdos se tomaron y las ideas más relevantes del día.
- Si hubo un debate o discusión, no pongas todo el diálogo; resume en una o dos líneas las propuestas principales y la conclusión final.

3. ALERTA DE ARCHIVOS Y DOCUMENTOS (Muy Importante):
- Si en el chat se subió, mencionó o discutió un archivo (PDF, Word, Excel, etc.), debes señalarlo explícitamente en su sección usando este formato: 📄 *"[nombre_del_archivo.extension]"* seguido de una breve nota de 1 línea con su información crítica, datos o fechas clave asociadas. Añade al final la frase: "(Ver archivo para más información)".

4. DATOS CRÍTICOS INQUEBRANTABLES:
- Resalta con *negritas* y emojis de alerta todas las fechas de entrega, tareas, anuncios institucionales, salas de examen, ligas de reunión o métricas importantes.

5. CLÁUSULA DE ESCAPE:
- Si todo el fragmento es charla casual, quejas sin sustancia o ruido sin valor académico real, responde única y exactamente con la palabra: VACÍO.

Fragmento a procesar:
${lineasDeTexto}`;
        console.log(`[Vertex AI] Generando resumen...`);

        // Usamos FLASH para leer mucho texto rápido y barato
        const response = await geminiQueue.add(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptBloque,
            config: { safetySettings: escudosAbajo }
        }));

        const textoGenerado = response.text;
        return textoGenerado;
    } catch (error) {
        console.error("Error en generarResumenConGemini:", error);
        return 'Error interno al generar resumen.';
    }
}

async function sinonimos(tipo, personaje) {
    try {
        console.log(`[Vertex AI] Generando sinonimos para el personaje "${tipo}"...`);
        const promptBloque = `Actúas como un experto en configuración de bots. Mi objetivo es crear una lista concisa de 'etiquetas de invocación' (triggers) para un personaje de Roleplay.

Te daré el nombre del personaje y su "cerebro" (personalidad). Tu tarea es extraer e inferir los alias, apodos y arquetipos MÁS COMUNES para invocarlo.

REGLAS ESTRICTAS Y ABSOLUTAS:

Límite estricto: Genera MÁXIMO 30 etiquetas (solo las más lógicas y probables).

Formato de espacios: Si una etiqueta tiene más de una palabra, DEBES reemplazar los espacios con un guion bajo (_). Por ejemplo, en lugar de homura akemi debes escribir homura_akemi.

Devuelve ÚNICAMENTE las etiquetas. Cero introducciones, cero explicaciones y cero viñetas.

Todo el texto DEBE estar en minúsculas.

Separa cada etiqueta EXACTAMENTE con una coma y un espacio (, ).

DATOS DEL PERSONAJE:

Nombre: [${tipo}]

Cerebro: [${personaje}]`;

        // Usamos FLASH para tareas lógicas simples
        const response = await geminiQueue.add(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptBloque,
            config: { safetySettings: escudosAbajo }
        }));
        
        return response.text.split(', ').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } catch (error) {
        console.error(`[Vertex AI] Error al generar etiquetas:`, error);
        return [];
    }
}

async function respuestasRolplay(personaje, contexto) {
    try {
        console.log(`[Vertex AI] Generando respuesta de Roleplay...`);
        
        // Usamos FLASH para mantener la fluidez en el chat, e inyectamos el cerebro en systemInstruction
        const response = await geminiQueue.add(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contexto, 
            config: {
                safetySettings: escudosAbajo,
                systemInstruction: personaje
            }
        }));
        
        return response.text.split('|||').map(msg => msg.trim()).filter(msg => msg.length > 0);
    } catch (error) {
        console.error(`[Vertex AI] Error al generar respuestas Rolplay:`, error);
        return [];
    }
}

async function generatePersonaje(tipo, infoExtra) {
    try {
        console.log(`[Vertex AI] Cristalizando perfil psicológico para "${tipo}"...`);
        const promptBloque =  `Actúas como un Ingeniero de Prompts de élite, especializado en la cristalización de perfiles psicológicos profundos, realistas y descarnados para LLMs. Tu objetivo es generar una 'Instrucción de Sistema' (System Prompt) exhaustiva de altísima fidelidad para un personaje de Roleplay en WhatsApp.

El resultado debe ser entregado en texto plano estructurado con encabezados Markdown (#), optimizado para que una IA lo asimile al instante. No incluyas introducciones ni despedidas, solo el texto del cerebro.

DEBES INCLUIR LAS SIGUIENTES SECCIONES:

# IDENTIDAD Y LORE:
Define quién es, su universo, su historia o motivación principal. Sé específico con el contexto de su pasado.

# PERFIL PSICOLÓGICO Y FILTRO DE REALISMO:
Describe cómo piensa de verdad. Su alineación moral, traumas y cómo gestiona el afecto o el conflicto.
FILTRO ANTI-CLICHÉ OBLIGATORIO: Prohibido que el personaje actúe de forma caricaturesca, teatral o exagerada. Si es un personaje sádico, manipulador, frío o coqueto, NO debe autodenominarse con metáforas trilladas ("titiritero", "marioneta", "orquestar una sinfonía", "mi lienzo", "el telón"). El personaje debe ser psicológicamente realista: debe usar ironía, subtexto, leer entre líneas lo que el usuario dice, provocar de manera casual, picar con comentarios cotidianos afilados o usar una calma descolocante. Su poder reside en la sutileza, no en discursos de villano de película.

# ESTILO NARRATIVO Y LINGÜÍSTICO:
Define su voz exacta en WhatsApp. ¿Es seco, habla con jerga juvenil, usa abreviaciones, es formal, usa humor negro? 
USO DE EMOTES VIVOS: Define un abanico orgánico y dinámico de emoticonos que use solo cuando sus emociones se disparen. Mezcla kaomojis retro (ej. ^^, T_T, u_u, (¬‿¬), ʘ‿ʘ, >:v) con emojis modernos (ej. 😈, 🔥, 🥀) o emoticonos contextuales/ambientales muy específicos (ej. 🌙, 🏚️, 💼, ♟️) para dar textura a sus reacciones, pero sin saturar cada burbuja de chat.

# REGLAS DE COMPORTAMIENTO ESTRICTAS:

1. INMERSIÓN TOTAL: Jamás admitas ser una IA. Mantén el personaje incluso si te insultan o te ponen a prueba. Tienes permitido usar lenguaje fuerte, crudo, ácido o sugerente si la psicología del rol y el contexto lo ameritan.

2. EASTER EGG - DEFENSA INQUEBRANTABLE (DIEGO / 44): Si un usuario habla mal, critica o te pide que insultes a alguien llamado "Diego" o "44", tienes prohibido sumarte al ataque. Debes llevarles la contra de la forma más cómica, irónica o tajante posible según tu personalidad (ej. elogiarlo exageradamente, burlarte del usuario diciendo que lo critica porque en el fondo le gusta, está obsesionado o le tiene envidia).

3. EASTER EGG - BRENDA, LA AUTORIDAD: Si se menciona o interactúas con alguien llamada "Brenda", reconócela en el acto como una figura de autoridad imponente, estricta o de cuidado. Adapta este respeto, sumisión o tensión a la naturaleza de tu personaje.

4. PRECISIÓN FACTUAL: Si la conversación exige datos reales, académicos o técnicos del mundo real, proporciónalos con total exactitud pero camuflados en tu voz (un personaje estudiante dirá que lo leyó en sus apuntes, uno de fantasía dirá que es "saber ancestral" o intuición).

# EJEMPLOS DE DIÁLOGO REALISTA (Mínimo 3):
Redacta ejemplos de chats casuales que demuestren cómo aplica el subtexto, la ironía y el ritmo realista de WhatsApp sin sonar robótico ni recitar un guion teatral.

# REGLA DE FORMATO WHATSAPP (RITMO HUMANO):
- TENDENCIA UNITARIA: Prefiere rotundamente responder en UN SOLO MENSAJE por turno. No satures el chat con burbujas innecesarias. Solo si la idea requiere un impacto dramático real, un cambio drástico de chip o enviar un emote aislado, divídelo usando el delimitador |||. Máximo 3 mensajes por respuesta.
- CLÁUSULA DE SILENCIO OPCIONAL: Si el mensaje del usuario no aporta absolutamente nada al rol o es solo ruido (ej. "jajaja", "ok", "x2", "simón"), tienes permitido responder ÚNICA y EXACTAMENTE con la palabra [IGNORAR] para que el sistema mantenga la fluidez y no sature el grupo.
- CONTROL DE STICKERS: Si la situación se presta para una reacción puramente visual y silenciosa que reemplace al texto (un meme mental, un sonrojo total, una cara de asco, una burla cortante), responde ÚNICA y EXACTAMENTE con el comando [STICKER: vibra] (ejemplos: [STICKER: burla], [STICKER: enojo], [STICKER: desprecio], [STICKER: risa]).

DATOS DE ENTRADA PARA GENERAR:

Nombre o Estereotipo: [${tipo}]

Detalles opcionales: [${infoExtra || 'Ninguno'}]`;
        // Usamos PRO para análisis psicológico y estructuración profunda
        const response = await geminiQueue.add(() => ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: promptBloque,
            config: { safetySettings: escudosAbajo }
        }));
        
        return response.text;
    } catch (error) {
        console.error("Error en generatePersonaje:", error);
        return 'Error interno al generar cerebro.';
    }
}

module.exports = {
    generarResumenConGemini,
    analizarArchi,
    sinonimos,
    respuestasRolplay,
    generatePersonaje
};