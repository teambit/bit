// Remove one actual build artifact Source while retaining every component source.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
(async () => {
  const [cli, sourcePath, id] = process.argv.slice(2);
  const req = createRequire(cli);
  const { loadScope } = req('@teambit/legacy.scope');
  const { ComponentID } = req('@teambit/component-id');
  const scope = await loadScope(sourcePath, false);
  const model = await scope.getModelComponent(ComponentID.fromString(id));
  const version = await model.loadVersion('0.0.1', scope.objects);
  const originals = new Set(version.files.map(file => file.file.toString()));
  const artifacts = version.extensions.findCoreExtension('teambit.pipelines/builder')?.data?.artifacts || [];
  const refs = artifacts.flatMap(artifact => artifact.files.refs || artifact.files || []);
  const artifact = refs.map(file => file.ref || file.file).find(ref => ref && !originals.has(ref.toString()));
  if (!artifact) throw new Error('fixture build has no independent artifact Source');
  const hash = artifact.toString();
  fs.unlinkSync(path.join(sourcePath, 'objects', hash.slice(0, 2), hash.slice(2)));
})().catch(error => { console.error(error); process.exitCode = 1; });
