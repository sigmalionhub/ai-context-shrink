/**
 * @sigmalion/ai-context-shrink
 * A utility for compressing objects and text to minimize token usage
 * while keeping the output maximally readable for LLMs.
 *
 * @module @sigmalion/ai-context-shrink
 */

// ─── Types & Interfaces ───────────────────────────────────────────────────────

/**
 * Configuration options for the shrink algorithm.
 */
export interface ShrinkOptions {
  /**
   * Maximum number of elements to keep from the start and end of each array.
   * The resulting array will contain at most maxArrayItems * 2 elements.
   * @default 3
   */
  maxArrayItems?: number;

  /**
   * Maximum length of string values (in characters) before truncation.
   * @default 100
   */
  maxStringLength?: number;

  /**
   * Schema mode: replace values with their type names instead of actual data.
   * Useful when the structure matters more than the content.
   * @default false
   */
  schemaMode?: boolean;

  /**
   * Maximum recursion depth for nested objects.
   * Objects deeper than this level are replaced with "[Object]" / "[Array]".
   * @default 10
   */
  maxDepth?: number;

  /**
   * Placeholder string used when a circular reference is detected.
   * @default "[Circular]"
   */
  circularPlaceholder?: string;
}

/**
 * Default options — applied when a parameter is not explicitly provided.
 */
const DEFAULT_OPTIONS: Required<ShrinkOptions> = {
  maxArrayItems: 3,
  maxStringLength: 100,
  schemaMode: false,
  maxDepth: 10,
  circularPlaceholder: "[Circular]",
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Returns a human-readable type name for Schema Mode.
 * Distinguishes null, array, and plain object — unlike typeof.
 */
function getTypeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // "string" | "number" | "boolean" | "object" | "undefined" | "function" | "symbol" | "bigint"
}

/**
 * Truncates a string to maxLength characters, appending "..." if it exceeds the limit.
 */
function trimString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

/**
 * Applies Smart Array Truncation:
 * keeps the first N and last N elements, replacing the middle with a marker.
 *
 * Example: [1,2,3,4,5,6,7] with N=2 → [1, 2, "[+ 3 items]", 6, 7]
 */
function truncateArray(arr: unknown[], maxItems: number): unknown[] {
  // Array is small enough — return as-is
  const threshold = maxItems * 2;
  if (arr.length <= threshold) return arr;

  const skipped = arr.length - threshold;
  return [
    ...arr.slice(0, maxItems),
    `[+ ${skipped} items]`,
    ...arr.slice(arr.length - maxItems),
  ];
}

// ─── Core Recursive Function ──────────────────────────────────────────────────

/**
 * Internal recursive traversal function.
 *
 * @param data  - Current value being processed
 * @param opts  - Fully resolved options (with defaults applied)
 * @param seen  - WeakSet tracking already-visited objects (guards against circular references)
 * @param depth - Current recursion depth
 */
function processValue(
    data: unknown,
    opts: Required<ShrinkOptions>,
    seen: WeakSet<object>,
    depth: number
): unknown {
  // ── Primitives ─────────────────────────────────────────────────────────────

  if (data === null || data === undefined) {
    return opts.schemaMode ? "null" : data;
  }

  if (typeof data === "boolean" || typeof data === "number") {
    return opts.schemaMode ? typeof data : data;
  }

  if (typeof data === "bigint") {
    return opts.schemaMode ? "bigint" : data.toString();
  }

  if (typeof data === "symbol") {
    return opts.schemaMode ? "symbol" : data.toString();
  }

  if (typeof data === "function") {
    // Functions carry no meaningful content for an LLM — replace with a marker
    return opts.schemaMode ? "function" : "[Function]";
  }

  // ── Strings ────────────────────────────────────────────────────────────────

  if (typeof data === "string") {
    if (opts.schemaMode) return "string";
    return trimString(data, opts.maxStringLength);
  }

  // ── Objects & Arrays (passed by reference — circular reference guard needed) ─

  if (typeof data === "object") {
    // Guard against circular references
    if (seen.has(data as object)) {
      return opts.circularPlaceholder;
    }
    seen.add(data as object);

    // Enforce max recursion depth
    if (depth >= opts.maxDepth) {
      seen.delete(data as object);
      return Array.isArray(data) ? "[Array]" : "[Object]";
    }

    let result: unknown;

    if (Array.isArray(data)) {
      result = processArray(data, opts, seen, depth);
    } else {
      result = processObject(data as Record<string, unknown>, opts, seen, depth);
    }

    // Remove from seen after processing so the same object can appear in
    // sibling branches of the tree (but not in a single ancestor chain)
    seen.delete(data as object);
    return result;
  }

  // Fallback for any exotic value — coerce to string
  return String(data);
}

/**
 * Processes an array: applies truncation first, then recursively processes each element.
 */
function processArray(
    arr: unknown[],
    opts: Required<ShrinkOptions>,
    seen: WeakSet<object>,
    depth: number
): unknown[] {
  // Truncate before recursing so we never process discarded elements
  const truncated = truncateArray(arr, opts.maxArrayItems);

  return truncated.map((item) => {
    // Truncation markers are plain strings — leave them untouched
    if (typeof item === "string" && item.startsWith("[+ ") && item.endsWith(" items]")) {
      return item;
    }
    return processValue(item, opts, seen, depth + 1);
  });
}

/**
 * Processes a plain object: in Schema Mode returns a key→type map,
 * otherwise recursively processes each value.
 */
function processObject(
    obj: Record<string, unknown>,
    opts: Required<ShrinkOptions>,
    seen: WeakSet<object>,
    depth: number
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    if (opts.schemaMode) {
      // In schema mode, recurse into nested objects/arrays to reveal their structure
      if (value !== null && typeof value === "object") {
        result[key] = processValue(value, opts, seen, depth + 1);
      } else {
        result[key] = getTypeName(value);
      }
    } else {
      result[key] = processValue(value, opts, seen, depth + 1);
    }
  }

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compresses arbitrary data for use in LLM prompts with minimal token cost.
 *
 * The algorithm performs a single O(n) pass over the data tree,
 * where n is the total number of nodes.
 *
 * @param data    - Input data: object, array, string, or primitive
 * @param options - Compression options (all optional, defaults apply)
 * @returns A compressed copy of the data (the original is never mutated)
 *
 * @example
 * ```ts
 * import { shrink } from '@sigmalion/ai-context-shrink';
 *
 * const result = shrink({ name: 'Alice', tags: [1,2,3,4,5,6,7,8] });
 * // { name: 'Alice', tags: [1, 2, 3, '[+ 2 items]', 7, 8] }
 * ```
 */
export function shrink(data: unknown, options: ShrinkOptions = {}): unknown {
  // Merge caller options on top of defaults
  const opts: Required<ShrinkOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // WeakSet only holds objects (not primitives) — exactly what we need here
  const seen = new WeakSet<object>();

  return processValue(data, opts, seen, 0);
}

/**
 * Convenience wrapper: compresses data and serializes it to a JSON string.
 * Useful for direct insertion into a prompt.
 *
 * @param data    - Input data
 * @param options - Compression options
 * @param space   - Indentation for JSON.stringify (optional, improves readability)
 * @returns JSON string of the compressed data
 *
 * @example
 * ```ts
 * const prompt = `Here is the context:\n${shrinkToString(myData)}`;
 * ```
 */
export function shrinkToString(
    data: unknown,
    options: ShrinkOptions = {},
    space?: string | number
): string {
  return JSON.stringify(shrink(data, options), null, space);
}

/**
 * Convenience wrapper: returns only the schema (structure) of the data.
 * Equivalent to calling `shrink(data, { schemaMode: true })`.
 *
 * @param data    - Input data
 * @param options - Additional options (schemaMode is forced to true)
 * @returns Data schema: an object tree with type names in place of values
 *
 * @example
 * ```ts
 * schema({ id: 1, name: 'Bob', active: true });
 * // { id: 'number', name: 'string', active: 'boolean' }
 * ```
 */
export function schema(data: unknown, options: Omit<ShrinkOptions, "schemaMode"> = {}): unknown {
  return shrink(data, { ...options, schemaMode: true });
}

// Exported so users can reference or extend the defaults in their own config
export { DEFAULT_OPTIONS };