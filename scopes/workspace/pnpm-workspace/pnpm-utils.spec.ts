import { expect } from 'chai';
import { userPnpmEnv } from './pnpm-utils';

describe('userPnpmEnv', () => {
  it('takes the PATH bit started with over one an install put its node directory first on', () => {
    const env = userPnpmEnv({ PATH: '/dir-of-bit-node:/usr/bin', HOME: '/home/user' }, '/usr/bin');
    expect(env).to.deep.equal({ PATH: '/usr/bin', HOME: '/home/user' });
  });
  it('replaces the variable under the name it has, "Path" on Windows', () => {
    expect(userPnpmEnv({ Path: 'C:\\bit-node;C:\\Windows' }, 'C:\\Windows')).to.deep.equal({ Path: 'C:\\Windows' });
  });
});
