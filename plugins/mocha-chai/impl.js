const Mocha = require('mocha');
const chai = require('chai');

const run = (specFile) => {
  return new Promise((resolve, reject) => {
    const mocha = new Mocha({ reporter: 'json' });

    mocha.addFile(specFile);
    mocha.run()
    
      .on('start', function() { // eslint-disable-line
      })
      .on('end', function() { // eslint-disable-line
        return resolve(this.testResults);
      })
      .on('error', function(err) { // eslint-disable-line
        return reject(err);
      });
  });
};

module.exports = {
  run,
  globals: {
    chai,
  },
  modules: {
    chai
  },
};
