import type { ComponentAspectData } from '@teambit/component.ui.component-compare.compare-aspects.models.component-compare-aspects-model';
import { getAspectStatus } from './compare-aspects.widgets';

const aspect = (config?: Record<string, unknown>, data?: Record<string, unknown>) =>
  ({ id: 'example.aspect', config, data }) as ComponentAspectData;

describe('getAspectStatus', () => {
  it('classifies whole-aspect presence as new or deleted', () => {
    expect(getAspectStatus(aspect(), undefined)).toBe('deleted');
    expect(getAspectStatus(undefined, aspect())).toBe('new');
  });

  it('classifies nested config or data presence changes as modified', () => {
    expect(getAspectStatus(aspect(undefined, {}), aspect({}, {}))).toBe('modified');
    expect(getAspectStatus(aspect({}, {}), aspect({}, undefined))).toBe('modified');
  });

  it('returns no status for equal aspects', () => {
    expect(getAspectStatus(aspect({ enabled: true }, {}), aspect({ enabled: true }, {}))).toBeNull();
  });
});
