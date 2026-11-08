import { sessionTypeLabel, formatDate } from '../metrics.js';

export default function SessionSelector({ sessions, selectedId, onChange }) {
  return (
    <label className="field field-inline">
      Sesión
      <select value={selectedId ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {formatDate(s.date)} · {sessionTypeLabel(s.type)} · {s.title}
          </option>
        ))}
      </select>
    </label>
  );
}
