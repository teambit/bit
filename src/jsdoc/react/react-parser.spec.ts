import fs from 'fs-extra';
import * as path from 'path';
import { expect } from 'chai';
import parser from './';

const fixtures = path.join(__dirname, '../../..', 'fixtures', 'jsdoc');

describe('React docs Parser', () => {
  describe('parse()', () => {
    describe('Invalid code', () => {
      it('should returns an empty array', async () => {
        const doclets = await parser('this is an invalid code');
        expect(doclets).to.be.undefined;
      });
    });

    describe('React Docs', () => {
      let doclet;
      before(async () => {
        const file = path.join(fixtures, 'react-docs.js');
        doclet = await parser(fs.readFileSync(file).toString());
        expect(doclet).to.be.an('object');
      });
      it('should have properties parsed', () => {
        expect(doclet).to.have.property('properties');
        expect(doclet.properties)
          .to.be.an('array')
          .with.lengthOf(3);
      });
      it('should have methods parsed', () => {
        expect(doclet).to.have.property('methods');
        expect(doclet.methods)
          .to.be.an('array')
          .with.lengthOf(2);
      });
      it('should parse the description correctly', () => {
        expect(doclet)
          .to.have.property('description')
          .that.is.equal('Styled button component for the rich and famous!');
      });
      it('should parse the examples correctly', () => {
        expect(doclet)
          .to.have.property('examples')
          .that.is.an('array')
          .with.lengthOf(1);
      });
      it('should parse the properties description correctly', () => {
        expect(doclet)
          .to.have.property('properties')
          .that.is.an('array');
        expect(doclet.properties[0].description).to.equal('Button text.');
      });
    });
  });
});
