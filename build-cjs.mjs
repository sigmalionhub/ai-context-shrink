/**
 * Simple script that wraps the ESM build output in a CJS-compatible bundle.
 * Run after tsc with: node scripts/build-cjs.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";

const esmContent = readFileSync("./dist/index.js", "utf8");

// Convert ESM exports to CJS
const cjsContent = `'use strict';

${esmContent
  // export function X → strip export keyword, re-export at the bottom
  .replace(/^export function /gm, "function ")
  .replace(/^export const /gm, "const ")
  .replace(/^export \{[^}]+\};?\n?/gm, "")
}

// CJS exports
Object.defineProperty(exports, '__esModule', { value: true });
exports.shrink = shrink;
exports.shrinkToString = shrinkToString;
exports.schema = schema;
exports.DEFAULT_OPTIONS = DEFAULT_OPTIONS;
`;

mkdirSync("./dist", { recursive: true });
writeFileSync("./dist/index.cjs", cjsContent);
console.log("✅ CJS bundle created: dist/index.cjs");
