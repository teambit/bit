#!/usr/bin/env node
/**
 * Guards the generated CLI reference against commands that come from outside this repo.
 *
 * `bit cli generate` reports whatever the running binary has loaded. A developer whose bit also
 * loads an aspect from another workspace gets that workspace's commands in the output, and
 * committing it publishes them. Those commands carry a `group` that nothing here registers, so
 * that is what this checks: every command in cli-reference.json must sit in a group declared by
 * this repo, either in cli/command-groups.ts or through a `cli.registerGroup()` call.
 *
 * Usage:
 *   node check-cli-reference-groups.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const referencePath = path.join(repoRoot, 'scopes/harmony/cli-reference/cli-reference.json');

function declaredGroups() {
  const groupsFile = fs.readFileSync(path.join(repoRoot, 'scopes/harmony/cli/command-groups.ts'), 'utf8');
  // the keys of the two group objects, quoted ('workspace-setup') or bare (collaborate)
  const fromGroupsFile = [...groupsFile.matchAll(/^\s{2}'?([a-z][a-z-]*)'?:\s*'/gm)].map((match) => match[1]);
  const registered = execFileSync('grep', ['-rhoE', "registerGroup\\(\\s*'[^']+'", 'scopes', 'components'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const fromRegisterCalls = [...registered.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return new Set([...fromGroupsFile, ...fromRegisterCalls]);
}

const known = declaredGroups();
const commands = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
const foreign = commands.filter((command) => command.group && !known.has(command.group));

if (!foreign.length) {
  console.log(`PASS: all ${commands.length} commands belong to a group declared in this repo`);
  process.exit(0);
}

const groups = [...new Set(foreign.map((command) => command.group))];
console.error(
  `\n${foreign.length} command(s) in the CLI reference belong to group(s) this repo does not declare: ${groups.join(', ')}

They come from an aspect loaded by your bit but defined elsewhere, and must not be committed here.
Restore the file and regenerate with a bit that does not load it:

   git checkout -- scopes/harmony/cli-reference/cli-reference.json
`
);
process.exit(1);
