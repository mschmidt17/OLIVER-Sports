import 'dotenv/config';
import express from 'express';
import sessionsRouter from './routes/sessions.routes.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/sessions', sessionsRouter);

// Cualquier ruta que no matcheó antes.
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// Errores no controlados: se loguean completos; al cliente no se le filtra SQL ni stack.
// Express lo detecta como manejador de errores por tener 4 argumentos (por eso `next`).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
