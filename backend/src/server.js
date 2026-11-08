import express from 'express';
import sessionsRouter from './routes/sessions.routes.js';

// process.env ya está cargado: lo hace db/connection.js.
const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use('/sessions', sessionsRouter);

// Cualquier ruta que no matcheó antes.
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// Manejador de errores. Express lo detecta por tener 4 argumentos (por eso `next`).
// - Errores esperados (expose = true): IA caída, respuesta inválida, JSON mal
//   formado en el body. Se responde su código y su mensaje.
// - Cualquier otro: 500 genérico; al cliente no se le filtra SQL ni stack.
app.use((err, req, res, next) => {
  console.error(err);

  if (err.expose) {
    return res.status(err.status).json({ error: err.message });
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
