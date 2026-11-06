import React from 'react';
import { EntityPicker, type PickerEntity } from '../../../components/editor/EntityPicker';
import { FoldRow, useOneOpen } from '../../../components/editor/FoldRow';
import { IconPicker } from '../../../components/editor/IconPicker';
import { EDITOR_ICONS } from '../../../components/editor/editorIcons';
import { LookPicker } from '../../../components/editor/LookPicker';
import { ReorderList } from '../../../components/editor/ReorderList';
import { SizePicker } from '../../../components/editor/SizePicker';
import { GlassLevels } from '../../../components/ui/GlassLevels';
import { GlassStepper } from '../../../components/ui/GlassStepper';
import { LabCard, LabNamed } from './labShared';

const ENTITIES: PickerEntity[] = [
  { entityId: 'sensor.stufa_fumi', name: 'Fumi', areaId: 'living', areaName: 'Soggiorno', deviceId: 'stove' },
  { entityId: 'number.stufa_potenza', name: 'Potenza fiamma', areaId: 'living', areaName: 'Soggiorno', deviceId: 'stove' },
  { entityId: 'number.stufa_acqua', name: 'Setpoint acqua', areaId: 'living', areaName: 'Soggiorno', deviceId: 'stove' },
  { entityId: 'sensor.soggiorno_umidita', name: 'Umidità', areaId: 'living', areaName: 'Soggiorno' },
  { entityId: 'sensor.boiler', name: 'Boiler ACS', areaId: 'laundry', areaName: 'Lavanderia' },
  { entityId: 'switch.priorita', name: 'Priorità ACS', areaId: 'laundry', areaName: 'Lavanderia' },
  { entityId: 'light.garden', name: 'Giardino' },
];

export function LabEditor() {
  const [picked, setPicked] = React.useState<string>();
  const fold = useOneOpen<'name' | 'icon' | 'place'>();
  const [icon, setIcon] = React.useState<string | undefined>('flame');
  const [size, setSize] = React.useState<string | null>(null);
  const sizes = [
    { id: 'mini', label: 'Mini', w: 2, h: 2 },
    { id: 'standard', label: 'Standard', w: 2, h: 4 },
    { id: 'expanded', label: 'Espansa', w: 4, h: 4 },
  ];
  const [items, setItems] = React.useState([
    { id: 'modes', name: 'Modalità', note: 'Pulsanti affiancati · della stufa' },
    { id: 'power', name: 'Potenza', note: 'Livelli · della stufa' },
    { id: 'water', name: 'Acqua', note: 'Pulsanti + e − · della stufa' },
    { id: 'boiler', name: 'Boiler', note: 'Valore con scala · da Lavanderia' },
  ]);
  const [look, setLook] = React.useState<'levels' | 'stepper'>('levels');
  const [power, setPower] = React.useState(3);
  return (
    <>
      <LabCard id="ED-entity" title="EntityPicker">
        <div style={{ height: 420, display: 'flex', flexDirection: 'column' }}>
          <EntityPicker entities={ENTITIES} near={{ deviceId: 'stove', areaId: 'living' }} used={new Set(['sensor.boiler'])} selected={picked} onPick={setPicked} />
        </div>
      </LabCard>
      <LabCard id="ED-fold" title="FoldRow">
        <FoldRow label="Nome" value="Termostufa" open={fold.isOpen('name')} onToggle={() => fold.toggle('name')}>
          <span>Il campo del nome</span>
        </FoldRow>
        <FoldRow label="Icona" value="Fiamma" open={fold.isOpen('icon')} onToggle={() => fold.toggle('icon')}>
          <IconPicker label="Icona" value={icon} onChange={setIcon} icons={EDITOR_ICONS} />
        </FoldRow>
        <FoldRow label="Posto" value="In Altro" open={fold.isOpen('place')} onToggle={() => fold.toggle('place')}>
          <span>In primo piano, In Altro, Nascosto</span>
        </FoldRow>
      </LabCard>
      <LabCard id="ED-size" title="SizePicker">
        <LabNamed name="misura vecchia"><SizePicker label="Misura" options={sizes} value={size} current={{ w: 3, h: 4 }} onChange={(option) => setSize(option.id)} /></LabNamed>
        <LabNamed name="nuova"><SizePicker label="Misura" options={sizes} value={size ?? 'standard'} onChange={(option) => setSize(option.id)} /></LabNamed>
      </LabCard>
      <LabCard id="ED-order" title="ReorderList">
        <ReorderList label="Ordine" items={items} onReorder={(ids) => setItems(ids.map((id) => items.find((item) => item.id === id)!))} renderItem={(item) => <span style={{ display: 'flex', flexDirection: 'column', padding: '8px 0' }}><b>{item.name}</b><small>{item.note}</small></span>} />
      </LabCard>
      <LabCard id="ED-look" title="LookPicker">
        <LookPicker<'levels' | 'stepper'>
          label="Aspetto"
          looks={['levels', 'stepper']}
          recommended="levels"
          value={look}
          onChange={setLook}
          preview={(chosen, form) =>
            chosen === 'levels' ? (
              <GlassLevels ariaLabel="Potenza" levels={[1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))} value={power} onChange={setPower} size={form} />
            ) : (
              <GlassStepper label="Potenza" decreaseLabel="Meno" increaseLabel="Più" value={power} min={1} max={5} onValueChange={setPower} size={form} />
            )
          }
        />
      </LabCard>
    </>
  );
}
