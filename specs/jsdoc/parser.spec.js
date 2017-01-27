import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { parser } from '../../src/jsdoc';

describe('JSDoc Parser', () => {
  describe('parse()', () => {
    describe('Function Declaration', () => {
      let doclet;
      before(function() {
        const functionDeclarationFile = path.join(__dirname, 'fixtures', 'functionDeclaration.js');
        const functionDeclaration = fs.readFileSync(functionDeclarationFile).toString();
        const doclets = parser(functionDeclaration);
        expect(doclets).to.be.a('array');
        expect(doclets).to.have.lengthOf(1);
        doclet = doclets[0];
      });
      it('should have all the proper keys', () => {
        expect(doclet).to.include.keys('name', 'description', 'returns', 'args', 'access', 'examples', 'static');
      });
      it('should extract the correct name', () => {
        expect(doclet.name).to.equal('add');
      });
      it('should extract the correct description', () => {
        expect(doclet.description).to.equal('Adds two numbers.');
      });
      it('should extract the correct args', () => {
        const args = doclet.args;
        expect(args).to.be.a('array');
        expect(args).to.have.lengthOf(2);
        for (const arg of args) {
          expect(arg).to.include.keys('name', 'type', 'description');
        }
        expect(args[0].name).to.equal('a');
        expect(args[1].name).to.equal('b');
        expect(args[0].description).to.equal('The first number in an addition.');
        expect(args[1].description).to.equal('The second number in an addition.');
        expect(args[0].type).to.equal('number');
        expect(args[1].type).to.equal('number');
      });
      it('should extract the correct returns', () => {
        expect(doclet.returns).to.include.keys('type', 'description');
        expect(doclet.returns.description).to.equal('Returns the total.');
        expect(doclet.returns.type).to.equal('number');
      });
      it('should extract the correct access from the @public annotation', () => {
        expect(doclet.access).to.equal('public');
      });
      it('should extract the static attribute from the @static annotation', () => {
        expect(doclet.static).to.be.true;
      });
    });
  });
});



