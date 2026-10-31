//! Component package imports, diagnostics and runtime/dev/peer classification.

use super::{
    super::wire::ComponentVersion, Package, Projection, identity, invalid, peer, unversioned,
};
use serde_json::{Value, json};
use std::io;

impl Projection<'_> {
    pub(super) fn component(
        &mut self,
        package: &Package,
        edge: &str,
        field: usize,
        origin: &str,
    ) -> io::Result<()> {
        let id = package.component.as_ref().ok_or_else(|| invalid("fresh component metadata"))?;
        if identity(id)? == unversioned(&self.request.identity) {
            self.metadata.issues.self_reference.insert(origin.to_owned(), json!(package.name));
            return Ok(());
        }
        if let Some(path) = self.reader.check_main(package, edge)? {
            self.metadata.issues.non_main
                .entry(origin.to_owned())
                .or_insert_with(|| json!([]))
                .as_array_mut()
                .ok_or_else(|| invalid("non-main issue paths"))?
                .push(json!(path));
        }
        let base = identity(id)?;
        let already = |entries: &[Value]| {
            entries
                .iter()
                .any(|dependency| matches_component_or_package(dependency, &base, &package.name))
        };
        if already(&self.dependencies[0]) || (field == 1 && already(&self.dependencies[1])) {
            return Ok(());
        }
        self.component_dependency(package, field)
    }
    fn component_dependency(&mut self, package: &Package, field: usize) -> io::Result<()> {
        let id = package.component.as_ref().ok_or_else(|| invalid("fresh component metadata"))?;
        let concrete = package.concrete
            .as_deref()
            .map(str::trim)
            .filter(|ver| !ver.is_empty())
            .map(str::to_owned);
        let dependent = package.dependent
            .as_deref()
            .map(str::trim)
            .filter(|ver| !ver.is_empty())
            .map(str::to_owned);
        self.grammar.extend(
            concrete
                .iter()
                .chain(dependent.iter())
                .cloned(),
        );
        let peer = peer::range(package);
        let field = if field == 0 && peer.is_some() { 2 } else { field };
        self.versions.push(ComponentVersion {
            field,
            index: self.dependencies[field].len(),
            concrete,
            dependent,
        });
        let id = super::super::component_id::serialize(id, package.manifest["exported"] == false)?;
        let mut dependency = json!({"id":id,"relativePaths":[],"packageName":package.name});
        if let Some(range) = peer {
            dependency["versionRange"] = range.clone();
            dependency["peerVersionRange"] = range;
        }
        self.dependencies[field].push(dependency);
        Ok(())
    }
}

fn matches_component_or_package(dependency: &Value, base: &str, package_name: &str) -> bool {
    let package_name = package_name.trim();
    identity(&dependency["id"]).is_ok_and(|id| id == base)
        || (!package_name.is_empty()
            && dependency["packageName"].as_str().map(str::trim) == Some(package_name))
}
