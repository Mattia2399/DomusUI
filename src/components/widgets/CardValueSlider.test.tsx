import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardValueSlider } from './CardValueSlider';

describe('CardValueSlider', () => {
  afterEach(cleanup);

  it('previews while dragging and commits only on release', () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const { getByRole, container } = render(
      <CardValueSlider
        value={50}
        min={0}
        max={100}
        step={1}
        label="Velocità"
        valueText="50%"
        tone="fan"
        segmentCount={4}
        snap={(value) => Math.round(value / 25) * 25}
        onPreview={onPreview}
        onCommit={onCommit}
        onCancel={() => undefined}
      />,
    );

    const slider = getByRole('slider', { name: 'Velocità' });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '63' } });
    expect(onPreview).toHaveBeenLastCalledWith(75);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(slider, { target: { value: '63' } });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(75);
    expect(container.querySelector('[data-segmented="true"]')).not.toBeNull();
  });

  it('commits one discrete speed step from the keyboard', () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <CardValueSlider
        value={50}
        min={0}
        max={100}
        step={1}
        label="Velocità"
        valueText="50%"
        tone="fan"
        segmentCount={4}
        snap={(value) => Math.round(value / 25) * 25}
        onPreview={() => undefined}
        onCommit={onCommit}
        onCancel={() => undefined}
      />,
    );
    fireEvent.keyDown(getByRole('slider'), { key: 'ArrowRight' });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(75);
  });
});
