//! New-component rename follows the published loaded-class cache across path materialization.
use super::{ProjectedLinker, cache, execution, linking, load, selection};
use crate::commands::color::Chalk;
use serde_json::{Value, json};
use std::{io, path::Path, sync::Arc};

impl ProjectedLinker {
    pub(in crate::commands) fn capture_cached(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identities: &[String],
    ) -> io::Result<Vec<Value>> {
        let result = self.capture_cached_inner(root, bitmap, identities);
        self.finish(result)
    }
    fn capture_cached_inner(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identities: &[String],
    ) -> io::Result<Vec<Value>> {
        let missing = self.retained.missing(identities);
        if !missing.is_empty() {
            let known = identities
                .iter()
                .map(|id| id.trim())
                .filter(|id| !id.is_empty() && !missing.iter().any(|item| item == id))
                .map(str::to_owned)
                .collect::<Vec<_>>();
            // Missing captures may need existing classes, then project a fresh
            // bitmap. Seed before loading and rebind all classes afterwards.
            self.cached_classes(root, &self.retained.rows(&known)?)?;
        }
        let invalidate = self.retained.start();
        if !missing.is_empty() {
            let captured = load::capture_cached(
                root,
                bitmap,
                &missing,
                &mut self.environment,
                &mut self.stdout,
                invalidate,
            )?;
            self.retained.keep(captured)?;
        }
        let rows = self.retained.rows(identities)?;
        self.cached_classes(root, &rows)?;
        Ok(rows)
    }
    pub(in crate::commands) fn link_retained(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identities: &[String],
        json: bool,
        chalk: Chalk,
    ) -> io::Result<()> {
        let result = self.link_cached_inner(root, bitmap, identities, json, chalk);
        self.finish(result)
    }
    fn link_cached_inner(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identities: &[String],
        json: bool,
        chalk: Chalk,
    ) -> io::Result<()> {
        let (_, projection) = load::projected(root, bitmap, identities)?;
        let mut components = selection::components(&projection, identities);
        let rows = refreshed(self.retained.rows(identities)?, &components)?;
        let stdout = self.environment
            .as_mut()
            .ok_or_else(|| io::Error::other("retained identity environment"))?
            .project_tracking_retained(root, bitmap, &projection.components)?;
        self.stdout.push_str(&stdout);
        let environment = self.environment
            .take()
            .ok_or_else(|| io::Error::other("retained identity environment"))?;
        let host = Arc::new(
            environment
                .into_tracking_host()
                .ok_or_else(|| io::Error::other("retained identity host"))?,
        );
        let linked = link_rows(root, &projection, &rows, &mut components, &host, json, chalk);
        self.restore(host)?;
        linked
    }
    fn cached_classes(&mut self, root: &Path, rows: &[Value]) -> io::Result<()> {
        if rows.is_empty() {
            return Ok(());
        }
        let (_, stdout) = self.environment
            .as_mut()
            .ok_or_else(|| io::Error::other("retained identity environment"))?
            .identity_call(root, "identityUseCached", &json!({"components":rows}))?;
        self.stdout.push_str(&stdout);
        Ok(())
    }
}
fn refreshed(
    mut rows: Vec<Value>,
    components: &[bit_install::model::WorkspaceComponent],
) -> io::Result<Vec<Value>> {
    for row in &mut rows {
        let identity = row["identity"]
            .as_str()
            .or_else(|| row["id"].as_str())
            .map(str::trim)
            .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base.trim()))
            .filter(|id| !id.is_empty());
        let component = components
            .iter()
            .find(|component| Some(component.id.to_string_without_version().trim()) == identity)
            .ok_or_else(|| io::Error::other("retained identity projection missing"))?;
        row["directory"] = json!(component.root_dir);
        row["files"] = json!(component.files);
        row["current"]["mainFile"] = json!(component.main_file);
    }
    Ok(rows)
}

fn link_rows(
    root: &Path,
    projection: &super::super::projection::Projection,
    rows: &[Value],
    components: &mut [bit_install::model::WorkspaceComponent],
    host: &Arc<crate::host::Host>,
    json: bool,
    chalk: Chalk,
) -> io::Result<()> {
    selection::seed_environments(components, host, rows)?;
    linking::overlay(components, rows)?;
    let manifests = cache::Manifests::observe(root, components);
    execution::link_rows(root, projection, rows, components, host, json, chalk)?;
    load::invalidate_changed(root, components, &manifests, host)
}
