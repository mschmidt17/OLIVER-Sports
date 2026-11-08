import { formatDate } from '../metrics.js';

// Cada opción: fecha y título. El tipo (Partido / Entrenamiento) no se agrega
// porque los títulos ya lo suelen decir, y el encabezado de la sesión lo muestra.
export default function SessionSelector({ sessions, selectedId, onChange }) {
  return (
    <label className="field field-inline">
      Sesión
      <select value={selectedId ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {formatDate(s.date)} · {s.title}
          </option>
        ))}
      </select>
    </label>
  );
}
