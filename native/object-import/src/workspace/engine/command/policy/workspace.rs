//! Workspace dependency updates use the same aggregation as `ConfigMergerMain`.

use super::{Prepared, Record, invalid, projection};
use serde_json::{Map, Value, json};
use std::io;

type Publication = super::super::checkout_policy::Prepared;

pub(super) fn prepare(
    prepared: &mut Prepared,
    record: &Record,
    semver: &Value,
) -> io::Result<Option<(Publication, Value)>> {
    let records = prepared.rows
        .iter()
        .filter(|row| !row.fast_forward && !row.ours_conflict)
        .map(|row| {
            let policy = row.receipts.configuration["result"]["configRows"]
                .as_array()
                .and_then(|rows| {
                    rows.iter()
                        .find(|entry| entry["id"] == projection::RESOLVER)
                });
            json!({"compId":row.identity,
                "mergedPolicy":policy.map(|policy| &policy["merged"]["value"]["policy"]),
                "conflict":policy.map(|policy| &policy["conflict"]["value"])})
        })
        .collect::<Vec<_>>();
    let policy = &record.context["workspace"][projection::RESOLVER]["policy"];
    if !policy.is_object() || records.is_empty() {
        return Ok(None);
    }
    let plan = crate::config_merge::apply(
        "configWorkspaceMerge",
        &json!({
        "records":records,"policy":policy,"semver":semver}),
    )?;
    remove_conflicts(prepared, &plan["removePackages"])?;
    let publication = Publication::merged(&record.request.root, &plan)?;
    let report = report(&plan)?;
    Ok(Some((publication, report)))
}

fn report(plan: &Value) -> io::Result<Value> {
    let mut report = json!({});
    for (field, output) in
        [("updates", "workspaceDepsUpdates"), ("unchanged", "workspaceDepsUnchanged")]
    {
        let mut values = Map::new();
        for row in projection::array(&plan[field])? {
            let name =
                row[0].as_str().ok_or_else(|| invalid("command workspace dependency name"))?;
            let value = if field == "updates" { json!([row[1], row[2]]) } else { row[1].clone() };
            values.insert(name.to_owned(), value);
        }
        if !values.is_empty() {
            report[output] = Value::Object(values);
        }
    }
    if !plan["conflicts"].as_object().is_some_and(Map::is_empty) {
        report["workspaceDepsConflicts"] = plan["conflicts"].clone();
    }
    Ok(report)
}

fn remove_conflicts(prepared: &mut Prepared, removed: &Value) -> io::Result<()> {
    let removed = projection::array(removed)?;
    if removed.is_empty() {
        return Ok(());
    }
    for row in &mut prepared.rows {
        let Some(rows) = row.receipts.configuration["result"]["configRows"].as_array_mut() else {
            continue;
        };
        remove_rows(rows, removed);
    }
    Ok(())
}

fn remove_rows(rows: &mut [Value], removed: &[Value]) {
    for entry in rows
        .iter_mut()
        .filter(|entry| entry["id"] == projection::RESOLVER)
    {
        let Some(policy) = entry
            .get_mut("conflict")
            .and_then(|conflict| conflict.get_mut("value"))
            .and_then(Value::as_object_mut)
        else {
            continue;
        };
        for entries in policy.values_mut().filter_map(Value::as_array_mut) {
            entries.retain(|entry| !removed.contains(&entry["name"]));
        }
        policy.retain(|_, entries| {
            entries
                .as_array()
                .is_some_and(|entries| !entries.is_empty())
        });
        if policy.is_empty()
            && let Some(object) = entry.as_object_mut()
        {
            object.remove("conflict");
        }
    }
}
