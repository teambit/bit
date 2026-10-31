//! Interleave switch source capture with the published ordered class loader.

use super::{
    Capture, Engine, Environments, Inventory, Path, Scan, ScanBehavior, Value, array, decline,
    fresh, io, text,
};
use std::collections::{HashMap, HashSet};

struct Session<'a> {
    engine: &'a mut Engine,
    root: &'a Path,
    home: &'a Path,
    context: &'a Value,
    inventory: &'a Inventory,
    environments: &'a mut Environments,
    behavior: ScanBehavior,
    facts: &'a mut Option<fresh::Facts>,
}

pub(super) fn scan(scan: Scan<'_>, targets: &[Value], capture: &mut Capture) -> io::Result<bool> {
    let Scan {
        engine,
        root,
        home,
        context,
        inventory,
        facts,
        environments,
        behavior,
    } = scan;
    Session { engine, root, home, context, inventory, environments, behavior, facts }.run(
        targets, capture,
    )
}

impl Session<'_> {
    fn run(&mut self, targets: &[Value], capture: &mut Capture) -> io::Result<bool> {
        let Some(order) = self.order(targets)? else {
            self.plain(targets, capture)?;
            return Ok(false);
        };
        super::validate_documentation(&mut *self.engine, self.context)?;
        let Some(stage) = self.environments.switch_begin(self.context, capture, &order)? else {
            self.plain(targets, capture)?;
            return Ok(false);
        };
        let result = self
            .ordered(targets, capture, &order)
            .and_then(|()| restore_target_order(targets, capture));
        if let Err(error) = result {
            return Err(self.environments.switch_abort(capture, error));
        }
        self.environments.switch_finish(capture, stage)?;
        Ok(true)
    }

    fn order(&self, targets: &[Value]) -> io::Result<Option<Vec<String>>> {
        if !self.environments.is_checkout() || !self.behavior.callbacks {
            return Ok(None);
        }
        let Some(order) = self.context["switchStatusLoadOrder"].as_array() else {
            return Ok(None);
        };
        let order = order
            .iter()
            .map(|row| row_identity(row).map(str::to_owned))
            .collect::<io::Result<Vec<_>>>()?;
        let target_ids = targets
            .iter()
            .map(row_identity)
            .collect::<io::Result<HashSet<_>>>()?;
        if order.len() != targets.len()
            || target_ids.len() != targets.len()
            || order
                .iter()
                .collect::<HashSet<_>>()
                .len()
                != order.len()
            || order
                .iter()
                .any(|id| !target_ids.contains(id.as_str()))
        {
            return Err(decline("switch callback load order changed"));
        }
        Ok(Some(order))
    }

    fn plain(&mut self, targets: &[Value], capture: &mut Capture) -> io::Result<()> {
        for target in targets {
            self.target(target, capture)?;
        }
        Ok(())
    }

    fn ordered(
        &mut self,
        targets: &[Value],
        capture: &mut Capture,
        order: &[String],
    ) -> io::Result<()> {
        let by_id = targets
            .iter()
            .map(|row| Ok((row_identity(row)?, row)))
            .collect::<io::Result<HashMap<_, _>>>()?;
        let mut scanned = HashSet::new();
        for identity in order {
            self.scan_once(identity, &by_id, &mut scanned, capture)?;
            let response = self.environments.switch_one(self.context, capture, identity)?;
            self.complete(identity, response, &by_id, &mut scanned, capture)?;
        }
        Ok(())
    }

    fn complete(
        &mut self,
        identity: &str,
        mut response: Value,
        by_id: &HashMap<&str, &Value>,
        scanned: &mut HashSet<String>,
        capture: &mut Capture,
    ) -> io::Result<()> {
        loop {
            if response.get("row").is_some() {
                return self.environments.switch_accept(capture, &response, identity);
            }
            let needed = array(response.get("needsRows"), "switch callback needed targets")?;
            if needed.is_empty() {
                return Err(decline("switch callback continuation has no targets"));
            }
            for item in needed {
                let needed_id = text(Some(item))?;
                self.scan_once(needed_id, by_id, scanned, capture)?;
                self.environments.switch_stage_row(self.context, capture, needed_id)?;
            }
            response = self.environments.switch_resume(capture)?;
        }
    }

    fn scan_once(
        &mut self,
        identity: &str,
        by_id: &HashMap<&str, &Value>,
        scanned: &mut HashSet<String>,
        capture: &mut Capture,
    ) -> io::Result<()> {
        if scanned.insert(identity.to_owned()) {
            let target =
                by_id.get(identity).ok_or_else(|| decline("switch callback target absent"))?;
            self.target(target, capture)?;
        }
        Ok(())
    }

    fn target(&mut self, target: &Value, capture: &mut Capture) -> io::Result<()> {
        Scan {
            engine: &mut *self.engine,
            root: self.root,
            home: self.home,
            context: self.context,
            inventory: self.inventory,
            facts: &mut *self.facts,
            environments: &mut *self.environments,
            behavior: self.behavior,
        }
        .target(target, capture)
    }
}

fn restore_target_order(targets: &[Value], capture: &mut Capture) -> io::Result<()> {
    let order = targets
        .iter()
        .enumerate()
        .map(|(index, target)| Ok((row_identity(target)?, index)))
        .collect::<io::Result<HashMap<_, _>>>()?;
    let known = |identity: &str| order.contains_key(identity);
    if capture.captured
        .iter()
        .chain(&capture.comparisons)
        .any(|row| row_identity(row).is_err_and(|_| true) || !row_identity(row).is_ok_and(known))
        || capture.components
            .iter()
            .any(|row| !known(super::base_identity(&row.identity)))
    {
        return Err(decline("switch captured target identity changed"));
    }
    capture.captured.sort_by_key(|row| order[row_identity(row).unwrap_or_default()]);
    capture.comparisons.sort_by_key(|row| order[row_identity(row).unwrap_or_default()]);
    capture.components.sort_by_key(|row| order[super::base_identity(&row.identity)]);
    Ok(())
}

fn row_identity(row: &Value) -> io::Result<&str> {
    if let Some(value) = row.as_str() {
        return Ok(value);
    }
    text(
        row.get("identity")
            .or_else(|| row.get("id")),
    )
}
