pub(super) use recovery::encode_model;
mod objects;
mod recovery;
mod squash;
#[cfg(test)]
mod tests;
use super::{Record, invalid, merge::snapshot, repository::Repository};
use serde_json::{Value, json};
use std::{fs, io, path::Path};

pub(super) struct Prepared {
    context: Value,
    current: Value,
    history: Value,
    recovery: recovery::Recovery,
    first: Option<snapshot::Snapshot>,
    second: Option<snapshot::Snapshot>,
    finalized: bool,
    squashes: Vec<squash::Prepared>,
}
impl Prepared {
    pub(super) fn prepare(record: &mut Record, models: &[Value]) -> io::Result<Option<Self>> {
        if record.request.options.lane.is_none() {
            return Ok(None);
        }
        let context = record.context["lane"].clone();
        if !context.is_object() {
            return Err(invalid("command lane context"));
        }
        for side in ["current", "other"] {
            if context[side]["value"]
                .get("readmeComponent")
                .is_some_and(|value| !value.is_null())
            {
                return Err(invalid("command lane readme lifecycle"));
            }
        }
        let current = context["current"]["value"].clone();
        let history = load_history(&context, &mut record.repository)?;
        let mut recovery = recovery::Recovery::prepare(&record.request.root, &context)?;
        if current.is_null() {
            recovery.main_components(models)?;
        }
        Ok(Some(Self {
            context,
            current,
            history,
            recovery,
            first: None,
            second: None,
            finalized: false,
            squashes: Vec::new(),
        }))
    }
    pub(super) fn receipt(&self) -> Value {
        json!({"history":!self.current.is_null(),"importHistoryCount":self.context["importHistoryPlans"].as_array().map_or(0, Vec::len),"squashMessageHashes":self.squashes.iter().filter_map(squash::Prepared::message_hash).collect::<Vec<_>>()})
    }
    pub(super) fn update(&mut self, identity: &str, head: &str, removed: bool) -> io::Result<()> {
        if self.current.is_null() {
            return Ok(());
        }
        let identity = identity.trim();
        let target = self.context["targets"]
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|row| row["identity"].as_str().map(str::trim) == Some(identity))
            })
            .ok_or_else(|| invalid("command lane target"))?;
        let source = target["currentSource"]
            .as_str()
            .map(str::trim)
            .ok_or_else(|| invalid("command lane source"))?;
        if (self.context["otherId"] == "main" || self.context["otherId"]["name"] == "main")
            && !matches!(source, "visible" | "hidden")
        {
            return Ok(());
        }
        objects::update(&mut self.current, identity, head, source == "hidden", removed)
    }
    pub(super) fn finalize(
        &mut self,
        staging: &Path,
        receipt: &Value,
    ) -> io::Result<Vec<(String, Value)>> {
        if self.finalized {
            return Err(invalid("command lane already finalized"));
        }
        self.recovery.validate()?;
        let imported = self.import_histories(receipt)?;
        let mut rewritten = self.squashes
            .iter()
            .map(|squash| squash.complete(receipt))
            .collect::<io::Result<Vec<_>>>()?;
        if !self.current.is_null() {
            let hash = self.context["current"]["hash"]
                .as_str()
                .map(str::trim)
                .filter(|hash| !hash.is_empty())
                .ok_or_else(|| invalid("command lane hash"))?;
            let (other_scope, other_name) = self.other_lane_id()?;
            let message = format!(r#"merge from "{other_scope}/{other_name}""#);
            self.history =
                objects::history(&self.current, hash, self.history.clone(), receipt, &message)?;
            rewritten.extend(objects::serializable(hash, &self.current, &self.history)?);
        } else if receipt.get("historyKey").is_some() || receipt.get("log").is_some() {
            return Err(invalid("main merge lane receipt"));
        }
        if !rewritten.is_empty() {
            self.first = Some(snapshot::prepare_objects(staging, rewritten)?);
        }
        self.finalized = true;
        Ok(imported)
    }
    fn other_lane_id(&self) -> io::Result<(&str, &str)> {
        if let Some((scope, name)) = self.context["otherId"]
            .as_str()
            .and_then(|raw| raw.trim().split_once('/'))
        {
            return Ok((scope.trim(), name.trim()));
        }
        Ok((
            self.context["otherId"]["scope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .ok_or_else(|| invalid("command other scope"))?,
            self.context["otherId"]["name"]
                .as_str()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .ok_or_else(|| invalid("command other name"))?,
        ))
    }
    pub(super) fn rebased(&self) -> Vec<(String, String, Value)> {
        self.squashes
            .iter()
            .map(squash::Prepared::history)
            .collect()
    }
    pub(super) fn plan_squash(
        &mut self,
        hash: &str,
        version: &Value,
        model: &Value,
        distance: &Value,
        title: Option<&str>,
        repository: &mut Repository,
    ) -> io::Result<()> {
        if self.context["shouldSquash"] != true {
            return Ok(());
        }
        if let Some(plan) =
            squash::prepare(hash, version, model, distance, &self.context, title, repository)?
        {
            self.squashes.push(plan);
        }
        Ok(())
    }
    fn import_histories(&mut self, receipt: &Value) -> io::Result<Vec<(String, Value)>> {
        let plans = self.context["importHistoryPlans"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let receipts = receipt["importHistories"]
            .as_array()
            .ok_or_else(|| invalid("lane import history receipts"))?;
        if plans.len() != receipts.len() {
            return Err(invalid("lane import history count"));
        }
        let mut output = Vec::new();
        for (plan, receipt) in plans.iter().zip(receipts) {
            let lane = &plan["lane"];
            let hash = lane["hash"].as_str().ok_or_else(|| invalid("import lane hash"))?;
            let history = objects::history(
                &lane["value"],
                hash,
                plan["previous"].clone(),
                receipt,
                plan["message"].as_str().ok_or_else(|| invalid("import lane history message"))?,
            )?;
            if self.context["current"]["hash"] == hash {
                self.history = history.clone();
            }
            output.push((
                plan["hash"]
                    .as_str()
                    .ok_or_else(|| invalid("import history identity"))?
                    .to_owned(),
                history,
            ));
        }
        Ok(output)
    }
    pub(super) fn finalize_snap(
        &mut self,
        staging: &Path,
        versions: &[Value],
        receipt: &Value,
        message: &str,
    ) -> io::Result<()> {
        if self.current.is_null() {
            return Ok(());
        }
        if !self.finalized {
            return Err(invalid("lane receipt required before snap"));
        }
        self.update_snap_entries(versions)?;
        let hash =
            self.context["current"]["hash"].as_str().ok_or_else(|| invalid("command lane hash"))?;
        let log = json!({"historyKey":receipt["batchId"],"log":receipt["laneLog"]});
        let message =
            if message.is_empty() { "snap".to_owned() } else { format!("snap ({message})") };
        self.history = objects::history(&self.current, hash, self.history.clone(), &log, &message)?;
        let lane_staging = staging.join("lane-snapshot");
        fs::create_dir(&lane_staging)?;
        self.second = Some(snapshot::prepare_objects(
            &lane_staging,
            objects::serializable(hash, &self.current, &self.history)?,
        )?);
        Ok(())
    }
    fn update_snap_entries(&mut self, versions: &[Value]) -> io::Result<()> {
        for version in versions {
            let identity =
                version["identity"].as_str().ok_or_else(|| invalid("lane snap identity"))?;
            let head = version["hash"].as_str().ok_or_else(|| invalid("lane snap hash"))?;
            let target = self.context["targets"]
                .as_array()
                .and_then(|rows| {
                    rows.iter()
                        .find(|row| row["identity"] == identity)
                })
                .ok_or_else(|| invalid("lane snapped target"))?;
            objects::snapshot_update(
                &mut self.current,
                identity,
                head,
                target["bitmapPresent"] != true,
                version["version"]["extensions"]
                    .as_array()
                    .is_some_and(|extensions| {
                        extensions.iter().any(|extension| {
                            crate::workspace::engine::client_status::config::is_extension_aspect(
                                extension,
                                "teambit.component/remove",
                            ) && extension["config"]["removed"] == true
                        })
                    }),
            )?;
        }
        Ok(())
    }
    pub(super) fn validate(&self) -> io::Result<()> {
        if !self.finalized {
            return Err(invalid("command lane receipt missing"));
        }
        self.recovery.validate()?;
        for snapshot in [&self.first, &self.second].into_iter().flatten() {
            snapshot.validate()?;
        }
        Ok(())
    }
    pub(super) fn commit_first(&mut self, root: &Path) -> io::Result<()> {
        if let Some(snapshot) = &mut self.first {
            snapshot.commit(root)?;
        }
        Ok(())
    }
    pub(super) fn commit_second(&mut self, root: &Path) -> io::Result<()> {
        if let Some(snapshot) = &mut self.second {
            snapshot.commit(root)?;
        }
        Ok(())
    }
    pub(super) fn commit_recovery(&self) -> io::Result<()> {
        self.recovery.commit()
    }
}
fn load_history(context: &Value, repository: &mut Repository) -> io::Result<Value> {
    if context["current"].is_null() {
        return Ok(Value::Null);
    }
    let hash = context["current"]["hash"].as_str().ok_or_else(|| invalid("command lane hash"))?;
    let reference = super::super::hash(format!("{hash}:LaneHistory").as_bytes());
    match repository.read(&reference, "LaneHistory") {
        Ok(value) => Ok(value),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Value::Null),
        Err(error) => Err(error),
    }
}
