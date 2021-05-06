const { exec } = require('child_process');
const path = require('path');

const binDir = '/usr/local/bin';

const osPaths = (process.env.PATH || process.env.Path || process.env.path).split(path.delimiter);

if (osPaths.indexOf(binDir) === -1) {
  throw new Error(
    `the directory ${binDir} is not a bin directory on the machine, please update establish-dev-link script`
  );
}

const userLinkName = process.argv[2];
const linkName = userLinkName || 'bit-dev';

const source = path.join(__dirname, '..', 'bin', 'bit.js');
const dest = path.join(binDir, linkName);

exec(`ln -sf ${source} ${dest}`, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  exec(`chmod u+x ${source}`, (e, sout, serr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }

    if (sout) console.log(sout);
    if (serr) console.error(serr);
    console.log(`Now you can use the "${linkName}" command to run your dev app.`);
  });
});
