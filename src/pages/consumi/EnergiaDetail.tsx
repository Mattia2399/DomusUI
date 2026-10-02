import React from 'react';
import { AlertTriangle, ChevronDown, LoaderCircle, RefreshCw, Search, SlidersHorizontal, WifiOff } from 'lucide-react';
import { LazyLoadBoundary } from '../../components/common/LazyLoadBoundary';
import type { EnergyModuleId, EnergyModuleState, EnergyQuantity, EnergyState } from '../../services/energyCoreClient';
import { DetailScaffold } from './shared';
import { EnergyHomeVisual } from './energy/EnergyHomeVisual';
import { MODULE_META, REASON_LABEL, SOURCE_LABEL, UI, buildFlowFromState, formatQuantity } from './energy/energyModel';
import { useEnergyCore, type EnergyCoreResource, type EnergyPageContext } from './energy/useEnergyCore';
import type { WizardMode } from './energy/EnergySetupWizard';

const EnergySetupWizard = React.lazy(() => import('./energy/EnergySetupWizard'));

const STATUS_PILL: Record<'ok' | 'partial' | 'offline', [string, string]> = {
  ok: ['Attivo', 'text-[color:var(--ui-success)] border-[color:var(--ui-success)]/30'],
  partial: ['Dati parziali', 'text-[color:var(--ui-warning)] border-[color:var(--ui-warning)]/30'],
  offline: ['Offline', 'text-[color:var(--ui-danger)] border-[color:var(--ui-danger)]/30'],
};

function roleLabel(id: EnergyModuleId, role: string) {
  if (role === 'net_power') return id === 'grid' ? 'Netto (+ prelievo)' : 'Netto (+ scarica)';
  return MODULE_META[id].roles.find((spec) => spec.role === role)?.label ?? role;
}

function QuantityRow({ label, quantity }: { label: string; quantity: EnergyQuantity | null }) {
  const ok = quantity?.status === 'ok';
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="min-w-0 truncate text-[color:var(--ui-text-secondary)]">{label}</dt>
      <dd className="shrink-0 text-right">
        <span className={UI.title}>{formatQuantity(quantity)}</span>
        <span className="ml-1.5 text-[11px] text-[color:var(--ui-text-tertiary)]">
          {ok && quantity?.source ? SOURCE_LABEL[quantity.source] : REASON_LABEL[quantity?.reason ?? ''] ?? 'Non disponibile'}
        </span>
      </dd>
    </div>
  );
}

function ModuleCard({ id, module }: { id: EnergyModuleId; module: EnergyModuleState }) {
  const pill = STATUS_PILL[module.status === 'offline' ? 'offline' : module.complete ? 'ok' : 'partial'];
  const rows = Object.entries(module.quantities).filter(([, quantity]) => quantity.status !== 'not_measured');
  return (
    <li className={UI.card}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={UI.title}>{MODULE_META[id].label}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${pill[1]}`}>{pill[0]}</span>
      </div>
      {module.status === 'offline' ? (
        <p className={`mb-1 ${UI.muted}`}>Configurato, ma i sensori non forniscono dati in questo momento.</p>
      ) : null}
      <dl className="space-y-1">
        {rows.map(([role, quantity]) => <QuantityRow key={role} label={roleLabel(id, role)} quantity={quantity} />)}
      </dl>
    </li>
  );
}

function Message({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-8 text-center" role="status">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">{icon}</span>
      <p className={`mt-4 text-lg ${UI.title}`}>{title}</p>
      {children}
    </div>
  );
}

function SetupActions({ canManage, configured, onOpen }: { canManage: boolean; configured: boolean; onOpen: (mode: WizardMode) => void }) {
  if (!canManage) {
    return <p className={UI.muted}>Solo un amministratore di Home Assistant può configurare l’impianto.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {configured ? (
        <button type="button" onClick={() => onOpen('edit')} className={UI.primary}>
          <SlidersHorizontal size={16} aria-hidden="true" /> Modifica impianto
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onOpen(configured ? 'rediscover' : 'setup')}
        className={configured ? UI.button : UI.primary}
      >
        <Search size={16} aria-hidden="true" /> {configured ? 'Ripeti rilevamento' : 'Avvia rilevamento'}
      </button>
    </div>
  );
}

function StatusPanel({ state, canManage, onOpen }: { state: EnergyState; canManage: boolean; onOpen: (mode: WizardMode) => void }) {
  const configured = Object.entries(state.modules) as Array<[EnergyModuleId, EnergyModuleState]>;
  const absent = state.absent_modules.filter((id) => id !== 'home').map((id) => MODULE_META[id].label);
  return (
    <section aria-labelledby="energy-system-title">
      <h2 id="energy-system-title" className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-[color:var(--ui-text-tertiary)]">Il tuo impianto</h2>
      <ul className="space-y-2">
        {configured.map(([id, module]) => <ModuleCard key={id} id={id} module={module} />)}
      </ul>
      <dl className="mt-3 border-t border-[color:var(--ui-separator)] pt-3">
        <QuantityRow label="Consumo della casa" quantity={state.home_consumption} />
      </dl>
      {absent.length ? <p className={`mt-2 ${UI.muted}`}>Non presenti: {absent.join(', ')}</p> : null}
      <div className="mt-4"><SetupActions canManage={canManage} configured onOpen={onOpen} /></div>
    </section>
  );
}

function systemStatus(state: EnergyState) {
  const modules = Object.values(state.modules).filter((module): module is EnergyModuleState => Boolean(module));
  const online = modules.filter((module) => module.status === 'online').length;
  if (modules.length === 0 || online === 0) {
    return { label: 'Sensori offline', dot: 'bg-[#ff9f0a]', text: 'text-[#ffb340]' };
  }
  if (online < modules.length || modules.some((module) => !module.complete)) {
    return { label: 'Dati parziali', dot: 'bg-[#ff9f0a]', text: 'text-[#ffb340]' };
  }
  return { label: 'Monitoraggio attivo', dot: 'bg-[#30d158]', text: 'text-[#63e681]' };
}

function EnergyExperience({
  state,
  error,
  notice,
  canManage,
  onOpen,
}: {
  state: EnergyState;
  error: Error | null;
  notice: string;
  canManage: boolean;
  onOpen: (mode: WizardMode) => void;
}) {
  const flow = buildFlowFromState(state);
  const status = systemStatus(state);

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 sm:space-y-6" data-testid="energy-experience">
      <section className="relative isolate min-h-[34rem] overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-[#05080d] text-white shadow-[0_34px_90px_rgba(0,0,0,0.38)] sm:min-h-[43rem] sm:rounded-[2.5rem]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(45,155,210,0.14),transparent_35%),radial-gradient(circle_at_12%_8%,rgba(48,209,88,0.07),transparent_28%),linear-gradient(180deg,#080d14_0%,#04070b_100%)]" />
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        <div className="relative z-10 flex min-h-[34rem] flex-col p-4 sm:min-h-[43rem] sm:p-7 lg:p-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">Domus Energy</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">La tua casa, adesso</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/50">
                Flussi istantanei da Energy Core. I collegamenti senza direzione o potenza valida restano fermi.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 backdrop-blur-xl">
              <span className={`h-2 w-2 rounded-full shadow-[0_0_16px_currentColor] ${status.dot}`} aria-hidden="true" />
              <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${status.text}`}>{status.label}</span>
            </div>
          </div>

          <div className="relative mx-auto flex min-h-0 w-full max-w-[50rem] flex-1 items-center justify-center py-3 sm:py-5">
            <EnergyHomeVisual state={state} view={flow} />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-4 text-[10px] uppercase tracking-[0.14em] text-white/40 sm:justify-between">
            <span>Misurato = sensore Home Assistant</span>
            <span>Derivato = calcolo Domus Energy</span>
            <span>Zero reale = flusso fermo</span>
          </div>
        </div>
      </section>

      {notice ? <p role="status" className="liquid-glass-card px-4 py-3 text-sm text-[color:var(--ui-success)]">{notice}</p> : null}
      {error ? (
        <p role="alert" className="liquid-glass-card px-4 py-3 text-sm text-[color:var(--ui-warning)]">
          Aggiornamento non riuscito: i valori potrebbero non essere attuali. {error.message}
        </p>
      ) : null}

      <details className="group liquid-glass-card overflow-hidden" data-testid="energy-technical-details">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:content-none sm:px-6 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="font-semibold text-[color:var(--ui-text-primary)]">Dettagli sensori e configurazione</p>
            <p className="mt-0.5 text-xs text-[color:var(--ui-text-tertiary)]">Origine, disponibilità e associazioni dei moduli</p>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-[color:var(--ui-text-tertiary)] transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-[color:var(--ui-separator)] px-4 py-4 sm:px-6 sm:py-6">
          <StatusPanel state={state} canManage={canManage} onOpen={onOpen} />
        </div>
      </details>
    </div>
  );
}

type EnergiaDetailViewProps = {
  title: string;
  onBack: () => void;
  energy?: EnergyPageContext;
  energyCore: EnergyCoreResource;
};

export function EnergiaDetailView({ title, onBack, energy, energyCore }: EnergiaDetailViewProps) {
  const { state, error, loading, live, reload } = energyCore;
  const [wizard, setWizard] = React.useState<WizardMode | null>(null);
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

  const openWizard = (mode: WizardMode) => {
    setNotice('');
    setWizard(mode);
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
        <div className="mt-5 flex justify-center"><SetupActions canManage={canManage} configured={false} onOpen={openWizard} /></div>
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
    <DetailScaffold title={title} onBack={onBack} subtitle="Flussi energetici in tempo reale" showBeta={false}>
      <EnergyExperience
        state={state}
        error={error}
        notice={notice}
        canManage={canManage}
        onOpen={openWizard}
      />
    </DetailScaffold>
  );
}

export function EnergiaDetail({ title, onBack, energy }: { title: string; onBack: () => void; energy?: EnergyPageContext }) {
  const energyCore = useEnergyCore(energy);
  return <EnergiaDetailView title={title} onBack={onBack} energy={energy} energyCore={energyCore} />;
}

export default EnergiaDetail;
