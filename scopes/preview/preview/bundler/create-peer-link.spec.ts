import { expect } from 'chai';
import { generatePeerLink } from './create-peers-link';

const guardSnapshot = `function guard(property, expected) {
  var existing = globalObj[property];

  if (existing === expected && expected !== undefined)
    console.warn('[expose-peers] "' + property + '" already exists in global scope, but with correct value');
  else if (existing !== undefined)
    throw new Error('[expose-peers] "' + property + '" already exists in the global scope, cannot overwrite');
}`;

const exposeNamespaceSnapshot = `function exposeNamespace(ns) {
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
}`;

const snapshot = `// @ts-nocheck
import * as FooBar from "foo-bar";
import * as BuzQux from "@buz/qux";

const globalObj = window;

guard("FooBar", FooBar);
guard("BuzQux", BuzQux);

globalObj["FooBar"] = exposeNamespace(FooBar);
globalObj["BuzQux"] = exposeNamespace(BuzQux);

${exposeNamespaceSnapshot}

${guardSnapshot}
`;

describe('peers link', () => {
  it('should output snapshot', () => {
    const result = generatePeerLink(['foo-bar', '@buz/qux']);

    expect(result).to.equal(snapshot);
  });
});
