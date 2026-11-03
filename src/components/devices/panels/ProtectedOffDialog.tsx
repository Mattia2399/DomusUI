import { Plug } from 'lucide-react';
import { useDevicesTranslations } from '../../../i18n/devicesTranslations';
import GlassConfirmDialog from '../../ui/GlassConfirmDialog';

/* The question a protected device asks before turning off, loaded when it asks. */

export function ProtectedOffDialog({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  const dt = useDevicesTranslations();
  return (
    <GlassConfirmDialog
      isOpen
      onClose={onClose}
      icon={<Plug size={22} strokeWidth={2} />}
      title={dt('confirmOffTitle', { name })}
      description={dt('confirmOffText')}
      cancelLabel={dt('cancel')}
      confirmLabel={dt('turnOffShort')}
      onConfirm={() => {
        onConfirm();
        onClose();
      }}
    />
  );
}

export default ProtectedOffDialog;
