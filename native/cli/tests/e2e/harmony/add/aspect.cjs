const {EnvsAspect}=require('@teambit/envs');
const {NodeAspect}=require('@teambit/node');
const {WorkspaceAspect}=require('@teambit/workspace');
const fs=require('node:fs');const path=require('node:path');
class AddEnv {
 static dependencies=[EnvsAspect,NodeAspect,WorkspaceAspect];
 static async provider([envs,node,workspace]) {
  const active=()=>fs.existsSync(path.join(workspace.path,'add-callback-active'));
  const observed=(component)=>({
   name:component.id.fullName,
   idVersion:String(component.id.version),
   legacyVersion:String(component.state._consumer.version),
   mainFile:component.state._consumer.mainFile,
   files:component.state._consumer.files.map(file=>file.relative),
   extensions:component.state._consumer.extensions.map(extension=>extension.name||extension.extensionId.toString())
  });
  const event=(phase,component)=>{
   const value={phase,...observed(component)};
   console.log('add callback '+JSON.stringify(value));
   fs.appendFileSync(path.join(workspace.path,'add-callback-events'),JSON.stringify(value)+'\n');
  };
  const env=node.compose([]);env.getDependencies=()=>({});
  env.modifyPackageJson=(component,manifest)=>{
   if(active()&&component.id.fullName!=='env/add'){
    event('package',component);
    if(fs.existsSync(path.join(workspace.path,'add-package-fails'))&&['second','second/failure'].includes(component.id.fullName))throw new Error('fixture add package rejected');
    manifest.addFixture=observed(component);
   }
   return manifest;
  };
  workspace.registerOnComponentLoad((component)=>{
   if(active()&&component.id.fullName!=='env/add')event('load',component);
   return {addFixture:'loaded'};
  });
  envs.registerEnv(env);return new AddEnv();
 }
}
module.exports={default:AddEnv};
