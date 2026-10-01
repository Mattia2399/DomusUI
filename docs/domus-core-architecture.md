# Domus Core architecture

Domus is evolving as three deliberately separate layers inside one Home
Assistant custom integration:

- **Domus UI** is the React interface and Home Assistant panel.
- **Domus Core** is the local, server-side runtime hosted by the `domusos`
  integration.
- **Domus Intelligence** is a future context-aware decision layer built on the
  Core contracts. It is **not implemented** by this foundation.

Domus UI remains installed as one HACS integration. There is no second custom
component, add-on, mandatory cloud process, message broker, or browser-owned
automation engine. Critical home functions must continue inside Home Assistant
when no Domus browser is open. HACS remains the only required installation
method for the complete Domus UI integration.

## Target data flow

```text
Home Assistant entities/services
              |
              v
       Domain adapters
              |
              v
      Context providers
              |
              v
        Domus Context
              |
              v
 Future Decision Engine     (not implemented)
              |
              v
  Future Action Engine      (not implemented)
              |
              v
 Home Assistant services
              |
              v
            Audit
```

The complete pipeline is still a future responsibility boundary. The first
read-only part now runs for Calendar, Irrigation, and Energy; no context
interpretation, decision, or action follows it.

## Implementation status

Implemented:

- `DomusRuntime`;
- internal `DomusEventBus`;
- `ContextRegistry`;
- `CalendarContextProvider`;
- `IrrigationContextProvider`;
- Domus Energy Core phase 1: Energy Profile, assisted discovery,
  `EnergyModuleAdapter`, and `EnergyContextProvider` (read-only, see
  [energy-core.md](energy-core.md));
- capability, decision, action, and audit contracts;
- bounded in-memory audit foundation.

Not implemented:

- Decision Engine;
- Action Engine;
- Energy dashboard, energy decisions, and any energy control;
- Vehicle domain;
- Climate Intelligence;
- Smart Notifications;
- Trip Planner.

The real provider flow is:

```text
DomusCalendarStore ---> CalendarContextProvider --+
                                                  |
                                                  v
                                           Context Registry
                                                  ^
                                                  |
IrrigationManager ---> IrrigationContextProvider -+
                                                  ^
                                                  |
EnergyProfileManager -> EnergyModuleAdapter(s) ---+
                        via EnergyContextProvider
```

## Runtime and lifecycle

`DomusRuntime` is created during `async_setup_entry`, started before the
existing Calendar and Irrigation managers, and exposed as
`hass.data[DOMAIN]["runtime"]`. The legacy `irrigation_manager` and
`calendar_manager` keys remain available unchanged. A typed entry runtime data
object owns all three references for config-entry lifecycle management.

The setup order is deliberately:

1. start `DomusRuntime`;
2. set up `IrrigationManager`;
3. set up `DomusCalendarStore`;
4. register both context providers and both event listeners;
5. start `EnergyProfileManager` and its bindings in an isolated block: a
   failure is logged and leaves Calendar and Irrigation running;
6. register the panel and forward the Calendar platform.

The runtime currently owns:

- `runtime.events`: the internal `DomusEventBus`;
- `runtime.context`: the `ContextRegistry`;
- `runtime.audit`: the bounded `DomusAuditService`.

Setup and shutdown are asynchronous, idempotent, and protected by a lifecycle
lock. No worker thread, process, scheduler, or external connection is created.
On unload, the Calendar platform is unloaded, provider and event registrations
are removed, the authoritative managers are shut down, and finally the runtime
clears remaining internal state. Setup failure uses the same reverse cleanup,
so reloads cannot retain providers bound to old managers.

Decision and action engines are intentionally absent. Only their stable data
contracts exist, so the runtime does not own placeholder services with no
behavior.

## Internal event contract

`DomusEvent` is an immutable value object containing:

- `event_id`;
- `type`;
- `source`;
- timezone-aware `timestamp`;
- immutable `payload`;
- optional `correlation_id`.

Event types use exactly the lower-case naming convention
`<domain>.<event>`, for example `calendar.changed`. The contract does not
predefine a class for every event. Sources use lower-case dotted names such as
`calendar.store` or `irrigation.manager`.

The process-local event bus supports subscriptions for one exact event type,
an optional all-events subscription, idempotent unsubscribe callbacks, and
asynchronous publication. A failing subscriber is logged and isolated so it
cannot prevent healthy subscribers from receiving the same event.

Two real transition notifications are currently bridged from existing public
listeners:

- `calendar.changed` after a stored Calendar create, update, or delete;
- `irrigation.state_changed` after an Irrigation manager state notification;
- `energy.profile_changed` after the Energy Profile is saved;
- `energy.availability_changed` when a configured energy module moves between
  online and offline.

Their payload is intentionally empty. Subscribers must read a fresh context
snapshot from the authoritative Store or manager; events never retain state.

The Home Assistant global event bus and dispatcher were not used here. Domus
events are internal typed contracts rather than a public HA automation API, and
the small local bus provides explicit failure isolation without adding a
broker. A future public event surface should be designed separately if users
need to automate from Domus events.

## Context registry

A `ContextProvider` owns one optional capability, such as `calendar`,
`vehicle`, or `energy`. Providers register dynamically. A snapshot asks all or
a selected set of providers for their current normalized fragment and returns:

- available capability data;
- registered but unavailable capabilities;
- requested capabilities with no provider installed.

Providers are independent and have a bounded read timeout. A missing, failed,
or temporarily unavailable provider does not prevent other context fragments
from being returned. Consequently, a home without an EV, solar inverter,
security system, or irrigation controller does not need dummy modules or empty
directories.

`CalendarContextProvider` uses only `DomusCalendarStore.next_event()`. It
returns availability plus either `next_event: null` or an event containing UID,
summary, ISO start/end boundaries, all-day status, and location. Descriptions
are not projected into context.

`IrrigationContextProvider` uses only
`IrrigationManager.state_for_user(None)`. It projects availability, revision,
mode, running/paused/fault flags, active and queued zone IDs, minimal public
session fields, rain safety state, and observation time. It omits history,
legacy automation IDs, requesting user IDs, actuator entity IDs, configuration,
and every scheduler/watchdog internal.

`EnergyContextProvider` is registered only while the Energy Profile contains
at least one module, so a home without energy hardware reports `energy` as
missing. It projects each configured module through its capability adapter,
lists absent and offline modules explicitly, and reports home consumption as
measured or derived. Configured modules that go offline remain in the context.

The registry remains backend-internal. No `domusos/context/*` WebSocket API or
other client-facing context endpoint is registered. The admin-only
`domusos/energy/*` commands configure which sensors Energy reads; they do not
expose context snapshots.

## Capabilities and adapters

`CapabilityAdapter` is the vendor-neutral boundary between Home Assistant
entities and Domus models. A future Vehicle Profile can map installation-
specific entities such as `sensor.tesla_battery_level` or `sensor.bmw_soc` to a
`CapabilityState` containing normalized values such as `soc`, `range`,
`charging`, and `plugged`.

The contract records availability, observation time, source adapter, and the
Home Assistant entity IDs used. It does not hard-code a vendor, discover
entities, or bypass Home Assistant permissions. `EnergyModuleAdapter` is the
first real implementation; entity discovery for it is a separate, proposal-only
service. Domain-specific profile and
configuration work belongs to the future domain module and Config/Options Flow.

An adapter normalizes device data; a context provider decides which normalized
facts should participate in a context snapshot. Keeping those responsibilities
separate allows several device integrations to provide the same capability.

## Decision contract

`DomusDecision` represents an explainable future outcome with an ID, namespaced
type, reason, creation and optional expiry time, context references, proposed
actions, metadata, and correlation ID. `DecisionMode` has three values:

- `AUTOMATIC`: execution may be authorized by a future explicit policy;
- `ASSISTED`: an action proposal requires user confirmation;
- `INFORMATIVE`: no action is requested.

No code in this foundation evaluates context or creates decisions
automatically.

## Action contract

`DomusAction` describes an action type, normalized target, immutable
parameters, requesting decision, optional safety policy, lifecycle status,
result, and correlation ID. `ActionResult` represents only a terminal result.

The action contract cannot call Home Assistant services. A future Action Engine
must perform capability and permission checks, apply explicit policy, use
timeouts and idempotency where appropriate, and record the result in audit
before execution is enabled.

## Audit

`AuditEntry` links a timestamp and source to a human-readable reason, decision,
action, result, correlation ID, and metadata. `DomusAuditService` currently
keeps at most 500 immutable entries in memory and prunes the oldest entry.

Persistence is deliberately deferred until real decision/action producers
exist. This avoids continuous Store writes and an unproven schema. Before
automatic actions ship, durable audit must define a versioned Home Assistant
Store document, bounded retention, pruning, migration, redaction, and write
coalescing. No separate database is planned.

## Integration of existing modules

Calendar and Irrigation are now connected through additive read-only adapters.
`DomusCalendarStore` and `IrrigationManager` remain the only sources of truth.
The providers own no Store, cache, scheduler, queue, or session state and do not
write back to their managers. Existing storage keys, entity behavior, Home
Assistant Calendar API, Irrigation services and WebSocket commands, and the
frontend bridge are unchanged.

## Theoretical future composition

A future Calendar provider could expose an upcoming 170 km trip, a Vehicle
adapter could expose a 42% state of charge, and an Energy provider could expose
that the vehicle is plugged in plus a low-tariff window. A future Decision
Engine could correlate those fragments under one correlation ID and propose a
`vehicle.charge_to` action. Depending on user policy, it could be automatic,
assisted, or informative. A future Action Engine would map the normalized
target through the configured Vehicle Profile, re-check availability and Home
Assistant permissions, execute with an idempotency key and timeout, and record
the reason and result in audit.

This example is architectural only. No trip planner, charging behavior,
tariff integration, or vehicle automation is implemented.

## External services and credentials

Future integrations with routes, tariffs, weather providers, vehicles, or
other cloud APIs are optional. Requests involving credentials, API keys,
server-side logic, or automations must originate from the Domus backend, not
the React bundle. Credentials must use Config Flow, Options Flow, Application
Credentials, or another appropriate Home Assistant mechanism. Secrets must
never be embedded in frontend assets, context payloads, or audit records.

## Safety principles

Future modules must remain local-first and safe by default:

1. no implicit destructive action;
2. capability and availability checks before proposing or executing;
3. Home Assistant identity and permissions remain authoritative;
4. explicit policy for automatic behavior;
5. correlation/request IDs and idempotency where appropriate;
6. bounded timeouts and safe fallbacks;
7. auditable reasons and results;
8. no browser dependency for critical operation.

This foundation supplies the boundaries needed to apply those rules without
pretending that the policy and execution engines already exist.
