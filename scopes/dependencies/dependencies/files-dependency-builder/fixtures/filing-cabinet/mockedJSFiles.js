module.exports = {
  js: {
    es6: {
      'foo.js': 'import bar from "./bar";',
      'foo.jsx': 'import React from "react"; export default () => { return (<div></div>); }',
      'bar.js': 'export default function() {};'
    },
    cjs: {
      'foo.js': 'module.exports = 1;',
      'bar.jsx': 'var React = require("react"); module.exports = function() { return (<div></div>); };',
      'baz.scss': '.main: {}',
      'pkg.json': ''
    },
    ts: {
      'index.ts': 'import foo from "./foo";',
      'foo.ts': 'export default 1;'
    },
    amd: {
      'foo.js': 'define(["./bar"], function(bar){ return bar; });',
      'bar.js': 'define({});'
    },
    commonjs: {
      'foo.js': 'var bar = require("./bar");',
      'bar.js': 'module.exports = function() {};',
      'foo.baz': 'module.exports = "yo";',
      'index.js': '',
      'module.entry.js': 'import * as module from "module.entry"',
      subdir: {
        'module.js': 'var entry = require("../");',
        'index.js': ''
      },
      test: {
        'index.spec.js': 'var subdir = require("subdir");'
      }
    },
    node_modules: {
      'lodash.assign': {
        'index.js': 'module.exports = function() {};'
      },
      'module.entry': {
        'index.main.js': 'module.exports = function() {};',
        'index.module.js': 'module.exports = function() {};',
        'package.json': '{ "main": "index.main.js", "module": "index.module.js" }'
      },
      nested: {
        'index.js': 'require("lodash.assign")',
        node_modules: {
          'lodash.assign': {
            'index.js': 'module.exports = function() {};'
          }
        }
      }
    },
    withIndex: {
      subdir: {
        'index.js': ''
      },
      'index.js': 'var sub = require("./subdir");'
    }
  }
};
