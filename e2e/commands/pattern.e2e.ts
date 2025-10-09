import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('pattern command', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('general pattern matching', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3); // Creates comp1, comp2, comp3
    });

    it('should match all components with **', () => {
      const result = helper.command.pattern('**');
      expect(result).to.include('comp1');
      expect(result).to.include('comp2');
      expect(result).to.include('comp3');
      expect(result).to.include('found 3 components');
    });

    it('should match specific component by name', () => {
      const result = helper.command.pattern('comp1');
      expect(result).to.include('comp1');
      expect(result).to.not.include('comp2');
      expect(result).to.not.include('comp3');
      expect(result).to.include('found 1 component');
    });

    it('should match multiple components with wildcards', () => {
      const result = helper.command.pattern('**/comp*');
      expect(result).to.include('comp1');
      expect(result).to.include('comp2');
      expect(result).to.include('comp3');
      expect(result).to.include('found 3 components');
    });

    it('should match components with comma-separated patterns', () => {
      // Use wildcard patterns to match regardless of scope
      const result = helper.command.pattern('**/comp1, **/comp3');
      expect(result).to.include('comp1');
      expect(result).to.not.include('comp2');
      expect(result).to.include('comp3');
      expect(result).to.include('found 2 components');
    });

    it('should return JSON format when using --json flag', () => {
      const result = helper.command.patternJson('**');
      expect(Array.isArray(result)).to.be.true;
      expect(result.length).to.equal(3);
      const resultStrings = result.map((r) => (typeof r === 'string' ? r : JSON.stringify(r)));
      expect(resultStrings.some((id) => id.includes('comp1'))).to.be.true;
      expect(resultStrings.some((id) => id.includes('comp2'))).to.be.true;
      expect(resultStrings.some((id) => id.includes('comp3'))).to.be.true;
    });

    it('should handle non-matching patterns gracefully', () => {
      expect(() => helper.command.pattern('non-existent-component')).to.throw();
    });
  });

  describe('pattern exclusion with negation (!)', () => {
    let scopeName: string;

    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // Create two components using fixture API
      helper.fixtures.populateComponents(2); // This creates comp1 and comp2
      scopeName = helper.scopes.remote;
    });

    describe('basic exclusion patterns', () => {
      it('should exclude comp1 when using pattern "!comp1"', () => {
        const result = helper.command.pattern('!comp1');
        expect(result).to.not.include('comp1');
        expect(result).to.include('comp2');
      });

      it('should exclude comp1 when using pattern "**, !comp1"', () => {
        const result = helper.command.pattern('**, !comp1');
        expect(result).to.not.include('comp1');
        expect(result).to.include('comp2');
      });

      it('should exclude comp1 when using pattern "**, !**/comp1"', () => {
        const result = helper.command.pattern('**, !**/comp1');
        expect(result).to.not.include('comp1');
        expect(result).to.include('comp2');
      });

      it('should exclude comp1 when using pattern "**/*, !comp1"', () => {
        const result = helper.command.pattern('**/*, !comp1');
        expect(result).to.not.include('comp1');
        expect(result).to.include('comp2');
      });
    });

    describe('full component ID exclusion', () => {
      it('should list both components without any exclusion', () => {
        const result = helper.command.pattern('**');
        expect(result).to.include('comp1');
        expect(result).to.include('comp2');
        expect(result).to.include('found 2 components');
      });

      it('should exclude comp1 when using pattern with full ID "**, !scope-name/comp1"', () => {
        const result = helper.command.pattern(`**, !${scopeName}/comp1`);
        expect(result).to.not.include('comp1');
        expect(result).to.include('comp2');
        expect(result).to.include('found 1 component');
      });

      it('should exclude comp1 when using pattern with just "!scope-name/comp1"', () => {
        const result = helper.command.pattern(`!${scopeName}/comp1`);
        expect(result).to.not.include('comp1');
        expect(result).to.include('comp2');
        expect(result).to.include('found 1 component');
      });

      it('should exclude both components when using "!scope-name/comp1, !scope-name/comp2"', () => {
        const result = helper.command.pattern(`!${scopeName}/comp1, !${scopeName}/comp2`);
        expect(result).to.include('found 0 components');
      });

      it('should exclude comp2 when using pattern "**, !scope-name/comp2"', () => {
        const result = helper.command.pattern(`**, !${scopeName}/comp2`);
        expect(result).to.include('comp1');
        expect(result).to.not.include('comp2');
        expect(result).to.include('found 1 component');
      });
    });
  });
});
