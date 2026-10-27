const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const tool = createRequire(process.argv[1]);
const { ESLint } = tool('eslint');
const input = readline.createInterface({ input: process.stdin });
let engine;
let files;
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
input.on('line', async line => {
  try {
    if (!engine) {
      const request = JSON.parse(line);
      const defaults = path.dirname(path.dirname(tool.resolve('@teambit/react.eslint-config-bit-react')));
      if (JSON.parse(fs.readFileSync(path.join(defaults, 'package.json'), 'utf8')).version !== '2.0.27') {
        throw new Error('unqualified built-in lint configuration');
      }
      const options = request.options;
      options.cwd = path.dirname(tool.resolve('@teambit/react'));
      options.overrideConfig.overrides[0].extends[2] = tool.resolve('eslint-config-prettier');
      options.overrideConfig.overrides[0].parser = tool.resolve('@typescript-eslint/parser');
      engine = new ESLint(options);
      files = request.files;
      send({ ready: true });
    } else {
      const results = await engine.lintFiles(files);
      const formatter = await engine.loadFormatter('stylish');
      send({ results, output: formatter.format(results) });
      input.close();
    }
  } catch (error) {
    send({ error, message: error.message || String(error) });
    input.close();
  }
});
