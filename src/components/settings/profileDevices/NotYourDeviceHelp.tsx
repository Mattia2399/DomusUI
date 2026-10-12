import { ChevronDown, HelpCircle } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider';

/**
 * How to move a phone to the right person when its Home Assistant app was
 * signed in with someone else's account. Home Assistant decides who owns a
 * device, so the fix happens in the app; Domus follows it by itself.
 */
export function NotYourDeviceHelp() {
  const { t } = useI18n();
  return (
    <details className="group" data-testid="not-your-device-help">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-[color:var(--ui-text-secondary)] [&::-webkit-details-marker]:hidden">
        <HelpCircle size={15} aria-hidden="true" />
        {t('profile.devices.notYours.title')}
        <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <p className="mt-1 text-xs leading-5 text-[color:var(--ui-text-secondary)]">{t('profile.devices.notYours.body')}</p>
    </details>
  );
}

export default NotYourDeviceHelp;
