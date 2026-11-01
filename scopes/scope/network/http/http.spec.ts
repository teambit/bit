import { expect } from 'chai';
import { DEFAULT_AGENT_MAX_SOCKETS, withAgentSocketDefault } from './http';

describe('withAgentSocketDefault()', () => {
  it('applies the default when network.max_sockets is not configured', () => {
    expect(withAgentSocketDefault({}).maxSockets).to.equal(DEFAULT_AGENT_MAX_SOCKETS);
  });

  it('keeps a configured value', () => {
    expect(withAgentSocketDefault({ maxSockets: 40 }).maxSockets).to.equal(40);
  });
});
