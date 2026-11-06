import { expect } from 'chai';
import { isReadOnlyCommand } from './read-only-commands';

describe('isReadOnlyCommand', () => {
  it('should match a read-only command and its alias', () => {
    expect(isReadOnlyCommand('status')).to.be.true;
    expect(isReadOnlyCommand('s')).to.be.true;
  });
  it('should match a read-only sub-command only', () => {
    expect(isReadOnlyCommand('lane', 'show')).to.be.true;
    expect(isReadOnlyCommand('lane', 'merge')).to.be.false;
    expect(isReadOnlyCommand('lane')).to.be.false;
  });
  it('should not match commands that change the workspace', () => {
    expect(isReadOnlyCommand('snap')).to.be.false;
    expect(isReadOnlyCommand('envs', 'set')).to.be.false;
  });
});
