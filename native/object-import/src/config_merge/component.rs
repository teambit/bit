pub(super) use engine::Engine;

mod data;
mod deps;
mod engine;
mod env;
mod specific;

#[cfg(test)]
mod tests;

use super::{array, invalid};
use serde_json::{Value, json};
use std::io;

pub(super) fn plan(input: &Value) -> io::Result<Value> {
    let mut engine = Engine::new(input)?;
    engine.start()?;
    env::populate(&mut engine)?;
    current(&mut engine)?;
    other(&mut engine)?;
    env::merge(&mut engine)?;
    specific::retain(&mut engine)?;
    engine.log(
        "debug",
        format!(
            "*** end config-merger for {} ***\n",
            engine.input["compIdStr"].as_str().unwrap_or(""),
        ),
    );
    data::merge(&mut engine)?;
    Ok(
        json!({"configRows":engine.rows,"logs":engine.logs,"dataAssignments":engine.assignments,"conflictedAspects":engine.conflicts,"state":{"handledExtIds":engine.handled,"envs":engine.envs}}),
    )
}
fn current(engine: &mut Engine<'_>) -> io::Result<()> {
    for (index, entry) in array(engine.input, "current")?.iter().enumerate() {
        let id = entry["stringId"].as_str().ok_or_else(|| invalid("extension id"))?;
        if engine.handled
            .iter()
            .any(|handled| handled == id)
        {
            continue;
        }
        engine.handled.push(id.into());
        let base = engine.find("base", id)?;
        let other = engine.find("other", id)?;
        match (base, other) {
            (_, Some(other)) if id.split('@').next() == Some("teambit.dependencies/dependency-resolver") => deps::merge(engine,index,other,base)?,
            (_, Some(other)) => engine.basic(id,&Engine::source("current",index),&Engine::source("other",other),base.map(|base|Engine::source("base",base)).as_ref())?,
            (Some(_),None) if engine.strategy() == "theirs" => engine.rows.push(json!({"id":id,"merged":{"value":"-"}})),
            (Some(_),None) if engine.strategy() != "ours" => engine.rows.push(json!({"id":id,"conflict":{"kind":"basic","current":Engine::source("current",index),"other":{"value":"-"}}})),
            _ => {},
        }
    }
    Ok(())
}
fn other(engine: &mut Engine<'_>) -> io::Result<()> {
    for (index, entry) in array(engine.input, "other")?.iter().enumerate() {
        let mut id = entry["stringId"]
            .as_str()
            .ok_or_else(|| invalid("extension id"))?
            .to_owned();
        if engine.handled.contains(&id) {
            continue;
        }
        engine.handled.push(id.clone());
        let Some(selected) = other_id(engine, entry, &id)? else {
            continue;
        };
        id = selected;
        if engine.find("base", &id)?.is_some() {
            engine.rows.push(json!({"id":id,"conflict":{"kind":"basic","current":{"value":"-"},"other":Engine::source("other",index)}}));
        } else {
            engine.rows.push(json!({"id":id,"merged":Engine::source("other",index)}));
        }
    }
    Ok(())
}

fn other_id(engine: &Engine<'_>, entry: &Value, id: &str) -> io::Result<Option<String>> {
    if entry["componentId"].get("version").is_some() {
        let base =
            entry["componentId"]["base"].as_str().ok_or_else(|| invalid("extension base"))?;
        if let Some(workspace) = array(engine.input, "workspaceIds")?
            .iter()
            .find(|workspace| workspace["base"] == base)
        {
            if engine.find("current", base)?.is_some() {
                return Ok(None);
            }
            return Ok(Some(
                workspace["legacy"]
                    .as_str()
                    .ok_or_else(|| invalid("workspace legacy id"))?
                    .into(),
            ));
        }
    }
    Ok(Some(id.to_owned()))
}
