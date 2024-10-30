const { unlinkSync, mkdirSync, writeFileSync, symlinkSync, rmSync } = require('fs-extra');
const { exec } = require('child_process');
const path = require('path');

const userLinkName = process.argv[3];
const linkName = userLinkName || 'bit-dev';

const source = path.join(__dirname, '..', 'bin', 'bit.js');
const dest = path.join(process.env.localappdata, linkName);

try {
  rmSync(dest, { recursive: true });
} catch (err) {
  if (err.code !== 'ENOENT') {
    throw err; // it can be a permissions error for example. we want to know about it.
  }
}

try {
  unlinkSync(dest);
} catch (err) {} // maybe doesn't exist or not a symlink

mkdirSync(dest);
// for cmd.
writeFileSync(`${dest}\\${linkName}.bat`, `@echo off\nnode ${source} %*`);

// for git bash.
try {
  symlinkSync(source, path.join(dest, linkName));
} catch (err) {
  if (err.code === 'EPERM') {
    console.log(`permission error: please enable developer mode in windows settings`);
  }
}
if (process.env.PATH.includes(dest)) {
  console.log(`Success!!!\nNow you can use the "${linkName}" command to run your dev app.`);
  return;
}

exec(
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Environment]::SetEnvironmentVariable('path', [Environment]::GetEnvironmentVariable('path', [EnvironmentVariableTarget]::User) + ';${dest}', 'User');"`,
  (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    console.log(
      `Success!!!\nPlease close and reopen the terminal.\nIf you are using VSCode, you need to close it and reopen.\nThen you will be able to use the "${linkName}" command to run your dev app :)`
    );
  }
);
