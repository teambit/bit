mod unrelated;
use super::invalid;
use serde_json::{Value, json};
use std::io;

pub(in crate::workspace::engine::command) struct Input<'a> {
    pub(in crate::workspace::engine::command) index: usize,
    pub(in crate::workspace::engine::command) target: &'a Value,
    pub(in crate::workspace::engine::command) model: Option<&'a Value>,
    pub(in crate::workspace::engine::command) incoming: &'a Value,
    pub(in crate::workspace::engine::command) current: &'a Value,
    pub(in crate::workspace::engine::command) options: SelectionOptions,
    pub(in crate::workspace::engine::command) lane: Option<&'a Value>,
    pub(in crate::workspace::engine::command) distance: &'a Value,
}
pub(in crate::workspace::engine::command) struct SelectionOptions {
    pub(in crate::workspace::engine::command) modified: bool,
    pub(in crate::workspace::engine::command) resolve_unrelated: Option<String>,
    pub(in crate::workspace::engine::command) target_as_diverged: bool,
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
            json!({"removed":removed(input.incoming)?,"onLane":input.lane.and_then(|lane| lane["targets"].as_array()).and_then(|rows| rows.iter().find(|row| row["identity"] == input.target["identity"])).is_some_and(|target| matches!(target["currentSource"].as_str(),Some("visible" | "hidden"))),"bitmapPresent":input.target["bitmapPresent"] != false,"currentLanePresent":input.lane.is_some_and(|lane| !lane["current"].is_null())}),
        ),
        "currentId" => Ok(
            json!({"present":input.lane.and_then(|lane| lane["targets"].as_array()).and_then(|rows| rows.iter().find(|row| row["identity"] == input.target["identity"])).is_none_or(|target| target["currentIdPresent"] == true)}),
        ),
        "removeOnMain" => Ok(json!({"removeOnMain":remove_on_main(input.incoming)})),
        "mainHead" => {
            Ok(json!({"present":input.model.is_some_and(|model| model["head"].is_string())}))
        }
        "locallyRemoved" => Ok(json!({
            "removed": crate::workspace::engine::client_status::config::is_config_removed(
                &input.target["bitmapConfig"],
            ),
        })),
        "removedMain" => Ok(json!({"removeOnMain":remove_on_main(input.current)})),
        "removedDivergence" => Ok(
            json!({"otherLanePresent":input.lane.is_some_and(|lane| !lane["other"].is_null()),"error":input.distance["noCommon"]==true,"targetAhead":input.distance["targetOnly"].as_array().is_some_and(|rows| !rows.is_empty())}),
        ),
        "current" => Ok(json!({"removed":removed(input.current)?})),
        "modified" if input.options.modified => {
            Ok(json!({"type":"code","ignoreConfigChanges":false}))
        }
        "modified" => Ok(json!({"type":null,"ignoreConfigChanges":false})),
        "divergence" => divergence(input),
        "unrelated" => unrelated::observation(input),
        "unrelatedFailure" => unrelated::failure(input),
        _ => Err(invalid("command merge unsupported removal/history state")),
    }
}

fn divergence(input: &Input<'_>) -> io::Result<Value> {
    let distance = input.distance;
    let error = if distance["noCommon"] == true {
        Some(json!({"kind":"noCommon","message":unrelated::error(input)?}))
    } else {
        None
    };
    let source = distance["sourceOnly"]
        .as_array()
        .ok_or_else(|| invalid("command merge source distance"))?;
    let target = distance["targetOnly"]
        .as_array()
        .ok_or_else(|| invalid("command merge target distance"))?;
    Ok(json!({"error":error,"detachHead":false,"common":distance["common"],
        "sourceAhead":!source.is_empty(),"targetAhead":!target.is_empty(),"diverged":!source.is_empty()&&!target.is_empty(),
        "handleTargetAheadAsDiverged":input.options.target_as_diverged,"resolveUnrelated":input.options.resolve_unrelated}))
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

fn remove_on_main(version: &Value) -> bool {
    version["extensions"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    row["name"]
                        .as_str()
                        .or_else(|| row["extensionId"].as_str())
                        .is_some_and(|id| id.split('@').next() == Some("teambit.component/remove"))
                        && row["config"]["removeOnMain"] == true
                })
        })
}
