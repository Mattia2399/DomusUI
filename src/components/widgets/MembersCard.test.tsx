import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Widget } from '../../types/dashboardModels';
import { MembersCard } from './MembersCard';

const widget: Widget = {
  id: 'members-card-test',
  kind: 'members',
  title: 'Famiglia',
  entityId: 'group.house_members',
  status: 'home',
  isOn: true,
  layout: { i: 'members-card-test', x: 0, y: 0, w: 3, h: 2 },
};

describe('MembersCard', () => {
  afterEach(cleanup);

  it('exposes the registry variant without changing the existing composition', () => {
    const { container, getByTitle } = render(
      <MembersCard
        widget={widget}
        isSelected={false}
        isEditMode={false}
        onClick={() => undefined}
        displayVariant="full"
        houseMembers={[
          { id: 'person.mattia', name: 'Mattia', isCurrent: true },
        ]}
        gridBreakpoint="xl"
      />,
    );

    expect(container.firstElementChild?.getAttribute('data-card-variant')).toBe('full');
    expect(getByTitle('Mattia')).toBeTruthy();
  });

  it('opens the location panel from the card without invoking the dedicated arrow action', () => {
    const onClick = vi.fn();
    const onOpenMembersPanel = vi.fn();
    const { getByRole } = render(
      <MembersCard
        widget={widget}
        isSelected={false}
        isEditMode={false}
        onClick={onClick}
        onOpenMembersPanel={onOpenMembersPanel}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Apri Famiglia' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onOpenMembersPanel).not.toHaveBeenCalled();
  });

  it('opens People and access from the arrow without triggering the card overlay', () => {
    const onClick = vi.fn();
    const onOpenMembersPanel = vi.fn();
    const { getByRole } = render(
      <MembersCard
        widget={widget}
        isSelected={false}
        isEditMode={false}
        onClick={onClick}
        onOpenMembersPanel={onOpenMembersPanel}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Apri pannello membri' }));

    expect(onOpenMembersPanel).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the arrow inert in edit mode while the card click remains a selection action', () => {
    const onClick = vi.fn();
    const onOpenMembersPanel = vi.fn();
    const { getByRole } = render(
      <MembersCard
        widget={widget}
        isSelected={false}
        isEditMode
        onClick={onClick}
        onOpenMembersPanel={onOpenMembersPanel}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Apri pannello membri' }));
    fireEvent.click(getByRole('button', { name: 'Apri Famiglia' }));

    expect(onOpenMembersPanel).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
