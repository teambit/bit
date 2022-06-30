const { generateNodeModulesPattern } = require('@teambit/dependencies.modules.packages-excluder');

const packagesToExclude = ['@react-native', 'react-native', 'react-native-'];

module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [`<rootDir>/${generateNodeModulesPattern({ packages: packagesToExclude })}`],
  transform: { '^.+\\.(js|jsx|ts|tsx)$': '<rootDir>/node_modules/react-native/jest/preprocessor.js' },
  setupFilesAfterEnv: [require.resolve('./setupTests.js')],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      require.resolve('./assets-transformer.js'),
  },
};
