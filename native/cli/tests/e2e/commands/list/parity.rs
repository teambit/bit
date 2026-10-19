//! Released `ListCmd` output and read-only inventory parity.

use crate::helper::{Helper, Run};
use serde_json::json;
use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

fn capture(root: &Path, relative: &Path, files: &mut BTreeMap<PathBuf, Vec<u8>>) {
    let path = root.join(relative);
    if path.is_file() {
        files.insert(relative.to_path_buf(), fs::read(path).unwrap());
    } else if path.is_dir() {
        for entry in fs::read_dir(path).unwrap() {
            let entry = entry.unwrap();
            capture(root, &relative.join(entry.file_name()), files);
        }
    }
}

/// Model/index bytes, immutable objects, bitmap and source files, including a real remote.
fn inventory(helper: &Helper, workspace: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    let mut files = BTreeMap::new();
    for relative in
        [".bitmap", ".bit/index.json", ".bit/objects", "bar", "ui", "local", "comp1", "comp2"]
    {
        capture(workspace, Path::new(relative), &mut files);
    }
    let remote = &helper.scopes.remote_path;
    let mut remote_files = BTreeMap::new();
    for relative in ["scope.json", "index.json", "objects", ".bit/index.json", ".bit/objects"] {
        capture(remote, Path::new(relative), &mut remote_files);
    }
    for (path, bytes) in remote_files {
        files.insert(Path::new("remote").join(path), bytes);
    }
    files
}

/// The released Node command runs from an identical workspace, and neither list may import or write inventory.
fn compare_with_ownership(helper: &Helper, command: &str, native_owned: bool) -> Run {
    let node_root = helper.clone_workspace();
    let before_native = inventory(helper, &helper.scopes.local_path);
    let before_node = inventory(helper, &node_root);
    assert_eq!(before_native, before_node);
    let node = Helper::cmd_in_with(&node_root, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = if native_owned {
        helper.native_run(command)
    } else {
        Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE_QUIET", OsStr::new("1"))],
        )
    };
    assert_eq!(native.native, native_owned, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{command}");
    assert_eq!(native.stdout, node.stdout, "{command}");
    assert_eq!(native.stderr, node.stderr, "{command}");
    assert_eq!(inventory(helper, &helper.scopes.local_path), before_native, "{command}");
    assert_eq!(inventory(helper, &node_root), before_node, "{command}");
    native
}

pub(super) fn compare(helper: &Helper, command: &str) -> Run {
    compare_with_ownership(helper, command, true)
}

fn compare_declined(helper: &Helper, command: &str) -> Run {
    compare_with_ownership(helper, command, false)
}

fn two_components(helper: &Helper) {
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.output_file("ui/button/index.js", "module.exports = 'button';");
    helper.run("add ui/button -i ui/button");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(helper);
}

#[test]
fn remote_and_local_include_deleted_match_released_node_in_json_ids_and_table() {
    let helper = Helper::new();
    two_components(&helper);
    helper.run("delete ui/button --silent");
    helper.output_file("bar/foo.js", "module.exports = 'next';");
    helper.run("snap --message after-delete");
    crate::helper::remote::publish(&helper);
    let remote = &helper.scopes.remote;
    for command in [
        "list --local-scope --json --include-deleted".to_string(),
        "list --local-scope --ids --include-deleted".to_string(),
        "list --local-scope --include-deleted".to_string(),
        format!("list {remote} --json --include-deleted"),
        format!("list {remote} --ids --include-deleted"),
        format!("list {remote} --include-deleted"),
    ] {
        assert!(compare(&helper, &command).status.success(), "{command}");
    }
}

#[test]
fn workspace_scope_and_namespace_filters_match_released_node() {
    let helper = Helper::new();
    two_components(&helper);
    let remote = &helper.scopes.remote;
    for command in [
        "list --json".to_string(),
        "list --ids".to_string(),
        "list".to_string(),
        format!("list --local-scope --json --scope {remote}"),
        "list --local-scope --json --scope absent".to_string(),
        "list --local-scope --json --namespace ui".to_string(),
        format!("list {remote} --json --namespace ui"),
    ] {
        assert!(compare(&helper, &command).status.success(), "{command}");
    }
}

#[test]
fn outdated_lane_and_missing_remote_ids_match_released_node_without_importing() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap --unmodified --message lane");
    for command in ["list --local-scope --json --outdated", "list --local-scope --ids --outdated"] {
        assert!(compare(&helper, command).status.success(), "{command}");
    }
    assert!(!compare_declined(&helper, "list --local-scope --outdated").status.success());
    helper.run("switch main -x");
    helper.output_file("local/index.js", "module.exports = 'local';");
    helper.run("add local -i bar/local");
    helper.tag_without_build("bar/local", "");
    let listed = compare(&helper, "list --local-scope --json --outdated");
    assert!(listed.status.success(), "{}", listed.stderr);
    assert!(listed.stdout.contains("bar/local"), "{}", listed.stdout);
}

#[test]
fn outdated_missing_remote_component_declines_before_any_inventory_write() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    crate::helper::remote::publish(&helper);
    // The workspace still has the exported model and its configured remote name,
    // but that remote no longer holds the requested Component.
    helper.re_init_remote_scope();
    let run = compare_declined(&helper, "list --local-scope --json --outdated");
    assert!(!run.status.success(), "{}", run.stdout);
}

fn custom_resolver(helper: &Helper, fail: bool) {
    let script = helper.scopes.local_path.join("inventory-resolver.cjs");
    let host = if fail {
        "file:///definitely-missing-bit-inventory-scope".to_owned()
    } else {
        format!("file://{}", helper.scopes.remote_path.display())
    };
    fs::write(&script, format!(
        r"const fs=require('fs');module.exports=async (scope,thisScope,token)=>{{fs.appendFileSync(process.cwd()+'/resolver-count',scope+'|'+thisScope+'\n');return {};}};",
        json!(host),
    )).unwrap();
    let path = helper.scopes.local_path.join(".bit/scope.json");
    let mut scope: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    scope["remotes"] = json!({});
    scope["resolverPath"] = json!(script.to_str().unwrap());
    fs::write(path, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
}

#[test]
fn custom_resolver_lists_and_checks_outdated_without_importing_or_replaying() {
    let helper = Helper::new();
    two_components(&helper);
    custom_resolver(&helper, false);
    let remote = &helper.scopes.remote;
    assert!(compare(&helper, &format!("list {remote} --json")).status.success());
    assert!(compare(&helper, "list --local-scope --json --outdated").status.success());
    let calls = fs::read_to_string(helper.scopes.local_path.join("resolver-count")).unwrap();
    assert_eq!(calls.lines().count(), 2, "{calls}");
    assert!(
        calls
            .lines()
            .all(|line| line.starts_with(&format!("{remote}|"))),
    );
}

#[test]
fn custom_resolver_failure_after_callback_is_owned_once() {
    let helper = Helper::new();
    two_components(&helper);
    custom_resolver(&helper, true);
    let result = helper.native_run(&format!("list {} --json", helper.scopes.remote));
    assert!(!result.status.success());
    assert!(result.native, "{}", result.trace);
    let calls = fs::read_to_string(helper.scopes.local_path.join("resolver-count")).unwrap();
    assert_eq!(calls.lines().count(), 1, "{calls}");
}

#[test]
fn custom_resolver_scope_config_write_is_accepted_once_like_node() {
    let helper = Helper::new();
    two_components(&helper);
    custom_resolver(&helper, false);
    let script = helper.scopes.local_path.join("inventory-resolver.cjs");
    let remote = format!("file://{}", helper.scopes.remote_path.display());
    fs::write(&script, format!(
        "const fs=require('fs');module.exports=async()=>{{const path=process.cwd()+'/.bit/scope.json';const config=JSON.parse(fs.readFileSync(path));config.callbackMutation=(config.callbackMutation||0)+1;fs.writeFileSync(path,JSON.stringify(config,null,2));return {};}};",
        json!(remote),
    )).unwrap();
    let node_root = helper.clone_workspace();
    let command = format!("list {} --json", helper.scopes.remote);
    let node = Helper::cmd_in_with(&node_root, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(&command);
    assert!(native.native && native.status.success(), "{} {}", native.trace, native.stderr);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
    let scope = fs::read(helper.scopes.local_path.join(".bit/scope.json")).unwrap();
    assert_eq!(scope, fs::read(node_root.join(".bit/scope.json")).unwrap());
    let config: serde_json::Value = serde_json::from_slice(&scope).unwrap();
    assert_eq!(config["callbackMutation"], 1);
}

fn hub_reply(
    listener: TcpListener,
    remote: String,
    count: usize,
) -> thread::JoinHandle<Vec<String>> {
    thread::spawn(move || serve_hub(&listener, &remote, count))
}

fn serve_hub(listener: &TcpListener, remote: &str, count: usize) -> Vec<String> {
    listener.set_nonblocking(true).unwrap();
    let mut requests = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(90);
    while requests.len() < count && Instant::now() < deadline {
        match listener.accept() {
            Ok((stream, _)) => requests.push(respond_hub(stream, remote)),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(10));
            }
            Err(error) => panic!("hub fixture: {error}"),
        }
    }
    assert_eq!(requests.len(), count, "missing hub queries");
    requests
}

fn respond_hub(mut stream: TcpStream, remote: &str) -> String {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let (mut request, length) = read_headers(&mut reader);
    let mut body = vec![0; length];
    reader.read_exact(&mut body).unwrap();
    request.push_str(&String::from_utf8(body).unwrap());
    let response =
        json!({"data":{"getScope":{"isLegacy":false,"apis":{"url":remote}}}}).to_string();
    write!(
        stream,
        "HTTP/1.1 200 OK\r\n\
        content-type: application/json\r\n\
        content-length: {}\r\n\
        connection: close\r\n\
        \r\n\
        {response}",
        response.len(),
    )
    .unwrap();
    request
}

fn read_headers(reader: &mut BufReader<TcpStream>) -> (String, usize) {
    let mut headers = String::new();
    let mut length = 0;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
            length = value.trim().parse().unwrap();
        }
        headers.push_str(&line);
        if line == "\r\n" {
            break;
        }
    }
    (headers, length)
}

#[test]
fn unconfigured_hub_remote_list_is_native_inside_and_outside_workspace() {
    let helper = Helper::new();
    two_components(&helper);
    let scope_path = helper.scopes.local_path.join(".bit/scope.json");
    let mut scope: serde_json::Value =
        serde_json::from_slice(&fs::read(&scope_path).unwrap()).unwrap();
    scope["remotes"] = json!({});
    fs::write(scope_path, serde_json::to_vec_pretty(&scope).unwrap()).unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = hub_reply(listener, format!("file://{}", helper.scopes.remote_path.display()), 4);
    let globals = helper.own_global_config("symphony_url", &url);
    let bare = helper.scopes.e2e_dir.join("outside-workspace");
    fs::create_dir(&bare).unwrap();
    for root in [&helper.scopes.local_path, &bare] {
        let command = format!("list {} --json", helper.scopes.remote);
        let node = Helper::cmd_in_with(
            root,
            &command,
            &[("BIT_NATIVE", OsStr::new("off")), ("BIT_GLOBALS_DIR", globals.as_os_str())],
        );
        let native = Helper::cmd_in_with(
            root,
            &command,
            &[("BIT_NATIVE_QUIET", OsStr::new("1")), ("BIT_GLOBALS_DIR", globals.as_os_str())],
        );
        assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
        assert!(native.native && native.status.success(), "{} {}", native.trace, native.stderr);
        assert_eq!(native.stdout, node.stdout);
        assert_eq!(native.stderr, node.stderr);
    }
    let requests = server.join().unwrap();
    assert!(
        requests
            .iter()
            .all(|request| request.contains("getScope")),
    );
}
