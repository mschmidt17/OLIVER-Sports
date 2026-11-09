// Íconos de línea en SVG, sin librería: son pocos y así no sumamos dependencias.
// Toman el color del texto (currentColor) y son decorativos: el significado
// siempre está en el texto que los acompaña, por eso llevan aria-hidden.

function Icon({ children }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ChartIcon() {
  return (
    <Icon>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </Icon>
  );
}

export function ChevronLeftIcon() {
  return (
    <Icon>
      <path d="m15 6-6 6 6 6" />
    </Icon>
  );
}

export function InfoIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Icon>
  );
}

export function SparkleIcon() {
  return (
    <Icon>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" />
    </Icon>
  );
}

export function StarIcon() {
  return (
    <Icon>
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </Icon>
  );
}

export function FlagIcon() {
  return (
    <Icon>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </Icon>
  );
}

export function TrendUpIcon() {
  return (
    <Icon>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Icon>
  );
}

export function ClockIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}
