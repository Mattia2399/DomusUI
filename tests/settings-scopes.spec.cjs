const { test, expect } = require('@playwright/test');
const { connectHomeAssistant } = require('./support/fakeHomeAssistant.cjs');
const { accessSelfFor } = require('./support/accessSelf.cjs');

// Settings is organized by who a setting belongs to: the house (Home and
// System groups) or this device; the Profile is the person. See
// docs/settings-scopes.md.

function installCompletedRealWorkspace(page) {
  return page.addInitScript(() => {
    // Only on the first load: a reload must keep what the test changed.
    if (sessionStorage.getItem('settings-scopes.seeded')) return;
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('settings-scopes.seeded', '1');
    localStorage.setItem(
      'ha.dashboard.setupJourney.v2',
      JSON.stringify({ version: 2, phase: 'done', mode: 'real', updatedAt: Date.now() }),
    );
    localStorage.setItem('ha.dashboard.runtimeMode.v1', 'real');
    localStorage.setItem('ha.dashboard.onboarding.welcome.v1', 'done');
    localStorage.setItem('ha.dashboard.onboarding.context.v1', 'done');
    localStorage.setItem('ha.dashboard.theme', 'light');
    localStorage.setItem('domusui.language.v1', 'it');
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installCompletedRealWorkspace(page);
  let climateConfig = null;
  let climateRevision = 0;
  let climateStateRevision = 0;
  let climateIntent = { house: { operatingMode: 'off', controlMode: 'manual' }, zones: {} };
  let climateOverrides = {};
  const houseClock = { instant: '2026-01-05T17:00:00Z', timezone: 'Europe/Rome' };
  page.climateClock = houseClock;
  page.climateHome = await connectHomeAssistant(page, {
    states: { 'sensor.living_temp': { state: '21', attributes: { device_class: 'temperature', unit_of_measurement: '°C', friendly_name: 'Temperatura soggiorno' } },
      'climate.ac': { state: 'cool', attributes: { friendly_name: 'Split', hvac_modes: ['heat', 'cool', 'off'], supported_features: 1, temperature_unit: '°C', temperature: 26, current_temperature: 27, min_temp: 16, max_temp: 30, target_temp_step: 0.5 } } },
    handle: (message, { reply, fail }) => {
      if (message.type === 'domusos/climate/get_config') {
        reply({ state: climateConfig ? 'ready' : 'absent', revision: climateRevision, config: climateConfig });
        return true;
      }
      if (message.type === 'domusos/climate/save_config') {
        if (message.expected_revision !== climateRevision) fail('conflict', 'Revision changed');
        else { climateConfig = message.config; climateRevision += 1; reply({ state: 'ready', revision: climateRevision, config: climateConfig }); }
        return true;
      }
      if (['domusos/climate/get_state', 'domusos/climate/set_house_intent', 'domusos/climate/set_zone_intent', 'domusos/climate/set_zone_override', 'domusos/climate/clear_zone_override'].includes(message.type)) {
        if (message.type !== 'domusos/climate/get_state') {
          if (message.expected_revision !== climateStateRevision) { fail('conflict', 'Revision changed'); return true; }
          if (message.type === 'domusos/climate/set_house_intent') {
            climateIntent.house = { operatingMode: message.operating_mode, controlMode: message.control_mode };
            if (message.control_mode === 'manual') climateOverrides = {};
          } else if (message.type === 'domusos/climate/set_zone_intent') climateIntent.zones[message.zone_id] = { mode: message.mode, targetTemperature: message.target_temperature };
          else if (message.type === 'domusos/climate/set_zone_override') {
            const expiresAt = message.expiry_mode === 'next_schedule_event' ? '2026-01-05T22:30:00+00:00' : new Date(Date.parse(houseClock.instant) + (message.duration_minutes ?? 60) * 60_000).toISOString();
            climateOverrides[message.zone_id] = { id: 'a'.repeat(32), zoneId: message.zone_id, targetTemperature: message.target_temperature,
              createdAt: houseClock.instant, expiresAt, expiryMode: message.expiry_mode, expiresAtLocalTime: message.expiry_mode === 'next_schedule_event' ? '23:30' : '19:00', expiresAtLocalDate: '05/01' };
          } else delete climateOverrides[message.zone_id];
          climateStateRevision += 1;
        }
        const houseNow = new Date(houseClock.instant);
        for (const [zoneId, item] of Object.entries(climateOverrides)) if (Date.parse(item.expiresAt) <= houseNow.getTime()) { delete climateOverrides[zoneId]; climateStateRevision += 1; }
        const localDay = new Intl.DateTimeFormat('en-US', { timeZone: houseClock.timezone, weekday: 'long' }).format(houseNow).toLowerCase();
        const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: houseClock.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(houseNow);
        const events = [...(climateConfig?.schedules.find((day) => day.day === localDay)?.events ?? [])].sort((a, b) => a.time.localeCompare(b.time));
        const activeEvent = events.filter((event) => event.time <= localTime).at(-1) ?? null;
        const nextEvent = events.find((event) => event.time > localTime) ?? null;
        const activeProfile = climateConfig?.profiles.find((profile) => profile.id === activeEvent?.profileId);
        const followingProfile = climateConfig?.profiles.find((profile) => profile.id === nextEvent?.profileId);
        const autoResolution = climateIntent.house.controlMode === 'auto' ? activeProfile ? {
          status: 'resolved', activeProfileId: activeProfile.id, activeProfileName: activeProfile.name,
          activeEvent: { ...activeEvent, day: localDay },
          nextEvent: nextEvent ? { ...nextEvent, day: localDay, profileName: followingProfile?.name ?? null, occursAt: '2026-01-05T22:30:00+00:00' } : null,
          zoneTargets: Object.fromEntries((climateConfig?.zones ?? []).map((zone) => [zone.id, activeProfile.zoneTargets[zone.id] == null ? { status: 'no_target', value: null } : { status: 'resolved', value: activeProfile.zoneTargets[zone.id] }])),
        } : { status: 'no_schedule', activeProfileId: null, activeProfileName: null, activeEvent: null, nextEvent: null, zoneTargets: {} } : null;
        const zones = (climateConfig?.zones ?? []).map((zone) => {
          const intent = climateIntent.zones[zone.id] ?? { mode: 'follow_house', targetTemperature: null };
          const override = climateIntent.house.controlMode === 'auto' ? climateOverrides[zone.id] ?? null : null;
          const scheduledTarget = autoResolution?.zoneTargets[zone.id]?.value ?? null;
          const effectiveTarget = climateIntent.house.controlMode === 'manual' ? intent.targetTemperature : override?.targetTemperature ?? scheduledTarget;
          const thermalStatus = climateIntent.house.operatingMode === 'off' || intent.mode === 'off' ? 'off' : effectiveTarget === null ? 'unknown' : climateIntent.house.operatingMode === 'heating' && 21 < effectiveTarget - 0.2 ? 'needs_heating' : climateIntent.house.operatingMode === 'cooling' && 21 > effectiveTarget + 0.2 ? 'needs_cooling' : 'satisfied';
          return { zoneId: zone.id, intent, override, observed: { temperature: 21, humidity: null, temperatureSource: 'sensor.living_temp', humiditySource: null, temperatureAvailability: 'available', humidityAvailability: 'unavailable' }, derived: { effectiveTarget, scheduledTarget, targetSource: effectiveTarget === null ? null : climateIntent.house.controlMode === 'manual' ? 'manual' : override ? 'override' : 'schedule', targetReason: effectiveTarget === null ? autoResolution?.status === 'resolved' ? 'no_target' : 'no_schedule' : null, autoPendingConfiguration: climateIntent.house.controlMode === 'auto' && effectiveTarget === null, thermalStatus, terminals: [], compatiblePaths: [] } };
        });
        const scenario = page.climateExecutionScenario;
        const eligibleScenarios = ['eligible', 'golden', 'observe_only', 'stale_sensor'];
        const executionPlan = scenario && zones[0] ? {
          planId: `preview-${scenario}`, zoneId: zones[0].zoneId,
          status: eligibleScenarios.includes(scenario) || scenario === 'noop' ? scenario === 'noop' ? 'noop' : 'eligible' : 'blocked',
          endpointId: eligibleScenarios.includes(scenario) || scenario === 'noop' ? 'ac' : null,
          entityId: eligibleScenarios.includes(scenario) || scenario === 'noop' ? 'climate.ac' : null,
          controlKind: eligibleScenarios.includes(scenario) || scenario === 'noop' ? 'supervisory' : null,
          desired: eligibleScenarios.includes(scenario) || scenario === 'noop' ? { hvacMode: 'cool', requestedTargetCelsius: 24, requestedTarget: 24, targetTemperature: 24, temperatureUnit: '°C', normalization: null, targetStep: 0.5 } : null,
          observed: eligibleScenarios.includes(scenario) || scenario === 'noop' ? { hvacMode: 'cool', targetTemperature: scenario === 'noop' ? 24 : 26, currentTemperature: 27, available: true, temperatureUnit: '°C' } : null,
          diff: eligibleScenarios.includes(scenario) || scenario === 'noop' ? { hvacModeChanged: false, targetChanged: scenario !== 'noop' } : null,
          actions: eligibleScenarios.includes(scenario) ? [{ kind: 'set_temperature', entityId: 'climate.ac', value: 24, temperatureUnit: '°C', expected: { targetTemperature: 24 } }] : [],
          sensor: { status: scenario === 'invalid_sensor' ? 'sensor_invalid' : 'valid', valueCelsius: scenario === 'invalid_sensor' ? null : 27, source: 'sensor.living_temp', unit: '°C', freshness: scenario === 'stale_sensor' ? 'stale' : scenario === 'golden' || scenario === 'observe_only' ? 'verified' : 'unknown', lastUpdated: houseNow.toISOString() },
          reasons: scenario === 'ambiguous' ? ['delivery_strategy_required'] : scenario === 'invalid_sensor' ? ['sensor_invalid'] : [],
          planSafe: eligibleScenarios.includes(scenario) || scenario === 'noop', physicalExecutionAllowed: false,
          physicalBlockers: scenario === 'golden' ? ['linux_ha_validation_required'] : scenario === 'observe_only' ? ['endpoint_not_owned', 'linux_ha_validation_required'] : scenario === 'stale_sensor' ? ['sensor_stale', 'linux_ha_validation_required'] : ['sensor_freshness_unknown', 'linux_ha_validation_required'],
          configRevision: climateRevision, stateRevision: climateStateRevision, inputFingerprint: `fixture-${scenario}`,
          evaluatedAt: houseNow.toISOString(), validUntil: null,
        } : null;
        const snapshot = { state: climateStateRevision ? 'ready' : 'absent', revision: climateStateRevision, configState: climateConfig ? 'ready' : 'absent', configRevision: climateRevision, preview: climateConfig ? { house: climateIntent.house, autoResolution, zones, deadbandCelsius: 0.2 } : null,
          executionPreview: executionPlan ? { plans: [executionPlan], configRevision: climateRevision, stateRevision: climateStateRevision, evaluatedAt: houseNow.toISOString() } : null };
        page.climateLastState = snapshot;
        reply(snapshot);
        return true;
      }
      return false;
    },
  });
});

test('Settings groups the house, its system and this device, each with its scope', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Impostazioni', exact: true })).toBeVisible();
  for (const [group, description] of [
    ['Casa', 'Impostazioni condivise da tutta la casa'],
    ['Sistema', 'Connessione e configurazione di Domus'],
    ['Questo dispositivo', 'Preferenze valide solo su questo dispositivo'],
  ]) {
    const region = page.getByRole('region', { name: group, exact: true });
    await expect(region).toBeVisible();
    await expect(region.getByText(description)).toBeVisible();
  }
});

test('Settings, Home: waste collection opens and Back returns to Settings', async ({ page }) => {
  await page.goto('/settings');

  await page.getByRole('region', { name: 'Casa', exact: true }).getByRole('button', { name: /^Raccolta rifiuti/ }).click();
  await expect(page).toHaveURL(/\/settings\/home\/waste-collection$/);
  await expect(page.getByRole('heading', { name: 'Raccolta rifiuti', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('region', { name: 'Casa', exact: true })).toBeVisible();
});

test('Settings, Home: Climate opens its lazy shell and Back returns to Settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('region', { name: 'Casa', exact: true }).getByRole('button', { name: /^Clima/ }).click();
  await expect(page).toHaveURL(/\/settings\/climate$/);
  await expect(page.getByRole('heading', { name: 'Clima', exact: true })).toBeVisible();
  await expect(page.getByText('Clima non ancora configurato')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Esplora l’anteprima' }).click();
  await expect(page.getByText('Anteprima dimostrativa · dati fittizi')).toBeVisible();
  await page.getByRole('button', { name: 'Apri Camera', exact: true }).click();
  await expect(page.getByText('Questa è la temperatura che Domus userà per decidere per la zona.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Riscaldamento', exact: true }).selectOption('living-trv');
  await expect(page.getByRole('combobox', { name: 'Riscaldamento', exact: true })).toHaveValue('living-trv');
  await page.getByRole('button', { name: 'Fino a…' }).click();
  await page.getByRole('textbox', { name: 'Fino a…' }).fill('21:30');
  await expect(page.getByText('Override fino alle 21:30')).toBeVisible();
  await page.getByRole('button', { name: 'Chiudi' }).click();
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('Climate preview stays usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings/climate');
  await expect(page.getByText('Clima non ancora configurato')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Esplora l’anteprima' }).click();
  await expect(page.getByText('Anteprima dimostrativa · dati fittizi')).toBeVisible();
  await page.getByRole('navigation', { name: 'DOMUS CLIMATE' }).getByRole('button', { name: 'Zone' }).click();
  await expect(page.locator('button.dv-climate')).toHaveCount(5);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('navigation', { name: 'DOMUS CLIMATE' }).getByRole('button', { name: 'Programmi' }).click();
  await expect(page.getByText('Programma settimanale')).toBeVisible();
  await page.getByRole('navigation', { name: 'DOMUS CLIMATE' }).getByRole('button', { name: 'Impianto' }).click();
  await expect(page.getByText('Circuito radiatori').first()).toBeVisible();
});

test('Climate setup saves a real HOUSE zone and loads it again', async ({ page }) => {
  await page.goto('/settings/climate');
  await expect(page.getByText('Clima non ancora configurato')).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Configura Domus Climate' }).click();
  await page.getByRole('button', { name: 'Aggiungi zona' }).click();
  await page.getByRole('textbox', { name: 'Nome zona', exact: true }).fill('Soggiorno');
  await page.getByRole('combobox', { name: 'Sensore principale' }).selectOption('sensor.living_temp');
  await page.getByRole('button', { name: 'Salva configurazione' }).click();
  await expect(page.getByRole('heading', { name: 'Impianto climatico configurato' })).toBeVisible();
  await expect(page.getByText('Soggiorno', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Soggiorno', { exact: true }).last().locator('xpath=ancestor::article')).toHaveClass(/dv-climate/);
  await expect(page.locator('[data-climate-preview="demo"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Soggiorno', { exact: true }).last()).toBeVisible();
});

test('Climate intent controls update the live runtime preview without a device service call', async ({ page }) => {
  await page.goto('/settings/climate');
  await page.getByRole('button', { name: 'Configura Domus Climate' }).click();
  await page.getByRole('button', { name: 'Aggiungi zona' }).click();
  await page.getByRole('textbox', { name: 'Nome zona', exact: true }).fill('Soggiorno');
  await page.getByRole('combobox', { name: 'Sensore principale' }).selectOption('sensor.living_temp');
  await page.getByRole('button', { name: 'Salva configurazione' }).click();
  const runtime = page.locator('[data-climate-runtime="true"]');
  await expect(runtime.getByRole('heading', { name: 'Intent e stato Climate' })).toBeVisible();
  await runtime.getByRole('combobox', { name: 'Modalità casa' }).selectOption('heating');
  await runtime.getByRole('spinbutton', { name: 'Target ambiente' }).fill('22');
  await runtime.getByRole('button', { name: 'Applica' }).click();
  await expect(runtime.getByText('Richiede riscaldamento')).toBeVisible();
  expect(page.climateHome.messages.filter((message) => message.type === 'call_service')).toHaveLength(0);
});

test('Climate supervisory preview shows eligible, noop and blocked cases without device commands', async ({ page }) => {
  await page.goto('/settings/climate');
  await page.getByRole('button', { name: 'Configura Domus Climate' }).click();
  await page.getByRole('button', { name: 'Aggiungi zona' }).click();
  await page.getByRole('textbox', { name: 'Nome zona', exact: true }).fill('Camera');
  await page.getByRole('combobox', { name: 'Sensore principale' }).selectOption('sensor.living_temp');
  await page.getByRole('button', { name: 'Salva configurazione' }).click();
  const runtime = page.locator('[data-climate-runtime="true"]');
  const inspector = runtime.locator('[data-climate-execution-preview="true"]');
  for (const [scenario, expected] of [
    ['eligible', 'Piano simbolico disponibile'],
    ['noop', 'Stato già allineato'],
    ['ambiguous', 'Più sistemi compatibili per questa zona.'],
    ['invalid_sensor', 'Temperatura ambiente non disponibile.'],
  ]) {
    page.climateExecutionScenario = scenario;
    await runtime.getByRole('button', { name: 'Ricarica' }).click();
    await expect(inspector.getByText(expected)).toBeVisible();
    expect(page.climateLastState.executionPreview.plans[0].status).toBe(scenario === 'ambiguous' || scenario === 'invalid_sensor' ? 'blocked' : scenario);
    expect(page.climateLastState.executionPreview.plans[0].actions).toHaveLength(scenario === 'eligible' ? 1 : 0);
    expect(page.climateLastState.executionPreview.plans[0].physicalExecutionAllowed).toBe(false);
  }
  expect(page.climateHome.messages.filter((message) => message.type === 'call_service')).toHaveLength(0);
});

test('Climate safety preview distinguishes Linux, ownership and stale sensor gates without service calls', async ({ page }) => {
  await page.goto('/settings/climate');
  await page.getByRole('button', { name: 'Configura Domus Climate' }).click();
  await page.getByRole('button', { name: 'Aggiungi zona' }).click();
  await page.getByRole('textbox', { name: 'Nome zona', exact: true }).fill('Camera');
  await page.getByRole('combobox', { name: 'Sensore principale' }).selectOption('sensor.living_temp');
  await page.getByRole('combobox', { name: 'Freschezza del sensore' }).selectOption('max_age');
  await page.getByRole('button', { name: '2. Dispositivi e ruoli' }).click();
  await page.getByRole('button', { name: 'Aggiungi dispositivo' }).click();
  await page.getByRole('textbox', { name: 'Nome dispositivo' }).fill('Split');
  await page.getByRole('combobox', { name: 'Entità HA' }).selectOption('climate.ac');
  await page.getByRole('combobox', { name: 'Controllo da Domus' }).selectOption('domus_supervised');
  await page.getByRole('button', { name: 'Salva configurazione' }).click();
  const savedConfig = page.climateHome.messages.find((message) => message.type === 'domusos/climate/save_config');
  expect(savedConfig.config.endpoints[0].executionOwnership).toBe('domus_supervised');
  expect(savedConfig.config.zones[0].reference).toMatchObject({ freshnessPolicy: 'max_age', maxAgeSeconds: 300 });
  const runtime = page.locator('[data-climate-runtime="true"]');
  const inspector = runtime.locator('[data-climate-execution-preview="true"]');
  for (const [scenario, label] of [
    ['golden', 'Piano supervisore pronto. Validazione Home Assistant richiesta.'],
    ['observe_only', 'Dispositivo configurato per il solo monitoraggio.'],
    ['stale_sensor', 'Campione del sensore oltre l’età massima configurata.'],
  ]) {
    page.climateExecutionScenario = scenario;
    await runtime.getByRole('button', { name: 'Ricarica' }).click();
    await expect(inspector.getByText(label)).toBeVisible();
    expect(page.climateLastState.executionPreview.plans[0].physicalExecutionAllowed).toBe(false);
    expect(page.climateLastState.executionPreview.plans[0].actions).toHaveLength(1);
  }
  expect(page.climateHome.messages.filter((message) => message.type === 'call_service')).toHaveLength(0);
});

test('Climate profiles and weekly events persist after save and reload without changing runtime intent', async ({ page }) => {
  await page.goto('/settings/climate');
  await page.getByRole('button', { name: 'Configura Domus Climate' }).click();
  await page.getByRole('button', { name: 'Aggiungi zona' }).click();
  await page.getByRole('textbox', { name: 'Nome zona', exact: true }).fill('Soggiorno');
  await page.getByRole('combobox', { name: 'Sensore principale' }).selectOption('sensor.living_temp');
  await page.getByRole('button', { name: 'Salva configurazione' }).click();
  await page.getByRole('navigation', { name: 'DOMUS CLIMATE' }).getByRole('button', { name: 'Programmi' }).click();
  const programs = page.locator('[data-climate-programs="true"]');
  await expect(programs.getByText('Crea il tuo primo profilo')).toBeVisible();
  await programs.getByRole('textbox', { name: 'Nome nuovo profilo' }).fill('Comfort');
  await programs.getByRole('button', { name: 'Crea profilo' }).click();
  await programs.getByRole('textbox', { name: 'Nome profilo', exact: true }).fill('Comfort casa');
  await programs.getByRole('spinbutton', { name: 'Soggiorno' }).fill('21');
  await programs.getByRole('button', { name: 'Aggiungi fascia' }).click();
  await expect(programs.getByText('06:30', { exact: true })).toBeVisible();
  await programs.getByRole('button', { name: 'Salva programmazione' }).click();
  await page.reload();
  await page.getByRole('navigation', { name: 'DOMUS CLIMATE' }).getByRole('button', { name: 'Programmi' }).click();
  await expect(programs.getByRole('textbox', { name: 'Nome profilo', exact: true })).toHaveValue('Comfort casa');
  await expect(programs.getByRole('spinbutton', { name: 'Soggiorno' })).toHaveValue('21');
  await expect(programs.getByText('06:30', { exact: true })).toBeVisible();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  expect(page.climateHome.messages.filter((message) => /set_(?:house|zone)_intent|call_service/.test(message.type))).toHaveLength(0);
});

test('Climate AUTO resolves the schedule, temporary override and expiry without device commands', async ({ page }) => {
  await page.goto('/settings/climate');
  await page.getByRole('button', { name: 'Configura Domus Climate' }).click();
  await page.getByRole('button', { name: 'Aggiungi zona' }).click();
  await page.getByRole('textbox', { name: 'Nome zona', exact: true }).fill('Soggiorno');
  await page.getByRole('combobox', { name: 'Sensore principale' }).selectOption('sensor.living_temp');
  await page.getByRole('button', { name: 'Salva configurazione' }).click();
  const navigation = page.getByRole('navigation', { name: 'DOMUS CLIMATE' });
  await navigation.getByRole('button', { name: 'Programmi' }).click();
  const programs = page.locator('[data-climate-programs="true"]');
  await programs.getByRole('textbox', { name: 'Nome nuovo profilo' }).fill('Comfort');
  await programs.getByRole('button', { name: 'Crea profilo' }).click();
  await programs.getByRole('spinbutton', { name: 'Soggiorno' }).fill('23');
  await programs.getByRole('textbox', { name: 'Nome nuovo profilo' }).fill('Notte');
  await programs.getByRole('button', { name: 'Crea profilo' }).click();
  await programs.getByRole('spinbutton', { name: 'Soggiorno' }).fill('18');
  await programs.getByLabel('Ora', { exact: true }).fill('17:00');
  await programs.getByRole('combobox', { name: 'Profilo' }).selectOption({ label: 'Comfort' });
  await programs.getByRole('button', { name: 'Aggiungi fascia' }).click();
  await programs.getByLabel('Ora', { exact: true }).fill('23:30');
  await programs.getByRole('combobox', { name: 'Profilo' }).selectOption({ label: 'Notte' });
  await programs.getByRole('button', { name: 'Aggiungi fascia' }).click();
  await programs.getByRole('button', { name: 'Salva programmazione' }).click();
  await navigation.getByRole('button', { name: 'Panoramica' }).click();
  const runtime = page.locator('[data-climate-runtime="true"]');
  await runtime.getByRole('combobox', { name: 'Modalità casa' }).selectOption('heating');
  await runtime.getByRole('spinbutton', { name: 'Target ambiente' }).fill('20');
  await runtime.getByRole('button', { name: 'Applica', exact: true }).click();
  await expect(runtime.getByText('20.0°', { exact: true })).toBeVisible();
  const assertDecision = (revision, source, target, thermalStatus) => {
    expect(page.climateLastState.revision).toBe(revision);
    expect(page.climateLastState.preview.zones[0].derived).toMatchObject({ effectiveTarget: target, targetSource: source, thermalStatus });
  };
  assertDecision(2, 'manual', 20, 'satisfied');
  await runtime.getByRole('combobox', { name: 'Controllo' }).selectOption('auto');
  await expect(runtime.getByText('Profilo attivo: Comfort')).toBeVisible();
  await expect(runtime.getByText('Prossimo cambio: 23:30 · Notte')).toBeVisible();
  await expect(runtime.getByText('23.0°', { exact: true })).toBeVisible();
  await expect(runtime.getByText('Da programma')).toBeVisible();
  assertDecision(3, 'schedule', 23, 'needs_heating');
  await page.reload();
  await expect(page.locator('[data-climate-runtime="true"]').getByText('Profilo attivo: Comfort')).toBeVisible();
  const liveRuntime = page.locator('[data-climate-runtime="true"]');
  await liveRuntime.getByRole('spinbutton', { name: 'Target ambiente' }).fill('22');
  await expect(liveRuntime.getByRole('combobox', { name: 'Scadenza' })).toHaveValue('next_schedule_event');
  await liveRuntime.getByRole('button', { name: 'Applica temporaneamente' }).click();
  await expect(liveRuntime.getByText('Temporaneo · 22.0°')).toBeVisible();
  await expect(liveRuntime.getByText('Programma: Comfort · 23.0°')).toBeVisible();
  await expect(liveRuntime.getByText('Fino al prossimo cambio · 23:30 · 05/01')).toBeVisible();
  assertDecision(4, 'override', 22, 'needs_heating');
  await liveRuntime.getByRole('combobox', { name: 'Modalità casa' }).selectOption('off');
  await expect(liveRuntime.locator('article.dv-climate .dv-climate-top').getByText('Spento', { exact: true })).toBeVisible();
  assertDecision(5, 'override', 22, 'off');
  await liveRuntime.getByRole('combobox', { name: 'Modalità casa' }).selectOption('heating');
  await expect(liveRuntime.locator('article.dv-climate').getByText('Richiede riscaldamento')).toBeVisible();
  assertDecision(6, 'override', 22, 'needs_heating');
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  page.climateClock.instant = '2026-01-05T22:30:00Z';
  await liveRuntime.getByRole('button', { name: 'Ricarica' }).click();
  await expect(liveRuntime.getByText('Profilo attivo: Notte')).toBeVisible();
  await expect(liveRuntime.getByText('18.0°', { exact: true })).toBeVisible();
  await expect(liveRuntime.getByText('Da programma')).toBeVisible();
  await expect(liveRuntime.getByText('Temporaneo · 22.0°')).toHaveCount(0);
  assertDecision(7, 'schedule', 18, 'satisfied');
  await navigation.getByRole('button', { name: 'Programmi' }).click();
  const revisedPrograms = page.locator('[data-climate-programs="true"]');
  await revisedPrograms.getByRole('button', { name: 'Notte' }).click();
  await revisedPrograms.getByRole('spinbutton', { name: 'Soggiorno' }).fill('20');
  await revisedPrograms.getByRole('button', { name: 'Salva programmazione' }).click();
  await navigation.getByRole('button', { name: 'Panoramica' }).click();
  await expect(page.locator('[data-climate-runtime="true"]').getByText('20.0°', { exact: true })).toBeVisible();
  assertDecision(7, 'schedule', 20, 'satisfied');
  await page.locator('[data-climate-runtime="true"]').getByRole('combobox', { name: 'Controllo' }).selectOption('manual');
  await expect(page.locator('[data-climate-runtime="true"]').getByRole('combobox', { name: 'Controllo' })).toHaveValue('manual');
  assertDecision(8, 'manual', 20, 'satisfied');
  expect(page.climateHome.messages.filter((message) => message.type === 'domusos/climate/set_zone_override')).toHaveLength(1);
  expect(page.climateHome.messages.filter((message) => message.type === 'call_service')).toHaveLength(0);
});

test('Settings, System: the connection opens and Back returns to Settings', async ({ page }) => {
  await page.goto('/settings');

  await page.getByRole('region', { name: 'Sistema', exact: true }).getByRole('button', { name: /^Connessioni/ }).click();
  await expect(page).toHaveURL(/\/settings\/connections$/);
  await expect(page.getByRole('heading', { name: 'Connessioni', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('Profile: My devices opens and Back returns to the Profile', async ({ page }) => {
  await page.goto('/settings/profile');

  await page.getByRole('button', { name: /I miei dispositivi/ }).click();
  await expect(page).toHaveURL(/\/settings\/profile\/devices$/);
  await expect(page.getByRole('heading', { name: 'I miei dispositivi', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole('button', { name: /Informazioni personali/ })).toBeVisible();
});

test('Profile and Settings are one page, opened by the avatar and the gear', async ({ page }) => {
  await page.goto('/home');

  await page.getByRole('button', { name: /Apri profilo/ }).click();
  await expect(page).toHaveURL(/\/settings$/);
  const profile = page.getByRole('region', { name: 'Profilo', exact: true });
  await expect(profile).toBeVisible();
  // My devices is one tap away from the top of Settings.
  await profile.getByRole('button', { name: /I miei dispositivi/ }).click();
  await expect(page).toHaveURL(/\/settings\/profile\/devices$/);

  await page.goto('/profile/devices');
  await expect(page).toHaveURL(/\/settings\/profile\/devices$/);
  await expect(page.getByRole('heading', { name: 'I miei dispositivi', exact: true })).toBeVisible();
});

test('Opening and leaving the Profile never shows another Settings page', async ({ page }) => {
  // Records whether the System page title appears at any moment, even for one frame.
  await page.addInitScript(() => {
    window.__systemPageSeen = false;
    // Every added node is checked, so a page replaced in the same task is still seen.
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.textContent?.includes('Stato del sistema')) window.__systemPageSeen = true;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/settings');

  await page.getByRole('region', { name: 'Profilo', exact: true }).getByRole('button').first().click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole('button', { name: /Informazioni personali/ })).toBeVisible();

  // Back from the Profile to Settings, then My devices from the top of Settings.
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('region', { name: 'Casa', exact: true })).toBeVisible();
  await page.getByRole('region', { name: 'Profilo', exact: true }).getByRole('button', { name: /I miei dispositivi/ }).click();
  await expect(page).toHaveURL(/\/settings\/profile\/devices$/);
  await expect(page.getByRole('heading', { name: 'I miei dispositivi', exact: true })).toBeVisible();
  // Checked before any reload, which would reset the record.
  expect(await page.evaluate(() => window.__systemPageSeen)).toBe(false);
});

test('This device: theme and language stay in this browser, as before', async ({ page }) => {
  await page.goto('/settings');

  const device = page.getByRole('region', { name: 'Questo dispositivo', exact: true });
  await device.getByRole('button', { name: /^Aspetto/ }).click();
  await expect(page).toHaveURL(/\/settings\/device\/appearance$/);
  await page.getByRole('radio', { name: 'Scuro' }).click();
  await expect(page.locator('html')).toHaveClass(/dashboard-theme-dark/);
  expect(await page.evaluate(() => localStorage.getItem('ha.dashboard.theme'))).toBe('dark');
  await page.getByRole('button', { name: /Ocean Mist/ }).click();
  expect(await page.evaluate(() => localStorage.getItem('ha.dashboard.background'))).toBe('ocean-mist');

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await device.getByRole('button', { name: /^Lingua/ }).click();
  await expect(page).toHaveURL(/\/settings\/device\/language$/);
  await page.getByRole('button', { name: /English/ }).click();
  await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('domusui.language.v1'))).toBe('en');

  // Saved on this device: still there after a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dashboard-theme-dark/);
});

test('Old Profile addresses open This device without adding history', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Impostazioni', exact: true })).toBeVisible();

  await page.goto('/profile/themes');
  await expect(page).toHaveURL(/\/settings\/device\/appearance$/);
  await expect(page.getByRole('heading', { name: 'Aspetto', exact: true })).toBeVisible();

  // The old address was replaced: Back leads to the page before it, not to a redirect loop.
  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto('/profile/language');
  await expect(page).toHaveURL(/\/settings\/device\/language$/);
  await expect(page.getByRole('heading', { name: 'Lingua', exact: true })).toBeVisible();
});

const HA = 'http://homeassistant.local:8123';

// A Home Assistant that only knows its Owner: enough for the house entries an
// administrator sees.
async function simulateOwnerHomeAssistant(page) {
  let climateConfig = null;
  let climateRevision = 0;
  await page.routeWebSocket(`${HA.replace('http', 'ws')}/api/websocket`, (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: '2026.2.3' }));
    ws.onMessage((raw) => {
      for (const message of [JSON.parse(raw)].flat()) {
        const reply = (result) => ws.send(JSON.stringify({ id: message.id, type: 'result', success: true, result }));
        if (message.type === 'auth') {
          ws.send(JSON.stringify({ type: 'auth_ok', ha_version: '2026.2.3' }));
        } else if (message.type === 'subscribe_entities') {
          reply(null);
          const now = Date.now() / 1000;
          ws.send(JSON.stringify({ id: message.id, type: 'event', event: { a: { 'sensor.living_temp': { s: '21', a: { device_class: 'temperature', unit_of_measurement: '°C', friendly_name: 'Temperatura soggiorno' }, c: 'ctx', lc: now, lu: now } } } }));
        } else if (message.type === 'domusos/access/get_self') {
          reply(accessSelfFor({ id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] }));
        } else if (message.type === 'domusos/climate/get_config') {
          reply({ state: climateConfig ? 'ready' : 'absent', revision: climateRevision, config: climateConfig });
        } else if (message.type === 'domusos/climate/save_config') {
          if (message.expected_revision !== climateRevision) {
            ws.send(JSON.stringify({ id: message.id, type: 'result', success: false, error: { code: 'conflict', message: 'Revision changed' } }));
          } else {
            climateConfig = message.config;
            climateRevision += 1;
            reply({ state: 'ready', revision: climateRevision, config: climateConfig });
          }
        } else if (message.type === 'auth/current_user') {
          reply({ id: 'owner', name: 'Owner', is_owner: true, is_admin: true, credentials: [], mfa_modules: [] });
        } else if (message.type === 'config/entity_registry/list_for_display') {
          reply({ entity_categories: {}, entities: [] });
        } else if (message.type === 'config/area_registry/list') {
          reply([{ area_id: 'living', name: 'Soggiorno' }]);
        } else if (String(message.type).endsWith('_registry/list')) {
          reply([]);
        } else {
          reply(message.type === 'get_services' ? {} : null);
        }
      }
    });
  });
  await page.addInitScript((hassUrl) => {
    localStorage.setItem('hass_auth_tokens', JSON.stringify({
      hassUrl, clientId: location.origin, expires: Date.now() + 3_600_000, refresh_token: 'refresh', access_token: 'access', expires_in: 3600,
    }));
  }, HA);
}

test('An administrator finds only core configuration in Settings', async ({ page }) => {
  await simulateOwnerHomeAssistant(page);
  await page.goto('/settings');

  const home = page.getByRole('region', { name: 'Casa', exact: true });
  await expect(home.getByRole('button', { name: /^Persone e accessi/ })).toBeVisible();
  await expect(home.getByRole('button')).toHaveText([
    /^Dashboard/,
    /^Piani e stanze/,
    /^Persone e accessi/,
    /^Sicurezza/,
    /^Raccolta rifiuti/,
  ]);
  // House configuration owned by an app stays inside that app.
  await expect(page.getByRole('button', { name: /Energia/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Irrigazione/ })).toHaveCount(0);
});

test('Energy and Irrigation keep their configuration in their own apps', async ({ page }) => {
  await simulateOwnerHomeAssistant(page);

  await page.goto('/consumi');
  await page.getByRole('button', { name: /^Energia/ }).click();
  await expect(page).toHaveURL(/\/consumi\/energia$/);

  await page.goto('/appgallery');
  await page.getByRole('button', { name: /Irrigazione Smart/ }).click();
  await expect(page).toHaveURL(/\/appgallery\/irrigation$/);
  await page.getByTestId('app-workspace-sidebar').getByRole('button', { name: 'Impostazioni' }).click();
  await expect(page).toHaveURL(/\/appgallery\/irrigation\/settings$/);
  await expect(page.getByRole('heading', { name: 'Impostazioni irrigazione' })).toBeVisible();
});
