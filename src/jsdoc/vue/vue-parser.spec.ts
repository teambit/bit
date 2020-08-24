import { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import parser from './';

const fixtures = path.join(__dirname, '../../..', 'fixtures', 'jsdoc', 'vue');

describe('Vue docs Parser', () => {
  describe('Invalid code', () => {
    it('should returns an empty object', async () => {
      const doclets = (await parser('this is an invalid code'))[0];
      expect(doclets).to.be.a('object');
      expect(doclets).to.have.property('methods').to.be.a('array').to.have.lengthOf(0);
      expect(doclets).to.have.property('properties').to.be.a('array').to.have.lengthOf(0);
    });
  });

  describe('parse()', () => {
    let doclet;
    before(async () => {
      const componentFile = path.join(fixtures, 'checkbox.vue');
      const componentFileContent = fs.readFileSync(componentFile).toString();
      doclet = (await parser(componentFileContent, componentFile))[0];
    });

    describe('name and description', () => {
      it('should recognize the component name', () => {
        expect(doclet.name).to.equal('checkbox');
      });
      it('should recognize the description', () => {
        expect(doclet.description).to.equal('A simple checkbox component');
      });
    });

    describe('Method Declaration', () => {
      it('should recognize the check method', () => {
        const methodDef = doclet.methods[0];
        expect(methodDef).to.have.property('name').that.equals('check');
        expect(methodDef).to.have.property('description').that.equals('Check the checkbox');
        expect(methodDef).to.have.property('access').that.equals('public');
        expect(methodDef).to.have.property('returns').that.is.an('object').that.is.not.empty;
        // TODO: add tests for this
        // expect(methodDef)
        //   .to.have.property('examples')
        //   .that.is.an('array').that.is.empty;
        // expect(methodDef)
        //   .to.have.property('args')
        //   .that.is.an('array').that.is.empty;
      });
      it('should recognize the uncommentedMethod method', () => {
        const methodDef = doclet.methods[1];
        expect(methodDef).to.have.property('name').that.equals('uncommentedMethod');
        expect(methodDef).to.have.property('description').that.is.empty;
      });
    });

    describe('Properties property', () => {
      it('should parse the properties correctly', () => {
        expect(doclet).to.have.property('properties').that.is.an('array').that.have.lengthOf(5);
        expect(doclet.properties[0].name).to.equal('model');
        expect(doclet.properties[0].type).to.equal('Array');
        expect(doclet.properties[0].description).to.equal('The checkbox model');
        expect(doclet.properties[0].required).to.equal(true);
        expect(doclet.properties[0].defaultValue.value).to.be.undefined;
        expect(doclet.properties[0].defaultValue.computed).to.equal(false);

        expect(doclet.properties[1].name).to.equal('disabled');
        expect(doclet.properties[1].type).to.equal('Boolean');
        expect(doclet.properties[1].description).to.equal('Initial checkbox state');
        expect(doclet.properties[1].required).to.equal(false);
        expect(doclet.properties[1].defaultValue.value).to.be.undefined;
        expect(doclet.properties[1].defaultValue.computed).to.equal(false);

        expect(doclet.properties[2].name).to.equal('checked');
        expect(doclet.properties[2].type).to.equal('Boolean');
        expect(doclet.properties[2].description).to.equal('Initial checkbox value');
        expect(doclet.properties[2].required).to.equal(false);
        expect(doclet.properties[2].defaultValue.value).to.be.true;
        expect(doclet.properties[2].defaultValue.computed).to.equal(false);

        expect(doclet.properties[3].name).to.equal('prop-with-camel');
        expect(doclet.properties[3].type).to.equal('Object');
        expect(doclet.properties[3].description).to.equal('Prop with camel name');
        expect(doclet.properties[3].required).to.equal(false);
        expect(doclet.properties[3].defaultValue.value).to.be.equal("() => ({ name: 'X'})");
        expect(doclet.properties[3].defaultValue.computed).to.equal(false);

        expect(doclet.properties[4].name).to.equal('id');
        expect(doclet.properties[4].type).to.be.undefined;
        expect(doclet.properties[4].description).to.equal('computed id');
        expect(doclet.properties[4].required).to.equal(false);
        expect(doclet.properties[4].defaultValue.value).to.be.null;
        expect(doclet.properties[4].defaultValue.computed).to.equal(true);
      });
    });
  });
});
