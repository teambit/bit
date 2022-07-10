const fs = require('fs-extra');
const globby = require('globby');
const { parse } = require('comment-json');
const pkgJson = require('../package.json');
const allDeps = [...Object.keys(pkgJson.dependencies), ...Object.keys(pkgJson.devDependencies)];

const workspaceJson = fs.readFileSync(`${__dirname}/../workspace.jsonc`, 'utf8');
const workspaceJsonParsed = parse(workspaceJson);
const policy = workspaceJsonParsed['teambit.dependencies/dependency-resolver'].policy;
const workspacePackages = [...Object.keys(policy.dependencies), ...Object.keys(policy.peerDependencies)];
const sourceCode = ['src', 'scopes', 'e2e'];
const sourceCodeAbs = sourceCode.map((dir) => `${__dirname}/../${dir}`);
const sourceFiles = globby.sync(sourceCodeAbs);

let unused = [...allDeps];
let unusedWorkspace = [...workspacePackages];
const used = [];

// these are not mentioned in the code, but still needed
const whitelist = [
  'regenerator-runtime',
  'babel-plugin-ramda',
  'eslint-plugin-mocha',
  'eslint-plugin-promise',
  'gh-release',
  'mocha-circleci-reporter',
  'mocha-junit-reporter',
  'prettier-eslint',
  'type-coverage',
];
used.push(...whitelist);
unused = unused.filter((dep) => !whitelist.includes(dep));
unusedWorkspace = unusedWorkspace.filter((dep) => !whitelist.includes(dep));

sourceFiles.forEach((file) => {
  const content = fs.readFileSync(file, 'utf8');
  unused.forEach((dep) => {
    if (content.includes(`'${dep}'`) || content.includes(`"${dep}"`)) {
      // if (content.includes(dep)) {
      console.log('! found ', dep);
      unused = unused.filter((d) => d !== dep);
      used.push(dep);
    }
  });
  unusedWorkspace.forEach((dep) => {
    if (content.includes(`'${dep}'`) || content.includes(`"${dep}"`)) {
      // if (content.includes(dep)) {
      console.log('! found ', dep);
      unusedWorkspace = unusedWorkspace.filter((d) => d !== dep);
      used.push(dep);
    }
  });
});

unused.forEach((dep) => {
  if (dep.startsWith('@types/')) {
    const pkg = dep.replace('@types/', '');
    if (used.includes(pkg)) {
      unused = unused.filter((d) => d !== dep);
      used.push(dep);
    }
  }
});
unusedWorkspace.forEach((dep) => {
  if (dep.startsWith('@types/')) {
    const pkg = dep.replace('@types/', '');
    if (used.includes(pkg)) {
      unusedWorkspace = unusedWorkspace.filter((d) => d !== dep);
      used.push(dep);
    }
  }
});

console.log('[-] unused packages in package.json', unused);
console.log('[-] unused packages in workspace.jsonc', unusedWorkspace);
console.log('[-] total packages', allDeps.length + workspacePackages.length);
console.log('[-] total packages in use:', used.length);
console.log('[-] total packages in package.json not in use:', unused.length);
console.log('[-] total packages in workspace.jsonc not in use:', unusedWorkspace.length);
