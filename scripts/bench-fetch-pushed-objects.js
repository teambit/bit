#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Benchmark: ObjectsReadableGenerator.push, the step that keeps each object a scope streams to a client once
 * (fetch / import). It pushes N objects, then half of them again, as versions that share sources do.
 *
 * Usage (after `bit compile scopes/scope/objects`):
 *   node scripts/bench-fetch-pushed-objects.js [sizes...]     default: 20000 50000 100000
 */
const { createHash } = require('crypto');
const { ObjectsReadableGenerator, Ref } = require('@teambit/objects');

const sha = (i) => createHash('sha1').update(String(i)).digest('hex');

function run(n) {
  const generator = new ObjectsReadableGenerator({}, () => {});
  const items = Array.from({ length: n }, (_, i) => ({ ref: new Ref(sha(i)), buffer: Buffer.alloc(0) }));
  const withRepeats = [...items, ...items.slice(0, Math.floor(n / 2))];
  const start = process.hrtime.bigint();
  generator.pushManyObjects(withRepeats);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const pushed = generator.pushed.size ?? generator.pushed.length;
  console.log(`objects=${n} (+${Math.floor(n / 2)} repeats)  pushed=${pushed}  ${ms.toFixed(1)} ms`);
}

const sizes = process.argv.slice(2).map(Number);
(sizes.length ? sizes : [20000, 50000, 100000]).forEach(run);
