import { usePanelEditorWords } from '../../i18n/panelEditorTranslations';
import { EntityPicker, type PickerEntity } from '../editor/EntityPicker';
import { FoldRow } from '../editor/FoldRow';
import { GlassButton } from '../ui/GlassButton';

export type ExtraEntityRowProps = {
  label: string;
  /** The one chosen by the user. */
  chosen?: string;
  /** The one the card finds by itself when none is chosen. */
  automatic?: string;
  /** What the card reads when it has neither. */
  fallback?: string;
  /** One of the same device that fits, offered when the card does not find it by itself. */
  suggested?: string;
  entities: readonly PickerEntity[];
  compatible: (entityId: string) => boolean;
  near?: { deviceId?: string; areaId?: string };
  nameOf: (entityId: string) => string;
  open: boolean;
  onToggle: () => void;
  onChange: (entityId: string | undefined) => void;
};

/* An entity of the same device that tells something more about the card: found by itself where the card can, and changed here. */
export function ExtraEntityRow({ label, chosen, automatic, fallback, suggested, entities, compatible, near, nameOf, open, onToggle, onChange }: ExtraEntityRowProps) {
  const words = usePanelEditorWords();
  const value = chosen ? nameOf(chosen) : automatic ? `${nameOf(automatic)} · ${words('foundByItself')}` : fallback ?? words('none');
  return (
    <FoldRow label={label} value={value} open={open} onToggle={onToggle}>
      <div className="panel-editor-extra">
        {chosen ? (
          <GlassButton variant="text" onClick={() => onChange(undefined)}>
            {automatic || fallback ? words('backToAutomatic') : words('removeChoice')}
          </GlassButton>
        ) : suggested ? (
          <GlassButton variant="soft" onClick={() => onChange(suggested)}>
            {words('useSuggested', { name: nameOf(suggested) })}
          </GlassButton>
        ) : null}
        <EntityPicker entities={entities} compatible={compatible} near={near} selected={chosen ?? automatic} showFilters={false} onPick={onChange} />
      </div>
    </FoldRow>
  );
}

export default ExtraEntityRow;
