const {EnvsAspect}=require('@teambit/envs');
const {NodeAspect}=require('@teambit/node');
const {WorkspaceAspect}=require('@teambit/workspace');
const fs=require('node:fs');const path=require('node:path');
class ExportEnv {
 static dependencies=[EnvsAspect,NodeAspect,WorkspaceAspect];
 static async provider([envs,node,workspace]) {
  console.log('export provider startup');
  const active=()=>fs.existsSync(path.join(workspace.path,'export-active'));
  const event=(text)=>{console.log(text);fs.appendFileSync(path.join(workspace.path,'export-events'),text+'\n');};
  const env=node.compose([]);env.getDependencies=()=>({});
  env.modifyPackageJson=(component,manifest)=>{
   if(active()&&component.id.fullName==='bar/foo'){
    event('export package '+component.id.toString());
    if(fs.existsSync(path.join(workspace.path,'export-package-fails')))throw new Error('fixture export package rejected');
    manifest.exportFixtureVersion=component.id.version;
   }
   return manifest;
  };
  workspace.registerOnComponentLoad((component)=>{
   if(active()&&component.id.fullName==='bar/foo')console.log('export component load');
   return {exportFixture:'loaded'};
  });
  workspace.scope.registerOnPostExport(({ids,lanes},metadata)=>{
   if(!active())return;
   event('export post IDs '+ids.map(id=>id.toString()).join(',')+' lanes '+lanes.map(lane=>lane.toLaneId().toString()).join(',')+' auth '+metadata.auth?.credentials);
   if(fs.existsSync(path.join(workspace.path,'export-post-fails')))throw new Error('fixture post export rejected');
  });
  envs.registerEnv(env);return new ExportEnv();
 }
}
module.exports={default:ExportEnv};
