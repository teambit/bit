use super::dedupe;
use serde_json::{Value, json};
use std::process::Command;

fn fixture(peer: bool) -> Value {
    json!({"lockfileVersion":"9.0", "importers":{"component":{"dependencies":{
        "fixture-parent":{"specifier":"1.0.0","version":"1.0.0"}}}},
        "packages":{"fixture-parent@1.0.0":{"resolution":{"integrity":"sha512-parent"},
            "peerDependencies":if peer {json!({"fixture-leaf":"*"})} else {json!({})}},
            "fixture-leaf@2.0.0":{"resolution":{"integrity":"sha512-leaf"}}},
        "snapshots":{"fixture-parent@1.0.0":{"dependencies":{"fixture-leaf":"2.0.0"}},
            "fixture-leaf@2.0.0":{}}})
}

#[test]
fn root_versions_and_peers_win_without_overriding_explicit_overrides() {
    let cases = [false, true]
        .into_iter()
        .flat_map(|peer| {
            ["1.0.0", "v2.0.0", "^1", "latest", "link:../leaf", "npm:fixture-leaf@1"]
                .into_iter()
                .map(move |specifier| (peer, specifier))
        });
    let policies = ["dependencies", "devDependencies", "optionalDependencies"]
        .into_iter()
        .flat_map(|field| {
            [false, true]
                .into_iter()
                .map(move |overridden| (field, overridden))
        })
        .collect::<Vec<_>>();
    for (peer, specifier) in cases {
        for (field, overridden) in &policies {
            let mut lockfile = fixture(peer);
            lockfile["overrides"] = if *overridden {
                json!({"fixture-parent>fixture-leaf@*":"2.0.0"})
            } else {
                json!({})
            };
            dedupe(
                lockfile.as_object_mut().unwrap(),
                json!({(*field):{"fixture-leaf":specifier}}).as_object(),
            )
            .unwrap();
            let expected = specifier != "v2.0.0" && (specifier == "1.0.0" || peer);
            assert_eq!(
                lockfile["snapshots"]["fixture-parent@1.0.0"]["dependencies"]
                    .get("fixture-leaf")
                    .is_none(),
                expected && *field != "optionalDependencies" && !overridden,
                "{peer} {specifier} {field} {overridden}",
            );
        }
    }
}

#[test]
fn released_graph_conversion_deduplicates_before_resolution() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else { return };
    let script = r"
const {createRequire}=require('node:module');
const load=createRequire(require('node:path').join(process.argv[1],'package.json'));
const {DependenciesGraph}=load('@teambit/objects');
const converter=load('@teambit/pnpm/dist/lockfile-deps-graph-converter.js');
(async()=>{
 await converter.init();
 const rows=[];
 for(const peer of [false,true]) for(const specifier of ['1.0.0','v2.0.0','^1','latest','link:../leaf','npm:fixture-leaf@1']) {
  const graph=new DependenciesGraph({packages:new Map([
   ['fixture-parent@1.0.0',{resolution:{integrity:'sha512-parent'},peerDependencies:peer?{'fixture-leaf':'*'}:{}}],
   ['fixture-leaf@2.0.0',{}]]),edges:[
   {id:'.',neighbours:[{id:'fixture-parent@1.0.0',name:'fixture-parent',specifier:'1.0.0',lifecycle:'runtime'}]},
   {id:'fixture-parent@1.0.0',neighbours:[{id:'fixture-leaf@2.0.0'}]}]});
  const resolved=[];
  const result=await converter.convertGraphToLockfile(graph,{rootDir:'/fixture',manifests:{
   '/fixture':{dependencies:{'fixture-leaf':specifier}},
   '/fixture/component':{dependencies:{'fixture-parent':'1.0.0'}}},
   resolve:async dep=>{resolved.push(dep.alias);return {resolution:{integrity:'sha512-leaf'}}}});
  rows.push({peer,specifier,result,resolved});
 }
 process.stdout.write(JSON.stringify(rows));
})().catch(error=>{console.error(error);process.exitCode=1});
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let rows: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(rows.len(), 12);
    for row in rows {
        let mut lockfile = fixture(row["peer"].as_bool().unwrap());
        dedupe(
            lockfile.as_object_mut().unwrap(),
            json!({"dependencies":{"fixture-leaf":row["specifier"]}}).as_object(),
        )
        .unwrap();
        super::super::merge::drop_unreachable(
            lockfile.as_object_mut().unwrap(),
            super::super::dep_path::remove_suffix,
        );
        for field in ["packages", "snapshots"] {
            assert_eq!(lockfile[field], row["result"][field], "{row}");
        }
        let exists = lockfile["packages"].get("fixture-leaf@2.0.0").is_some();
        assert_eq!(row["resolved"], if exists { json!(["fixture-leaf"]) } else { json!([]) });
    }
}
