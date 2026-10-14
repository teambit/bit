// Actual canonical workspace loading used as the oracle for cold merge metadata.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

async function capture(cli, directory, identities) {
  process.chdir(directory);
  const load = createRequire(path.join(cli, 'package.json'));
  const { loadBit } = load('@teambit/bit/dist/load-bit.js');
  const harmony = await loadBit(directory);
  const workspace = harmony.get('teambit.workspace/workspace');
  const results = [];
  for (const identity of identities) {
    const component = await workspace.get(await workspace.resolveComponentId(identity));
    const consumer = component.state._consumer;
    const metadata = consumer.toObject();
    metadata.files = consumer.files.map((file) => ({ relativePath: file.relative, test: file.test }));
    results.push({
      identity,
      metadata,
      modelExtensions: consumer.extensions.clone().toModelObjects(),
      undefinedDataKeys: Object.fromEntries(
        consumer.extensions.map((extension) => [
          extension.name || extension.extensionId?.toString(),
          Object.keys(extension.data).filter((key) => extension.data[key] === undefined),
        ])
      ),
    });
  }
  return results;
}

if (require.main === module) {
  const [cli, directory, output, ...identities] = process.argv.slice(2);
  capture(cli, directory, identities)
    .then((result) => {
      fs.writeFileSync(output, JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
module.exports = { capture };
