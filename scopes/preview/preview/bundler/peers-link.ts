import { join } from 'path';
import { writeFile } from 'fs-extra';
import camelcase from 'camelcase';
import hash from 'object-hash';

export async function writePeerLink(peers: string[], workdir: string) {
  const content = generatePeerLink(peers);
  const fullpath = join(workdir, `peers-link.${hash(content)}.js`);

  await writeFile(fullpath, content);

  return fullpath;
}

// TODO - use a better strategy like umd, systemjs, or jsonp

export function generatePeerLink(peers: string[]) {
  if (!peers) return '';

  const links = peers.map((p) => ({
    packageName: p,
    varName: toVarName(p),
  }));

  return `// @ts-nocheck
${links.map((x) => `import * as ${x.varName} from "${x.packageName}"`).join(';\n')};

const globalObj = window;

${links.map(({ varName: localName }) => `guard("${localName}", ${localName})`).join(';\n')};

${links.map((x) => `globalObj["${x.varName}"] = ${x.varName}`).join(';\n')};

function guard(property, expected) {
  var existing = globalObj[property];

  if (existing === expected && expected !== undefined)
    console.warn('[expose-peers] "' + property + '" already exists in global scope, but with correct value');
  else if (existing !== undefined)
    throw new Error('[expose-peers] "' + property + '" already exists in the global scope, cannot overwrite');
}
`;
}

function toVarName(packageName: string) {
  return camelcase(packageName.replace('@', '__').replace('/', '_'), { pascalCase: true });
}
