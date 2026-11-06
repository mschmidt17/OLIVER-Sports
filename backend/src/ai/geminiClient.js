import { GoogleGenAI } from '@google/genai';

// Cliente de Gemini. Solo sabe hablar con Gemini: el timeout, el reintento
// y la traducción de errores viven en ai/index.js, que es común a todo proveedor.

// Flash-Lite: rápido (~4 s), estable y dentro del tier gratuito.
// Se puede cambiar con GEMINI_MODEL sin tocar código.
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

// Temperatura baja: queremos un reporte fiel a los datos, no creativo.
const TEMPERATURE = 0.3;

let client = null;

// Se crea en el primer uso, así el servidor arranca aunque falte la API key.
function getClient() {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function modelName() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

// Errores temporales del proveedor, que vale la pena reintentar:
// 429 = rate limit, 503 = modelo saturado ("high demand").
// El SDK lanza ApiError con el código HTTP en `status`.
export function isTemporaryError(error) {
  return error?.status === 429 || error?.status === 503;
}

/**
 * Pide al modelo una respuesta JSON que cumpla el esquema.
 * Devuelve el texto crudo: parsearlo y validarlo es tarea de quien llama.
 */
export async function generateJson({ systemInstruction, userPrompt, responseSchema, signal }) {
  const response = await getClient().models.generateContent({
    model: modelName(),
    contents: userPrompt,
    config: {
      systemInstruction,
      temperature: TEMPERATURE,
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema,
      abortSignal: signal,
    },
  });
  return response.text;
}
