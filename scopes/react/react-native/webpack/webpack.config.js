const moduleFileExtensions = [
  'web.mjs',
  'mjs',
  'web.js',
  'js',
  'web.ts',
  'ts',
  'web.tsx',
  'tsx',
  'json',
  'web.jsx',
  'jsx',
];

module.exports = {
  resolve: {
    // These are the reasonable defaults supported by the Node ecosystem.
    // We also include JSX as a common component filename extension to support
    // some tools, although we do not recommend using it, see:
    // https://github.com/facebook/create-react-app/issues/290
    // `web` extension prefixes have been added for better support
    // for React Native Web.
    extensions: moduleFileExtensions.map((ext) => `.${ext}`),

    // this is for resolving react from env and not from consuming project
    alias: {
      react: require.resolve('react'),
      'react-dom/server': require.resolve('react-dom/server'),
      'react-native$': require.resolve('react-native-web'),
      'react-dom/unstable-native-dependencies': require.resolve('react-dom/unstable-native-dependencies'),
      // 'react-refresh/runtime': require.resolve('react-refresh/runtime'),
    },
  },
};
