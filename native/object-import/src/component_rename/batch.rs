//! One retained bitmap/configuration transaction around a published renameMultiple batch.
mod publication;
#[cfg(test)]
mod tests;
use super::{Options, Plan, PreparationContext, invalid};
use rayon::prelude::*;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};
pub struct Batch {
    root: PathBuf,
    plans: Vec<Plan>,
    original: Value,
    bitmap: Value,
    expected: Vec<u8>,
    refactored: Vec<super::files::Change>,
    packages: Option<super::refactor::PackageMatchers>,
}
impl Batch {
    /// Prepare independent read-only plans concurrently, preserving caller order and first error.
    pub fn prepare_plans(
        root: &Path,
        options: &[Options],
        facts: &[Value],
    ) -> io::Result<Vec<Plan>> {
        if options.len() != facts.len() {
            return Err(invalid("rename plan options/facts length mismatch"));
        }
        if options.is_empty() {
            return Ok(Vec::new());
        }
        let threads = std::thread::available_parallelism().map_or(1, std::num::NonZero::get).min(4);
        let pool = crate::session::shared_pool(threads)?;
        let context = PreparationContext::default();
        let results = pool.install(|| {
            options
                .par_iter()
                .zip(facts.par_iter())
                .map(|(options, facts)| Plan::prepare_with_context(root, options, facts, &context))
                .collect::<Vec<_>>()
        });
        results.into_iter().collect()
    }
    pub fn prepare(root: &Path, mut plans: Vec<Plan>) -> io::Result<Self> {
        let expected = fs::read(root.join(".bitmap"))?;
        let original = crate::parse_jsonc(&expected)?;
        for plan in &mut plans {
            plan.validate()?;
            let directory = plan.root.join(&plan.identity.source_directory);
            plan.files.retain(|file| file.source.starts_with(&directory));
        }
        Ok(Self {
            root: root.into(),
            plans,
            bitmap: original.clone(),
            original,
            expected,
            refactored: Vec::new(),
            packages: None,
        })
    }
    #[must_use]
    pub fn len(&self) -> usize {
        self.plans.len()
    }
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.plans.is_empty()
    }
    #[must_use]
    pub fn bitmap(&self) -> &Value {
        &self.bitmap
    }
    pub fn plan(&self, index: usize) -> io::Result<&Plan> {
        self.plans.get(index).ok_or_else(|| invalid("scope rename plan index"))
    }
    pub fn plan_mut(&mut self, index: usize) -> io::Result<&mut Plan> {
        self.plans.get_mut(index).ok_or_else(|| invalid("scope rename plan index"))
    }
    /// Stage renamed IDs in memory; exported additions are published separately.
    pub fn stage(&mut self, index: usize) -> io::Result<()> {
        let initial = self.plan(index)?.controls.initial.clone();
        publication::merge(&mut self.bitmap, &self.original, &initial)
    }
    pub fn write(&mut self, file_id: &str, reason: &str) -> io::Result<()> {
        publication::write(&self.root, &mut self.expected, &self.bitmap, file_id, reason)
    }
    pub fn retire(&mut self, index: usize, file_id: &str, package: &str) -> io::Result<()> {
        if !self.plan(index)?.identity.exported {
            return super::publication::finish_original(self.plan_mut(index)?, file_id, package);
        }
        let mut final_bitmap = self.bitmap.clone();
        publication::merge(&mut final_bitmap, &self.original, &self.plan(index)?.controls.bitmap)?;
        let expected = self.expected.clone();
        let bitmap = self.bitmap.clone();
        let plan = self.plan_mut(index)?;
        let initial = std::mem::replace(&mut plan.controls.initial, bitmap);
        let final_before = std::mem::replace(&mut plan.controls.bitmap, final_bitmap);
        plan.controls.expected = expected;
        let result = super::publication::finish_original(plan, file_id, package);
        plan.controls.initial = initial;
        plan.controls.bitmap = final_before;
        result?;
        self.expected = fs::read(self.root.join(".bitmap"))?;
        self.bitmap = crate::parse_jsonc(&self.expected)?;
        Ok(())
    }
    pub fn publish_configuration(&mut self, file_id: &str) -> io::Result<()> {
        let Some(first) = self.plans.first() else { return Ok(()) };
        let mut workspace = crate::parse_jsonc(&first.controls.workspace_before)?;
        for plan in &self.plans {
            super::configuration::replace_config(
                &mut workspace,
                &plan.identity.source,
                &plan.identity.target,
                false,
            );
        }
        let first = &mut self.plans[0];
        first.controls.workspace = workspace;
        super::configuration::publish(first, file_id)
    }
    /// `ComponentWriter` publishes each rewritten component root/main after its files.
    pub fn materialize(&mut self, index: usize, file_id: &str) -> io::Result<()> {
        let plan = self.plan(index)?;
        plan.apply_files()?;
        let key = super::identity::selected(&self.bitmap, &plan.identity.target)?
            .0
            .to_owned();
        let row = super::identity::selected(&plan.controls.bitmap, &plan.identity.target)?
            .1
            .clone();
        self.bitmap[&key] = row;
        self.write(file_id, "rename")
    }
    pub fn finish(&mut self, file_id: &str) -> io::Result<()> {
        for plan in &self.plans {
            publication::merge(&mut self.bitmap, &self.original, &plan.controls.bitmap)?;
        }
        self.write(file_id, "rename")
    }
    pub fn target_load(
        &mut self,
        index: usize,
        row: &Value,
        pairs: &[(String, String)],
    ) -> io::Result<bool> {
        let (plan, matchers) = self.plan_packages(index, pairs)?;
        let preserve = plan.options.preserve;
        let refactor = plan.options.refactor;
        plan.options.preserve = false;
        plan.options.refactor = false;
        let result = super::files::target_load(plan, row, ("", ""));
        plan.options.preserve = preserve;
        plan.options.refactor = refactor;
        result?;
        if refactor {
            super::files::batch::packages_all(plan, matchers)
        } else {
            if preserve {
                plan.files.clear();
            }
            Ok(false)
        }
    }
    fn plan_packages(
        &mut self,
        index: usize,
        pairs: &[(String, String)],
    ) -> io::Result<(&mut Plan, &mut super::refactor::PackageMatchers)> {
        if self.packages
            .as_ref()
            .is_none_or(|matchers| !matchers.matches(pairs))
        {
            let context =
                &self.plans.get(index).ok_or_else(|| invalid("scope rename plan index"))?.context;
            self.packages =
                Some(super::refactor::PackageMatchers::with_cache(pairs, &context.patterns));
        }
        let plan = self.plans.get_mut(index).ok_or_else(|| invalid("scope rename plan index"))?;
        let matchers =
            self.packages.as_mut().ok_or_else(|| invalid("scope rename package matchers"))?;
        Ok((plan, matchers))
    }
    pub fn refactor_loaded(
        &mut self,
        rows: &[Value],
        pairs: &[(String, String)],
    ) -> io::Result<Vec<String>> {
        let targets = self.plans
            .iter()
            .filter(|plan| !plan.identity.exported)
            .map(|plan| plan.identity.target.clone())
            .collect::<Vec<_>>();
        let Some(first) = self.plans.first_mut() else { return Ok(Vec::new()) };
        let (changes, identities) =
            super::files::batch::batch_dependents(first, rows, pairs, &targets)?;
        self.refactored = changes;
        Ok(identities)
    }
    pub fn apply_refactored(&self) -> io::Result<()> {
        super::files::write_changes(&self.refactored)
    }
    #[must_use]
    pub fn refactored_materialized(&self) -> Value {
        serde_json::json!({"identity":"","directory":"","mainFile":"","files":self.refactored.iter().map(|file|serde_json::json!({"from":file.source,"to":file.destination})).collect::<Vec<_>>()})
    }
    pub fn added_identity(&self, index: usize) -> io::Result<String> {
        let plan = self.plan(index)?;
        let row = plan.controls.initial
            .as_object()
            .and_then(|rows| {
                rows.values()
                    .find(|row| {
                        row["name"] == plan.identity.target_name
                            && row["scope"] == ""
                            && row["rootDir"] == plan.identity.target_directory
                    })
            })
            .ok_or_else(|| invalid("scope rename added component"))?;
        let scope = super::identity::scope(row).ok_or_else(|| invalid("scope rename added scope"))?;
        Ok(format!("{scope}/{}", plan.identity.target_name))
    }
    pub fn refresh(&mut self, index: usize, facts: &Value) -> io::Result<()> {
        let options = self.plan(index)?.options.clone();
        let context = self.plan(index)?.context.clone();
        let mut plan = Plan::prepare_with_context(&self.root, &options, facts, &context)?;
        let directory = plan.root.join(&plan.identity.source_directory);
        plan.files.retain(|file| file.source.starts_with(&directory));
        *self.plan_mut(index)? = plan;
        Ok(())
    }
    pub fn write_refactored_targets(&mut self, changed: &[String]) -> io::Result<()> {
        for plan in &mut self.plans {
            if !plan.identity.exported && changed.contains(&plan.identity.target) {
                super::files::batch::workspace_refactor(plan)?;
            }
        }
        Ok(())
    }
}
