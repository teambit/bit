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

// TODO - this exposes the packages in the "window" strategy,
// should use a better strategy like umd, systemjs, or jsonp

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

${links.map((x) => `globalObj["${x.varName}"] = exposeNamespace(${x.varName})`).join(';\n')};

function exposeNamespace(ns) {
  // when a consumer is bundled as ESM and does \`import x from 'pkg'\` then \`x()\`,
  // webpack may emit a direct call on the external value with no interop helper.
  // the namespace object isn't callable, so wrap it in a function that proxies
  // to the default export while preserving named exports, \`default\`, and the
  // \`__esModule\` flag (so consumers that DO use interop still get the default).
  if (!ns || typeof ns !== 'object') return ns;
  var def = ns.default;
  if (typeof def !== 'function') return ns;
  var wrapper = function () { return def.apply(this, arguments); };
  for (var k in ns) {
    if (k !== 'default') {
      try { wrapper[k] = ns[k]; } catch (e) { /* readonly key, ignore */ }
    }
  }
  wrapper.default = def;
  wrapper.__esModule = true;
  return wrapper;
}

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
