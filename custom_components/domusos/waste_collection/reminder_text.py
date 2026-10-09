"""Wording of the evening waste reminder.

One notification per collection day, whatever the number of waste types:
with one type the title names it, with several it counts them and the text
lists each one. Every type gets an emoji derived from the icon chosen in the
settings, so it reads the same on Android and iPhone. Wording never affects
the dedupe key, which is built from the day and the type ids only.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

# The icons offered by the settings (and older aliases), as emoji.
ICON_EMOJI: Mapping[str, str] = {
    "mdi:leaf": "\U0001F33F",
    "mdi:food-apple": "\U0001F34E",
    "mdi:package-variant": "\U0001F4E6",
    "mdi:package": "\U0001F4E6",
    "mdi:newspaper": "\U0001F4F0",
    "mdi:recycle": "♻️",
    "mdi:bottle-soda": "\U0001F37E",
    "mdi:bottle-wine": "\U0001F37E",
    "mdi:glass-fragile": "\U0001F37E",
    "mdi:cup": "\U0001F96B",
    "mdi:trash-can": "\U0001F5D1️",
    "mdi:trash-can-outline": "\U0001F5D1️",
    "mdi:tree": "\U0001F333",
    "mdi:tshirt-crew": "\U0001F455",
    "mdi:baby-carriage": "\U0001F476",
    "mdi:battery": "\U0001F50B",
    "mdi:lightbulb": "\U0001F4A1",
    "mdi:chip": "\U0001F4BB",
    "mdi:water": "\U0001F6E2️",
    "mdi:pill": "\U0001F48A",
    "mdi:sofa": "\U0001F6CB️",
}
DEFAULT_EMOJI = "\U0001F5D1️"

COPY: Mapping[str, Mapping[str, str]] = {
    "it": {
        "one_title": "Domani: {type}",
        "many_title": "Domani passano {count} raccolte",
        "closing": "Da portare fuori stasera.",
    },
    "en": {
        "one_title": "Tomorrow: {type}",
        "many_title": "{count} collections tomorrow",
        "closing": "Put it out tonight.",
        "closing_many": "Put them out tonight.",
    },
    "fr": {
        "one_title": "Demain : {type}",
        "many_title": "Demain, {count} collectes",
        "closing": "À sortir ce soir.",
    },
}


def type_label(name: str, icon: str | None) -> str:
    """A waste type as shown in the reminder: its emoji, then its name."""
    return f"{ICON_EMOJI.get(icon or '', DEFAULT_EMOJI)} {name}"


def reminder_text(types: Iterable[tuple[str, str | None]], language: str | None) -> tuple[str, str]:
    """Title and message for one collection day; ``types`` are (name, icon) in display order."""
    labels = [type_label(name, icon) for name, icon in types]
    copy = COPY.get((language or "it").split("-")[0].lower(), COPY["it"])
    if len(labels) == 1:
        return copy["one_title"].format(type=labels[0]), copy["closing"]
    closing = copy.get("closing_many", copy["closing"])
    listing = " · ".join(labels)
    return copy["many_title"].format(count=len(labels)), f"{listing}\n{closing}"
