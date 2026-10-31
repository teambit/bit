use super::{filter, graph};
use crate::commands::workspace_command::snapshot::graph::{Snapped, replacer::Replacer};
use serde_json::{Value, json};
use std::{
    io::Write,
    process::{Command, Stdio},
};

fn fixture() -> Value {
    json!({
        "lockfileVersion":"9.0", "settings":{"autoInstallPeers":false}, "overrides":{"unused":"-"},
        "importers":{
            "component":{"dependencies":{"alpha":{"specifier":"^1","version":"1.0.0"}},
                "devDependencies":{"alias":{"specifier":"npm:beta@1","version":"beta@1.0.0"}},
                "optionalDependencies":{"linked":{"specifier":"*","version":"link:../other"}}},
            "root":{"dependencies":{"@fixture/component":{"specifier":"*","version":"file:component"},
                "unrelated":{"specifier":"*","version":"1.0.0"}}}
        },
        "packages":{
            "alpha@1.0.0":{"resolution":{"integrity":"sha512-alpha"}},
            "beta@1.0.0":{"resolution":{"integrity":"sha512-beta"}},
            "missing@1.0.0":{"resolution":{"integrity":"sha512-missing"}},
            "unrelated@1.0.0":{"resolution":{"integrity":"sha512-unrelated"}},
            "@fixture/component@file:component":{"resolution":{"type":"directory","directory":"component"}}
        },
        "snapshots":{
            "alpha@1.0.0":{"dependencies":{"beta":"1.0.0"},"optionalDependencies":{"missing":"1.0.0"}},
            "beta@1.0.0":{"dependencies":{"alpha":"1.0.0"}},
            "unrelated@1.0.0":{},
            "@fixture/component@file:component":{"dependencies":{"alpha":"1.0.0"}}
        }
    })
}

#[test]
fn reachable_filter_preserves_cycles_aliases_and_packages_without_snapshots() {
    let source = fixture();
    let before = source.clone();
    let importers =
        std::iter::once(("component".into(), source["importers"]["component"].clone())).collect();
    let filtered = filter(&source, importers);
    assert_eq!(source, before);
    assert_eq!(
        filtered["packages"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        ["alpha@1.0.0", "missing@1.0.0", "beta@1.0.0"],
    );
    assert_eq!(
        filtered["snapshots"]
            .as_object()
            .unwrap()
            .keys()
            .collect::<Vec<_>>(),
        ["alpha@1.0.0", "beta@1.0.0"],
    );
    assert!(filtered["importers"].get("root").is_none());
}

fn converted(source: &Value) -> Value {
    let component = Snapped {
        directory: "component",
        package_name: "@fixture/component",
        env_id: "fixture/env",
    };
    let result = graph(source, &component, &Replacer::new(&[]).unwrap(), "root").unwrap().unwrap();
    serde_json::from_str(&result).unwrap()
}

#[test]
fn missing_root_or_snapshot_uses_own_importer_without_unrelated_packages() {
    for missing in ["root", "entry", "snapshot"] {
        let mut source = fixture();
        match missing {
            "root" => {
                source["importers"]
                    .as_object_mut()
                    .unwrap()
                    .shift_remove("root");
            }
            "entry" => {
                source["importers"]["root"]["dependencies"]
                    .as_object_mut()
                    .unwrap()
                    .shift_remove("@fixture/component");
            }
            _ => {
                source["snapshots"]
                    .as_object_mut()
                    .unwrap()
                    .shift_remove("@fixture/component@file:component");
            }
        }
        let graph = converted(&source);
        assert!(graph["packages"].get("unrelated@1.0.0").is_none(), "{missing}");
        assert!(graph["packages"].get("@fixture/component@file:component").is_none(), "{missing}");
        assert_eq!(
            graph["edges"]
                .as_array()
                .unwrap()
                .last()
                .unwrap()["neighbours"]
                .as_array()
                .unwrap()
                .len(),
            2,
        );
        assert_eq!(graph["lockfileSettings"], source["settings"]);
    }
}

#[test]
fn released_147_filter_and_conversion_match() {
    let Some(cli) = std::env::var_os("BIT_TEST_GRAPH_CLI") else { return };
    let mut cases = vec![fixture()];
    let mut missing = fixture();
    missing["snapshots"]
        .as_object_mut()
        .unwrap()
        .shift_remove("@fixture/component@file:component");
    cases.push(missing);
    let mut missing = fixture();
    missing["importers"]
        .as_object_mut()
        .unwrap()
        .shift_remove("root");
    cases.push(missing);
    let script = r"
const {createRequire}=require('node:module');
const fs=require('node:fs');
const req=createRequire(process.argv[1]);
const converter=req('@teambit/pnpm/dist/lockfile-deps-graph-converter.js');
(async()=>{
 await converter.init();
 const cases=JSON.parse(fs.readFileSync(0,'utf8'));
 const results=cases.map(lockfile=>{
   const version=lockfile.importers.root?.dependencies?.['@fixture/component']?.version;
   const root=version && lockfile.snapshots?.['@fixture/component@'+version] ? 'root' : undefined;
   const ids=root ? ['component',root] : ['component'];
   const filtered=converter.filterLockfileByImporters(lockfile,ids);
   const graph=converter.convertLockfileToGraph(filtered,{pkgName:'@fixture/component',componentRelativeDir:'component',componentRootDir:root,componentIdByPkgName:new Map()});
   return JSON.parse(graph.serialize());
 });
 process.stdout.write(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1});
";
    let mut child = Command::new("node")
        .args(["-e", script])
        .arg(cli)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin
        .take()
        .unwrap()
        .write_all(&serde_json::to_vec(&cases).unwrap())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let expected: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    for (source, expected) in cases.iter().zip(expected) {
        assert_eq!(converted(source), expected);
    }
}
