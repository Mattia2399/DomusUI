import React from 'react';
import clsx from 'clsx';
import { Bell, DoorClosed, Home, KeyRound, Lock, Moon, PersonStanding, Pin, Settings, ShieldCheck, Smartphone, Video, Wind } from 'lucide-react';
import { AmbientBackground, AmbientProvider, useAmbient } from '../../theme/ambient/AmbientProvider';
import { GlassButton } from '../../components/ui/GlassButton';
import { GlassList } from '../../components/ui/GlassList';
import { GlassListRow } from '../../components/ui/GlassListRow';
import { GlassSegmented } from '../../components/ui/GlassSegmented';
import { GlassSheet } from '../../components/ui/GlassSheet';
import { PageFrame } from '../../components/ui/PageFrame';
import { PageHeader, PageHeaderButton } from '../../components/ui/PageHeader';
import { SubPage } from '../../components/ui/SubPage';
import './pageKitLab.css';

/*
 * The pieces of the new pages (header, subpage, sheet, grouped lists, colours of the functions)
 * put together on one test page, beside docs/design/app/sicurezza.html. It is not the Security page:
 * its state card, mode tiles, locks and cameras come with that page.
 * Only in development, at /dev/pagina. Example data.
 *
 * The starting state comes from the address, for the screenshots:
 *   ?tema=scuro · ?arrivo=casa · ?sotto=sensori|eventi|impostazioni · ?foglio=inserisci · ?barra=0
 */

type Theme = 'light' | 'dark';
type Sub = 'sensori' | 'eventi' | 'impostazioni';

const SUBS: readonly Sub[] = ['sensori', 'eventi', 'impostazioni'];

function readStart() {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const sub = params.get('sotto') as Sub | null;
  return {
    theme: (params.get('tema') === 'scuro' ? 'dark' : 'light') as Theme,
    fromHome: params.get('arrivo') === 'casa',
    sub: sub && SUBS.includes(sub) ? sub : null,
    sheet: params.get('foglio') === 'inserisci',
    bar: params.get('barra') !== '0',
  };
}

const OPENINGS = [
  { name: 'Ingresso', kind: 'Porta', icon: <DoorClosed size={18} /> },
  { name: 'Cucina', kind: 'Finestra', icon: <Wind size={18} /> },
  { name: 'Soggiorno', kind: 'Portafinestra', icon: <Wind size={18} /> },
];

const EVENTS = [
  { title: 'Disinserito', note: 'Oggi 07:42 · Giulia', icon: <ShieldCheck size={18} /> },
  { title: 'Porta d’ingresso aperta', note: 'Oggi 07:40', icon: <DoorClosed size={18} /> },
  { title: 'Inserito di notte', note: 'Ieri 23:15 · Marco', icon: <Moon size={18} /> },
];

function Glows() {
  // The lights of a function page: its colour and the violet of the app. The glows are drawn
  // outside the PageFrame, so they take the token of the function itself, not --fn-accent.
  useAmbient({ a: 'var(--fn-security)', b: 'var(--fn-app-glow)' });
  return null;
}

function MainPage({ fromHome, pinned, onPin, openSub, openSheet }: { fromHome: boolean; pinned: boolean; onPin: () => void; openSub: (sub: Sub) => void; openSheet: () => void }) {
  return (
    <div className="page-kit-lab-wrap">
      <PageHeader
        title="Pezzi comuni"
        detail="Pagina di prova · colore di Sicurezza · dati di esempio"
        onBack={fromHome ? () => undefined : undefined}
        backLabel="Torna a Casa"
        tools={
          <>
            <PageHeaderButton label="Fissa nella barra" icon={<Pin size={19} />} pressed={pinned} onClick={onPin} />
            <PageHeaderButton label="Impostazioni" icon={<Settings size={20} />} onClick={() => openSub('impostazioni')} />
          </>
        }
      />

      <div className="page-kit-lab-command">
        <GlassButton variant="filled" tone="device" onClick={openSheet}>
          <ShieldCheck size={18} aria-hidden="true" /> Apri un foglio
        </GlassButton>
      </div>

      <div className="page-kit-lab-grid">
        <GlassList title="Porte e finestre" detail="tutte chiuse" more={{ label: 'Tutte', onPress: () => openSub('sensori') }}>
          {OPENINGS.map((item) => (
            <GlassListRow key={item.name} title={item.name} note={item.kind} icon={item.icon} iconShape="square" value="Chiusa" opens onPress={() => openSub('sensori')} />
          ))}
        </GlassList>

        <GlassList title="Eventi" more={{ label: 'Tutti', onPress: () => openSub('eventi') }}>
          {EVENTS.map((item) => (
            <GlassListRow key={item.title} title={item.title} note={item.note} icon={item.icon} iconShape="square" opens onPress={() => openSub('eventi')} />
          ))}
        </GlassList>
      </div>

      <GlassList caption="Accesso" footer="Scudo, modalità a tessere, serrature e telecamere arrivano con la pagina Sicurezza.">
        <GlassListRow title="Serrature" note="2 chiuse" icon={<Lock size={18} />} iconShape="square" tone="security" opens onPress={() => openSub('sensori')} />
        <GlassListRow title="Telecamere" note="3 attive" icon={<Video size={18} />} iconShape="square" tone="app" opens onPress={() => openSub('sensori')} />
      </GlassList>
    </div>
  );
}

function SubPageBody({ sub }: { sub: Sub }) {
  if (sub === 'eventi') {
    return (
      <GlassList ariaLabel="Eventi">
        {EVENTS.map((item) => (
          <GlassListRow key={item.title} title={item.title} note={item.note} icon={item.icon} iconShape="square" />
        ))}
      </GlassList>
    );
  }
  if (sub === 'impostazioni') {
    return (
      <>
        <GlassList caption="Allarme" footer="Le impostazioni della funzione si aprono dall’ingranaggio.">
          <GlassListRow title="Modalità" note="Fuori casa, In casa, Notte" icon={<ShieldCheck size={18} />} iconShape="square" tone="security" opens onPress={() => undefined} />
          <GlassListRow title="Conferma" value="Codice" icon={<KeyRound size={18} />} iconShape="square" tone="security" opens onPress={() => undefined} />
        </GlassList>
        <GlassList caption="Avvisi">
          <GlassListRow title="Notifiche" icon={<Bell size={18} />} iconShape="square" tone="app" opens onPress={() => undefined} />
          <GlassListRow title="Dispositivi che ricevono" value="2" icon={<Smartphone size={18} />} iconShape="square" tone="app" opens onPress={() => undefined} />
        </GlassList>
      </>
    );
  }
  return (
    <GlassList title="Porte e finestre" detail="tutte chiuse" headingLevel={3}>
      {OPENINGS.map((item) => (
        <GlassListRow key={item.name} title={item.name} note={item.kind} icon={item.icon} iconShape="square" value="Chiusa" />
      ))}
    </GlassList>
  );
}

const SUB_TITLES: Record<Sub, { title: string; detail?: string }> = {
  sensori: { title: 'Sensori', detail: '3 sensori · tutto chiuso' },
  eventi: { title: 'Eventi', detail: 'Ultimi 7 giorni' },
  impostazioni: { title: 'Impostazioni' },
};

export default function PageKitLab() {
  const start = React.useMemo(readStart, []);
  const [theme, setTheme] = React.useState<Theme>(start.theme);
  const [fromHome, setFromHome] = React.useState(start.fromHome);
  const [sub, setSub] = React.useState<Sub | null>(start.sub);
  const [sheet, setSheet] = React.useState(start.sheet);
  const [pinned, setPinned] = React.useState(true);

  return (
    <div className={clsx('page-kit-lab', theme === 'dark' ? 'dashboard-theme-dark' : 'dashboard-theme-light')} data-testid="page-kit-lab">
      <AmbientProvider enabled>
        <Glows />
        <div className="page-kit-lab-lights" aria-hidden="true">
          <AmbientBackground />
        </div>
        <PageFrame
          fn="security"
          subPage={
            sub ? (
              <SubPage key={sub} title={SUB_TITLES[sub].title} detail={SUB_TITLES[sub].detail} backLabel="Torna ai pezzi comuni" onClose={() => setSub(null)}>
                <SubPageBody sub={sub} />
              </SubPage>
            ) : null
          }
        >
          <MainPage fromHome={fromHome} pinned={pinned} onPin={() => setPinned((value) => !value)} openSub={setSub} openSheet={() => setSheet(true)} />
          <GlassSheet isOpen={sheet} onClose={() => setSheet(false)} title="Inserisci" detail="Scegli come">
            <GlassList ariaLabel="Modalità">
              <GlassListRow title="Fuori casa" note="Tutti i sensori" icon={<ShieldCheck size={18} />} iconShape="square" tone="security" onPress={() => setSheet(false)} />
              <GlassListRow title="In casa" note="Porte e finestre" icon={<Home size={18} />} iconShape="square" tone="security" onPress={() => setSheet(false)} />
              <GlassListRow title="Notte" note="Tutto tranne la zona notte" icon={<Moon size={18} />} iconShape="square" tone="security" onPress={() => setSheet(false)} />
            </GlassList>
          </GlassSheet>
        </PageFrame>
      </AmbientProvider>

      {start.bar ? (
        <div className="page-kit-lab-bar" aria-label="Prova">
          <GlassSegmented<Theme>
            ariaLabel="Tema"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Chiaro' },
              { value: 'dark', label: 'Scuro' },
            ]}
          />
          <GlassSegmented<'barra' | 'casa'>
            ariaLabel="Arrivo"
            value={fromHome ? 'casa' : 'barra'}
            onChange={(value) => setFromHome(value === 'casa')}
            options={[
              { value: 'barra', label: 'Dalla barra', icon: <PersonStanding size={14} /> },
              { value: 'casa', label: 'Da Casa', icon: <Home size={14} /> },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}
