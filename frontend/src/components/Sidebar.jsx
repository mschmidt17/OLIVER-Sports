import { useState } from 'react';
import { ChartIcon, ChevronLeftIcon } from './icons.jsx';

// Menú lateral: marca, sección activa y la pestaña para contraerlo.
// Hoy la app tiene una sola vista, así que el único ítem apunta a la propia
// página y queda marcado como actual.
export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <nav className={collapsed ? 'sidebar is-collapsed' : 'sidebar'} aria-label="Principal">
      <span className="wordmark">
        <img className="wordmark-logo" src="/favicon.svg" alt="oliver-sports" />
        <img className="wordmark-text" src="/logo-oliver-sports-white.webp" alt="OLIVER Sports" />
      </span>
      <a className="nav-item" href="/" aria-current="page">
        <ChartIcon />
        <span className="nav-label">Análisis de sesión</span>
      </a>

      {/* Pestaña pegada al borde: la flecha apunta hacia donde se va a mover. */}
      <button
        type="button"
        className="sidebar-toggle"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
      >
        <ChevronLeftIcon />
      </button>
    </nav>
  );
}
