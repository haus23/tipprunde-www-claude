import { raw } from './html.ts';

/** Stroke icons on a 24×24 grid, decorative only (always `aria-hidden`). */
const PATHS = {
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 10v10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10.5 16 10M17.5 19.5l-3-5M6.5 19.5l3-5M3 10.5 8 10"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v4M12 17.5v.5"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName) {
  return raw(
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`,
  );
}
