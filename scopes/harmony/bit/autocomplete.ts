import fs from 'fs-extra';
import json from 'comment-json';

// const log = (msg) => fs.writeFileSync('compilation.log', `${msg}\n`);

const supportedCommands = ['show'];

export function autocomplete() {
  if (supportedCommands.every((command) => !process.argv.includes(command))) {
    return;
  }
  const compIds = getCompsFromBitmap();
  process.stdout.write(compIds.join('\n'));
  process.exit(0);
}

function getCompsFromBitmap() {
  const bitMap = fs.readFileSync('.bitmap');
  const componentsJson = json.parse(bitMap.toString('utf8'), undefined, true);
  const compIds: string[] = [];
  Object.keys(componentsJson).forEach((componentId) => {
    if (componentId === '$schema-version') return;
    const value = componentsJson[componentId];
    const scope = value.scope || value.defaultScope;
    const name = value.name;
    compIds.push(`${scope}/${name}`);
  });
  return compIds;
}
