import { expect } from 'chai';
import Resolver from '.'; 

describe('index', () => {
  it('should return an empty string', () => {
    expect(Resolver.isHere()).to.equal('');
  });
});
