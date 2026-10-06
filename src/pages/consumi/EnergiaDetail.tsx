import React from 'react';
import { AlertTriangle, LoaderCircle, RefreshCw, Search, SlidersHorizontal, WifiOff } from 'lucide-react';
import { LazyLoadBoundary } from '../../components/common/LazyLoadBoundary';
import { DetailScaffold } from './shared';
import { EnergyDashboard } from './energy/EnergyDashboard';
import { UI } from './energy/energyModel';
import { useEnergyCore, type EnergyCoreResource, type EnergyPageContext } from './energy/useEnergyCore';
import type { WizardMode } from './energy/EnergySetupWizard';
import type { EnergyModuleId } from '../../services/energyCoreClient';

const EnergySetupWizard = React.lazy(() => import('./energy/EnergySetupWizard'));
const EnergySettings = React.lazy(() => import('./energy/EnergySettings'));

function Message({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-8 text-center" role="status">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">{icon}</span>
      <p className={`mt-4 text-lg ${UI.title}`}>{title}</p>
      {children}
    </div>
  );
}

function SetupActions({ canManage, onOpen }: { canManage: boolean; onOpen: (mode: WizardMode) => void }) {
  if (!canManage) {
    return <p className={UI.muted}>Solo un amministratore di Home Assistant può configurare l’impianto.</p>;
  }
  return (
    <button type="button" onClick={() => onOpen('setup')} className={UI.primary}>
      <Search size={16} aria-hidden="true" /> Avvia rilevamento
    </button>
  );
}

type EnergiaDetailViewProps = {
  title: string;
  onBack: () => void;
  energy?: EnergyPageContext;
  energyCore: EnergyCoreResource;
  /** Period history, once a backend source exists; the live page has none yet. */
  energyHistory?: React.ComponentProps<typeof EnergyDashboard>['history'];
};

export function EnergiaDetailView({ title, onBack, energy, energyCore, energyHistory }: EnergiaDetailViewProps) {
  const { state, error, loading, live, reload } = energyCore;
  const [wizard, setWizard] = React.useState<WizardMode | null>(null);
  const [settings, setSettings] = React.useState(false);
  const [settingsModule, setSettingsModule] = React.useState<EnergyModuleId | null>(null);
  const [notice, setNotice] = React.useState('');
  const canManage = live && Boolean(energy?.canManage);

  if (wizard && energy && canManage) {
    return (
      <LazyLoadBoundary mode="section" fallback={<Message icon={<LoaderCircle className={UI.spin} />} title="Apertura configurazione…" />}>
          <EnergySetupWizard
            mode={wizard}
            callApi={energy.callApi}
            haStates={energy.haStates}
            onClose={() => setWizard(null)}
            onSaved={() => {
              setWizard(null);
              setNotice('Impianto salvato. Le nuove associazioni sono già attive.');
              void reload();
            }}
          />
      </LazyLoadBoundary>
    );
  }

  const loading_ = <Message icon={<LoaderCircle className={UI.spin} />} title="Apertura…" />;
  if (settings && energy && canManage) {
    return (
      <DetailScaffold title="Impostazioni Energia" subtitle="Impianto, sensori e tariffa" onBack={() => { setSettings(false); setSettingsModule(null); setNotice(''); }} showBeta={false}>
        {/* Back from a guided setup opened here: its outcome stays visible above the settings. */}
        {notice ? <p role="status" className="liquid-glass-card mb-4 px-4 py-3 text-sm text-[color:var(--ui-success)]">{notice}</p> : null}
        <LazyLoadBoundary mode="section" fallback={loading_}>
          <EnergySettings
            callApi={energy.callApi}
            haStates={energy.haStates}
            onRediscover={() => { setNotice(''); setWizard('rediscover'); }}
            onSaved={() => void reload()}
            initialModule={settingsModule}
          />
        </LazyLoadBoundary>
      </DetailScaffold>
    );
  }

  // Day-to-day changes use the classic settings; the wizard is for detection.
  const openWizard = (mode: WizardMode) => {
    setNotice('');
    if (mode === 'edit') setSettings(true);
    else setWizard(mode);
  };

  let left: React.ReactNode;
  if (!live) {
    left = (
      <Message icon={<WifiOff />} title="Home Assistant non collegato">
        <p className={`mt-2 ${UI.body}`}>Collega Home Assistant per vedere e configurare l’impianto energetico.</p>
      </Message>
    );
  } else if (error) {
    left = (
      <Message icon={<AlertTriangle />} title="Impianto non disponibile">
        <p className={`mt-2 ${UI.body}`}>{error.message}</p>
        <button type="button" onClick={() => void reload()} className={`mt-4 ${UI.button}`}>
          <RefreshCw size={16} aria-hidden="true" /> Riprova
        </button>
      </Message>
    );
  } else if (!state || loading) {
    left = <Message icon={<LoaderCircle className={UI.spin} />} title="Caricamento impianto…" />;
  } else {
    left = (
      <Message icon={<Search />} title="Configura Domus Energy">
        <p className={`mt-2 leading-relaxed ${UI.body}`}>
          Domus individua rete, fotovoltaico, batteria e wallbox tra i sensori di Home Assistant e mostra solo l’hardware presente. Nulla viene salvato senza la tua conferma.
        </p>
        {state.load_error ? <p className="mt-3 text-sm text-[color:var(--ui-warning)]">Il profilo salvato non era valido ed è stato ignorato: configuralo di nuovo.</p> : null}
        <div className="mt-5 flex justify-center"><SetupActions canManage={canManage} onOpen={openWizard} /></div>
      </Message>
    );
  }

  if (!state?.configured) {
    return (
      <DetailScaffold title={title} onBack={onBack} subtitle="Flussi energetici in tempo reale" showBeta={false}>
        <div className="flex min-h-[calc(100dvh-11rem)] items-center justify-center">
          <div className="w-full max-w-xl space-y-3">
            {notice ? <p role="status" className="liquid-glass-card px-4 py-3 text-sm text-[color:var(--ui-success)]">{notice}</p> : null}
            <div className="liquid-glass-card">{left}</div>
          </div>
        </div>
      </DetailScaffold>
    );
  }

  return (
    <DetailScaffold
      title={title}
      onBack={onBack}
      subtitle="Flussi energetici in tempo reale"
      bleed
      trailing={canManage ? (
        <button type="button" onClick={() => openWizard('edit')} className="liquid-glass-control flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-[color:var(--ui-text-primary)]" aria-label="Impostazioni energia">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Impostazioni</span>
        </button>
      ) : undefined}
    >
      <EnergyDashboard
        state={state}
        history={energyHistory}
        banner={(
          <>
            {notice ? <p role="status" className="liquid-glass-card px-4 py-3 text-sm text-[color:var(--ui-success)]">{notice}</p> : null}
            {error ? (
              <p role="alert" className="liquid-glass-card px-4 py-3 text-sm text-[color:var(--ui-warning)]">
                Aggiornamento non riuscito: i valori potrebbero non essere attuali. {error.message}
              </p>
            ) : null}
          </>
        )}
        onEditModule={canManage ? (id) => { setSettingsModule(id); setSettings(true); } : undefined}
      />
    </DetailScaffold>
  );
}

export function EnergiaDetail({ title, onBack, energy }: { title: string; onBack: () => void; energy?: EnergyPageContext }) {
  const energyCore = useEnergyCore(energy);
  return <EnergiaDetailView title={title} onBack={onBack} energy={energy} energyCore={energyCore} />;
}

export default EnergiaDetail;
