import { expect } from 'chai';
import { ScopeUrl } from './scope-url';

const BASE_URL = 'https://bit.dev';

describe('scope url', () => {
  it('should convert to url', () => {
    const id = 'teambit.base-ui';

    const result = ScopeUrl.toUrl(id);

    expect(result).to.equal(`${BASE_URL}/teambit/base-ui`);
  });

  it('should convert to url', () => {
    const id = 'ioncannon';

    const result = ScopeUrl.toUrl(id);

    expect(result).to.equal(`${BASE_URL}/ioncannon`);
  });
});
