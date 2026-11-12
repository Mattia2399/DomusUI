import React from 'react';
import { ArrowUp, Lock, Minus, Plus, UserRound } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import { useAccessControl } from '../../security/AccessControlProvider';
import { canOpenRoute } from '../../navigation/routeAccess';
import { createDefaultSidebarPaths, getApplicationRoute, type ApplicationRouteId } from '../../navigation/applicationRoutes';
import {
  NAVIGATION_BAR_CANDIDATES,
  PHONE_BAR_MAX,
  resetNavigationBar,
  SIDE_BAR_MAX,
  useNavigationBar,
  writeNavigationBar,
} from '../../navigation/navigationBarPreferences';
import { BottomBarNav } from '../dashboard/BottomBarNav';
import { getDashboardNavigationIcon } from '../dashboard/dashboardNavigation';
import { GlassButton } from '../ui/GlassButton';
import { GlassList } from '../ui/GlassList';
import { GlassListRow, type GlassListTone } from '../ui/GlassListRow';
import { PageFrame } from '../ui/PageFrame';
import { PageHeader } from '../ui/PageHeader';
import './navigationBarSettings.css';

const NAMES: Record<ApplicationRouteId, TranslationKey> = {
  home: 'navigation.dashboard',
  rooms: 'navigation.rooms',
  casa: 'navigation.casa',
  security: 'navigation.security',
  consumi: 'navigation.consumption',
  automation: 'navigation.automations',
  appgallery: 'navigation.appGallery',
};

const TONES: Partial<Record<ApplicationRouteId, GlassListTone>> = {
  security: 'security',
  consumi: 'energy',
};

/** The functions among the entries: they say so under their name. */
const FUNCTIONS: readonly ApplicationRouteId[] = ['security', 'consumi'];

function RoundButton({ label, kind, disabled, onPress, children }: { label: string; kind: 'add' | 'remove' | 'move'; disabled?: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`navbar-mini is-${kind}`} aria-label={label} disabled={disabled} onClick={onPress}>
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

/**
 * Impostazioni › Questo dispositivo › Barra di navigazione: the entries between Dashboard and
 * Profilo on this device, with a preview of the bar as it looks today. docs/design/app/impostazioni.html.
 */
export function NavigationBarSettingsPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const { can } = useAccessControl();
  const entries = useNavigationBar();
  const allowed = (id: ApplicationRouteId) => canOpenRoute(getApplicationRoute(id).path, can);
  const inBar = entries.filter(allowed);
  const toAdd = NAVIGATION_BAR_CANDIDATES.filter((id) => allowed(id) && !entries.includes(id));
  const full = entries.length >= SIDE_BAR_MAX;
  const name = (id: ApplicationRouteId) => t(NAMES[id]);
  const icon = (id: ApplicationRouteId) => {
    const Icon = getDashboardNavigationIcon(getApplicationRoute(id).icon);
    return <Icon size={18} />;
  };
  const quickPaths = React.useMemo(createDefaultSidebarPaths, []);

  const remove = (id: ApplicationRouteId) => writeNavigationBar(entries.filter((entry) => entry !== id));
  const moveUp = (id: ApplicationRouteId) => {
    const next = [...entries];
    const index = next.indexOf(id);
    if (index > 0) [next[index - 1], next[index]] = [next[index], next[index - 1]];
    writeNavigationBar(next);
  };
  const add = (id: ApplicationRouteId) => writeNavigationBar([...entries, id]);

  return (
    <PageFrame className="navbar-settings">
      <div className="navbar-settings-wrap">
        <PageHeader title={t('settings.device.navigation')} detail={t('navbar.detail')} onBack={onBack} />

        <section className="navbar-preview-group" aria-label={t('navbar.preview')}>
          <span className="glass-list-caption">{t('navbar.preview')}</span>
          {/* The bar as it looks today, with these entries; a picture, out of reach. */}
          <div className="navbar-preview">
            <BottomBarNav
              preview={{ entries }}
              isEditMode={false}
              quickPaths={quickPaths}
              activeRoute="/home"
              onPathClick={() => undefined}
              onOpenSettings={() => undefined}
              haStatus="connected"
            />
          </div>
        </section>

        <GlassList caption={t('navbar.inBar')} ariaLabel={t('navbar.inBar')} footer={t('navbar.inBarNote')}>
          <GlassListRow title={name('home')} note={t('navbar.alwaysFirst')} icon={icon('home')} iconShape="square" value={<Lock size={16} aria-hidden="true" />} />
          {inBar.map((id, index) => (
            <GlassListRow
              key={id}
              title={name(id)}
              note={index >= PHONE_BAR_MAX ? t('navbar.onlySide') : undefined}
              icon={icon(id)}
              iconShape="square"
              tone={TONES[id] ?? 'app'}
              value={
                <span className="navbar-row-tools">
                  {index > 0 ? (
                    <RoundButton kind="move" label={t('navbar.moveUp', { name: name(id) })} onPress={() => moveUp(id)}>
                      <ArrowUp size={16} strokeWidth={2.6} />
                    </RoundButton>
                  ) : null}
                  <RoundButton kind="remove" label={t('navbar.remove', { name: name(id) })} onPress={() => remove(id)}>
                    <Minus size={16} strokeWidth={2.8} />
                  </RoundButton>
                </span>
              }
            />
          ))}
          <GlassListRow title={t('navbar.profile')} note={t('navbar.alwaysLast')} icon={<UserRound size={18} />} iconShape="square" value={<Lock size={16} aria-hidden="true" />} />
        </GlassList>

        <GlassList
          caption={t('navbar.toAdd')}
          ariaLabel={t('navbar.toAdd')}
          footer={toAdd.length === 0 ? t('navbar.nothingToAdd') : full ? t('navbar.full') : t('navbar.toAddNote')}
        >
          {toAdd.map((id) => (
            <GlassListRow
              key={id}
              title={name(id)}
              note={FUNCTIONS.includes(id) ? t('navbar.function') : undefined}
              icon={icon(id)}
              iconShape="square"
              tone={TONES[id] ?? 'app'}
              value={
                <RoundButton kind="add" label={t('navbar.add', { name: name(id) })} disabled={full} onPress={() => add(id)}>
                  <Plus size={16} strokeWidth={2.8} />
                </RoundButton>
              }
            />
          ))}
        </GlassList>

        <div>
          <GlassButton variant="soft" onClick={resetNavigationBar}>
            {t('navbar.reset')}
          </GlassButton>
        </div>
      </div>
    </PageFrame>
  );
}

export default NavigationBarSettingsPage;
