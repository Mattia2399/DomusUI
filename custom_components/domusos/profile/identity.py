"""Resolve Home Assistant users and people by stable identifiers only.

A person is identified by its internal id (the ``id`` attribute of its
``person.*`` entity, assigned once at creation and kept across renames), never
by its entity id. A user is identified by its user id. Names, usernames and
emails are never compared: two people with the same name stay two people.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from homeassistant.core import HomeAssistant, State

from .models import AccountDisabledError, AmbiguousPersonIdentityError, NotHouseholdAccountError

PERSON_DOMAIN = "person"


class ResolutionStatus(StrEnum):
    """Outcome of an identity lookup."""

    UNKNOWN = "unknown"
    RESOLVED = "resolved"
    AMBIGUOUS = "ambiguous"


class AccountEligibility(StrEnum):
    """Whether an account may own a Domus Profile."""

    HOUSEHOLD = "household"
    SYSTEM = "system"
    DISABLED = "disabled"


@dataclass(frozen=True, slots=True)
class PersonIdentity:
    """A Home Assistant person as read from its live entity state."""

    person_id: str
    entity_id: str
    user_id: str | None
    editable: bool


@dataclass(frozen=True, slots=True)
class PersonResolution:
    """Result of resolving one identity to the current person."""

    status: ResolutionStatus
    person: PersonIdentity | None = None

    @property
    def person_id(self) -> str | None:
        """Return the internal person id when resolved."""
        return self.person.person_id if self.person is not None else None

    def require(self) -> PersonIdentity | None:
        """Return the person, ``None`` when unknown; raise when ambiguous."""
        if self.status is ResolutionStatus.AMBIGUOUS:
            raise AmbiguousPersonIdentityError("More than one person matches this identity")
        return self.person


def _text(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def person_from_state(state: State) -> PersonIdentity | None:
    """Read a person from its entity state; ``None`` without an internal id."""
    if state.domain != PERSON_DOMAIN:
        return None
    person_id = _text(state.attributes.get("id"))
    if person_id is None:
        return None
    return PersonIdentity(
        person_id=person_id,
        entity_id=state.entity_id,
        user_id=_text(state.attributes.get("user_id")),
        # People from configuration.yaml are read-only; the Profile Core never edits people.
        editable=state.attributes.get("editable") is not False,
    )


def persons_from_states(states: Iterable[State]) -> list[PersonIdentity]:
    """Return every person that carries an internal id."""
    return [person for state in states if (person := person_from_state(state)) is not None]


def list_persons(hass: HomeAssistant) -> list[PersonIdentity]:
    """Return the people Home Assistant currently exposes."""
    return persons_from_states(hass.states.async_all(PERSON_DOMAIN))


def _resolve(matches: list[PersonIdentity]) -> PersonResolution:
    if not matches:
        return PersonResolution(ResolutionStatus.UNKNOWN)
    if len(matches) > 1:
        # Never pick one: the caller must surface the ambiguity.
        return PersonResolution(ResolutionStatus.AMBIGUOUS)
    return PersonResolution(ResolutionStatus.RESOLVED, matches[0])


def resolve_person_id(persons: Iterable[PersonIdentity], person_id: str) -> PersonResolution:
    """Resolve an internal person id to the person that currently carries it."""
    return _resolve([person for person in persons if person.person_id == person_id])


def resolve_user_person(persons: Iterable[PersonIdentity], user_id: str) -> PersonResolution:
    """Resolve a user id to the person linked to it."""
    return _resolve([person for person in persons if person.user_id == user_id])


def account_eligibility(user: Any) -> AccountEligibility:
    """Classify an account from server-side Home Assistant flags only."""
    if getattr(user, "system_generated", False):
        return AccountEligibility.SYSTEM
    if not getattr(user, "is_active", False):
        return AccountEligibility.DISABLED
    return AccountEligibility.HOUSEHOLD


def require_household_account(user: Any) -> str:
    """Return the user id of a household account; raise for any other account."""
    eligibility = account_eligibility(user) if user is not None else AccountEligibility.SYSTEM
    if eligibility is AccountEligibility.SYSTEM:
        raise NotHouseholdAccountError("This account has no Domus Profile")
    if eligibility is AccountEligibility.DISABLED:
        raise AccountDisabledError("This account is disabled")
    return user.id
