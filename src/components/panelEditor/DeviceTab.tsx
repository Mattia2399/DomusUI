import React from 'react';
import { usePanelEditorWords } from '../../i18n/panelEditorTranslations';
import { isMeteredPower, SENSOR_ALERT_THRESHOLDS } from '../devices/model/sensorFamily';
import { useDashboardSecurity } from '../../security/dashboardAccess';
import { resolveCardDataSource } from '../../security/mockSourcePolicy';
import { useSensitiveActionGate } from '../../security/SensitiveActionGate';
import { setWidgetSecrets, setWidgetSecretsRemembered, useWidgetSecrets } from '../../services/widgetSecrets';
import { resolveDeviceTelemetryEntities } from '../../utils/deviceTelemetry';
import { MAX_SENSOR_DISPLAY_PRECISION } from '../../utils/sensorValue';
import type { Widget } from '../../types/dashboardModels';
import { EntityPicker } from '../editor/EntityPicker';
import { FoldRow, useOneOpen } from '../editor/FoldRow';
import { GlassButton } from '../ui/GlassButton';
import { GlassNumberInput } from '../ui/GlassNumberInput';
import { GlassPasswordInput } from '../ui/GlassPasswordInput';
import { GlassSelectMenu } from '../ui/GlassSelectMenu';
import { GlassStepper } from '../ui/GlassStepper';
import { GlassToggleRow } from '../ui/GlassToggleRow';
import { cardEntityIdsOf, fitsRole, pickerEntitiesOf, sameDeviceEntity, type ExtraRole } from './deviceEntities';
import { ExtraEntityRow } from './ExtraEntityRow';
import type { PanelEditorProps } from './panelEditorTypes';

export const ACTIVITY_LIMITS = { entries: { min: 1, max: 30, standard: 6 }, hours: { min: 1, max: 168, standard: 24 } } as const;

const storage = () => (typeof window === 'undefined' ? undefined : window.localStorage);

type DeviceProps = Pick<PanelEditorProps, 'widget' | 'haStates' | 'entityRegistry' | 'areas' | 'entityOptions' | 'haEntityIds' | 'onUpdateWidget'>;
type FoldKey = 'entity' | ExtraRole | 'decimals' | 'meter' | 'entries' | 'hours';

/* What the card commands, chosen by name; what tells more about it; its security; the few options of its kind, in words. */
export function DeviceTab({ widget, haStates, entityRegistry = [], areas = [], entityOptions, haEntityIds = [], onUpdateWidget }: DeviceProps) {
  const words = usePanelEditorWords();
  const fold = useOneOpen<FoldKey>();
  const security = useDashboardSecurity();
  const gate = useSensitiveActionGate();
  const secrets = useWidgetSecrets(widget.id);
  const update = (change: Partial<Widget>) => onUpdateWidget(widget.id, (current) => ({ ...current, ...change }));
  const demoIds = entityOptions?.[widget.kind] ?? [];
  const allIds = React.useMemo(() => [...new Set([...haEntityIds, ...Object.keys(haStates), ...Object.values(entityOptions ?? {}).flat()])], [entityOptions, haEntityIds, haStates]);
  const entities = React.useMemo(() => pickerEntitiesOf(allIds, haStates, entityRegistry, areas), [allIds, areas, entityRegistry, haStates]);
  const nameOf = (entityId: string) => entities.find((entity) => entity.entityId === entityId)?.name ?? entityId;
  const cardIds = new Set(cardEntityIdsOf(widget.kind, allIds, demoIds));
  const own = entities.find((entity) => entity.entityId === widget.entityId);
  const near = { deviceId: own?.deviceId, areaId: own?.areaId };
  const attributes = haStates[widget.entityId]?.rawAttributes ?? {};
  const telemetry = widget.kind === 'lock' ? resolveDeviceTelemetryEntities({ mainEntityId: widget.entityId, haStates, entityRegistry: [...entityRegistry] }) : null;
  const extra = (role: ExtraRole, label: string, chosen: string | undefined, field: keyof Widget, automatic?: string, fallback?: string) => (
    <ExtraEntityRow
      key={role}
      label={label}
      chosen={chosen?.trim() || undefined}
      automatic={automatic}
      fallback={fallback}
      suggested={automatic ? undefined : sameDeviceEntity(role, widget.entityId, haStates, entityRegistry)}
      entities={entities}
      compatible={(entityId) => fitsRole(role, entityId, haStates) && entityId !== widget.entityId}
      near={near}
      nameOf={nameOf}
      open={fold.isOpen(role)}
      onToggle={() => fold.toggle(role)}
      onChange={(entityId) => update({ [field]: entityId } as Partial<Widget>)}
    />
  );
  const fromAttributes = (keys: readonly string[]) => (keys.some((key) => attributes[key] !== undefined && attributes[key] !== null && attributes[key] !== '') ? words('fromAttributes') : undefined);
  const decimals = [{ value: 'auto', label: words('decimalsAuto') }, ...Array.from({ length: MAX_SENSOR_DISPLAY_PRECISION + 1 }, (_, count) => ({ value: String(count), label: words(count === 1 ? 'decimalOne' : 'decimalMany', { n: count }) }))];
  const secured = widget.kind === 'alarm' || widget.kind === 'lock';

  return (
    <div className="panel-editor-tab">
      <section>
        <h4 className="panel-editor-heading">{words('commands')}</h4>
        <FoldRow label={words('entity')} value={nameOf(widget.entityId) || words('none')} open={fold.isOpen('entity')} onToggle={() => fold.toggle('entity')}>
          <EntityPicker
            entities={entities}
            compatible={(entityId) => cardIds.has(entityId)}
            near={near}
            selected={widget.entityId}
            showFilters={false}
            onPick={(entityId) =>
              update({ entityId, dataSource: resolveCardDataSource({ entityId, homeAssistantEntityIds: [...haEntityIds], demoEntityIds: demoIds }) })
            }
          />
        </FoldRow>
      </section>

      {widget.kind === 'sensor' || widget.kind === 'lock' || widget.kind === 'switch' ? (
        <section>
          <h4 className="panel-editor-heading">{words('moreAboutIt')}</h4>
          {widget.kind === 'lock'
            ? [
                extra('battery', words('battery'), widget.lockBatteryEntityId, 'lockBatteryEntityId', telemetry?.batteryEntityId),
                extra('connection', words('connection'), widget.lockConnectionEntityId, 'lockConnectionEntityId', telemetry?.connectionEntityId),
              ]
            : null}
          {widget.kind === 'sensor'
            ? [
                extra('battery', words('battery'), widget.sensorBatteryEntityId, 'sensorBatteryEntityId', undefined, fromAttributes(['battery_level', 'battery'])),
                extra('connection', words('connection'), widget.sensorConnectionEntityId, 'sensorConnectionEntityId', undefined, fromAttributes(['connection_status', 'connected', 'rssi', 'linkquality'])),
                extra('status', words('status'), widget.sensorStatusEntityId, 'sensorStatusEntityId', undefined, fromAttributes(['status', 'state_text'])),
              ]
            : null}
          {widget.kind === 'switch' ? extra('consumption', words('consumption'), widget.switchConsumptionEntityId, 'switchConsumptionEntityId') : null}
        </section>
      ) : null}

      {secured && security.can('manage_security_config') ? (
        <section>
          <h4 className="panel-editor-heading">{words('security')}</h4>
          {!gate.isUnlocked ? (
            <GlassButton
              variant="soft"
              onClick={() => {
                void gate.authorize({ action: 'view_security_codes', capability: 'manage_security_config', title: words('unlockSecurityTitle'), description: words('unlockSecurityNote') });
              }}
            >
              {words('unlockSecurity')}
            </GlassButton>
          ) : (
            <>
              <GlassToggleRow
                checked={(widget.kind === 'alarm' ? widget.alarmRequireAuthToDisarm : widget.lockRequireAuthToUnlock) ?? false}
                onChange={(checked) => update(widget.kind === 'alarm' ? { alarmRequireAuthToDisarm: checked } : { lockRequireAuthToUnlock: checked })}
                title={words('deviceConfirmation')}
                description={widget.kind === 'alarm' ? words('deviceConfirmationAlarm') : words('deviceConfirmationLock')}
              />
              <GlassPasswordInput
                label={widget.kind === 'alarm' ? words('alarmCode') : words('lockCode')}
                value={(widget.kind === 'alarm' ? secrets.values.alarmUnlockCode : secrets.values.lockCode) ?? ''}
                maxLength={24}
                clearLabel={words('clear')}
                showLabel={words('show')}
                hideLabel={words('hide')}
                describeProblem={() => words('codeTooLong')}
                onCommit={(code) => setWidgetSecrets(widget.id, widget.kind === 'alarm' ? { alarmUnlockCode: code } : { lockCode: code }, storage())}
              />
              {widget.kind === 'alarm' ? (
                <GlassPasswordInput
                  label={words('extraCode')}
                  value={secrets.values.alarmLocalExtraCode ?? ''}
                  maxLength={12}
                  clearLabel={words('clear')}
                  showLabel={words('show')}
                  hideLabel={words('hide')}
                  describeProblem={() => words('codeTooLong')}
                  onCommit={(code) => setWidgetSecrets(widget.id, { alarmLocalExtraCode: code }, storage())}
                />
              ) : null}
              <GlassToggleRow checked={secrets.rememberOnDevice} onChange={(remember) => setWidgetSecretsRemembered(widget.id, remember, storage())} title={words('rememberCodes')} description={words('rememberCodesNote')} />
            </>
          )}
        </section>
      ) : null}

      {widget.kind === 'sensor' || secured ? (
        <section>
          <h4 className="panel-editor-heading">{words('options')}</h4>
          {widget.kind === 'sensor' ? (
            <FoldRow
              label={words('decimals')}
              value={typeof widget.sensorDisplayPrecision === 'number' ? decimals[widget.sensorDisplayPrecision + 1]?.label : words('decimalsAuto')}
              open={fold.isOpen('decimals')}
              onToggle={() => fold.toggle('decimals')}
            >
              <GlassSelectMenu<string>
                ariaLabel={words('decimals')}
                options={decimals}
                value={typeof widget.sensorDisplayPrecision === 'number' ? String(widget.sensorDisplayPrecision) : 'auto'}
                onChange={(next) => update({ sensorDisplayPrecision: next === 'auto' ? undefined : Number(next) })}
                size="hero"
              />
            </FoldRow>
          ) : null}
          {widget.kind === 'sensor' && isMeteredPower(attributes.device_class, attributes.unit_of_measurement ?? widget.unit) ? (
            <FoldRow label={words('meter')} value={`${widget.sensorMeterKw ?? SENSOR_ALERT_THRESHOLDS.energy.meterKw} kW`} open={fold.isOpen('meter')} onToggle={() => fold.toggle('meter')}>
              <GlassNumberInput
                label={words('meter')}
                value={widget.sensorMeterKw ?? null}
                min={0.1}
                step={0.1}
                unit="kW"
                hint={words('meterNote', { kw: SENSOR_ALERT_THRESHOLDS.energy.meterKw })}
                describeProblem={() => words('meterProblem')}
                onValueChange={(kw) => update({ sensorMeterKw: kw > 0 ? kw : undefined })}
              />
              {widget.sensorMeterKw !== undefined ? (
                <GlassButton variant="text" onClick={() => update({ sensorMeterKw: undefined })}>
                  {words('backToAutomatic')}
                </GlassButton>
              ) : null}
            </FoldRow>
          ) : null}
          {secured ? (
            <>
              <FoldRow label={words('historyEntries')} value={String(widget.activityLogLimit ?? ACTIVITY_LIMITS.entries.standard)} open={fold.isOpen('entries')} onToggle={() => fold.toggle('entries')}>
                <GlassStepper
                  label={words('historyEntries')}
                  decreaseLabel={words('less')}
                  increaseLabel={words('more')}
                  value={widget.activityLogLimit ?? ACTIVITY_LIMITS.entries.standard}
                  min={ACTIVITY_LIMITS.entries.min}
                  max={ACTIVITY_LIMITS.entries.max}
                  showLimits
                  onValueChange={(entries) => update({ activityLogLimit: entries })}
                />
              </FoldRow>
              <FoldRow label={words('historyHours')} value={words('hours', { n: widget.activityLogHours ?? ACTIVITY_LIMITS.hours.standard })} open={fold.isOpen('hours')} onToggle={() => fold.toggle('hours')}>
                <GlassStepper
                  label={words('historyHours')}
                  decreaseLabel={words('less')}
                  increaseLabel={words('more')}
                  value={widget.activityLogHours ?? ACTIVITY_LIMITS.hours.standard}
                  min={ACTIVITY_LIMITS.hours.min}
                  max={ACTIVITY_LIMITS.hours.max}
                  format={(hours) => words('hours', { n: hours })}
                  showLimits
                  onValueChange={(hours) => update({ activityLogHours: hours })}
                />
              </FoldRow>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default DeviceTab;
