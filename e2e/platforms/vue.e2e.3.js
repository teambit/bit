import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('support vue files', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('tests scenarios ', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.copyFixtureComponents('vue');
    });
    describe('add vue files', () => {
      before(() => {
        helper.addComponent('directives/*.js');
        helper.addComponent('styles/*');
        helper.addComponent('UiAutocomplete.vue');
        helper.runCmd('npm i fuzzysearch');
      });
      it('should find missing vue dependencies', () => {
        const output = helper.runCmd('bit s');
        expect(output).to.have.string('untracked file dependencies');
        expect(output).to.have.string('UiAutocomplete.vue -> UiAutocompleteSuggestion.vue, UiIcon.vue');
      });
      describe('after adding the missing files', () => {
        let output;
        before(() => {
          helper.addComponent('UiAutocompleteSuggestion.vue');
          helper.addComponent('UiIcon.vue');
          output = helper.status();
        });
        it('should say that all is resolved', () => {
          expect(output.includes('no new components')).to.be.false;
        });
        it('should display that component as a new component', () => {
          expect(output.includes('new components')).to.be.true;
          expect(output.includes('ui-autocomplete')).to.be.true;
          expect(output.includes('ui-autocomplete-suggestion')).to.be.true;
        });
        it('should not display that component as modified', () => {
          expect(output.includes('modified components')).to.be.false;
        });
        it('should not display that component as staged', () => {
          expect(output.includes('staged components')).to.be.false;
        });
      });
    });
    describe('add vue files that import stylus files ', () => {
      before(() => {
        helper.addComponent(path.normalize('StylusExample.vue'));
      });
      it('should find missing vue dependencies', () => {
        const output = helper.runCmd('bit s');
        expect(output).to.have.string(' untracked file dependencies');
        expect(output).to.have.string('StylusExample.vue -> stylus/main.styl');
      });
      it('should find missing vue dependencies', () => {
        helper.addComponent(path.normalize('stylus/main.styl'));
        const output = helper.runCmd('bit s');
        expect(output).to.have.string(' untracked file dependencies');
        expect(output).to.have.string('stylus/main.styl -> stylus/second.styl');
      });
      it('should say that all is resolved', () => {
        helper.addComponent(path.normalize('stylus/second.styl'));
        const output = helper.runCmd('bit s');
        expect(output.includes('no new components')).to.be.false;
      });
      it('should display that component as a new component', () => {
        const output = helper.runCmd('bit s');
        expect(output.includes('new components')).to.be.true;
        expect(output.includes('stylus-example')).to.be.true;
        expect(output.includes('main')).to.be.true;
        expect(output.includes('second')).to.be.true;
      });
      it('should not display that component as modified', () => {
        const output = helper.runCmd('bit s');
        expect(output.includes('modified components')).to.be.false;
      });
      it('should not display that component as staged', () => {
        const output = helper.runCmd('bit s');
        expect(output.includes('staged components')).to.be.false;
      });
    });
    describe('import vue components', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.copyFixtureComponents('vue');
        helper.addComponent(path.normalize('directives/*.js'));
        helper.addComponent(path.normalize('styles/*'));
        helper.addComponent('UiAutocomplete.vue UiAutocompleteSuggestion.vue UiIcon.vue -n vue');
        helper.runCmd('npm i fuzzysearch');
      });
      it('should find missing vue dependencies', () => {
        const output = helper.tagAllComponents();
        expect(output).to.have.string('9 component(s) tagged');
      });
      it('should export tagged components', () => {
        const output = helper.exportAllComponents();
        expect(output).to.have.string(`exported 9 components to scope ${helper.remoteScope}`);
      });
      it('should import component', () => {
        helper.reInitLocalScope();
        helper.addRemoteScope(helper.remoteScopePath);
        const output = helper.importComponent('vue/ui-autocomplete');
        expect(output).to.have.string('successfully imported one component');
        expect(output).to.have.string(`${helper.remoteScope}/vue/ui-autocomplete`);
        expect(output).to.have.string('0.0.1');
      });
    });
  });
  describe('custom module resolutions', () => {
    before(() => {
      helper.reInitLocalScope();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { aliases: { '@': 'directives' } };
      helper.writeBitJson(bitJson);

      const autocompleteFixture = `<script>
import autofocus from '@/autofocus';
</script>`;
      helper.createFile('UI', 'Autocomplete.vue', autocompleteFixture);
      helper.createFile('directives', 'autofocus.js', 'export default {}');
      helper.addComponent('UI/Autocomplete.vue', { i: 'ui/autocomplete' });
      helper.addComponent('directives/autofocus.js', { i: 'directives/autofocus' });
    });
    it('should recognize dependencies using "@" as an alias', () => {
      const output = helper.showComponentParsed('ui/autocomplete');
      expect(output.dependencies).to.have.lengthOf(1);
      const dependency = output.dependencies[0];
      expect(dependency.id).to.equal('directives/autofocus');
      expect(dependency.relativePaths[0].sourceRelativePath).to.equal('directives/autofocus.js');
      expect(dependency.relativePaths[0].destinationRelativePath).to.equal('directives/autofocus.js');
      expect(dependency.relativePaths[0].importSource).to.equal('@/autofocus');
      expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
  });
});
