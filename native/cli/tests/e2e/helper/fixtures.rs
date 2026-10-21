//! `e2e-fixtures-helper.ts` and the command shortcuts the ported cases use for setup.
//! Setup runs on either CLI: only the command a case checks must run natively.

use super::{Helper, Run, config, issue_types, parse, strip_ansi};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

/// `fixtures.fooFixture`.
pub const FOO_FIXTURE: &str = "module.exports = function foo() { return 'got foo'; }";
pub const IS_TYPE_FIXTURE: &str = "module.exports = function isType() { return 'got is-type'; };";
pub const IS_STRING_HARMONY_FIXTURE: &str = "const isType = require('../is-type/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";

pub struct BareScopeEnv {
    pub scope_name: String,
    pub scope_path: PathBuf,
}

#[expect(dead_code, reason = "shared E2E helper methods mirroring TypeScript Helper")]
impl Helper {
    /// `createComponentBarFoo(impl)`.
    pub fn create_component_bar_foo(&self, implementation: &str) {
        let content = if implementation.is_empty() { FOO_FIXTURE } else { implementation };
        self.output_file("bar/foo.js", content);
    }

    pub fn create_component_utils_is_type(&self, implementation: &str) {
        let content = if implementation.is_empty() { IS_TYPE_FIXTURE } else { implementation };
        self.output_file("is-type/is-type.js", content);
    }

    pub fn add_component_utils_is_type(&self) {
        self.run("add is-type -i utils/is-type");
    }

    pub fn create_component_utils_is_string(&self, implementation: &str) {
        let content =
            if implementation.is_empty() { IS_STRING_HARMONY_FIXTURE } else { implementation };
        self.output_file("is-string/is-string.js", content);
    }

    pub fn add_component_utils_is_string(&self) {
        self.run("add is-string -i utils/is-string");
    }

    /// `addComponentBarFoo()`.
    pub fn add_component_bar_foo(&self) {
        self.run("add bar -i bar/foo");
    }

    /// `tagComponentBarFoo()`.
    pub fn tag_component_bar_foo(&self) {
        self.tag_without_build("bar/foo", "");
    }

    /// `tagWithoutBuild(id, options)`: something must be tagged.
    pub fn tag_without_build(&self, id: &str, options: &str) -> String {
        let output = self.run(&format!("tag {id} {options}"));
        assert!(!output.contains("nothing to tag"), "{output}");
        output
    }

    pub fn write_file(&self, relative: &str, data: &str) {
        self.output_file(relative, data);
    }

    pub fn update_file(&self, relative: &str, data: &str) {
        self.output_file(relative, data);
    }

    pub fn read_file(&self, relative: &str) -> String {
        fs::read_to_string(self.scopes.local_path.join(relative)).unwrap()
    }

    pub fn move_sync(&self, from: &str, to: &str) {
        let dst = self.scopes.local_path.join(to);
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::rename(self.scopes.local_path.join(from), dst).unwrap();
    }

    pub fn run_cmd(&self, line: &str) -> String {
        self.run(line)
    }

    pub fn try_cmd(&self, line: &str) -> Run {
        self.cmd(line)
    }

    pub fn add_component(&self, path: &str, flags: &str) -> String {
        self.run(&format!("add {path} {flags}"))
    }

    pub fn link(&self, flags: &str) -> String {
        self.run(&format!("link {flags}"))
    }

    pub fn compile(&self) -> String {
        self.run("compile")
    }

    pub fn tag_all_without_build(&self, flags: &str) -> String {
        let output = self.run(&format!("tag --skip-tests {flags}"));
        assert!(!output.contains("nothing to tag"), "{output}");
        output
    }

    #[expect(
        non_snake_case,
        reason = "mirrors TypeScript CommandHelper.tagWithoutBuild method name"
    )]
    pub fn tag_Without_Build_id(&self, id: &str, flags: &str) -> String {
        self.tag_without_build(id, &format!("--skip-tests {flags}"))
    }

    pub fn snap_all_components_without_build(&self, flags: &str) -> String {
        self.run(&format!("snap --skip-tests {flags}"))
    }

    #[expect(
        non_snake_case,
        reason = "mirrors TypeScript CommandHelper.snapComponentWithoutBuild method name"
    )]
    pub fn snap_Component_without_build(&self, id: &str, flags: &str) -> String {
        self.run(&format!("snap {id} --skip-tests {flags}"))
    }

    pub fn export(&self, flags: &str) -> String {
        self.run(&format!("export {flags}"))
    }

    pub fn create_lane(&self, name: &str, flags: &str) -> String {
        self.run(&format!("lane create {name} {flags}"))
    }

    pub fn switch_local_lane(&self, name: &str, flags: &str) -> String {
        self.run(&format!("switch {name} {flags}"))
    }

    pub fn merge_lane(&self, name: &str, flags: &str) -> String {
        if name.contains('/') || name == "main" || name.starts_with("main ") {
            self.run(&format!("lane merge {name} {flags}"))
        } else {
            self.run(&format!("lane merge {}/{name} {flags}", self.scopes.remote))
        }
    }

    pub fn import_lane(&self, name: &str, flags: &str) -> String {
        if name.contains('/') {
            self.run(&format!("lane import {name} {flags}"))
        } else {
            self.run(&format!("lane import {}/{name} {flags}", self.scopes.remote))
        }
    }

    pub fn import_and_get_objects(&self) -> String {
        self.run("import --objects")
    }

    pub fn import_component(&self, id: &str, flags: &str) -> String {
        let full_id = if id.starts_with(&format!("{}/", self.scopes.remote))
            || (id.contains('/')
                && !id.starts_with("comp/")
                && !id.starts_with("bar/")
                && !id.starts_with("utils/")
                && !id.starts_with("a/"))
        {
            id.to_owned()
        } else {
            format!("{}/{id}", self.scopes.remote)
        };
        self.run(&format!("import {full_id} {flags}"))
    }

    pub fn checkout(&self, flags: &str) -> String {
        self.run(&format!("checkout {flags}"))
    }

    pub fn checkout_all_updated(&self, flags: &str) -> String {
        self.run(&format!("checkout head --all {flags}"))
    }

    pub fn remove_component(&self, id: &str, flags: &str) -> String {
        self.run(&format!("remove {id} {flags}"))
    }

    pub fn untag(&self, args: &str) -> String {
        self.run(&format!("reset {args}"))
    }

    pub fn diff(&self, args: &str) -> String {
        strip_ansi(&self.run(&format!("diff {args}")))
    }

    pub fn log(&self, id: &str) -> String {
        self.run(&format!("log {id}"))
    }

    pub fn status(&self) -> String {
        self.run("status")
    }

    pub fn status_json(&self) -> Value {
        parse(&self.run("status --json"))
    }

    pub fn expect_status_to_be_clean(&self) {
        let status = self.status_json();
        for key in [
            "newComponents",
            "modifiedComponents",
            "stagedComponents",
            "importPendingComponents",
            "autoTagPendingComponents",
            "invalidComponents",
            "outdatedComponents",
            "mergePendingComponents",
            "componentsDuringMergeState",
            "softTaggedComponents",
            "snappedComponents",
            "localOnly",
        ] {
            if let Some(arr) = status[key].as_array() {
                assert!(arr.is_empty(), "expected {key} to be empty in status: {status}");
            }
        }
    }

    pub fn expect_status_to_be_clean_from_output(&self, _output: &str) {
        self.expect_status_to_be_clean();
    }

    pub fn expect_status_to_be_clean_except(&self, allowed: &[&str]) {
        let status = self.status_json();
        for key in [
            "newComponents",
            "modifiedComponents",
            "stagedComponents",
            "componentsWithIssues",
            "importPendingComponents",
            "autoTagPendingComponents",
            "invalidComponents",
            "outdatedComponents",
            "mergePendingComponents",
            "componentsDuringMergeState",
        ] {
            if allowed.contains(&key) {
                continue;
            }
            if let Some(arr) = status[key].as_array() {
                assert!(arr.is_empty(), "expected {key} to be empty in status: {status}");
            }
        }
    }

    pub fn expect_status_to_have_issue(&self, issue: &str) {
        let status = self.status_json();
        let issues = issue_types(&status);
        assert!(issues.iter().any(|i| i == issue), "expected issue {issue} in {issues:?}");
    }

    pub fn expect_status_to_not_have_issue(&self, issue: &str) {
        let status = self.status_json();
        let issues = issue_types(&status);
        assert!(!issues.iter().any(|i| i == issue), "expected no issue {issue} in {issues:?}");
    }

    pub fn expect_status_to_not_have_issues(&self) {
        let status = self.status_json();
        let issues = issue_types(&status);
        assert!(issues.is_empty(), "expected no issues, got {issues:?}");
    }

    pub fn get_head(&self, comp: &str) -> String {
        self.head(comp)
    }

    pub fn get_head_from_lane(&self, lane: &str, comp: &str) -> String {
        self.head_of_lane(lane, comp)
    }

    pub fn get_head_from_lane_remote(&self, lane: &str, comp: &str) -> String {
        let lane_json =
            parse(&Self::cmd_in(&self.scopes.remote_path, &format!("cat-lane {lane}")).stdout);
        lane_json["components"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| {
                item["id"]["name"].as_str() == Some(comp)
                    || item["id"]
                        .as_str()
                        .is_some_and(|id| id == comp || id.ends_with(&format!("/{comp}")))
            })
            .and_then(|item| item["head"].as_str())
            .unwrap_or_else(|| panic!("missing {comp} in remote lane {lane}: {lane_json}"))
            .to_owned()
    }

    pub fn cat_object(&self, hash: &str, pretty: bool) -> String {
        let flag = if pretty { "--pretty" } else { "" };
        self.run(&format!("cat-object {hash} {flag}"))
    }

    pub fn cat_component(&self, id: &str) -> String {
        self.run(&format!("cat-component {id} --json"))
    }

    pub fn show_component_parsed(&self, id: &str) -> String {
        self.run(&format!("show {id} --json --legacy"))
    }

    pub fn list_local_scope_parsed(&self, flags: &str) -> Value {
        parse(&self.run(&format!("list --local-scope --json {flags}")))
    }

    pub fn list_remote_scope_parsed(&self, flags: &str) -> Value {
        parse(&self.run(&format!("list {} --json {flags}", self.scopes.remote)))
    }

    pub fn read_bit_map(&self) -> Value {
        config::read_jsonc(&self.scopes.local_path.join(".bitmap"))
    }

    pub fn clone_bit_map(&self) -> String {
        fs::read_to_string(self.scopes.local_path.join(".bitmap")).unwrap()
    }

    pub fn restore_bit_map(&self, content: &str) {
        fs::write(self.scopes.local_path.join(".bitmap"), content).unwrap();
    }

    pub fn read_scope_json(&self) -> Value {
        config::read_jsonc(&self.scopes.local_path.join(".bit/scope.json"))
    }

    pub fn read_workspace_jsonc(&self) -> Value {
        config::read_jsonc(&self.scopes.local_path.join("workspace.jsonc"))
    }

    pub fn write_workspace_jsonc(&self, value: &Value) {
        config::write_json(&self.scopes.local_path.join("workspace.jsonc"), value, b"  ");
    }

    pub fn add_default_scope(&self, scope: &str) {
        let mut ws = self.read_workspace_jsonc();
        ws["teambit.workspace/workspace"]["defaultScope"] = json!(scope);
        self.write_workspace_jsonc(&ws);
    }

    pub fn add_extension_to_variant(&self, variant: &str, ext_name: &str, ext_config: Value) {
        let mut ws = self.read_workspace_jsonc();
        if ws.get("teambit.workspace/variants").is_none() {
            ws["teambit.workspace/variants"] = json!({});
        }
        if ws["teambit.workspace/variants"].get(variant).is_none() {
            ws["teambit.workspace/variants"][variant] = json!({});
        }
        ws["teambit.workspace/variants"][variant][ext_name] = ext_config;
        self.write_workspace_jsonc(&ws);
    }

    pub fn add_key_val_to_dependency_resolver_policy(&self, pkg: &str, ver: &str) {
        let mut ws = self.read_workspace_jsonc();
        if ws.get("teambit.dependencies/dependency-resolver").is_none() {
            ws["teambit.dependencies/dependency-resolver"] = json!({});
        }
        if ws["teambit.dependencies/dependency-resolver"].get("policy").is_none() {
            ws["teambit.dependencies/dependency-resolver"]["policy"] = json!({});
        }
        if ws["teambit.dependencies/dependency-resolver"]["policy"].get("dependencies").is_none() {
            ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"] = json!({});
        }
        ws["teambit.dependencies/dependency-resolver"]["policy"]["dependencies"][pkg] = json!(ver);
        self.write_workspace_jsonc(&ws);
    }

    pub fn npm_add_fake_package(&self, name: &str, version: &str, is_comp: bool) {
        let mut obj = json!({
            "name": name,
            "version": version,
        });
        if is_comp {
            let comp_name = name
                .split('/')
                .skip(1)
                .collect::<Vec<_>>()
                .join("/");
            obj["componentId"] = json!({
                "scope": self.scopes.remote,
                "name": comp_name,
                "version": version,
            });
        }
        self.output_file(&format!("node_modules/{name}/index.js"), "");
        self.output_file(
            &format!("node_modules/{name}/package.json"),
            &serde_json::to_string_pretty(&obj).unwrap(),
        );
    }

    pub fn npm_install_package(&self, name: &str, version: &str) {
        self.npm_add_fake_package(name, version, false);
    }

    pub fn create_new_remote_scope(&self) -> BareScopeEnv {
        let (scope_name, scope_path) = self.new_bare_scope_connected();
        BareScopeEnv { scope_name, scope_path }
    }

    pub fn add_remote_scope_with(&self, remote_path: &std::path::Path) {
        self.add_remote(remote_path);
        Self::add_remote_to(remote_path, &self.scopes.remote_path);
        Self::add_remote_to(&self.scopes.remote_path, remote_path);
    }

    pub fn get_cloned_remote_scope(&self, clone: &std::path::Path) {
        self.restore_remote_scope(clone);
    }

    pub fn get_component_files(&self, id: &str) -> Vec<String> {
        let show = parse(&self.run(&format!("show {id} --json")));
        show.as_array()
            .unwrap()
            .iter()
            .find(|item| item["title"].as_str() == Some("files"))
            .unwrap()["json"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|val| val.as_str().map(str::to_owned))
            .collect()
    }

    pub fn comp1_impl(&self, label: &str) -> String {
        format!(
            "const comp2 = require('@{}/comp2');\n\nmodule.exports = () => `{label} and ${{comp2()}}`;",
            self.scopes.remote,
        )
    }

    pub fn comp2_impl(&self, label: &str) -> String {
        format!(
            "const comp3 = require('@{}/comp3');\n\nmodule.exports = () => `{label} and ${{comp3()}}`;",
            self.scopes.remote,
        )
    }

    /// `populateComponents(count, rewire, additionalStr)`: `compN/index.js`, each
    /// requiring the next, added, linked with `--rewire` and compiled.
    pub fn populate_components(&self, count: usize, rewire: bool, additional: &str) {
        for index in 1..=count {
            let content = if index == count {
                format!("module.exports = () => 'comp{index}{additional}';")
            } else {
                let next = format!("comp{}", index + 1);
                format!(
                    "const {next} = require('../{next}');\n\n\
                     module.exports = () => `comp{index}{additional} and ${{{next}()}}`;",
                )
            };
            self.output_file(&format!("comp{index}/index.js"), &content);
        }
        for index in 1..=count {
            self.run(&format!("add comp{index}"));
        }
        self.output_file("app.js", "const comp1 = require('./comp1');\nconsole.log(comp1())");
        if rewire {
            self.run("link --rewire");
        }
        self.run("compile");
    }

    pub fn disable_preview(&self) {
        let mut ws = self.read_workspace_jsonc();
        ws["teambit.preview/preview"] = json!({ "disabled": true });
        self.write_workspace_jsonc(&ws);
    }

    pub fn copy_fixture_extensions(&self, dir: &str) {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf();
        let src =
            repo_root.join("components/legacy/e2e-helper/excluded-fixtures/extensions").join(dir);
        let dst = self.scopes.local_path.join(dir);
        fs::create_dir_all(&dst).unwrap();
        for entry in fs::read_dir(&src).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.is_file() {
                let file_name = entry.file_name();
                let dst_file = dst.join(&file_name);
                fs::copy(&path, &dst_file).unwrap();
                let name_str = file_name.to_string_lossy();
                if name_str.ends_with(".ts") || name_str.ends_with(".js") {
                    let content = fs::read_to_string(&dst_file).unwrap();
                    fs::write(&dst_file, content.replace("// @bit-no-check", "")).unwrap();
                }
            }
        }
    }

    pub fn populate_extensions(&self, count: usize) {
        for index in 1..=count {
            let aspect_file = format!("ext{index}.aspect.ts");
            let aspect_src = format!(
                "import {{ Aspect }} from '@teambit/harmony';\n\
                 export const Ext{index}Aspect = Aspect.create({{\n\
                   id: 'my-scope/ext{index}',\n\
                   dependencies: [],\n\
                   defaultConfig: {{}},\n\
                 }});\n\
                 export default Ext{index}Aspect;\n",
            );
            let main_src = format!(
                "import {{ MainRuntime }} from '@teambit/cli';\n\
                 import {{ Ext{index}Aspect }} from './ext{index}.aspect';\n\
                 export class Ext{index}Main {{\n\
                   static runtime: any = MainRuntime;\n\
                   static dependencies: any = [];\n\
                   constructor(public config: any) {{}}\n\
                   printName() {{ console.log('ext {index}'); }}\n\
                   static async provider(_deps, config) {{ return new Ext{index}Main(config); }}\n\
                 }}\n\
                 export default Ext{index}Main;\n\
                 Ext{index}Aspect.addRuntime(Ext{index}Main);\n",
            );
            self.output_file(&format!("extensions/ext{index}/{aspect_file}"), &aspect_src);
            self.output_file(
                &format!("extensions/ext{index}/ext{index}.main.runtime.ts"),
                &main_src,
            );
            self.run(&format!("add extensions/ext{index} -m {aspect_file}"));
        }
    }

    pub fn create_aspect(&self, name: &str) {
        let ws = self.read_workspace_jsonc();
        let scope = ws["teambit.workspace/workspace"]["defaultScope"]
            .as_str()
            .filter(|text| !text.is_empty())
            .unwrap_or(&self.scopes.remote)
            .to_owned();
        let scope_without_owner = scope
            .split('.')
            .nth(1)
            .unwrap_or(&scope);
        let dir = format!("{scope_without_owner}/{name}");
        let pascal = name
            .split('-')
            .map(|part| {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => {
                        let mut word = first.to_uppercase().collect::<String>();
                        word.push_str(chars.as_str());
                        word
                    }
                    None => String::new(),
                }
            })
            .collect::<String>();
        self.output_file(
            &format!("{dir}/index.ts"),
            &format!(
                "import {{ {pascal}Aspect }} from './{name}.aspect';\n\n\
                 export type {{ {pascal}Main }} from './{name}.main.runtime';\n\
                 export default {pascal}Aspect;\n\
                 export {{ {pascal}Aspect }};\n",
            ),
        );
        self.output_file(
            &format!("{dir}/{name}.aspect.ts"),
            &format!(
                "import {{ Aspect }} from '@teambit/harmony';\n\n\
                 export const {pascal}Aspect = Aspect.create({{\n\
                   id: '{scope}/{name}',\n\
                 }});\n",
            ),
        );
        self.output_file(
            &format!("{dir}/{name}.main.runtime.ts"),
            &format!(
                "import {{ MainRuntime }} from '@teambit/cli';\n\
                 import {{ {pascal}Aspect }} from './{name}.aspect';\n\n\
                 export class {pascal}Main {{\n\
                   static slots = [];\n\
                   static dependencies = [];\n\
                   static runtime = MainRuntime;\n\n\
                   static async provider() {{\n\
                     return new {pascal}Main();\n\
                   }}\n\
                 }}\n\n\
                 {pascal}Aspect.addRuntime({pascal}Main);\n\n\
                 export default {pascal}Main;\n",
            ),
        );
        self.run(&format!("add {dir} -i {name}"));
        self.run(&format!("env set {name} teambit.harmony/aspect"));
    }

    pub fn set_empty_env(&self) {
        self.output_file(
            "empty-env/empty-env.bit-env.ts",
            "export class EmptyEnv {}\nexport default new EmptyEnv();\n",
        );
        self.output_file("empty-env/index.ts", "export { EmptyEnv } from './empty-env.bit-env';");
        self.run("add empty-env");
        self.run("env set empty-env teambit.envs/env");
    }

    pub fn get_component_env(&self, id: &str) -> String {
        let show = parse(&self.run(&format!("show {id} --json")));
        show.as_array()
            .unwrap()
            .iter()
            .find(|frag| frag["title"].as_str() == Some("env"))
            .and_then(|frag| frag["json"].as_str())
            .unwrap_or_default()
            .to_owned()
    }

    pub fn read_component_json(&self, dir: &str) -> Value {
        let path = self.scopes.local_path.join(dir).join("component.json");
        if path.exists() { config::read_jsonc(&path) } else { json!({}) }
    }

    pub fn write_component_json(&self, dir: &str, value: &Value) {
        let path = self.scopes.local_path.join(dir).join("component.json");
        config::write_json(&path, value, b"  ");
    }

    pub fn delete_component_json_if_exist(&self, dir: &str) {
        let path = self.scopes.local_path.join(dir).join("component.json");
        if path.exists() {
            fs::remove_file(path).unwrap();
        }
    }

    pub fn set_component_json_extension(&self, dir: &str, ext_id: &str, ext_config: Value) {
        let mut comp_json = self.read_component_json(dir);
        if comp_json.get("extensions").is_none() {
            comp_json["extensions"] = json!({});
        }
        comp_json["extensions"][ext_id] = ext_config;
        self.write_component_json(dir, &comp_json);
    }

    pub fn remove_component_json_extension(&self, dir: &str, ext_id: &str) {
        let mut comp_json = self.read_component_json(dir);
        if let Some(exts) = comp_json["extensions"].as_object_mut() {
            exts.remove(ext_id);
        }
        self.write_component_json(dir, &comp_json);
    }

    pub fn set_component_json_propagate(&self, dir: &str, propagate: bool) {
        let mut comp_json = self.read_component_json(dir);
        comp_json["propagate"] = json!(propagate);
        self.write_component_json(dir, &comp_json);
    }

    pub fn get_config_merge_path(&self) -> PathBuf {
        self.scopes.local_path.join("merge-conflict")
    }

    pub fn fix_merge_config_conflict(&self, strategy: &str) {
        let path = self.get_config_merge_path();
        let content = fs::read_to_string(&path).unwrap();
        let resolved = resolve_conflict_lines(&content, strategy == "ours");
        fs::write(&path, resolved).unwrap();
    }
}

fn resolve_conflict_lines(content: &str, prefer_ours: bool) -> String {
    let mut state = 0_u8;
    let want_state = if prefer_ours { 1 } else { 2 };
    let mut out_lines = Vec::new();
    for line in content.lines() {
        if let Some(next_state) = conflict_marker_state(line) {
            state = next_state;
        } else if (state == 0 || state == want_state) && !line.is_empty() {
            out_lines.push(line);
        }
    }
    out_lines.join("\n")
}

fn conflict_marker_state(line: &str) -> Option<u8> {
    if line.starts_with("<<<<<<<") {
        Some(1)
    } else if line.starts_with("=======") {
        Some(2)
    } else if line.starts_with(">>>>>>>") {
        Some(0)
    } else {
        None
    }
}
