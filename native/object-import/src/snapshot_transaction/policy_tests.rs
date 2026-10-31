use super::future;
use serde_json::Value;
use std::process::Command;

#[test]
fn seeded_future_versions_match_actual_model_component_inc_policy() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else {
        return;
    };
    let script = r"
const {createRequire}=require('node:module'),path=require('node:path');
const load=createRequire(path.join(process.argv[1],'package.json'));
const {ModelComponent}=load('@teambit/objects'),semver=load('semver');
let seed=0x57534;function next(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const releases=['major','minor','patch','premajor','preminor','prepatch','prerelease'];
const pres=[undefined,'beta','canary','alpha.beta','2'];
const rows=[];
for(let i=0;i<1000;i++){
 const n=next(),release=releases[n%releases.length],pre=pres[(n>>>4)%pres.length],count=1+(n>>>8)%3;
 const stored=i%5===0?[]:[`${n%5}.${(n>>>4)%5}.${(n>>>8)%5}${i%3===0?'-beta.'+i%7:''}`,`0.0.1`];
 const exact=i%11===0?stored[0]:i%17===0?'v7.2.3+build':undefined;
 const model=ModelComponent.parse(JSON.stringify({name:'component',scope:'qualification.scope',versions:Object.fromEntries(stored.map(v=>[v,'a'.repeat(40)]))}));
 const ir={};for(const v of [...stored,exact].filter(Boolean)){const s=new semver.SemVer(v);ir[v]={version:{major:s.major,minor:s.minor,patch:s.patch,prerelease:s.prerelease}};}
 const request={components:[{versions:stored,isAutoTag:false,isAutoAddedRoot:false}],params:{releaseType:release,incrementBy:count,persist:false,soft:false,exactVersion:exact,preReleaseId:pre,hasTagData:false},semver:ir};
 try{rows.push({request,expected:model.getVersionToAdd(release,exact,count,pre)});}catch(e){rows.push({request,failed:true});}
}
process.stdout.write(JSON.stringify(rows));
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let cases: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    for (index, case) in cases.iter().enumerate() {
        let result = future::plan(case["request"].clone());
        if case["failed"] == true {
            assert!(result.is_err(), "case {index}");
        } else {
            assert_eq!(result.unwrap()["versions"][0], case["expected"], "case {index}");
        }
    }
}

#[test]
fn seeded_autotag_graphs_match_actual_workspace_preorder_and_ref_provenance() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else {
        return;
    };
    let script = r"
const{createRequire}=require('node:module'),path=require('node:path');
const load=createRequire(path.join(process.argv[1],'package.json'));
const{ComponentID,ComponentIdList}=load('@teambit/component-id'),semver=load('semver');
const{getAutoTagInfo}=load(path.join(path.dirname(load.resolve('@teambit/workspace')),'auto-tag.js'));
let seed=0x4ad77;function next(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const versions=['1.0.0','2.0.0','2.0.0-beta.1','a'.repeat(40)];
const ir={};for(const text of versions){const v=semver.parse(text);ir[text]=v?{version:{major:v.major,minor:v.minor,patch:v.patch,prerelease:v.prerelease}}:{}};
const id=(name,version)=>ComponentID.fromObject({scope:'qualification.scope',name,version});
(async()=>{const rows=[];for(let test=0;test<1000;test++){
 const count=3+next()%8,components=[],locators=new Map();
 for(let index=0;index<count;index++){
  const own=id('component'+index,versions[next()%versions.length]);
  const dependencies=Array.from({length:next()%count},()=>({id:id('component'+next()%count,versions[next()%versions.length])}));
  components.push({id:own,componentId:own,getAllDependencies:()=>dependencies,isDependencyVersionFromConfig:()=>false,dependencies});
  locators.set(own,{kind:'component',component:index});dependencies.forEach((dep,i)=>locators.set(dep.id,{kind:'dependency',component:index,index:i}));
 }
 const changed=ComponentIdList.fromArray(Array.from({length:1+next()%count},()=>id('component'+next()%count,versions[next()%versions.length])));
 const workspace={consumer:{bitMap:{getAllBitIds:()=>ComponentIdList.fromArray(components.map(c=>c.id))}},getMany:async()=>components.map(c=>({state:{_consumer:c}}))};
 const actual=await getAutoTagInfo(workspace,changed);
 const request={changed:changed.map(c=>c.serialize()),components:components.map(c=>({id:c.id.serialize(),dependencies:c.dependencies.map(d=>d.id.serialize())})),semver:ir};
 rows.push({request,expected:{results:actual.map(row=>({component:components.indexOf(row.component),triggeredBy:row.triggeredBy.map(id=>locators.get(id))}))}});
}process.stdout.write(JSON.stringify(rows));})().catch(e=>{console.error(e);process.exitCode=1;});
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let cases: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    for (index, case) in cases.iter().enumerate() {
        assert_eq!(
            super::autotag::plan(&case["request"]).unwrap(),
            case["expected"],
            "case {index}",
        );
    }
}
