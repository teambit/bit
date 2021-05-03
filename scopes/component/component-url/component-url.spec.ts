import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { ComponentUrl } from './component-url';
import { baseUrl } from './constants';

describe('component url', () => {
  it('should convert to url', () => {
    const id = ComponentID.fromString('teambit.component/component-id@0.0.312');

    const result = ComponentUrl.toUrl(id);

    expect(result).to.equal(`${baseUrl}/teambit/component/component-id?version=0.0.312`);
  });

  it('should not require version', () => {
    const id = ComponentID.fromString('teambit.component/component-id');

    const result = ComponentUrl.toUrl(id);

    expect(result).to.equal(`${baseUrl}/teambit/component/component-id`);
  });

  it('should skip url when opt out in options', () => {
    const id = ComponentID.fromString('teambit.component/component-id@0.0.312');

    const result = ComponentUrl.toUrl(id, { includeVersion: false });

    expect(result).to.equal(`${baseUrl}/teambit/component/component-id`);
  });
});
