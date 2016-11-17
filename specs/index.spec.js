import { expect } from 'chai';
import multiply from './index'; 

describe('index', () => {
  it('should multiply', () => {
    expect(multiply(2, 2)).to.equal('4');
  });
});
