import { Router } from 'express';
import { z } from 'zod';
import {
  listSessions,
  getSessionMetrics,
  ORDERABLE_COLUMNS,
} from '../services/metrics.service.js';
import { generateSessionReport } from '../services/report.service.js';
const router = Router();

// Contrato de la API, independiente de la versión de cada prompt
// (los dos prompts tienen instrucciones para estos idiomas).
const LANGUAGES = ['es', 'en'];
// coach: informe colectivo para el cuerpo técnico. player: informe individual.
const AUDIENCES = ['coach', 'player'];

// Los params y la query llegan como strings: z.coerce los convierte a número.
const positiveInt = z.coerce.number({ error: 'debe ser un número' })
  .int({ error: 'debe ser un entero' })
  .positive({ error: 'debe ser positivo' });

const sessionParamsSchema = z.object({ id: positiveInt });

const metricsQuerySchema = z.object({
  player_id: positiveInt.optional(),
  order_by: z.enum(ORDERABLE_COLUMNS, {
    error: `debe ser una de: ${ORDERABLE_COLUMNS.join(', ')}`,
  }).optional(),
  order: z.enum(['asc', 'desc'], { error: 'debe ser asc o desc' }).optional(),
});

// refresh = true ignora la caché y genera un reporte nuevo.
// player_id: obligatorio con audience player y prohibido con coach.
// En el body JSON no se usa z.coerce: el número ya llega tipado (y coerce
// convertiría true en 1).
const reportBodySchema = z.object({
  language: z.enum(LANGUAGES, { error: `debe ser uno de: ${LANGUAGES.join(', ')}` }).default('es'),
  audience: z.enum(AUDIENCES, { error: `debe ser uno de: ${AUDIENCES.join(', ')}` }).default('coach'),
  player_id: z.number({ error: 'debe ser un número' })
    .int({ error: 'debe ser un entero' })
    .positive({ error: 'debe ser positivo' })
    .optional(),
  refresh: z.boolean({ error: 'debe ser true o false' }).default(false),
})
  .refine((body) => body.audience !== 'player' || body.player_id !== undefined, {
    path: ['player_id'],
    error: 'es obligatorio cuando audience es player',
  })
  .refine((body) => body.audience !== 'coach' || body.player_id === undefined, {
    path: ['player_id'],
    error: 'no corresponde cuando audience es coach (el informe es colectivo)',
  });

// Responde 400 con los errores de Zod en texto legible: "order: debe ser asc o desc".
function sendValidationError(res, error) {
  const message = error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  return res.status(400).json({ error: message });
}

router.get('/', (req, res) => {
  res.json(listSessions());
});

router.get('/:id/metrics', (req, res) => {
  const params = sessionParamsSchema.safeParse(req.params);
  if (!params.success) return sendValidationError(res, params.error);

  const query = metricsQuerySchema.safeParse(req.query);
  if (!query.success) return sendValidationError(res, query.error);

  const result = getSessionMetrics(params.data.id, {
    playerId: query.data.player_id,
    orderBy: query.data.order_by,
    order: query.data.order,
  });

  if (!result) {
    return res.status(404).json({ error: `La sesión ${params.data.id} no existe` });
  }
  res.json(result);
});

// Los errores de la IA (timeout, rate limit, respuesta inválida) y el jugador
// que no participó en la sesión (404) no se atrapan acá: Express 5 los pasa
// al manejador de errores de server.js.
router.post('/:id/report', async (req, res) => {
  const params = sessionParamsSchema.safeParse(req.params);
  if (!params.success) return sendValidationError(res, params.error);

  // Sin body JSON, req.body es undefined: se toman los valores por defecto.
  const body = reportBodySchema.safeParse(req.body ?? {});
  if (!body.success) return sendValidationError(res, body.error);

  const { language, audience, player_id, refresh } = body.data;
  const report = await generateSessionReport(params.data.id, {
    language,
    audience,
    playerId: player_id,
    refresh,
  });

  if (!report) {
    return res.status(404).json({ error: `La sesión ${params.data.id} no existe` });
  }
  res.json(report);
});

export default router;
