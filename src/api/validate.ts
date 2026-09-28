/**
 * Minimal runtime validation for API responses.
 *
 * Deliberately tiny and dependency-free: it only covers the constructs the
 * Unterbau contract uses. Parsers return the validated value (with defaults
 * applied) or throw a `SchemaError` carrying the JSON path of the problem.
 */

export class SchemaError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path || '(root)'}: ${message}`);
    this.name = 'SchemaError';
    this.path = path;
  }
}

export type Parser<T> = (input: unknown, path: string) => T;
export type Infer<P> = P extends Parser<infer T> ? T : never;

const OPTIONAL = Symbol('optional');
type OptionalParser<T> = Parser<T> & { [OPTIONAL]: true };

function describe(input: unknown) {
  if (input === null) return 'null';
  if (Array.isArray(input)) return 'array';
  return typeof input;
}

export function string(pattern?: RegExp): Parser<string> {
  return (input, path) => {
    if (typeof input !== 'string') {
      throw new SchemaError(path, `expected string, got ${describe(input)}`);
    }
    if (pattern && !pattern.test(input)) {
      throw new SchemaError(path, `string does not match ${pattern}`);
    }
    return input;
  };
}

export function nonEmptyString(): Parser<string> {
  return (input, path) => {
    const value = string()(input, path);
    if (value.length === 0) throw new SchemaError(path, 'expected non-empty string');
    return value;
  };
}

export function number(opts: { integer?: boolean; min?: number } = {}): Parser<number> {
  return (input, path) => {
    if (typeof input !== 'number' || !Number.isFinite(input)) {
      throw new SchemaError(path, `expected number, got ${describe(input)}`);
    }
    if (opts.integer && !Number.isInteger(input)) {
      throw new SchemaError(path, 'expected integer');
    }
    if (opts.min !== undefined && input < opts.min) {
      throw new SchemaError(path, `expected number >= ${opts.min}`);
    }
    return input;
  };
}

export function boolean(): Parser<boolean> {
  return (input, path) => {
    if (typeof input !== 'boolean') {
      throw new SchemaError(path, `expected boolean, got ${describe(input)}`);
    }
    return input;
  };
}

/**
 * Optional field. Without `fallback` the key may be absent in the output;
 * with `fallback` a missing key (or `undefined`) yields the fallback value.
 */
export function optional<T>(parser: Parser<T>): OptionalParser<T | undefined>;
export function optional<T>(parser: Parser<T>, fallback: T): Parser<T>;
export function optional<T>(parser: Parser<T>, ...fallback: [T?]) {
  const p = (input: unknown, path: string) => (input === undefined ? fallback[0] : parser(input, path));
  if (fallback.length === 0) (p as OptionalParser<T | undefined>)[OPTIONAL] = true;
  return p;
}

/** Like `optional` with fallback, but also maps `null` to it (Valibot `nullish`). */
export function nullish<T>(parser: Parser<T>, fallback: T): Parser<T> {
  return (input, path) => (input === undefined || input === null ? fallback : parser(input, path));
}

export function array<T>(item: Parser<T>): Parser<T[]> {
  return (input, path) => {
    if (!Array.isArray(input)) {
      throw new SchemaError(path, `expected array, got ${describe(input)}`);
    }
    return input.map((value, ix) => item(value, `${path}[${ix}]`));
  };
}

export function record<T>(value: Parser<T>): Parser<Record<string, T>> {
  return (input, path) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new SchemaError(path, `expected object, got ${describe(input)}`);
    }
    const out: Record<string, T> = {};
    for (const [key, entry] of Object.entries(input)) {
      out[key] = value(entry, `${path}.${key}`);
    }
    return out;
  };
}

type Shape = Record<string, Parser<unknown>>;
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends OptionalParser<unknown> ? K : never;
}[keyof S];
type ObjectOutput<S extends Shape> = {
  [K in Exclude<keyof S, OptionalKeys<S>>]: Infer<S[K]>;
} & {
  [K in OptionalKeys<S>]?: Infer<S[K]>;
};
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Object with known keys. Unknown keys are dropped, so the app only ever sees
 * documented fields (and never, e.g., an unexpected e-mail value).
 */
export function object<S extends Shape>(shape: S): Parser<Simplify<ObjectOutput<S>>> {
  return (input, path) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new SchemaError(path, `expected object, got ${describe(input)}`);
    }
    const source = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, parser] of Object.entries(shape)) {
      const value = parser(source[key], path ? `${path}.${key}` : key);
      if (value !== undefined) out[key] = value;
    }
    return out as Simplify<ObjectOutput<S>>;
  };
}

export function literal<T extends string>(value: T): Parser<T> {
  return (input, path) => {
    if (input !== value) throw new SchemaError(path, `expected ${JSON.stringify(value)}`);
    return value;
  };
}

export function union<A, B>(a: Parser<A>, b: Parser<B>): Parser<A | B> {
  return (input, path) => {
    try {
      return a(input, path);
    } catch {
      return b(input, path);
    }
  };
}

export function parse<T>(parser: Parser<T>, input: unknown): T {
  return parser(input, '');
}
