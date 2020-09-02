import { expect } from 'chai';

import BitId from '../bit-id/bit-id';
import BitIds from '../bit-id/bit-ids';
import resolveLatestVersion from './resolveLatestVersion';

describe('getLatestVersionNumber', () => {
  const idWithNoVersion = new BitId({ name: 'is-string' });
  const idWithVersionLatest = new BitId({ name: 'is-string', version: 'latest' });
  const idWithVersion1 = new BitId({ name: 'is-string', version: '0.0.1' });
  const idWithVersion2 = new BitId({ name: 'is-string', version: '0.0.2' });
  const idWithVersion3 = new BitId({ name: 'is-string', version: '0.0.3' });
  const idWithNoVersionWithScope = new BitId({ scope: 'my-scope', name: 'is-string' });
  const idWithVersion1WithScope = new BitId({ scope: 'my-scope', name: 'is-string', version: '0.0.1' });

  it('should return the same id when bitIds is empty', () => {
    const bitIds = new BitIds();
    const result = resolveLatestVersion(bitIds, idWithNoVersion);
    expect(result).to.deep.equal(idWithNoVersion);
  });
  it('should return the same id when bitIds does not have the bit id', () => {
    const anotherId = new BitId({ name: 'is-type' });
    const bitIds = new BitIds(anotherId);
    const result = resolveLatestVersion(bitIds, idWithNoVersion);
    expect(result).to.deep.equal(idWithNoVersion);
  });
  it('should throw when using a pre-release tag', () => {
    const anotherId = new BitId({ scope: 'foo', name: 'is-type' });
    const idWithPreRelease = new BitId({ scope: 'foo', name: 'is-type', version: '3.0.0-dev.1' });
    const bitIds = new BitIds(idWithPreRelease);
    const func = () => resolveLatestVersion(bitIds, anotherId);
    expect(func).to.throw('semver was not able to find the highest version among the following: 3.0.0-dev.1');
  });
  it('should return the id from the bitIds array if it is there with a version', () => {
    const bitIds = new BitIds(idWithVersion1);
    const result = resolveLatestVersion(bitIds, idWithNoVersion);
    expect(result).to.not.deep.equal(idWithNoVersion);
    expect(result).to.deep.equal(idWithVersion1);
  });
  it('should return the id with the latest version when given id does not have a version', () => {
    const bitIds = new BitIds(idWithVersion2, idWithVersion3, idWithVersion1);
    const result = resolveLatestVersion(bitIds, idWithNoVersion);
    expect(result).to.not.deep.equal(idWithNoVersion);
    expect(result).to.deep.equal(idWithVersion3);
  });
  it('should return the id with the latest version when given id has version "latest"', () => {
    const bitIds = new BitIds(idWithVersion2, idWithVersion3, idWithVersion1);
    const result = resolveLatestVersion(bitIds, idWithVersionLatest);
    expect(result).to.not.deep.equal(idWithVersionLatest);
    expect(result).to.deep.equal(idWithVersion3);
  });
  it('should not return the id with the latest version when given id has already a version', () => {
    const bitIds = new BitIds(idWithVersion2, idWithVersion3, idWithVersion1);
    const result = resolveLatestVersion(bitIds, idWithVersion1);
    expect(result).to.not.deep.equal(idWithVersion3);
    expect(result).to.deep.equal(idWithVersion1);
  });
  it('should return the id from the bitIds array if it is there with same version and same scope', () => {
    const bitIds = new BitIds(idWithVersion1WithScope);
    const result = resolveLatestVersion(bitIds, idWithNoVersionWithScope);
    expect(result).to.not.deep.equal(idWithNoVersionWithScope);
    expect(result).to.deep.equal(idWithVersion1WithScope);
  });
  it('should not return the id from the bitIds array if it is there with same version but different scope', () => {
    const idWithDifferentScope = new BitId({ scope: 'my-another-scope', name: 'is-string', version: '0.0.1' });
    const bitIds = new BitIds(idWithDifferentScope);
    const result = resolveLatestVersion(bitIds, idWithNoVersionWithScope);
    expect(result).to.not.deep.equal(idWithDifferentScope);
    expect(result).to.deep.equal(idWithNoVersionWithScope);
  });
  it('should not return the id from the bitIds array if it is there with same version but empty scope', () => {
    const bitIds = new BitIds(idWithVersion1);
    const result = resolveLatestVersion(bitIds, idWithNoVersionWithScope);
    expect(result).to.not.deep.equal(idWithVersion1);
    expect(result).to.deep.equal(idWithNoVersionWithScope);
  });
  it('should return the same id when bitIds has a similar id where its name is equal to scopereadonly name of the id', () => {
    const idWithScope = new BitId({ scope: 'is', name: 'string' });
    const idWithoutScope = new BitId({ name: 'is/string', version: '0.0.1' });
    const bitIds = new BitIds(idWithoutScope);
    const result = resolveLatestVersion(bitIds, idWithScope);
    expect(result).to.deep.equal(idWithScope);
  });
});
