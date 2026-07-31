import { expect } from 'chai';
import { isPullRequestRef } from './pull-request-ref';

describe('isPullRequestRef()', () => {
  it('should detect GitHub pull request refs', () => {
    expect(isPullRequestRef('pull/123')).to.equal(true);
    expect(isPullRequestRef('pull/123/head')).to.equal(true);
    expect(isPullRequestRef('pull/123/merge')).to.equal(true);
  });

  it('should not detect normal branch names as pull request refs', () => {
    expect(isPullRequestRef('feature/pull/123')).to.equal(false);
    expect(isPullRequestRef('feature-test-pr')).to.equal(false);
    expect(isPullRequestRef('pull-request-123')).to.equal(false);
  });
});
