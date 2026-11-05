import { Router } from 'express';
import { z } from 'zod';
import {
  listSessions,
  getSessionMetrics,
  ORDERABLE_COLUMNS,
} from '../services/metrics.service.js';
import { generateSessionReport } from '../services/report.service.js';
import { LANGUAGES, AUDIENCES } from '../prompts/sessionReport.v1.js';

const router = Router();

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

// Si no se envían, el reporte sale en español y para el cuerpo técnico.
const reportBodySchema = z.object({
  language: z.enum(LANGUAGES, { error: `debe ser uno de: ${LANGUAGES.join(', ')}` }).default('es'),
  audience: z.enum(AUDIENCES, { error: `debe ser uno de: ${AUDIENCES.join(', ')}` }).default('coach'),
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

// Los errores de la IA (timeout, rate limit, respuesta inválida) no se
// atrapan acá: Express 5 los pasa al manejador de errores de server.js.
router.post('/:id/report', async (req, res) => {
  const params = sessionParamsSchema.safeParse(req.params);
  if (!params.success) return sendValidationError(res, params.error);

  // Sin body JSON, req.body es undefined: se toman los valores por defecto.
  const body = reportBodySchema.safeParse(req.body ?? {});
  if (!body.success) return sendValidationError(res, body.error);

  const report = await generateSessionReport(params.data.id, body.data);

  if (!report) {
    return res.status(404).json({ error: `La sesión ${params.data.id} no existe` });
  }
  res.json(report);
});

export default router;
