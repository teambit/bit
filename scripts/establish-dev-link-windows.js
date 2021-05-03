const { exec } = require('child_process');
const path = require('path');

const userLinkName = process.argv[3];
const linkName = userLinkName || 'bit-dev';

const source = path.join(__dirname, '..', 'bin', 'bit.js');
const dest = `%LocalAppData%\\${linkName}`;

const batFileContent = `node ${source} %*`;

exec(`if exist ${dest} rmdir /s/q ${dest}`, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  exec(`mkdir ${dest}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
  
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    exec(`echo @echo off > ${dest}\\${linkName}.bat && echo ${batFileContent} >> ${dest}\\${linkName}.bat`, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
    
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
    
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "if ((Get-Command ${linkName} -ErrorAction SilentlyContinue) -eq $null) { [Environment]::SetEnvironmentVariable('path', [Environment]::GetEnvironmentVariable('path', [EnvironmentVariableTarget]::User) + ';${dest}', 'User'); }"`, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return;
        }
      
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
    
        console.log(`Success!!!\nPlease close and reopen the terminal.\nIf you are using VSCode, you need to close it and reopen.\nThen you will be able to use the ${linkName} command to run your dev app :)`);
      });
    });
  });
});