// Snapshot lifecycle adapters hydrate published classes; Rust owns every VCS object and hash.
async function snapshotPreSnap({ selected, automatic, params, directory }) {
  const loaded = await loadHarmony();
  const { ComponentID, ComponentIdList } = bitRequire('@teambit/component-id');
  const components = selected.map((identity) => {
    const component = statusComponents.find((candidate) => candidate.id.toStringWithoutVersion() === identity.split('@')[0]);
    if (!component) throw new Error(`pre-snapshot component was not hydrated: ${identity}`);
    return component;
  });
  const before = new Map(statusComponents.flatMap((component) => component.__nativeSourceProofs.map((proof) => [proof.path, physicalProof(proof.path)])));
  const snapping = loaded.get('teambit.component/snapping');
  const automaticIds = ComponentIdList.fromStringArray(automatic);
  if(typeof params.autoAddedWorkspaceRoot==='string')params.autoAddedWorkspaceRoot=ComponentID.fromString(params.autoAddedWorkspaceRoot);
  for (const callback of snapping.onPreSnapSlot.values()) await callback(components, automaticIds, params);
  const changes = [];
  for (const [filename, proof] of before) {
    const after = physicalProof(filename);
    if (after.hash !== proof.hash) changes.push({before:proof,after});
  }
  const builder = loaded.get('teambit.pipelines/builder');
  const plannedComponents = statusComponents.filter(component =>
    [...selected, ...automatic].some(id => id.split('@')[0] === component.id.toStringWithoutVersion()) && !component.state._consumer.isRemoved());
  const plannedTasks = !params.build && !params.soft && typeof builder.getPlannedTasks === 'function'
    ? builder.getPlannedTasks(plannedComponents, params.isSnap ? 'snap' : 'tag') : new Map();
  const rows = statusComponents.map((component) => {
    const consumer = component.state._consumer;
    component.__nativeSourceProofs = component.__nativeSourceProofs.map((proof) => physicalProof(proof.path));
    const sources = statusSourceOverlays(component, directory, 'presnap');
    return {identity:component.id.toStringWithoutVersion(),snapshotData:{...snapshotData(consumer),plannedTasks:plannedTasks.get(component.id.toStringWithoutVersion())},current:statusMetadata(component.__nativeCurrent,consumer),files:consumer.files.map(statusRelative),sourceOverlays:sources.overlays,sourceOverlayRoot:directory,readSet:sources.proofs,issues:statusIssues(consumer.issues),originalDependencyIdentities:component.__nativeOriginalDependencyIds,dependencyIdentities:[...consumer.dependencies.get(),...consumer.devDependencies.get(),...consumer.peerDependencies.get()].map((dependency)=>dependency.id.toString())};
  });
  return {components:rows,changedWorkspaceSources:changes};
}

function physicalProof(filename) {
  try { return {path:filename,hash:require('crypto').createHash('sha256').update(fs.readFileSync(filename)).digest('hex')}; }
  catch (error) { if (error.code === 'ENOENT') return {path:filename,hash:null}; throw error; }
}

async function snapshotEditor({ selected, automatic, editor, scope }) {
  const { ComponentIdList } = bitRequire('@teambit/component-id');
  const { MessagePerComponentFetcher } = bitRequire('@teambit/snapping/dist/message-per-component.js');
  const Tmp = bitRequire('@teambit/legacy.scope/dist/repositories/tmp.js').default;
  const fetcher = new MessagePerComponentFetcher(ComponentIdList.fromStringArray(selected), ComponentIdList.fromStringArray(automatic));
  // The host protocol owns stdin/stdout, so terminal editors inherit the controlling terminal.
  const childProcess = require('child_process');
  const originalSpawn = childProcess.spawn;
  const terminals = [];
  try {
    try {
      if (process.platform === 'win32') terminals.push(fs.openSync('CONIN$', 'r'),fs.openSync('CONOUT$', 'w'));
      else { const terminal=fs.openSync('/dev/tty','r+'); terminals.push(terminal,terminal); }
    } catch {}
    childProcess.spawn = (binary,args,options) => originalSpawn(binary,args,{...options,stdio:terminals.length===2?[terminals[0],terminals[1],terminals[1]]:['inherit',2,2]});
    const messages = await fetcher.getMessagesFromEditor(new Tmp({getPath:()=>scope}),editor);
    return messages.map(({id,msg})=>({identity:id.toStringWithoutVersion(),message:msg}));
  } finally {
    childProcess.spawn = originalSpawn;
    for (const descriptor of new Set(terminals)) fs.closeSync(descriptor);
  }
}

async function snapshotBuild({ stagedObjects, versions, params, directory }) {
  const loaded = await loadHarmony();
  const scope = loaded.get('teambit.scope/scope');
  const workspace = loaded.get('teambit.workspace/workspace');
  const repository = scope.legacyScope.objects;
  const { BitObject } = bitRequire('@teambit/objects');
  const { ComponentID } = bitRequire('@teambit/component-id');
  // Rust retains these exact compressed objects until publication. Parsing supplies classes only.
  for (const object of stagedObjects) {
    const buffer = fs.readFileSync(object.compressedPath);
    if (require('crypto').createHash('sha1').update(buffer).digest('hex') !== object.compressedSha1) throw new Error('staged native object changed before build');
    const parsed = await BitObject.parseObjectWithSize(buffer, object.compressedPath);
    repository.objects[object.hash] = parsed.object;
    repository.cache.set(object.hash, parsed.object, parsed.inflatedSize);
  }
  const loader = bitRequire('@teambit/legacy.loader').loader;
  const loaderWasStarted = loader.isStarted;
  const componentLogger = workspace.componentLoader.logger;
  const statusLine = componentLogger.setStatusLine;
  if (componentLogger.__nativeSetStatusLine) componentLogger.setStatusLine = componentLogger.__nativeSetStatusLine;
  if (!cliArguments.includes('--json')) loader.on();
  const persist = repository.persist;
  repository.persist = async () => { throw new Error('builder callback attempted native VCS object publication'); };
  try {
    const consumers = [];
    for (const version of versions) {
      const component = statusComponents.find((candidate) => candidate.id.toStringWithoutVersion() === version.identity) ?? await scope.get(ComponentID.fromString(`${version.identity}@${version.version}`));
      if (!component) throw new Error(`build component was not hydrated: ${version.identity}`);
      const consumer = component.state._consumer;
      consumer.version = version.version;
      consumer.buildStatus = 'pending';
      const id = ComponentID.fromString(`${version.identity}@${version.version}`);
      if (workspace.consumer.bitMap.getComponentIfExist(id, {ignoreVersion:true})) workspace.consumer.bitMap.updateComponentId(id, undefined, undefined, true);
      consumers.push(consumer);
    }
    const visible = consumers.filter((consumer)=>workspace.consumer.bitMap.getComponentIfExist(consumer.id,{ignoreVersion:true}));
    const hidden = consumers.filter((consumer)=>!workspace.consumer.bitMap.getComponentIfExist(consumer.id,{ignoreVersion:true}));
    const components = [...await workspace.getManyByLegacy(visible),...await scope.getManyByLegacy(hidden)];
    snapshotBuiltComponents = components;
    const builder = loaded.get('teambit.pipelines/builder');
    await scope.reloadAspectsWithNewVersion(consumers);
    const { builderDataMap } = await builder.tagListener(components.filter((component)=>!component.isDeleted()), {
      disableTagAndSnapPipelines:params.disableTagAndSnapPipelines,throwOnError:true,forceDeploy:params.ignoreBuildErrors,isSnap:params.isSnap,loose:params.loose,
    }, {seedersOnly:false,packageManagerConfigRootDir:params.packageManagerConfigRootDir}, {exitOnFirstFailedTask:params.exitOnFirstFailedTask,skipTests:params.skipTests,skipTasks:params.skipTasks?params.skipTasks.split(',').map((task)=>task.trim()):undefined,loose:params.loose});
    const snapping = loaded.get('teambit.component/snapping');
    snapping._updateComponentsByTagResult(consumers,builder.builderDataMapToLegacyOnTagResults(builderDataMap));
    const artifacts = [];
    const output = components.map((component) => {
      const data = snapshotData(component.state._consumer);
      for (const extension of data.extensions) {
        if (extension.name !== 'teambit.pipelines/builder') continue;
        extension.data = {...extension.data,artifacts:(extension.data.artifacts??[]).map((artifact,artifactIndex)=>{
          const files = artifact.files;
          const refs = (files.refs??[]).map((ref)=>({relativePath:ref.relativePath,file:ref.ref.toString(),...(ref.url?{url:ref.url}:{})}));
          for (const vinyl of files.vinyls??[]) {
            const fileIndex = refs.length;
            const filename = path.join(directory,`artifact-${artifacts.length}`);
            fs.writeFileSync(filename,vinyl.contents,{flag:'wx',mode:0o600});
            refs.push({relativePath:statusRelative(vinyl),file:'__native_artifact_pending__',...(vinyl.url?{url:vinyl.url}:{})});
            artifacts.push({identity:component.id.toStringWithoutVersion(),artifactIndex,fileIndex,relativePath:statusRelative(vinyl),path:filename});
          }
          return {...artifact,files:refs};
        })};
      }
      return {identity:component.id.toStringWithoutVersion(),buildStatus:'succeed',extensions:data.extensions};
    });
    return {versions:output,artifacts};
  } finally { repository.persist = persist; componentLogger.setStatusLine=statusLine; if (!loaderWasStarted) loader.off(); }
}

async function registryPublished({ candidates }) {
  const loaded = await loadHarmony();
  const resolver = loaded.get('teambit.dependencies/dependency-resolver');
  const logger = loaded.get('teambit.component/snapping').logger;
  let registries;
  try { registries = await resolver.getRegistries(); }
  catch (error) {
    const { formatWarningSummary } = bitRequire('@teambit/cli');
    logger.console(formatWarningSummary(`unable to check the registry for published versions, tagging without it: ${error.message}`));
    return {published:candidates.map(()=>false)};
  }
  const { createIsVersionPublished } = bitRequire('@teambit/snapping/dist/published-versions.js');
  const query = createIsVersionPublished(registries,logger);
  return {published:await Promise.all(candidates.map((candidate)=>query(candidate.packageName,candidate.version,candidate.registryUrl)))};
}

let snapshotBuiltComponents = [];
async function snapshotPackageManifests({ plans }) {
  const loaded=await loadHarmony();
  const { ComponentID }=bitRequire('@teambit/component-id');
  const { PackageJsonFile }=bitRequire('@teambit/component.sources');
  const { PackageJsonTransformer }=bitRequire('@teambit/workspace.modules.node-modules-linker');
  const scope=loaded.get('teambit.scope/scope');
  const workspace=loaded.get('teambit.workspace/workspace');
  // Canonical snapshot publication advances the in-memory map before linking;
  // its disk bitmap is committed only after every package callback succeeds.
  for(const plan of plans)workspace.consumer.bitMap.updateComponentId(ComponentID.fromObject(plan.manifest.componentId),undefined,undefined,true);
  if(!snapshotBuiltComponents.length){
    scope.legacyScope.objects.clearObjectsFromCache();
    scope.componentLoader.clearCache();
    workspace.clearAllComponentsCache();
  }
  const result=[];
  for(const plan of plans) {
    const id=ComponentID.fromObject(plan.manifest.componentId);
    const built=snapshotBuiltComponents.find((candidate)=>candidate.id.toStringWithoutVersion()===plan.identity);
    let component=built??statusComponents.find((candidate)=>candidate.id.toStringWithoutVersion()===plan.identity)??await scope.get(id);
    if(!component)throw new Error(`package callback component was not hydrated: ${plan.identity}`);
    if(!built && component.__nativeRow) component=await hydrateStatusComponent({...component.__nativeRow,version:id.version});
    component.id=component.id.changeVersion(id.version);
    component.state._consumer.version=id.version;
    if(plan.versionData) await snapshotBindMetadata(component,plan.versionData,loaded);
    if(!built) await statusApplyLoadCallbacks(component,{workspace:loaded.get('teambit.workspace/workspace'),envs:loaded.get('teambit.envs/envs'),resolver:loaded.get('teambit.dependencies/dependency-resolver')});
    const {name,version,...rest}=plan.manifest;
    delete rest._bit_local;delete rest.source;
    const homepage=component.state._consumer._getHomepage();
    const base={name,version:id.version,...(homepage?{homepage}:{}),...rest};
    const file=new PackageJsonFile({packageJsonObject:base});
    await PackageJsonTransformer.applyTransformers(component,file);
    result.push({identity:plan.identity,manifest:file.packageJsonObject});
  }
  return result;
}


async function snapshotBindMetadata(component,version,loaded) {
  const {ComponentID}=bitRequire('@teambit/component-id');
  const {Dependencies,Dependency}=bitRequire('@teambit/legacy.consumer-component');
  const {ExtensionDataEntry,ExtensionDataList}=bitRequire('@teambit/legacy.extension-data');
  const consumer=component.state._consumer;
  for(const field of ['dependencies','devDependencies','peerDependencies']) consumer[field]=new Dependencies((version[field]??[]).map((dependency)=>Dependency.deserialize(dependency)));
  for(const field of ['packageDependencies','devPackageDependencies','peerPackageDependencies','buildStatus','mainFile','bindingPrefix','overrides']) if(version[field]!==undefined) {
    if(field==='overrides')consumer.overrides=bitRequire('@teambit/legacy.consumer-config').ComponentOverrides.loadFromScope(version[field]);
    else consumer[field]=version[field];
  }
  consumer.extensions=ExtensionDataList.fromModelObject(version.extensions.map((row)=>new ExtensionDataEntry(undefined,row.extensionId?ComponentID.fromObject(row.extensionId):undefined,row.name,row.config,row.data)));
  component.state.aspects=await loaded.get('teambit.workspace/workspace').createAspectList(consumer.extensions);
}
