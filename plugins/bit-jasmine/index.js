const Jasmine = require('jasmine');
const path = require('path');
const camelcase = require('camelcase');

function test(bitDir) {
  return new Promise((resolve) => {
    const relativeBitDir = path.relative(process.cwd(), bitDir); // for some reason, Jasmine doesn't accept an absolute path
    const jasmine = new Jasmine();
    jasmine.loadConfig({
      spec_dir: relativeBitDir,
      spec_files: ['spec.js'],
    });
    jasmine.configureDefaultReporter({
      showColors: true
    });
    jasmine.onComplete(passed => resolve(passed));
    jasmine.execute();
  });
}

function getTemplate(name) {
  return `const ${camelcase(name)} = require('./impl.js');

describe('${camelcase(name)}', () => {
  it('', () => {
      
  });
});`;
}

module.exports = {
  test,
  getTemplate,
};
