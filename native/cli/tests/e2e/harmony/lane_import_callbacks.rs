//! Active-lane import retains configured provider startup and exact workspace state.
use crate::commands::move_paths::support;
use std::fs;

#[test]
fn active_lane_import_with_configured_provider_matches_released_node() {
    let helper = super::snapshot_environments::callback_workspace(false);
    helper.re_init_remote_scope();
    helper.add_remote_scope();
    helper.run("tag bar/foo --ignore-issues * --message main");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.run("snap bar/foo --unmodified --message dev");
    crate::helper::remote::publish(&helper);
    helper.run("switch main --skip-fetch -x --auto-merge-resolve theirs");
    helper.run("lane create other");
    let aspect = format!(
        "node_modules/.bit_roots/teambit.harmony_aspect/node_modules/@{}/callbacks.hook/dist/index.js",
        helper.scopes.remote,
    );
    for file in ["snapshot-hook/dist/index.js", aspect.as_str()] {
        let path = helper.scopes.local_path.join(file);
        let source = fs::read_to_string(&path).unwrap().replace(
            "console.log('fixture provider startup');",
            "fs.appendFileSync(workspace.path+'/lane-import-provider-startups','x');console.log('fixture provider startup');",
        );
        fs::write(path, source).unwrap();
    }
    let native = support::compare_with_stdout(&helper, "lane import dev", str::to_owned);
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    assert_eq!(native.stdout.matches("fixture provider startup").count(), 1);
    assert_eq!(
        fs::read(helper.scopes.local_path.join("lane-import-provider-startups")).unwrap(),
        b"x",
    );
}
