import { expect } from 'chai';
import { AspectVersionsPicker } from './aspect-versions-picker';

describe('AspectVersionsPicker', () => {
  it('should use the version of a requested aspect over a version that a dependency pins', () => {
    const picker = new AspectVersionsPicker(['org.scope/slot-owner@abc123', 'org.scope/registrar@0.0.1']);
    expect(picker.pick(['org.scope/slot-owner@0.0.1'])).to.deep.equal(['org.scope/slot-owner@abc123']);
  });
  it('should use the version of a shallower level over the version of a deeper level', () => {
    const picker = new AspectVersionsPicker(['org.scope/app@1.0.0']);
    expect(picker.pick(['org.scope/slot-owner@abc123', 'org.scope/registrar@0.0.1'])).to.deep.equal([
      'org.scope/slot-owner@abc123',
      'org.scope/registrar@0.0.1',
    ]);
    expect(picker.pick(['org.scope/slot-owner@0.0.1'])).to.deep.equal(['org.scope/slot-owner@abc123']);
  });
  it('should keep the versions as is when one level has more than one version of an aspect', () => {
    const picker = new AspectVersionsPicker(['org.scope/env@1.0.0', 'org.scope/env@2.0.0']);
    expect(picker.pick(['org.scope/helper@1.0.0', 'org.scope/helper@2.0.0'])).to.deep.equal([
      'org.scope/helper@1.0.0',
      'org.scope/helper@2.0.0',
    ]);
    expect(picker.pick(['org.scope/env@1.0.0', 'org.scope/env@2.0.0'])).to.deep.equal([
      'org.scope/env@1.0.0',
      'org.scope/env@2.0.0',
    ]);
    expect(picker.pick(['org.scope/helper@3.0.0'])).to.deep.equal(['org.scope/helper@3.0.0']);
  });
  it('should use the picked version for a dependency without a version', () => {
    const picker = new AspectVersionsPicker(['org.scope/slot-owner@abc123']);
    expect(picker.pick(['org.scope/slot-owner'])).to.deep.equal(['org.scope/slot-owner@abc123']);
  });
  it('should return an id without a version as is when no version of it was picked', () => {
    const picker = new AspectVersionsPicker();
    expect(picker.pick(['teambit.harmony/cli', 'teambit.harmony/cli'])).to.deep.equal([
      'teambit.harmony/cli',
      'teambit.harmony/cli',
    ]);
  });
});
