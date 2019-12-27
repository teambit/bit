#!/usr/bin/env node
/**
 * Generates all commands for the doc
 */

const fs = require('fs-extra');

const cli = require('../dist/cli').default;
const allCommands = require('../dist/cli/templates/all-help').default;

const formatDescription = description => `${description.split('\n').join('  \n')}  \n\n`;

const genreateOptions = options => {
  if (!options || options.length <= 0) return '';
  let ret = `| **Option** | **Option alias** | **Description**|  \n`;
  ret += `|---|:-----:|---|\n`;
  options.forEach(o => {
    let [alias, flag, description] = o;
    alias = alias ? '-' + alias : '   ';
    flag = '--' + flag;
    ret += `|\`${flag}\`|\`${alias}\`|${description}|\n`;
  });
  ret += `\n`;
  return ret;
};

generateSubCommands = subCommands => {
  let ret = '';
  subCommands.forEach(s => {
    let name = s.name.match(/^([\w\-]+)/)[0];
    ret += `### ${name} \n`;
    ret += `**Usage**: ${s.name.replace(/([<>*()?])/g, '\\$1')}  \n\n`;
    ret += `**Description**: ${formatDescription(s.description)}`;

    ret += '\n';
    ret += genreateOptions(s.options);
  });
  return ret;
};

const generateCommand = c => {
  let result = `## ${c._name}  \n\n`;
  if (c.alias && c.alias.length > 0) {
    result += `**Alias**: \`${c.alias}\`  \n`;
  }
  result += `**Workspace only**: ${c.skipWorkspace ? 'no' : 'yes'}  \n`;
  result += `**Description**: ${formatDescription(c.description)}`;
  result += `\`bit ${c.name}\`  \n\n`;

  if (c.commands && c.commands.length > 0) {
    result += generateSubCommands(c.commands);
  }
  result += genreateOptions(c.opts);
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
id: cli-all  
title: CLI Commands   
---

Commands that are marked as workspace only must be executed inside a workspace. Commands that are marked as not workspace only, can be executed from anywhere and will run on a remote server.  
`;
output += commands.map(generateCommand).join('\n');
fs.writeFileSync('dist/cli.md', output);
