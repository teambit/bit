//! Compare resolution-context retention with the published package manager.
use serde_json::{Value, json};
use std::process::Command;

#[test]
fn resolution_context_matches_released_lockfile_merger() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else { return };
    let script = r"
const {createRequire}=require('node:module');
const path=require('node:path');
const load=createRequire(path.join(process.argv[1], 'package.json'));
const {mergeGraphLockfileIntoExisting}=load('@teambit/pnpm/dist/pnpm.package-manager.js');
const contexts=[{}, {pnpmfileChecksum:null,settings:null,overrides:null},
 {pnpmfileChecksum:'bit-1',settings:{autoInstallPeers:true},overrides:{'sample-package':'1.0.0'}},
 {pnpmfileChecksum:'other',settings:{autoInstallPeers:false},overrides:{'sample-package':'2.0.0'}}];
const resolutions=[{}, {packages:{'sample-package@1.0.0':{resolution:{integrity:'sample'}}}},
 {snapshots:{'sample-package@1.0.0':{}}}];
const rows=[];
for (const a of contexts) for (const b of contexts) {
 for (const x of resolutions) for (const y of resolutions) {
  const existing={lockfileVersion:'9.0',...a,...x};
  const graph={lockfileVersion:'9.0',...b,...y};
  const merged=mergeGraphLockfileIntoExisting(existing,graph);
  const result={};
  for (const key of ['pnpmfileChecksum','settings','overrides']) {
   if (Object.hasOwn(merged,key)) result[key]=merged[key];
  }
  rows.push({existing,graph,result});
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
    let rows: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(rows.len(), 144);
    for row in rows {
        let existing = row["existing"].as_object().unwrap();
        let graph = row["graph"].as_object().unwrap();
        let mut actual = existing.clone();
        super::merge(existing, graph, &mut actual);
        actual.retain(|key, _| super::KEYS.contains(&key.as_str()));
        assert_eq!(json!(actual), row["result"], "{row}");
    }
}
