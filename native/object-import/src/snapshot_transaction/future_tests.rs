use super::future;
use serde_json::{Value, json};
use std::process::Command;

#[test]
fn raw_version_branches_match_actual_semver_helper_normalization() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else {
        return;
    };
    let script = r"
const{createRequire}=require('node:module'),path=require('node:path');
const load=createRequire(path.join(process.argv[1],'package.json'));
const{ModelComponent}=load('@teambit/objects'),semver=load('semver');
const{getValidVersionOrReleaseType}=load('@teambit/pkg.modules.semver-helper');
const rows=[];
for(const text of ['v1.2.3',' 1.2.3 ','1.2.3+build','1.2.3-beta.2+build','minor','premajor'])for(const mode of ['tag','next','entered'])for(const duplicate of [false,true]){
 const tags=duplicate?['1.2.3']:[],model=ModelComponent.parse(JSON.stringify({name:'c',scope:'q.s',versions:Object.fromEntries(tags.map(v=>[v,'a'.repeat(40)]))}));
 const sem={};for(const t of [...tags,text]){const v=semver.parse(t);sem[t]=v?{canonicalText:semver.valid(t),version:{major:v.major,minor:v.minor,patch:v.patch,prerelease:v.prerelease}}:{}};
 const component={versions:tags,isAutoTag:false,isAutoAddedRoot:false};if(mode==='tag')component.tagData={versionToTag:text};if(mode==='next')component.nextVersion=text;if(mode==='entered')component.enteredVersion=text;
 const request={components:[component],params:{releaseType:'patch',incrementBy:1,persist:mode==='next',soft:false,hasTagData:mode==='tag'},semver:sem};
 try{const parsed=getValidVersionOrReleaseType(text);rows.push({request,expected:model.getVersionToAdd(parsed.releaseType,parsed.exactVersion)});}catch(e){rows.push({request,failed:true});}
}process.stdout.write(JSON.stringify(rows));
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let rows: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    for row in rows {
        let result = future::plan(row["request"].clone());
        if row["failed"] == true {
            assert!(result.is_err());
        } else {
            assert_eq!(result.unwrap()["versions"][0], row["expected"]);
        }
    }
}

#[test]
fn soft_prerelease_autotags_ignore_direct_exact_version() {
    let request = json!({"components":[{"versions":[],"isAutoTag":true,"isAutoAddedRoot":false}],"params":{"releaseType":"preminor","incrementBy":1,"persist":false,"soft":true,"exactVersion":"7.0.0","hasTagData":false},"semver":{}});
    assert_eq!(future::plan(request).unwrap(), json!({"versions":["preminor"]}));
}
