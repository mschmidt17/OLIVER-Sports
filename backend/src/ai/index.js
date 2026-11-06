import * as geminiClient from './geminiClient.js';

// Punto de entrada a la IA. Elige el proveedor según AI_PROVIDER y agrega
// lo que es común a cualquier proveedor: timeout, un reintento ante errores
// temporales (rate limit o modelo saturado) y errores con un código HTTP claro.
// Para sumar otro proveedor alcanza con un cliente con la misma forma
// (isConfigured, modelName, isTemporaryError, generateJson) y agregarlo a esta lista.
const PROVIDERS = {
  gemini: geminiClient,
};

const DEFAULT_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 2000;
const MAX_ATTEMPTS = 2; // el intento original + un reintento

/**
 * Error de la integración con IA. `status` es el código HTTP que va a
 * devolver la API y `expose` indica que el mensaje se puede mostrar al cliente.
 */
export class AiError extends Error {
  constructor(message, status, cause) {
    super(message, { cause });
    this.name = 'AiError';
    this.status = status;
    this.expose = true;
  }
}

function providerName() {
  return process.env.AI_PROVIDER || 'gemini';
}

/**
 * Identifica proveedor y modelo activos, por ejemplo "gemini/gemini-3.1-flash-lite".
 * Se usa en la clave de la caché: un cambio de modelo no sirve reportes del anterior.
 */
export function currentModelId() {
  const name = providerName();
  const provider = PROVIDERS[name];
  return provider ? `${name}/${provider.modelName()}` : name;
}

function getProvider() {
  const name = providerName();
  const provider = PROVIDERS[name];

  if (!provider) {
    throw new AiError(`Proveedor de IA desconocido: ${name}`, 503);
  }
  if (!provider.isConfigured()) {
    throw new AiError('El proveedor de IA no está configurado (falta la API key)', 503);
  }
  return provider;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// AbortController corta la espera si el modelo tarda más que AI_TIMEOUT_MS.
async function callWithTimeout(provider, request) {
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await provider.generateJson({ ...request, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AiError(`El modelo no respondió en ${timeoutMs} ms`, 504, error);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Convierte cualquier error del proveedor en un AiError con código HTTP.
function toAiError(error, provider) {
  if (error instanceof AiError) return error;
  if (provider.isTemporaryError(error)) {
    return new AiError('El proveedor de IA está saturado. Probá de nuevo en unos segundos.', 503, error);
  }
  return new AiError('Falló la llamada al proveedor de IA', 502, error);
}

/**
 * Pide una respuesta JSON al proveedor configurado y devuelve el texto crudo.
 * Ante un error temporal (429 o 503) espera y reintenta una sola vez.
 */
export async function generateJson(request) {
  const provider = getProvider();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callWithTimeout(provider, request);
    } catch (error) {
      const shouldRetry = attempt < MAX_ATTEMPTS && provider.isTemporaryError(error);
      if (!shouldRetry) throw toAiError(error, provider);
      await sleep(RETRY_DELAY_MS);
    }
  }
}
