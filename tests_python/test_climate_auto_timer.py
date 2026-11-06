"""CLM.4B one-boundary timer with an injected clock and scheduler."""

from __future__ import annotations

from datetime import datetime

from climate_pure import load

BoundaryTimer = load("auto_timer").BoundaryTimer


class Handle:
    def __init__(self, delay, callback):
        self.delay = delay
        self.callback = callback
        self.cancelled = False

    def cancel(self):
        self.cancelled = True

    def fire(self):
        assert not self.cancelled
        self.callback()


def event(instant):
    return {"nextEvent": {"occursAt": instant}}


def test_one_boundary_fires_recomputes_reschedules_and_cleans_up():
    current = [datetime.fromisoformat("2026-01-05T05:00:00+00:00")]
    handles = []
    calls = []

    def schedule(delay, callback):
        handle = Handle(delay, callback)
        handles.append(handle)
        return handle

    def recompute():
        calls.append(current[0])
        timer.update(event("2026-01-05T07:30:00+00:00"), "Europe/Rome")

    timer = BoundaryTimer(lambda: current[0], schedule, recompute)
    first = event("2026-01-05T05:30:00+00:00")
    timer.update(first, "Europe/Rome")
    timer.update(first, "Europe/Rome")
    assert len(handles) == 1 and handles[0].delay == 1800
    current[0] = datetime.fromisoformat("2026-01-05T05:30:00+00:00")
    handles[0].fire()
    assert calls == current
    assert len(handles) == 2 and handles[1].delay == 7200
    timer.cancel()
    assert handles[1].cancelled and timer.handle is None


def test_timezone_and_clock_jump_replace_boundary_without_polling():
    current = [datetime.fromisoformat("2026-01-05T05:00:00+00:00")]
    handles = []

    def schedule(delay, callback):
        handle = Handle(delay, callback)
        handles.append(handle)
        return handle

    timer = BoundaryTimer(lambda: current[0], schedule, lambda: None)
    timer.update(event("2026-01-05T05:30:00+00:00"), "Europe/Rome")
    timer.update(event("2026-01-05T06:30:00+00:00"), "Europe/Paris")
    assert handles[0].cancelled and len(handles) == 2
    current[0] = datetime.fromisoformat("2026-01-05T09:00:00+00:00")
    timer.update(event("2026-01-05T10:00:00+00:00"), "Europe/Paris")
    assert handles[1].cancelled and handles[2].delay == 3600
    timer.update(None, "Europe/Paris")
    assert handles[2].cancelled and timer.handle is None
