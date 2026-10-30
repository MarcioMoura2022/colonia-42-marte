/**
 * ui/icons.js
 * ---------------------------------------------------------------------------
 * Ícones SVG inline (sem dependências externas). O traço usa currentColor,
 * então a cor é controlada pelo CSS de cada contexto.
 */

const ICONS = {
  oxygen: `
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>
    <circle cx="6.2" cy="6.8" r="1.6" fill="currentColor" stroke="none"/>
    <circle cx="17.8" cy="6.8" r="1.6" fill="currentColor" stroke="none"/>
    <circle cx="6.2" cy="17.2" r="1.6" fill="currentColor" stroke="none"/>
    <path d="M10.2 10.5 7.7 8.2M13.8 10.5l2.5-2.3M10.2 13.5l-2.5 2.3" stroke-width="1.3"/>
  `,
  water: `
    <path d="M12 2.6c3.6 4.2 5.8 6.9 5.8 9.6a5.8 5.8 0 1 1-11.6 0c0-2.7 2.2-5.4 5.8-9.6Z" fill="currentColor" stroke="none"/>
    <path d="M9.2 13.2c.3 1.5 1.2 2.4 2.5 2.7" stroke="#0b0807" stroke-width="1.2" opacity=".45"/>
  `,
  energy: `
    <path d="M13.4 2 4.6 13.4h5.7L9.8 22l8.8-11.7h-5.7L13.4 2Z" fill="currentColor" stroke="none"/>
  `,
  food: `
    <path d="M12 21v-7.2" stroke-width="1.8"/>
    <path d="M12 14.2c.1-4.2 2.9-7.6 7.1-8.2.2 4.7-2.7 7.9-7.1 8.2Z" fill="currentColor" stroke="none"/>
    <path d="M12 17.1c-.1-3.2-2.2-6-5.6-6.5-.2 3.7 2 6.3 5.6 6.5Z" fill="currentColor" stroke="none" opacity=".68"/>
  `,
  minerals: `
    <path d="M12 2.8 21 9l-9 12.2L3 9l9-6.2Z" stroke-width="1.6"/>
    <path d="M3 9h18M8 9l4 12.2M16 9l-4 12.2M12 2.8 8 9M12 2.8 16 9" stroke-width="1.1" opacity=".75"/>
  `,
  population: `
    <circle cx="9" cy="7.8" r="3.2"/>
    <path d="M3.4 20c0-3.3 2.5-5.6 5.6-5.6s5.6 2.3 5.6 5.6"/>
    <circle cx="17.2" cy="8.8" r="2.1" opacity=".65"/>
    <path d="M16.1 14.4c2.7.2 4.5 2.3 4.5 5.1" opacity=".65"/>
  `,
  mood: `
    <circle cx="12" cy="12" r="8.8"/>
    <path d="M8.4 14.3c.9 1.4 2.1 2.1 3.6 2.1s2.7-.7 3.6-2.1"/>
    <circle cx="9.1" cy="9.6" r=".9" fill="currentColor" stroke="none"/>
    <circle cx="14.9" cy="9.6" r=".9" fill="currentColor" stroke="none"/>
  `,
  sun: `
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" stroke-width="1.5"/>
  `,
  pause: `
    <rect x="7" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none"/>
    <rect x="13.6" y="5" width="3.4" height="14" rx="1.2" fill="currentColor" stroke="none"/>
  `,
  play: `
    <path d="M8 5.2v13.6L19 12 8 5.2Z" fill="currentColor" stroke="none"/>
  `,
  build: `
    <path d="M14.8 6.1a4.2 4.2 0 0 0-5.5 5.5l-5.6 5.6a1.6 1.6 0 0 0 0 2.3l1.8 1.8a1.6 1.6 0 0 0 2.3 0l5.6-5.6a4.2 4.2 0 0 0 5.5-5.5l-2.5 2.5-2.6-.7-.7-2.6 2.2-2.2Z" fill="currentColor" stroke="none" opacity=".9"/>
    <path d="m5.4 17.2 1.4 1.4" stroke="#0b0807" stroke-width="1.2" opacity=".4"/>
  `,
  help: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M9.6 9.2c.2-1.4 1.2-2.3 2.6-2.3 1.5 0 2.6.9 2.6 2.2 0 1.1-.6 1.7-1.7 2.3-.9.5-1.2 1-1.2 1.9"/>
    <circle cx="12" cy="17" r=".95" fill="currentColor" stroke="none"/>
  `,
  close: `
    <path d="M6 6l12 12M18 6 6 18" stroke-width="1.8"/>
  `,
  plus: `
    <path d="M12 5v14M5 12h14" stroke-width="1.8"/>
  `,
  trash: `
    <path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l.8 13h9.4l.8-13M10 11v5.5M14 11v5.5" stroke-width="1.6"/>
  `,
  warning: `
    <path d="M12 3.2 22 20.4H2L12 3.2Z" stroke-width="1.6"/>
    <path d="M12 9v5.2" stroke-width="1.8"/>
    <circle cx="12" cy="17.4" r="1" fill="currentColor" stroke="none"/>
  `,
  info: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 10.8v5.4" stroke-width="1.9"/>
    <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>
  `,
  check: `
    <path d="m4.8 12.6 4.6 4.6L19.4 7" stroke-width="2"/>
  `,
  error: `
    <circle cx="12" cy="12" r="9"/>
    <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" stroke-width="1.8"/>
  `,
  zoomIn: `
    <circle cx="10.5" cy="10.5" r="6.5"/>
    <path d="m15.4 15.4 4.4 4.4M10.5 7.6v5.8M7.6 10.5h5.8" stroke-width="1.7"/>
  `,
  zoomOut: `
    <circle cx="10.5" cy="10.5" r="6.5"/>
    <path d="m15.4 15.4 4.4 4.4M7.6 10.5h5.8" stroke-width="1.7"/>
  `,
  target: `
    <circle cx="12" cy="12" r="7.5"/>
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>
    <path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4" stroke-width="1.5"/>
  `,
};

/**
 * Retorna o markup de um ícone.
 * @param {string} name
 * @param {number} size
 */
export function icon(name, size = 16) {
  const inner = ICONS[name];
  if (!inner) return '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/**
 * Substitui todos os elementos [data-icon] do documento pelo SVG correspondente.
 * Usado no HTML estático do HUD.
 */
export function hydrateStaticIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.iconHydrated === '1') return;
    el.innerHTML = icon(el.dataset.icon, 16);
    el.dataset.iconHydrated = '1';
  });
}
