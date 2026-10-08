"""Domus Profile identity: people by internal id, users by user id, never by name."""

from types import SimpleNamespace

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component

from custom_components.domusos.profile.identity import (
    AccountEligibility,
    ResolutionStatus,
    account_eligibility,
    list_persons,
    require_household_account,
    resolve_person_id,
    resolve_user_person,
)
from custom_components.domusos.profile.models import (
    AccountDisabledError,
    AmbiguousPersonIdentityError,
    NotHouseholdAccountError,
)


def _person(hass: HomeAssistant, entity_id: str, person_id: str | None, **attributes) -> None:
    if person_id is not None:
        attributes["id"] = person_id
    hass.states.async_set(entity_id, "home", attributes)


async def test_user_with_person_resolves_both_ways(hass: HomeAssistant) -> None:
    _person(hass, "person.mattia", "mattia", user_id="user-mattia", friendly_name="Mattia")

    persons = list_persons(hass)
    by_user = resolve_user_person(persons, "user-mattia")
    by_id = resolve_person_id(persons, "mattia")

    assert by_user.status is ResolutionStatus.RESOLVED
    assert by_user.person_id == "mattia"
    assert by_user.person.entity_id == "person.mattia"
    assert by_id.person.user_id == "user-mattia"


async def test_user_without_person_and_person_without_user(hass: HomeAssistant) -> None:
    _person(hass, "person.luca", "luca", friendly_name="Luca")

    persons = list_persons(hass)

    assert resolve_user_person(persons, "user-erika").status is ResolutionStatus.UNKNOWN
    luca = resolve_person_id(persons, "luca")
    assert luca.status is ResolutionStatus.RESOLVED
    assert luca.person.user_id is None
    assert resolve_person_id(persons, "nobody").status is ResolutionStatus.UNKNOWN


async def test_entity_id_change_keeps_the_internal_id(hass: HomeAssistant) -> None:
    _person(hass, "person.mattia", "mattia", user_id="user-mattia", friendly_name="Mattia")
    hass.states.async_remove("person.mattia")
    _person(hass, "person.mattia_t", "mattia", user_id="user-mattia", friendly_name="Mattia T.")

    resolution = resolve_person_id(list_persons(hass), "mattia")

    assert resolution.status is ResolutionStatus.RESOLVED
    assert resolution.person.entity_id == "person.mattia_t"
    assert resolve_user_person(list_persons(hass), "user-mattia").person_id == "mattia"


async def test_two_people_with_the_same_internal_id_are_ambiguous(hass: HomeAssistant) -> None:
    _person(hass, "person.mattia", "mattia", user_id="user-mattia")
    _person(hass, "person.mattia_yaml", "mattia", editable=False)

    resolution = resolve_person_id(list_persons(hass), "mattia")

    assert resolution.status is ResolutionStatus.AMBIGUOUS
    assert resolution.person is None
    with pytest.raises(AmbiguousPersonIdentityError):
        resolution.require()


async def test_one_user_on_two_people_is_ambiguous(hass: HomeAssistant) -> None:
    _person(hass, "person.a", "a", user_id="user-shared")
    _person(hass, "person.b", "b", user_id="user-shared")

    assert resolve_user_person(list_persons(hass), "user-shared").status is ResolutionStatus.AMBIGUOUS


async def test_equal_or_similar_names_never_link_identities(hass: HomeAssistant) -> None:
    # Same friendly name and an entity id built from the user's name, but no user_id.
    _person(hass, "person.mattia", "mattia", friendly_name="Mattia")
    _person(hass, "person.mattia_2", "mattia_2", friendly_name="Mattia")

    persons = list_persons(hass)

    assert resolve_user_person(persons, "mattia").status is ResolutionStatus.UNKNOWN
    assert resolve_person_id(persons, "Mattia").status is ResolutionStatus.UNKNOWN
    assert resolve_person_id(persons, "person.mattia").status is ResolutionStatus.UNKNOWN


async def test_people_without_internal_id_and_other_domains_are_ignored(hass: HomeAssistant) -> None:
    _person(hass, "person.legacy", None, user_id="user-legacy")
    hass.states.async_set("sensor.person_like", "1", {"id": "mattia", "user_id": "user-mattia"})

    assert list_persons(hass) == []


async def test_yaml_person_is_read_with_its_id_and_login(hass: HomeAssistant, hass_admin_user) -> None:
    assert await async_setup_component(
        hass,
        "person",
        {"person": [{"id": "erika_yaml", "name": "Erika", "user_id": hass_admin_user.id}]},
    )
    await hass.async_block_till_done()

    resolution = resolve_user_person(list_persons(hass), hass_admin_user.id)

    assert resolution.status is ResolutionStatus.RESOLVED
    assert resolution.person.person_id == "erika_yaml"
    assert resolution.person.editable is False

    # Renaming the entity id in the registry keeps the person's internal id.
    registry = er.async_get(hass)
    entity_id = resolution.person.entity_id
    registry.async_update_entity(entity_id, new_entity_id="person.erika_renamed")
    await hass.async_block_till_done()

    renamed = resolve_person_id(list_persons(hass), "erika_yaml")
    assert renamed.status is ResolutionStatus.RESOLVED
    assert renamed.person.entity_id == "person.erika_renamed"


async def test_account_eligibility_uses_server_side_flags(hass: HomeAssistant) -> None:
    member = await hass.auth.async_create_user("Mattia")
    system = await hass.auth.async_create_system_user("Home Assistant Cloud")
    disabled = await hass.auth.async_create_user("Ex")
    await hass.auth.async_deactivate_user(disabled)

    assert account_eligibility(member) is AccountEligibility.HOUSEHOLD
    assert account_eligibility(system) is AccountEligibility.SYSTEM
    assert account_eligibility(disabled) is AccountEligibility.DISABLED
    assert require_household_account(member) == member.id
    with pytest.raises(NotHouseholdAccountError):
        require_household_account(system)
    with pytest.raises(AccountDisabledError):
        require_household_account(disabled)
    with pytest.raises(NotHouseholdAccountError):
        require_household_account(None)


def test_names_never_change_eligibility() -> None:
    # A login called "guest" is still a household account: no name-based roles.
    guest_named = SimpleNamespace(id="u1", name="Guest", system_generated=False, is_active=True)

    assert account_eligibility(guest_named) is AccountEligibility.HOUSEHOLD
