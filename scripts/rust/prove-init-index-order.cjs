// Pinned Node-only characterization of Repository.list's parallel model ordering.
// Run: <node22> scripts/rust/prove-init-index-order.cjs <published-bit-bin-path>
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');

async function main() {
  if (!process.argv[2]) throw new Error('pass the published Bit CLI entrypoint');
  const requireBit = createRequire(path.resolve(process.argv[2]));
  const { Scope } = requireBit('@teambit/legacy.scope');
  const { ModelComponent } = requireBit('@teambit/objects');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-init-index-order-'));
  try {
    const scope = await Scope.ensure(root, 'fixture');
    await scope.ensureDir();
    for (const name of ['comp1', 'comp2']) {
      scope.objects.add(new ModelComponent({ scope: 'fixture', name, versions: {} }));
    }
    await scope.objects.persist();
    const orders = [];
    for (let iteration = 0; iteration < 30; iteration++) {
      await fs.rm(path.join(root, 'index.json'), { force: true });
      const index = await scope.objects.loadOptionallyCreateScopeIndex();
      const rows = index.index.components;
      if (rows.length !== 2) throw new Error(`expected two models; found ${rows.length}`);
      orders.push(rows.map(row => ({ name: row.id.name, hash: row.hash })));
    }
    console.log(JSON.stringify({ node: process.version, platform: process.platform, orders }, null, 2));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
