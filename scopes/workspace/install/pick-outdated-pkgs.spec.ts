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
    // @ts-ignore
    expect(stripped).toMatchSnapshot();
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
    // @ts-ignore
    expect(stripped).toMatchSnapshot();
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
