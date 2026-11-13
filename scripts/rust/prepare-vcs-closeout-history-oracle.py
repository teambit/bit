#!/usr/bin/env python3
"""Reuse the released-writer transcript validator for active-lane dependency imports."""
import importlib.util
from pathlib import Path
import types


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ORACLE = load('closeout_history_transcript', 'prepare-lane-restoration-history-oracle.py')
HISTORY_REASONS = {
    'active-lane-fetch-deps': ['import', 'import'],
    'shared-group-export': ['export'],
    'subscriber-fork': ['adding tooling-local/comp1'],
    'subscriber-switch': ['checkout', 'lane-switch'],
    'lane-soft-tag': ['tag (message: planned)'],
}
ORACLE.FIXTURE = types.SimpleNamespace(HISTORY_REASONS=HISTORY_REASONS)
ORACLE.WORKLOADS = tuple(HISTORY_REASONS)
CORE = ORACLE.CORE
VALIDATOR = ORACLE.VALIDATOR
original_fingerprints = ORACLE.fingerprints


def fingerprints(args, hook):
    result = original_fingerprints(args, hook)
    for filename in ['prepare-vcs-closeout-history-oracle.py',
                     'prepare-vcs-closeout-benchmark.py', 'prepare-vcs-tooling-benchmark.py']:
        result[filename] = CORE.sha(Path(__file__).with_name(filename).read_bytes())
    return result


ORACLE.fingerprints = fingerprints


def prepare(args, stage, fixtures, environment):
    previous = ORACLE.WORKLOADS
    ORACLE.WORKLOADS = tuple(name for name in HISTORY_REASONS if name in fixtures['workloads'])
    try:
        return ORACLE.prepare(args, stage, fixtures, environment)
    finally:
        ORACLE.WORKLOADS = previous


def frozen(fixtures, workload):
    return ORACLE.frozen(fixtures, workload)
