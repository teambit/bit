import { expect } from 'chai';
import { ComponentIdList, ComponentID } from '@teambit/component-id';
import resolveLatestVersion from './resolveLatestVersion';

describe('getLatestVersionNumber', () => {
  const idWithNoVersion = ComponentID.fromObject({ scope: 'my-scope', name: 'is-string' });
  const idWithVersionLatest = ComponentID.fromObject({ scope: 'my-scope', name: 'is-string', version: 'latest' });
  const idWithVersion1 = ComponentID.fromObject({ scope: 'my-scope', name: 'is-string', version: '0.0.1' });
  const idWithVersion2 = ComponentID.fromObject({ scope: 'my-scope', name: 'is-string', version: '0.0.2' });
  const idWithVersion3 = ComponentID.fromObject({ scope: 'my-scope', name: 'is-string', version: '0.0.3' });
  const idWithNoVersionWithScope = ComponentID.fromObject({ scope: 'my-scope', name: 'is-string' });
  const idWithVersion1WithScope = ComponentID.fromObject({ scope: 'my-scope', name: 'is-string', version: '0.0.1' });

  it('should return the same id when bitIds is empty', () => {
    const bitIds = new ComponentIdList();
    const result = resolveLatestVersion(bitIds, idWithNoVersion);
    expect(result).to.deep.equal(idWithNoVersion);
  });
  it('should return the same id when bitIds does not have the bit id', () => {
    const anotherId = ComponentID.fromObject({ scope: 'my-scope', name: 'is-type' });
    const bitIds = new ComponentIdList(anotherId);
    const result = resolveLatestVersion(bitIds, idWithNoVersion);
    expect(result).to.deep.equal(idWithNoVersion);
  });
  it('should work with a pre-release tag', () => {
    const anotherId = ComponentID.fromObject({ scope: 'foo', name: 'is-type' });
    const idWithPreRelease = ComponentID.fromObject({ scope: 'foo', name: 'is-type', version: '3.0.0-dev.1' });
    const bitIds = new ComponentIdList(idWithPreRelease);
    const result = resolveLatestVersion(bitIds, anotherId);
    expect(result).to.deep.equal(idWithPreRelease);
  });
  it('should return the id from the bitIds array if it is there with a version', () => {
    const bitIds = new ComponentIdList(idWithVersion1);
    const result = resolveLatestVersion(bitIds, idWithNoVersion);
    expect(result).to.not.deep.equal(idWithNoVersion);
    expect(result).to.deep.equal(idWithVersion1);
  });
  it('should return the id with the latest version when given id does not have a version', () => {
    const bitIds = new ComponentIdList(idWithVersion2, idWithVersion3, idWithVersion1);
    const result = resolveLatestVersion(bitIds, idWithNoVersion);
    expect(result).to.not.deep.equal(idWithNoVersion);
    expect(result).to.deep.equal(idWithVersion3);
  });
  it('should return the id with the latest version when given id has version "latest"', () => {
    const bitIds = new ComponentIdList(idWithVersion2, idWithVersion3, idWithVersion1);
    const result = resolveLatestVersion(bitIds, idWithVersionLatest);
    expect(result).to.not.deep.equal(idWithVersionLatest);
    expect(result).to.deep.equal(idWithVersion3);
  });
  it('should not return the id with the latest version when given id has already a version', () => {
    const bitIds = new ComponentIdList(idWithVersion2, idWithVersion3, idWithVersion1);
    const result = resolveLatestVersion(bitIds, idWithVersion1);
    expect(result).to.not.deep.equal(idWithVersion3);
    expect(result).to.deep.equal(idWithVersion1);
  });
  it('should return the id from the bitIds array if it is there with same version and same scope', () => {
    const bitIds = new ComponentIdList(idWithVersion1WithScope);
    const result = resolveLatestVersion(bitIds, idWithNoVersionWithScope);
    expect(result).to.not.deep.equal(idWithNoVersionWithScope);
    expect(result).to.deep.equal(idWithVersion1WithScope);
  });
  it('should not return the id from the bitIds array if it is there with same version but different scope', () => {
    const idWithDifferentScope = ComponentID.fromObject({
      scope: 'my-another-scope',
      name: 'is-string',
      version: '0.0.1',
    });
    const bitIds = new ComponentIdList(idWithDifferentScope);
    const result = resolveLatestVersion(bitIds, idWithNoVersionWithScope);
    expect(result).to.not.deep.equal(idWithDifferentScope);
    expect(result).to.deep.equal(idWithNoVersionWithScope);
  });
});
