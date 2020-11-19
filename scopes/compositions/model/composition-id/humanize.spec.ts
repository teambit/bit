import { expect } from 'chai';
import { humanizeCompositionId } from './humanize';

describe('humanize component id', () => {
  it('should space out camelCase', () => {
    const res = humanizeCompositionId('withManyItems');
    expect(res).to.equal('With many items');
  });
});
