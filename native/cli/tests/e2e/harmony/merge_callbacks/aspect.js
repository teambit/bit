// @ts-nocheck
const {EnvsAspect}=require('@teambit/envs');
const {NodeAspect}=require('@teambit/node');
const {WorkspaceAspect}=require('@teambit/workspace');
const {SnappingAspect}=require('@teambit/snapping');
const fs=require('fs');const path=require('path');
class MergeEnv {
 /** @type {any[]} */
 static dependencies=[EnvsAspect,NodeAspect,WorkspaceAspect,SnappingAspect];
 /** @returns {Promise<any>} */
 static async provider([envs,node,workspace,snapping]) {
  console.log('merge provider startup');
  const env=node.compose([]);env.getDependencies=()=>({});
  const modifyPackageJson=env.modifyPackageJson;
  env.modifyPackageJson=(component,manifest)=>{
   if(fs.existsSync(path.join(workspace.path,'merge-package-fails')) && /^[a-f0-9]{40}$/.test(component.id.version??'')) {
    console.log('merge package callback');throw new Error('merge package rejected');
   }
   return modifyPackageJson?.call(env,component,manifest)??manifest;
  };
  workspace.registerOnComponentLoad((component)=>{
   if(component.id.fullName!=='bar/foo')return;
   console.log('merge component load');
   return {mergeCallback:'loaded'};
  });
  snapping.registerOnPreSnap((components)=>{
   if(!components.some((component)=>component.id.fullName==='bar/foo'))return;
   console.log('merge pre-snap');
   fs.appendFileSync(path.join(workspace.path,'merge-presnap-events'),'x');
  });
  env.getBuildPipe=()=>[{aspectId:'__ENV__',name:'MergeArtifact',execute:async(context)=>{
   console.log('merge builder task');
   fs.appendFileSync(path.join(workspace.path,'merge-build-events'),'x');
   const capsules=context.capsuleNetwork.seedersCapsules;
   for(const capsule of capsules)fs.writeFileSync(path.join(capsule.path,'merge-artifact.txt'),'native merge builder artifact\n');
   const fail=fs.existsSync(path.join(workspace.path,'merge-build-fails'));
   return {componentsResults:capsules.map((capsule)=>({component:capsule.component,...(fail?{errors:['merge builder rejected']}:{})})),artifacts:[{name:'merge-fixture',globPatterns:['merge-artifact.txt']}]};
  }}];
  env.getTagPipe=()=>[];env.getSnapPipe=()=>[];
  envs.registerEnv(env);return new MergeEnv();
 }
}
module.exports={default:MergeEnv};
