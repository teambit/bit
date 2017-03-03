const pkg = require('./package.json');

module.exports = {
// Documentation for GitBook is stored under "docs"
  root: './docs',
  title: 'Bit - distributed component manager',
  structure: {
    readme: 'INTRODUCTION.md' // TODO - replace to INTRODUCTION.md
  },
  author: 'Rany',
  language: 'en',
  gitbook: '>= 3.2.0',
  plugins: ['sitemap', 'prism', '-highlight'],
  variables: {
    version: pkg.version
  },
  pluginsConfig: {
    sitemap: {
      hostname: 'https://teambit.github.io/bit/'
    },
    sharing: {
      facebook: true,
      twitter: true,
      google: false,
      weibo: false,
      instapaper: false,
      vk: false,
      all: [ 'facebook', 'google', 'twitter', 'weibo', 'instapaper' ]
    }
  }
};
