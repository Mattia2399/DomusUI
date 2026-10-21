"""Access Control contracts read from the source: they run anywhere, without Home Assistant.

The policy reset is a websocket command bound to the connection's account,
never a Home Assistant service: automations and scripts call services, and a
service cannot tell a script started by an administrator from that
administrator acting directly (docs/access-control-foundation.md#recupero).
"""

from __future__ import annotations

import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
INTEGRATION = ROOT / "custom_components" / "domusos"
ACCESS = INTEGRATION / "access"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_the_reset_is_no_service_anywhere() -> None:
    assert "reset_access_policy" not in read(INTEGRATION / "services.yaml")
    for name in ("strings.json", "translations/en.json", "translations/it.json", "translations/fr.json"):
        services = json.loads(read(INTEGRATION / name)).get("services", {})
        assert "reset_access_policy" not in services, name
        assert not [key for key in services if "access" in key], name


def test_access_control_registers_no_service_at_all() -> None:
    """The instrumentation hands the other modules' services to Home Assistant; Access Control has none."""
    for path in ACCESS.glob("*.py"):
        source = read(path)
        for registration in ("async_register_admin_service", "async_register_entity_service"):
            assert registration not in source, f"{path.name} registers a service"
        if path.name == "instrumentation.py":
            assert source.count("services.async_register(") == 1 and "def register_service(" in source
            continue
        assert "services.async_register" not in source, f"{path.name} registers a service"
        assert "register_service(" not in source, f"{path.name} registers a service"


def test_the_reset_command_takes_nothing_but_its_type_and_reads_the_connection() -> None:
    api = read(ACCESS / "api.py")
    assert 'websocket_command({vol.Required("type"): f"{WS_PREFIX}/reset_policy"})' in api
    assert "async_reset(connection.user)" in api
    forbidden = re.compile(r"msg\[[\"'](user_id|person_id|role|is_admin|is_owner|confirmed)[\"']\]")
    # The check itself catches what it must catch.
    assert forbidden.search('msg["user_id"]') and forbidden.search("msg['role']")
    assert not forbidden.search(api)


def test_the_reset_checks_the_account_before_touching_anything() -> None:
    manager = read(ACCESS / "manager.py")
    body = manager[manager.index("async def async_reset(") :]
    check = body.index("principal_from_user(actor)")
    admin = body.index("if not principal.is_admin:")
    first_change = body.index("set_aside_policy_files")
    assert check < admin < first_change
