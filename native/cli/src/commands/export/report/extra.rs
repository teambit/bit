//! Published warning, eject and cloud build sections around exported components.
use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::Value;

pub(super) fn ids<'a>(receipt: &'a Value, field: &str) -> Vec<&'a str> {
    receipt[field]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect()
}

pub(super) fn missing(receipt: &Value, format: &Formatter) -> String {
    let missing = ids(receipt, "missingScope");
    if missing.is_empty() {
        return String::new();
    }
    let items = missing
        .iter()
        .map(|id| Formatter::item_with(id, &format.warn_symbol()))
        .collect::<Vec<_>>();
    let section =
        format.section("components not exported (no remote scope configured)", "", &items);
    let hint = format.hint(r#"please specify <remote> to export them, run 'bit scope set <scope> <component>', or set a "defaultScope" in your workspace config"#);
    format!("{section}\n{hint}")
}

pub(super) fn untracked(receipt: &Value, format: &Formatter) -> String {
    let ids = ids(receipt, "nonExistOnBitMap");
    if ids.is_empty() {
        return String::new();
    }
    let hint = format.hint("exported successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they were tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'.");
    format!("{} {}\n{hint}", format.warn_symbol(), format.chalk.yellow(&ids.join(", ")))
}

pub(super) fn cloud(receipt: &Value, chalk: Chalk) -> String {
    let urls = ids(receipt, "rippleJobUrls");
    if urls.is_empty() {
        return String::new();
    }
    let prefix = if receipt["browserOpened"] == true {
        "Your browser has been opened to the following link"
    } else {
        "Visit the link below"
    };
    let urls = urls
        .iter()
        .map(|url| chalk.bold(&chalk.underline(url)))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{prefix} to track the progress of building the components in the cloud\n{urls}")
}
