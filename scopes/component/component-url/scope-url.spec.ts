import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { ScopeUrl } from './scope-url';

describe('scope url', () => {
  it('should convert to url', () => {
    const id = 'teambit.base-ui';

    const result = ScopeUrl.toUrl(id);

    expect(result).to.equal('https://bit.dev/teambit/base-ui');
  });

  it('should convert to url', () => {
    const id = 'ioncannon';

    const result = ScopeUrl.toUrl(id);

    expect(result).to.equal('https://bit.dev/ioncannon');
  });
});
