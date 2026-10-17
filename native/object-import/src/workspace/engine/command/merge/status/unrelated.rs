use super::{Input, invalid, removed};
use serde_json::{Value, json};
use std::io;

pub(super) fn observation(input: &Input<'_>) -> io::Result<Value> {
    let mut facts = input.distance["unrelatedResolution"].clone();
    if !facts.is_object() {
        return Err(invalid("command unrelated resolution facts"));
    }
    let strategy = if removed(input.current)? {
        "theirs"
    } else {
        input.options.resolve_unrelated
            .as_deref()
            .ok_or_else(|| invalid("command unrelated strategy"))?
    };
    facts["strategy"] = json!(strategy);
    Ok(facts)
}

pub(super) fn failure(input: &Input<'_>) -> io::Result<Value> {
    let identity =
        input.target["identity"].as_str().ok_or_else(|| invalid("command unrelated identity"))?;
    let version = input.target["currentVersion"]
        .as_str()
        .ok_or_else(|| invalid("command unrelated current version"))?;
    let head = input.model
        .and_then(|model| model["head"].as_str())
        .ok_or_else(|| invalid("command unrelated main head"))?;
    Ok(
        json!({"message":format!("unable to traverse {identity}@{version} history. the main-head {head} doesn't appear in both lanes.\nit was probably created in each lane separately and it also exists on main. please merge main first to one of these lanes")}),
    )
}

pub(super) fn error(input: &Input<'_>) -> io::Result<String> {
    let identity =
        input.target["identity"].as_str().ok_or_else(|| invalid("command unrelated identity"))?;
    Ok(format!(
        "fatal: local and remote of \"{identity}\" don't have any snap in common, which means, they're not related.\nIf this component was exported before, it might happen when the objects were missing locally.\nIn this case, the suggested solution is to reset the local tags, run \"bit import\" to fetch all objects and then tag and export.\nAnother case of this error is when locally this component was created for the first time and the remote already has a component with the same name.\nIn this case, you might want to remove the local component and import the remote.\nAnother case of this error is when a lane has a component and the remote of that component has also a component with the same name. to fix this, use \"--resolve-unrelated\" flag for \"bit lane merge\" command",
    ))
}
