// Todas las llamadas al backend pasan por acá.
// '/api' lo redirige el proxy de Vite al backend (ver vite.config.js).
const BASE_URL = '/api';

// Hace el fetch y, si la respuesta no es 2xx, lanza un Error con el
// mensaje que mandó el backend ({ error: '...' }).
async function request(path, options) {
  let response;
  try {
    response = await fetch(BASE_URL + path, options);
  } catch {
    throw new Error('No se pudo conectar con el backend. ¿Está corriendo?');
  }

  // Si la respuesta no es JSON, body queda en null.
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // El backend siempre responde los errores con { error }. Si no viene, no contestó
    // el backend sino el proxy de Vite (por ejemplo, porque el backend está apagado).
    throw new Error(body?.error ?? 'No se pudo conectar con el backend. ¿Está corriendo?');
  }
  if (body === null) {
    throw new Error('El servidor devolvió una respuesta que no es JSON');
  }
  return body;
}

export function getSessions() {
  return request('/sessions');
}

export function getSessionMetrics(sessionId) {
  return request(`/sessions/${sessionId}/metrics`);
}

// playerId solo para el informe individual (audience player). Con coach queda
// undefined y JSON.stringify lo omite: el backend rechaza player_id con coach.
export function generateReport(sessionId, { language, audience, playerId, refresh }) {
  return request(`/sessions/${sessionId}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, audience, player_id: playerId, refresh }),
  });
}
