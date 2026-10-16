//! Dependency cache observations and fresh verification for a captured component.
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
        let mut dependencies = if captured.cache.no_fs_cache
            || (captured.cache.reset && directory != ".")
            || (!self.environments.is_checkout()
                && !self.context["environmentFacts"][text(target.get("identity"))?].is_null())
        {
            json!({ "needsDetection": true })
        } else {
            self.cached(target, directory, files, policy)?
        };
        if self.environments.is_checkout() {
            let identity = text(target.get("identity"))?;
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
    fn verified(
        &mut self,
        target: &Value,
        files: &[String],
        policy: &policy::Policy,
        cached: &Value,
    ) -> io::Result<(Value, fresh::Pending)> {
        let (detected, pending) = self.detect(target, files, policy)?;
        let current = |deps: &Value| {
            policy::current_metadata(target, policy, deps).map(|meta| meta.to_string())
        };
        let issues = |deps: &Value| deps.get("issues").map(Value::to_string);
        if current(&detected)? != current(cached)? || issues(&detected) != issues(cached) {
            return Err(decline("cached dependencies differ from a fresh detection"));
        }
        Ok((detected, pending))
    }

    /// `dependencyPolicyCached`.
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
        let custom = self.environments.detectors(self.root, self.context, target, files)?;
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
