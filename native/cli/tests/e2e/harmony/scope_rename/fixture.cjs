const {WorkspaceAspect}=require('@teambit/workspace');
const {EnvsAspect}=require('@teambit/envs');
const {NodeAspect}=require('@teambit/node');
class ScopeDelay {
 static dependencies=[WorkspaceAspect,EnvsAspect,NodeAspect];
 static async provider([workspace,envs,node]) {
  const wait=()=>new Promise(resolve=>setTimeout(resolve,1100));
  workspace.registerOnComponentAdd(async component=>{
   if(component.id.scope==='replacement.scope')await wait();
  });
  workspace.registerOnComponentLoad(async component=>{
   if(component.id.scope==='replacement.scope' || (workspace.defaultScope==='replacement.scope' && ['comp1','comp2','comp3'].includes(component.id.fullName)))await wait();
  });
  const env=node.compose([]);env.getDependencies=()=>({});envs.registerEnv(env);
  return new ScopeDelay();
 }
}
module.exports={default:ScopeDelay};
