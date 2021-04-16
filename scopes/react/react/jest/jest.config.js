module.exports = {
  // "roots": [
  //   "<rootDir>/src"
  // ],
  // "collectCoverageFrom": [
  //   "src/**/*.{js,jsx,ts,tsx}",
  //   "!src/**/*.d.ts"
  // ],
  setupFiles: [require.resolve('react-app-polyfill/jsdom')],
  setupFilesAfterEnv: [require.resolve('./setupTests.js')],
  // "testMatch": [
  // "<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}",
  // "<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}"
  // ],
  testEnvironment: require.resolve('jest-environment-jsdom'),
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': require.resolve('./transformer'),
    '^.+\\.css$': require.resolve('./css-transform.js'),
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': require.resolve('./file-transform.js'),
  },
  transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\].+\\.(js|jsx|ts|tsx)$', '^.+\\.module\\.(css|sass|scss)$'],
  modulePaths: [],
  moduleNameMapper: {
    '^react-native$': require.resolve('react-native-web'),
    '^.+\\.module\\.(css|sass|scss)$': require.resolve('identity-obj-proxy'),
  },
  moduleFileExtensions: ['web.js', 'js', 'web.ts', 'ts', 'web.tsx', 'tsx', 'json', 'web.jsx', 'jsx', 'node'],
  // watchPlugins: [require.resolve('jest-watch-typeahead/filename'), require.resolve('jest-watch-typeahead/testname')],
};
