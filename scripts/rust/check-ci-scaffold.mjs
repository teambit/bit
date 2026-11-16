#!/usr/bin/env node
// Keep the bundled onboarding assets byte-identical to the upstream template literals.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'scopes/git/ci/sync');
const target = path.join(root, 'native/cli/src/commands/ci/init');
const text = fs.readFileSync(path.join(source, 'init-scaffold.ts'), 'utf8');
for (const [constant, filename] of [
  ['BIT_SYNC_WORKFLOW_RAW', 'bit-sync.yml'],
  ['BIT_RELEASE_WORKFLOW_RAW', 'bit-release.yml'],
]) {
  const literal = text.match(new RegExp('const ' + constant + ' = `((?:\\\\[\\s\\S]|[^`])*)`;'));
  assert.ok(literal, `${constant}: upstream template literal missing`);
  const tokens = literal[1].match(/\\[\s\S]|[^\\]/g) || [];
  const cooked = tokens.map((token, index) => {
    assert.ok(token !== '$' || tokens[index + 1] !== '{', `${constant}: unexpected interpolation`);
    if (!token.startsWith('\\')) return token;
    assert.ok(['\\`', '\\$', '\\\\'].includes(token), `${constant}: unsupported template escape`);
    return token.slice(1);
  }).join('');
  assert.equal(fs.readFileSync(path.join(target, filename), 'utf8'), cooked, `${filename}: upstream asset drift`);
}
assert.equal(
  fs.readFileSync(path.join(target, 'agents-section.md'), 'utf8'),
  fs.readFileSync(path.join(source, 'agents-sync-section.md'), 'utf8'),
  'agent instructions: upstream asset drift'
);
