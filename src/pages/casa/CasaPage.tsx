import React from 'react';
import { AlertCircle, Box, Check, Droplets, Flame, LayoutGrid, Plus, Recycle, Rocket, ShieldCheck, Zap } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { useAccessControl } from '../../security/AccessControlProvider';
import { canOpenRoute } from '../../navigation/routeAccess';
import { readSecurityCenterAlarm } from '../../services/securityCenterSelection';
import type { MockEntityStateMap } from '../../types/ha';
import type { DashboardRuntimeMode } from '../../security/dashboardAccess';
import { PageFrame } from '../../components/ui/PageFrame';
import { PageHeader } from '../../components/ui/PageHeader';
import { GlassList } from '../../components/ui/GlassList';
import { GlassListRow, type GlassListTone } from '../../components/ui/GlassListRow';
import { GlassFeatureRow } from '../../components/ui/GlassFeatureRow';
import { GlassSheet } from '../../components/ui/GlassSheet';
import {
  CASA_FUNCTIONS,
  climateStatus,
  collectAttention,
  energyStatus,
  irrigationStatus,
  resolveAlarmEntityId,
  securityStatus,
  wasteStatus,
  type CasaFunctionId,
  type CasaFunctionStatus,
} from './casaModel';
import { useCasaData, type CasaCallApi } from './useCasaData';
import './casa.css';

export type CasaPageProps = {
  runtimeMode: DashboardRuntimeMode;
  haConnected: boolean;
  haStates: MockEntityStateMap;
  onCallApi: CasaCallApi;
  onNavigate: (path: string) => void;
};

const FUNCTION_ICONS: Record<CasaFunctionId, React.ReactNode> = {
  security: <ShieldCheck size={22} strokeWidth={2.1} />,
  climate: <Flame size={22} strokeWidth={2.1} />,
  energy: <Zap size={22} strokeWidth={2.1} />,
  irrigation: <Droplets size={22} strokeWidth={2.1} />,
  waste: <Recycle size={22} strokeWidth={2.1} />,
};

const FUNCTION_TONES: Record<CasaFunctionId, GlassListTone> = {
  security: 'security',
  climate: 'climate',
  energy: 'energy',
  irrigation: 'irrigation',
  waste: 'waste',
};

const UNKNOWN: CasaFunctionStatus = { kind: 'unknown' };

/**
 * Casa: the house at a glance. The invitation to Domus 3D (which does not exist yet: text only),
 * one line of summary, the functions that are set up and that the account may open, "Aggiungi una
 * funzione" when some are not set up, and the tools. Only real data. docs/design/app/casa.html.
 */
export function CasaPage({ haConnected, haStates, onCallApi, onNavigate }: CasaPageProps) {
  const { t, locale } = useI18n();
  const { can } = useAccessControl();
  const allowed = (route: string) => canOpenRoute(route, can);
  const access = {
    climate: allowed('/settings/climate'),
    energy: allowed('/consumi'),
    irrigation: allowed('/appgallery/irrigation'),
    waste: allowed('/settings/home/waste-collection'),
  };
  const core = useCasaData(onCallApi, haConnected, access);
  const [chosenAlarm] = React.useState(readSecurityCenterAlarm);
  const [now] = React.useState(() => new Date());
  const [addOpen, setAddOpen] = React.useState(false);

  const statuses: Record<CasaFunctionId, CasaFunctionStatus> = {
    security: allowed('/security') ? securityStatus(haStates, resolveAlarmEntityId(haStates, chosenAlarm), t) : UNKNOWN,
    climate: access.climate ? climateStatus(core.climate, t) : UNKNOWN,
    energy: access.energy ? energyStatus(core.energy, t, locale) : UNKNOWN,
    irrigation: access.irrigation ? irrigationStatus(core.irrigationConfig, core.irrigationState, t) : UNKNOWN,
    waste: access.waste ? wasteStatus(core.wasteConfig, core.wastePreview, t, locale, now) : UNKNOWN,
  };
  const shown = CASA_FUNCTIONS.filter((fn) => statuses[fn.id].kind === 'ready');
  const addable = CASA_FUNCTIONS.filter((fn) => statuses[fn.id].kind === 'absent' && allowed(fn.setupRoute));
  const attention = collectAttention(shown.map((fn) => statuses[fn.id]));
  const securityReady = statuses.security.kind === 'ready';
  const tools = [
    { id: 'automations', route: '/automations', title: t('casa.tool.automations'), note: t('casa.tool.automationsDetail'), icon: <Rocket size={18} /> },
    { id: 'appgallery', route: '/appgallery', title: t('casa.tool.appGallery'), note: t('casa.tool.appGalleryDetail'), icon: <LayoutGrid size={18} /> },
  ].filter((tool) => allowed(tool.route));

  return (
    <PageFrame className="casa-page">
      <div className="casa-wrap" data-testid="casa-page">
        <PageHeader title={t('casa.title')} detail={t('casa.detail')} />

        {/* Domus 3D does not exist yet: the invitation, with no button that would pretend. */}
        <section className="casa-invite page-glass" aria-label={t('casa.invite.title')}>
          <span className="casa-invite-icon" aria-hidden="true">
            <Box size={24} strokeWidth={2} />
          </span>
          <b>{t('casa.invite.title')}</b>
          <span>{t('casa.invite.text')}</span>
        </section>

        <div className={attention.length ? 'casa-summary page-glass is-warn' : 'casa-summary page-glass'} role="status" data-testid="casa-summary">
          <span className="casa-summary-icon" aria-hidden="true">
            {attention.length ? <AlertCircle size={20} strokeWidth={2.2} /> : <Check size={20} strokeWidth={2.6} />}
          </span>
          <div>
            <b>
              {attention.length === 0
                ? t('casa.summary.ok')
                : attention.length === 1
                  ? t('casa.summary.one')
                  : t('casa.summary.many', { count: attention.length })}
            </b>
            <span>
              {attention.length
                ? attention.slice(0, 3).join(' · ')
                : securityReady
                  ? t('casa.summary.okClosed')
                  : t('casa.summary.okNoAlerts')}
            </span>
          </div>
        </div>

        <section className="casa-section" aria-labelledby="casa-functions-title">
          <div className="glass-list-head">
            <h2 id="casa-functions-title" className="glass-list-title">
              {t('casa.functions.title')}
            </h2>
            <span className="glass-list-detail">
              {shown.length === 0
                ? t('casa.functions.none')
                : shown.length === 1
                  ? t('casa.functions.activeOne')
                  : t('casa.functions.activeMany', { count: shown.length })}
            </span>
          </div>
          <div className="casa-functions">
            {shown.map((fn) => {
              const status = statuses[fn.id];
              return (
                <GlassFeatureRow
                  key={fn.id}
                  title={t(fn.nameKey)}
                  status={status.kind === 'ready' ? status.text : undefined}
                  warn={status.kind === 'ready' && status.warn}
                  icon={FUNCTION_ICONS[fn.id]}
                  tone={FUNCTION_TONES[fn.id]}
                  onPress={() => onNavigate(fn.route)}
                />
              );
            })}
            {addable.length ? (
              <GlassFeatureRow
                variant="add"
                title={t('casa.add.title')}
                status={addable.map((fn) => t(fn.nameKey)).join(', ')}
                icon={<Plus size={22} strokeWidth={2.4} />}
                onPress={() => setAddOpen(true)}
              />
            ) : null}
          </div>
        </section>

        {tools.length ? (
          <GlassList title={t('casa.tools.title')}>
            {tools.map((tool) => (
              <GlassListRow
                key={tool.id}
                title={tool.title}
                note={tool.note}
                icon={tool.icon}
                iconShape="square"
                tone="app"
                opens
                onPress={() => onNavigate(tool.route)}
              />
            ))}
          </GlassList>
        ) : null}
      </div>

      <GlassSheet isOpen={addOpen} onClose={() => setAddOpen(false)} title={t('casa.add.title')} detail={t('casa.add.sheetDetail')}>
        <GlassList ariaLabel={t('casa.add.title')}>
          {addable.map((fn) => (
            <GlassListRow
              key={fn.id}
              title={t(fn.nameKey)}
              icon={FUNCTION_ICONS[fn.id]}
              iconShape="square"
              tone={FUNCTION_TONES[fn.id]}
              opens
              onPress={() => {
                setAddOpen(false);
                onNavigate(fn.setupRoute);
              }}
            />
          ))}
        </GlassList>
      </GlassSheet>
    </PageFrame>
  );
}

export default CasaPage;
