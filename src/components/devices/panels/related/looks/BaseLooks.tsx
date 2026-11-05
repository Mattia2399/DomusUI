import React from 'react';
import { Circle } from 'lucide-react';
import { GlassButton } from '../../../../ui/GlassButton';
import { GlassChips } from '../../../../ui/GlassChips';
import { GlassChoiceRows, GlassListRow } from '../../../../ui/GlassListRow';
import { GlassSegmented } from '../../../../ui/GlassSegmented';
import { GlassSlider } from '../../../../ui/GlassSlider';
import { GlassStepper } from '../../../../ui/GlassStepper';
import { GlassSwitch } from '../../../../ui/GlassSwitch';
import { GlassTiles } from '../../../../ui/GlassTiles';
import { GlassToggleRow } from '../../../../ui/GlassToggleRow';
import { GlassVerticalSlider } from '../../../../ui/GlassVerticalSlider';
import type { RelatedLookProps } from '../relatedLookTypes';
import { formatRelatedValue } from '../relatedModel';

/* The looks made of what the panels already load: they need no piece of their own. */
export default function BaseLooks({ look, model, form, acts, commit, locale, words }: RelatedLookProps) {
  const value = formatRelatedValue(model, locale);
  const options = model.options.map((option) => ({ value: option, label: option }));
  const number = model.number ?? model.min ?? 0;
  const limits = { min: model.min ?? 0, max: model.max ?? 100, step: model.step ?? 1 };

  switch (look) {
    case 'segmented':
      if (form === 'hero') return <GlassChoiceRows ariaLabel={model.name} options={options} value={model.state} onChange={acts.setOption} size="hero" />;
      if (form === 'compact') return <GlassChips ariaLabel={model.name} options={options} value={model.state} onChange={(next) => acts.setOption(String(next))} />;
      return <GlassSegmented<string> ariaLabel={model.name} options={options} value={model.state} onChange={acts.setOption} tone="device" />;
    case 'list':
    case 'radio':
      return <GlassChoiceRows ariaLabel={model.name} options={options} value={model.state} onChange={acts.setOption} size={form === 'hero' ? 'hero' : 'default'} />;
    case 'tiles':
      return <GlassTiles ariaLabel={model.name} options={model.options.map((option) => ({ value: option, label: option, icon: <Circle size={18} /> }))} value={model.state} onChange={acts.setOption} tone="device" size={form === 'hero' ? 'hero' : undefined} />;
    case 'bar':
    case 'bar-value':
      if (form === 'hero') return <GlassVerticalSlider label={model.name} value={number} {...limits} commit={commit} display={value} valueText={value} onValueChange={acts.setNumber} />;
      return <GlassSlider variant="bar" tone="device" label={model.name} value={number} {...limits} commit={commit} valueText={value} valueInFill={look === 'bar-value' ? value : undefined} size={form === 'compact' ? 'compact' : 'default'} onValueChange={acts.setNumber} />;
    case 'stepper':
      return <GlassStepper label={model.name} decreaseLabel={words('decrease')} increaseLabel={words('increase')} value={number} {...limits} format={(next) => formatRelatedValue({ ...model, number: next }, locale)} showLimits={form !== 'compact'} size={form} onValueChange={acts.setNumber} />;
    case 'toggle-row':
      return <GlassToggleRow checked={model.on} onChange={acts.setOn} title={model.name} description={model.on ? words('on') : words('off')} />;
    case 'icon-toggle':
      return <GlassSwitch label={model.name} size="mini" checked={model.on} onChange={acts.setOn} />;
    case 'push':
      return <GlassButton variant="soft" size="lg" className="related-wide" onClick={acts.press}>{model.name}</GlassButton>;
    case 'page':
      return <GlassListRow title={model.name} opens onPress={acts.go} />;
    default:
      return null;
  }
}
