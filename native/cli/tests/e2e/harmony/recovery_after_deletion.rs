//! `e2e/harmony/recovery-after-deletion.e2e.ts`.

use crate::helper::{Helper, setup};
use flate2::{Compression, read::ZlibDecoder, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};

fn mark_versions_built(objects_dir: &Path) {
    let Ok(buckets) = fs::read_dir(objects_dir) else { return };
    for bucket in buckets.flatten() {
        let Ok(entries) = fs::read_dir(bucket.path()) else { continue };
        for entry in entries.flatten() {
            mark_version_object_built(&entry.path());
        }
    }
}

fn mark_version_object_built(obj_path: &Path) {
    let Ok(compressed) = fs::read(obj_path) else { return };
    let mut raw = Vec::new();
    if ZlibDecoder::new(&compressed[..]).read_to_end(&mut raw).is_err() {
        return;
    }
    let Some(nul) = raw.iter().position(|&byte| byte == 0) else { return };
    let Ok(header) = std::str::from_utf8(&raw[..nul]) else { return };
    let Some(hash) = header
        .strip_prefix("Version ")
        .and_then(|rest| rest.split_whitespace().next())
    else {
        return;
    };
    let Ok(body) = std::str::from_utf8(&raw[nul + 1..]) else { return };
    if !body.contains(r#""buildStatus":"pending""#) {
        return;
    }
    let new_body = body.replace(r#""buildStatus":"pending""#, r#""buildStatus":"succeed""#);
    let mut enc = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(enc, "Version {hash} {}\0", new_body.len()).unwrap();
    enc.write_all(new_body.as_bytes()).unwrap();
    fs::write(obj_path, enc.finish().unwrap()).unwrap();
}

fn write_comp_pkg_in_nm(local_path: &Path, scope_name: &str, comp_name: &str, version: &str) {
    let pkg_dir = local_path
        .join("node_modules")
        .join("@bit")
        .join(format!("{scope_name}.{comp_name}"));
    fs::create_dir_all(&pkg_dir).unwrap();
    let pkg_json = json!({
        "name": format!("@bit/{scope_name}.{comp_name}"),
        "version": version,
        "main": "index.js",
        "componentId": {
            "scope": scope_name,
            "name": comp_name,
            "version": version
        }
    });
    fs::write(pkg_dir.join("package.json"), serde_json::to_string_pretty(&pkg_json).unwrap())
        .unwrap();
    fs::write(pkg_dir.join("index.js"), "").unwrap();
}

fn copy_objects_between_scopes(src_objects: &Path, dst_scope: &Path) {
    let dst_objects = dst_scope.join("objects");
    if !src_objects.is_dir() {
        return;
    }
    for entry in fs::read_dir(src_objects).unwrap() {
        let entry = entry.unwrap();
        let src_dir = entry.path();
        if !src_dir.is_dir() {
            continue;
        }
        let dst_dir = dst_objects.join(entry.file_name());
        fs::create_dir_all(&dst_dir).unwrap();
        for obj in fs::read_dir(&src_dir).unwrap() {
            let obj = obj.unwrap();
            let dst_file = dst_dir.join(obj.file_name());
            if !dst_file.exists() {
                fs::copy(obj.path(), dst_file).unwrap();
            }
        }
    }
    let _ = fs::remove_file(dst_scope.join("index.json"));
}

fn cat_scope_items(helper: &Helper, scope_path: Option<&Path>) -> Vec<Value> {
    let out = match scope_path {
        Some(path) => helper.run_cmd_in("bit cat-scope --json --json-extra", path),
        None => helper.native("cat-scope --json --json-extra"),
    };
    serde_json::from_str::<Vec<Value>>(&out).unwrap()
}

fn remove_component_from_scope(helper: &Helper, comp_name: &str, scope_path: Option<&Path>) {
    let items = cat_scope_items(helper, scope_path);
    if let Some(item) = items
        .iter()
        .find(|item| item["name"] == comp_name)
        && let Some(hash) = item["hash"].as_str()
    {
        let obj_path = match scope_path {
            Some(path) => path
                .join("objects")
                .join(&hash[..2])
                .join(&hash[2..]),
            None => helper.scopes.local_path.join(helper.get_hash_path_of_object(hash)),
        };
        let _ = fs::remove_file(obj_path);
        let index_file = match scope_path {
            Some(path) => path.join("index.json"),
            None => helper.scopes.local_path.join(".bit/index.json"),
        };
        let _ = fs::remove_file(index_file);
    }
}

fn scope_has_comp(helper: &Helper, comp_name: &str, scope_path: Option<&Path>) -> bool {
    cat_scope_items(helper, scope_path)
        .iter()
        .any(|item| item["name"] == comp_name)
}

fn re_init_bare_scope(path: &Path, name: &str) {
    let _ = fs::remove_dir_all(path);
    setup::copy_dir(&setup::shared().bare_scope_template, path);
    crate::helper::config::update_scope_json(&path.join("scope.json"), |scope| {
        scope.insert("name".into(), json!(name));
    });
}

fn assert_orphaned_comp3(helper: &Helper, remote2_name: &str) {
    let comp3: Value =
        serde_json::from_str(&helper.cat_component(&format!("{remote2_name}/comp3"))).unwrap();
    assert!(comp3["orphanedVersions"]["0.0.1"].is_string(), "{comp3}");
    assert!(comp3["versions"]["0.0.1"].is_null(), "{comp3}");
    let v2_hash = comp3["versions"]["0.0.2"].as_str().unwrap();
    assert_eq!(comp3["head"].as_str().unwrap(), v2_hash);

    let remote_ref_path = helper.scopes.local_path
        .join(".bit/refs/remotes")
        .join(remote2_name)
        .join("main");
    assert!(remote_ref_path.is_file(), "missing {}", remote_ref_path.display());
    let remote_ref: Value = serde_json::from_slice(&fs::read(&remote_ref_path).unwrap()).unwrap();
    let arr = remote_ref.as_array().unwrap();
    assert!(
        arr.iter()
            .any(|entry| {
                entry["id"]["scope"] == remote2_name
                    && entry["id"]["name"] == "comp3"
                    && entry["head"] == v2_hash
            }),
        "{remote_ref}",
    );
}

/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › an intermediate check. the scope should not have the comp3 object`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit tag without --rebuild-deps-graph › should succeed`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit tag without --rebuild-deps-graph › should not bring the missing dep from the dependent`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit tag with --rebuild-deps-graph › should succeed`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit tag with --rebuild-deps-graph › should bring the missing dep from the dependent`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit import › should bring the missing dep from the dependent`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency exists as cache inside the dependent scope › bit export to another remote › this new remote should bring the flattened dependency (comp3) from the dependent scope`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency is missing in the dependent scope as well › an intermediate check. the scope should not have the comp3 object`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency is missing in the dependent scope as well › bit import › should not throw an error and not bring the missing dep`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency is missing in the dependent scope as well › bit tag --rebuild-deps-graph › should throw an error about missing dependencies`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency is missing (import comp1 while comp3 is missing) › the indirect dependency is missing in the dependent scope as well › bit tag without --rebuild-deps-graph › should succeed`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › an intermediate check. the scope should not have the comp3 object`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit tag without --rebuild-deps-graph › should succeed`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit tag without --rebuild-deps-graph › should not bring the missing dep from the dependent`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit tag with --rebuild-deps-graph › should succeed`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit tag with --rebuild-deps-graph › should bring the missing dep from the dependent`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency exists as cache inside the dependent scope › bit import › should bring the missing dep from the dependent`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency is missing in the dependent scope as well › an intermediate check. the scope should not have the comp3 object`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency is missing in the dependent scope as well › bit import › should not throw an error and not bring the missing dep`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency is missing in the dependent scope as well › bit tag --rebuild-deps-graph › should throw an error about missing dependencies`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency scope is down (import comp1 while remote2 is down) › the indirect dependency is missing in the dependent scope as well › bit tag without --rebuild-deps-graph › should succeed`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › direct dependency is missing (import comp2 while comp3 is missing) › an intermediate check. the scope should not have the comp3 object`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency exists as cache inside the dependent scope › bit import › should bring the missing dep from the dependent`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency exists as cache inside the dependent scope › bit tag › should succeed`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency exists as cache inside the dependent scope › bit tag › should bring the missing dep from the dependent`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency is missing in the dependent scope as well › an intermediate check. the scope should not have the comp3 object`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency is missing in the dependent scope as well › bit import › should not throw an error and not bring the missing dep`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency is missing in the dependent scope as well › bit import › should indicate the dependencies are missing`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › direct dependency is missing (import comp2 while comp3 is missing) › the direct dependency is missing in the dependent scope as well › bit tag --rebuild-deps-graph › should throw ComponentNotFound error because it is a direct dependency`
#[test]
fn recovery_after_deletion_indirect_and_direct_missing_scenarios() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote_name = helper.scopes.remote.clone();
    let remote_path = helper.scopes.remote_path.clone();

    let (remote2_name, remote2_path) = helper.new_bare_scope_connected();

    helper.output_file("comp1/index.js", &format!("require('@bit/{remote_name}.comp2');"));
    helper.output_file("comp2/index.js", &format!("require('@bit/{remote2_name}.comp3');"));
    helper.output_file("comp3/index.js", "");
    helper.add_component("comp1", "");
    helper.add_component("comp2", "");
    helper.add_extension_to_variant("comp3", "defaultScope", json!(remote2_name));
    helper.add_component("comp3", "");
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote_name, "comp2", "0.0.1");
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote2_name, "comp3", "0.0.1");

    helper.tag_all_without_build("");
    mark_versions_built(&helper.scopes.local_path.join(".bit/objects"));
    helper.export("");

    // Cache comp3's objects inside `remote` (equivalent to FetchMissingDeps on remote).
    copy_objects_between_scopes(&remote2_path.join("objects"), &remote_path);

    // Re-init remote2 so comp3 is missing from its origin scope.
    re_init_bare_scope(&remote2_path, &remote2_name);
    Helper::add_remote_to(&remote_path, &remote2_path);
    Helper::add_remote_to(&remote2_path, &remote_path);
    let remote_scope_clone = helper.clone_remote_scope();

    // 1. Indirect dependency is missing (import comp1 while comp3 is missing in remote2).
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&remote2_path);
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote_name, "comp2", "0.0.1");
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote2_name, "comp3", "0.0.1");
    helper.import_component("comp1", "-x --fetch-deps");
    remove_component_from_scope(&helper, "comp3", None);
    let scope_with_missing_dep = helper.clone_workspace();

    assert!(!scope_has_comp(&helper, "comp3", None));

    // bit tag without --rebuild-deps-graph
    let tag_out = helper.tag_without_build("comp1", "--unmodified");
    assert!(tag_out.contains("1 component(s) tagged"), "{tag_out}");
    assert!(!scope_has_comp(&helper, "comp3", None));

    // bit tag with --rebuild-deps-graph brings missing dep from dependent scope
    let tag_rebuild = helper.tag_without_build("comp1", "--unmodified --rebuild-deps-graph");
    assert!(tag_rebuild.contains("1 component(s) tagged"), "{tag_rebuild}");
    assert!(scope_has_comp(&helper, "comp3", None));

    // bit import --fetch-deps brings missing dep from dependent scope
    helper.get_cloned_workspace(&scope_with_missing_dep);
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote_name, "comp2", "0.0.1");
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote2_name, "comp3", "0.0.1");
    helper.run_cmd("bit import -x --fetch-deps");
    assert!(scope_has_comp(&helper, "comp3", None));

    // when comp3 is missing in dependent scope (`remote`) as well
    remove_component_from_scope(&helper, "comp3", Some(&remote_path));
    Helper::add_remote_to(&remote2_path, &remote_path);
    assert!(!scope_has_comp(&helper, "comp3", Some(&remote_path)));

    helper.get_cloned_workspace(&scope_with_missing_dep);
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote_name, "comp2", "0.0.1");
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote2_name, "comp3", "0.0.1");
    helper.run_cmd("bit import -x");
    assert!(!scope_has_comp(&helper, "comp3", None));

    let err =
        helper.run_with_try_catch("bit tag comp1 --unmodified --rebuild-deps-graph --skip-tests");
    assert!(err.contains("has the following dependencies missing"), "{err}");

    let ok_tag = helper.tag_without_build("comp1", "--unmodified");
    assert!(ok_tag.contains("1 component(s) tagged"), "{ok_tag}");

    // 2. Direct dependency is missing (import comp2 while comp3 is missing in remote2).
    helper.restore_remote_scope(&remote_scope_clone);
    re_init_bare_scope(&remote2_path, &remote2_name);
    Helper::add_remote_to(&remote2_path, &remote_path);
    Helper::add_remote_to(&remote_path, &remote2_path);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&remote2_path);
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote2_name, "comp3", "0.0.1");
    helper.import_component("comp2", "-x --fetch-deps");
    remove_component_from_scope(&helper, "comp3", None);
    let direct_missing_ws = helper.clone_workspace();

    assert!(!scope_has_comp(&helper, "comp3", None));
    helper.run_cmd("bit import -x --fetch-deps");
    assert!(scope_has_comp(&helper, "comp3", None));

    let tag_comp2 = helper.tag_without_build("comp2", "--unmodified");
    assert!(tag_comp2.contains("1 component(s) tagged"), "{tag_comp2}");
    assert!(scope_has_comp(&helper, "comp3", None));

    // direct dependency missing in dependent scope (`remote`) as well
    helper.get_cloned_workspace(&direct_missing_ws);
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote2_name, "comp3", "0.0.1");
    remove_component_from_scope(&helper, "comp3", Some(&remote_path));
    Helper::add_remote_to(&remote2_path, &remote_path);
    assert!(!scope_has_comp(&helper, "comp3", Some(&remote_path)));

    let import_out = helper.run_cmd("bit import -x --fetch-deps");
    assert!(!scope_has_comp(&helper, "comp3", None));
    assert!(
        import_out.contains(&format!("missing dependencies: {remote2_name}/comp3")),
        "{import_out}",
    );

    let direct_err =
        helper.run_with_try_catch("bit tag comp2 --rebuild-deps-graph --unmodified --skip-tests");
    assert!(direct_err.contains(&format!("{remote2_name}/comp3@0.0.1")), "{direct_err}");
}

/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › should import comp1 successfully and bring comp3@0.0.1 from the cache of comp1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › should import comp2 successfully and bring comp3@0.0.1 from the cache of comp2`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp1 (comp3 as cached) first then comp3 (comp3 as direct) › comp3: should save 0.0.1 of in the orphanedVersions prop`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp1 (comp3 as cached) first then comp3 (comp3 as direct) › comp3: should not have 0.0.1 in the versions object, only 0.0.2`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp1 (comp3 as cached) first then comp3 (comp3 as direct) › comp3: the head should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp1 (comp3 as cached) first then comp3 (comp3 as direct) › comp3: the remote ref hash should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp3 (comp3 as direct) first then comp1 (comp3 as cached) › comp3: should save 0.0.1 of in the orphanedVersions prop`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp3 (comp3 as direct) first then comp1 (comp3 as cached) › comp3: should not have 0.0.1 in the versions object, only 0.0.2`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp3 (comp3 as direct) first then comp1 (comp3 as cached) › comp3: the head should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp3 (comp3 as direct) first then comp1 (comp3 as cached) › comp3: the remote ref hash should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp3 (comp3 as direct) and comp1 (comp3 as cached) at the same time › comp3: should save 0.0.1 of in the orphanedVersions prop`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp3 (comp3 as direct) and comp1 (comp3 as cached) at the same time › comp3: should not have 0.0.1 in the versions object, only 0.0.2`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp3 (comp3 as direct) and comp1 (comp3 as cached) at the same time › comp3: the head should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp1 and flatten-dep comp3 to the same workspace  › importing comp3 (comp3 as direct) and comp1 (comp3 as cached) at the same time › comp3: the remote ref hash should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp2 (comp3 as cached) and then comp3 › comp3: should save 0.0.1 of in the orphanedVersions prop`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp2 (comp3 as cached) and then comp3 › comp3: should not have 0.0.1 in the versions object, only 0.0.2`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp2 (comp3 as cached) and then comp3 › comp3: the head should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp2 (comp3 as cached) and then comp3 › comp3: the remote ref hash should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and then comp2 › comp3: should save 0.0.1 of in the orphanedVersions prop`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and then comp2 › comp3: should not have 0.0.1 in the versions object, only 0.0.2`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and then comp2 › comp3: the head should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and then comp2 › comp3: the remote ref hash should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and comp2 at the same time › comp3: should save 0.0.1 of in the orphanedVersions prop`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and comp2 at the same time › comp3: should not have 0.0.1 in the versions object, only 0.0.2`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and comp2 at the same time › comp3: the head should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and comp2 at the same time › comp3: the remote ref hash should be the same as 0.0.2 not as 0.0.1`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › importing both: comp2 and direct-dep comp3 to the same workspace › importing comp3 and comp2 at the same time › should be able to tag`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › comp3: should save 0.0.1 of in the orphanedVersions prop on the remote`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › comp3: should not have 0.0.1 in the versions object, only 0.0.2 on the remote`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › comp3: the head should be the same as 0.0.2 not as 0.0.1 on the remote`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › should not change the remote of comp3`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › importing comp3 and then comp1 which brings comp3 with orphaned › should not indicate that dependencies are missing`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › importing comp3 and then comp1 which brings comp3 with orphaned › should save the orphaned version of comp3 locally`
/// - `recovery after component/scope deletion › remote/comp1-> remote/comp2-> remote2/comp3. indirect-dep scope (remote2) has re-initiated › indirect dependency (comp3) has re-created with a different version › the remote of comp1 imports the new version of comp3 (via importMany of exporting comp1) › importing comp3 and then comp1 which brings comp3 with orphaned › should not throw an error on bit-tag of comp1`
#[test]
fn recovery_after_deletion_recreated_with_different_version_and_orphaned_versions() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let remote_name = helper.scopes.remote.clone();
    let remote_path = helper.scopes.remote_path.clone();

    let (remote2_name, remote2_path) = helper.new_bare_scope_connected();

    helper.output_file("comp1/index.js", &format!("require('@bit/{remote_name}.comp2');"));
    helper.output_file("comp2/index.js", &format!("require('@bit/{remote2_name}.comp3');"));
    helper.output_file("comp3/index.js", "");
    helper.add_component("comp1", "");
    helper.add_component("comp2", "");
    helper.add_extension_to_variant("comp3", "defaultScope", json!(remote2_name));
    helper.add_component("comp3", "");
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote_name, "comp2", "0.0.1");
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote2_name, "comp3", "0.0.1");

    helper.tag_all_without_build("");
    mark_versions_built(&helper.scopes.local_path.join(".bit/objects"));
    helper.export("");

    // Cache comp3@0.0.1 inside `remote`, then re-init `remote2` and re-create comp3@0.0.2.
    copy_objects_between_scopes(&remote2_path.join("objects"), &remote_path);
    re_init_bare_scope(&remote2_path, &remote2_name);
    Helper::add_remote_to(&remote2_path, &remote_path);
    Helper::add_remote_to(&remote_path, &remote2_path);

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&remote2_path);
    helper.output_file("comp3/index.js", "");
    helper.add_extension_to_variant("comp3", "defaultScope", json!(remote2_name));
    helper.add_component("comp3", "");
    helper.tag_all_without_build("--ver 0.0.2");
    helper.export("");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&remote2_path);
    let before_import_scope = helper.clone_workspace();

    // Import comp1 -> brings comp3@0.0.1 from cache of comp1
    helper.import_component("comp1", "-x --fetch-deps");
    let scope_items = cat_scope_items(&helper, None);
    let comp3_item = scope_items
        .iter()
        .find(|item| item["name"] == "comp3")
        .unwrap();
    assert!(!comp3_item["versions"]["0.0.1"].is_null(), "{comp3_item}");
    assert!(comp3_item["versions"]["0.0.2"].is_null(), "{comp3_item}");

    // Import comp2 -> brings comp3@0.0.1 from cache of comp2
    helper.get_cloned_workspace(&before_import_scope);
    helper.import_component("comp2", "-x --fetch-deps");
    let scope_items = cat_scope_items(&helper, None);
    let comp3_item = scope_items
        .iter()
        .find(|item| item["name"] == "comp3")
        .unwrap();
    assert!(!comp3_item["versions"]["0.0.1"].is_null(), "{comp3_item}");
    assert!(comp3_item["versions"]["0.0.2"].is_null(), "{comp3_item}");

    // Importing both comp1 and comp3: 1) comp1 first then comp3
    helper.get_cloned_workspace(&before_import_scope);
    helper.import_component("comp1", "-x --fetch-deps");
    helper.native(&format!("import {remote2_name}/comp3 -x"));
    assert_orphaned_comp3(&helper, &remote2_name);

    // 2) comp3 first then comp1
    helper.get_cloned_workspace(&before_import_scope);
    helper.native(&format!("import {remote2_name}/comp3 -x"));
    helper.import_component("comp1", "-x --fetch-deps");
    assert_orphaned_comp3(&helper, &remote2_name);

    // 3) comp1 and comp3 at the same time
    helper.get_cloned_workspace(&before_import_scope);
    helper.native(&format!("import {remote_name}/comp1 {remote2_name}/comp3 -x --fetch-deps"));
    assert_orphaned_comp3(&helper, &remote2_name);

    // Importing both comp2 and comp3: 1) comp2 first then comp3
    helper.get_cloned_workspace(&before_import_scope);
    helper.import_component("comp2", "-x --fetch-deps");
    helper.native(&format!("import {remote2_name}/comp3 -x"));
    assert_orphaned_comp3(&helper, &remote2_name);

    // 2) comp3 first then comp2
    helper.get_cloned_workspace(&before_import_scope);
    helper.native(&format!("import {remote2_name}/comp3 -x"));
    helper.import_component("comp2", "-x --fetch-deps");
    assert_orphaned_comp3(&helper, &remote2_name);

    // 3) comp3 and comp2 at the same time + tag
    helper.get_cloned_workspace(&before_import_scope);
    write_comp_pkg_in_nm(&helper.scopes.local_path, &remote2_name, "comp3", "0.0.2");
    helper.native(&format!("import {remote_name}/comp2 {remote2_name}/comp3 -x --fetch-deps"));
    assert_orphaned_comp3(&helper, &remote2_name);
    let tag_both = helper.tag_all_without_build("--unmodified");
    assert!(tag_both.contains("component(s) tagged"), "{tag_both}");
}
