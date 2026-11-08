import { ChartIcon } from './icons.jsx';

// Menú lateral: marca y sección activa. Hoy la app tiene una sola vista,
// así que el único ítem apunta a la propia página y queda marcado como actual.
export default function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Principal">
      <span className="wordmark">
        OLIVER<span className="wordmark-accent" aria-hidden="true" />
      </span>
      <a className="nav-item" href="/" aria-current="page">
        <ChartIcon />
        Análisis de sesión
      </a>
    </nav>
  );
}
