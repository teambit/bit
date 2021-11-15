import { makeOutdatedPkgChoices } from './pick-outdated-pkgs';

describe('makeOutdatedPkgChoices', () => {
  it('should render choices in correct order', () => {
    const choices = makeOutdatedPkgChoices([
      {
        name: 'foo',
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        source: 'rootPolicy',
        targetField: 'dependencies',
      },
      {
        name: 'bar',
        currentRange: '1.0.0',
        latestRange: '1.1.0',
        source: 'rootPolicy',
        targetField: 'peerDependencies',
      },
    ]);
    // @ts-ignore
    expect(choices).toMatchSnapshot();
  });
  it('should render choices with context information', () => {
    const choices = makeOutdatedPkgChoices([
      {
        name: 'foo',
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        source: 'component',
        componentId: 'comp1',
        targetField: 'dependencies',
      },
      {
        name: 'bar',
        currentRange: '1.0.0',
        latestRange: '1.1.0',
        source: 'variants',
        variantPattern: '{comp2}',
        targetField: 'peerDependencies',
      },
    ]);
    // @ts-ignore
    expect(choices).toMatchSnapshot();
  });
});
