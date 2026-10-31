//! Released core-environment dependency policies for capsule manifests.

use super::{BuiltinEnv, EntryPointMetadata, ManifestConfig, PackageDependencies};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub(super) fn package_dependencies(
    env: BuiltinEnv,
    component_dependencies: &BTreeMap<String, String>,
) -> PackageDependencies {
    let mut dependencies = Map::new();
    let mut dev_dependencies = Map::new();
    let mut peer_dependencies = Map::new();
    match env {
        BuiltinEnv::Empty => {}
        BuiltinEnv::Node
        | BuiltinEnv::Html
        | BuiltinEnv::ReactNative
        | BuiltinEnv::BitCustomAspect => {
            node_like(env, &mut dev_dependencies);
        }
        BuiltinEnv::React
        | BuiltinEnv::Aspect
        | BuiltinEnv::Mdx
        | BuiltinEnv::Environment
        | BuiltinEnv::MdxReadme => {
            react_like(env, &mut dependencies, &mut dev_dependencies, &mut peer_dependencies);
        }
    }
    for (name, version) in component_dependencies {
        insert(&mut dependencies, name, version);
    }
    PackageDependencies { dependencies, dev_dependencies, peer_dependencies }
}

fn node_like(env: BuiltinEnv, dev: &mut Map<String, Value>) {
    insert(dev, "@types/jest", "26.0.20");
    insert(dev, "@types/node", "22.10.5");
    match env {
        BuiltinEnv::Html => insert(dev, "@teambit/html", "latest"),
        BuiltinEnv::ReactNative => insert(dev, "@teambit/react-native", "latest"),
        BuiltinEnv::BitCustomAspect => insert(dev, "@teambit/bit-custom-aspect", "1.0.107"),
        _ => {}
    }
}

fn react_like(
    env: BuiltinEnv,
    runtime: &mut Map<String, Value>,
    dev: &mut Map<String, Value>,
    peer: &mut Map<String, Value>,
) {
    insert(runtime, "core-js", "^3.0.0");
    if matches!(env, BuiltinEnv::Mdx | BuiltinEnv::MdxReadme) {
        insert(runtime, "@teambit/mdx.ui.mdx-scope-context", "1.0.0");
        insert(runtime, "@mdx-js/react", "^3.1.1");
    }
    let runtime_babel = matches!(env, BuiltinEnv::Aspect | BuiltinEnv::Environment);
    if runtime_babel {
        insert(runtime, "@babel/runtime", "7.20.0");
    }
    for (name, version) in [
        ("@types/node", "12.20.4"),
        ("@types/react", "^19.0.0"),
        ("@types/react-dom", "^19.0.0"),
        ("@types/jest", "^26.0.0"),
    ] {
        insert(dev, name, version);
    }
    if !runtime_babel {
        insert(dev, "@babel/runtime", "7.20.0");
    }
    insert(dev, "@types/testing-library__jest-dom", "5.9.5");
    insert(peer, "react", "^17.0.0 || ^18.0.0 || ^19.0.0");
    insert(peer, "react-dom", "^17.0.0 || ^18.0.0 || ^19.0.0");
}

fn insert(map: &mut Map<String, Value>, name: &str, version: &str) {
    map.insert(name.to_owned(), Value::String(version.to_owned()));
}

pub(super) fn has_custom_builtin_env_config(config: Option<&Map<String, Value>>) -> bool {
    let Some(config) = config else { return false };
    [
        "teambit.react/react",
        "teambit.html/html",
        "teambit.react/react-native",
        "teambit.harmony/aspect",
        "teambit.mdx/mdx",
        "teambit.envs/env",
        "teambit.mdx/readme",
        "teambit.harmony/bit-custom-aspect",
        "teambit.harmony/empty-env",
    ]
    .iter()
    .any(|target| {
        config
            .iter()
            .any(|(key, value)| {
                (key == target || key.starts_with(&format!("{target}@")))
                    && value
                        .as_object()
                        .is_none_or(|env| !env.is_empty())
            })
    })
}

pub(super) fn configured_entry_points(manifest: &ManifestConfig, stem: &str) -> EntryPointMetadata {
    let mut entry_points = entry_point_metadata(manifest.env, stem);
    if let Some(types) = &manifest.overrides.entry_points.types {
        entry_points.types = Some(types.clone());
    }
    if let Some(exports) = &manifest.overrides.entry_points.exports {
        entry_points.exports = Some(exports.clone());
    }
    entry_points
}

fn entry_point_metadata(env: BuiltinEnv, stem: &str) -> EntryPointMetadata {
    let types = (!matches!(env, BuiltinEnv::Empty)).then(|| format!("{stem}.ts"));
    let exports = matches!(env, BuiltinEnv::Aspect).then(|| {
        let main = format!("./dist/{stem}.js");
        serde_json::json!({
            "node": { "require": main, "import": "./dist/esm.mjs" },
            "default": main,
        })
    });
    EntryPointMetadata { types, exports }
}

pub(super) fn parse_builtin_env(env: Option<&str>) -> Option<BuiltinEnv> {
    match env.map(|raw| raw.split('@').next().unwrap_or(raw)) {
        None | Some("teambit.harmony/node") => Some(BuiltinEnv::Node),
        Some("teambit.react/react") => Some(BuiltinEnv::React),
        Some("teambit.html/html") => Some(BuiltinEnv::Html),
        Some("teambit.react/react-native") => Some(BuiltinEnv::ReactNative),
        Some("teambit.harmony/aspect") => Some(BuiltinEnv::Aspect),
        Some("teambit.mdx/mdx") => Some(BuiltinEnv::Mdx),
        Some("teambit.envs/env") => Some(BuiltinEnv::Environment),
        Some("teambit.mdx/readme") => Some(BuiltinEnv::MdxReadme),
        Some("teambit.harmony/bit-custom-aspect") => Some(BuiltinEnv::BitCustomAspect),
        Some("teambit.harmony/empty-env") => Some(BuiltinEnv::Empty),
        _ => None,
    }
}
