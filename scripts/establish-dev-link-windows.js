const { rmdirSync, unlinkSync, mkdirSync, writeFileSync } = require('fs');
const { exec } = require('child_process');
const path = require('path');

const userLinkName = process.argv[3];
const linkName = userLinkName || 'bit-dev';

const source = path.join(__dirname, '..', 'bin', 'bit.js');
const dest = `${process.env.localappdata}\\${linkName}`;

try {
  rmdirSync(dest, { recursive: true });
} catch (err) {} // maybe doesn't exist

try {
  unlinkSync(dest);
} catch (err) {} // maybe doesn't exist or not a symlink

mkdirSync(dest);

writeFileSync(`${dest}\\${linkName}.bat`, `@echo off\nnode ${source} %*`);

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
