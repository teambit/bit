import { expect } from 'chai';
import { Port } from './get-port';

describe('Get port', () => {
  it('it should return port from range', async () => {
    const port = await Port.getPort(3100, 3200);
    expect(typeof port).to.equal('number');
  });

  it('it should return port', async () => {
    const port = await Port.getPort(3300, 3400);
    expect(port).to.equal(3300);
  });

  it('it should return port', async () => {
    const port = await Port.getPort(3500, 3600, [3500, 3501]);
    expect(port).to.equal(3502);
  });

  it('it should return port from range', async () => {
    const port = await Port.getPortFromRange(3005);
    expect(port).to.equal(3005);
  });
});
