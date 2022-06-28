import { generatePeerLink } from './peers-link';

const guardSnapshot = `function guard(property, expected) {
  var existing = globalObj[property];

  if (existing === expected && expected !== undefined)
    console.warn('[expose-peers] "' + property + '" already exists in global scope, but with correct value');
  else if (existing !== undefined)
    throw new Error('[expose-peers] "' + property + '" already exists in the global scope, cannot overwrite');
}`;

const snapshot = `// @ts-nocheck
import * as FooBar from "foo-bar";
import * as BuzQux from "@buz/qux";

const globalObj = window;

guard("FooBar", FooBar);
guard("BuzQux", BuzQux);

globalObj["FooBar"] = FooBar;
globalObj["BuzQux"] = BuzQux;

${guardSnapshot}
`;

describe('peers link', () => {
  it('should output snapshot', () => {
    const result = generatePeerLink(['foo-bar', '@buz/qux']);

    expect(result).toEqual(snapshot);
  });
});
