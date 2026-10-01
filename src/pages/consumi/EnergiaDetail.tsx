import React from 'react';
import { AlertTriangle, LoaderCircle, PlugZap, RefreshCw, ScanSearch, SlidersHorizontal } from 'lucide-react';
import { LazyLoadBoundary } from '../../components/common/LazyLoadBoundary';
import type { EnergyModuleId, EnergyModuleState, EnergyQuantity, EnergyState } from '../../services/energyCoreClient';
import { DetailScaffold } from './shared';
import { EnergyFlowDiagram } from './energy/EnergyFlowDiagram';
import { MODULE_META, REASON_LABEL, SOURCE_LABEL, UI, buildFlowFromState, formatQuantity } from './energy/energyModel';
import { useEnergyCore, type EnergyPageContext } from './energy/useEnergyCore';
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
        <ScanSearch size={16} aria-hidden="true" /> {configured ? 'Ripeti rilevamento' : 'Avvia rilevamento'}
      </button>
    </div>
  );
}

function StatusPanel({ state, canManage, onOpen }: { state: EnergyState; canManage: boolean; onOpen: (mode: WizardMode) => void }) {
  const configured = Object.entries(state.modules) as Array<[EnergyModuleId, EnergyModuleState]>;
  const absent = state.absent_modules.filter((id) => id !== 'home').map((id) => MODULE_META[id].label);
  return (
    <section className="liquid-glass-card p-4 sm:p-5" aria-labelledby="energy-system-title">
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

export function EnergiaDetail({ title, onBack, energy }: { title: string; onBack: () => void; energy?: EnergyPageContext }) {
  const { state, error, loading, live, reload } = useEnergyCore(energy);
  const [wizard, setWizard] = React.useState<WizardMode | null>(null);
  const [notice, setNotice] = React.useState('');
  const canManage = live && Boolean(energy?.canManage);

  if (wizard && energy && canManage) {
    return (
      <DetailScaffold title="Configura impianto" subtitle="Domus Energy" onBack={() => setWizard(null)}>
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
      </DetailScaffold>
    );
  }

  const openWizard = (mode: WizardMode) => {
    setNotice('');
    setWizard(mode);
  };

  let left: React.ReactNode;
  let right: React.ReactNode = null;
  if (state?.configured) {
    left = <EnergyFlowDiagram view={buildFlowFromState(state)} />;
    right = <StatusPanel state={state} canManage={canManage} onOpen={openWizard} />;
  } else if (!live) {
    left = (
      <Message icon={<PlugZap />} title="Home Assistant non collegato">
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
      <Message icon={<ScanSearch />} title="Configura Domus Energy">
        <p className={`mt-2 leading-relaxed ${UI.body}`}>
          Domus individua rete, fotovoltaico, batteria e wallbox tra i sensori di Home Assistant e mostra solo l’hardware presente. Nulla viene salvato senza la tua conferma.
        </p>
        {state.load_error ? <p className="mt-3 text-sm text-[color:var(--ui-warning)]">Il profilo salvato non era valido ed è stato ignorato: configuralo di nuovo.</p> : null}
        <div className="mt-5 flex justify-center"><SetupActions canManage={canManage} configured={false} onOpen={openWizard} /></div>
      </Message>
    );
  }

  return (
    <DetailScaffold
      title={title}
      onBack={onBack}
      left={state?.configured ? (
        // The diagram keeps its dark stage in both themes; messages use theme surfaces.
        <div className={`relative flex h-full w-full flex-col overflow-hidden ${UI.stage}`}>
          <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-1 sm:p-3">{left}</div>
          <p className="relative z-10 border-t border-white/[0.04] px-3 py-2.5 text-center text-xs text-white/50">
            Valori da Home Assistant · Misurato = sensore, Derivato = calcolato da Domus
          </p>
        </div>
      ) : left}
      right={(
        <>
          {notice ? <p role="status" className="liquid-glass-card px-4 py-3 text-sm text-[color:var(--ui-success)]">{notice}</p> : null}
          {error && state?.configured ? (
            <p role="alert" className="liquid-glass-card px-4 py-3 text-sm text-[color:var(--ui-warning)]">Aggiornamento non riuscito: i valori potrebbero non essere attuali. {error.message}</p>
          ) : null}
          {right}
        </>
      )}
    />
  );
}

export default EnergiaDetail;
