import { ComponentID } from '@teambit/component';
import { makeOutdatedPkgChoices } from './pick-outdated-pkgs';

describe('makeOutdatedPkgChoices', () => {
  it('should render choices in correct order', () => {
    const choices = makeOutdatedPkgChoices([
      {
        name: 'zoo',
        currentRange: '1.0.0',
        latestRange: '1.1.0',
        source: 'rootPolicy',
        targetField: 'devDependencies',
      },
      {
        name: 'qar',
        currentRange: '1.0.0',
        latestRange: '1.1.0',
        source: 'rootPolicy',
        targetField: 'dependencies',
      },
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
        componentId: ComponentID.fromString('scope/comp1'),
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
  it('should group component model updates of the same dependency', () => {
    const choices = makeOutdatedPkgChoices([
      {
        name: 'foo',
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        source: 'component-model',
        componentId: ComponentID.fromString('scope/comp1'),
        targetField: 'devDependencies',
      },
      {
        name: 'foo',
        currentRange: '1.1.0',
        latestRange: '2.0.0',
        source: 'component-model',
        componentId: ComponentID.fromString('scope/comp2'),
        targetField: 'dependencies',
      },
    ]);
    // @ts-ignore
    expect(choices).toMatchSnapshot();
  });
  it("should group component model updates of the same dependency and use * as current range when can't compare ranges", () => {
    const choices = makeOutdatedPkgChoices([
      {
        name: 'foo',
        currentRange: '<=10.0.0',
        latestRange: '2.0.0',
        source: 'component-model',
        componentId: ComponentID.fromString('scope/comp1'),
        targetField: 'dependencies',
      },
      {
        name: 'foo',
        currentRange: '1.1.0',
        latestRange: '2.0.0',
        source: 'component-model',
        componentId: ComponentID.fromString('scope/comp2'),
        targetField: 'dependencies',
      },
    ]);
    // @ts-ignore
    expect(choices).toMatchSnapshot();
  });
  it('should group component model updates of the same dependency and display the current range when all components use the same range', () => {
    const choices = makeOutdatedPkgChoices([
      {
        name: 'foo',
        currentRange: '^1.2.3',
        latestRange: '2.0.0',
        source: 'component-model',
        componentId: ComponentID.fromString('scope/comp1'),
        targetField: 'dependencies',
      },
      {
        name: 'foo',
        currentRange: '^1.2.3',
        latestRange: '2.0.0',
        source: 'component-model',
        componentId: ComponentID.fromString('scope/comp2'),
        targetField: 'dependencies',
      },
    ]);
    // @ts-ignore
    expect(choices).toMatchSnapshot();
  });
});
