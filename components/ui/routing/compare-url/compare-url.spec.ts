import { expect } from 'chai';
import { compareUrl } from './compare-url';

describe('compareUrl()', () => {
  it('should return true for the same url', () => {
    const res = compareUrl('/pricing', '/pricing');
    expect(res).to.be.true;
  });

  it('should match sub url', () => {
    const res = compareUrl('/pricing/offer', '/pricing');
    expect(res).to.be.true;
  });

  it('should not match sub url when strict', () => {
    const res = compareUrl('/pricing/offer', '/pricing', { exact: true });
    expect(res).to.be.false;
  });

  it('should ignore trailing slash by default', () => {
    const res = compareUrl('/pricing/', '/pricing');
    expect(res).to.be.true;
  });

  it('should match trailing slash when strict', () => {
    const res = compareUrl('/pricing/', '/pricing', { strict: true });
    expect(res).to.be.false;
  });

  it('should not match when query params not equal', () => {
    const res = compareUrl('/pricing?deal=true', '/pricing?deal=yes');
    expect(res).to.be.false;
  });

  it('should match when query params equal', () => {
    const res = compareUrl('/pricing?deal=yes', '/pricing?deal=yes');
    expect(res).to.be.true;
  });

  it('should match when query params are a subset', () => {
    const res = compareUrl('/pricing?deal=yes&offer=yes', '/pricing?deal=yes');
    expect(res).to.be.true;
  });

  it('should not match unequal query when exact', () => {
    const res = compareUrl('/pricing?deal=yes&offer=yes', '/pricing?deal=yes', {
      exact: true,
    });
    expect(res).to.be.false;
  });

  it('should match by hash', () => {
    const res = compareUrl('/pricing#faq', '#faq');
    expect(res).to.be.true;
  });

  it('should ignore trailing slash in base when exact but not strict', () => {
    const res = compareUrl('/pricing/', '/pricing', { exact: true });
    expect(res).to.be.true;
  });

  it('should ignore trailing slash in match when exact but not strict', () => {
    const res = compareUrl('/pricing', '/pricing/', { exact: true });
    expect(res).to.be.true;
  });

  it('should ignore trailing slash when having query params', () => {
    const res = compareUrl('/pricing?offer=yes', '/pricing/');
    expect(res).to.be.true;
  });

  it('should ignore trailing slash when having hash', () => {
    const res = compareUrl('/pricing#special-offer', '/pricing/');
    expect(res).to.be.true;
  });

  // this most definitely does not cover all cases.
  // we should try to follow the same implementation as react-router
});
