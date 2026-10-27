const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const prettier = createRequire(process.argv[1])('prettier');
const files = JSON.parse(fs.readFileSync(0, 'utf8'));
Promise.all(files.map(async ({ filePath, absolutePath, source }) => {
  const options = { trailingComma: 'es5', tabWidth: 2, singleQuote: true, filepath: absolutePath };
  const hasIssues = !(await prettier.check(source, options));
  const formatted = await prettier.format(source, options);
  return { filePath: path.normalize(filePath), hasIssues, ...(hasIssues ? { newContent: formatted } : {}) };
})).then(results => process.stdout.write(JSON.stringify(results))).catch(error => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});
