import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Settings } from 'lucide-react';
import { PageHeader, PageHeaderButton } from './PageHeader';

afterEach(cleanup);

describe('PageHeader', () => {
  it('shows ‹ only when there is somewhere to go back to', () => {
    const { rerender } = render(<PageHeader title="Sicurezza" />);
    expect(screen.queryByRole('button')).toBeNull();

    const onBack = vi.fn();
    rerender(<PageHeader title="Sicurezza" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has no text label beside ‹: its name is only spoken', () => {
    render(<PageHeader title="Sensori" onBack={vi.fn()} backLabel="Torna a Sicurezza" />);
    const back = screen.getByRole('button', { name: 'Torna a Sicurezza' });
    expect(back.textContent).toBe('');
  });

  it('keeps ‹, title and tools on one row, and the detail under it', () => {
    render(
      <PageHeader
        title="Sicurezza"
        detail="Disinserito · tutto chiuso"
        onBack={vi.fn()}
        tools={<PageHeaderButton label="Impostazioni" icon={<Settings size={20} />} onClick={vi.fn()} />}
      />,
    );
    const row = screen.getByRole('heading', { level: 1, name: 'Sicurezza' }).parentElement!;
    expect(row.className).toContain('page-header-row');
    expect(row.contains(screen.getByRole('button', { name: 'Indietro' }))).toBe(true);
    expect(row.contains(screen.getByRole('button', { name: 'Impostazioni' }))).toBe(true);
    expect(row.contains(screen.getByText('Disinserito · tutto chiuso'))).toBe(false);
  });

  it('is a level 2 heading in a subpage, and hands its title to whoever moves the focus', () => {
    const titleRef = createRef<HTMLHeadingElement>();
    render(<PageHeader title="Sensori" headingLevel={2} titleId="sub-title" titleRef={titleRef} />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Sensori' });
    expect(titleRef.current).toBe(heading);
    expect(heading.id).toBe('sub-title');
    expect(heading.tabIndex).toBe(-1);
  });
});

describe('PageHeaderButton', () => {
  it('says when a tool stays on', () => {
    const onClick = vi.fn();
    render(<PageHeaderButton label="Fissa nella barra" icon={<span />} onClick={onClick} pressed />);
    const pin = screen.getByRole('button', { name: 'Fissa nella barra' });
    expect(pin.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pin);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('the ‹ of PageHeader', () => {
  it('is of the neutral glass of the app, never tinted by the function; the tools keep theirs', () => {
    render(<PageHeader title="Sensori" onBack={vi.fn()} tools={<PageHeaderButton label="Impostazioni" icon={<span />} onClick={vi.fn()} />} />);
    const back = screen.getByRole('button', { name: 'Indietro' });
    expect(back.className).toContain('liquid-glass-control');
    expect(back.className).not.toContain('page-glass');
    expect(screen.getByRole('button', { name: 'Impostazioni' }).className).toContain('page-glass');
  });
});
