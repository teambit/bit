use super::invalid;
use serde_json::{Value, json};
use std::io;

pub(in crate::workspace::engine::command) struct Input<'a> {
    pub(in crate::workspace::engine::command) index: usize,
    pub(in crate::workspace::engine::command) target: &'a Value,
    pub(in crate::workspace::engine::command) model: Option<&'a Value>,
    pub(in crate::workspace::engine::command) incoming: &'a Value,
    pub(in crate::workspace::engine::command) current: &'a Value,
    pub(in crate::workspace::engine::command) modified: bool,
    pub(in crate::workspace::engine::command) distance: &'a Value,
}
pub(super) fn select(
    input: &Input<'_>,
    owner: &Value,
    state: &mut crate::merge_transaction::State,
) -> io::Result<Value> {
    let identity =
        input.target["identity"].as_str().ok_or_else(|| invalid("command merge identity"))?;
    let version =
        input.target["version"].as_str().ok_or_else(|| invalid("command merge current version"))?;
    let mut cursor = crate::merge_transaction::apply(
        "mergeStatusBegin",
        json!({
            "token":owner,"index":input.index,"id":format!("{identity}@{version}"),"idWithoutVersion":identity,
            "hasConsumer":true,"hasWorkspace":true,
        }),
        state,
    )?;
    for _ in 0..16 {
        if cursor.get("result").is_some() {
            return Ok(cursor["result"].clone());
        }
        let observe = cursor["directive"]["observe"]
            .as_str()
            .ok_or_else(|| invalid("command merge observation"))?;
        let value = observation(input, observe)?;
        cursor = crate::merge_transaction::apply(
            "mergeStatusReceipt",
            json!({
                "token":cursor["token"],"revision":cursor["revision"],"observe":observe,"value":value,
            }),
            state,
        )?;
    }
    Err(invalid("command merge status limit"))
}

fn observation(input: &Input<'_>, observe: &str) -> io::Result<Value> {
    match observe {
        "model" => Ok(json!({"present":input.model.is_some()})),
        "unmerged" => Ok(json!({"present":false})),
        "incoming" => Ok(
            json!({"removed":removed(input.incoming)?,"onLane":false,"bitmapPresent":true,"currentLanePresent":false}),
        ),
        "currentId" => Ok(json!({"present":true})),
        "locallyRemoved" => Ok(json!({"removed":false})),
        "current" => Ok(json!({"removed":removed(input.current)?})),
        "modified" if input.modified => Ok(json!({"type":"code","ignoreConfigChanges":false})),
        "modified" => Ok(json!({"type":null,"ignoreConfigChanges":false})),
        "divergence" => divergence(input.distance),
        _ => Err(invalid("command merge unsupported removal/history state")),
    }
}

fn divergence(distance: &Value) -> io::Result<Value> {
    if distance["noCommon"] == true {
        return Err(invalid("command merge unrelated history"));
    }
    let source = distance["sourceOnly"]
        .as_array()
        .ok_or_else(|| invalid("command merge source distance"))?;
    let target = distance["targetOnly"]
        .as_array()
        .ok_or_else(|| invalid("command merge target distance"))?;
    Ok(json!({"error":null,"detachHead":false,"common":distance["common"],
        "sourceAhead":!source.is_empty(),"targetAhead":!target.is_empty(),"diverged":!source.is_empty()&&!target.is_empty(),
        "handleTargetAheadAsDiverged":false,"resolveUnrelated":null}))
}

fn removed(version: &Value) -> io::Result<bool> {
    let extensions = version["extensions"]
        .as_array()
        .ok_or_else(|| invalid("command merge Version extensions"))?;
    Ok(extensions
        .iter()
        .any(|extension| {
            extension["name"]
                .as_str()
                .or_else(|| extension["extensionId"].as_str())
                .is_some_and(|id| id.split('@').next() == Some("teambit.component/remove"))
                && extension["config"]["removed"] == true
        }))
}
