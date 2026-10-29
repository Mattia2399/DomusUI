"""Load the plain-Python Access Control modules without Home Assistant.

``models``, ``actions`` and ``authorization`` import each other relatively, so
they are loaded from their files into a package of their own: the
integration's ``access/__init__.py`` (which imports Home Assistant) is never
run, and the tests work on any machine.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types

ACCESS_DIR = Path(__file__).resolve().parents[1] / "custom_components" / "domusos" / "access"
INTEGRATION_DIR = ACCESS_DIR.parent
_PACKAGE = "domus_access_pure"


def load(name: str) -> types.ModuleType:
    if _PACKAGE not in sys.modules:
        package = types.ModuleType(_PACKAGE)
        package.__path__ = [str(ACCESS_DIR)]
        sys.modules[_PACKAGE] = package
    qualified = f"{_PACKAGE}.{name}"
    if qualified in sys.modules:
        return sys.modules[qualified]
    spec = importlib.util.spec_from_file_location(qualified, ACCESS_DIR / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[qualified] = module
    spec.loader.exec_module(module)
    return module
