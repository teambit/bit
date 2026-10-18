// Observe only the native doctor adapter's actual BVM child; forward all writes unchanged.
if (process.execArgv.some(argument => argument.includes('@teambit/bvm.list'))) {
  const fs = require('node:fs');
  const path = require('node:path');
  const journal = path.join(__dirname, 'bvm.jsonl');
  const record = value => fs.appendFileSync(journal, JSON.stringify({ pid: process.pid, ...value }) + '\n');
  record({ event: 'started', execArgv: process.execArgv, argv: process.argv });
  for (const name of ['stdout', 'stderr']) {
    const stream = process[name];
    const original = stream.write;
    stream.write = function (...arguments_) {
      const [chunk, encoding] = arguments_;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined);
      record({ event: name, bytes: bytes.toString('base64') });
      return Reflect.apply(original, this, arguments_);
    };
  }
  process.on('exit', code => record({ event: 'exit', code }));
}
