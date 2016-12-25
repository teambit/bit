/** @flow */
const path = require('path');
const fs = require('fs');
const camelcase = require('camelcase');
const Mocha = require('mocha');

function test(bitDir) {
  return new Promise((resolve) => {
    const mocha = new Mocha();
    fs.readdirSync(bitDir).filter(function (file) {
      return file.substr(-7) === 'spec.js';
    }).forEach(function (file) {
      mocha.addFile(path.join(bitDir, file));
    });
    mocha.run(function (failures) {
      resolve(!failures);
    });
  });
}

function getTemplate(name) {
  return `const expect = require('chai').expect;
const ${camelcase(name)} = require('./impl.js');

describe('${camelcase(name)}', () => {
  it('', () => {
      
  });
});`;
}

module.exports = {
  test,
  getTemplate,
};
