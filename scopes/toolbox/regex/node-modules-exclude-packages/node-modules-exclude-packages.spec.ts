import { nodeModulesExcludePackages } from './node-modules-exclude-packages';

describe('nodeModulesExcludePackages()', () => {
  it('should return an empty regex when the received array is empty', () => {
    expect(nodeModulesExcludePackages({ packages: [] })).toEqual('node_modules/(?!()/)');
  });
  it('should return a regex when the received array is not empty', () => {
    const packagesToTransform = [
      'lit',
      '@lit',
      'testing-library__dom',
      '@open-wc',
      'lit-html',
      'lit-element',
      'pure-lit',
      'lit-element-state-decoupler',
    ];
    expect(nodeModulesExcludePackages({ packages: packagesToTransform })).toEqual(
      'node_modules/(?!(lit|.pnpm/registry.npmjs.org/lit.*|@lit|.pnpm/registry.npmjs.org/@lit.*|.pnpm/@lit.*|testing-library__dom|.pnpm/registry.npmjs.org/testing-library__dom.*|.pnpm/testing-library__dom.*|@open-wc|.pnpm/registry.npmjs.org/@open-wc.*|.pnpm/@open-wc.*|lit-html|.pnpm/registry.npmjs.org/lit-html.*|.pnpm/lit-html.*|lit-element|.pnpm/registry.npmjs.org/lit-element.*|.pnpm/lit-element.*|pure-lit|.pnpm/registry.npmjs.org/pure-lit.*|.pnpm/pure-lit.*|lit-element-state-decoupler|.pnpm/registry.npmjs.org/lit-element-state-decoupler.*|.pnpm/lit-element-state-decoupler.*)/)'
    );
  });
});
