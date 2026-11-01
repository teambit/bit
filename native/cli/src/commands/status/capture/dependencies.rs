//! Dependency cache observations and fresh verification for a captured component.
//!
//! Extends [`Scan`] to resolve component dependencies via [`fresh`], [`policy`], and [`missing`] into [`Capture`].
use super::{
    Capture, Scan, Value, decline, fresh, full_identity, io, json, missing, policy, spread, text,
};

impl Scan<'_> {
    pub(super) fn dependencies(
        &mut self,
        target: &Value,
        directory: &str,
        files: &[String],
        policy: &policy::Policy,
        captured: &mut Capture,
    ) -> io::Result<Option<Value>> {
        let mut dependencies = self.observed(target, directory, files, policy, captured)?;
        if dependencies.get("needsDetection") == Some(&Value::Bool(true)) {
            let (detected, pending) = match self.detect(target, files, policy) {
                Ok(value) => value,
                Err(error)
                    if self.behavior.incomplete_reset
                        && error
                            .to_string()
                            .contains(
                                "dependency graph extraction requires canonical fallback",
                            ) =>
                {
                    missing::record_incomplete(target, directory, files, captured)?;
                    return Ok(None);
                }
                Err(error) => return Err(error),
            };
            dependencies = detected;
            captured.cache.pending.push(pending);
        } else if self.behavior.verify {
            let (detected, pending) = self.verified(target, files, policy, &dependencies)?;
            dependencies = detected;
            captured.cache.pending.push(pending);
        }
        Ok(Some(dependencies))
    }

    fn observed(
        &mut self,
        target: &Value,
        directory: &str,
        files: &[String],
        policy: &policy::Policy,
        captured: &mut Capture,
    ) -> io::Result<Value> {
        let identity = text(
            target
                .get("identity")
                .filter(|val| !val.is_null())
                .or_else(|| target.get("id")),
        )?
        .trim();
        let is_root = is_root_directory(directory);
        let mut dependencies = if is_root
            || captured.cache.no_fs_cache
            || captured.cache.reset
            || (!self.environments.is_checkout()
                && !self.context["environmentFacts"][identity].is_null())
        {
            json!({ "needsDetection": true })
        } else {
            self.cached(target, directory, files, policy)?
        };
        if self.environments.is_checkout() {
            captured.environment_facts["checkoutCacheMisses"][identity] =
                json!(dependencies["needsDetection"] == true);
            if !self.context["environmentFacts"][identity].is_null() {
                dependencies = json!({"needsDetection":true});
            }
        }
        Ok(dependencies)
    }

    /// `verifyFreshDependencies`: the cached dependencies detected again;
    /// any difference in metadata or issues declines.
    #[inline]
    fn verified(
        &mut self,
        target: &Value,
        files: &[String],
        policy: &policy::Policy,
        cached: &Value,
    ) -> io::Result<(Value, fresh::Pending)> {
        let (detected, pending) = self.detect(target, files, policy)?;
        let detected_meta = policy::current_metadata(target, policy, &detected)?;
        let cached_meta = policy::current_metadata(target, policy, cached)?;
        if detected_meta != cached_meta || detected.get("issues") != cached.get("issues") {
            return Err(decline("cached dependencies differ from a fresh detection"));
        }
        Ok((detected, pending))
    }

    /// `dependencyPolicyCached`.
    #[inline]
    fn cached(
        &mut self,
        target: &Value,
        directory: &str,
        files: &[String],
        policy: &policy::Policy,
    ) -> io::Result<Value> {
        let component_root = self.root.join(directory);
        let mut request = json!({
            "kind": "dependencyPolicyCached",
            "root": self.root,
            "componentRoot": component_root,
            "identity": full_identity(target)?,
            "files": files.iter().map(|file| component_root.join(file)).collect::<Vec<_>>(),
        });
        spread(&mut request, &policy.input)?;
        self.engine.request(&request)
    }

    /// `readFreshDependencies`.
    fn detect(
        &mut self,
        target: &Value,
        files: &[String],
        policy: &policy::Policy,
    ) -> io::Result<(Value, fresh::Pending)> {
        if self.facts.is_none() {
            *self.facts = Some(fresh::Facts::new(self.home)?);
        }
        let facts = self.facts.as_ref().ok_or_else(|| decline("status facts"))?;
        let detection = fresh::Detection { root: self.root, context: self.context, facts };
        let is_root_dir = target["directory"]
            .as_str()
            .or_else(|| target["rootDir"].as_str())
            .is_some_and(is_root_directory);
        let custom = if is_root_dir {
            Value::Null
        } else {
            self.environments.detectors(self.root, self.context, target, files)?
        };
        match detection.read_with_detectors(self.engine, target, files, policy, custom.clone()) {
            Err(error)
                if error
                    .to_string()
                    .contains("dependency graph extraction requires canonical fallback") =>
            {
                let custom = self.environments.parser(self.root, target, files, &custom)?;
                detection.read_with_detectors(self.engine, target, files, policy, custom)
            }
            result => result,
        }
    }
}

#[inline]
fn is_root_directory(dir: &str) -> bool {
    let normalized = dir
        .trim()
        .trim_start_matches("./")
        .trim_end_matches('/');
    normalized.is_empty() || normalized == "."
}
