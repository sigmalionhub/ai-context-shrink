/**
 * Tests for ai-context-shrink
 * Run: npx tsx index.test.ts
 */

import { shrink, shrinkToString, schema } from "./index.js";

// ─── Minimal Test Runner ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${(err as Error).message}`);
    failed++;
  }
}

function expect(actual: unknown) {
  return {
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) {
        throw new Error(`Expected:\n     ${e}\n     Got:\n     ${a}`);
      }
    },
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
      }
    },
    toContain(substr: string) {
      if (typeof actual !== "string" || !actual.includes(substr)) {
        throw new Error(`Expected "${String(actual)}" to contain "${substr}"`);
      }
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log("\n🧪 ai-context-shrink — tests\n");

// 1. Primitives
console.log("Primitives:");

test("numbers pass through unchanged", () => {
  expect(shrink(42)).toBe(42);
});

test("booleans pass through unchanged", () => {
  expect(shrink(true)).toBe(true);
});

test("null is returned as null", () => {
  expect(shrink(null)).toBe(null);
});

test("undefined is returned as undefined", () => {
  expect(shrink(undefined)).toBe(undefined);
});

// 2. Strings
console.log("\nStrings:");

test("short string is not truncated", () => {
  expect(shrink("hello")).toBe("hello");
});

test("long string is truncated to 100 chars + '...'", () => {
  const long = "a".repeat(150);
  const result = shrink(long) as string;
  expect(result.length).toBe(103); // 100 + "..."
  expect(result.endsWith("...")).toBe(true);
});

test("string is truncated to custom maxStringLength", () => {
  const result = shrink("abcdefghij", { maxStringLength: 5 }) as string;
  expect(result).toBe("abcde...");
});

// 3. Arrays — Smart Array Truncation
console.log("\nSmart Array Truncation:");

test("small array is not truncated", () => {
  expect(shrink([1, 2, 3])).toEqual([1, 2, 3]);
});

test("array of 7 elements is truncated (maxArrayItems=3)", () => {
  const result = shrink([1, 2, 3, 4, 5, 6, 7], { maxArrayItems: 3 }) as unknown[];
  expect(result).toEqual([1, 2, 3, "[+ 1 items]", 5, 6, 7]);
});

test("array exactly at threshold is not truncated", () => {
  // maxArrayItems=3 → threshold = 6. Array of 6 — not truncated.
  const result = shrink([1, 2, 3, 4, 5, 6], { maxArrayItems: 3 }) as unknown[];
  expect(result).toEqual([1, 2, 3, 4, 5, 6]);
});

test("truncation marker contains the correct number of skipped items", () => {
  const result = shrink(Array.from({ length: 10 }, (_, i) => i), { maxArrayItems: 2 }) as unknown[];
  expect(result).toEqual([0, 1, "[+ 6 items]", 8, 9]);
});

// 4. Objects
console.log("\nObjects:");

test("string values inside objects are trimmed", () => {
  const obj = { name: "Bob", bio: "x".repeat(200) };
  const result = shrink(obj, { maxStringLength: 10 }) as Record<string, unknown>;
  expect(result.name).toBe("Bob");
  expect((result.bio as string).endsWith("...")).toBe(true);
  expect((result.bio as string).length).toBe(13);
});

test("nested objects are processed recursively", () => {
  const obj = { user: { name: "Alice", tags: [1, 2, 3, 4, 5] } };
  const result = shrink(obj, { maxArrayItems: 2 }) as any;
  expect(result.user.tags).toEqual([1, 2, "[+ 1 items]", 4, 5]);
});

// 5. Circular References
console.log("\nCircular References:");

test("circular reference does not throw", () => {
  const obj: Record<string, unknown> = { name: "loop" };
  obj.self = obj; // cycle!
  const result = shrink(obj) as Record<string, unknown>;
  expect(result.self).toBe("[Circular]");
});

test("custom circularPlaceholder is applied", () => {
  const arr: unknown[] = [1, 2];
  arr.push(arr); // cycle inside array
  const result = shrink(arr, { circularPlaceholder: "<LOOP>" }) as unknown[];
  expect(result[2]).toBe("<LOOP>");
});

test("same object in different branches is not marked as circular", () => {
  const shared = { x: 1 };
  const obj = { a: shared, b: shared }; // same object in two places — NOT a cycle
  const result = shrink(obj) as Record<string, unknown>;
  expect(result.a).toEqual({ x: 1 });
  expect(result.b).toEqual({ x: 1 });
});

// 6. Schema Mode
console.log("\nSchema Mode:");

test("schema() returns type names instead of values", () => {
  const result = schema({ id: 1, name: "Alice", active: true });
  expect(result).toEqual({ id: "number", name: "string", active: "boolean" });
});

test("schema() correctly handles nested objects", () => {
  const result = schema({ user: { age: 30, tags: ["a", "b"] } }) as any;
  expect(result.user.age).toBe("number");
  expect(result.user.tags).toEqual(["string", "string"]);
});

test("schema() handles null", () => {
  const result = schema({ val: null }) as any;
  expect(result.val).toBe("null");
});

// 7. Max Depth
console.log("\nMax Depth:");

test("objects deeper than maxDepth are replaced with '[Object]'", () => {
  const deep = { a: { b: { c: { d: "deep" } } } };
  const result = shrink(deep, { maxDepth: 2 }) as any;
  expect(result.a.b).toBe("[Object]");
});

// 8. shrinkToString
console.log("\nshrinkToString:");

test("shrinkToString returns valid JSON", () => {
  const str = shrinkToString({ x: [1, 2, 3, 4, 5] }, { maxArrayItems: 2 });
  const parsed = JSON.parse(str);
  expect(parsed.x[2]).toBe("[+ 1 items]");
});

// 9. Special Values
console.log("\nSpecial Values:");

test("functions are replaced with '[Function]'", () => {
  const obj = { fn: () => 42, val: 1 };
  const result = shrink(obj) as any;
  expect(result.fn).toBe("[Function]");
});

test("BigInt is serialized to string", () => {
  const result = shrink(BigInt(9007199254740991));
  expect(result).toBe("9007199254740991");
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Result: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}