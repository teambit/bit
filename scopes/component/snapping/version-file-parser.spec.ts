import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { VersionFileParser } from './version-file-parser';

describe('VersionFileParser', () => {
  const member = ComponentID.fromString('my-org.my-scope/my-comp');
  const root = ComponentID.fromString('my-org.my-scope/my-root');
  const ids = ComponentIdList.fromArray([member, root]);
  const versionOf = (results: ReturnType<VersionFileParser['parseVersionsContent']>, id: ComponentID) =>
    results.find((result) => result.componentId.isEqualWithoutVersion(id))?.versionToTag;

  describe('a component excluded from DEFAULT, the way the workspace root is', () => {
    it('should not get a version from the DEFAULT line', () => {
      const parser = new VersionFileParser(ids, root);
      const results = parser.parseVersionsContent('DEFAULT: 1.0.0');
      expect(versionOf(results, member)).to.equal('1.0.0');
      expect(versionOf(results, root)).to.be.undefined;
    });
    it('should get the version when the file names it, DEFAULT or not', () => {
      const parser = new VersionFileParser(ids, root);
      const results = parser.parseVersionsContent('DEFAULT: 1.0.0\nmy-org.my-scope/my-root: 2.0.0');
      expect(versionOf(results, member)).to.equal('1.0.0');
      expect(versionOf(results, root)).to.equal('2.0.0');
    });
  });

  it('should give every component the DEFAULT when nothing is excluded', () => {
    const results = new VersionFileParser(ids).parseVersionsContent('DEFAULT: 1.0.0');
    expect(versionOf(results, member)).to.equal('1.0.0');
    expect(versionOf(results, root)).to.equal('1.0.0');
  });
});
