import React, { useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AmbientBackground, AmbientProvider, useAmbient } from './AmbientProvider';
import type { AmbientRequest } from './ambientModel';

function Page({ request }: { request: AmbientRequest | null }) {
  useAmbient(request);
  return null;
}

const glow = () => screen.getByTestId('ambient-background').firstElementChild as HTMLElement;
const colors = () => [glow().style.getPropertyValue('--ambient-a'), glow().style.getPropertyValue('--ambient-b')];

afterEach(cleanup);

describe('the Dynamic background', () => {
  it('shows blue and violet when no page asks for anything', () => {
    render(
      <AmbientProvider enabled>
        <AmbientBackground />
      </AmbientProvider>,
    );
    expect(colors()).toEqual(['#0A84FF', '#BF5AF2']);
    expect(glow().dataset.intensity).toBe('base');
    expect(screen.getByTestId('ambient-background').dataset.pulse).toBeUndefined();
  });

  it('follows the page mounted last, and returns to the previous one and then to the base', () => {
    let setPages: (pages: string[]) => void = () => {};
    const requests: Record<string, AmbientRequest> = {
      rooms: { a: '#FF9F0A', b: '#FF375F' },
      security: { a: '#FF453A', b: '#FF375F', intensity: 'subtle', pulse: true },
    };
    function Shell() {
      const [pages, set] = useState<string[]>([]);
      setPages = set;
      return (
        <AmbientProvider enabled>
          <AmbientBackground />
          {pages.map((page) => (
            <Page key={page} request={requests[page]} />
          ))}
        </AmbientProvider>
      );
    }
    render(<Shell />);
    act(() => setPages(['rooms']));
    expect(colors()).toEqual(['#FF9F0A', '#FF375F']);
    act(() => setPages(['rooms', 'security']));
    expect(colors()).toEqual(['#FF453A', '#FF375F']);
    expect(glow().dataset.intensity).toBe('subtle');
    expect(screen.getByTestId('ambient-background').dataset.pulse).toBe('true');
    act(() => setPages(['rooms']));
    expect(colors()).toEqual(['#FF9F0A', '#FF375F']);
    act(() => setPages([]));
    expect(colors()).toEqual(['#0A84FF', '#BF5AF2']);
  });

  it('follows a page whose colours change, and a page that asks for nothing does not win', () => {
    let setColor: (color: string) => void = () => {};
    function Rooms() {
      const [color, set] = useState('#FF9F0A');
      setColor = set;
      return <Page request={{ a: color, b: '#FF375F' }} />;
    }
    render(
      <AmbientProvider enabled>
        <AmbientBackground />
        <Rooms />
        <Page request={null} />
      </AmbientProvider>,
    );
    expect(colors()[0]).toBe('#FF9F0A');
    act(() => setColor('#5E5CE6'));
    expect(colors()[0]).toBe('#5E5CE6');
  });

  it('draws nothing unless the Dynamic background is chosen', () => {
    render(
      <AmbientProvider enabled={false}>
        <AmbientBackground />
        <Page request={{ a: '#FF9F0A', b: '#FF375F' }} />
      </AmbientProvider>,
    );
    expect(screen.queryByTestId('ambient-background')).toBeNull();
  });

  it('lets a page ask outside a provider without effect', () => {
    expect(() => render(<Page request={{ a: '#FF9F0A', b: '#FF375F' }} />)).not.toThrow();
  });
});
