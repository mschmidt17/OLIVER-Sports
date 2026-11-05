const SESSION_TYPES = { training: 'Entrenamiento', match: 'Partido' };

export default function SessionSelector({ sessions, selectedId, onChange }) {
  return (
    <label className="field">
      Sesión
      <select value={selectedId ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.date} · {SESSION_TYPES[s.type] ?? s.type} · {s.title}
          </option>
        ))}
      </select>
    </label>
  );
}
