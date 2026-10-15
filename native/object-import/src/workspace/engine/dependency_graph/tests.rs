use super::{Request, apply};
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-dependency-graph-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    fn write(&self, name: &str, source: &str) {
        let file = self.0.join(name);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, source).unwrap();
    }
    fn run(&self, files: &[&str], visited: Option<Value>) -> io::Result<Value> {
        let mut request = json!({"root":self.0,"files":files.iter().map(|file| self.0.join(file)).collect::<Vec<_>>(),"builtins":["fs","node:fs"],"detectorExtensions":[".js",".jsx",".cjs",".mjs",".ts",".tsx",".cts",".mts",".css",".md"],"typescript":true,"includeNpm":true});
        if let Some(visited) = visited {
            request["visited"] = visited;
        }
        let request: Request = serde_json::from_value(request).unwrap();
        apply(
            &request,
            &rayon::ThreadPoolBuilder::new()
                .num_threads(4)
                .build()
                .unwrap(),
        )
        .map(|(_, value)| value)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn traverses_cycles_and_opaque_files_with_deterministic_order() {
    let fixture = Fixture::new();
    fixture.write("a.js", "import './b.js'; import './c.js'; import 'node:fs';");
    fixture.write("b.js", "import './a.js';");
    fixture.write("c.js", "import './data.unknown';");
    fixture.write("data.unknown", "not javascript");
    let output = fixture
        .run(&["a.js"], Some(json!({})))
        .unwrap();
    let names: Vec<_> = output["pathMap"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            Path::new(row["file"].as_str().unwrap())
                .file_name()
                .unwrap()
                .to_str()
                .unwrap()
        })
        .collect();
    assert_eq!(names, ["a.js", "c.js", "data.unknown", "b.js", "a.js"]);
    assert_eq!(output["pathMapOrigins"], json!([0, 1, 2, 3, 0]));
    assert_eq!(
        output["scannedPaths"],
        json!([
            fixture.0.join("a.js"),
            fixture.0.join("c.js"),
            fixture.0.join("data.unknown"),
            fixture.0.join("b.js"),
        ]),
    );
}
#[test]
fn separate_root_caches_preserve_distinct_path_map_objects() {
    let fixture = Fixture::new();
    fixture.write("a.js", "import './shared.js';");
    fixture.write("b.js", "import './shared.js';");
    fixture.write("shared.js", "export const x = 1;");
    let separate = fixture
        .run(&["a.js", "b.js"], None)
        .unwrap();
    assert_eq!(separate["pathMapOrigins"], json!([0, 1, 2, 3]));
    let shared = fixture
        .run(&["a.js", "b.js"], Some(json!({})))
        .unwrap();
    assert_eq!(shared["pathMapOrigins"], json!([0, 1, 2, 1]));
}
#[test]
fn declines_missing_parse_errors_and_unsupported_detectives() {
    let fixture = Fixture::new();
    for (name, source) in [
        ("missing.js", "import './absent';"),
        ("invalid.ts", "export = ;"),
        ("style.css", "body{}"),
        ("numeric.js", "require('10'); require('2');"),
    ] {
        fixture.write(name, source);
        assert!(
            fixture
                .run(&[name], Some(json!({})))
                .is_err(),
        );
    }
}
#[test]
fn includes_npm_without_traversal_and_preserves_cached_replay_duplicates() {
    let fixture = Fixture::new();
    fixture.write("a.js", "import 'pkg'; import './b.js';");
    fixture.write("b.js", "import './a.js';");
    fixture.write("node_modules/pkg/index.js", "!invalid-but-not-traversed");
    let output = fixture
        .run(&["a.js"], Some(json!({})))
        .unwrap();
    assert!(
        !output["tree"]
            .as_object()
            .unwrap()
            .contains_key(
                fixture.0
                    .join("node_modules/pkg/index.js")
                    .to_str()
                    .unwrap()
            ),
    );
    let dependencies = &output["tree"][fixture.0.join("a.js").to_str().unwrap()];
    assert_eq!(dependencies.as_array().unwrap().len(), 3);
}
#[test]
fn cached_missing_and_specifier_metadata_survive_without_rescanning() {
    let fixture = Fixture::new();
    fixture.write("a.js", "unparseable! but previously cached");
    fixture.write("b.js", "import './a.js';");
    let file = fixture.0
        .join("a.js")
        .to_string_lossy()
        .into_owned();
    let dep = fixture.0
        .join("outside.js")
        .to_string_lossy()
        .into_owned();
    let cached = json!({"pathMap":{"file":file,"dependencies":[{"importSource":"./outside","resolvedDep":dep,"importSpecifiers":[{"name":"x","isDefault":false}]}]},"missing":["unknown"]});
    let mut visited = serde_json::Map::new();
    visited.insert(file.clone(), cached.clone());
    let output = fixture
        .run(&["b.js"], Some(Value::Object(visited)))
        .unwrap();
    assert_eq!(output["missing"][&file], json!(["unknown"]));
    assert_eq!(output["pathMap"][1], cached["pathMap"]);
    assert_eq!(
        output["visited"]
            .as_object()
            .unwrap()
            .len(),
        1,
    );
}
#[test]
fn typescript_relative_resolution_keeps_javascript_sideeffect_distinction() {
    let fixture = Fixture::new();
    fixture.write("a.ts", "import {value} from './b.js'; import 'pkg';");
    fixture.write("b.ts", "export const value = 1;");
    fixture.write("node_modules/pkg/index.js", "export const value = 1;");
    let output = fixture
        .run(&["a.ts"], Some(json!({})))
        .unwrap();
    assert_eq!(
        output["pathMap"][0]["dependencies"][0]["resolvedDep"],
        json!(fixture.0.join("b.ts")),
    );
    assert_eq!(output["registeredPaths"], json!([fixture.0.join("a.ts")]));
}

#[test]
fn detector_receipts_exclude_no_check_early_returns() {
    let fixture = Fixture::new();
    fixture.write("a.js", "export const x = 1;");
    fixture.write("ignored.js", "// @bit-no-check\nimport './missing.js';");
    fixture.write("ignored.txt", "/* @bit-no-check */\nopaque");
    let output = fixture
        .run(&["a.js", "ignored.js", "ignored.txt"], Some(json!({})))
        .unwrap();
    assert_eq!(output["scannedPaths"], json!([fixture.0.join("a.js")]));
}
