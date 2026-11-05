# Domus Climate UX preview

This branch builds a presentation layer on `feature/domus-climate-foundation` (`367e8981c9c813ebcbee6e71ec5faaf337fda51d`). `/settings/climate` remains a HOUSE Settings page guarded by `house.manage` in the frontend. No backend, storage, Access Control policy, Home Assistant entity command or scheduler is added.

## What opens

With no climate configuration store, the default page is an honest setup state: a five-step journey (zones, devices, radiator circuit, reference sensors, schedule) and examples of section-level empty states. **Explore preview** opens an explicitly labeled demo. All choices within it live in React state and are discarded when the preview is closed or the page reloads. The fixture is `src/pages/climate/climatePreviewData.ts`; its `DEMO_CLIMATE_SYSTEM` conforms to the foundation contract and uses only `demo_*` entity identifiers. It is never mixed with real Home Assistant state. The nearby `climateCopy.ts` keeps IT, EN and FR copy in the lazy page bundle.

The preview navigation has Overview, Zones, Schedules and Plant. Overview separates house control mode (Automatic / Manual) from season (Heating / Cooling / Off) and emphasizes room zones. The reusable `ClimateZoneCard` shows room reading, room target, source, profile/status and next event. The responsive zone detail shows reference temperature, mapping by role, zone-only manual mode and temporary override choices. Preview controls illustrate the UX; they have no effect on devices or stored configuration.

Schedules are edited as weekday/weekend time blocks with named profiles in a local draft. The profile list can add a sample profile locally. The plant view shows zone → valve → demand → corridor controller → generator, a radiator/AC source choice and boiler/thermostove cards. Automatic source options are visibly unavailable. The thermostove groups its secondary controls under the main device, separates space heating from domestic hot water, and labels 65 °C as a **water setpoint** in its own blue panel, not a room temperature. There is no water setpoint control.

The page uses existing Domus tokens, glass surfaces, segmented controls, buttons, modal behavior and responsive breakpoints. Zone cards specifically reuse the new Home and Rooms climate tile surface, warm/cool gradients, coloured icon circle and large temperature hierarchy from `devices.css`; they do not use the physical device action component. Cards and buttons have touch-sized targets; all flows work without hover. The zone card takes a presentation view rather than Settings callbacks so it can later be reused in a daily-control surface, including a simplified wall-panel view. Technical entity IDs appear only inside the zone detail disclosure. Reference source, device role mapping and override duration can be explored locally in the zone detail.

## Model gaps to settle in CLM.2

- `ClimateProfile` currently has one `roomTarget`. The requested Comfort example with different targets per zone needs a zone-specific profile target mapping or equivalent resolution rule. The preview demonstrates the layout using each zone's sample target; it does not claim that this can be persisted today.
- `ClimateZone` has no per-zone manual/auto field. Zone-only manual intent may be represented by `ClimateOverride`, but its exact semantics and expiry should be decided before saving.
- Reference fallback order (TRV, AC) and current generator water readings have no runtime contract yet. The preview permits local exploration of reference choices but labels fallback behavior as future, and shows only the configured water **setpoint**, not a fabricated live reading.
- CLM.2 needs a runtime parser, persistent HOUSE storage and backend authorization before any configuration action can become real. CLM.3 onward may connect daily controls and enforce commands.
