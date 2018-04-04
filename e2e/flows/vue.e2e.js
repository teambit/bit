import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

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
        helper.addComponent(path.normalize('directives/*.js'));
        helper.addComponent(path.normalize('styles/*'));
        helper.addComponent(path.normalize('UiAutocomplete.vue'));
        helper.runCmd('npm i fuzzysearch');
      });
      it('should find missing vue dependencies', () => {
        const output = helper.runCmd('bit s');
        expect(output).to.have.string(' untracked file dependencies');
        expect(output).to.have.string('UiAutocomplete.vue -> UiAutocompleteSuggestion.vue, UiIcon.vue');
      });
      it('should say that all is resolved', () => {
        helper.addComponent('UiAutocompleteSuggestion.vue');
        helper.addComponent('UiIcon.vue');
        const output = helper.runCmd('bit s');
        expect(output.includes('no new components')).to.be.false;
      });
      it('should display that component as a new component', () => {
        const output = helper.runCmd('bit s');
        expect(output.includes('new components')).to.be.true;
        expect(output.includes(`${helper.localScope}/ui-autocomplete`)).to.be.true;
        expect(output.includes(`${helper.localScope}/ui-autocomplete-suggestion`)).to.be.true;
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
        expect(output.includes(`${helper.localScope}/stylus-example`)).to.be.true;
        expect(output.includes('stylus/main')).to.be.true;
        expect(output.includes('stylus/second')).to.be.true;
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
        const output = helper.commitAllComponents('message');
        expect(output).to.have.string('9 components tagged | 9 added, 0 changed, 0 auto-tagged');
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
});
