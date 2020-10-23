const { execSync } = require('child_process');
const { SemVer } = require('semver');

const currentTeambitVersion = execSync('npm show @teambit/bit version').toString();
console.log('currentTeambitVersion', currentTeambitVersion);
const teambitSemVer = new SemVer(currentTeambitVersion);
const nextTeambitSevVer = teambitSemVer.inc('patch');
const nextTeambitVersion = nextTeambitSevVer.version;
console.log('nextTeambitSemVer', nextTeambitVersion);

try {
  const output = execSync(`bit tag -a -s ${nextTeambitVersion}`);
  console.log(output.toString());
} catch (err) {
  console.log(err);
  process.exit(1);
}
