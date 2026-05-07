# ai-context-shrink

> Compress objects and text to minimize LLM tokens while keeping it readable.

[![npm version](https://img.shields.io/npm/v/@sigmalion/ai-context-shrink.svg)](https://www.npmjs.com/package/@sigmalion/ai-context-shrink)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

## The Problem

You're passing large objects or long texts into an LLM prompt, and you're burning through tokens on repetitive array items, huge string fields, or data you don't need.

**ai-context-shrink** trims the fat in a single pass — no external dependencies, no surprises.

---

## Install

```bash
npm install @sigmalion/ai-context-shrink
```

---

## Quick Start

```ts
import { shrink, schema, shrinkToString } from '@sigmalion/ai-context-shrink';

const data = {
  userId: 42,
  name: "Roman",
  bio: "A".repeat(300),             // very long string
  tags: [1, 2, 3, 4, 5, 6, 7, 8],  // large array
  address: {
    city: "Kharkiv",
    zip: "61000"
  }
};

// Standard compression
const compressed = shrink(data);
/*
{
  userId: 42,
  name: 'Roman',
  bio: 'AAAA...AAAA...',            // truncated to 100 chars
  tags: [ 1, 2, 3, '[+ 2 items]', 6, 7, 8 ],
  address: { city: 'Kharkiv', zip: '61000' }
}
*/

// Schema only (structure without data)
const structure = schema(data);
/*
{
  userId: 'number',
  name: 'string',
  bio: 'string',
  tags: [ 'number', 'number', 'number', '[+ 2 items]', 'number', 'number', 'number' ],
  address: { city: 'string', zip: 'string' }
}
*/

// Directly to string for prompt insertion
const prompt = `Context:\n${shrinkToString(data, {}, 2)}`;
```

---

## API

### `shrink(data, options?)`

Primary function. Accepts any value and returns a compressed copy.

```ts
shrink(data: unknown, options?: ShrinkOptions): unknown
```

### `schema(data, options?)`

Returns the data schema (types instead of values). Equivalent to `shrink(data, { schemaMode: true })`.

```ts
schema(data: unknown, options?: Omit<ShrinkOptions, 'schemaMode'>): unknown
```

### `shrinkToString(data, options?, space?)`

Compresses and serializes to a JSON string for direct prompt insertion.

```ts
shrinkToString(data: unknown, options?: ShrinkOptions, space?: string | number): string
```

---

## Options

| Параметр             | Тип       | По умолчанию   | Описание                                               |
|----------------------|-----------|----------------|--------------------------------------------------------|
| `maxArrayItems`      | `number`  | `3`            | Number of elements kept at the start and end of arrays |
| `maxStringLength`    | `number`  | `100`          | Maximum string length (characters)                     |
| `schemaMode`         | `boolean` | `false`        | Returns a schema of types instead of values            |
| `maxDepth`           | `number`  | `10`           | Maximum recursion depth                                |
| `circularPlaceholder`| `string`  | `"[Circular]"` | Placeholder for circular references                    |

---

## Features

- **⚡ Single Pass** — O(n) traversal of the data tree
- **✂️ Smart Array Truncation** — `[1, 2, 3, "[+ 5 items]", 9, 10]`
- **📏 Value Trimming** — Long strings are truncated with a `"..."` suffix
- **🗺️ Schema Mode** — Data structure without the values
- **🔄 Circular Safe** — Circular reference protection via `WeakSet`
- **0️⃣ Zero Dependencies** — Pure TypeScript, no dependencies
- **📦 ESM + CJS** — Works everywhere: Node.js, bundlers, edge runtimes

---

## Circular References

The package safely handles objects with circular references:

```ts
const obj: any = { name: 'loop' };
obj.self = obj;

shrink(obj);
// { name: 'loop', self: '[Circular]' }
```

---

## License

MIT
