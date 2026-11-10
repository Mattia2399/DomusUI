"""Load pure House modules on Windows without importing Home Assistant."""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

HOUSE_DIR = Path(__file__).resolve().parents[1] / "custom_components" / "domusos" / "house"
_PACKAGE = "domus_house_pure"


def load(name: str) -> types.ModuleType:
    if _PACKAGE not in sys.modules:
        package = types.ModuleType(_PACKAGE)
        package.__path__ = [str(HOUSE_DIR)]
        sys.modules[_PACKAGE] = package
    qualified = f"{_PACKAGE}.{name}"
    if qualified not in sys.modules:
        spec = importlib.util.spec_from_file_location(qualified, HOUSE_DIR / f"{name}.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[qualified] = module
        spec.loader.exec_module(module)
    return sys.modules[qualified]
