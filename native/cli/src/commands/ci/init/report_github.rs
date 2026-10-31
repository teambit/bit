//! Repository-specific manual steps; rendering never contacts a Git host.
use super::{
    remote::{self, Repository},
    report::{self, Report},
    shell_word,
};
use crate::commands::color::Chalk;

pub(super) fn steps(input: &Report, repository: &Repository, chalk: Chalk) -> Vec<String> {
    let mut commit = report::commit(input, chalk);
    commit.push(chalk.cyan("git push -u origin HEAD"));
    let webhook = if repository.host == "github.com" {
        public_webhook(input, repository, chalk)
    } else {
        enterprise_webhook(input, repository, chalk)
    };
    vec![
        report::step(1, "Push it", "you", commit, chalk),
        report::step(
            2,
            "Let the workflows publish to bit.cloud and open pull requests",
            "repository admin",
            permissions(input, repository, chalk),
            chalk,
        ),
        webhook,
    ]
}
fn permissions(input: &Report, repository: &Repository, chalk: Chalk) -> Vec<String> {
    let repo = shell_word(&repository.display());
    let api = if repository.host == "github.com" {
        "gh api".into()
    } else {
        format!("gh api --hostname {}", shell_word(&repository.host))
    };
    let permissions = shell_word(&format!(
        "repos/{}/{}/actions/permissions/workflow",
        repository.owner, repository.name,
    ));
    vec![
        chalk.cyan(&format!("gh secret set BIT_CONFIG_ACCESS_TOKEN -R {repo}")),
        chalk.dim(&format!("a bit.cloud access token with Write permission on {}. If your organization", input.target.scope)),
        chalk.dim("requires change requests, exempt the token's account: it is the one that merges lanes."),
        chalk.cyan(&format!(r"{api} -X PUT {permissions} \")),
        chalk.cyan("  -f default_workflow_permissions=write -F can_approve_pull_request_reviews=true"),
        chalk.dim(r#"turns on "Read and write permissions" and "Allow GitHub Actions to create and approve pull requests"."#),
        chalk.dim("If they are greyed out in the settings, an organization owner must allow them first."),
        chalk.cyan(&format!("gh secret set BIT_SYNC_GH_TOKEN -R {repo}")),
        chalk.dim("optional: a GitHub token, so the pushes the sync makes start your other workflows (CI checks)"),
    ]
}
fn public_webhook(input: &Report, repository: &Repository, chalk: Chalk) -> String {
    report::step(
        3,
        "Make Bit -> Git instant",
        "organization admin, optional",
        vec![
            format!(
                "Install {} on {}/{}.",
                chalk.cyan("https://github.com/apps/bit-git-sync"),
                repository.owner,
                repository.name
            ),
            format!(
                "Copy the repository's webhook URL from {}",
                chalk.cyan("https://webhook-relay-gggmal.r2.composed.app/setup")
            ),
            format!(
                r#"and add it to {} on bit.cloud as an "Export succeeded" webhook."#,
                input.target.scope
            ),
        ],
        chalk,
    )
}
fn enterprise_webhook(input: &Report, repository: &Repository, chalk: Chalk) -> String {
    let api = remote::api(&repository.host);
    let base = api
        .as_deref()
        .ok()
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .unwrap_or("<GitHub API URL>");
    let url = format!("{base}/repos/{}/{}/dispatches", repository.owner, repository.name);
    let mut lines = vec![
        format!(r#"On bit.cloud, add an "Export succeeded" webhook to {}:"#, input.target.scope),
        format!("  URL      {}", chalk.cyan(&url)),
    ];
    if let Err(error) = api {
        lines.push(chalk.yellow(&format!("  ({error})")));
    }
    lines.extend([
        "  Headers  Authorization: Bearer <token with access to this repository>".into(),
        "           Accept: application/vnd.github+json".into(),
        r#"  Payload  {"event_type":"bit-export","client_payload":{"laneId":"{{laneId}}","componentIds":"{{componentIds}}","owner":"{{owner}}","actor":"{{username}}"}}"#.into(),
        chalk.dim("Create it fresh: editing a bit.cloud webhook drops its custom headers."),
    ]);
    report::step(3, "Make Bit -> Git instant", "optional", lines, chalk)
}
