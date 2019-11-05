#!/usr/bin/env node
/**
 * Generates all commands for the doc
 */

const fs = require('fs-extra');

const cli = require('../dist/cli').default;
const allCommands = require('../dist/cli/templates/all-help').allCommands;

const generateCommand = c => {
  let result = `\n`;
  result += `## ${c._name}  \n`;
  if (c.alias && c.alias.length > 0) {
    result += `**Alias**: \`${c.alias}\`  \n`;
  }
  result += `**Workspace only**: ${c.skipWorkspace ? 'no' : 'yes'}  \n`;
  result += `**Description**: ${c.description.split('\n').join('  \n')}  \n\n`;
  result += `\`bit ${c.name}\`  \n  \n`;

  if (c.opts && c.opts.length > 0) {
    result += `| **Option** | **Alias** | **Description** \n`;
    result += `|---|---|---|\n`;
    c.opts.forEach(o => {
      let [alias, flag, description] = o;
      alias = alias ? '`--' + alias + '`' : '';
      flag = '`--' + flag + '`';
      result += `|${flag}|${alias}|${description}|\n`;
    });
    result += '\n';
  }

  result += `---  \n`;

  return result;
};

let br = new cli.buildRegistrar();

let commands = allCommands.reduce((acc, i) => [...acc, ...i.commands], []);
commands = commands.sort((a, b) => a.name.localeCompare(b.name));
commands = commands.map(i => {
  let c = br.commands.find(j => j.name.startsWith(i.name));
  return {
    ...c,
    _name: i.name,
    _description: i.description
  };
});

let output = `---
id: cli  
title: CLI Commands  
sidebar_label: CLI Commands  
---

Commands that are marked as workspace only must be executed inside a workspace. Commands that are marked as not workspace only, can be executed from anywhere and will run on a remote server.  \n
`;
output += commands.map(generateCommand).join('\n');
fs.writeFileSync('dist/cli.md', output);
