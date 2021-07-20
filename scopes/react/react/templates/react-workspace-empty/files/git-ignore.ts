export function gitIgnore() {
  return `.idea/
.vscode/
node_modules/
build
.DS_Store
*.tgz
template/src/__tests__/__snapshots__/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
/.changelog
.npm/
yarn.lock
`;
}
