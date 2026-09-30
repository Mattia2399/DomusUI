import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LocateFixed } from 'lucide-react';
import type { Map as MapLibreMap, MapOptions, Marker as MapLibreMarker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '../../i18n/I18nProvider';
import type { DashboardAppearance } from '../../theme/dashboardTheme';
import type { ActiveDevice } from './types';

type MembersMapPoint = NonNullable<ActiveDevice['membersMapPoints']>[number];
type MembersMapInitialViewState =
  | { longitude: number; latitude: number; zoom: number }
  | {
      bounds: [number, number, number, number];
      fitBoundsOptions: { padding: number; maxZoom: number };
    };

type MembersLocationMapProps = {
  points: MembersMapPoint[];
  theme: DashboardAppearance;
};

const MEMBERS_MAP_LIGHT_STYLE_URL = new URL(
  '../../assets/map-styles/members-light.style.json',
  import.meta.url,
).toString();
const MEMBERS_MAP_DARK_STYLE_URL = new URL(
  '../../assets/map-styles/members-dark.style.json',
  import.meta.url,
).toString();

export function buildMembersMapInitialViewState(points: MembersMapPoint[]): MembersMapInitialViewState {
  if (points.length === 0) {
    return { longitude: 12.4964, latitude: 41.9028, zoom: 4 };
  }
  if (points.length === 1) {
    return {
      longitude: points[0].longitude,
      latitude: points[0].latitude,
      zoom: 12.2,
    };
  }

  let minLongitude = Number.POSITIVE_INFINITY;
  let maxLongitude = Number.NEGATIVE_INFINITY;
  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;

  points.forEach((point) => {
    minLongitude = Math.min(minLongitude, point.longitude);
    maxLongitude = Math.max(maxLongitude, point.longitude);
    minLatitude = Math.min(minLatitude, point.latitude);
    maxLatitude = Math.max(maxLatitude, point.latitude);
  });

  const hasArea =
    Math.abs(maxLongitude - minLongitude) > 0.000001 ||
    Math.abs(maxLatitude - minLatitude) > 0.000001;

  if (!hasArea) {
    return {
      longitude: points[0].longitude,
      latitude: points[0].latitude,
      zoom: 12.2,
    };
  }

  return {
    bounds: [minLongitude, minLatitude, maxLongitude, maxLatitude],
    fitBoundsOptions: {
      padding: 36,
      maxZoom: 14,
    },
  };
}

export function MembersLocationMap({ points, theme }: MembersLocationMapProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [runtimeError, setRuntimeError] = useState<Error | null>(null);
  const [isReady, setIsReady] = useState(false);
  const mapStyleUrl = theme === 'light' ? MEMBERS_MAP_LIGHT_STYLE_URL : MEMBERS_MAP_DARK_STYLE_URL;
  const currentMember = useMemo(
    () => points.find((point) => point.isCurrent === true) ?? null,
    [points],
  );
  const initialViewState = useMemo(() => buildMembersMapInitialViewState(points), [points]);
  const renderKey = useMemo(
    () => points
      .map(
        (point) =>
          `${point.personEntityId}:${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}:${point.isCurrent ? '1' : '0'}`,
      )
      .join('|'),
    [points],
  );
  const centerOnCurrentMember = useCallback(() => {
    if (!currentMember) {
      return;
    }
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const currentZoom = map.getZoom();
    map.flyTo({
      center: [currentMember.longitude, currentMember.latitude],
      zoom: Number.isFinite(currentZoom) ? Math.max(currentZoom, 12) : 12,
      speed: 0.95,
      essential: true,
    });
  }, [currentMember]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let cancelled = false;
    let map: MapLibreMap | null = null;
    let resizeFrame: number | undefined;
    const markers: MapLibreMarker[] = [];
    const markerRoots: Root[] = [];
    setRuntimeError(null);
    setIsReady(false);

    void import('./maplibreRuntime')
      .then(({ default: maplibre }) => {
        if (cancelled) {
          return;
        }

        const options: MapOptions = {
          container,
          style: mapStyleUrl,
          attributionControl: false,
          dragRotate: false,
          touchPitch: false,
          pitchWithRotate: false,
          maxPitch: 0,
          minZoom: 2,
          maxZoom: 17,
        };
        if ('bounds' in initialViewState) {
          options.bounds = initialViewState.bounds;
          options.fitBoundsOptions = initialViewState.fitBoundsOptions;
        } else {
          options.center = [initialViewState.longitude, initialViewState.latitude];
          options.zoom = initialViewState.zoom;
        }

        map = new maplibre.Map(options);
        mapRef.current = map;
        points.forEach((point) => {
          const markerElement = document.createElement('div');
          const markerRoot = createRoot(markerElement);
          markerRoot.render(<MemberLocationMarker point={point} />);
          markerRoots.push(markerRoot);
          markers.push(
            new maplibre.Marker({ element: markerElement, anchor: 'center' })
              .setLngLat([point.longitude, point.latitude])
              .addTo(map as MapLibreMap),
          );
        });

        map.once('load', () => {
          if (!cancelled) {
            map?.resize();
            setIsReady(true);
          }
        });
        resizeFrame = window.requestAnimationFrame(() => map?.resize());
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRuntimeError(error instanceof Error ? error : new Error(String(error)));
        }
      });

    return () => {
      cancelled = true;
      if (resizeFrame !== undefined) {
        window.cancelAnimationFrame(resizeFrame);
      }
      markers.forEach((marker) => marker.remove());
      markerRoots.forEach((root) => root.unmount());
      map?.remove();
      if (mapRef.current === map) {
        mapRef.current = null;
      }
    };
  }, [initialViewState, mapStyleUrl, points, renderKey]);

  if (runtimeError) {
    throw runtimeError;
  }

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      {!isReady ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[color:var(--ui-surface-soft)] text-xs text-[color:var(--ui-text-secondary)]"
          aria-busy="true"
        >
          {t('home.loading.section')}
        </div>
      ) : null}
      <button
        type="button"
        onClick={centerOnCurrentMember}
        disabled={!currentMember}
        className="glass-icon-button absolute right-2 top-2 z-20 h-8 w-8 disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={t('context.members.center')}
        title={
          currentMember
            ? t('context.members.center')
            : t('context.members.positionUnavailable')
        }
      >
        <LocateFixed size={15} />
      </button>
    </>
  );
}

function MemberLocationMarker({ point }: { point: MembersMapPoint }) {
  return (
    <span className="relative flex h-9 w-9 items-center justify-center">
      {point.avatarUrl ? (
        <img
          src={point.avatarUrl}
          alt={`Profilo ${point.name}`}
          className="h-9 w-9 rounded-full border-2 border-[#fff]/95 bg-[#fff]/[0.08] object-cover shadow-[0_6px_16px_rgba(15,23,42,0.4)]"
        />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#fff]/80 bg-[#fff]/[0.08] text-[11px] font-semibold text-[#fff] shadow-[0_6px_16px_rgba(15,23,42,0.4)] backdrop-blur-xl">
          {(point.name.trim().charAt(0) || '?').toUpperCase()}
        </span>
      )}
      <span className="pointer-events-none absolute -inset-1 rounded-full border border-[#fff]/35" />
      {point.isCurrent ? (
        <>
          <span className="pointer-events-none absolute -inset-1.5 rounded-full border border-emerald-300/80" />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[#fff] bg-emerald-400" />
        </>
      ) : null}
    </span>
  );
}
