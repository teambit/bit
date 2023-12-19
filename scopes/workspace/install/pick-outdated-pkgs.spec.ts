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
    // For some reason it don't work as expected using regular snapshot (instead of inline snapshot)
    // on bit build since moving to the new core aspects env
    // which might be related to upgrade jest from 27 to 29
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    expect(choices).toMatchInlineSnapshot(orderedChoicesSnapshot);
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
    // For some reason it don't work as expected using regular snapshot (instead of inline snapshot)
    // on bit build since moving to the new core aspects env
    // which might be related to upgrade jest from 27 to 29
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    expect(choices).toMatchInlineSnapshot(contextChoicesSnapshot);
  });
});

const orderedChoicesSnapshot = `
[
  {
    "choices": [
      {
        "message": "foo [90m(runtime)[39m 1.0.0 ❯ [91m[1m2.0.0[22m[39m   ",
        "name": "foo",
        "value": {
          "currentRange": "1.0.0",
          "latestRange": "2.0.0",
          "name": "foo",
          "source": "rootPolicy",
          "targetField": "dependencies",
        },
      },
      {
        "message": "qar [90m(runtime)[39m 1.0.0 ❯ 1.[92m[1m1.0[22m[39m   ",
        "name": "qar",
        "value": {
          "currentRange": "1.0.0",
          "latestRange": "1.1.0",
          "name": "qar",
          "source": "rootPolicy",
          "targetField": "dependencies",
        },
      },
      {
        "message": "zoo [90m(dev)[39m     1.0.0 ❯ 1.[92m[1m1.0[22m[39m   ",
        "name": "zoo",
        "value": {
          "currentRange": "1.0.0",
          "latestRange": "1.1.0",
          "name": "zoo",
          "source": "rootPolicy",
          "targetField": "devDependencies",
        },
      },
      {
        "message": "bar [90m(peer)[39m    1.0.0 ❯ 1.[92m[1m1.0[22m[39m   ",
        "name": "bar",
        "value": {
          "currentRange": "1.0.0",
          "latestRange": "1.1.0",
          "name": "bar",
          "source": "rootPolicy",
          "targetField": "peerDependencies",
        },
      },
    ],
    "message": "[36mRoot policies[39m",
  },
]
`;

const contextChoicesSnapshot = `
[
  {
    "choices": [
      {
        "message": "foo [90m(runtime)[39m 1.0.0 ❯ [91m[1m2.0.0[22m[39m   ",
        "name": "foo",
        "value": {
          "componentId": ComponentID {
            "_legacy": BitId {
              "box": undefined,
              "name": "comp1",
              "scope": "scope",
              "version": "latest",
            },
            "_scope": undefined,
          },
          "currentRange": "1.0.0",
          "latestRange": "2.0.0",
          "name": "foo",
          "source": "component",
          "targetField": "dependencies",
        },
      },
    ],
    "message": "[36mscope/comp1 (component)[39m",
  },
  {
    "choices": [
      {
        "message": "bar [90m(peer)[39m    1.0.0 ❯ 1.[92m[1m1.0[22m[39m   ",
        "name": "bar",
        "value": {
          "currentRange": "1.0.0",
          "latestRange": "1.1.0",
          "name": "bar",
          "source": "variants",
          "targetField": "peerDependencies",
          "variantPattern": "{comp2}",
        },
      },
    ],
    "message": "[36m{comp2} (variant)[39m",
  },
]
`;
