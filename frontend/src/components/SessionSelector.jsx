import { formatDate } from '../metrics.js';

// Cada opción: fecha y título. El tipo (Partido / Entrenamiento) no se agrega
// porque los títulos ya lo suelen decir, y el encabezado de la sesión lo muestra.
export default function SessionSelector({ sessions, selectedId, onChange }) {
  return (
    <label className="field field-inline">
      Sesión
      <select value={selectedId ?? ''} onChange={(event) => onChange(Number(event.target.value))}>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {formatDate(session.date)} · {session.title}
          </option>
        ))}
      </select>
    </label>
  );
}
