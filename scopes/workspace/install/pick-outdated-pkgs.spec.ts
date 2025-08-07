import { expect } from 'chai';
import stripAnsi from 'strip-ansi';
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
    // Removing the ansi chars for better work on bit build on ci
    const stripped = stripAnsiFromChoices(choices);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    expect(stripped).to.deep.equal(orderedChoices);
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
    // Removing the ansi chars for better work on bit build on ci
    const stripped = stripAnsiFromChoices(choices);
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    expect(stripped).to.deep.equal(contextOrders);
  });
});

function stripAnsiFromChoices(choices) {
  choices.forEach((choice) => {
    choice.message = stripAnsi(choice.message);
    choice.choices.forEach((currChoice) => {
      currChoice.message = stripAnsi(currChoice.message);
    });
  });
  return choices;
}

const orderedChoices = [
  {
    choices: [
      {
        message: 'foo (runtime) 1.0.0 ❯ 2.0.0   ',
        name: 'foo',
        value: {
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'foo',
          source: 'rootPolicy',
          targetField: 'dependencies',
        },
      },
      {
        message: 'qar (runtime) 1.0.0 ❯ 1.1.0   ',
        name: 'qar',
        value: {
          currentRange: '1.0.0',
          latestRange: '1.1.0',
          name: 'qar',
          source: 'rootPolicy',
          targetField: 'dependencies',
        },
      },
      {
        message: 'zoo (dev)     1.0.0 ❯ 1.1.0   ',
        name: 'zoo',
        value: {
          currentRange: '1.0.0',
          latestRange: '1.1.0',
          name: 'zoo',
          source: 'rootPolicy',
          targetField: 'devDependencies',
        },
      },
      {
        message: 'bar (peer)    1.0.0 ❯ 1.1.0   ',
        name: 'bar',
        value: {
          currentRange: '1.0.0',
          latestRange: '1.1.0',
          name: 'bar',
          source: 'rootPolicy',
          targetField: 'peerDependencies',
        },
      },
    ],
    message: 'Root policies',
  },
];

const contextOrders = [
  {
    choices: [
      {
        message: 'foo (runtime) 1.0.0 ❯ 2.0.0   ',
        name: 'foo',
        value: {
          componentId: ComponentID.fromString('scope/comp1'),
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'foo',
          source: 'component',
          targetField: 'dependencies',
        },
      },
    ],
    message: 'scope/comp1 (component)',
  },
  {
    choices: [
      {
        message: 'bar (peer)    1.0.0 ❯ 1.1.0   ',
        name: 'bar',
        value: {
          currentRange: '1.0.0',
          latestRange: '1.1.0',
          name: 'bar',
          source: 'variants',
          targetField: 'peerDependencies',
          variantPattern: '{comp2}',
        },
      },
    ],
    message: '{comp2} (variant)',
  },
];
