"""Wording of the evening waste reminder: one notification, an emoji per type, three languages."""

from datetime import date

import pytest

from custom_components.domusos.waste_collection.dispatch import build_waste_dedupe_key
from custom_components.domusos.waste_collection.reminder_text import DEFAULT_EMOJI, ICON_EMOJI, reminder_text

LEAF, BOX, BOTTLE = "\U0001F33F", "\U0001F4E6", "\U0001F37E"


def test_one_type_is_named_in_the_title() -> None:
    assert reminder_text([("Vetro", "mdi:bottle-soda")], "it") == (f"Domani: {BOTTLE} Vetro", "Da portare fuori stasera.")


def test_several_types_are_counted_and_listed_in_one_notification() -> None:
    title, message = reminder_text([("Organico", "mdi:leaf"), ("Carta e cartone", "mdi:package-variant")], "it")

    assert title == "Domani passano 2 raccolte"
    assert message == f"{LEAF} Organico \u00b7 {BOX} Carta e cartone\nDa portare fuori stasera."


@pytest.mark.parametrize(
    ("language", "one", "many"),
    [
        ("en", (f"Tomorrow: {LEAF} Organic", "Put it out tonight."), ("2 collections tomorrow", "Put them out tonight.")),
        ("fr", (f"Demain : {LEAF} Organic", "\u00c0 sortir ce soir."), ("Demain, 2 collectes", "\u00c0 sortir ce soir.")),
        ("it-IT", (f"Domani: {LEAF} Organic", "Da portare fuori stasera."), ("Domani passano 2 raccolte", "Da portare fuori stasera.")),
        ("de", (f"Domani: {LEAF} Organic", "Da portare fuori stasera."), ("Domani passano 2 raccolte", "Da portare fuori stasera.")),
        (None, (f"Domani: {LEAF} Organic", "Da portare fuori stasera."), ("Domani passano 2 raccolte", "Da portare fuori stasera.")),
    ],
)
def test_the_wording_follows_the_home_assistant_language(language, one, many) -> None:
    assert reminder_text([("Organic", "mdi:leaf")], language) == one
    title, message = reminder_text([("Organic", "mdi:leaf"), ("Paper", "mdi:newspaper")], language)
    assert (title, message.splitlines()[-1]) == many


def test_every_offered_icon_has_an_emoji_and_unknown_ones_fall_back() -> None:
    offered = [
        "mdi:leaf", "mdi:food-apple", "mdi:package-variant", "mdi:newspaper", "mdi:recycle", "mdi:bottle-soda",
        "mdi:cup", "mdi:trash-can", "mdi:tree", "mdi:tshirt-crew", "mdi:baby-carriage", "mdi:battery",
        "mdi:lightbulb", "mdi:chip", "mdi:water", "mdi:pill", "mdi:sofa",
    ]
    assert all(icon in ICON_EMOJI for icon in offered)
    assert reminder_text([("Altro", "mdi:something-new")], "it")[0] == f"Domani: {DEFAULT_EMOJI} Altro"
    assert reminder_text([("Altro", None)], "it")[0] == f"Domani: {DEFAULT_EMOJI} Altro"


def test_the_wording_never_changes_the_dedupe_key() -> None:
    day = date(2026, 10, 7)
    italian = reminder_text([("Organico", "mdi:leaf")], "it")
    english = reminder_text([("Organic", "mdi:leaf")], "en")

    assert italian != english
    assert build_waste_dedupe_key(day, ["organic"]) == "waste:reminder:2026-10-07:organic:evening"
