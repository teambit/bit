export function jestConfigFile() {
  return `// Override the Jest config to ignore transpiling from specific folders

// const reactJestConfig = require('@teambit/react').jestconfig;
// module.exports = {
//   ...reactJestConfig,
//   transformIgnorePatterns: ['/node_modules/(?!(prop-types|@teambit))']
// };
`;
}
