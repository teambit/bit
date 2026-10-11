// A disconnected history is seeded with production models only in disposable qualification scopes.
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
async function seedUnrelatedLane(cliRoot, directory, componentId) {
  const load = createRequire(path.join(cliRoot, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  const { Version, Source, Lane } = load('@teambit/objects');
  const { ComponentID } = load('@teambit/component-id');
  const scope = await Scope.load(path.join(directory, '.bit'), false);
  const id = ComponentID.fromString(componentId);
  const model = await scope.getModelComponent(id);
  const current = await scope.objects.load(model.head);
  const digest = (text) => createHash('sha1').update(text).digest('hex');
  const head = digest('merge-state unrelated version');
  const version = Version.parse(current.toBuffer().toString(), head);
  const source = Source.from(Buffer.from('export const value = "unrelated";\n'));
  version.files.find((file) => file.relativePath === 'index.js').file = source.hash();
  version.parents = [];
  version.squashed = undefined;
  version.unrelated = undefined;
  version.log = {
    message: 'unrelated root',
    date: '1700000000999',
    username: 'fixture',
    email: 'fixture@example.invalid',
  };
  version.validate();
  const lane = new Lane({
    name: 'unrelated',
    scope: 'qualification.destination',
    hash: digest('merge-state unrelated lane'),
    components: [{ id, head: version.hash() }],
    log: { date: '1700000000999' },
  });
  await scope.objects.writeObjectsToTheFS([source, version, lane]);
  return head;
}
module.exports = { seedUnrelatedLane };
