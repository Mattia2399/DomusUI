import React from 'react';
import { createPortal } from 'react-dom';
import { usePanelEditorWords } from '../../i18n/panelEditorTranslations';
import { PanelHost } from '../devices/panels/PanelHost';
import { GlassButton } from '../ui/GlassButton';
import { GlassSegmented } from '../ui/GlassSegmented';
import { AppearanceTab } from './AppearanceTab';
import type { PanelEditorProps } from './panelEditorTypes';
import './panelEditor.css';

export type PanelEditorTab = 'appearance' | 'device' | 'controls';

/*
 * The edit mode of a card: Aspetto, Dispositivo, Controlli. On a phone it stands in the
 * sheet of the sidebar; on a tablet or a desktop it opens its own dialog of two columns,
 * and the sidebar only says that the card is being edited. It arrives only in edit mode.
 */
export default function PanelEditor(props: PanelEditorProps) {
  const words = usePanelEditorWords();
  const [tab, setTab] = React.useState<PanelEditorTab>('appearance');
  // Fine closes the dialog; the card stays selected and the sidebar can open it again.
  const [closed, setClosed] = React.useState(false);
  React.useEffect(() => {
    setTab('appearance');
    setClosed(false);
  }, [props.widget.id]);
  const tabs = (
    <GlassSegmented<PanelEditorTab>
      ariaLabel={words('tabs')}
      options={[
        { value: 'appearance', label: words('tabAppearance') },
        { value: 'device', label: words('tabDevice') },
        { value: 'controls', label: words('tabControls') },
      ]}
      value={tab}
      onChange={setTab}
    />
  );
  const content = (showPreview: boolean) =>
    tab === 'appearance' ? (
      <AppearanceTab {...props} showPreview={showPreview} />
    ) : (
      <p className="panel-editor-note">{words('comingNext')}</p>
    );

  if (props.compact) {
    return (
      <div className="panel-editor is-sheet" data-testid="panel-editor">
        {tabs}
        <div className="panel-editor-scroll">{content(true)}</div>
      </div>
    );
  }

  return (
    <>
      <div className="panel-editor is-side dashboard-content-surface-soft" data-testid="panel-editor-side">
        <p className="panel-editor-note">{closed ? props.widget.title : words('editing', { name: props.widget.title })}</p>
        {closed ? (
          <GlassButton variant="soft" onClick={() => setClosed(false)}>
            {words('reopen')}
          </GlassButton>
        ) : null}
      </div>
      {createPortal(
        <PanelHost presentation="dialog" wide isOpen={!closed} onClose={() => setClosed(true)} title={words('editTitle', { name: props.widget.title })}>
          <div className="panel-editor is-dialog" data-testid="panel-editor">
            <header className="panel-editor-head">
              <span>
                <b>{words('edit')}</b>
                <span>{props.widget.title}</span>
              </span>
              <GlassButton variant="filled" onClick={() => setClosed(true)}>
                {words('done')}
              </GlassButton>
            </header>
            <div className="panel-editor-columns">
              <div className="panel-editor-left">
                <p className="panel-editor-heading">{words('cardPreview')}</p>
                <div className="panel-editor-card-preview">{props.cardPreview}</div>
              </div>
              <div className="panel-editor-right">
                {tabs}
                <div className="panel-editor-scroll">{content(false)}</div>
              </div>
            </div>
          </div>
        </PanelHost>,
        document.body,
      )}
    </>
  );
}
