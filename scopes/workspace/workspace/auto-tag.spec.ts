import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { getAutoTagInfoFromComponents } from './auto-tag';

const H1 = '1'.repeat(40);
const H2 = '2'.repeat(40);
const HB = 'b'.repeat(40);

function createComponent(id: string, deps: string[] = [], depsFromConfig: string[] = []): ConsumerComponent {
  const componentId = ComponentID.fromString(id);
  return {
    id: componentId,
    componentId,
    getAllDependencies: () => deps.map((dep) => ({ id: ComponentID.fromString(dep) })),
    isDependencyVersionFromConfig: (depId: ComponentID) => depsFromConfig.includes(depId.toStringWithoutVersion()),
  } as any;
}

const idsOf = (results: ReturnType<typeof getAutoTagInfoFromComponents>) =>
  results.map((result) => result.component.id.toStringWithoutVersion());

describe('getAutoTagInfoFromComponents()', () => {
  const tooltip = ComponentIdList.fromStringArray([`my-scope/tooltip@${'a'.repeat(40)}`]);
  const noticeTooltip = createComponent(`my-scope/notice-tooltip@${H1}`, [`my-scope/tooltip@${HB}`]);

  it('should return a component that depends on another version of the changed component', () => {
    expect(idsOf(getAutoTagInfoFromComponents([noticeTooltip], tooltip))).to.deep.equal(['my-scope/notice-tooltip']);
  });
  it('should return the dependents of a dependent, triggered by the changed component', () => {
    const inputText = createComponent(`my-scope/input-text@${H2}`, [`my-scope/notice-tooltip@${H1}`]);
    const results = getAutoTagInfoFromComponents([inputText, noticeTooltip], tooltip);
    expect(idsOf(results)).to.deep.equal(['my-scope/input-text', 'my-scope/notice-tooltip']);
    results.forEach((result) => {
      expect(result.triggeredBy.map((id) => id.toStringWithoutVersion())).to.deep.equal(['my-scope/tooltip']);
    });
  });
  it('should not return a component that does not depend on the changed component', () => {
    const avatar = createComponent(`my-scope/avatar@${H1}`, ['my-scope/icon@0.0.1']);
    expect(getAutoTagInfoFromComponents([avatar], tooltip)).to.have.lengthOf(0);
  });
  it('should not return a component that depends on the changed component through a component that is not passed', () => {
    const textArea = createComponent(`my-scope/text-area@${H1}`, ['my-scope/notice-tooltip@0.0.16']);
    expect(getAutoTagInfoFromComponents([textArea], tooltip)).to.have.lengthOf(0);
  });
  it('should not return a component that has the dependency version set in its config', () => {
    const pinned = createComponent(`my-scope/notice-tooltip@${H1}`, [`my-scope/tooltip@${HB}`], ['my-scope/tooltip']);
    expect(getAutoTagInfoFromComponents([pinned], tooltip)).to.have.lengthOf(0);
  });
  it('should not downgrade a component that depends on a higher tag', () => {
    const dependent = createComponent('my-scope/notice-tooltip@0.0.2', ['my-scope/tooltip@0.0.5']);
    const tooltipTag = ComponentIdList.fromStringArray(['my-scope/tooltip@0.0.4']);
    expect(getAutoTagInfoFromComponents([dependent], tooltipTag)).to.have.lengthOf(0);
  });
  it('should handle a cycle between the components', () => {
    const first = createComponent(`my-scope/first@${H1}`, [`my-scope/second@${H2}`, `my-scope/tooltip@${HB}`]);
    const second = createComponent(`my-scope/second@${H2}`, [`my-scope/first@${H1}`]);
    expect(idsOf(getAutoTagInfoFromComponents([first, second], tooltip))).to.deep.equal([
      'my-scope/first',
      'my-scope/second',
    ]);
  });
});
