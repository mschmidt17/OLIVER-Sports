import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as geminiClient from './geminiClient.js';
import { generateJson, currentModelId, AiError } from './index.js';

// Se reemplaza solo la llamada a Gemini y el chequeo de la API key.
// isTemporaryError y modelName son los reales: también se prueban.
vi.mock('./geminiClient.js', async (importOriginal) => ({
  ...(await importOriginal()),
  generateJson: vi.fn(),
  isConfigured: vi.fn(),
}));

const REQUEST = { systemInstruction: 'instrucciones', userPrompt: 'datos', responseSchema: {} };

// Proveedor que nunca responde: solo termina cuando el timeout lo aborta.
function neverResponds({ signal }) {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

// Llama a la IA avanzando los relojes falsos (timeout y espera del reintento).
// Devuelve el texto o, si falló, el error.
async function callAi() {
  const promise = generateJson(REQUEST).catch((error) => error);
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  geminiClient.isConfigured.mockReturnValue(true);
  vi.stubEnv('AI_PROVIDER', 'gemini');
  vi.stubEnv('AI_TIMEOUT_MS', '1000');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('generateJson: respuesta y reintento', () => {
  it('devuelve el texto del proveedor en el primer intento', async () => {
    geminiClient.generateJson.mockResolvedValue('{"ok":true}');

    expect(await callAi()).toBe('{"ok":true}');
    expect(geminiClient.generateJson).toHaveBeenCalledTimes(1);
    // Le pasa la señal del AbortController para poder cortar la espera.
    expect(geminiClient.generateJson.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  });

  it('ante un 503 reintenta una vez y devuelve la segunda respuesta', async () => {
    geminiClient.generateJson
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce('{"ok":true}');

    expect(await callAi()).toBe('{"ok":true}');
    expect(geminiClient.generateJson).toHaveBeenCalledTimes(2);
  });

  it('si el 429 persiste, no reintenta más de una vez y responde 503', async () => {
    geminiClient.generateJson.mockRejectedValue({ status: 429 });

    const error = await callAi();

    expect(error).toBeInstanceOf(AiError);
    expect(error.status).toBe(503);
    expect(geminiClient.generateJson).toHaveBeenCalledTimes(2);
  });

  it('un error no temporal no se reintenta y responde 502', async () => {
    geminiClient.generateJson.mockRejectedValue({ status: 400 });

    const error = await callAi();

    expect(error).toBeInstanceOf(AiError);
    expect(error.status).toBe(502);
    expect(geminiClient.generateJson).toHaveBeenCalledTimes(1);
  });
});

describe('generateJson: timeout y configuración', () => {
  it('si el modelo no responde a tiempo, aborta y responde 504 sin reintentar', async () => {
    geminiClient.generateJson.mockImplementation(neverResponds);

    const error = await callAi();

    expect(error).toBeInstanceOf(AiError);
    expect(error.status).toBe(504);
    expect(geminiClient.generateJson).toHaveBeenCalledTimes(1);
  });

  it('sin API key responde 503 sin llamar al proveedor', async () => {
    geminiClient.isConfigured.mockReturnValue(false);

    const error = await callAi();

    expect(error).toBeInstanceOf(AiError);
    expect(error.status).toBe(503);
    expect(geminiClient.generateJson).not.toHaveBeenCalled();
  });

  it('con un proveedor desconocido responde 503', async () => {
    vi.stubEnv('AI_PROVIDER', 'otro');

    const error = await callAi();

    expect(error).toBeInstanceOf(AiError);
    expect(error.status).toBe(503);
  });
});

describe('currentModelId', () => {
  it('combina proveedor y modelo, como se usa en la clave de la caché', () => {
    vi.stubEnv('GEMINI_MODEL', 'modelo-de-prueba');

    expect(currentModelId()).toBe('gemini/modelo-de-prueba');
  });
});
