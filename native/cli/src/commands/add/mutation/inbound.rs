//! A retained import advances only exact content proofs acknowledged by its native publisher.
use super::ProjectedLinker;
use serde_json::Value;
use std::{io, path::Path};

impl ProjectedLinker {
    /// Checkout's filesystem consumer parses documentation before loading dependencies.
    pub(in crate::commands) fn prepare_checkout_docs(
        root: &Path,
        environment: &mut crate::commands::status::environments::Environments,
        identities: &[String],
        deferred: bool,
    ) -> io::Result<super::super::PreparedDocs> {
        let bitmap = bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)?;
        let (mut engine, projection) = super::load::projected(root, &bitmap, identities)?;
        super::controls::validate(&mut engine, &projection.context)?;
        super::super::docs::prepare(root, environment, &projection.loading_components(), deferred)
    }

    /// `ComponentWriter` updates the live bitmap before its retained Host installs.
    pub(in crate::commands) fn project_installation_workspace(
        root: &Path,
        environment: &mut crate::commands::status::environments::Environments,
    ) -> io::Result<String> {
        let mut engine = crate::commands::engine::Engine::new()?;
        Self::project_installation_workspace_with_engine(root, environment, &mut engine)
    }

    /// The retained switch session also owns the fresh post-write projection.
    pub(in crate::commands) fn project_installation_workspace_with_engine(
        root: &Path,
        environment: &mut crate::commands::status::environments::Environments,
        engine: &mut crate::commands::engine::Engine,
    ) -> io::Result<String> {
        let bitmap = bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)?;
        let projection = super::load::projected_with_engine(root, &bitmap, &[], engine)?;
        super::controls::validate(engine, &projection.context)?;
        environment.project_tracking_retained(root, &bitmap, &projection.components)
    }
    pub(in crate::commands) fn capture_import(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identities: &[String],
        retain_loaded: bool,
    ) -> io::Result<Vec<Value>> {
        if retain_loaded {
            self.refresh_import_projection(root, bitmap, identities)?;
        }
        let environment = self.environment
            .take()
            .ok_or_else(|| io::Error::other("import callback environment"))?;
        self.environment =
            Some(environment.for_import_callbacks(retain_loaded && self.retained.has_started()));
        if retain_loaded {
            self.capture_cached(root, bitmap, identities)
        } else {
            self.capture(root, bitmap, identities)
        }
    }

    fn refresh_import_projection(
        &mut self,
        root: &Path,
        bitmap: &Value,
        identities: &[String],
    ) -> io::Result<()> {
        let (_, projection) = super::load::projected(root, bitmap, identities)?;
        for component in &projection.workspace.components {
            self.retained.import_version(
                &component.id.to_string_without_version(),
                component.id.version.as_deref(),
            );
        }
        if !self.retained.missing(identities).is_empty() {
            return Ok(());
        }
        let environment = self.environment
            .as_mut()
            .ok_or_else(|| io::Error::other("import callback environment"))?;
        self.stdout.push_str(&environment.project_tracking_retained(
            root,
            bitmap,
            &projection.components,
        )?);
        Ok(())
    }

    pub(in crate::commands) fn import_project_workspace(&mut self, root: &Path) -> io::Result<()> {
        let bitmap = bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)?;
        let (_, projection) = super::load::projected(root, &bitmap, &[])?;
        let environment =
            self.environment.as_mut().ok_or_else(|| io::Error::other("import bitmap session"))?;
        self.stdout.push_str(&environment.project_tracking_retained(
            root,
            &bitmap,
            &projection.components,
        )?);
        Ok(())
    }

    pub(in crate::commands) fn import_docs(
        &mut self,
        root: &Path,
        ids: &[String],
    ) -> io::Result<()> {
        let identities = ids
            .iter()
            .map(|id| {
                id.split('@')
                    .next()
                    .unwrap_or(id)
                    .to_owned()
            })
            .collect::<Vec<_>>();
        let (_, projection) = super::load::projected(
            root,
            &bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)?,
            &identities,
        )?;
        let environment = self.environment
            .as_mut()
            .ok_or_else(|| io::Error::other("import documentation session"))?;
        super::super::docs::load(root, environment, &projection.loading_components())
    }

    pub(in crate::commands) fn import_acknowledge(&mut self, writes: &[Value]) -> io::Result<()> {
        self.retained.acknowledge_import(writes)?;
        self.retained.validate()
    }
}
