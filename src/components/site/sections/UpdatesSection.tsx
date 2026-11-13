import { ArrowUpRight, Layers3, MapPin, Users, Zap } from 'lucide-react';
import { useSiteCopy } from '../i18n/SiteLocaleProvider';
import { SECTION_IDS, SITE_LINKS } from '../tokens';

const ICONS = [Users, MapPin, Layers3, Zap];

export function UpdatesSection() {
  const { updates, meta } = useSiteCopy();
  return (
    <section id={SECTION_IDS.updates} aria-labelledby="updates-title" className="s-updates py-28">
      <div className="s-container">
        <p className="s-label mb-6">{updates.label}</p>
        <h2 id="updates-title" className="s-title text-white">
          {updates.title}<br /><span className="s-mute">{updates.titleMuted}</span>
        </h2>
        <p className="s-lead mt-6 max-w-2xl">{updates.lead}</p>
        <div className="s-update-grid mt-12">
          {updates.items.map((item, index) => {
            const Icon = ICONS[index];
            return (
              <article key={item.title}>
                <Icon size={24} aria-hidden="true" className="text-[var(--s-blue)]" />
                <p className="s-label mt-6">{updates.released}</p>
                <h3>{item.title}</h3><p>{item.text}</p>
              </article>
            );
          })}
        </div>
        <a href={SITE_LINKS.changelog} target="_blank" rel="noopener noreferrer" className="s-text-link mt-8">
          {updates.changelog}<ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only">{meta.newTab}</span>
        </a>
      </div>
    </section>
  );
}
