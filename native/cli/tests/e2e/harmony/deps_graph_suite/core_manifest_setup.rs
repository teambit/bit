//! Capsule fixtures do not need remote verification of built-in environment identities.
use crate::helper::{Helper, config};
use serde_json::json;
use std::{ffi::OsStr, fs};

pub(super) fn prepare(helper: &Helper, environment: &str) -> Option<String> {
    if environment == "teambit.harmony/bit-custom-aspect" {
        let assign = Helper::cmd_in_with(
            &helper.scopes.local_path,
            &format!("env set comp1 {environment}"),
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(assign.status.success(), "{assign:?}");
        return None;
    }
    // Independently replayed released env assignment produces these exact config entries.
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = config::read_jsonc(&bitmap_path);
    bitmap["comp1"]["config"] = json!({environment:{},"teambit.envs/envs":{"env":environment}});
    config::write_json(&bitmap_path, &bitmap, b"    ");
    let guard = helper.scopes.e2e_dir.join("capsule-no-network.cjs");
    fs::write(&guard, r"const fail=()=>{throw new Error('Network access forbidden in capsule fixture');};
for(const name of ['node:http','node:https']){const mod=require(name);mod.request=fail;mod.get=fail;}
globalThis.fetch=fail;").unwrap();
    Some(format!(
        r#"--require "{}""#,
        guard.to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/"),
    ))
}
