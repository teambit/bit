use super::{cache, invalid, journal, reads};
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::PathBuf};
#[derive(Default)]
pub(super) struct State {
    checkout: crate::checkout_transition::State,
    bindings: HashMap<String, Binding>,
}
struct Binding {
    owner: String,
    index: usize,
    directory: PathBuf,
    objects: PathBuf,
    rows: Vec<Value>,
    groups: Vec<Value>,
    current: Vec<Value>,
    ordered: bool,
}
impl State {
    pub(super) fn prepare(
        &mut self,
        mut input: Value,
        owners: &journal::State,
        snapshots: Option<&crate::workspace::snapshots::State>,
    ) -> io::Result<Value> {
        let owner = text(&input, "token")?.to_owned();
        let index = input["index"]
            .as_u64()
            .filter(|index| *index < 4096)
            .ok_or_else(|| invalid("merge plan index"))? as usize;
        owners.verify(&owner, index)?;
        let directory = PathBuf::from(text(&input, "snapshotDirectory")?);
        let objects = PathBuf::from(text(&input, "objectsDirectory")?);
        translate_current(&mut input, &directory)?;
        let mut response = prepare_response(&input, &mut self.checkout, snapshots)?;
        let token = text(&response, "token")?.to_owned();
        response["ownerToken"] = json!(owner);
        response["index"] = json!(index);
        self.bindings.insert(
            token,
            Binding {
                owner,
                index,
                ordered: false,
                directory,
                objects,
                current: array(&input, "current")?,
                rows: array(&response, "mergeRows")?,
                groups: array(&response, "sourceGroups")?,
            },
        );
        Ok(response)
    }
    fn binding<'a>(
        &'a self,
        input: &Value,
        owners: &journal::State,
    ) -> io::Result<(&'a Binding, String)> {
        let token = text(input, "planToken")?.to_owned();
        let binding = self.bindings.get(&token).ok_or_else(|| invalid("stale merge body plan"))?;
        if text(input, "token")? != binding.owner {
            return Err(invalid("merge body owner mismatch"));
        }
        owners.verify_retained(&binding.owner, binding.index)?;
        Ok((binding, token))
    }
    pub(super) fn apply(&mut self, input: &Value, owners: &journal::State) -> io::Result<Value> {
        let (binding, token) = self.binding(input, owners)?;
        let scope = reads::Scope::begin();
        let manifest = crate::checkout_transition::retarget(
            json!({"token":token,"target":input["target"],"objectsDirectory":binding.objects,"snapshotDirectory":binding.directory,"knownBodies":input["knownBodies"]}),
            &mut self.checkout,
        )?;
        let mut response = crate::checkout_transition::apply(
            "checkoutApply",
            json!({"token":token,"strategy":input["strategy"],"forceOurs":false,"currentExists":false,"tracked":false,"workspaceRoot":false}),
            &mut self.checkout,
        )?;
        response["reads"] = scope.finish().stats();
        response["bodies"] = manifest["bodies"].clone();
        if let Some(known) = manifest.get("knownBodies") {
            response["knownBodies"] = known.clone();
            response["bodyCount"] = manifest["bodyCount"].clone();
        } else {
            response["targetFiles"] = manifest["targetFiles"].clone();
        }
        if let Some(files) = response["files"].as_array_mut() {
            for (index, file) in files.iter_mut().enumerate() {
                file["finalIndex"] = json!(index);
            }
        }
        Ok(response)
    }
    pub(super) fn order(&mut self, input: &Value, owners: &journal::State) -> io::Result<Value> {
        let (binding, token) = self.binding(input, owners)?;
        if binding.ordered {
            return Err(invalid("merge completion order already acknowledged"));
        }
        let indices = super::order::permutation(input, &binding.groups, binding.rows.len())?;
        let output = crate::checkout_transition::order(
            &token,
            &indices,
            input["indexedRows"] == true,
            &mut self.checkout,
        )?;
        self.bindings.get_mut(&token).ok_or_else(|| invalid("stale merge body plan"))?.ordered =
            true;
        Ok(output)
    }
    pub(super) fn removals(&self, input: &Value, owners: &journal::State) -> io::Result<Value> {
        let (binding, _) = self.binding(input, owners)?;
        if input["tracked"] == true
            && binding.current
                .iter()
                .enumerate()
                .any(|(index, file)| {
                    file.get("sourceHash").is_some()
                        && file["path"]
                            == json!(binding.directory.join(format!("current-{index}.source")))
                })
        {
            return Err(invalid("merge tracked Source lacks workspace path"));
        }
        super::removals::apply(input, &binding.current)
    }
    pub(super) fn materialize(
        &mut self,
        input: &Value,
        owners: &journal::State,
    ) -> io::Result<Value> {
        let (_, token) = self.binding(input, owners)?;
        crate::checkout_transition::apply(
            "checkoutMaterialize",
            json!({"token":token,"files":input["files"]}),
            &mut self.checkout,
        )
    }
    pub(super) fn finish(&mut self, owners: &[String]) -> io::Result<()> {
        let tokens = self.bindings
            .iter()
            .filter(|(_, binding)| owners.contains(&binding.owner))
            .map(|(token, _)| token.clone())
            .collect::<Vec<_>>();
        for token in tokens {
            crate::checkout_transition::apply(
                "checkoutFinish",
                json!({"token":token}),
                &mut self.checkout,
            )?;
            self.bindings.remove(&token);
        }
        Ok(())
    }
}
fn current_file(file: &Value, directory: &std::path::Path, index: usize) -> io::Result<Value> {
    let mut output = json!({"relativePath":text(file,"relativePath")?,"protected":file.get("protected").cloned().unwrap_or(json!(false))});
    match (file.get("workspace"), file.get("source")) {
        (Some(workspace), None) => {
            output["path"] = workspace["path"].clone();
            output["rawHash"] = workspace["rawHash"].clone();
            output["snapshotHash"] = workspace["snapshotHash"].clone();
            if let Some(token) = workspace.get("readToken") {
                output["readToken"] = token.clone();
            }
            output["bitmap"] = workspace
                .get("bitmap")
                .cloned()
                .unwrap_or(json!(false));
        }
        (None, Some(source)) => {
            let hash = text(source, "hash")?;
            output["sourceHash"] = json!(hash);
            output["rawHash"] = json!(hash);
            output["snapshotHash"] = json!(hash);
            output["path"] = source
                .get("path")
                .cloned()
                .unwrap_or_else(|| json!(directory.join(format!("current-{index}.source"))));
        }
        _ => return Err(invalid("merge current provenance")),
    }
    Ok(output)
}
fn text<'a>(value: &'a Value, field: &str) -> io::Result<&'a str> {
    value[field].as_str().ok_or_else(|| invalid("merge string field"))
}

fn translate_current(input: &mut Value, directory: &std::path::Path) -> io::Result<()> {
    let current = input["current"]
        .as_array()
        .filter(|files| files.len() <= 4096)
        .ok_or_else(|| invalid("merge current files"))?;
    input["current"] = json!(
        current
            .iter()
            .enumerate()
            .map(|(index, file)| current_file(file, directory, index))
            .collect::<io::Result<Vec<_>>>()?
    );
    let fields = input.as_object_mut().ok_or_else(|| invalid("merge plan request"))?;
    fields.remove("token");
    fields.remove("index");
    Ok(())
}
fn array(input: &Value, field: &str) -> io::Result<Vec<Value>> {
    input[field]
        .as_array()
        .cloned()
        .ok_or_else(|| invalid("merge plan metadata array"))
}

fn prepare_response(
    input: &Value,
    state: &mut crate::checkout_transition::State,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Value> {
    let scope = reads::Scope::begin();
    let mut response = match snapshots {
        Some(snapshots) => {
            crate::checkout_transition::prepare_with_workspace(input, state, snapshots)?
        }
        None => crate::checkout_transition::apply("checkoutPrepare", input.clone(), state)?,
    };
    if let Err(error) = cache::receipts(input, &mut response, scope.finish()) {
        crate::checkout_transition::apply(
            "checkoutFinish",
            json!({"token":response["token"]}),
            state,
        )?;
        return Err(error);
    }
    Ok(response)
}
