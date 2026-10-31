use super::{Action, Batch, Item, REMOVE, Value, invalid, repository, selection};
use std::io;
pub(super) fn classify(batch: &mut Batch, id: &str) -> io::Result<Item> {
    let key = selection::key(&batch.bitmap, id)?;
    let row = key
        .as_ref()
        .map(|key| batch.bitmap[key].clone());
    let bare = selection::bare(id);
    let model = repository::model(batch, bare)?;
    if let Some(row) = &row {
        let (action, files) = tracked(batch, id, row, model.as_ref())?;
        return Ok(Item { id: id.into(), key, action, files, configuration: None });
    }
    let action = if let Some(model) = model {
        let version = repository::version(batch, id, &model)?;
        if version.is_some_and(|version| repository::removal(&version)["removed"] == true) {
            Action::Import
        } else {
            Action::ProbeRemote
        }
    } else {
        Action::ProbeRemote
    };
    Ok(Item { id: id.into(), key, action, files: vec![], configuration: None })
}
fn tracked(
    batch: &mut Batch,
    id: &str,
    row: &Value,
    model: Option<&Value>,
) -> io::Result<(Action, Vec<super::File>)> {
    if row["config"]
        .as_object()
        .and_then(|cfg| {
            cfg.get(REMOVE)
                .or_else(|| {
                    cfg.iter()
                        .find_map(|(key, value)| {
                            key.starts_with("teambit.component/remove@").then_some(value)
                        })
                })
        })
        .is_some_and(|value| !value.is_null() && value != &Value::Bool(false))
    {
        let version = model
            .map(|model| repository::version(batch, id, model))
            .transpose()?
            .flatten();
        return match version {
            Some(version) => {
                Ok((Action::WriteFromScope, repository::sources(batch, row, &version)?))
            }
            None => Ok((Action::DeleteConfigAndImport, vec![])),
        };
    }
    Ok((tracked_head(batch, selection::bare(id), model)?, vec![]))
}
fn tracked_head(batch: &mut Batch, id: &str, model: Option<&Value>) -> io::Result<Action> {
    let Some(model) = model else { return Ok(Action::None) };
    let version = repository::head(batch, id, model)?
        .map(|hash| repository::object(batch, &hash, "Version"))
        .transpose()?
        .flatten();
    Ok(
        if version
            .as_ref()
            .is_some_and(|version| has_remove_info(&repository::removal(version)))
        {
            Action::UpdateConfig
        } else {
            Action::None
        },
    )
}
pub(super) fn has_remove_info(config: &Value) -> bool {
    config["removed"] == true
        || config["range"]
            .as_str()
            .is_some_and(|value| !value.trim().is_empty())
        || config["snaps"].is_array()
}
pub(super) fn update(bitmap: &mut Value, item: &Item) -> io::Result<()> {
    if item.configuration.is_some() || matches!(item.action, Action::None | Action::ProbeRemote) {
        return Ok(());
    }
    let key = selection::key(bitmap, &item.id)?
        .ok_or_else(|| invalid("imported recovery component absent from bitmap"))?;
    let row = bitmap[&key].as_object_mut().ok_or_else(|| invalid("recovery bitmap row"))?;
    if matches!(item.action, Action::WriteFromScope | Action::DeleteConfigAndImport) {
        if let Some(config) = row.get_mut("config").and_then(Value::as_object_mut) {
            config.retain(|key, _| key != REMOVE && !key.starts_with("teambit.component/remove@"));
            if config.is_empty() {
                row.remove("config");
            }
        }
    } else {
        let config = row
            .entry("config")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or_else(|| invalid("recovery component configuration"))?;
        config.retain(|cfg_key, _| !cfg_key.starts_with("teambit.component/remove@"));
        config.insert(REMOVE.into(), serde_json::json!({"removed":false}));
    }
    Ok(())
}
