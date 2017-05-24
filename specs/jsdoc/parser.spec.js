import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { parser } from '../../src/jsdoc';

describe('JSDoc Parser', () => {
  describe('parse()', () => {
    describe('Function Declaration', () => {
      let doclet;
      before(() => {
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

    describe('Invalid code', () => {
      it('should returns an empty array', () => {
        const doclets = parser('this is an invalid code');
        expect(doclets).to.be.a('array');
        expect(doclets).to.have.lengthOf(0);
      });
    });

    describe('Method Declaration and Class Declaration', () => {
      let doclets;
      before(() => {
        const methodDeclarationFile = path.join(__dirname, 'fixtures', 'methodDeclaration.js');
        const methodDeclaration = fs.readFileSync(methodDeclarationFile).toString();
        doclets = parser(methodDeclaration);
      });
      it('should be a populated array', () => {
        expect(doclets).to.be.an('array');
        expect(doclets).to.have.length.of.at.least(2);
      });
      xit('should recognize the Class Declaration first', () => {
        const doclet = doclets[0];
        expect(doclet).to.have.all.keys('name', 'description');
        expect(doclet.name).to.equal('Point');
        expect(doclet.description).to.equal('Class representing a point.');
      });
      it('should recognize the constructor', () => {
        const doclet = doclets[0];
        expect(doclet).to.have.property('name').that.equals('constructor');
        expect(doclet).to.have.property('description').that.equals('Create a point.');
        expect(doclet).to.have.property('access').that.equals('public');
        expect(doclet).to.have.property('static').that.is.false;
        expect(doclet).to.have.property('returns').that.is.an('object').that.is.empty;
        expect(doclet).to.have.property('examples').that.is.an('array').that.is.empty;
      });
      it('should extract the constructor\'s args correctly', () => {
        const doclet = doclets[0];
        expect(doclet).to.have.property('args').that.is.an('array').with.lengthOf(2);
        const args = doclet.args;
        for (const arg of args) {
          expect(arg).to.include.keys('name', 'type', 'description');
          expect(arg.type).to.equal('number');
        }
        expect(args[0].name).to.equal('x');
        expect(args[1].name).to.equal('y');
        expect(args[0].description).to.equal('The x value.');
        expect(args[1].description).to.equal('The y value.');
      });
      it('should recognize the getX method', () => {
        const doclet = doclets[1];
        expect(doclet).to.have.property('name').that.equals('getX');
        expect(doclet).to.have.property('description').that.equals('Get the x value.');
        expect(doclet).to.have.property('access').that.equals('public');
        expect(doclet).to.have.property('static').that.is.false;
        expect(doclet).to.have.property('returns').that.is.an('object').that.is.not.empty;
        expect(doclet).to.have.property('examples').that.is.an('array').that.is.empty;
        expect(doclet).to.have.property('args').that.is.an('array').that.is.empty;
      });
      it('should recognize the getY method', () => {
        const doclet = doclets[2];
        expect(doclet).to.have.property('name').that.equals('getY');
        expect(doclet).to.have.property('description').that.equals('Get the y value.');
      });
      it('should recognize the fromString method as the last doclet', () => {
        const doclet = doclets[doclets.length-1];
        expect(doclet).to.have.property('name').that.equals('fromString');
        expect(doclet).to.have.property('description')
          .that.equals('Convert a string containing two comma-separated numbers into a point.');
      });
    });

    describe('Variable Declaration', () => {
      let doclets;
      before(() => {
        const variableDeclarationFile = path.join(__dirname, 'fixtures', 'variableDeclaration.js');
        const variableDeclaration = fs.readFileSync(variableDeclarationFile).toString();
        doclets = parser(variableDeclaration);
      });
      it('should be an array of one Doclet', () => {
        expect(doclets).to.be.an('array').and.to.have.lengthOf(1);
      });
      it('should parse the doc correctly', () => {
        const doclet = doclets[0];
        expect(doclet).to.have.property('name').that.equals('add');
        expect(doclet).to.have.property('description').that.equals('Adds two numbers.');
        expect(doclet).to.have.property('access').that.equals('public');
        expect(doclet).to.have.property('static').that.is.false;
        expect(doclet).to.have.property('returns').that.is.an('object').that.is.not.empty;
        expect(doclet).to.have.property('examples').that.is.an('array').that.is.not.empty;
        expect(doclet).to.have.property('args').that.is.an('array').that.have.lengthOf(2);
      });
    });

    describe('Various Param Types', () => {
      let args;
      before(() => {
        const file = path.join(__dirname, 'fixtures', 'variousParamTypes.js');
        const doclets = parser(fs.readFileSync(file).toString());
        expect(doclets).to.be.an('array').and.to.have.lengthOf(1);
        const doclet = doclets[0];
        expect(doclet).to.have.property('args').that.is.an('array').that.is.not.empty;
        args = doclet.args;
      });
      it('should recognize "*" as "*"', () => {
        const anyArg = args.find(arg => arg.name === 'anyType');
        expect(anyArg.type).to.equal('*');
      });
      it('should recognize "[]" as "[]"', () => {
        const anyArg = args.find(arg => arg.name === 'arrayType');
        expect(anyArg.type).to.equal('[]');
      });
      it('should recognize Union type correctly', () => {
        const anyArg = args.find(arg => arg.name === 'unionType');
        expect(anyArg.type).to.equal('(number|[])');
      });
      it('should recognize custom type correctly', () => {
        const anyArg = args.find(arg => arg.name === 'myCustomType');
        expect(anyArg.type).to.equal('CustomType');
      });
      it('should recognize Object type', () => {
        const anyArg = args.find(arg => arg.name === 'objectType');
        expect(anyArg.type).to.equal('Object');
      });
      it('should recognize Function type', () => {
        const anyArg = args.find(arg => arg.name === 'functionType');
        expect(anyArg.type).to.equal('Function');
      });
      it('should recognize Array of one type', () => {
        const anyArg = args.find(arg => arg.name === 'arrayOfType');
        expect(anyArg.type).to.equal('Array<string>');
      });
      it('should recognize Array of union', () => {
        const anyArg = args.find(arg => arg.name === 'arrayOfUnion');
        expect(anyArg.type).to.equal('Array<(number|Object)>');
      });
    });

    describe('Flow Type File', () => {
      it('should parse the file with no errors', () => {
        const file = path.join(__dirname, 'fixtures', 'flowTypeFile.js');
        const doclets = parser(fs.readFileSync(file).toString());
        expect(doclets).to.be.an('array').and.to.have.lengthOf(1);
        const doclet = doclets[0];

        expect(doclet).to.have.property('name').that.equals('first');
        expect(doclet).to.have.property('description').that.equals('returns the first element of an array reference.');
        expect(doclet).to.have.property('access').that.equals('public');
        expect(doclet).to.have.property('static').that.is.false;
        expect(doclet).to.have.property('returns').that.is.an('object').that.is.not.empty;
        expect(doclet).to.have.property('examples').that.is.an('array').that.is.not.empty;
        expect(doclet).to.have.property('args').that.is.an('array').that.is.not.empty;
      });
    });

    describe('Description Tag', () => {
      let doclets;
      before(() => {
        const file = path.join(__dirname, 'fixtures', 'descriptionTag.js');
        doclets = parser(fs.readFileSync(file).toString());
        expect(doclets).to.be.an('array').and.to.have.lengthOf(3);
      });
      it('should ignore an invalid description', () => {
        const doclet = doclets[0];
        expect(doclet.name).to.equal('invalidDescription');
        expect(doclet.description).to.equal('');
      });

      it('should recognize the description tag', () => {
        const doclet = doclets[1];
        expect(doclet.name).to.equal('descriptionTag');
        expect(doclet.description).to.equal('Adds two numbers.');
      });

      it('should recognize the synonym "desc"', () => {
        const doclet = doclets[2];
        expect(doclet.name).to.equal('descTag');
        expect(doclet.description).to.equal('Adds two numbers.');
      });
    });

    describe('Access property', () => {
      let doclets;
      before(() => {
        const file = path.join(__dirname, 'fixtures', 'misc.js');
        doclets = parser(fs.readFileSync(file).toString());
        expect(doclets).to.be.an('array');
      });
      it('should find only public functions', () => {
        expect(doclets.find(doclet => doclet.name === 'publicFunc')).not.to.be.empty;
        expect(doclets.find(doclet => doclet.name === 'privateFunc')).to.be.empty;
      });
    });

    describe('Properties property', () => {
      let doclets;
      before(() => {
        const file = path.join(__dirname, 'fixtures', 'properties.js');
        doclets = parser(fs.readFileSync(file).toString());
        expect(doclets).to.be.an('array');
      });
      it('should parse the property tag correctly', () => {
        const doclet = doclets[0];
        expect(doclet).to.have.property('properties').that.is.an('array').that.have.lengthOf(5);
        expect(doclet.properties[0].name).to.equal('defaults');
        expect(doclet.properties[0].type).to.equal('object');
        expect(doclet.properties[0].description).to.equal('The default values for parties.');
      });
    });
  });
});
