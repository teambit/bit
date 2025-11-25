import { getInitials } from './get-initials';
import { expect } from 'chai';

describe('getInitials()', () => {
  it('should return two letters for the initialsof two word', () => {
    expect(getInitials('scope name')).to.equal('sn');
  });

  it('should return the two first letters if one word', () => {
    expect(getInitials('scope')).to.equal('sc');
  });

  it('should return undefined if the word is empty', () => {
    expect(getInitials('')).to.be.undefined;
  });
});
