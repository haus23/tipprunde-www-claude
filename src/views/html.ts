/**
 * Auto-escaping HTML templates.
 *
 * `html\`<p>${value}</p>\`` escapes every interpolated value unless it is
 * already `SafeHtml` (the result of another `html` call). Arrays are joined,
 * and `null`, `undefined` and `false` render nothing.
 */

export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export type Html = SafeHtml;
type Value = SafeHtml | string | number | boolean | null | undefined | readonly Value[];

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

function render(value: Value): string {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): SafeHtml {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    out += render(values[i] as Value) + (strings[i + 1] ?? '');
  }
  return new SafeHtml(out);
}

/** Trusted markup, e.g. inline JSON or SVG from the repository. */
export function raw(value: string) {
  return new SafeHtml(value);
}

/** Build a class attribute value from conditional parts. */
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}
