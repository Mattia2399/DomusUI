import { GlassListRow } from '../../components/ui/GlassListRow';
import React from 'react';
import { clsx } from 'clsx';
import { Droplets, Fan, Flame, Leaf, Lightbulb, MoveHorizontal, Palette, ShieldCheck, Snowflake, Sparkles, Timer } from 'lucide-react';
import { GlassButton } from '../../components/ui/GlassButton';
import { GlassChips } from '../../components/ui/GlassChips';
import { GlassColorPicker } from '../../components/ui/GlassColorPicker';
import { GlassColorTemperature } from '../../components/ui/GlassColorTemperature';
import { GlassConfirm } from '../../components/ui/GlassConfirm';
import { GlassSegmented } from '../../components/ui/GlassSegmented';
import { GlassShortcut } from '../../components/ui/GlassShortcut';
import { GlassSlider } from '../../components/ui/GlassSlider';
import { GlassStepper } from '../../components/ui/GlassStepper';
import { GlassSwatches } from '../../components/ui/GlassSwatches';
import { GlassSwitch } from '../../components/ui/GlassSwitch';
import { GlassTiles } from '../../components/ui/GlassTiles';
import { GlassToggleRow } from '../../components/ui/GlassToggleRow';
import { GlassVerticalSlider } from '../../components/ui/GlassVerticalSlider';
import {
  PanelGroups,
  PanelHeader,
  PanelNavBar,
  PanelPage,
  type PanelNavItem,
  PanelHero,
  PanelShell,
  PanelStates,
  type PanelAccent,
  type PanelGroup,
  type PanelStateValue,
  type PanelSurface,
} from '../../components/devices/panels/shell';
import { LabValues } from './labControls/LabValues';
import { LabActions } from './labControls/LabActions';
import { LabIndicators } from './labControls/LabIndicators';
import { LabCharts } from './labControls/LabCharts';
import { LabText } from './labControls/LabText';
import { LabAdvanced } from './labControls/LabAdvanced';
import { LabEditor } from './labControls/LabEditor';
import './componentsLab.css';

/*
 * Every shared control in its states and the skeleton of a panel in its three shapes,
 * in both themes, to check them without opening the Home or Rooms. Only in development.
 */

const ACCENT: PanelAccent = { color: '#ff9f0a', ink: '#2a1a00', rgb: '255 159 10' };
const ICON = { size: 18, strokeWidth: 2 };
const NOOP = () => undefined;

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="lab-card" data-testid={`lab-${id}`}>
      <h3>
        <code>{id}</code> {title}
      </h3>
      <div className="lab-card-body">{children}</div>
    </section>
  );
}

function Named({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="lab-named">
      <span>{name}</span>
      {children}
    </div>
  );
}

const STATES = [
  ['normale', {}],
  ['disabled', { disabled: true }],
  ['pending', { pending: true }],
  ['error', { error: true }],
] as const;

function Controls() {
  const [segment, setSegment] = React.useState<string>('heat');
  const [chip, setChip] = React.useState<string>('15');
  const [chips, setChips] = React.useState<string[]>(['living']);
  const [bar, setBar] = React.useState(40);
  const [steps, setSteps] = React.useState(50);
  const [vertical, setVertical] = React.useState(22);
  const [stepper, setStepper] = React.useState(21.5);
  const [on, setOn] = React.useState(true);
  const [row, setRow] = React.useState(false);
  const [color, setColor] = React.useState({ hue: 210, saturation: 70 });
  const [kelvin, setKelvin] = React.useState(4000);
  const [swatch, setSwatch] = React.useState('#ff3b30');
  const [tile, setTile] = React.useState('eco');

  const modes = [
    { value: 'heat', label: 'Caldo', icon: <Flame {...ICON} /> },
    { value: 'cool', label: 'Freddo', icon: <Snowflake {...ICON} /> },
    { value: 'fan', label: 'Ventola', icon: <Fan {...ICON} /> },
  ];

  return (
    <div className="lab-grid">
      <Card id="SEL-02" title="GlassSegmented">
        {STATES.map(([name, state]) => (
          <Named key={name} name={name}>
            <GlassSegmented<string> ariaLabel={name} options={modes.map(({ value, label }) => ({ value, label }))} value={segment} onChange={setSegment} {...state} />
          </Named>
        ))}
        <Named name="colore del dispositivo">
          <GlassSegmented<string> ariaLabel="Colore" tone="device" options={modes.map(({ value, label }) => ({ value, label }))} value={segment} onChange={setSegment} />
        </Named>
        <Named name="SEL-03 icona e nome">
          <GlassSegmented<string> ariaLabel="Icona" layout="stacked" tone="device" options={modes} value={segment} onChange={setSegment} />
        </Named>
        <Named name="solo icona">
          <GlassSegmented<string> ariaLabel="Solo icona" layout="icon" options={modes} value={segment} onChange={setSegment} />
        </Named>
      </Card>

      <Card id="SEL-06" title="GlassChips">
        {STATES.map(([name, state]) => (
          <Named key={name} name={name}>
            <GlassChips<string> ariaLabel={name} options={[{ value: 'off', label: 'Off' }, { value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '60', label: '1 h' }]} value={chip} onChange={setChip} {...state} />
          </Named>
        ))}
        <Named name="scelta multipla, colore del dispositivo">
          <GlassChips<string> multiple tone="device" ariaLabel="Stanze" options={[{ value: 'living', label: 'Soggiorno' }, { value: 'kitchen', label: 'Cucina' }, { value: 'bed', label: 'Camera' }]} value={chips} onChange={setChips} />
        </Named>
        <Named name="nel dialogo, 38">
          <GlassChips<string> size="dialog" ariaLabel="Dialogo" options={[{ value: 'a', label: 'Bassa' }, { value: 'b', label: 'Media' }]} value="a" onChange={NOOP} />
        </Named>
      </Card>

      <Card id="NUM-01" title="GlassSlider, la barra">
        {STATES.map(([name, state]) => (
          <Named key={name} name={name}>
            <GlassSlider variant="bar" label={name} value={bar} onValueChange={setBar} {...state} />
          </Named>
        ))}
        <Named name="colore del dispositivo, alta 40">
          <GlassSlider variant="bar" tone="device" size="compact" label="Colore" value={bar} onValueChange={setBar} />
        </Named>
        <Named name="spenta">
          <GlassSlider variant="bar" off label="Spenta" value={bar} onValueChange={setBar} />
        </Named>
        <Named name="NUM-03 con i passi, invio al rilascio">
          <GlassSlider variant="bar" tone="device" commit="release" label="Passi" step={25} value={steps} marks={[{ value: 25, label: 'Bassa' }, { value: 50, label: 'Media' }, { value: 75, label: 'Alta' }, { value: 100, label: 'Max' }]} onValueChange={setSteps} />
        </Named>
        <Named name="NUM-06 con il valore dentro">
          <GlassSlider variant="bar" tone="device" label="Volume" value={bar} valueInFill={`${bar}%`} onValueChange={setBar} />
        </Named>
      </Card>

      <Card id="NUM-02" title="GlassVerticalSlider">
        <div className="lab-row">
          <Named name="protagonista">
            <GlassVerticalSlider label="Obiettivo" value={vertical} min={10} max={30} step={0.5} display={`${vertical}°`} subtitle="riscalda a" current={{ value: 20.5, label: 'ora 20,5°' }} icon={<Flame {...ICON} />} onValueChange={setVertical} />
          </Named>
          {STATES.map(([name, state]) => (
            <Named key={name} name={name}>
              <GlassVerticalSlider size="compact" label={name} value={vertical} min={10} max={30} step={0.5} display={`${vertical}°`} onValueChange={setVertical} {...state} />
            </Named>
          ))}
          <Named name="spento">
            <GlassVerticalSlider size="compact" off label="Spento" value={vertical} min={10} max={30} display="Off" onValueChange={setVertical} />
          </Named>
        </div>
      </Card>

      <Card id="NUM-04" title="GlassStepper">
        {STATES.map(([name, state]) => (
          <Named key={name} name={name}>
            <GlassStepper label={name} decreaseLabel="Abbassa" increaseLabel="Alza" value={stepper} min={18} max={24} step={0.5} showLimits format={(entry) => `${String(entry).replace('.', ',')}°`} onValueChange={setStepper} {...state} />
          </Named>
        ))}
      </Card>

      <Card id="BOO-01" title="GlassSwitch e GlassToggleRow">
        <div className="lab-row">
          <Named name="normale"><GlassSwitch label="Normale" checked={on} onChange={setOn} /></Named>
          <Named name="BOO-02 piccolo"><GlassSwitch label="Piccolo" size="mini" checked={on} onChange={setOn} /></Named>
          <Named name="disabled"><GlassSwitch label="Disabled" checked={on} onChange={setOn} disabled /></Named>
          <Named name="pending"><GlassSwitch label="Pending" checked={on} onChange={setOn} pending /></Named>
          <Named name="error"><GlassSwitch label="Error" checked={on} onChange={setOn} error /></Named>
        </div>
        {STATES.map(([name, state]) => (
          <Named key={name} name={name}>
            <GlassToggleRow title="Protetta" description="Chiede conferma prima di spegnersi" icon={<ShieldCheck {...ICON} />} checked={row} onChange={setRow} {...state} />
          </Named>
        ))}
      </Card>

      <Card id="BOO-03" title="GlassShortcut">
        <div className="lab-row">
          <Named name="apre"><GlassShortcut kind="control" icon={<Palette {...ICON} />} label="Colore" onPress={NOOP} /></Named>
          <Named name="agisce, spenta"><GlassShortcut kind="action" icon={<ShieldCheck {...ICON} />} label="Protetta" onPress={NOOP} /></Named>
          <Named name="agisce, accesa"><GlassShortcut kind="action" on icon={<ShieldCheck {...ICON} />} label="Protetta" onPress={NOOP} /></Named>
          <Named name="disabled"><GlassShortcut kind="action" disabled icon={<Timer {...ICON} />} label="Timer" onPress={NOOP} /></Named>
          <Named name="pending"><GlassShortcut kind="action" pending icon={<Timer {...ICON} />} label="Timer" onPress={NOOP} /></Named>
          <Named name="error"><GlassShortcut kind="action" error icon={<Timer {...ICON} />} label="Timer" onPress={NOOP} /></Named>
        </div>
      </Card>

      <Card id="ACT-01" title="GlassButton">
        <div className="lab-row">
          <GlassButton variant="filled" size="lg">Piena</GlassButton>
          <GlassButton variant="filled" size="lg" tone="device">Dispositivo</GlassButton>
          <GlassButton variant="soft" size="lg">Morbida</GlassButton>
          <GlassButton variant="destructive" size="lg">Pericolosa</GlassButton>
          <GlassButton variant="text" size="lg">Testo</GlassButton>
        </div>
        <div className="lab-row">
          <GlassButton variant="soft" size="icon-40" aria-label="40"><Sparkles {...ICON} /></GlassButton>
          <GlassButton variant="soft" size="icon-48" aria-label="48"><Sparkles {...ICON} /></GlassButton>
          <GlassButton variant="soft" size="icon-56" aria-label="56"><Sparkles {...ICON} /></GlassButton>
          <GlassButton variant="soft" size="icon-48" on tone="device" aria-label="Attivo"><Sparkles {...ICON} /></GlassButton>
        </div>
        <div className="lab-row">
          <GlassButton variant="filled" size="lg" disabled>Disabled</GlassButton>
          <GlassButton variant="filled" size="lg" pending>Pending</GlassButton>
          <GlassButton variant="filled" size="lg" error>Error</GlassButton>
        </div>
      </Card>

      <Card id="ACT-06" title="GlassConfirm">
        <Named name="in linea"><GlassConfirm label="Spegni" confirmLabel="Spegni la presa" cancelLabel="Annulla" onConfirm={NOOP} /></Named>
        <Named name="in un riquadro"><GlassConfirm label="Svuota il serbatoio" question="Svuotare il serbatoio?" confirmLabel="Svuota" cancelLabel="Annulla" onConfirm={NOOP} /></Named>
        <Named name="disabled"><GlassConfirm label="Spegni" confirmLabel="Spegni" cancelLabel="Annulla" onConfirm={NOOP} disabled /></Named>
        <Named name="pending"><GlassConfirm label="Spegni" confirmLabel="Spegni" cancelLabel="Annulla" onConfirm={NOOP} pending /></Named>
      </Card>

      <Card id="ADV-01" title="GlassColorPicker">
        <div className="lab-row">
          {STATES.map(([name, state]) => (
            <Named key={name} name={name}>
              <div className="lab-disc"><GlassColorPicker label={name} value={color} onChange={setColor} {...state} /></div>
            </Named>
          ))}
        </div>
      </Card>

      <Card id="ADV-02" title="GlassColorTemperature">
        {STATES.map(([name, state]) => (
          <Named key={name} name={name}>
            <GlassColorTemperature label={name} value={kelvin} presets={[{ kelvin: 2700, label: 'Calda' }, { kelvin: 4000, label: 'Neutra' }, { kelvin: 6500, label: 'Fredda' }]} onValueChange={setKelvin} {...state} />
          </Named>
        ))}
      </Card>

      <Card id="ADV-03" title="GlassSwatches">
        {STATES.map(([name, state]) => (
          <Named key={name} name={name}>
            <GlassSwatches
              ariaLabel={name}
              swatches={['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#32ade6', '#5e5ce6', '#ff2d92'].map((value) => ({ value, color: value, label: value }))}
              value={swatch}
              onChange={setSwatch}
              {...state}
            />
          </Named>
        ))}
        <Named name="con il +">
          <GlassSwatches ariaLabel="Con il +" swatches={[{ value: '#ff3b30', color: '#ff3b30', label: 'Rosso' }]} value={swatch} onChange={setSwatch} onAdd={NOOP} addLabel="Salva il colore" />
        </Named>
      </Card>

      <Card id="ADV-11" title="GlassTiles">
        {STATES.map(([name, state]) => (
          <Named key={name} name={name}>
            <GlassTiles
              ariaLabel={name}
              options={[
                { value: 'comfort', label: 'Comfort', icon: <Flame {...ICON} /> },
                { value: 'eco', label: 'Eco', icon: <Leaf {...ICON} /> },
                { value: 'boost', label: 'Boost', icon: <Sparkles {...ICON} /> },
                { value: 'night', label: 'Notte', icon: <Droplets {...ICON} /> },
              ]}
              value={tile}
              onChange={setTile}
              {...state}
            />
          </Named>
        ))}
      </Card>
    </div>
  );
}

/* A panel with no device behind it: what the prompt on the panels will fill. */
function SamplePanel({ surface, owner, state }: { surface: PanelSurface; owner: string; state: PanelStateValue }) {
  const [level, setLevel] = React.useState(60);
  const [isOn, setOn] = React.useState(true);
  const [isProtected, setProtected] = React.useState(false);
  const [timer, setTimer] = React.useState('off');
  const timerChips = (
    <GlassChips<string> ariaLabel="Timer" options={[{ value: 'off', label: 'Off' }, { value: '15', label: '15 min' }, { value: '30', label: '30 min' }]} value={timer} onChange={setTimer} />
  );
  const [screen, setScreen] = React.useState<string | null>(null);
  const toggle = (key: string) => setScreen((open) => (open === key ? null : key));
  const items: PanelNavItem[] = [
    { key: 'color', kind: 'control', icon: <Palette {...ICON} />, label: 'Colore', selected: screen === 'color', onPress: () => toggle('color') },
    { key: 'timer', kind: 'control', icon: <Timer {...ICON} />, label: 'Timer', lit: timer !== 'off', selected: screen === 'timer', onPress: () => toggle('timer') },
    { key: 'swing', kind: 'more', icon: <MoveHorizontal {...ICON} />, label: 'Effetti', selected: screen === 'swing', onPress: () => toggle('swing') },
    { key: 'protect', kind: 'action', icon: <ShieldCheck {...ICON} />, label: 'Protetta', lit: isProtected, onPress: () => setProtected((value) => !value) },
  ];
  const groups: PanelGroup[] = [
    { key: 'timer', icon: <Timer {...ICON} />, title: 'Timer', value: timer === 'off' ? 'Nessuno' : `${timer} min`, children: timerChips },
    { key: 'protect', icon: <ShieldCheck {...ICON} />, title: 'Protetta', value: isProtected ? 'Sì' : 'No' },
  ];
  return (
    <PanelShell
      surface={surface}
      accent={ACCENT}
      tint={isOn}
      header={<PanelHeader action={{ kind: 'power', on: isOn, label: isOn ? 'Spegni' : 'Accendi', onPress: () => setOn((value) => !value) }} name="Lampada" status={isOn ? `Accesa · ${level}%` : 'Spenta'} closeLabel="Chiudi" onClose={() => undefined} />}
      states={<PanelStates state={state} />}
      hero={
        <PanelHero className="is-slider" back={screen === 'color' || screen === 'timer' ? { label: `Luminosità ${level}%`, onPress: () => setScreen(null) } : undefined}>
          {screen === 'timer' ? timerChips : screen === 'color' ? (
            <GlassSwatches ariaLabel="Colore" nowrap swatches={['#ff3b30', '#ff9500', '#34c759'].map((color) => ({ value: color, color, label: color }))} value={null} onChange={() => undefined} />
          ) : (
            <GlassVerticalSlider label="Luminosità" value={level} off={!isOn} display={isOn ? `${level}%` : 'Spenta'} onValueChange={setLevel} />
          )}
        </PanelHero>
      }
      nav={<PanelNavBar ariaLabel="Regolazioni" items={items} />}
      groups={<PanelGroups groups={groups} />}
      page={screen === 'swing' ? (
        <PanelPage title="Effetti" sub="Nessuno" backLabel="Indietro" onBack={() => setScreen(null)}>
          {['Nessuno', 'Arcobaleno', 'Respiro', 'Candela', 'Fuoco', 'Onde', 'Festa', 'Tramonto', 'Aurora', 'Lampeggio lento'].map((name) => <GlassListRow key={name} title={name} selected={name === 'Nessuno'} onPress={() => undefined} />)}
        </PanelPage>
      ) : undefined}
    />
  );
}

function Shapes() {
  return (
    <div className="lab-shapes">
      <div className="lab-shape is-sheet" data-testid="shape-sheet">
        <span>Foglio</span>
        <SamplePanel surface="sheet" owner="sheet" state={{ kind: 'none' }} />
      </div>
      <div className="lab-shape is-column" data-testid="shape-column">
        <span>Colonna</span>
        <SamplePanel surface="column" owner="column" state={{ kind: 'none' }} />
      </div>
      <div className="lab-shape is-dialog" data-testid="shape-dialog">
        <span>Dialogo</span>
        <SamplePanel surface="dialog" owner="dialog" state={{ kind: 'none' }} />
      </div>
      <div className="lab-shape is-states" data-testid="shape-states">
        <span>Gli stati comuni</span>
        <PanelStates state={{ kind: 'unavailable', since: '12 min', lastKnown: { state: 'Accesa', time: '10:30' }, onRetry: NOOP, homeAssistantHref: '#' }} />
        <PanelStates state={{ kind: 'stale', since: '3 h', lastAt: '07:00', battery: 12 }} />
        <PendingState />
      </div>
    </div>
  );
}

function PendingState() {
  const [startedAt, setStartedAt] = React.useState(() => Date.now());
  return (
    <>
      <PanelStates state={{ kind: 'pending', startedAt }} />
      <GlassButton variant="soft" size="lg" onClick={() => setStartedAt(Date.now())}>
        Comando di nuovo
      </GlassButton>
    </>
  );
}

function Board({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <section className={clsx('lab-board', theme === 'dark' ? 'dashboard-theme-dark' : 'dashboard-theme-light')} data-testid={`lab-board-${theme}`} aria-label={theme}>
      <h2>Controlli, tema {theme === 'dark' ? 'scuro' : 'chiaro'}</h2>
      <Controls />
      <h2>Valori: selezione, numeri, interruttori</h2>
      <div className="lab-grid">
        <LabValues />
      </div>
      <h2>Azioni</h2>
      <div className="lab-grid">
        <LabActions />
      </div>
      <h2>Indicatori</h2>
      <div className="lab-grid">
        <LabIndicators />
      </div>
      <h2>Grafici</h2>
      <div className="lab-grid">
        <LabCharts />
      </div>
      <h2>Testo e date</h2>
      <div className="lab-grid">
        <LabText />
      </div>
      <h2>Avanzati</h2>
      <div className="lab-grid">
        <LabAdvanced />
      </div>
      <h2>Modifica del pannello</h2>
      <div className="lab-grid">
        <LabEditor />
      </div>
      <h2>Il pannello</h2>
      <Shapes />
    </section>
  );
}

export default function ComponentsLab() {
  return (
    <main className="lab-page">
      <Board theme="light" />
      <Board theme="dark" />
    </main>
  );
}
