const npmi = require('npmi');

const dir = process.env.__dir__;
const name = process.env.__name__;
const version = process.env.__version__;

const options = {
  name,                // your module name
  version,             // expected version [default: 'latest']
  path: dir,           // installation path [default: '.']
  forceInstall: false, // force install if set to true (it will do a reinstall) [default: false]
  npmLoad: {           // npm.load(options, callback): this is the "options" given to npm.load()
    loglevel: 'silent' // [default: {loglevel: 'silent'}]
  }
};

npmi(options, (err, result) => {
  if (err) {
    if (err.code === npmi.LOAD_ERR) console.error('npm load error');
    else if (err.code === npmi.INSTALL_ERR) console.error('npm install error');
    return process.send({ type: 'error', payload: err });
  }
  
  return process.send({ type: 'success', payload: result });
});
