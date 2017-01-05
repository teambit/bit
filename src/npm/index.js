/** @flow */
const npmi = require('npmi');

export default ({ name, version, dir }: { name: string, version: string, dir: string }) => {
  const options = {
    name,    // your module name
    version,             // expected version [default: 'latest']
    path: dir,    // installation path [default: '.']
    forceInstall: false, // force install if set to true (it will do a reinstall) [default: false]
    npmLoad: {           // npm.load(options, callback): this is the "options" given to npm.load()
      loglevel: 'silent' // [default: {loglevel: 'silent'}]
    }
  };

  return new Promise((resolve, reject) => {
    npmi(options, (err, result) => { // eslint-disable-line
      if (err) {
        if (err.code === npmi.LOAD_ERR) console.log('npm load error');
        else if (err.code === npmi.INSTALL_ERR) console.log('npm install error');
        return reject(err);
      }
      // installed
      resolve(result);
    });
  });
};
