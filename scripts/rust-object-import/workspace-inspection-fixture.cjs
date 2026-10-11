const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');

async function writeComponents(directory, extraFiles = 0) {
  assert.ok(Number.isInteger(extraFiles) && extraFiles >= 0 && extraFiles <= 1000);
  for (const name of ['alpha', 'beta']) {
    const root = path.join(directory, name);
    await fs.mkdir(root);
    await fs.writeFile(
      path.join(root, 'index.js'),
      name === 'alpha'
        ? "\ufeffconst beta = require('@qualification/inspection.beta');\r\nmodule.exports = () => beta();\r\n"
        : "module.exports = () => 'initial β🌱';\r\n"
    );
    await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 255, 13, 10, name === 'alpha' ? 1 : 2]));
    for (let index = 0; index < extraFiles; index++)
      await fs.writeFile(
        path.join(root, `extra-${String(index).padStart(4, '0')}.txt`),
        `${name} file ${index}\n`.padEnd(4095, String(index % 10)) + '\n'
      );
  }
}
async function capture(directory) {
  const objects = {};
  const objectDirectory = path.join(directory, '.bit/objects');
  for (const shard of (await fs.readdir(objectDirectory)).sort()) {
    if (!/^[a-f0-9]{2}$/.test(shard)) continue;
    for (const suffix of (await fs.readdir(path.join(objectDirectory, shard))).sort()) {
      if (!/^[a-f0-9]{38}$/.test(suffix)) continue;
      const bytes = zlib.inflateSync(await fs.readFile(path.join(objectDirectory, shard, suffix)));
      const end = bytes.indexOf(0);
      const [type, hash, length] = bytes.subarray(0, end).toString().split(' ');
      assert.equal(hash, shard + suffix);
      assert.equal(Number(length), bytes.subarray(end + 1).toString('utf8').length);
      objects[hash] = {
        type,
        inflatedHex: bytes.toString('hex'),
        body: type === 'Source' ? undefined : JSON.parse(bytes.subarray(end + 1)),
      };
    }
  }
  const workingFiles = {};
  for (const name of ['alpha', 'beta'])
    for (const file of (await fs.readdir(path.join(directory, name))).sort())
      workingFiles[`${name}/${file}`] = (await fs.readFile(path.join(directory, name, file))).toString('hex');
  const read = async (file) => {
    try {
      return await fs.readFile(path.join(directory, file), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const stagedConfig = {};
  async function readTree(relative) {
    let entries;
    try {
      entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative + '/' + entry.name;
      if (entry.isDirectory()) await readTree(name);
      else stagedConfig[name] = (await fs.readFile(path.join(directory, name))).toString('hex');
    }
  }
  await readTree('.bit/staged-config');
  return {
    objects,
    workingFiles,
    bitmap: await read('.bitmap'),
    config: await read('workspace.jsonc'),
    index: await read('.bit/index.json'),
    stagedSnaps: await read('.bit/staged-snaps'),
    stagedConfig,
    unmerged: await read('.bit/unmerged.json'),
  };
}
async function mutate(directory, phase) {
  if (phase === 'eol') {
    for (const name of ['alpha', 'beta']) {
      const file = path.join(directory, name, 'index.js');
      await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
    }
  } else if (phase === 'content') {
    await fs.writeFile(path.join(directory, 'beta/index.js'), "module.exports = () => 'modified β🌱';\n");
    await fs.writeFile(path.join(directory, 'alpha/binary.bin'), Buffer.from([0, 254, 13, 10, 1]));
  } else if (phase === 'inventory') {
    await fs.rename(path.join(directory, 'beta/binary.bin'), path.join(directory, 'beta/renamed.bin'));
    await fs.writeFile(path.join(directory, 'alpha/added.txt'), 'new inspection Source\n');
  } else if (phase === 'config') {
    await fs.writeFile(
      path.join(directory, 'beta/component.json'),
      JSON.stringify({
        componentId: { scope: 'qualification.inspection', name: 'beta', version: '1.0.0' },
        extensions: {
          'teambit.dependencies/dependency-resolver': {
            policy: { dependencies: { 'inspection-dependency': '^1.2.3' } },
          },
        },
      })
    );
  } else if (phase === 'missing-main') {
    await fs.rm(path.join(directory, 'beta/index.js'));
  } else throw new Error(`unknown inspection phase: ${phase}`);
}
module.exports = { writeComponents, capture, mutate };
