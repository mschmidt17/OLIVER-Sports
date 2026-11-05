// Prompt del reporte de sesión, versión 1.
// Si cambian las instrucciones o el formato de salida, se crea sessionReport.v2.js
// en lugar de editar este archivo: así cada reporte se puede rastrear a su prompt.
import { z } from 'zod';

export const PROMPT_VERSION = 'session-report-v1';

const LANGUAGE_INSTRUCTIONS = {
  es: 'Escribí todo el reporte en español.',
  en: 'Write the entire report in English.',
};

const AUDIENCE_INSTRUCTIONS = {
  coach:
    'El lector es el cuerpo técnico: usá un tono profesional y concreto, ' +
    'con foco en la gestión de la carga y en qué mirar en la próxima sesión.',
  player:
    'El lector es el plantel: usá lenguaje simple y motivador, sin jerga técnica. ' +
    'Las alertas se comentan como cuidado y recuperación, sin tono alarmista.',
};

// Valores aceptados por la API; la ruta los valida contra estas listas.
export const LANGUAGES = Object.keys(LANGUAGE_INSTRUCTIONS);
export const AUDIENCES = Object.keys(AUDIENCE_INSTRUCTIONS);

const BASE_INSTRUCTIONS = `
Sos analista de rendimiento físico de un equipo de fútbol.
Vas a recibir un JSON con los datos de UNA sesión y tenés que escribir un reporte breve.

Qué contiene el JSON:
- session: datos de la sesión. type es "training" (entrenamiento) o "match"
  (partido); duration_min es la duración en minutos.
- players: un objeto por jugador, identificado solo por player_id.
  - metrics: valores medidos. Un null significa "sin dato".
  - per_minute: las mismas métricas divididas por los minutos jugados.
  - low_minutes: true si jugó menos de la mitad de la sesión.
- thresholds: umbrales de referencia del equipo.
- alerts: alertas YA calculadas por el sistema (jugador, métrica, valor, nivel).
- missing_data: métricas que no se registraron.

Reglas obligatorias:
1. Usá solo la información del JSON. No inventes jugadores, métricas ni valores.
2. Si escribís un número, copialo exactamente como aparece en el JSON, sin
   separador de miles (escribí 10488, no 10.488). No calcules promedios,
   totales, diferencias ni porcentajes.
3. No escribas nombres de jugadores ni player_id dentro de los textos.
   Cada jugador se identifica solo con el campo player_id de su elemento.
4. summary: 2 a 4 oraciones sobre el equipo en general, sin mencionar
   jugadores individuales.
5. highlights: elegí 2 o 3 jugadores destacados por su rendimiento físico.
   Para comparar jugadores con distintos minutos usá per_minute.
   Si un jugador tiene low_minutes = true, aclaralo en el motivo.
   reason: una oración.
6. alerts: escribí un comentario breve para cada player_id que aparezca en
   "alerts" del JSON, y solo para esos. No cambies el nivel de la alerta
   ni agregues alertas nuevas.
7. Un valor null es "sin dato": nunca lo trates como 0 ni supongas su valor.
   Si es relevante, mencioná que falta el dato.
8. No uses nombres de campos del JSON en los textos (por ejemplo low_minutes,
   per_minute o workload_au): explicalos con palabras, como "jugó pocos
   minutos" o "carga de trabajo".
`.trim();

// Formato de salida: se define una sola vez, con Zod, y se usa dos veces.
// 1. Convertido a JSON Schema, se le pide al modelo que lo respete.
// 2. domain/validateReport lo vuelve a validar, porque el pedido no es una garantía.
export const reportSchema = z.object({
  summary: z.string().trim().min(1),
  highlights: z
    .array(z.object({ player_id: z.number().int(), reason: z.string().trim().min(1) }))
    .min(2)
    .max(3),
  alerts: z.array(z.object({ player_id: z.number().int(), comment: z.string().trim().min(1) })),
});

const responseJsonSchema = z.toJSONSchema(reportSchema);

/**
 * Arma el pedido para el modelo a partir del contexto de buildContext.
 * Devuelve las instrucciones de sistema, el mensaje con los datos y el esquema.
 */
export function buildSessionReportPrompt(context, { language, audience }) {
  const systemInstruction = [
    BASE_INSTRUCTIONS,
    LANGUAGE_INSTRUCTIONS[language],
    AUDIENCE_INSTRUCTIONS[audience],
  ].join('\n\n');

  return {
    systemInstruction,
    userPrompt: `Datos de la sesión:\n${JSON.stringify(context)}`,
    responseSchema: responseJsonSchema,
  };
}
