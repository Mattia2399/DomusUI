"""``domusos/profile/test_self``: a fixed test notification to the user's own devices only.

Called directly with a recorded connection, like the other profile command
tests, so it runs on every supported release.
"""

from typing import Any

import pytest
import voluptuous as vol
from homeassistant.core import HomeAssistant

from custom_components.domusos.const import DOMAIN
from custom_components.domusos.notifications import DATA_NOTIFICATION_ROUTER
from custom_components.domusos.notifications.router import SELF_TEST_MESSAGE, SELF_TEST_TITLE
from custom_components.domusos.profile.api import DATA_PROFILE_MANAGER, websocket_test_self

from notification_support import claim, register_phone, set_person, start


class RecordedConnection:
    """The parts of ``ActiveConnection`` the profile handlers use."""

    def __init__(self, user: Any) -> None:
        self.user = user
        self.results: dict[int, Any] = {}
        self.errors: dict[int, str] = {}

    def send_result(self, msg_id: int, result: Any = None) -> None:
        self.results[msg_id] = result

    def send_error(self, msg_id: int, code: str, message: str, *_: Any, **__: Any) -> None:
        self.errors[msg_id] = code


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
async def home(hass: HomeAssistant):
    await hass.auth.async_create_user("Owner")
    mattia = await hass.auth.async_create_user("Mattia")
    erika = await hass.auth.async_create_user("Erika")
    clock = FakeClock()
    manager, _ledger, router = await start(hass, clock=clock)
    hass.data.setdefault(DOMAIN, {})[DATA_PROFILE_MANAGER] = manager
    hass.data[DOMAIN][DATA_NOTIFICATION_ROUTER] = router
    galaxy = register_phone(hass, mattia.id, "Galaxy")
    tablet = register_phone(hass, mattia.id, "Tablet")
    iphone = register_phone(hass, erika.id, "iPhone")
    galaxy_id, tablet_id = await claim(manager, mattia.id, galaxy, tablet)
    (iphone_id,) = await claim(manager, erika.id, iphone)
    return {
        "hass": hass, "manager": manager, "router": router, "clock": clock,
        "mattia": mattia, "erika": erika, "galaxy": galaxy, "tablet": tablet, "iphone": iphone,
        "galaxy_id": galaxy_id, "tablet_id": tablet_id, "iphone_id": iphone_id,
    }


async def _test(hass: HomeAssistant, user: Any, **fields: Any) -> tuple[Any, str | None]:
    connection = RecordedConnection(user)
    websocket_test_self(hass, connection, {"id": 1, "type": "domusos/profile/test_self", **fields})
    await hass.async_block_till_done(wait_background_tasks=True)
    return connection.results.get(1), connection.errors.get(1)


async def test_a_user_tests_all_their_enabled_devices_with_fixed_text(home) -> None:
    result, error = await _test(home["hass"], home["mattia"])

    assert error is None
    assert result["status"] == "delivered"
    assert "person_id" not in result
    assert [device["personal_device_id"] for device in result["devices"]] == [home["galaxy_id"], home["tablet_id"]]
    expected = {"message": SELF_TEST_MESSAGE, "title": SELF_TEST_TITLE}
    assert home["galaxy"].calls == [expected] and home["tablet"].calls == [expected]
    assert home["iphone"].calls == []


async def test_one_device_can_be_tested_alone(home) -> None:
    result, _ = await _test(home["hass"], home["mattia"], personal_device_id=home["tablet_id"])

    assert [device["personal_device_id"] for device in result["devices"]] == [home["tablet_id"]]
    assert home["galaxy"].calls == [] and len(home["tablet"].calls) == 1


async def test_a_user_without_a_person_can_test(home) -> None:
    # Only Erika has a person; Mattia has none, and the test works the same.
    set_person(home["hass"], "person.erika", "p-erika", home["erika"].id)

    result, error = await _test(home["hass"], home["mattia"])

    assert error is None and result["status"] == "delivered"


async def test_another_profiles_device_is_never_reachable(home) -> None:
    # Mattia knows Erika's PersonalDevice id: it is still not his.
    result, error = await _test(home["hass"], home["mattia"], personal_device_id=home["iphone_id"])

    assert (result, error) == (None, "device_not_in_profile")
    assert home["iphone"].calls == []


async def test_preferences_still_apply(home) -> None:
    hass, manager, mattia, clock = home["hass"], home["manager"], home["mattia"], home["clock"]
    revision = manager.get_profile(mattia.id).revision
    await manager.async_update_device(mattia.id, revision, home["tablet_id"], {"notifications_enabled": False})

    result, _ = await _test(hass, mattia, personal_device_id=home["tablet_id"])
    assert (result["status"], result["reason"]) == ("skipped", "notifications_disabled")

    clock.now += 11
    result, _ = await _test(hass, mattia)
    assert [device["personal_device_id"] for device in result["devices"]] == [home["galaxy_id"]]

    clock.now += 11
    revision = manager.get_profile(mattia.id).revision
    await manager.async_save_self(mattia.id, revision, {"notifications": {"enabled": False}})
    result, _ = await _test(hass, mattia)
    assert (result["status"], result["reason"]) == ("skipped", "notifications_disabled")
    assert home["tablet"].calls == [] and len(home["galaxy"].calls) == 1


async def test_no_profile_no_devices_and_unavailable_targets(home) -> None:
    hass, manager = home["hass"], home["manager"]
    luca = await hass.auth.async_create_user("Luca")
    anna = await hass.auth.async_create_user("Anna")
    await manager.async_save_self(anna.id, 0, {"notifications": {"enabled": False}})
    await manager.async_save_self(anna.id, 1, {"notifications": {"enabled": True}})

    assert (await _test(hass, luca))[0] == {"status": "skipped", "reason": "no_profile", "devices": []}
    assert (await _test(hass, anna))[0] == {"status": "skipped", "reason": "no_devices", "devices": []}
    home["clock"].now += 11
    assert (await _test(hass, luca, personal_device_id="pd-1"))[1] == "device_not_in_profile"

    hass.services.async_remove("notify", home["galaxy"].service)
    hass.services.async_remove("notify", home["tablet"].service)
    result, _ = await _test(hass, home["mattia"])
    assert (result["status"], result["reason"]) == ("skipped", "target_unavailable")


async def test_tests_are_rate_limited_per_user(home) -> None:
    hass, clock = home["hass"], home["clock"]

    assert (await _test(hass, home["mattia"]))[1] is None
    assert (await _test(hass, home["mattia"]))[1] == "rate_limited"
    # Another user is not slowed down.
    assert (await _test(hass, home["erika"]))[1] is None

    clock.now += 9.9
    assert (await _test(hass, home["mattia"]))[1] == "rate_limited"
    clock.now += 0.2
    assert (await _test(hass, home["mattia"]))[1] is None
    assert len(home["galaxy"].calls) == 2


async def test_without_a_router_the_test_reports_it(hass: HomeAssistant) -> None:
    await hass.auth.async_create_user("Owner")
    user = await hass.auth.async_create_user("Mattia")

    assert (await _test(hass, user))[1] == "notification_router_unavailable"


async def test_system_and_disabled_accounts_cannot_test(home) -> None:
    hass = home["hass"]
    system = await hass.auth.async_create_system_user("Supervisor")
    disabled = await hass.auth.async_create_user("Disabled")
    await hass.auth.async_deactivate_user(disabled)

    assert (await _test(hass, system))[1] == "not_household_account"
    assert (await _test(hass, disabled))[1] == "account_disabled"


@pytest.mark.parametrize(
    "extra",
    [
        {"user_id": "x"},
        {"person_id": "x"},
        {"owner_user_id": "x"},
        {"ha_device_id": "a" * 32},
        {"message": "spam"},
        {"title": "spam"},
        {"target": ["notify.x"]},
        {"service": "notify.x"},
        {"data": {}},
        {"recipients": ["p"]},
        {"expected_revision": 0},
    ],
)
def test_the_schema_accepts_nothing_but_an_own_device_id(extra: dict) -> None:
    schema = websocket_test_self._ws_schema  # noqa: SLF001
    base = {"id": 1, "type": "domusos/profile/test_self"}

    assert schema(base) and schema({**base, "personal_device_id": "pd-1"})
    with pytest.raises(vol.Invalid):
        schema({**base, **extra})
    for bad in ("../x", "", "A" * 65, 3, None):
        with pytest.raises(vol.Invalid):
            schema({**base, "personal_device_id": bad})
