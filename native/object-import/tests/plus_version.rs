//! Differential qualification of published dependency placeholder resolution.
use bit_object_import::plus_version::{is_plus, resolve};
use std::process::Command;

#[test]
fn placeholders_match_released_dependency_resolver() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else {
        return;
    };
    let script = r"
const {createRequire}=require('node:module');
const path=require('node:path');
const load=createRequire(path.join(process.argv[1], 'package.json'));
const {isPlusVersion,resolvePlusVersion}=load('@teambit/dependency-resolver/dist/plus-version.js');
const rows=[];
for (const version of ['+', '+^', '+~', '+>', '', '-', '1.0.0', '^1.0.0']) {
 for (const resolved of [undefined, '', '2.0.21', '2.0.21-beta.1', '0.0.0-beta', 'a'.repeat(40), '^2.0.0', '*', 'v2.0.0', '=2.0.0', ' 2.0.0 ', '02.0.0', '2.0', '2.0.0+build']) {
  for (const fallback of ['*', '+']) rows.push({version,resolved:resolved??null,fallback,plus:isPlusVersion(version),result:resolvePlusVersion(version,resolved,fallback)});
 }
}
process.stdout.write(JSON.stringify(rows));
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let rows: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout).unwrap();
    for row in rows {
        let version = row["version"].as_str().unwrap();
        assert_eq!(is_plus(version), row["plus"].as_bool().unwrap(), "{row}");
        assert_eq!(
            resolve(version, row["resolved"].as_str(), row["fallback"].as_str().unwrap()),
            row["result"].as_str().unwrap(),
            "{row}",
        );
    }
}

#[test]
fn snapshot_range_usage_matches_released_component_guard() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else { return };
    let script = r"
const {createRequire}=require('node:module');
const path=require('node:path');
const load=createRequire(path.join(process.argv[1], 'package.json'));
const {getPlusRangeVersionsUsage}=load('@teambit/snapping/dist/plus-range-versions.js');
const rows=[];
for (const range of ['+', '+^', '+~', '^1.0.0']) {
 const dependencies=[{id:{scope:'sample.scope',name:'dependency'},packageName:'sample-package',versionRange:range},{id:{scope:'sample.scope',name:'other'},versionRange:range}];
 const extensions=[{name:'teambit.dependencies/dependency-resolver',data:{policy:[{dependencyId:'sample-package',value:{version:range}}]}}];
 for (const environment of [null,{policy:{peers:[{name:'sample-package',version:range,supportedRange:range}]}},{policy:{peerDependencies:{'sample-package':range,'other-package':{version:range}}}}]) {
  const component={getAllDependencies:()=>dependencies.map(dep=>({...dep,id:{toStringWithoutVersion:()=>dep.id.scope+'/'+dep.id.name}})),extensions:{findCoreExtension:()=>extensions[0]},files:environment?[{relative:'env.jsonc',contents:Buffer.from(JSON.stringify(environment))}]:[]};
  rows.push({dependencies,extensions,environment,result:getPlusRangeVersionsUsage(component)});
 }
}
process.stdout.write(JSON.stringify(rows));
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let rows: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout).unwrap();
    for row in rows {
        let actual = bit_object_import::plus_range_versions::usages(
            row["dependencies"].as_array().unwrap(),
            row["extensions"].as_array().unwrap(),
            row.get("environment"),
        );
        assert_eq!(serde_json::json!(actual), row["result"], "{row}");
    }
}
