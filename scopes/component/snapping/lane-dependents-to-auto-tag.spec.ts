import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { getLaneDependentsToAutoTag } from './lane-dependents-to-auto-tag';

function createComponent(id: string, deps: string[] = []): ConsumerComponent {
  return {
    id: ComponentID.fromString(id),
    getAllDependenciesIds: () => ComponentIdList.fromStringArray(deps),
  } as any;
}

const idsOf = (results: ReturnType<typeof getLaneDependentsToAutoTag>) =>
  results.map((result) => result.component.id.toStringWithoutVersion());

describe('getLaneDependentsToAutoTag()', () => {
  const tooltip = ComponentIdList.fromStringArray(['my-scope/tooltip@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);

  it('should return an entry that depends on another version of the snapped component', () => {
    // the entry was cascaded against a version of tooltip that is no longer the one being snapped from (e.g. the
    // other side of a merge)
    const noticeTooltip = createComponent('my-scope/notice-tooltip@1111111111111111111111111111111111111111', [
      'my-scope/tooltip@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]);
    expect(idsOf(getLaneDependentsToAutoTag([noticeTooltip], tooltip))).to.deep.equal(['my-scope/notice-tooltip']);
  });
  it('should return the dependents of a dependent, triggered by the snapped component', () => {
    const noticeTooltip = createComponent('my-scope/notice-tooltip@1111111111111111111111111111111111111111', [
      'my-scope/tooltip@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]);
    // listed first, so it's found only after notice-tooltip is
    const inputText = createComponent('my-scope/input-text@2222222222222222222222222222222222222222', [
      'my-scope/notice-tooltip@1111111111111111111111111111111111111111',
    ]);
    const results = getLaneDependentsToAutoTag([inputText, noticeTooltip], tooltip);
    expect(idsOf(results)).to.deep.equal(['my-scope/input-text', 'my-scope/notice-tooltip']);
    results.forEach((result) => {
      expect(result.triggeredBy.map((id) => id.toString())).to.deep.equal([tooltip[0].toString()]);
    });
  });
  it('should not return an entry that does not depend on the snapped component', () => {
    const avatar = createComponent('my-scope/avatar@1111111111111111111111111111111111111111', ['my-scope/icon@0.0.1']);
    expect(getLaneDependentsToAutoTag([avatar], tooltip)).to.have.lengthOf(0);
  });
  it('should not return an entry that depends on the snapped component through a component that is not a candidate', () => {
    // notice-tooltip is not on the lane, so it keeps the old tooltip. snapping text-area again changes nothing.
    const textArea = createComponent('my-scope/text-area@1111111111111111111111111111111111111111', [
      'my-scope/notice-tooltip@0.0.16',
    ]);
    expect(getLaneDependentsToAutoTag([textArea], tooltip)).to.have.lengthOf(0);
  });
  it('should not downgrade a dependent that depends on a higher tag', () => {
    const noticeTooltip = createComponent('my-scope/notice-tooltip@0.0.2', ['my-scope/tooltip@0.0.5']);
    const tooltipTag = ComponentIdList.fromStringArray(['my-scope/tooltip@0.0.4']);
    expect(getLaneDependentsToAutoTag([noticeTooltip], tooltipTag)).to.have.lengthOf(0);
  });
  it('should handle a cycle between the candidates', () => {
    const first = createComponent('my-scope/first@1111111111111111111111111111111111111111', [
      'my-scope/second@2222222222222222222222222222222222222222',
      'my-scope/tooltip@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]);
    const second = createComponent('my-scope/second@2222222222222222222222222222222222222222', [
      'my-scope/first@1111111111111111111111111111111111111111',
    ]);
    expect(idsOf(getLaneDependentsToAutoTag([first, second], tooltip))).to.deep.equal([
      'my-scope/first',
      'my-scope/second',
    ]);
  });
});
