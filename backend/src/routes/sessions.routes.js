import { Router } from 'express';
import { z } from 'zod';
import {
  listSessions,
  getSessionMetrics,
  ORDERABLE_COLUMNS,
} from '../services/metrics.service.js';

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

export default router;
