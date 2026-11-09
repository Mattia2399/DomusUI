"""Load Climate's plain Python contract without importing Home Assistant."""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

CLIMATE_DIR = Path(__file__).resolve().parents[1] / "custom_components" / "domusos" / "climate"
PACKAGE = "domus_climate_pure"


def load(name: str) -> types.ModuleType:
    if PACKAGE not in sys.modules:
        package = types.ModuleType(PACKAGE)
        package.__path__ = [str(CLIMATE_DIR)]
        sys.modules[PACKAGE] = package
    qualified = f"{PACKAGE}.{name}"
    if qualified in sys.modules:
        return sys.modules[qualified]
    spec = importlib.util.spec_from_file_location(qualified, CLIMATE_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[qualified] = module
    spec.loader.exec_module(module)
    return module
