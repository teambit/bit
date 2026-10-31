//! Native `bit component-issues [--json|-j]` (`ComponentIssuesCmd`).

#[cfg(test)]
mod tests;

use super::{color::Chalk, workspace_command};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "component-issues", aliases: &[], run };

const ISSUES_ASPECT_ID: &str = "teambit.component/issues";

struct IssueDefinition {
    name: &'static str,
    description: &'static str,
    solution: &'static str,
    is_tag_blocker: bool,
}

const ISSUES: &[IssueDefinition] = &[
    IssueDefinition {
        name: "MissingPackagesDependenciesOnFs",
        description: "missing packages or links from node_modules to the source",
        solution: r#"run "bit install --add-missing-deps" to fix both issues"#,
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "MissingManuallyConfiguredPackages",
        description: "missing packages that were manually set",
        solution: r#"run "bit install""#,
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "UntrackedDependencies",
        description: "untracked file dependencies",
        solution: r#"use "bit add <file>" to track untracked files as components"#,
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "ResolveErrors",
        description: "error found while resolving the file dependencies",
        solution: "see the log for the full error",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "RelativeComponents",
        description: "components with relative import statements found",
        solution: "use module paths for imported components",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "RelativeComponentsAuthored",
        description: "components with relative import statements found",
        solution: r#"replace to module paths or use "bit link --rewire" to replace"#,
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "ParseErrors",
        description: "error found while parsing the file",
        solution: "edit the file and fix the parsing error",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "MissingDists",
        description: "missing dists",
        solution: r#"run "bit compile""#,
        is_tag_blocker: false,
    },
    IssueDefinition {
        name: "LegacyInsideHarmony",
        description: "legacy component inside Harmony workspace",
        solution: "remove the component and re-create it via Harmony",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "MissingDependenciesOnFs",
        description: "non-existing dependency files",
        solution: "make sure all files exists on your workspace",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "ImportNonMainFiles",
        description: "importing non-main files",
        solution: "the dependency should expose its API from the main file",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "MultipleEnvs",
        description: "multiple envs",
        solution: r#"set the desired env by running "bit env set <component> <env>", if it doesn't work, run "bit aspect unset <component> <unwanted-env-id>". to keep troubleshooting run "bit aspect list <component-id>""#,
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "MissingLinksFromNodeModulesToSrc",
        description: "missing links from node_modules to source",
        solution: r#"run "bit link""#,
        is_tag_blocker: false,
    },
    IssueDefinition {
        name: "CircularDependencies",
        description: "circular dependencies",
        solution: "run `bit deps circular` to get the component-ids participating in the circular",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "DuplicateComponentAndPackage",
        description: "tracked component added as a package",
        solution: "either remove the package from the workspace.jsonc (bit uninstall) or remove the component (bit remove)",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "MergeConfigHasConflict",
        description: "merge-conflict file has unresolved conflicts",
        solution: "edit the merge-conflict file in the workspace root and resolve the conflicts",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "NonLoadedEnv",
        description: "failed loading env",
        solution: r#"run "bit install""#,
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "ExternalEnvWithoutVersion",
        description: "failed loading env - external env without a version",
        solution: "",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "RemovedDependencies",
        description: "dependencies used in the code were deleted",
        solution: r#"if the dependencies are no longer needed, remove them from the code. otherwise, to get it installed from main run "bit install <missing dep>". to undo the delete, run "bit recover""#,
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "RemovedEnv",
        description: "the env of this component is deleted",
        solution: r#"use "bit env set/replace" to set a new env or a different version of this env. to undo the delete, run "bit recover""#,
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "DeprecatedDependencies",
        description: "dependencies used in the code were deprecated",
        solution: "replace them with alternative dependencies. or remove them if not needed anymore",
        is_tag_blocker: false,
    },
    IssueDefinition {
        name: "SelfReference",
        description: "a component has an import statement that points to itself",
        solution: "edit the file and change the import statement to a relative path",
        is_tag_blocker: true,
    },
    IssueDefinition {
        name: "ImportFromDirectory",
        description: "relative import from a directory",
        solution: "change the import statement to a specific file",
        is_tag_blocker: false,
    },
    IssueDefinition {
        name: "LoadFailures",
        description: "failed loading some aspects/envs of this component (the load continued without them)",
        solution: r#"see the error details below, often resolved by running "bit install" or "bit compile""#,
        is_tag_blocker: false,
    },
    IssueDefinition {
        name: "PinnedDependencies",
        description: r#"dependencies on workspace components with a version set by config ("bit deps set", variants or env), not the workspace version"#,
        solution: r#"to use the workspace version, remove the version from the config, e.g. "bit deps unset <component> <package>""#,
        is_tag_blocker: false,
    },
];

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".to_string()));
    };
    let Some(json) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native component-issues grammar".to_string()));
    };
    let root = env::current_dir().ok().and_then(|cwd| workspace::root(&cwd));
    let history = root.as_deref().map(|root| History::start(root, args));
    if json {
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(&issues_json())?.as_bytes())?;
        stdout.flush()?;
    } else {
        let chalk = Chalk::detect(args);
        let output = workspace_command::loader_output(chalk, false);
        output.restart(r#"running command "component-issues"..."#);
        let text = report(chalk);
        output.stop();
        let mut stdout = io::stdout().lock();
        stdout.write_all(text.as_bytes())?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
    }
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn parse(args: &[&str]) -> Option<bool> {
    let mut json = false;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg.trim() {
            "--" => return iter.next().is_none().then_some(json),
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "--no-color" | "--no-color=true" | "--no-color=false" => {}
            _ => return None,
        }
    }
    Some(json)
}

fn issues_json() -> Value {
    Value::Array(
        ISSUES
            .iter()
            .map(|issue| {
                json!({
                    "name": issue.name,
                    "description": issue.description,
                    "solution": issue.solution,
                    "isTagBlocker": issue.is_tag_blocker,
                })
            })
            .collect(),
    )
}

fn report(chalk: Chalk) -> String {
    let issues_list = ISSUES
        .iter()
        .map(|issue| {
            format!(
                "{}\n{}\nPossible solution: {}\nIs Tag/Snap blocker: {}\n",
                chalk.bold(issue.name),
                issue.description,
                issue.solution,
                if issue.is_tag_blocker { "yes" } else { "no" },
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let divider = chalk.yellow(&"━".repeat(80));
    let config_snippet = chalk.cyan(&format!(
        "\"{ISSUES_ASPECT_ID}\": {{\n     \"ignoreIssues\": [\"IssueName1\", \"IssueName2\"]\n   }}",
    ));
    let bypass_instructions = format!(
        "\n{divider}\n{}\n{divider}\n\n{}, it is possible to ignore issues in two ways:\n\n{}\n   Use the --ignore-issues flag with tag/snap/build commands:\n\n   {}\n   {}\n   {}  {}\n\n{}\n   Add to your workspace.jsonc:\n\n   {config_snippet}\n\n{}  {} Ignoring issues may lead to broken components, failed builds,\n   or other problems. Only use this in emergency situations where you understand\n   the consequences and have a plan to fix the underlying issues.\n",
        chalk.yellow_bold("IGNORING ISSUES (Emergency Use Only)"),
        chalk.bold("While strongly discouraged"),
        chalk.bold("1. Temporarily ignore for a single command:"),
        chalk.cyan(r#"bit tag --ignore-issues "IssueName1, IssueName2""#),
        chalk.cyan(r#"bit snap --ignore-issues "IssueName1""#),
        chalk.cyan(r#"bit build --ignore-issues "*""#),
        chalk.dim("(ignores all issues)"),
        chalk.bold("2. Permanently ignore in workspace configuration:"),
        chalk.yellow("⚠"),
        chalk.bold("Warning:"),
    );
    format!("{issues_list}\n{bypass_instructions}")
}
