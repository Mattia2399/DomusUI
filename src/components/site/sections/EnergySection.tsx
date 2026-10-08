import { ArrowUpRight, BatteryCharging, House, PlugZap, Sun, UtilityPole } from 'lucide-react';
import energyAvif from '../../../../public/images/energy/mobile/grid-solar-battery-ev.avif';
import energyWebp from '../../../../public/images/energy/mobile/grid-solar-battery-ev.webp';
import { useSiteCopy } from '../i18n/SiteLocaleProvider';
import { SECTION_IDS, SITE_LINKS } from '../tokens';

const MODULE_ICONS = [UtilityPole, Sun, House, BatteryCharging, PlugZap];

export function EnergySection() {
  const { energy, meta } = useSiteCopy();
  return (
    <section id={SECTION_IDS.energy} aria-labelledby="energy-title" className="s-energy py-28 md:py-40">
      <div className="s-container">
        <div className="s-energy-heading">
          <div>
            <p className="s-label mb-6">{energy.label}</p>
            <h2 id="energy-title" className="s-title text-white">
              {energy.title}<br /><span className="s-mute">{energy.titleMuted}</span>
            </h2>
          </div>
          <div>
            <p className="s-chip mb-5" style={{ color: 'var(--s-beta)' }}><span className="s-dot" />{energy.status}</p>
            <p className="s-lead">{energy.lead}</p>
          </div>
        </div>

        <div className="s-energy-body mt-12">
          <figure className="s-energy-visual">
            <ul className="s-energy-modules" aria-label={energy.label}>
              {energy.modules.map((label, index) => {
                const Icon = MODULE_ICONS[index];
                return <li key={label}><Icon size={18} aria-hidden="true" /><span>{label}</span></li>;
              })}
            </ul>
            <picture>
              <source srcSet={energyAvif} type="image/avif" />
              <img src={energyWebp} alt={energy.imageAlt} width="768" height="1376" loading="lazy" decoding="async" />
            </picture>
            <figcaption>{energy.imageCaption}</figcaption>
          </figure>
          <div className="s-energy-features">
            {energy.facts.map((fact, index) => (
              <article key={fact.title}>
                <span className="s-label" aria-hidden="true">0{index + 1}</span>
                <div><h3>{fact.title}</h3><p>{fact.text}</p></div>
              </article>
            ))}
          </div>
        </div>

        <div className="s-energy-notes mt-8">
          <div><h3>{energy.localTitle}</h3><p>{energy.localText}</p></div>
          <div><h3>{energy.historyTitle}</h3><p>{energy.historyText}</p></div>
        </div>
        <a href={SITE_LINKS.energy} target="_blank" rel="noopener noreferrer" className="s-text-link mt-8">
          {energy.docs}<ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only">{meta.newTab}</span>
        </a>
      </div>
    </section>
  );
}
