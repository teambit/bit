use super::{invalid, reads::Trace};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::{self, Write},
    path::PathBuf,
};
struct Capsules {
    trace: Trace,
    seen: HashMap<String, usize>,
    sources: Vec<Value>,
    directory: PathBuf,
    token: String,
}
impl Capsules {
    fn reference(&mut self, input: &Value, side: &str, index: usize) -> io::Result<Value> {
        let field = if side == "other" { "target" } else { "base" };
        let hash = input[field]["files"][index]["hash"]
            .as_str()
            .ok_or_else(|| invalid("merge Source reference selector"))?;
        let source =
            if let Some(index) = self.seen.get(hash) { *index } else { self.retain(hash)? };
        Ok(json!({"source":source,"ref":{"side":side,"index":index}}))
    }
    fn retain(&mut self, hash: &str) -> io::Result<usize> {
        let record =
            self.trace.records.get(hash).ok_or_else(|| invalid("merge Source receipt missing"))?;
        let index = self.sources.len();
        let path = self.directory.join(format!("{}-{index}.source.object", self.token));
        OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)?
            .write_all(&record.compressed)?;
        self.sources.push(json!({"hash":hash,"privatePath":path,"compressedSize":record.compressed.len(),"inflatedSize":record.inflated_size}));
        self.seen.insert(hash.to_owned(), index);
        Ok(index)
    }
    fn load(&mut self, input: &Value, stage: &str, index: usize, row: &Value) -> io::Result<Value> {
        if stage == "modified" {
            let mut load = json!({"row":index});
            if let Some(base) = row["base"].as_u64() {
                load["base"] = self.reference(input, "base", base as usize)?;
            }
            load["other"] = self.reference(
                input,
                "other",
                row["other"].as_u64().ok_or_else(|| invalid("merge other selector"))? as usize,
            )?;
            Ok(load)
        } else {
            let mut load = self.reference(
                input,
                "other",
                row["other"].as_u64().ok_or_else(|| invalid("merge other selector"))? as usize,
            )?;
            load["row"] = json!(index);
            Ok(load)
        }
    }
    fn groups(&mut self, input: &Value, rows: &[Value]) -> io::Result<Vec<Value>> {
        let mut groups = Vec::new();
        for (stage, kind) in [
            ("currentUpdated", "updatedFiles"),
            ("added", "addFiles"),
            ("deletedConflict", "deletedConflictFiles"),
            ("modified", "modifiedFiles"),
        ] {
            let mut loads = Vec::new();
            for (index, row) in rows.iter().enumerate() {
                if row["kind"] != kind
                    || row["other"].as_u64().is_none()
                    || (stage != "modified" && row["bodyPlanIndex"].as_u64().is_none())
                {
                    continue;
                }
                loads.push(self.load(input, stage, index, row)?);
            }
            groups.push(json!({"stage":stage,"loads":loads}));
        }
        Ok(groups)
    }
}
pub(super) fn receipts(input: &Value, output: &mut Value, trace: Trace) -> io::Result<()> {
    let token = output["token"]
        .as_str()
        .ok_or_else(|| invalid("merge body token"))?
        .to_owned();
    let directory = PathBuf::from(
        input["snapshotDirectory"].as_str().ok_or_else(|| invalid("merge capsule directory"))?,
    );
    output["reads"] = trace.stats();
    let mut capsules =
        Capsules { trace, seen: HashMap::new(), sources: Vec::new(), directory, token };
    let rows = output["mergeRows"].as_array().ok_or_else(|| invalid("merge prepared rows"))?;
    let groups = capsules.groups(input, rows)?;
    output["sourceGroups"] = json!(groups);
    output["sources"] = json!(capsules.sources);
    Ok(())
}
