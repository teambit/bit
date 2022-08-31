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
    '^.+\\.css$': require.resolve('./transformers/css-transform.js'),
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': require.resolve('./transformers/file-transform.js'),
    // '^(?!.*\\.(svg|png|jpg|jpeg|gif|webp|woff|ttf|woff2)$)': require.resolve('./file-transform.js'),
  },
  transformIgnorePatterns: ['[/\\\\]node_modules[/\\\\].+\\.(js|jsx|ts|tsx|cjs)$', '^.+\\.module\\.(css|sass|scss)$'],
  modulePaths: [],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': require.resolve('identity-obj-proxy'),
    '^react-native$': require.resolve('react-native-web'),
    '^.+\\.module\\.(css|sass|scss)$': require.resolve('identity-obj-proxy'),
  },
  moduleFileExtensions: ['web.js', 'js', 'web.ts', 'ts', 'web.tsx', 'tsx', 'json', 'web.jsx', 'jsx', 'node'],
  testTimeout: 30000, // @todo remove this once mocha-tester is ready and aspect-api testing are using it.
  // watchPlugins: [require.resolve('jest-watch-typeahead/filename'), require.resolve('jest-watch-typeahead/testname')],
};
