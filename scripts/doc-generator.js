#!/usr/bin/env node
/**
 * Generates all commands for the doc
 */

const fs = require('fs-extra');

const cli = require('../dist/cli').default;
const allCommands = require('../dist/cli/templates/all-help').allCommands;

const generateCommand = c => {
  console.log(c);
  let result = `\n`;
  result += `## ${c._name}  \n`;
  if (c.alias && c.alias.length > 0) {
    result += `**Alias**: \`${c.alias}\`  \n`;
  }
  result += `**Workspace only**: ${c.workspace ? 'yes' : 'no'}  \n`;
  result += `**Description**: ${c._description}  \n\n`;
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

  if (c.documentation) {
    result += `Read more [here](${c.documentation})  \n\n`;
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
//console.log(commands);

let output = commands.map(generateCommand).join('\n');
fs.writeFileSync('dist/cli.md', output);
