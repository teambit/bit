import { expect } from 'chai';
import ComponentOverrides from './component-overrides';
import { OVERRIDE_COMPONENT_PREFIX } from '../../constants';

describe('ComponentOverrides', () => {
  describe('getIgnoredComponents', () => {
    it(`should return an empty array if it does not start with the component prefix (${OVERRIDE_COMPONENT_PREFIX})`, () => {
      const componentOverrides = new ComponentOverrides({ dependencies: { 'david.utils.is-string': '-' } });
      const ignored = componentOverrides.getIgnoredComponents('dependencies');
      expect(ignored).to.be.an('array').that.has.lengthOf(0);
    });
    it('should return the same dependency without the prefix if it does not have any dot', () => {
      const componentOverrides = new ComponentOverrides({
        dependencies: { [`${OVERRIDE_COMPONENT_PREFIX}david/utils/is-string`]: '-' },
      });
      const ignored = componentOverrides.getIgnoredComponents('dependencies');
      expect(ignored).to.be.an('array').that.has.lengthOf(1);
      expect(ignored[0]).to.equal('david/utils/is-string');
    });
    it('should add another result if it has one dot by replacing the dot with a slash', () => {
      const componentOverrides = new ComponentOverrides({
        dependencies: { [`${OVERRIDE_COMPONENT_PREFIX}david.utils/is-string`]: '-' },
      });
      const ignored = componentOverrides.getIgnoredComponents('dependencies');
      expect(ignored).to.be.an('array').that.has.lengthOf(2);
      expect(ignored.sort()).to.deep.equal(['david/utils/is-string', 'david.utils/is-string'].sort());
    });
    it('should add two more results if it has more than one dot by replacing dots with slashes', () => {
      const componentOverrides = new ComponentOverrides({
        dependencies: { [`${OVERRIDE_COMPONENT_PREFIX}david.utils.is-string`]: '-' },
      });
      const ignored = componentOverrides.getIgnoredComponents('dependencies');
      expect(ignored).to.be.an('array').that.has.lengthOf(3);
      expect(ignored.sort()).to.deep.equal(
        ['david/utils/is-string', 'david.utils/is-string', 'david.utils.is-string'].sort()
      );
    });
  });
});
