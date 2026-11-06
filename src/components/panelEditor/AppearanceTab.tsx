import { usePanelEditorWords } from '../../i18n/panelEditorTranslations';
import { FoldRow, useOneOpen } from '../editor/FoldRow';
import { SizePicker } from '../editor/SizePicker';
import { GlassButton } from '../ui/GlassButton';
import { GlassConfirm } from '../ui/GlassConfirm';
import { GlassSegmented } from '../ui/GlassSegmented';
import { GlassTextInput } from '../ui/GlassTextInput';
import type { PanelEditorProps } from './panelEditorTypes';
import { copyRuleToCard, removeRule, typeRuleBreakpoints } from './typeRule';

type AppearanceProps = Pick<PanelEditorProps, 'widget' | 'breakpoint' | 'cardPreview' | 'size' | 'lightGrowth' | 'overrides' | 'onUpdateWidget' | 'onRemove'> & {
  /** On a tablet the preview of the card stands in the left column. */
  showPreview: boolean;
};

/* How the card appears in the Home: its size, its name, and, apart, taking it away. */
export function AppearanceTab({ widget, breakpoint, cardPreview, size, lightGrowth, overrides, onUpdateWidget, onRemove, showPreview }: AppearanceProps) {
  const words = usePanelEditorWords();
  const fold = useOneOpen<'name'>();
  const kind = words(`kind_${widget.kind}` as never);
  const sizeWords: Record<string, string> = { mini: words('sizeMini'), standard: words('sizeStandard'), expanded: words('sizeExpanded') };
  const ruled = typeRuleBreakpoints(overrides.byType, overrides.byCard);
  const ruleHere = ruled.includes(breakpoint);
  return (
    <div className="panel-editor-tab">
      {showPreview ? <div className="panel-editor-card-preview">{cardPreview}</div> : null}
      {ruleHere ? (
        <div className="panel-editor-notice" role="note">
          <b>{words('typeRule', { kind })}</b>
          <GlassButton variant="soft" onClick={() => copyRuleToCard(overrides.byType, ruled, overrides.setForCard)}>
            {words('typeRuleOwn')}
          </GlassButton>
          <GlassConfirm
            label={words('typeRuleRemove')}
            question={words('typeRuleRemoveConfirm', { kind })}
            confirmLabel={words('typeRuleRemove')}
            cancelLabel={words('cancel')}
            onConfirm={() => removeRule(overrides.byType, overrides.setForType)}
          />
        </div>
      ) : null}
      <section>
        <h4 className="panel-editor-heading">{words('size')}</h4>
        <SizePicker label={words('size')} options={size.options.map((option) => ({ ...option, label: sizeWords[option.id] ?? option.label }))} value={size.active} current={size.current} onChange={size.pick} />
      </section>
      {lightGrowth ? (
        <section>
          <h4 className="panel-editor-heading">{words('lightGrowth')}</h4>
          <GlassSegmented<'grow' | 'stay'>
            ariaLabel={words('lightGrowth')}
            options={[
              { value: 'grow', label: words('lightGrows') },
              { value: 'stay', label: words('lightStays') },
            ]}
            value={lightGrowth.on ? 'grow' : 'stay'}
            disabled={!lightGrowth.available}
            onChange={(next) => lightGrowth.set(next === 'grow')}
          />
          <p className="panel-editor-note">{lightGrowth.available ? words('lightGrowsNote') : words('lightCannotGrow')}</p>
        </section>
      ) : null}
      <FoldRow label={words('name')} value={widget.title} open={fold.isOpen('name')} onToggle={() => fold.toggle('name')}>
        <GlassTextInput
          label={words('name')}
          value={widget.title}
          clearLabel={words('clear')}
          maxLength={60}
          describeProblem={() => words('nameTooLong')}
          onCommit={(title) => onUpdateWidget(widget.id, (current) => ({ ...current, title: title.trim() || current.title }))}
        />
      </FoldRow>
      <div className="panel-editor-danger">
        <GlassConfirm label={words('removeCard')} question={words('removeCardConfirm')} confirmLabel={words('removeCard')} cancelLabel={words('cancel')} onConfirm={onRemove} />
      </div>
    </div>
  );
}

export default AppearanceTab;
