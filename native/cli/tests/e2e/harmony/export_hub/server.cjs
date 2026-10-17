// A disposable central exporter using only the released server's object parser/publisher.
const fs = require('node:fs');
const http = require('node:http');
const { createRequire } = require('node:module');
const [cli, configuration, journal] = process.argv.slice(2);
const req = createRequire(cli);
const { ObjectList, Ref } = req('@teambit/objects');
const { loadScope } = req('@teambit/legacy.scope');
const { saveObjects } = req('@teambit/export');
const retried = new Set();
const server = http.createServer(async (request, response) => {
  try {
    const config = JSON.parse(fs.readFileSync(configuration));
    fs.appendFileSync(journal, JSON.stringify({route:request.url})+'\n');
    if (request.url === '/graphql') {
      const parts = [];
      for await (const part of request) parts.push(part);
      const query = JSON.parse(Buffer.concat(parts));
      fs.appendFileSync(journal, JSON.stringify({query, headers: request.headers}) + '\n');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({data: {getScope: {isLegacy: false, apis: {url: `http://127.0.0.1:${server.address().port}/${query.variables.id}`}}}}));
      return;
    }
    if (request.url.endsWith('/api/scope/fetch')) {
      const parts = [];
      for await (const part of request) parts.push(part);
      const body = JSON.parse(Buffer.concat(parts));
      const scope = request.url.split('/')[1];
      if (body.fetchOptions.type !== 'object') throw new Error('fixture only serves raw existing-object queries');
      const objects = [];
      for (const hash of body.ids) {
        const file = require('node:path').join(config.scopes[scope], 'objects', hash.slice(0, 2), hash.slice(2));
        if (fs.existsSync(file)) objects.push({ ref: new Ref(hash), buffer: fs.readFileSync(file) });
      }
      new ObjectList(objects).toTar().pipe(response);
      return;
    }
    if (request.url.endsWith('/api/scope/put') && config.mode.startsWith('direct')) {
      const objects=await ObjectList.fromTar(request);
      fs.appendFileSync(journal,JSON.stringify({push:request.url.split('/')[1],headers:request.headers,order:objects.objects.map(item=>({hash:item.ref.hash,scope:item.scope})),hash:objects.getSha1Hash()})+'\n');
      response.statusCode=500;
      response.setHeader('content-type','application/json');
      response.end('{}');
      return;
    }
    if (request.url !== '/exporter/api/put') throw new Error(`unexpected route ${request.url}`);
    const objects = await ObjectList.fromTar(request);
    const order = objects.objects.map(item => ({scope: item.scope, hash: item.ref.hash, type: item.type}));
    fs.appendFileSync(journal, JSON.stringify({headers: request.headers, order, hash: objects.getSha1Hash()}) + '\n');
    if (config.mode === 'retry' && !retried.has(request.headers['x-request-id'])) {
      retried.add(request.headers['x-request-id']);
      request.socket.destroy();
      return;
    }
    if (config.mode === 'interrupt') {
      response.setHeader('content-type','application/x-ndjson');
      response.write(JSON.stringify({message:'fixture exporter received objects'})+'\n');
      const release=require('node:path').join(require('node:path').dirname(configuration),'interrupt-release');
      while(!fs.existsSync(release))await new Promise(resolve=>setTimeout(resolve,10));
    }
    const successIds = [];
    if (config.mode.startsWith('failure')) {
      response.end(JSON.stringify({end:true,data:{successIds:[],failedScopes:Object.keys(config.scopes),errors:Object.fromEntries(Object.keys(config.scopes).map(name=>[name,'fixture persistence failed'])),metadata:{jobs:[]}}}) + '\n');
      return;
    }
    const groups = objects.splitByScopeName();
    for (const [name, list] of Object.entries(groups)) {
      if (!config.scopes[name]) throw new Error(`unknown scope ${name}`);
      const scope = await loadScope(config.scopes[name], false);
      successIds.push(...(await saveObjects(scope, list)).map(id => id.toString()));
    }
    // The callback fixture supplies a stable wire acknowledgement; publication stays canonical.
    if (config.mode === 'callback') successIds.sort();
    if (!response.headersSent) response.setHeader('content-type', 'application/x-ndjson');
    response.write(JSON.stringify({message: 'fixture exporter persisted objects'}) + '\n');
    response.end(JSON.stringify({end: true, data: {successIds: config.mode === 'subset' ? successIds.slice(0, 1) : successIds, failedScopes: [], errors: {}, metadata: {jobs: config.mode.startsWith('jobs') ? ['fixture-job'] : []}}}) + '\n');
  } catch (error) {
    fs.appendFileSync(journal, JSON.stringify({error: error.stack}) + '\n');
    response.statusCode = 500;
    response.end(JSON.stringify({end: true, message: error.message, data: {isError: true}}) + '\n');
  }
});
server.listen(0, '127.0.0.1', () => process.stdout.write(String(server.address().port) + '\n'));
