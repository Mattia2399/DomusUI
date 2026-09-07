import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Building2,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  CirclePlus,
  ChevronRight,
  Fan,
  House,
  HousePlus,
  Layers,
  Leaf,
  Lightbulb,
  Lock,
  MapPinHouse,
  Minus,
  MinusCircle,
  Move,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat2,
  Rows2,
  Rows3,
  Save,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Snowflake,
  Speaker,
  Thermometer,
  Trash2,
  Tv,
  Unlock,
  Video,
  Warehouse,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GRID_ENGINE_BREAKPOINTS, GRID_ENGINE_GAP_PX, GRID_ENGINE_ROW_UNIT_PX } from '../components/dashboard/DashboardGrid';
import {
  resolveWidgetTypeLayoutSpan,
  STACK_GRID_COLS_BY_BREAKPOINT,
  type GridEngineBreakpoint,
} from '../components/dashboard/dashboardBreakpointConfig';
import { RoomClimateCard } from '../components/settings/ClimateControls';
import GlassDropdown, { type GlassDropdownOption } from '../components/ui/GlassDropdown';
import GlassLoader from '../components/ui/GlassLoader';
import GlassSlider from '../components/ui/GlassSlider';
import GlassModal from '../components/ui/GlassModal';
import GlassBottomSheet from '../components/ui/GlassBottomSheet';
import RoomSectionInteractionGuide from '../components/rooms/RoomSectionInteractionGuide';
import { SectionCardRenderer, WidgetCardRenderer } from '../components/widgets/CardRenderer';
import { buildCameraCardModel } from '../components/widgets/cameraCardModel';
import CameraViewer from '../components/camera/CameraViewer';
import type { CameraPtzDirection } from '../components/camera/CameraPtzJoystick';
import { useDashboardState } from '../hooks/useDashboardState';
import type { HaArea } from '../hooks/useHaLiveConnection';
import type { DashboardSection, SceneKey, Widget, WidgetKind } from '../types/dashboardModels';
import type { MockEntityState, MockEntityStateMap } from '../types/ha';
import { normalizeMediaPlayerStateKey } from '../utils/mediaPlayerState';
import type { DashboardRuntimeMode } from '../security/dashboardAccess';
import { useRoomsTranslations, type RoomsTranslator } from '../i18n/roomsTranslations';
import { useI18n } from '../i18n/I18nProvider';

const CUSTOM_ROOMS_STORAGE_KEY = 'ha.dashboard.rooms.customRooms.v1';
const ACTIVE_ROOM_STORAGE_KEY = 'ha.dashboard.rooms.activeRoomId.v1';
const ROOM_ENTITY_VISIBILITY_STORAGE_KEY = 'ha.dashboard.rooms.hiddenEntitiesByRoom.v1';

function getRoomsRuntimeStorageKey(baseKey: string, runtimeMode: DashboardRuntimeMode) {
  return runtimeMode === 'demo' ? `${baseKey}.demo` : baseKey;
}
const ROOM_ID_CUSTOM_PREFIX = 'custom:';
const ROOM_TITLE_TRANSITION = { duration: 0.2, ease: [0.22, 1, 0.36, 1] } as const;
const ROOM_HEADER_COMPACT_SCROLL_PX = 48;
const ROOM_MODAL_INPUT_CLASS =
  'ui-input min-h-10 w-full rounded-xl px-4 py-2.5 text-sm transition-all focus:outline-none';
const ROOM_MODAL_PRIMARY_BUTTON_CLASS =
  'glass-button glass-button-primary min-h-11 rounded-full px-5 text-xs font-semibold active:scale-95 disabled:cursor-wait disabled:opacity-60';
const ROOM_MODAL_SECONDARY_BUTTON_CLASS =
  'glass-button min-h-11 rounded-full px-5 text-xs font-semibold active:scale-95 disabled:cursor-wait disabled:opacity-60';
const ROOM_MODAL_ROW_CLASS =
  'flex items-center justify-between gap-3 border-b border-[color:var(--ui-separator)] p-3.5 transition-all last:border-0 hover:bg-[color:var(--ui-fill-tertiary)]';
const FLOOR_LAYER_BACKGROUND_OPEN_CLASS =
  'scale-95 blur-xl opacity-40 pointer-events-none transition-all duration-500 ease-out';
const FLOOR_LAYER_BACKGROUND_CLOSED_CLASS =
  'scale-100 blur-none opacity-100 transition-all duration-500 ease-out';
const FLOOR_CARD_CLASS =
  'dashboard-content-surface snap-center flex h-80 w-64 flex-shrink-0 cursor-pointer flex-col justify-between rounded-[2rem] p-6 shadow-[0_25px_50px_-12px_var(--ui-shadow)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';
const FLOOR_ADD_CARD_CLASS =
  'snap-center flex h-80 w-64 flex-shrink-0 flex-col items-center justify-center gap-3 rounded-[2rem] border border-dashed border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-6 transition-all duration-200 hover:bg-[color:var(--ui-fill-secondary)] active:scale-[0.98]';
const FLOOR_CAROUSEL_DRAG_THRESHOLD_PX = 6;
const ROOM_TITLE_DRAG_THRESHOLD_PX = 8;
const ROOM_SWIPER_ANIMATION_MS = 280;
const ROOM_SWIPER_FLICK_VELOCITY_PX_PER_MS = 0.42;
const ROOM_SWIPER_MIN_SWIPE_DISTANCE_PX = 44;
const ROOM_SWIPER_MAX_SWIPE_DISTANCE_PX = 96;
const ROOM_SWIPER_WHEEL_LOCK_MS = 360;
const ROOM_SWIPER_SCROLLER_CLASS =
  'flex cursor-grab snap-x snap-mandatory select-none overflow-x-auto overscroll-x-contain [scrollbar-width:none] [touch-action:pan-y] active:cursor-grabbing [&::-webkit-scrollbar]:hidden';
const ROOM_SECTION_PREVIEW_LIMIT = 4;
const ROOM_SENSOR_PREVIEW_LIMIT_BY_BREAKPOINT: Record<GridEngineBreakpoint, number> = {
  '2xl': 6,
  xl: 6,
  lg: 4,
  md: 4,
  sm: 4,
  xs: 3,
};
const ROOM_ACCESSORY_PREVIEW_LIMIT = 8;
const ROOM_LIGHT_OPTIMISTIC_TTL_MS = 5000;
const ROOM_QUICK_SLIDER_DRAFT_TTL_MS = 2500;
const ROOM_SECTION_TARGET_LONG_PRESS_MS = 460;
const ROOM_SECTION_TARGET_LONG_PRESS_CANCEL_PX = 10;
const LIGHT_TOGGLE_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_light_toggle';
const SWITCH_TOGGLE_PENDING_ATTRIBUTE_KEY = '__dashboard_pending_switch_toggle';
const ROOM_WIDGET_CLUSTER_HEADER_HEIGHT_PX = 18;
const ROOM_WIDGET_CLUSTER_CONTENT_GAP_PX = 12;
const ROOM_WIDGET_CLUSTER_PADDING_Y_BY_BREAKPOINT: Record<GridEngineBreakpoint, number> = {
  '2xl': 32,
  xl: 32,
  lg: 32,
  md: 32,
  sm: 32,
  xs: 24,
};
const EMPTY_FLOOR_DRAFT: FloorDraft = {
  name: '',
  aliases: '',
  level: '',
};
const EMPTY_AREA_CREATION_DRAFT: AreaCreationDraft = {
  floorId: '',
  icon: '',
  aliases: '',
  picture: '',
  temperatureEntityId: '',
  humidityEntityId: '',
};

export type RoomTab = {
  id: string;
  name: string;
  source: 'ha' | 'custom';
};

export type CustomRoomRecord = {
  id: string;
  name: string;
  createdAt: number;
};

export type RoomEntityBuckets = {
  lights: string[];
  climates: string[];
  locks: string[];
  medias: string[];
  switches: string[];
  sensors: string[];
  covers: string[];
  cameras: string[];
  weathers: string[];
  others: string[];
};

type RoomQuickTile = {
  id: string;
  title: string;
  domain: string;
  entityId?: string;
  isOn: boolean;
  icon: React.ReactNode;
  isLive: boolean;
  isToggleSupported: boolean;
};

type RoomDoorTile = {
  id: string;
  title: string;
  subtitle: string;
  entityId?: string;
  isClosed: boolean;
  icon: React.ReactNode;
  isLive: boolean;
};

type RoomLightRow = {
  id: string;
  title: string;
  domain: string;
  entityId?: string;
  isLive: boolean;
  isOn: boolean;
  brightnessPct?: number;
};

type RoomWidgetCluster = {
  id: string;
  label: string;
  widgets: Widget[];
};

type RoomAccessoryCard = {
  id: string;
  title: string;
  status: string;
  entityId: string;
  domain: string;
  icon: React.ReactNode;
  isOn: boolean;
};

type HaAreaCreateResult = {
  area_id?: unknown;
  name?: unknown;
  aliases?: unknown;
  floor_id?: unknown;
  humidity_entity_id?: unknown;
  icon?: unknown;
  picture?: unknown;
  temperature_entity_id?: unknown;
};

type HaFloorEntry = {
  floor_id: string;
  name: string;
  aliases?: string[];
  level?: number | null;
  icon?: string | null;
};

type FloorDraft = {
  name: string;
  aliases: string;
  level: string;
};

type FloorAction = 'saving' | 'deleting' | 'reordering';

type FloorCarouselDragState = {
  pointerId: number;
  startX: number;
  scrollLeft: number;
  didMove: boolean;
};

type RoomSwiperDragState = FloorCarouselDragState & {
  startY: number;
  startIndex: number;
  startTime: number;
  slideCount: number;
  slideWidth: number;
};

type RoomSwiperAnimationState = {
  frame: number;
  targetLeft: number;
};

type RoomSectionTargetLongPressState = {
  timerId: number;
  pointerId: number;
  targetId: string;
  startX: number;
  startY: number;
};

type RoomStatusChip = {
  id: string;
  label: string;
  status: string;
  icon: React.ReactNode;
  className: string;
};

type RoomOptimisticToggleState = {
  isOn: boolean;
  brightnessPct?: number;
  expiresAt: number;
};

type RoomQuickSliderDraftState = {
  value: number;
  expiresAt: number;
};

type AreaCreationDraft = {
  floorId: string;
  icon: string;
  aliases: string;
  picture: string;
  temperatureEntityId: string;
  humidityEntityId: string;
};

type AreaEditDraft = AreaCreationDraft & {
  name: string;
};

type HaRegistryEntityEntry = {
  entityId: string;
  deviceId: string | null;
  areaId: string | null;
  name: string | null;
  originalName: string | null;
  disabledBy: string | null;
  hiddenBy: string | null;
  platform: string | null;
};

type HaRegistryDeviceEntry = {
  id: string;
  areaId: string | null;
  name: string;
  nameByUser: string | null;
  manufacturer: string | null;
  model: string | null;
};

type RegistrySnapshot = {
  entityAreaByEntityId: Record<string, string>;
  registryEntities: HaRegistryEntityEntry[];
  registryDevices: HaRegistryDeviceEntry[];
};

type RoomEditTarget = {
  id: string;
  source: 'custom' | 'ha';
};

type RoomSectionEditTarget = {
  kind: 'widgets' | 'accessories';
  id: string;
  label: string;
  entityIds: string[];
};

type RoomSectionDeviceTarget = {
  id: string;
  kind: 'device' | 'entity';
  deviceId?: string;
  entityIds: string[];
  entities: RoomSectionDeviceEntityTarget[];
  name: string;
  deviceName: string;
  subtitle: string;
  areaId: string | null;
  domains: string[];
};

type RoomSectionDeviceEntityTarget = {
  entityId: string;
  name: string;
  domain: string;
  status: string;
  isVisible: boolean;
};

type SectionDeviceSheetMode = 'add' | 'move' | null;

type HiddenRoomEntitiesByRoom = Record<string, string[]>;

type RoomsDashboardProps = {
  runtimeMode?: DashboardRuntimeMode;
  isEditMode?: boolean;
  suppressBrowserNavigation?: boolean;
  navigationRoute?: string;
  isLoading?: boolean;
  haConnected: boolean;
  canManageRooms?: boolean;
  haAreas: HaArea[];
  haStates: MockEntityStateMap;
  onCallService?: (
    domain: string,
    service: string,
    serviceData: Record<string, unknown>,
  ) => Promise<boolean>;
  onCallApi?: (
    message: Record<string, unknown>,
    options?: { reportError?: boolean },
  ) => Promise<unknown | null>;
  cameraPtzEntityIds?: string[];
  onCameraPtzMove?: (entityId: string, direction: CameraPtzDirection) => void;
  onCameraPtzStop?: (entityId: string) => void;
};

const DEMO_ROOM_TABS: RoomTab[] = [
  { id: 'demo-living-room', name: 'Soggiorno', source: 'custom' },
  { id: 'demo-bedroom', name: 'Camera', source: 'custom' },
  { id: 'demo-kitchen', name: 'Cucina', source: 'custom' },
  { id: 'demo-bathroom', name: 'Bagno', source: 'custom' },
];

const ENERGY_WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thr', 'Fri', 'Sat', 'Sun'];
const GLASS_CARD_CLASS =
  'rooms-surface';
const PRIMARY_ROOM_ACCENT = '#85adff';
const MEMBER_AVATARS = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB-mNJxOHxly3Q071LyRvp9Kl9hZabgRQbjWPCGM9H7ocE8nLsQg6_xfYzqpMJYTr7YKJbfQAfgpbrb_AQvEFCvSJPpnO80jM3xXAu-X4oEZIIwT2cjRyeLtlScEMcOA_MMZmaT1VHbpX-VPyTNW7qVKcPxbm1KuQJVMAYYCB2whOlw64hicBkgdBQBLWrDQxbkGdekS413TCNdaBCqHEa1yuzcy3TOhKYQ6wJsACXSlx1Da4dMOsh8xPU7Z-hfn7Do7XrDkl9jhggz',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCH2V_uPYZzhEeaLDS2_4G9ntniUsznFiwhJHTIDr5Z91pD1Ae6GuE6qoPnnfOapCScKIXvKOzpRffdsoRRKmHUvkJkSXHJLoyfRrSTvZ9yBCHerBZe7xGhl8RqNN7vvHpMVKK-D7sZlhFdCw8x3P44sKw-Nlzar91chZwY9Q_81kbGu57GpPqSH5AmoUNmAaDejaMh1SL8XrLiu0EVdkwDUSv64ecOuwRgQCBRAIwUnjRBXZ8jGzNs9DqPc-tV4W0oMGCmdIjfZMnl',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDPzvdESWYczmLzqODUOkNeG96SWE3I7n3RRs6zaH41q1fIN8Pf6psFiKykX7Sst2jK_MhHVh8vAFDjxGhQjxO8_rPg_83ZBqiiUpjcKxla6R6NHD6KuLDIj3ZQ19DjHbBVnHpa402ECPXNq-1WDq6L9CfXowizaqqzTmgfWQq8Tb2jFUuTFKhwSQuBppwVMmHkmYx8QSRgZOZY-k3bujMbmtZJ8KQsWvYap7lPVuhGzOAB6Fb-GYgTj7kXux2J6dbTPHbXSmANrvna',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCBcTH8Gh_K4Y9XRLhjd0RvTczp3EdoJye6ETr6cAcfJQjBI-L7fF1dQBsA6cU_muOuFMES_B4L9o0a3kuD3O5E3FeQ4ihtWtMQP_T8Z1kTnP8i_8TPAPS0df4PE4nfbuB5pvmOLgATmLmJLFS9x7j7nogKnXYIHOzKu162Xm3yYnxbOFQkgac6y4MoYstM_msQEzAiCOND8A9DoBZXEPcwUEu0dswXd1MnZXsBA1d4EwFL7DjKF4krTq-YpZdq9nb35iu35u-JbQuQ',
] as const;
const PROFILE_AVATAR_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAKyvWwmLTA1d83p-wC8M6-9lx9PHqqktW2cLX5-2TI-QiN3bbOayAz5pjdLZ7n5HMbeNc2RV0y_bI-IUL8j6toqelHQs0eySS9pavCTjYQAgys5whO8K2sknc3esMIBB1UzWCEtQQ8kGc1uoa_DmE9QZgX1ktoqRVssJ2j_v4tCZQK-s4bq7KR6wCNgaRtMZKkEBQ0X6Y69gnXo0VPi05WkN1vxCk-LE1o9mjvwebTw7nEeFog4ji-UPo4jWnU3R5y2eaUREZg6eEO';
const ALBUM_ART_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCcsZDwpOuyEMTarB8QL142IvkDu9o7TR6xnM-RMGFvLtZyoo8scbL-HKnms9Jh8kcxUFIm87ouD_9-kua9YWupnYaM7-kcDb549PaHvjcsagrQyfIR-IQo6M_lXWhCW2vrNSyES2AQbSj8jrExMyMLOU1lh_8AdXNTHuCsrd1Tyuf5h2M_mmW05Le6ejzRVU3a77s9ZWLTxQAx7Zm2r2BoLpHpo7XIRq7TTmxGkmSOZDtMvQsszH37AzJfgejPDNdOMVo9BemVBcJ4';
const SMART_LOCK_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC67r3TZJE_brjPiKrTTZg4LFtHmtw24g1Vc49wN4R3tcgBEsX1Ypty2_2F2RwK4Y1d-uuZGAvfGRq6KjXj5eg8QVYZxzmwMszUrT9iJZVPERD2Rl5z-lIZGNqODGhhK7s5np5AgJI1qIUBLhO3BiaxncRfJzjaVcW7mRDBC0kVnZDhI2gjDWsvD0jzWDvYm5G2_xFhPXRBl_w6nOinuq6Y3gXkjh7DwQjgDbkUTYjw3pBJPPcriUw8GmVic1SDDTkSSlT_tMT8vmpv',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuD-XR0sbBGDPqBShmOdnRG3jEVg9ZgwoqHEujtb0hB0hWcZEZgcJOQ-omIkNqK-pyK9Tp7wHO7XFgp9hfmIH-YyIgYVlshJqgTrDr--bXF4PeNZ23ohNTjxf8E4C9y3QWR_t3H65t8Z0mVsJfWu9cbzrWyeXpS8Mtp9v90FpAL_bGjfNuetjEfDwfbK0ob2qaOHqXOu7eR7bfVFf98OVfAmMPvtfdvKfmG-iNaE6E2Hix4RyupD9Ly3qbrgylsL-LTxlF8e6IUxl29g',
] as const;
const GRID_BREAKPOINT_ORDER: GridEngineBreakpoint[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'xs'];

function cn(...values: Array<string | false | null | undefined>) {
  return twMerge(clsx(values));
}

const roomSwiperAnimations = new WeakMap<HTMLDivElement, RoomSwiperAnimationState>();
const roomSwiperWheelLocks = new WeakMap<HTMLDivElement, number>();

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function getRoomSwiperSlideCount(scroller: HTMLDivElement) {
  return Math.max(1, scroller.children.length);
}

function setRoomSwiperSnap(scroller: HTMLDivElement, enabled: boolean) {
  if (enabled) {
    scroller.classList.remove('snap-none');
    scroller.classList.add('snap-x', 'snap-mandatory');
    return;
  }
  scroller.classList.remove('snap-x', 'snap-mandatory');
  scroller.classList.add('snap-none');
}

function cancelRoomSwiperAnimation(scroller: HTMLDivElement, restoreSnap = true) {
  const animation = roomSwiperAnimations.get(scroller);
  if (!animation) {
    return;
  }
  window.cancelAnimationFrame(animation.frame);
  roomSwiperAnimations.delete(scroller);
  if (restoreSnap) {
    setRoomSwiperSnap(scroller, true);
  }
}

function animateRoomSwiperToLeft(scroller: HTMLDivElement, targetLeft: number, prefersReducedMotion: boolean) {
  const currentAnimation = roomSwiperAnimations.get(scroller);
  if (currentAnimation && Math.abs(currentAnimation.targetLeft - targetLeft) < 1) {
    return;
  }
  cancelRoomSwiperAnimation(scroller, false);
  setRoomSwiperSnap(scroller, false);

  if (prefersReducedMotion) {
    scroller.scrollLeft = targetLeft;
    setRoomSwiperSnap(scroller, true);
    return;
  }

  const startLeft = scroller.scrollLeft;
  const delta = targetLeft - startLeft;
  if (Math.abs(delta) < 1) {
    scroller.scrollLeft = targetLeft;
    setRoomSwiperSnap(scroller, true);
    return;
  }

  const startedAt = window.performance.now();
  const step = (now: number) => {
    const progress = clampNumber((now - startedAt) / ROOM_SWIPER_ANIMATION_MS, 0, 1);
    scroller.scrollLeft = startLeft + delta * easeOutCubic(progress);
    if (progress < 1) {
      const frame = window.requestAnimationFrame(step);
      roomSwiperAnimations.set(scroller, { frame, targetLeft });
      return;
    }
    roomSwiperAnimations.delete(scroller);
    scroller.scrollLeft = targetLeft;
    setRoomSwiperSnap(scroller, true);
  };

  const frame = window.requestAnimationFrame(step);
  roomSwiperAnimations.set(scroller, { frame, targetLeft });
}

function scrollRoomSwiperToSlide(scroller: HTMLDivElement, index: number, prefersReducedMotion: boolean) {
  const slideWidth = Math.max(1, scroller.clientWidth);
  const maxIndex = getRoomSwiperSlideCount(scroller) - 1;
  const targetIndex = clampNumber(index, 0, maxIndex);
  animateRoomSwiperToLeft(scroller, targetIndex * slideWidth, prefersReducedMotion);
}

function parseDelimitedList(value: string) {
  return value
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function trimToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function resolveGridBreakpointFromWidth(width: number): GridEngineBreakpoint {
  return (
    GRID_BREAKPOINT_ORDER.find((breakpoint) => width >= GRID_ENGINE_BREAKPOINTS[breakpoint]) ?? 'xs'
  );
}

function useGridEngineBreakpoint() {
  const [breakpoint, setBreakpoint] = React.useState<GridEngineBreakpoint>(() => {
    if (typeof window === 'undefined') {
      return 'xl';
    }
    return resolveGridBreakpointFromWidth(window.innerWidth);
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleResize = () => {
      setBreakpoint(resolveGridBreakpointFromWidth(window.innerWidth));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) {
      return undefined;
    }
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toTitleCase(value: string) {
  return value
    .split('_')
    .map((token) => (token ? `${token[0].toUpperCase()}${token.slice(1)}` : token))
    .join(' ');
}

function normalizeRoomName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function buildAreaEditDraft(area: HaArea): AreaEditDraft {
  return {
    name: area.name,
    floorId: area.floor_id ?? '',
    icon: area.icon ?? '',
    aliases: area.aliases?.join(', ') ?? '',
    picture: area.picture ?? '',
    temperatureEntityId: area.temperature_entity_id ?? '',
    humidityEntityId: area.humidity_entity_id ?? '',
  };
}

function buildFloorDraft(floor: HaFloorEntry): FloorDraft {
  return {
    name: floor.name,
    aliases: floor.aliases?.join(', ') ?? '',
    level: typeof floor.level === 'number' ? `${floor.level}` : '',
  };
}

function formatFloorTabLabel(floor: HaFloorEntry | undefined, rt: RoomsTranslator) {
  if (!floor) {
    return rt('allFloors');
  }
  if (typeof floor.level === 'number') {
    if (floor.level === 0) {
      return 'PT';
    }
    if (floor.level < 0) {
      return `S${Math.abs(floor.level)}`;
    }
    return `P${floor.level}`;
  }
  const alias = floor.aliases?.find((entry) => entry.trim().length > 0);
  return alias?.trim() || floor.name;
}

function normalizeFloorIconText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function floorTextIncludesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function floorTextHasAnyToken(text: string, tokens: string[]) {
  const paddedText = ` ${text} `;
  return tokens.some((token) => paddedText.includes(` ${token} `));
}

function isFloorCarouselInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('button, input, textarea, select, a, [data-no-floor-drag="true"]'));
}

function getRoomsGridStructure(
  isMobile: boolean,
  isMediaActive: boolean,
  isSecurityAlert: boolean,
  hideMediaArea = false,
  visibleMobileAreas?: string[],
): React.CSSProperties {
  if (!isMobile) {
    return {
      display: 'grid',
      gridTemplateColumns: 'minmax(16rem,1.2fr) minmax(0,1fr) minmax(0,1fr) minmax(16rem,1.2fr)',
      gridTemplateRows: 'auto auto auto auto',
      gap: '24px',
      gridTemplateAreas: `
        "header header          header          header"
        "clima  sensors         sensors         security_cams"
        "clima  lights_switches lights_switches security_cams"
        "clima  lights_switches lights_switches media"
      `,
    };
  }

  let mobileAreas = ['header', 'clima', 'lights_switches', 'sensors', 'media', 'security_cams'];

  if (isSecurityAlert) {
    mobileAreas = ['header', 'security_cams', 'clima', 'lights_switches', 'sensors', 'media'];
  } else if (isMediaActive) {
    mobileAreas = ['header', 'media', 'clima', 'lights_switches', 'sensors', 'security_cams'];
  }

  if (hideMediaArea) {
    mobileAreas = mobileAreas.filter((area) => area !== 'media');
  }
  if (visibleMobileAreas?.length) {
    const visibleAreaSet = new Set(['header', ...visibleMobileAreas]);
    mobileAreas = mobileAreas.filter((area) => visibleAreaSet.has(area));
  }

  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '16px',
    gridTemplateAreas: mobileAreas.map((area) => `"${area}"`).join(' '),
  };
}

function isSecurityAlertEntity(entityId: string, entity?: MockEntityState) {
  const domain = entityId.split('.')[0];
  const state = `${entity?.state ?? ''}`.trim().toLowerCase();
  const deviceClass = `${entity?.rawAttributes?.device_class ?? ''}`.trim().toLowerCase();
  const name = `${entity?.rawAttributes?.friendly_name ?? entityId}`.toLowerCase();
  const isSecuritySignal =
    domain === 'alarm_control_panel' ||
    ['motion', 'occupancy', 'presence', 'problem', 'safety', 'tamper'].includes(deviceClass) ||
    ['allarme', 'motion', 'movimento', 'occupancy', 'presenza', 'tamper'].some((token) => name.includes(token));

  if (!isSecuritySignal) {
    return false;
  }
  return ['on', 'open', 'detected', 'active', 'triggered', 'problem', 'unlocked'].includes(state);
}

function getFloorIconByLevel(level: number): LucideIcon {
  if (level < 0) {
    return Warehouse;
  }
  if (level === 0) {
    return House;
  }
  if (level === 1) {
    return Rows2;
  }
  if (level === 2) {
    return Rows3;
  }
  return Building2;
}

function getFloorIcon(floor: HaFloorEntry | undefined): LucideIcon {
  if (!floor) {
    return Layers;
  }

  const floorText = normalizeFloorIconText([floor.name, ...(floor.aliases ?? [])].join(' '));

  if (floorTextIncludesAny(floorText, ['garage', 'box', 'parcheggio', 'autorimessa'])) {
    return Car;
  }
  if (floorTextIncludesAny(floorText, ['seminterrato', 'cantina', 'taverna', 'interrato', 'sotterraneo'])) {
    return Warehouse;
  }
  if (floorTextIncludesAny(floorText, ['giardino', 'esterno', 'terrazzo', 'terrazza', 'outdoor'])) {
    return MapPinHouse;
  }
  if (floorTextIncludesAny(floorText, ['mansarda', 'attico', 'soffitta'])) {
    return HousePlus;
  }

  if (typeof floor.level === 'number') {
    return getFloorIconByLevel(floor.level);
  }

  if (floorTextHasAnyToken(floorText, ['pt', 'p0']) || floorTextIncludesAny(floorText, ['piano terra', 'terra', 'ground floor', 'livello 0'])) {
    return House;
  }
  if (floorTextHasAnyToken(floorText, ['p1', 'primo', 'first']) || floorTextIncludesAny(floorText, ['piano primo', 'primo piano', 'livello 1'])) {
    return Rows2;
  }
  if (floorTextHasAnyToken(floorText, ['p2', 'secondo', 'second']) || floorTextIncludesAny(floorText, ['piano secondo', 'secondo piano', 'livello 2'])) {
    return Rows3;
  }
  if (
    floorTextHasAnyToken(floorText, ['p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'terzo', 'quarto', 'quinto', 'sesto']) ||
    floorTextIncludesAny(floorText, ['terzo piano', 'quarto piano', 'quinto piano', 'livello 3', 'livello 4'])
  ) {
    return Building2;
  }

  return House;
}

function buildRandomId() {
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function getEntityFriendlyName(entityId: string, state?: MockEntityState) {
  const friendly = state?.rawAttributes?.friendly_name;
  if (typeof friendly === 'string' && friendly.trim().length > 0) {
    return friendly.trim();
  }
  const fallback = entityId.split('.').at(1) ?? entityId;
  return toTitleCase(fallback);
}

function isAreaSensorEntityCandidate(entityId: string, state: MockEntityState | undefined, kind: 'temperature' | 'humidity') {
  const domain = entityId.split('.')[0];
  if (domain !== 'sensor') {
    return false;
  }
  const deviceClass = `${state?.rawAttributes?.device_class ?? ''}`.trim().toLowerCase();
  const unit = `${state?.unit ?? state?.rawAttributes?.unit_of_measurement ?? ''}`.trim().toLowerCase();
  const normalizedEntityId = entityId.toLowerCase();
  if (kind === 'temperature') {
    return deviceClass === 'temperature' || ['c', 'f', '\u00b0c', '\u00b0f'].includes(unit) || normalizedEntityId.includes('temperature');
  }
  return deviceClass === 'humidity' || unit === '%' || normalizedEntityId.includes('humidity');
}

function resolveWidgetKindFromEntityId(entityId: string): WidgetKind | null {
  const domain = entityId.split('.')[0];
  if (domain === 'light') return 'light';
  if (domain === 'climate') return 'climate';
  if (domain === 'camera') return 'camera';
  if (domain === 'media_player') return 'media';
  if (domain === 'lock') return 'lock';
  if (domain === 'cover') return 'cover';
  if (domain === 'switch' || domain === 'input_boolean' || domain === 'fan') return 'switch';
  if (domain === 'sensor' || domain === 'binary_sensor') return 'sensor';
  return null;
}

function formatDomainLabel(domain: string, rt: RoomsTranslator) {
  if (domain === 'media_player') return rt('domainMedia');
  if (domain === 'binary_sensor' || domain === 'sensor') return rt('domainSensor');
  if (domain === 'input_boolean' || domain === 'switch') return rt('domainSwitch');
  if (domain === 'light') return rt('domainLight');
  if (domain === 'climate') return rt('domainClimate');
  if (domain === 'fan') return rt('domainFan');
  if (domain === 'lock') return rt('domainLock');
  if (domain === 'camera') return rt('domainCamera');
  if (domain === 'cover') return rt('domainCover');
  if (domain === 'weather') return rt('domainWeather');
  if (domain === 'scene') return rt('domainScene');
  return toTitleCase(domain);
}

function translateEntityStateValue(domain: string, value: string, rt: RoomsTranslator) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'unavailable') return rt('unavailable');
  if (normalized === 'unknown') return rt('unknown');
  if (domain === 'light') {
    if (normalized === 'on') return rt('stateOnFeminine');
    if (normalized === 'off') return rt('stateOffFeminine');
  }
  if (domain === 'switch' || domain === 'input_boolean') {
    if (normalized === 'on') return rt('stateOnMasculine');
    if (normalized === 'off') return rt('stateOffMasculine');
  }
  if (domain === 'fan') {
    if (normalized === 'on') return rt('stateOnFeminine');
    if (normalized === 'off') return rt('stateOffFeminine');
  }
  if (domain === 'media_player') {
    const mediaState = normalizeMediaPlayerStateKey(value);
    const mediaStateKeys = { playing: 'statePlaying', paused: 'statePaused', idle: 'stateInactive', buffering: 'stateBuffering', on: 'stateOnMasculine', off: 'stateOffMasculine', standby: 'stateStandby', unavailable: 'unavailable', unknown: 'unknown' } as const;
    return rt(mediaStateKeys[mediaState]);
  }
  if (domain === 'cover') {
    if (normalized === 'open') return rt('stateOpen');
    if (normalized === 'closed') return rt('stateClosed');
    if (normalized === 'opening') return rt('stateOpening');
    if (normalized === 'closing') return rt('stateClosing');
  }
  if (domain === 'lock') {
    if (normalized === 'locked') return rt('stateLocked');
    if (normalized === 'unlocked') return rt('stateUnlocked');
    if (normalized === 'open') return rt('stateOpen');
  }
  if (domain === 'binary_sensor') {
    if (normalized === 'on') return rt('stateActive');
    if (normalized === 'off') return rt('stateInactive');
  }
  if (domain === 'climate') {
    if (normalized === 'heat') return rt('stateHeating');
    if (normalized === 'cool') return rt('stateCooling');
    if (normalized === 'dry') return rt('stateDrying');
    if (normalized === 'fan_only') return rt('stateFanOnly');
    if (normalized === 'auto') return rt('stateAutomatic');
    if (normalized === 'off') return rt('stateOffMasculine');
  }
  return null;
}

function formatEntityStateLabel(entityId: string, entity: MockEntityState | undefined, rt: RoomsTranslator) {
  const domain = entityId.split('.')[0];
  const stateLabel = `${entity?.stateLabel ?? ''}`.trim();
  const rawState = `${entity?.state ?? ''}`.trim();
  const translatedStateLabel = translateEntityStateValue(domain, stateLabel, rt);
  if (translatedStateLabel) {
    return translatedStateLabel;
  }
  const translatedRawState = translateEntityStateValue(domain, rawState, rt);
  if (translatedRawState) {
    return translatedRawState;
  }
  if (stateLabel) {
    return stateLabel;
  }
  if (domain === 'media_player') {
    const title = `${entity?.mediaTitle ?? entity?.nowPlaying ?? ''}`.trim();
    const artist = `${entity?.mediaArtist ?? ''}`.trim();
    if (title && artist) {
      return `${title} - ${artist}`;
    }
    if (title) {
      return title;
    }
  }
  const secondary = `${entity?.secondary ?? ''}`.trim();
  if (secondary) {
    return secondary;
  }
  const numericValue = getEntityNumericValue(entity);
  const unit = `${entity?.unit ?? entity?.rawAttributes?.unit_of_measurement ?? ''}`.trim();
  if (numericValue !== undefined) {
    const formattedValue = Number.isInteger(numericValue) ? `${numericValue}` : numericValue.toFixed(1);
    return unit ? `${formattedValue} ${unit}` : formattedValue;
  }
  if (!rawState) {
    return rt('stateUnavailable');
  }
  return toTitleCase(rawState);
}

function hasDistinctDeviceName(target: RoomSectionDeviceTarget) {
  return target.deviceName.trim().toLowerCase() !== target.name.trim().toLowerCase();
}

function formatGroupTitle(value: string) {
  const normalized = value.trim();
  return normalized ? `${normalized[0].toLocaleUpperCase()}${normalized.slice(1)}` : normalized;
}

function doesEntityMatchRoomSection(entityId: string, sectionId: string) {
  const domain = entityId.split('.')[0];
  if (sectionId === 'lights') {
    return domain === 'light';
  }
  if (sectionId === 'switches') {
    return domain === 'switch' || domain === 'input_boolean' || domain === 'fan';
  }
  if (sectionId === 'lights_switches') {
    return domain === 'light' || domain === 'switch' || domain === 'input_boolean' || domain === 'fan';
  }
  if (sectionId === 'clima') {
    return domain === 'climate';
  }
  if (sectionId === 'media') {
    return domain === 'media_player';
  }
  if (sectionId === 'sensors') {
    return domain === 'sensor' || domain === 'binary_sensor';
  }
  if (sectionId === 'security') {
    return domain === 'lock' || domain === 'camera';
  }
  if (sectionId === 'accessories') {
    return (
      domain === 'cover' ||
      domain === 'weather' ||
      domain === 'scene' ||
      domain === 'script' ||
      domain === 'automation' ||
      !resolveWidgetKindFromEntityId(entityId)
    );
  }
  return true;
}

function buildRoomWidget(entityId: string, kind: WidgetKind, state: MockEntityState | undefined, layout: Widget['layout']): Widget {
  const isOn = isEntityOn(entityId, state);
  const value =
    kind === 'light'
      ? resolveLightBrightnessPercent(state)
      : toNumber(state?.numericValue) ??
        toNumber(state?.currentValue) ??
        toNumber(state?.targetValue) ??
        toNumber(state?.state) ??
        0;
  return {
    id: entityId,
    kind,
    title: getEntityFriendlyName(entityId, state),
    entityId,
    status: state?.stateLabel ?? state?.state ?? 'Pronto',
    isOn,
    value,
    unit: state?.unit,
    layout,
  };
}

function resolveRoomWidgetSpan(widget: Widget, breakpoint: GridEngineBreakpoint) {
  if (widget.kind === 'light') {
    const span = resolveWidgetTypeLayoutSpan('light', breakpoint, {});
    const configuredHeight = Math.max(1, Math.round(widget.isOn ? span.hOn ?? span.h : span.hOff ?? span.h));
    return { w: span.w, h: widget.isOn ? Math.max(2, configuredHeight) : configuredHeight };
  }
  if (widget.kind === 'sensor') {
    return resolveWidgetTypeLayoutSpan('sensor', breakpoint, {});
  }
  if (widget.kind === 'switch') {
    return resolveWidgetTypeLayoutSpan('switch', breakpoint, {});
  }
  if (widget.kind === 'lock') {
    return resolveWidgetTypeLayoutSpan('lock', breakpoint, {});
  }
  if (widget.kind === 'camera') {
    return resolveWidgetTypeLayoutSpan('camera', breakpoint, {});
  }
  if (widget.kind === 'media') {
    return resolveWidgetTypeLayoutSpan('media', breakpoint, {});
  }
  if (widget.kind === 'cover') {
    return resolveWidgetTypeLayoutSpan('cover', breakpoint, {});
  }
  return {
    w: Math.max(1, Math.round(widget.layout.w)),
    h: Math.max(1, Math.round(widget.layout.h)),
  };
}

type RoomWidgetGridSpan = { w: number; h: number };
type RoomWidgetGridOptions = {
  widgetWidth?: number;
  resolveSpan?: (widget: Widget, span: RoomWidgetGridSpan, breakpoint: GridEngineBreakpoint) => RoomWidgetGridSpan;
};

function resolveRoomSectionGridCols(sectionId: string | undefined, breakpoint: GridEngineBreakpoint, fallbackCols: number) {
  if (sectionId === 'sensors') {
    if (breakpoint === 'xs' || breakpoint === 'sm') {
      return 2;
    }
    if (breakpoint === 'md' || breakpoint === 'lg') {
      return 4;
    }
    return 6;
  }

  if (sectionId === 'lights' || sectionId === 'switches') {
    if (breakpoint === 'xs' || breakpoint === 'sm') {
      return 2;
    }
    if (breakpoint === 'md' || breakpoint === 'lg') {
      return 4;
    }
    return 6;
  }

  if (sectionId === 'security') {
    return breakpoint === 'xs' || breakpoint === 'sm' || breakpoint === 'md' || breakpoint === 'lg' ? 2 : 4;
  }

  return fallbackCols;
}

function resolveRoomSectionGridOptions(sectionId: string | undefined, breakpoint: GridEngineBreakpoint): RoomWidgetGridOptions | undefined {
  if (sectionId === 'sensors') {
    return {
      resolveSpan: (widget, span) =>
        widget.kind === 'sensor'
          ? {
              ...span,
              w: breakpoint === 'xs' || breakpoint === 'sm' ? 1 : 2,
              h: 2,
            }
          : span,
    };
  }

  if (sectionId === 'switches' && (breakpoint === 'xs' || breakpoint === 'sm')) {
    return {
      resolveSpan: (widget, span) => (widget.kind === 'switch' ? { ...span, w: 1 } : span),
    };
  }

  if (
    sectionId === 'security' &&
    (breakpoint === 'xs' || breakpoint === 'sm' || breakpoint === 'md' || breakpoint === 'lg')
  ) {
    return {
      resolveSpan: (widget, span) => (widget.kind === 'camera' ? { ...span, w: 1 } : span),
    };
  }

  return undefined;
}

function resolveRoomSensorPreviewLimit(breakpoint: GridEngineBreakpoint) {
  return ROOM_SENSOR_PREVIEW_LIMIT_BY_BREAKPOINT[breakpoint] ?? ROOM_SECTION_PREVIEW_LIMIT;
}

function resolveRoomWidgetGridSpan(
  widget: Widget,
  breakpoint: GridEngineBreakpoint,
  options?: RoomWidgetGridOptions,
) {
  const resolvedSpan = resolveRoomWidgetSpan(widget, breakpoint);
  const widthAdjustedSpan = options?.widgetWidth ? { ...resolvedSpan, w: options.widgetWidth } : resolvedSpan;
  return options?.resolveSpan?.(widget, widthAdjustedSpan, breakpoint) ?? widthAdjustedSpan;
}

function resolveRoomWidgetGridRowCount(
  widgets: Widget[],
  breakpoint: GridEngineBreakpoint,
  gridCols: number,
  options?: RoomWidgetGridOptions,
) {
  const safeCols = Math.max(1, Math.round(gridCols));
  const occupiedRows: boolean[][] = [];
  const ensureRows = (rowCount: number) => {
    while (occupiedRows.length < rowCount) {
      occupiedRows.push(Array.from({ length: safeCols }, () => false));
    }
  };

  widgets.forEach((widget) => {
    const span = resolveRoomWidgetGridSpan(widget, breakpoint, options);
    const safeW = Math.min(safeCols, Math.max(1, Math.round(span.w)));
    const safeH = Math.max(1, Math.round(span.h));
    let placed = false;

    for (let row = 0; !placed; row += 1) {
      ensureRows(row + safeH);

      for (let col = 0; col <= safeCols - safeW; col += 1) {
        let fits = true;
        for (let nextRow = row; nextRow < row + safeH && fits; nextRow += 1) {
          for (let nextCol = col; nextCol < col + safeW; nextCol += 1) {
            if (occupiedRows[nextRow]?.[nextCol]) {
              fits = false;
              break;
            }
          }
        }

        if (!fits) {
          continue;
        }

        for (let nextRow = row; nextRow < row + safeH; nextRow += 1) {
          for (let nextCol = col; nextCol < col + safeW; nextCol += 1) {
            occupiedRows[nextRow][nextCol] = true;
          }
        }
        placed = true;
        break;
      }
    }
  });

  let lastOccupiedRow = -1;
  occupiedRows.forEach((row, index) => {
    if (row.some(Boolean)) {
      lastOccupiedRow = index;
    }
  });
  return lastOccupiedRow + 1;
}

function resolveRoomWidgetGridHeightPx(rowCount: number) {
  if (rowCount <= 0) {
    return 0;
  }
  return rowCount * GRID_ENGINE_ROW_UNIT_PX + Math.max(0, rowCount - 1) * GRID_ENGINE_GAP_PX;
}

function resolveRoomWidgetClusterMinHeightPx(
  rowCount: number,
  breakpoint: GridEngineBreakpoint,
  hasControls = false,
) {
  const gridHeight = resolveRoomWidgetGridHeightPx(rowCount);
  if (gridHeight <= 0) {
    return 0;
  }
  const contentBlocks = hasControls ? 3 : 2;
  const contentGaps = Math.max(0, contentBlocks - 1) * ROOM_WIDGET_CLUSTER_CONTENT_GAP_PX;
  return (
    (ROOM_WIDGET_CLUSTER_PADDING_Y_BY_BREAKPOINT[breakpoint] ?? 32) +
    ROOM_WIDGET_CLUSTER_HEADER_HEIGHT_PX +
    contentGaps +
    gridHeight
  );
}

function RoomCardSlot({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('min-h-[236px] min-w-0', className)}>{children}</div>;
}

function parseCustomRooms(raw: string | null): CustomRoomRecord[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const id =
          typeof (entry as { id?: unknown }).id === 'string'
            ? (entry as { id: string }).id.trim()
            : '';
        const name =
          typeof (entry as { name?: unknown }).name === 'string'
            ? normalizeRoomName((entry as { name: string }).name)
            : '';
        const createdAtRaw = (entry as { createdAt?: unknown }).createdAt;
        const createdAt =
          typeof createdAtRaw === 'number' && Number.isFinite(createdAtRaw)
            ? createdAtRaw
            : Date.now();
        if (!id || !name) {
          return null;
        }
        return {
          id: id.startsWith(ROOM_ID_CUSTOM_PREFIX) ? id : `${ROOM_ID_CUSTOM_PREFIX}${id}`,
          name,
          createdAt,
        } satisfies CustomRoomRecord;
      })
      .filter((entry): entry is CustomRoomRecord => entry !== null);
  } catch {
    return [];
  }
}

function readStoredCustomRooms(runtimeMode: DashboardRuntimeMode) {
  if (typeof window === 'undefined') {
    return [];
  }
  return parseCustomRooms(
    window.localStorage.getItem(getRoomsRuntimeStorageKey(CUSTOM_ROOMS_STORAGE_KEY, runtimeMode)),
  );
}

function readStoredActiveRoomId(runtimeMode: DashboardRuntimeMode) {
  if (typeof window === 'undefined') {
    return '';
  }
  const raw = window.localStorage.getItem(getRoomsRuntimeStorageKey(ACTIVE_ROOM_STORAGE_KEY, runtimeMode));
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseHiddenRoomEntitiesByRoom(raw: string | null): HiddenRoomEntitiesByRoom {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.entries(parsed as Record<string, unknown>).reduce<HiddenRoomEntitiesByRoom>((acc, [roomId, value]) => {
      const normalizedRoomId = roomId.trim();
      if (!normalizedRoomId || !Array.isArray(value)) {
        return acc;
      }
      const entityIds = uniqueStrings(value.filter((entry): entry is string => typeof entry === 'string'));
      if (entityIds.length > 0) {
        acc[normalizedRoomId] = entityIds;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function readStoredHiddenRoomEntitiesByRoom(runtimeMode: DashboardRuntimeMode) {
  if (typeof window === 'undefined') {
    return {};
  }
  return parseHiddenRoomEntitiesByRoom(
    window.localStorage.getItem(getRoomsRuntimeStorageKey(ROOM_ENTITY_VISIBILITY_STORAGE_KEY, runtimeMode)),
  );
}

function createEmptyBuckets(): RoomEntityBuckets {
  return {
    lights: [],
    climates: [],
    locks: [],
    medias: [],
    switches: [],
    sensors: [],
    covers: [],
    cameras: [],
    weathers: [],
    others: [],
  };
}

function bucketEntityId(entityId: string, buckets: RoomEntityBuckets) {
  const domain = entityId.split('.')[0];
  if (domain === 'light') {
    buckets.lights.push(entityId);
    return;
  }
  if (domain === 'climate') {
    buckets.climates.push(entityId);
    return;
  }
  if (domain === 'lock') {
    buckets.locks.push(entityId);
    return;
  }
  if (domain === 'media_player') {
    buckets.medias.push(entityId);
    return;
  }
  if (domain === 'switch' || domain === 'input_boolean' || domain === 'fan') {
    buckets.switches.push(entityId);
    return;
  }
  if (domain === 'sensor' || domain === 'binary_sensor') {
    buckets.sensors.push(entityId);
    return;
  }
  if (domain === 'cover') {
    buckets.covers.push(entityId);
    return;
  }
  if (domain === 'camera') {
    buckets.cameras.push(entityId);
    return;
  }
  if (domain === 'weather') {
    buckets.weathers.push(entityId);
    return;
  }
  buckets.others.push(entityId);
}

function filterRoomEntityBuckets(
  buckets: RoomEntityBuckets,
  predicate: (entityId: string) => boolean,
): RoomEntityBuckets {
  return {
    lights: buckets.lights.filter(predicate),
    climates: buckets.climates.filter(predicate),
    locks: buckets.locks.filter(predicate),
    medias: buckets.medias.filter(predicate),
    switches: buckets.switches.filter(predicate),
    sensors: buckets.sensors.filter(predicate),
    covers: buckets.covers.filter(predicate),
    cameras: buckets.cameras.filter(predicate),
    weathers: buckets.weathers.filter(predicate),
    others: buckets.others.filter(predicate),
  };
}

function getRoomSectionEntityIds(sectionId: string, buckets: RoomEntityBuckets) {
  if (sectionId === 'lights') {
    return buckets.lights;
  }
  if (sectionId === 'switches') {
    return buckets.switches;
  }
  if (sectionId === 'lights_switches') {
    return [...buckets.lights, ...buckets.switches];
  }
  if (sectionId === 'clima') {
    return buckets.climates;
  }
  if (sectionId === 'media') {
    return buckets.medias;
  }
  if (sectionId === 'sensors') {
    return buckets.sensors;
  }
  if (sectionId === 'security') {
    return [...buckets.locks, ...buckets.cameras];
  }
  if (sectionId === 'accessories') {
    return uniqueStrings([
      ...buckets.covers,
      ...buckets.weathers,
      ...buckets.others.filter((entityId) => !entityId.startsWith('automation.') && !entityId.startsWith('script.')),
    ]);
  }
  return [];
}

function isEntityOn(entityId: string, entity?: MockEntityState) {
  const state = `${entity?.state ?? ''}`.trim().toLowerCase();
  const domain = entityId.split('.')[0];
  if (domain === 'media_player') {
    return !['off', 'idle', 'standby', 'unavailable', 'unknown'].includes(state);
  }
  if (domain === 'lock') {
    return state === 'unlocked' || state === 'open';
  }
  return ['on', 'open', 'unlocked', 'playing', 'heat', 'cool'].includes(state);
}

function resolveLightBrightnessPercent(entity?: MockEntityState) {
  const directBrightness = toNumber(entity?.brightness);
  if (directBrightness !== undefined) {
    return Math.max(0, Math.min(100, Math.round(directBrightness > 100 ? (directBrightness / 255) * 100 : directBrightness)));
  }

  const rawBrightness = toNumber(entity?.rawAttributes?.brightness);
  if (rawBrightness !== undefined) {
    return Math.max(0, Math.min(100, Math.round(rawBrightness > 100 ? (rawBrightness / 255) * 100 : rawBrightness)));
  }

  return undefined;
}

function isMediaEntityPlaying(entity?: MockEntityState) {
  const state = `${entity?.state ?? ''}`.trim().toLowerCase();
  const stateLabel = `${entity?.stateLabel ?? ''}`.trim().toLowerCase();
  return state === 'playing' || state === 'on' || stateLabel.includes('playing') || stateLabel.includes('riprodu');
}

function getEntityNumericValue(entity?: MockEntityState) {
  return (
    toNumber(entity?.numericValue) ??
    toNumber(entity?.currentValue) ??
    toNumber(entity?.targetValue) ??
    toNumber(entity?.state)
  );
}

function formatAmbientTemperature(value: number) {
  return `${value.toFixed(1)}\u00b0C`;
}

function formatAmbientHumidity(value: number) {
  return `${Math.round(value)}%`;
}

function buildEnergyBars(referenceValue: number | undefined) {
  const base = Number.isFinite(referenceValue ?? Number.NaN) ? Math.max(3, referenceValue ?? 0) : 23;
  return ENERGY_WEEK_DAYS.map((label, index) => {
    const delta = [0.15, 0.22, -0.05, 0.12, -0.1, 0.2, 0.08][index] ?? 0;
    const value = Math.max(2.8, Number((base * (1 + delta)).toFixed(1)));
    return { label, value };
  });
}

function readTrimmedRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function extractRegistryArray(payload: unknown, key: 'entities' | 'devices') {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const record = payload as Record<string, unknown>;
  const direct = record[key];
  if (Array.isArray(direct)) {
    return direct;
  }
  const result = record.result;
  if (result && typeof result === 'object') {
    const resultDirect = (result as Record<string, unknown>)[key];
    if (Array.isArray(resultDirect)) {
      return resultDirect;
    }
  }
  return [];
}

function parseRegistryEntityEntries(payload: unknown): HaRegistryEntityEntry[] {
  return extractRegistryArray(payload, 'entities')
    .map((entry): HaRegistryEntityEntry | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const entityId = readTrimmedRecordString(record, 'entity_id');
      if (!entityId) {
        return null;
      }
      const deviceId = readTrimmedRecordString(record, 'device_id');
      const areaId = readTrimmedRecordString(record, 'area_id');
      const name = readTrimmedRecordString(record, 'name') || readTrimmedRecordString(record, 'name_by_user');
      const originalName = readTrimmedRecordString(record, 'original_name');
      const disabledBy = readTrimmedRecordString(record, 'disabled_by');
      const hiddenBy = readTrimmedRecordString(record, 'hidden_by');
      const platform = readTrimmedRecordString(record, 'platform');
      return {
        entityId,
        deviceId: deviceId || null,
        areaId: areaId || null,
        name: name || null,
        originalName: originalName || null,
        disabledBy: disabledBy || null,
        hiddenBy: hiddenBy || null,
        platform: platform || null,
      };
    })
    .filter((entry): entry is HaRegistryEntityEntry => entry !== null);
}

function parseRegistryDeviceEntries(payload: unknown): HaRegistryDeviceEntry[] {
  return extractRegistryArray(payload, 'devices')
    .map((entry): HaRegistryDeviceEntry | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const id = readTrimmedRecordString(record, 'id') || readTrimmedRecordString(record, 'device_id');
      if (!id) {
        return null;
      }
      const nameByUser = readTrimmedRecordString(record, 'name_by_user');
      const manufacturer = readTrimmedRecordString(record, 'manufacturer');
      const model = readTrimmedRecordString(record, 'model');
      const registryName =
        nameByUser ||
        readTrimmedRecordString(record, 'name') ||
        readTrimmedRecordString(record, 'original_name') ||
        model ||
        id;
      const areaId = readTrimmedRecordString(record, 'area_id');
      return {
        id,
        areaId: areaId || null,
        name: registryName,
        nameByUser: nameByUser || null,
        manufacturer: manufacturer || null,
        model: model || null,
      };
    })
    .filter((entry): entry is HaRegistryDeviceEntry => entry !== null);
}

function buildDeviceAreaMap(registryDevices: HaRegistryDeviceEntry[]) {
  return registryDevices.reduce<Record<string, string>>((acc, device) => {
    if (device.areaId) {
      acc[device.id] = device.areaId;
    }
    return acc;
  }, {});
}

function buildEntityAreaMap(
  registryEntities: HaRegistryEntityEntry[],
  deviceAreaByDeviceId: Record<string, string>,
) {
  const result: Record<string, string> = {};
  registryEntities.forEach((entry) => {
    if (entry.areaId) {
      result[entry.entityId] = entry.areaId;
      return;
    }
    if (!entry.deviceId) {
      return;
    }
    const areaFromDevice = deviceAreaByDeviceId[entry.deviceId];
    if (areaFromDevice) {
      result[entry.entityId] = areaFromDevice;
    }
  });
  return result;
}

function parseEntityAreaMap(payload: unknown, deviceAreaByDeviceId: Record<string, string>) {
  return buildEntityAreaMap(parseRegistryEntityEntries(payload), deviceAreaByDeviceId);
}

function parseDeviceAreaMap(payload: unknown) {
  return buildDeviceAreaMap(parseRegistryDeviceEntries(payload));
}

function parseHaAreaEntry(payload: unknown): HaArea | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as HaAreaCreateResult;
  const areaId = typeof record.area_id === 'string' ? record.area_id.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!areaId || !name) {
    return null;
  }
  const area: HaArea = {
    area_id: areaId,
    name,
  };
  if (Array.isArray(record.aliases)) {
    const aliases = record.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (aliases.length > 0) {
      area.aliases = aliases;
    }
  }
  area.floor_id = typeof record.floor_id === 'string' && record.floor_id.trim().length > 0 ? record.floor_id : null;
  area.humidity_entity_id =
    typeof record.humidity_entity_id === 'string' && record.humidity_entity_id.trim().length > 0
      ? record.humidity_entity_id
      : null;
  area.icon = typeof record.icon === 'string' && record.icon.trim().length > 0 ? record.icon : null;
  if (typeof record.picture === 'string' && record.picture.trim().length > 0) {
    area.picture = record.picture;
  }
  area.temperature_entity_id =
    typeof record.temperature_entity_id === 'string' && record.temperature_entity_id.trim().length > 0
      ? record.temperature_entity_id
      : null;
  return area;
}

function parseHaFloorList(payload: unknown): HaFloorEntry[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .map((entry): HaFloorEntry | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const floorId = typeof record.floor_id === 'string' ? record.floor_id.trim() : '';
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      const aliases = Array.isArray(record.aliases)
        ? record.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : undefined;
      if (!floorId || !name) {
        return null;
      }
      return {
        floor_id: floorId,
        name,
        aliases,
        level: typeof record.level === 'number' ? record.level : null,
        icon: typeof record.icon === 'string' ? record.icon : null,
      } satisfies HaFloorEntry;
    })
    .filter((entry): entry is HaFloorEntry => entry !== null);
}

function parseHaFloorEntry(payload: unknown): HaFloorEntry | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const floorId = typeof record.floor_id === 'string' ? record.floor_id.trim() : '';
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const aliases = Array.isArray(record.aliases)
    ? record.aliases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : undefined;
  if (!floorId || !name) {
    return null;
  }
  return {
    floor_id: floorId,
    name,
    aliases,
    level: typeof record.level === 'number' ? record.level : null,
    icon: typeof record.icon === 'string' ? record.icon : null,
  };
}

async function fetchRegistrySnapshot(
  onCallApi: NonNullable<RoomsDashboardProps['onCallApi']>,
): Promise<RegistrySnapshot> {
  const [entityPayload, devicePayload] = await Promise.all([
    (await onCallApi({ type: 'config/entity_registry/list' }, { reportError: false })) ??
      (await onCallApi({ type: 'config/entity_registry/list_for_display' }, { reportError: false })),
    (await onCallApi({ type: 'config/device_registry/list' }, { reportError: false })) ??
      (await onCallApi({ type: 'config/device_registry/list_for_display' }, { reportError: false })),
  ]);
  const registryDevices = parseRegistryDeviceEntries(devicePayload);
  const registryEntities = parseRegistryEntityEntries(entityPayload);
  const deviceAreaByDeviceId = buildDeviceAreaMap(registryDevices);
  const entityAreaByEntityId = buildEntityAreaMap(registryEntities, deviceAreaByDeviceId);
  return { entityAreaByEntityId, registryEntities, registryDevices };
}

function RoomsTopTab({
  tab,
  isActive,
  onClick,
}: {
  tab: RoomTab;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative inline-block rounded-lg px-3 pb-1 text-sm font-semibold leading-none tracking-normal transition-colors sm:px-4 sm:text-base',
        isActive
          ? 'text-[color:var(--ui-text-primary)]'
          : 'text-[color:var(--ui-text-tertiary)] hover:text-[color:var(--ui-text-primary)]',
      )}
    >
      <span className="truncate">{tab.name}</span>
      {tab.source === 'custom' ? (
        <span className="ml-2 inline-flex h-1.5 w-1.5 rounded-full bg-sky-300/85" />
      ) : null}
    </button>
  );
}

function RoomIconButton({
  children,
  onClick,
  label,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full text-[color:var(--ui-text-secondary)] transition hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]',
        className ?? GLASS_CARD_CLASS,
      )}
    >
      {children}
    </button>
  );
}

function MiniToggle({ isOn }: { isOn: boolean }) {
  return (
    <span
      className={cn(
        'flex h-5 w-10 rounded-full p-1 transition-all',
        isOn ? 'justify-end bg-[#85adff]' : 'justify-start bg-white/20',
      )}
    >
      <span className="h-3 w-3 rounded-full bg-white shadow-lg" />
    </span>
  );
}

function ClimateAction({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-w-0 flex-col items-center gap-1 text-[10px] transition-colors',
        active ? 'text-[#85adff]' : 'text-white/42 hover:text-white',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl',
          active ? 'bg-white/10' : GLASS_CARD_CLASS,
        )}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export function RoomsDashboard({
  runtimeMode = 'real',
  isEditMode = false,
  isLoading = false,
  haConnected,
  canManageRooms = false,
  haAreas,
  haStates,
  onCallApi,
  onCallService,
  cameraPtzEntityIds = [],
  onCameraPtzMove,
  onCameraPtzStop,
}: RoomsDashboardProps) {
  const rt = useRoomsTranslations();
  const { formatDate } = useI18n();
  const prefersReducedMotion = useReducedMotion();
  const roomTitleScrollerRef = React.useRef<HTMLDivElement | null>(null);
  const roomTitleDragRef = React.useRef<FloorCarouselDragState | null>(null);
  const roomTitleSuppressClickRef = React.useRef(false);
  const floorCarouselRef = React.useRef<HTMLDivElement | null>(null);
  const floorCarouselDragRef = React.useRef<FloorCarouselDragState | null>(null);
  const floorCarouselSuppressClickRef = React.useRef(false);
  const mobileClimateSwiperRef = React.useRef<HTMLDivElement | null>(null);
  const climateSwiperDragRef = React.useRef<RoomSwiperDragState | null>(null);
  const climateSwiperSuppressClickRef = React.useRef(false);
  const mediaSwiperRef = React.useRef<HTMLDivElement | null>(null);
  const mediaSwiperDragRef = React.useRef<RoomSwiperDragState | null>(null);
  const mediaSwiperSuppressClickRef = React.useRef(false);
  const sectionTargetLongPressRef = React.useRef<RoomSectionTargetLongPressState | null>(null);
  const suppressNextSectionTargetClickRef = React.useRef<string | null>(null);
  const [customRooms, setCustomRooms] = React.useState<CustomRoomRecord[]>(() => readStoredCustomRooms(runtimeMode));
  const [isRoomsHeaderCompact, setIsRoomsHeaderCompact] = React.useState(false);
  const [roomTitleScrollEdges, setRoomTitleScrollEdges] = React.useState({
    start: false,
    end: false,
  });
  const [hiddenRoomEntitiesByRoom, setHiddenRoomEntitiesByRoom] =
    React.useState<HiddenRoomEntitiesByRoom>(() => readStoredHiddenRoomEntitiesByRoom(runtimeMode));
  const [roomsStateRuntime, setRoomsStateRuntime] = React.useState<DashboardRuntimeMode>(runtimeMode);
  const [createdHaAreas, setCreatedHaAreas] = React.useState<HaArea[]>([]);
  const [deletedHaAreaIds, setDeletedHaAreaIds] = React.useState<string[]>([]);
  const [activeRoomId, setActiveRoomId] = React.useState<string>(() => readStoredActiveRoomId(runtimeMode));
  const [activeCameraViewerEntityId, setActiveCameraViewerEntityId] = React.useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = React.useState<string>('all');
  const [selectedClimateEntityId, setSelectedClimateEntityId] = React.useState('');
  const [selectedMediaEntityId, setSelectedMediaEntityId] = React.useState('');
  const [isFloorLayerOpen, setIsFloorLayerOpen] = React.useState(false);
  const [isManageOpen, setIsManageOpen] = React.useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = React.useState(false);
  const [isAreaCreateDetailsOpen, setIsAreaCreateDetailsOpen] = React.useState(false);
  const [editingRoom, setEditingRoom] = React.useState<RoomEditTarget | null>(null);
  const [newRoomName, setNewRoomName] = React.useState('');
  const [areaCreationDraft, setAreaCreationDraft] = React.useState<AreaCreationDraft>(EMPTY_AREA_CREATION_DRAFT);
  const [roomCreateError, setRoomCreateError] = React.useState<string | null>(null);
  const [areaActionById, setAreaActionById] = React.useState<Record<string, 'saving' | 'deleting'>>({});
  const [areaErrorById, setAreaErrorById] = React.useState<Record<string, string>>({});
  const [haFloors, setHaFloors] = React.useState<HaFloorEntry[]>([]);
  const [createdHaFloors, setCreatedHaFloors] = React.useState<HaFloorEntry[]>([]);
  const [deletedHaFloorIds, setDeletedHaFloorIds] = React.useState<string[]>([]);
  const [editingFloorId, setEditingFloorId] = React.useState<string | null>(null);
  const [floorDraftById, setFloorDraftById] = React.useState<Record<string, FloorDraft>>({});
  const [floorActionById, setFloorActionById] = React.useState<Record<string, FloorAction>>({});
  const [floorErrorById, setFloorErrorById] = React.useState<Record<string, string>>({});
  const [floorDeleteCandidate, setFloorDeleteCandidate] = React.useState<HaFloorEntry | null>(null);
  const [isAddingFloor, setIsAddingFloor] = React.useState(false);
  const [newFloorDraft, setNewFloorDraft] = React.useState<FloorDraft>(EMPTY_FLOOR_DRAFT);
  const [isCreatingFloor, setIsCreatingFloor] = React.useState(false);
  const [floorCreateError, setFloorCreateError] = React.useState<string | null>(null);
  const [isLoadingAreaMetadata, setIsLoadingAreaMetadata] = React.useState(false);
  const [hasLoadedRegistryMetadata, setHasLoadedRegistryMetadata] = React.useState(false);
  const [hasLoadedFloorMetadata, setHasLoadedFloorMetadata] = React.useState(false);
  const [entityAreaByEntityId, setEntityAreaByEntityId] = React.useState<Record<string, string>>({});
  const [registryEntityEntries, setRegistryEntityEntries] = React.useState<HaRegistryEntityEntry[]>([]);
  const [registryDeviceEntries, setRegistryDeviceEntries] = React.useState<HaRegistryDeviceEntry[]>([]);
  const [registryLoadAt, setRegistryLoadAt] = React.useState<number>(0);
  const [editingRoomSection, setEditingRoomSection] = React.useState<RoomSectionEditTarget | null>(null);
  const [isSectionTargetSelectionMode, setIsSectionTargetSelectionMode] = React.useState(false);
  const [isSectionInteractionGuideOpen, setIsSectionInteractionGuideOpen] = React.useState(true);
  const [selectedSectionTargetIds, setSelectedSectionTargetIds] = React.useState<Record<string, boolean>>({});
  const [selectedSectionAddTargetIds, setSelectedSectionAddTargetIds] = React.useState<Record<string, boolean>>({});
  const [sectionDeviceSheetMode, setSectionDeviceSheetMode] = React.useState<SectionDeviceSheetMode>(null);
  const [sectionDeviceSearch, setSectionDeviceSearch] = React.useState('');
  const [sectionMoveTargetAreaId, setSectionMoveTargetAreaId] = React.useState('');
  const [sectionActionBusy, setSectionActionBusy] = React.useState(false);
  const [sectionActionError, setSectionActionError] = React.useState<string | null>(null);
  const [optimisticRoomToggleByEntityId, setOptimisticRoomToggleByEntityId] = React.useState<
    Record<string, RoomOptimisticToggleState>
  >({});
  const [quickSliderDraftByEntityId, setQuickSliderDraftByEntityId] = React.useState<
    Record<string, RoomQuickSliderDraftState>
  >({});
  const [demoToggleById, setDemoToggleById] = React.useState<Record<string, boolean>>({
    'demo-light': true,
    'demo-stereo': false,
    'demo-tv': false,
    'demo-monitoring': true,
  });
  const [sceneByRoomId, setSceneByRoomId] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (roomsStateRuntime === runtimeMode) return;
    setCustomRooms(readStoredCustomRooms(runtimeMode));
    setHiddenRoomEntitiesByRoom(readStoredHiddenRoomEntitiesByRoom(runtimeMode));
    setActiveRoomId(readStoredActiveRoomId(runtimeMode));
    setRoomsStateRuntime(runtimeMode);
  }, [roomsStateRuntime, runtimeMode]);

  React.useEffect(() => {
    if (canManageRooms) {
      return;
    }
    setIsManageOpen(false);
    setIsAddingFloor(false);
    setEditingFloorId(null);
    setFloorDeleteCandidate(null);
    setEditingRoom(null);
    setEditingRoomSection(null);
    setIsSectionTargetSelectionMode(false);
    setSelectedSectionTargetIds({});
    setSelectedSectionAddTargetIds({});
    setSectionDeviceSheetMode(null);
    setSectionActionError(null);
  }, [canManageRooms]);

  React.useEffect(() => {
    const entries = Object.entries(optimisticRoomToggleByEntityId);
    if (entries.length === 0) {
      return undefined;
    }

    const cleanup = () => {
      const now = Date.now();
      setOptimisticRoomToggleByEntityId((current) => {
        let changed = false;
        const next = { ...current };
        Object.entries(current).forEach(([entityId, optimisticState]) => {
          const liveEntity = haStates[entityId];
          const liveIsOn = isEntityOn(entityId, liveEntity);
          if (optimisticState.expiresAt <= now || liveIsOn === optimisticState.isOn) {
            delete next[entityId];
            changed = true;
          }
        });
        return changed ? next : current;
      });
    };

    cleanup();
    const nextExpiry = Math.min(...entries.map(([, optimisticState]) => optimisticState.expiresAt));
    const cleanupDelay = Math.max(250, nextExpiry - Date.now());
    const cleanupTimer = window.setTimeout(cleanup, cleanupDelay);
    return () => window.clearTimeout(cleanupTimer);
  }, [haStates, optimisticRoomToggleByEntityId]);

  React.useEffect(() => {
    const entries = Object.entries(quickSliderDraftByEntityId);
    if (entries.length === 0) {
      return undefined;
    }

    const cleanup = () => {
      const now = Date.now();
      setQuickSliderDraftByEntityId((current) => {
        let changed = false;
        const next = { ...current };
        Object.entries(current).forEach(([entityId, draftState]) => {
          if (draftState.expiresAt <= now) {
            delete next[entityId];
            changed = true;
          }
        });
        return changed ? next : current;
      });
    };

    const nextExpiry = Math.min(...entries.map(([, draftState]) => draftState.expiresAt));
    const cleanupDelay = Math.max(250, nextExpiry - Date.now());
    const cleanupTimer = window.setTimeout(cleanup, cleanupDelay);
    return () => window.clearTimeout(cleanupTimer);
  }, [quickSliderDraftByEntityId]);

  const resetRoomForm = React.useCallback(() => {
    setEditingRoom(null);
    setNewRoomName('');
    setAreaCreationDraft(EMPTY_AREA_CREATION_DRAFT);
    setRoomCreateError(null);
    setIsAreaCreateDetailsOpen(false);
  }, []);

  const effectiveHaAreas = React.useMemo<HaArea[]>(() => {
    if (!haConnected) {
      return [];
    }
    const deletedAreaIds = new Set(deletedHaAreaIds);
    const localAreaById = new Map(createdHaAreas.map((area) => [area.area_id, area]));
    const visibleHaAreas = haAreas.filter((area) => !deletedAreaIds.has(area.area_id));
    const knownAreaIds = new Set(visibleHaAreas.map((area) => area.area_id));
    return [
      ...visibleHaAreas.map((area) => localAreaById.get(area.area_id) ?? area),
      ...createdHaAreas.filter((area) => !knownAreaIds.has(area.area_id) && !deletedAreaIds.has(area.area_id)),
    ];
  }, [createdHaAreas, deletedHaAreaIds, haAreas, haConnected]);

  const effectiveHaFloors = React.useMemo<HaFloorEntry[]>(() => {
    if (!haConnected) {
      return [];
    }
    const deletedFloorIds = new Set(deletedHaFloorIds);
    const localFloorById = new Map(createdHaFloors.map((floor) => [floor.floor_id, floor]));
    const visibleFloors = haFloors.filter((floor) => !deletedFloorIds.has(floor.floor_id));
    const knownFloorIds = new Set(visibleFloors.map((floor) => floor.floor_id));
    return [
      ...visibleFloors.map((floor) => localFloorById.get(floor.floor_id) ?? floor),
      ...createdHaFloors.filter(
        (floor) => !knownFloorIds.has(floor.floor_id) && !deletedFloorIds.has(floor.floor_id),
      ),
    ];
  }, [createdHaFloors, deletedHaFloorIds, haConnected, haFloors]);

  const floorById = React.useMemo(
    () => new Map(effectiveHaFloors.map((floor) => [floor.floor_id, floor])),
    [effectiveHaFloors],
  );
  const areaById = React.useMemo(
    () => new Map(effectiveHaAreas.map((area) => [area.area_id, area])),
    [effectiveHaAreas],
  );
  const currentFloor = selectedFloorId === 'all' ? undefined : floorById.get(selectedFloorId);
  const currentFloorLabel = selectedFloorId === 'all' ? rt('allFloors') : currentFloor?.name ?? rt('allFloors');
  const currentFloorTabLabel = formatFloorTabLabel(currentFloor, rt);
  const CurrentFloorIcon = getFloorIcon(currentFloor);
  const roomCountByFloorId = React.useMemo<Record<string, number>>(() => {
    return effectiveHaAreas.reduce<Record<string, number>>((acc, area) => {
      if (area.floor_id) {
        acc[area.floor_id] = (acc[area.floor_id] ?? 0) + 1;
      }
      return acc;
    }, {});
  }, [effectiveHaAreas]);

  const haRoomTabs = React.useMemo<RoomTab[]>(
    () =>
      effectiveHaAreas.map((area) => ({
        id: area.area_id,
        name: area.name,
        source: 'ha',
      })),
    [effectiveHaAreas],
  );

  const customRoomTabs = React.useMemo<RoomTab[]>(
    () =>
      [...(roomsStateRuntime === runtimeMode ? customRooms : [])]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((room) => ({
          id: room.id,
          name: room.name,
          source: 'custom',
        })),
    [customRooms, roomsStateRuntime, runtimeMode],
  );

  const allRoomTabs = React.useMemo<RoomTab[]>(() => {
    const merged = [...haRoomTabs, ...customRoomTabs];
    return merged.length > 0 ? merged : runtimeMode === 'demo' ? DEMO_ROOM_TABS : [];
  }, [customRoomTabs, haRoomTabs, runtimeMode]);
  const roomTabs = React.useMemo<RoomTab[]>(() => {
    if (selectedFloorId === 'all') {
      return allRoomTabs;
    }
    return allRoomTabs.filter((tab) => {
      if (tab.source !== 'ha') {
        return false;
      }
      const area = effectiveHaAreas.find((haArea) => haArea.area_id === tab.id);
      return area?.floor_id === selectedFloorId;
    });
  }, [allRoomTabs, effectiveHaAreas, selectedFloorId]);
  const persistedCustomRoomIds = React.useMemo(
    () => new Set(customRooms.map((room) => room.id)),
    [customRooms],
  );

  const roomIds = React.useMemo(() => new Set(roomTabs.map((tab) => tab.id)), [roomTabs]);
  const activeRoomTab = React.useMemo(
    () => roomTabs.find((tab) => tab.id === activeRoomId) ?? roomTabs[0] ?? null,
    [activeRoomId, roomTabs],
  );
  const activeRoomTitle = activeRoomTab?.name ?? (selectedFloorId === 'all' ? rt('rooms') : currentFloorLabel);
  const activeRoomTitleKey = `${activeRoomTab?.id ?? 'default-room'}:${activeRoomTitle}`;
  const temperatureEntityOptions = React.useMemo(
    () =>
      Object.entries(haStates)
        .filter(([entityId, state]) => isAreaSensorEntityCandidate(entityId, state, 'temperature'))
        .map(([entityId, state]) => ({ entityId, name: getEntityFriendlyName(entityId, state) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [haStates],
  );
  const humidityEntityOptions = React.useMemo(
    () =>
      Object.entries(haStates)
        .filter(([entityId, state]) => isAreaSensorEntityCandidate(entityId, state, 'humidity'))
        .map(([entityId, state]) => ({ entityId, name: getEntityFriendlyName(entityId, state) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [haStates],
  );

  const updateRoomTitleScrollEdges = React.useCallback(() => {
    const scroller = roomTitleScrollerRef.current;
    if (!scroller) {
      return;
    }
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const nextEdges = {
      start: scroller.scrollLeft > 2,
      end: scroller.scrollLeft < maxScrollLeft - 2,
    };
    setRoomTitleScrollEdges((current) => {
      if (current.start === nextEdges.start && current.end === nextEdges.end) {
        return current;
      }
      return nextEdges;
    });
  }, []);

  React.useLayoutEffect(() => {
    updateRoomTitleScrollEdges();
    const scroller = roomTitleScrollerRef.current;
    if (!scroller) {
      return;
    }

    const handleResize = () => updateRoomTitleScrollEdges();
    window.addEventListener('resize', handleResize);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;
    observer?.observe(scroller);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [activeRoomTitleKey, roomTabs.length, updateRoomTitleScrollEdges]);

  const roomTitleMaskStyle = React.useMemo<React.CSSProperties>(() => {
    let maskImage = 'none';
    if (roomTitleScrollEdges.start && roomTitleScrollEdges.end) {
      maskImage =
        'linear-gradient(90deg, transparent 0, #000 1.25rem, #000 calc(100% - 1.25rem), transparent 100%)';
    } else if (roomTitleScrollEdges.start) {
      maskImage = 'linear-gradient(90deg, transparent 0, #000 1.25rem, #000 100%)';
    } else if (roomTitleScrollEdges.end) {
      maskImage = 'linear-gradient(90deg, #000 0, #000 calc(100% - 1.25rem), transparent 100%)';
    }
    return {
      maskImage,
      WebkitMaskImage: maskImage,
    };
  }, [roomTitleScrollEdges.end, roomTitleScrollEdges.start]);

  const handleRoomsPageScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const nextCompact = event.currentTarget.scrollTop >= ROOM_HEADER_COMPACT_SCROLL_PX;
    setIsRoomsHeaderCompact((current) => (current === nextCompact ? current : nextCompact));
  }, []);

  React.useEffect(() => {
    if (roomTabs.length === 0) {
      if (activeRoomId) {
        setActiveRoomId('');
      }
      return;
    }
    if (!activeRoomId || !roomIds.has(activeRoomId)) {
      setActiveRoomId(roomTabs[0].id);
    }
  }, [activeRoomId, roomIds, roomTabs]);

  React.useEffect(() => {
    if (selectedFloorId === 'all' || floorById.has(selectedFloorId)) {
      return;
    }
    setSelectedFloorId('all');
  }, [floorById, selectedFloorId]);

  React.useEffect(() => {
    if (isManageOpen) {
      return;
    }
    resetRoomForm();
  }, [isManageOpen, resetRoomForm]);

  React.useEffect(() => {
    if (!canManageRooms || roomsStateRuntime !== runtimeMode || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      getRoomsRuntimeStorageKey(CUSTOM_ROOMS_STORAGE_KEY, runtimeMode),
      JSON.stringify(customRooms),
    );
  }, [canManageRooms, customRooms, roomsStateRuntime, runtimeMode]);

  React.useEffect(() => {
    if (!canManageRooms || roomsStateRuntime !== runtimeMode || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      getRoomsRuntimeStorageKey(ROOM_ENTITY_VISIBILITY_STORAGE_KEY, runtimeMode),
      JSON.stringify(hiddenRoomEntitiesByRoom),
    );
  }, [canManageRooms, hiddenRoomEntitiesByRoom, roomsStateRuntime, runtimeMode]);

  React.useEffect(() => {
    if (roomsStateRuntime !== runtimeMode || typeof window === 'undefined') {
      return;
    }
    if (!activeRoomId) {
      window.localStorage.removeItem(getRoomsRuntimeStorageKey(ACTIVE_ROOM_STORAGE_KEY, runtimeMode));
      return;
    }
    window.localStorage.setItem(getRoomsRuntimeStorageKey(ACTIVE_ROOM_STORAGE_KEY, runtimeMode), activeRoomId);
  }, [activeRoomId, roomsStateRuntime, runtimeMode]);

  React.useEffect(() => {
    setEditingRoomSection(null);
    setSelectedSectionTargetIds({});
    setSelectedSectionAddTargetIds({});
    setSectionDeviceSheetMode(null);
    setSectionDeviceSearch('');
    setSectionMoveTargetAreaId('');
    setSectionActionError(null);
  }, [activeRoomId]);

  React.useEffect(() => {
    if (!haConnected || !onCallApi) {
      setEntityAreaByEntityId({});
      setRegistryEntityEntries([]);
      setRegistryDeviceEntries([]);
      setHasLoadedRegistryMetadata(true);
      return;
    }
    let cancelled = false;
    setHasLoadedRegistryMetadata(false);

    const load = async () => {
      try {
        const snapshot = await fetchRegistrySnapshot(onCallApi);
        if (cancelled) {
          return;
        }
        setEntityAreaByEntityId(snapshot.entityAreaByEntityId);
        setRegistryEntityEntries(snapshot.registryEntities);
        setRegistryDeviceEntries(snapshot.registryDevices);
        setRegistryLoadAt(Date.now());
      } catch {
        if (cancelled) {
          return;
        }
        setEntityAreaByEntityId({});
        setRegistryEntityEntries([]);
        setRegistryDeviceEntries([]);
      } finally {
        if (!cancelled) {
          setHasLoadedRegistryMetadata(true);
        }
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [haConnected, onCallApi]);

  React.useEffect(() => {
    if (!isManageOpen) {
      return;
    }
    setAreaErrorById({});
  }, [isManageOpen]);

  React.useEffect(() => {
    if (!haConnected || !onCallApi) {
      setHaFloors([]);
      setIsLoadingAreaMetadata(false);
      setHasLoadedFloorMetadata(true);
      return;
    }

    let cancelled = false;
    setIsLoadingAreaMetadata(true);
    setHasLoadedFloorMetadata(false);

    const load = async () => {
      const floorPayload = await onCallApi({ type: 'config/floor_registry/list' }, { reportError: false });
      if (cancelled) {
        return;
      }
      setHaFloors(parseHaFloorList(floorPayload));
      setIsLoadingAreaMetadata(false);
      setHasLoadedFloorMetadata(true);
    };

    void load().catch(() => {
      if (!cancelled) {
        setHaFloors([]);
        setIsLoadingAreaMetadata(false);
        setHasLoadedFloorMetadata(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [haConnected, onCallApi]);

  const addCustomRoom = async () => {
    if (!canManageRooms) {
      return;
    }
    const normalized = normalizeRoomName(newRoomName);
    if (!normalized) {
      return;
    }

    setRoomCreateError(null);

    if (haConnected && onCallApi) {
      setIsCreatingRoom(true);
      try {
        const aliases = uniqueStrings(parseDelimitedList(areaCreationDraft.aliases));
        const areaCreatePayload: Record<string, unknown> = {
          type: 'config/area_registry/create',
          name: normalized,
        };
        if (areaCreationDraft.floorId.trim()) {
          areaCreatePayload.floor_id = areaCreationDraft.floorId.trim();
        }
        if (areaCreationDraft.icon.trim()) {
          areaCreatePayload.icon = areaCreationDraft.icon.trim();
        }
        if (aliases.length > 0) {
          areaCreatePayload.aliases = aliases;
        }
        if (areaCreationDraft.picture.trim()) {
          areaCreatePayload.picture = areaCreationDraft.picture.trim();
        }
        if (areaCreationDraft.temperatureEntityId.trim()) {
          areaCreatePayload.temperature_entity_id = areaCreationDraft.temperatureEntityId.trim();
        }
        if (areaCreationDraft.humidityEntityId.trim()) {
          areaCreatePayload.humidity_entity_id = areaCreationDraft.humidityEntityId.trim();
        }
        const createdArea = parseHaAreaEntry(
          await onCallApi(areaCreatePayload),
        );
        if (!createdArea) {
          setRoomCreateError(rt('areaCreateFailed'));
          return;
        }
        setCreatedHaAreas((current) => {
          const withoutDuplicate = current.filter((area) => area.area_id !== createdArea.area_id);
          return [...withoutDuplicate, createdArea];
        });
        setActiveRoomId(createdArea.area_id);
        resetRoomForm();
        return;
      } catch {
        setRoomCreateError(rt('areaCreateFailed'));
        return;
      } finally {
        setIsCreatingRoom(false);
      }
    }

    const id = `${ROOM_ID_CUSTOM_PREFIX}${buildRandomId()}`;
    const nextRoom: CustomRoomRecord = {
      id,
      name: normalized,
      createdAt: Date.now(),
    };
    setCustomRooms((current) => [...current, nextRoom]);
    setActiveRoomId(id);
    resetRoomForm();
  };

  const startEditRoom = (tab: RoomTab, haArea?: HaArea | null) => {
    if (!canManageRooms) {
      return;
    }
    if (tab.source === 'ha' && !haArea) {
      return;
    }
    setEditingRoom({ id: tab.id, source: tab.source });
    setActiveRoomId(tab.id);
    setRoomCreateError(null);
    setNewRoomName(tab.name);
    if (tab.source === 'ha' && haArea) {
      const draft = buildAreaEditDraft(haArea);
      setNewRoomName(draft.name);
      setAreaCreationDraft({
        floorId: draft.floorId,
        icon: draft.icon,
        aliases: draft.aliases,
        picture: draft.picture,
        temperatureEntityId: draft.temperatureEntityId,
        humidityEntityId: draft.humidityEntityId,
      });
      setIsAreaCreateDetailsOpen(true);
      return;
    }
    setAreaCreationDraft(EMPTY_AREA_CREATION_DRAFT);
    setIsAreaCreateDetailsOpen(false);
  };

  const saveRoomEdit = async () => {
    if (!canManageRooms || !editingRoom) {
      return;
    }
    const nextName = normalizeRoomName(newRoomName);
    if (!nextName) {
      setRoomCreateError(rt('roomNameRequired'));
      return;
    }

    setRoomCreateError(null);

    if (editingRoom.source === 'custom') {
      setCustomRooms((current) =>
        current.map((room) => (room.id === editingRoom.id ? { ...room, name: nextName } : room)),
      );
      setActiveRoomId(editingRoom.id);
      resetRoomForm();
      return;
    }

    if (!onCallApi) {
      setRoomCreateError(rt('haUnavailable'));
      return;
    }

    setAreaActionById((current) => ({ ...current, [editingRoom.id]: 'saving' }));
    setAreaErrorById((current) => {
      const next = { ...current };
      delete next[editingRoom.id];
      return next;
    });

    try {
      const updatedArea = parseHaAreaEntry(
        await onCallApi({
          type: 'config/area_registry/update',
          area_id: editingRoom.id,
          name: nextName,
          floor_id: trimToNull(areaCreationDraft.floorId),
          icon: trimToNull(areaCreationDraft.icon),
          aliases: uniqueStrings(parseDelimitedList(areaCreationDraft.aliases)),
          picture: trimToNull(areaCreationDraft.picture),
          temperature_entity_id: trimToNull(areaCreationDraft.temperatureEntityId),
          humidity_entity_id: trimToNull(areaCreationDraft.humidityEntityId),
        }),
      );
      if (!updatedArea) {
        setRoomCreateError(rt('areaSaveFailed'));
        return;
      }
      setCreatedHaAreas((current) => {
        const withoutDuplicate = current.filter((area) => area.area_id !== updatedArea.area_id);
        return [...withoutDuplicate, updatedArea];
      });
      setDeletedHaAreaIds((current) => current.filter((id) => id !== updatedArea.area_id));
      setActiveRoomId(updatedArea.area_id);
      resetRoomForm();
    } catch {
      setRoomCreateError(rt('areaSaveFailed'));
    } finally {
      setAreaActionById((current) => {
        const next = { ...current };
        delete next[editingRoom.id];
        return next;
      });
    }
  };

  const submitRoomForm = async () => {
    if (!canManageRooms) {
      return;
    }
    if (editingRoom) {
      await saveRoomEdit();
      return;
    }
    await addCustomRoom();
  };

  const removeCustomRoom = (roomId: string, roomName: string) => {
    if (!canManageRooms) {
      return;
    }
    const confirmed =
      typeof window === 'undefined' ||
      window.confirm(rt('roomDeleteConfirm', { name: roomName }));
    if (!confirmed) {
      return;
    }
    setCustomRooms((current) => current.filter((room) => room.id !== roomId));
    if (editingRoom?.id === roomId) {
      resetRoomForm();
    }
    if (activeRoomId === roomId) {
      const nextRoom = roomTabs.find((tab) => tab.id !== roomId);
      setActiveRoomId(nextRoom?.id ?? '');
    }
  };

  const removeHaArea = async (areaId: string, areaName: string) => {
    if (!canManageRooms || !onCallApi) {
      return;
    }
    const confirmed =
      typeof window === 'undefined' ||
      window.confirm(rt('areaDeleteConfirm', { name: areaName }));
    if (!confirmed) {
      return;
    }

    setAreaActionById((current) => ({ ...current, [areaId]: 'deleting' }));
    setAreaErrorById((current) => {
      const next = { ...current };
      delete next[areaId];
      return next;
    });

    try {
      const result = await onCallApi({
        type: 'config/area_registry/delete',
        area_id: areaId,
      });
      if (result === null) {
        setAreaErrorById((current) => ({
          ...current,
          [areaId]: rt('areaDeleteFailed'),
        }));
        return;
      }
      setDeletedHaAreaIds((current) => uniqueStrings([...current, areaId]));
      setCreatedHaAreas((current) => current.filter((area) => area.area_id !== areaId));
      if (editingRoom?.id === areaId) {
        resetRoomForm();
      }
      if (activeRoomId === areaId) {
        const nextRoom = roomTabs.find((tab) => tab.id !== areaId);
        setActiveRoomId(nextRoom?.id ?? '');
      }
    } catch {
      setAreaErrorById((current) => ({
        ...current,
        [areaId]: rt('areaDeleteFailed'),
      }));
    } finally {
      setAreaActionById((current) => {
        const next = { ...current };
        delete next[areaId];
        return next;
      });
    }
  };

  const resetFloorCreateForm = () => {
    setIsAddingFloor(false);
    setNewFloorDraft(EMPTY_FLOOR_DRAFT);
    setFloorCreateError(null);
  };

  const startEditFloor = (floor: HaFloorEntry) => {
    if (!canManageRooms) {
      return;
    }
    setEditingFloorId(floor.floor_id);
    setFloorDraftById((current) => ({ ...current, [floor.floor_id]: buildFloorDraft(floor) }));
    setFloorErrorById((current) => {
      const next = { ...current };
      delete next[floor.floor_id];
      return next;
    });
  };

  const createHaFloor = async () => {
    if (!canManageRooms || !onCallApi) {
      setFloorCreateError(rt('haUnavailable'));
      return;
    }
    const nextName = normalizeRoomName(newFloorDraft.name);
    if (!nextName) {
      setFloorCreateError(rt('floorNameRequired'));
      return;
    }
    const nextLevel = parseOptionalInteger(newFloorDraft.level);
    if (nextLevel === undefined) {
      setFloorCreateError('Il livello deve essere un numero intero.');
      return;
    }

    setIsCreatingFloor(true);
    setFloorCreateError(null);
    try {
      const aliases = uniqueStrings(parseDelimitedList(newFloorDraft.aliases));
      const floorCreatePayload: Record<string, unknown> = {
        type: 'config/floor_registry/create',
        name: nextName,
      };
      if (aliases.length > 0) {
        floorCreatePayload.aliases = aliases;
      }
      if (nextLevel !== null) {
        floorCreatePayload.level = nextLevel;
      }
      const createdFloor = parseHaFloorEntry(
        await onCallApi(floorCreatePayload),
      );
      if (!createdFloor) {
        setFloorCreateError(rt('floorCreateFailed'));
        return;
      }
      setCreatedHaFloors((current) => {
        const withoutDuplicate = current.filter((floor) => floor.floor_id !== createdFloor.floor_id);
        return [...withoutDuplicate, createdFloor];
      });
      setDeletedHaFloorIds((current) => current.filter((id) => id !== createdFloor.floor_id));
      setSelectedFloorId(createdFloor.floor_id);
      resetFloorCreateForm();
      setIsFloorLayerOpen(false);
    } catch {
      setFloorCreateError(rt('floorCreateFailed'));
    } finally {
      setIsCreatingFloor(false);
    }
  };

  const saveHaFloor = async (floorId: string) => {
    if (!canManageRooms || !onCallApi) {
      return;
    }
    const draft = floorDraftById[floorId];
    if (!draft) {
      return;
    }
    const nextName = normalizeRoomName(draft.name);
    if (!nextName) {
      setFloorErrorById((current) => ({ ...current, [floorId]: rt('floorNameRequired') }));
      return;
    }
    const nextLevel = parseOptionalInteger(draft.level);
    if (nextLevel === undefined) {
      setFloorErrorById((current) => ({ ...current, [floorId]: 'Il livello deve essere un numero intero.' }));
      return;
    }

    setFloorActionById((current) => ({ ...current, [floorId]: 'saving' }));
    setFloorErrorById((current) => {
      const next = { ...current };
      delete next[floorId];
      return next;
    });

    try {
      const aliases = uniqueStrings(parseDelimitedList(draft.aliases));
      const updatedFloor = parseHaFloorEntry(
        await onCallApi({
          type: 'config/floor_registry/update',
          floor_id: floorId,
          name: nextName,
          aliases,
          level: nextLevel,
        }),
      );
      if (!updatedFloor) {
        setFloorErrorById((current) => ({
          ...current,
          [floorId]: rt('floorSaveFailed'),
        }));
        return;
      }
      setCreatedHaFloors((current) => {
        const withoutDuplicate = current.filter((floor) => floor.floor_id !== updatedFloor.floor_id);
        return [...withoutDuplicate, updatedFloor];
      });
      setEditingFloorId(null);
      setSelectedFloorId(updatedFloor.floor_id);
    } catch {
      setFloorErrorById((current) => ({
        ...current,
        [floorId]: rt('floorSaveFailed'),
      }));
    } finally {
      setFloorActionById((current) => {
        const next = { ...current };
        delete next[floorId];
        return next;
      });
    }
  };

  const reorderHaFloor = async (floorId: string, direction: -1 | 1) => {
    if (!canManageRooms || !onCallApi) {
      return;
    }
    const currentIndex = effectiveHaFloors.findIndex((floor) => floor.floor_id === floorId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= effectiveHaFloors.length) {
      return;
    }
    const nextFloors = [...effectiveHaFloors];
    const [movedFloor] = nextFloors.splice(currentIndex, 1);
    nextFloors.splice(nextIndex, 0, movedFloor);

    setFloorActionById((current) => ({ ...current, [floorId]: 'reordering' }));
    setFloorErrorById((current) => {
      const next = { ...current };
      delete next[floorId];
      return next;
    });

    try {
      await onCallApi({
        type: 'config/floor_registry/reorder',
        floor_ids: nextFloors.map((floor) => floor.floor_id),
      });
      setHaFloors(nextFloors);
    } catch {
      setFloorErrorById((current) => ({
        ...current,
        [floorId]: rt('floorReorderFailed'),
      }));
    } finally {
      setFloorActionById((current) => {
        const next = { ...current };
        delete next[floorId];
        return next;
      });
    }
  };

  const removeHaFloor = async (floor: HaFloorEntry) => {
    if (!canManageRooms || !onCallApi) {
      return;
    }

    setFloorActionById((current) => ({ ...current, [floor.floor_id]: 'deleting' }));
    setFloorErrorById((current) => {
      const next = { ...current };
      delete next[floor.floor_id];
      return next;
    });

    try {
      await onCallApi({
        type: 'config/floor_registry/delete',
        floor_id: floor.floor_id,
      });
      setDeletedHaFloorIds((current) => uniqueStrings([...current, floor.floor_id]));
      setCreatedHaFloors((current) => current.filter((entry) => entry.floor_id !== floor.floor_id));
      setFloorDraftById((current) => {
        const next = { ...current };
        delete next[floor.floor_id];
        return next;
      });
      if (selectedFloorId === floor.floor_id) {
        setSelectedFloorId('all');
      }
      if (editingFloorId === floor.floor_id) {
        setEditingFloorId(null);
      }
      setFloorDeleteCandidate(null);
    } catch {
      setFloorErrorById((current) => ({
        ...current,
        [floor.floor_id]: rt('floorDeleteFailed'),
      }));
    } finally {
      setFloorActionById((current) => {
        const next = { ...current };
        delete next[floor.floor_id];
        return next;
      });
    }
  };

  const bucketsByAreaId = React.useMemo<Record<string, RoomEntityBuckets>>(() => {
    const byArea: Record<string, RoomEntityBuckets> = {};
    Object.keys(haStates).forEach((entityId) => {
      const areaId = entityAreaByEntityId[entityId];
      if (!areaId) {
        return;
      }
      const buckets = byArea[areaId] ?? createEmptyBuckets();
      bucketEntityId(entityId, buckets);
      byArea[areaId] = buckets;
    });
    return byArea;
  }, [entityAreaByEntityId, haStates]);

  const activeBuckets = React.useMemo(() => {
    if (!activeRoomTab || activeRoomTab.source !== 'ha') {
      return createEmptyBuckets();
    }
    return bucketsByAreaId[activeRoomTab.id] ?? createEmptyBuckets();
  }, [activeRoomTab, bucketsByAreaId]);
  const hiddenActiveRoomEntityIds = React.useMemo(
    () => new Set(activeRoomTab ? hiddenRoomEntitiesByRoom[activeRoomTab.id] ?? [] : []),
    [activeRoomTab, hiddenRoomEntitiesByRoom],
  );
  const visibleActiveBuckets = React.useMemo(
    () => filterRoomEntityBuckets(activeBuckets, (entityId) => !hiddenActiveRoomEntityIds.has(entityId)),
    [activeBuckets, hiddenActiveRoomEntityIds],
  );
  const activeRoomArea = React.useMemo(
    () => (activeRoomTab?.source === 'ha' ? areaById.get(activeRoomTab.id) ?? null : null),
    [activeRoomTab, areaById],
  );
  const registryEntityByEntityId = React.useMemo(
    () => new Map(registryEntityEntries.map((entry) => [entry.entityId, entry])),
    [registryEntityEntries],
  );
  const registryDeviceById = React.useMemo(
    () => new Map(registryDeviceEntries.map((entry) => [entry.id, entry])),
    [registryDeviceEntries],
  );
  const canOpenActiveHaRoomSection = Boolean(
    canManageRooms && activeRoomTab?.source === 'ha' && haConnected && onCallApi,
  );
  const canEditActiveHaRoom = Boolean(canOpenActiveHaRoomSection && canManageRooms);
  const isDemoSeedRoom = Boolean(activeRoomTab?.id.startsWith('demo-'));

  const weatherEntityId = React.useMemo(() => {
    if (visibleActiveBuckets.weathers.length > 0) {
      return visibleActiveBuckets.weathers[0];
    }
    if (isDemoSeedRoom) {
      return Object.keys(haStates).find((entityId) => entityId.startsWith('weather.')) ?? null;
    }
    return null;
  }, [haStates, isDemoSeedRoom, visibleActiveBuckets.weathers]);

  const climateEntityIds = React.useMemo(
    () => (visibleActiveBuckets.climates.length > 0 ? visibleActiveBuckets.climates : isDemoSeedRoom ? ['climate.air_conditioner'] : []),
    [isDemoSeedRoom, visibleActiveBuckets.climates],
  );

  React.useEffect(() => {
    if (climateEntityIds.length === 0) {
      setSelectedClimateEntityId('');
      return;
    }
    setSelectedClimateEntityId((current) => (current && climateEntityIds.includes(current) ? current : climateEntityIds[0]));
  }, [climateEntityIds]);

  const climateEntityId = selectedClimateEntityId || climateEntityIds[0] || null;
  const climateEntity = climateEntityId ? haStates[climateEntityId] : undefined;
  const climateCurrentTemp =
    toNumber(climateEntity?.currentValue) ??
    toNumber(climateEntity?.rawAttributes?.current_temperature) ??
    24;
  const climateTargetTemp =
    toNumber(climateEntity?.targetValue) ??
    toNumber(climateEntity?.rawAttributes?.temperature) ??
    22;
  const climateMode =
    `${climateEntity?.hvacMode ?? climateEntity?.rawAttributes?.hvac_mode ?? 'auto'}`
      .trim()
      .toUpperCase();

  const doorTiles = React.useMemo<RoomDoorTile[]>(() => {
    const lockIds = visibleActiveBuckets.locks.slice(0, 2);
    if (lockIds.length === 0 && isDemoSeedRoom) {
      return [
        {
          id: 'demo-front-door',
          title: 'Porta ingresso',
          subtitle: 'Chiusa',
          isClosed: true,
          icon: <Lock size={16} />,
          isLive: false,
        },
        {
          id: 'demo-back-door',
          title: 'Porta retro',
          subtitle: 'Chiusa',
          isClosed: true,
          icon: <Lock size={16} />,
          isLive: false,
        },
      ];
    }
    if (lockIds.length === 0) {
      return [];
    }
    return lockIds.map((entityId) => {
      const state = haStates[entityId];
      const normalized = `${state?.state ?? ''}`.trim().toLowerCase();
      const isClosed = normalized === 'locked' || normalized === 'closed';
      return {
        id: entityId,
        title: getEntityFriendlyName(entityId, state),
        subtitle: isClosed ? 'Chiusa' : 'Aperta',
        entityId,
        isClosed,
        icon: isClosed ? <Lock size={16} /> : <Unlock size={16} />,
        isLive: true,
      };
    });
  }, [haStates, isDemoSeedRoom, visibleActiveBuckets.locks]);

  const quickTiles = React.useMemo<RoomQuickTile[]>(() => {
    const liveCandidates = [
      ...visibleActiveBuckets.lights,
      ...visibleActiveBuckets.switches,
      ...visibleActiveBuckets.medias,
    ]
      .slice(0, 4)
      .map((entityId) => {
        const domain = entityId.split('.')[0];
        const state = haStates[entityId];
        const icon =
          domain === 'media_player' ? (
            <Speaker size={18} />
          ) : domain === 'switch' || domain === 'input_boolean' ? (
            <Tv size={18} />
          ) : (
            <Lightbulb size={18} />
          );
        const supportsToggle = ['light', 'switch', 'input_boolean', 'fan', 'media_player'].includes(domain);
        return {
          id: entityId,
          title: getEntityFriendlyName(entityId, state),
          domain,
          entityId,
          isOn: isEntityOn(entityId, state),
          icon,
          isLive: true,
          isToggleSupported: supportsToggle,
        } satisfies RoomQuickTile;
      });

    if (liveCandidates.length > 0) {
      return liveCandidates;
    }
    if (!isDemoSeedRoom) {
      return [];
    }

    return [
      {
        id: 'demo-light',
        title: rt('light'),
        domain: 'light',
        isOn: demoToggleById['demo-light'] ?? true,
        icon: <Lightbulb size={18} />,
        isLive: false,
        isToggleSupported: true,
      },
      {
        id: 'demo-stereo',
        title: rt('stereo'),
        domain: 'media_player',
        isOn: demoToggleById['demo-stereo'] ?? false,
        icon: <Speaker size={18} />,
        isLive: false,
        isToggleSupported: true,
      },
      {
        id: 'demo-tv',
        title: rt('television'),
        domain: 'switch',
        isOn: demoToggleById['demo-tv'] ?? false,
        icon: <Tv size={18} />,
        isLive: false,
        isToggleSupported: true,
      },
      {
        id: 'demo-monitoring',
        title: rt('monitoring'),
        domain: 'switch',
        isOn: demoToggleById['demo-monitoring'] ?? true,
        icon: <Video size={18} />,
        isLive: false,
        isToggleSupported: true,
      },
    ];
  }, [
    demoToggleById,
    haStates,
    isDemoSeedRoom,
    visibleActiveBuckets.lights,
    visibleActiveBuckets.medias,
    visibleActiveBuckets.switches,
    rt,
  ]);

  const mediaEntityIds = React.useMemo(
    () => {
      const ids = visibleActiveBuckets.medias.length > 0 ? visibleActiveBuckets.medias : isDemoSeedRoom ? ['media_player.living_room_tv'] : [];
      return [...ids].sort((left, right) => {
        const leftPlaying = isMediaEntityPlaying(haStates[left]);
        const rightPlaying = isMediaEntityPlaying(haStates[right]);
        if (leftPlaying === rightPlaying) {
          return 0;
        }
        return leftPlaying ? -1 : 1;
      });
    },
    [haStates, isDemoSeedRoom, visibleActiveBuckets.medias],
  );
  const primaryPlayingMediaEntityId = React.useMemo(
    () => mediaEntityIds.find((entityId) => isMediaEntityPlaying(haStates[entityId])) ?? '',
    [haStates, mediaEntityIds],
  );

  React.useEffect(() => {
    if (mediaEntityIds.length === 0) {
      setSelectedMediaEntityId('');
      return;
    }
    setSelectedMediaEntityId((current) => {
      if (primaryPlayingMediaEntityId && !isMediaEntityPlaying(haStates[current])) {
        return primaryPlayingMediaEntityId;
      }
      return current && mediaEntityIds.includes(current) ? current : mediaEntityIds[0];
    });
  }, [haStates, mediaEntityIds, primaryPlayingMediaEntityId]);

  const mediaEntityId = selectedMediaEntityId || mediaEntityIds[0] || null;
  const mediaEntity = mediaEntityId ? haStates[mediaEntityId] : undefined;
  const mediaTitle = mediaEntity?.mediaTitle ?? mediaEntity?.nowPlaying ?? (isDemoSeedRoom ? 'COFFIN (feat. Eminem)' : rt('mediaPlayer'));
  const mediaArtist = mediaEntity?.mediaArtist ?? (isDemoSeedRoom ? 'Jessie Reyez, Eminem' : rt('paused'));
  const mediaDuration = toNumber(mediaEntity?.mediaDuration) ?? (isDemoSeedRoom ? 212 : 1);
  const mediaPosition = toNumber(mediaEntity?.mediaPosition) ?? (isDemoSeedRoom ? 131 : 0);
  const mediaProgress = Math.min(1, Math.max(0, mediaDuration > 0 ? mediaPosition / mediaDuration : 0.4));
  const mediaIsPlaying = mediaEntity ? isEntityOn(mediaEntityId ?? '', mediaEntity) : isDemoSeedRoom;
  const isAnyMediaActive = React.useMemo(
    () =>
      isDemoSeedRoom ||
      mediaEntityIds.some((entityId) => isMediaEntityPlaying(haStates[entityId])),
    [haStates, isDemoSeedRoom, mediaEntityIds],
  );

  const energyReferenceValue = React.useMemo(() => {
    const sensorEntityId = visibleActiveBuckets.sensors.find((entityId) =>
      /energy|power|consum|watt|kw|kwh/i.test(entityId),
    );
    if (!sensorEntityId) {
      return undefined;
    }
    const entity = haStates[sensorEntityId];
    return toNumber(entity?.numericValue) ?? toNumber(entity?.state);
  }, [haStates, visibleActiveBuckets.sensors]);
  const hasEnergyCard = energyReferenceValue !== undefined || isDemoSeedRoom;
  const energyBars = React.useMemo(() => buildEnergyBars(energyReferenceValue), [energyReferenceValue]);
  const maxEnergyValue = React.useMemo(
    () => Math.max(...energyBars.map((entry) => entry.value), 1),
    [energyBars],
  );
  const highlightedEnergyIndex = Math.min(2, energyBars.length - 1);

  const callEntityToggle = async (tile: RoomQuickTile) => {
    if (!tile.isToggleSupported) {
      return;
    }
    if (!tile.isLive || !tile.entityId || !onCallService) {
      setDemoToggleById((current) => ({
        ...current,
        [tile.id]: !tile.isOn,
      }));
      return;
    }

    const domain = tile.domain;
    const entityId = tile.entityId;

    if (domain === 'media_player') {
      await onCallService('media_player', 'media_play_pause', { entity_id: entityId });
      return;
    }

    const nextService = tile.isOn ? 'turn_off' : 'turn_on';
    await onCallService(domain, nextService, { entity_id: entityId });
  };

  const handleMediaAction = async (service: 'media_previous_track' | 'media_play_pause' | 'media_next_track') => {
    if (!mediaEntityId || !onCallService) {
      return;
    }
    await onCallService('media_player', service, { entity_id: mediaEntityId });
  };

  const registryUpdatedLabel =
    registryLoadAt > 0
      ? rt('registryUpdated', { time: formatDate(registryLoadAt, { hour: '2-digit', minute: '2-digit' }) })
      : rt('registryWaiting');

  const roomAmbientSubtitle = React.useMemo(() => {
    const temperatureEntityId = activeRoomArea?.temperature_entity_id ?? null;
    const humidityEntityId = activeRoomArea?.humidity_entity_id ?? null;
    const temperatureValue = temperatureEntityId ? getEntityNumericValue(haStates[temperatureEntityId]) : undefined;
    const humidityValue = humidityEntityId ? getEntityNumericValue(haStates[humidityEntityId]) : undefined;
    const temperatureLabel = typeof temperatureValue === 'number' ? formatAmbientTemperature(temperatureValue) : null;
    const humidityLabel = typeof humidityValue === 'number' ? formatAmbientHumidity(humidityValue) : null;

    if (temperatureLabel && humidityLabel) {
      return rt('ambientBoth', { temperature: temperatureLabel, humidity: humidityLabel });
    }
    if (temperatureLabel) {
      return rt('ambientTemperature', { temperature: temperatureLabel });
    }
    if (humidityLabel) {
      return rt('ambientHumidity', { humidity: humidityLabel });
    }
    return rt('noSensor');
  }, [activeRoomArea, haStates, rt]);
  const resolveOptimisticEntityIsOn = React.useCallback(
    (entityId: string, entity?: MockEntityState) => {
      const optimisticState = optimisticRoomToggleByEntityId[entityId];
      if (optimisticState && optimisticState.expiresAt > Date.now()) {
        return optimisticState.isOn;
      }
      return isEntityOn(entityId, entity);
    },
    [optimisticRoomToggleByEntityId],
  );
  const resolveOptimisticRoomToggleState = React.useCallback(
    (entityId: string) => {
      const optimisticState = optimisticRoomToggleByEntityId[entityId];
      return optimisticState && optimisticState.expiresAt > Date.now() ? optimisticState : undefined;
    },
    [optimisticRoomToggleByEntityId],
  );
  const resolveRoomWidgetLiveEntity = React.useCallback(
    (widget: Widget): MockEntityState | undefined => {
      const liveEntity = haStates[widget.entityId];
      const optimisticState = resolveOptimisticRoomToggleState(widget.entityId);
      if (!optimisticState || (widget.kind !== 'light' && widget.kind !== 'switch')) {
        return liveEntity;
      }

      const nextState = optimisticState.isOn ? 'on' : 'off';
      const rawAttributes = { ...(liveEntity?.rawAttributes ?? {}) };
      if (widget.kind === 'light') {
        rawAttributes[LIGHT_TOGGLE_PENDING_ATTRIBUTE_KEY] = optimisticState.isOn;
        if (optimisticState.isOn) {
          const brightnessPct = optimisticState.brightnessPct ?? resolveLightBrightnessPercent(liveEntity);
          if (brightnessPct !== undefined) {
            rawAttributes.brightness = Math.round((Math.max(1, Math.min(100, brightnessPct)) / 100) * 255);
          }
        }
      } else {
        rawAttributes[SWITCH_TOGGLE_PENDING_ATTRIBUTE_KEY] = optimisticState.isOn;
      }

      return {
        ...(liveEntity ?? { state: nextState }),
        state: nextState,
        stateLabel: nextState,
        toggleOn: optimisticState.isOn,
        brightness:
          widget.kind === 'light'
            ? optimisticState.brightnessPct ?? resolveLightBrightnessPercent(liveEntity)
            : liveEntity?.brightness,
        rawAttributes,
      };
    },
    [haStates, resolveOptimisticRoomToggleState],
  );
  const lightRows = React.useMemo<RoomLightRow[]>(() => {
    const liveIds = [...visibleActiveBuckets.lights, ...visibleActiveBuckets.switches].slice(0, 4);
    if (liveIds.length > 0) {
      return liveIds.map((entityId) => {
        const state = haStates[entityId];
        const isOn = resolveOptimisticEntityIsOn(entityId, state);
        const brightnessPct = resolveLightBrightnessPercent(state);
        return {
          id: entityId,
          title: getEntityFriendlyName(entityId, state),
          domain: entityId.split('.')[0],
          entityId,
          isLive: true,
          isOn,
          brightnessPct,
        };
      });
    }
    if (!isDemoSeedRoom) {
      return [];
    }
    return quickTiles
      .filter((tile) => ['light', 'switch', 'input_boolean', 'fan'].includes(tile.domain))
      .slice(0, 4)
      .map((tile) => ({
        id: tile.id,
        title: tile.title,
        domain: tile.domain,
        entityId: tile.entityId,
        isLive: tile.isLive,
        isOn: tile.isOn,
        brightnessPct: tile.isOn ? 70 : 28,
      }));
  }, [haStates, isDemoSeedRoom, quickTiles, resolveOptimisticEntityIsOn, visibleActiveBuckets.lights, visibleActiveBuckets.switches]);
  const activeLightCount = React.useMemo(
    () =>
      visibleActiveBuckets.lights.length > 0
        ? visibleActiveBuckets.lights.reduce(
            (total, entityId) => total + (resolveOptimisticEntityIsOn(entityId, haStates[entityId]) ? 1 : 0),
            0,
          )
        : quickTiles.filter((tile) => tile.domain === 'light' && tile.isOn).length,
    [haStates, quickTiles, resolveOptimisticEntityIsOn, visibleActiveBuckets.lights],
  );
  const primaryLightPct = React.useMemo(() => {
    const firstLight = lightRows[0];
    if (firstLight?.brightnessPct !== undefined) {
      return firstLight.brightnessPct;
    }
    return undefined;
  }, [lightRows]);
  const sceneEntityIds = React.useMemo(
    () => visibleActiveBuckets.others.filter((entityId) => entityId.startsWith('scene.')).slice(0, 4),
    [visibleActiveBuckets.others],
  );
  const sceneOptions = React.useMemo(() => {
    if (sceneEntityIds.length > 0) {
      return sceneEntityIds.map((entityId) => {
        const state = haStates[entityId];
        return {
          id: entityId,
          label: getEntityFriendlyName(entityId, state),
          entityId,
          isLive: true,
        };
      });
    }
    if (!isDemoSeedRoom) {
      return [];
    }
    return ['Relax', 'Film', rt('sceneFocus'), rt('sceneAway')].map((label) => ({
      id: `demo-scene-${label.toLowerCase()}`,
      label,
      entityId: undefined,
      isLive: false,
    }));
  }, [haStates, isDemoSeedRoom, rt, sceneEntityIds]);
  const activeRoomKey = activeRoomTab?.id ?? 'default-room';
  const activeSceneName =
    sceneByRoomId[activeRoomKey] && sceneOptions.some((scene) => scene.label === sceneByRoomId[activeRoomKey])
      ? sceneByRoomId[activeRoomKey]
      : sceneOptions[0]?.label ?? '';
  const hasClimateCard = Boolean(climateEntityId) || isDemoSeedRoom;
  const hasLightsCard = lightRows.length > 0;
  const hasSecurityCard = doorTiles.length > 0;
  const hasMediaCard = Boolean(mediaEntityId) || isDemoSeedRoom;
  const hasScenesCard = sceneOptions.length > 0;
  const roomHasCards =
    hasClimateCard ||
    hasLightsCard ||
    hasSecurityCard ||
    hasMediaCard ||
    hasEnergyCard ||
    hasScenesCard;

  const accessoryCards = React.useMemo<RoomAccessoryCard[]>(() => {
    const entityIds = uniqueStrings([
      ...visibleActiveBuckets.covers,
      ...visibleActiveBuckets.weathers,
      ...visibleActiveBuckets.others.filter((entityId) => !entityId.startsWith('automation.') && !entityId.startsWith('script.')),
    ]);

    return entityIds.map((entityId) => {
      const domain = entityId.split('.')[0];
      const state = haStates[entityId];
      const isOn = isEntityOn(entityId, state);
      const icon =
        domain === 'cover' ? (
          <ChevronRight size={18} />
        ) : domain === 'scene' ? (
          <Play size={18} />
        ) : domain === 'weather' ? (
          <Leaf size={18} />
        ) : domain === 'camera' ? (
          <Video size={18} />
        ) : (
          <Layers size={18} />
        );

      return {
        id: entityId,
        title: getEntityFriendlyName(entityId, state),
        status: formatEntityStateLabel(entityId, state, rt) || rt('ready'),
        entityId,
        domain,
        icon,
        isOn,
      };
    });
  }, [haStates, rt, visibleActiveBuckets.covers, visibleActiveBuckets.others, visibleActiveBuckets.weathers]);
  const ambientSummaryParts = React.useMemo(() => {
    const parts: string[] = [];
    if (hasLightsCard) {
      parts.push(primaryLightPct !== undefined ? rt('lightPercentage', { value: primaryLightPct }) : rt('lightOn'));
    }
    if (hasClimateCard) {
      parts.push(rt('climateSummary', { value: Math.round(climateCurrentTemp) }));
    }
    if (activeSceneName) {
      parts.push(rt('sceneSummary', { name: activeSceneName }));
    }
    return parts;
  }, [activeSceneName, climateCurrentTemp, hasClimateCard, hasLightsCard, primaryLightPct, rt]);
  const setRoomScene = async (sceneLabel: string, entityId?: string) => {
    if (entityId && onCallService) {
      await onCallService('scene', 'turn_on', { entity_id: entityId });
    }
    setSceneByRoomId((current) => ({ ...current, [activeRoomKey]: sceneLabel }));
  };
  const toggleRoomLight = async (light: RoomLightRow) => {
    if (light.isLive && light.entityId && onCallService) {
      const nextService = light.isOn ? 'turn_off' : 'turn_on';
      await onCallService(light.domain, nextService, { entity_id: light.entityId });
      return;
    }
    setDemoToggleById((current) => ({
      ...current,
      [light.id]: !light.isOn,
    }));
  };

  const callHaApiForDashboard = React.useCallback(
    async <TResponse = unknown,>(
      message: Record<string, unknown>,
      options?: { reportError?: boolean },
    ): Promise<TResponse | null> => {
      if (!onCallApi) {
        return null;
      }
      return (await onCallApi(message, options)) as TResponse | null;
    },
    [onCallApi],
  );

  const { state: roomDashboardState } = useDashboardState({
    haStates,
    haStatus: haConnected ? 'connected' : 'disconnected',
    allowMockFallback: isDemoSeedRoom,
    weatherEntityId: weatherEntityId ?? undefined,
    weatherForecastType: 'hourly',
    haCallApi: callHaApiForDashboard,
  });
  const roomsGridBreakpoint = useGridEngineBreakpoint();
  const isSecurityAlert = React.useMemo(
    () =>
      doorTiles.some((tile) => !tile.isClosed) ||
      visibleActiveBuckets.covers.some((entityId) => isEntityOn(entityId, haStates[entityId])) ||
      visibleActiveBuckets.sensors.some((entityId) => isSecurityAlertEntity(entityId, haStates[entityId])),
    [doorTiles, haStates, visibleActiveBuckets.covers, visibleActiveBuckets.sensors],
  );
  const isMobileRoomsGrid =
    roomsGridBreakpoint === 'xs' || roomsGridBreakpoint === 'sm' || roomsGridBreakpoint === 'md';
  const useMediaBottomBar = roomsGridBreakpoint === 'xs' || roomsGridBreakpoint === 'sm';
  const showMediaBottomBar = useMediaBottomBar && mediaEntityIds.length > 0 && isAnyMediaActive;
  const isCompactClimateControls = roomsGridBreakpoint === 'xs' || roomsGridBreakpoint === 'sm';

  const buildClimateControlModel = React.useCallback((entityId: string | null) => {
    if (!entityId && !isDemoSeedRoom) {
      return null;
    }
    const resolvedEntityId = entityId ?? 'climate.air_conditioner';
    const entity = haStates[resolvedEntityId];
    const rawAttributes = entity?.rawAttributes ?? {};
    const currentTemp =
      toNumber(entity?.currentValue) ??
      toNumber(rawAttributes.current_temperature) ??
      24;
    const targetTemp =
      toNumber(entity?.targetValue) ??
      toNumber(rawAttributes.temperature) ??
      22;
    const mode = `${entity?.hvacMode ?? rawAttributes.hvac_mode ?? entity?.state ?? 'auto'}`
      .trim()
      .toLowerCase();
    const hvacModesFromEntity = toStringArray(entity?.hvacModes);
    const hvacModesFromAttributes = toStringArray(rawAttributes.hvac_modes);
    const fanModesFromEntity = toStringArray(entity?.fanModes);
    const fanModesFromAttributes = toStringArray(rawAttributes.fan_modes);
    const presetModeFromEntity =
      typeof (entity as { presetMode?: unknown } | undefined)?.presetMode === 'string'
        ? (entity as { presetMode?: string }).presetMode
        : undefined;
    const presetModesFromEntity = toStringArray((entity as { presetModes?: unknown } | undefined)?.presetModes);
    const presetModesFromAttributes = toStringArray(rawAttributes.preset_modes);
    const temperatureUnit =
      typeof rawAttributes.temperature_unit === 'string'
        ? rawAttributes.temperature_unit
        : entity?.unit;

    return {
      name: resolvedEntityId ? getEntityFriendlyName(resolvedEntityId, entity) : rt('roomClimate'),
      mode,
      isOn: !['off', 'unavailable', 'unknown'].includes(mode),
      status:
        typeof entity?.stateLabel === 'string'
          ? entity.stateLabel
          : mode === 'off'
            ? rt('stateOffMasculine')
            : rt('climateActive'),
      currentTemp,
      targetTemp,
      minTemp: toNumber(entity?.minTemp) ?? toNumber(rawAttributes.min_temp) ?? 16,
      maxTemp: toNumber(entity?.maxTemp) ?? toNumber(rawAttributes.max_temp) ?? 30,
      targetTempLow: toNumber(entity?.targetTempLow) ?? toNumber(rawAttributes.target_temp_low),
      targetTempHigh: toNumber(entity?.targetTempHigh) ?? toNumber(rawAttributes.target_temp_high),
      targetTempStep: toNumber(entity?.targetTempStep) ?? toNumber(rawAttributes.target_temp_step) ?? 0.5,
      hvacModes:
        hvacModesFromEntity.length > 0
          ? hvacModesFromEntity
          : hvacModesFromAttributes.length > 0
            ? hvacModesFromAttributes
            : isDemoSeedRoom
              ? ['heat', 'cool', 'auto', 'off']
              : undefined,
      hvacAction:
        typeof entity?.hvacAction === 'string'
          ? entity.hvacAction
          : typeof rawAttributes.hvac_action === 'string'
            ? rawAttributes.hvac_action
            : undefined,
      fanMode:
        typeof entity?.fanMode === 'string'
          ? entity.fanMode
          : typeof rawAttributes.fan_mode === 'string'
            ? rawAttributes.fan_mode
            : undefined,
      fanModes:
        fanModesFromEntity.length > 0
          ? fanModesFromEntity
          : fanModesFromAttributes.length > 0
            ? fanModesFromAttributes
            : undefined,
      presetMode:
        presetModeFromEntity ?? (typeof rawAttributes.preset_mode === 'string' ? rawAttributes.preset_mode : undefined),
      presetModes:
        presetModesFromEntity.length > 0
          ? presetModesFromEntity
          : presetModesFromAttributes.length > 0
            ? presetModesFromAttributes
            : undefined,
      temperatureUnit,
      rawAttributes,
    };
  }, [haStates, isDemoSeedRoom, rt]);
  const climateControlModel = React.useMemo(
    () => buildClimateControlModel(climateEntityId),
    [buildClimateControlModel, climateEntityId],
  );
  const climatePanelModels = React.useMemo(
    () =>
      (climateEntityIds.length > 0 ? climateEntityIds : isDemoSeedRoom ? ['climate.air_conditioner'] : [])
        .map((entityId) => {
          const model = buildClimateControlModel(entityId);
          return model ? { entityId, model } : null;
        })
        .filter((entry): entry is { entityId: string; model: NonNullable<ReturnType<typeof buildClimateControlModel>> } => Boolean(entry)),
    [buildClimateControlModel, climateEntityIds, isDemoSeedRoom],
  );
  const mobileClimateWidgets = React.useMemo<Widget[]>(() => {
    if (!climateControlModel) {
      return [];
    }
    const entityIds = climateEntityIds.length > 0 ? climateEntityIds : [climateEntityId ?? 'climate.air_conditioner'];
    return entityIds.map((entityId) => {
      const entity = haStates[entityId];
      const widget = buildRoomWidget(entityId, 'climate', entity, {
        i: `rooms-mobile-climate-${entityId}`,
        x: 0,
        y: 0,
        w: 2,
        h: 3,
      });
      const isSelectedClimate = entityId === climateEntityId;
      return {
        ...widget,
        title: isSelectedClimate ? climateControlModel.name : getEntityFriendlyName(entityId, entity),
        status: isSelectedClimate ? (climateControlModel.status ?? widget.status) : widget.status,
        isOn: isSelectedClimate ? climateControlModel.isOn : widget.isOn,
        value: isSelectedClimate ? climateControlModel.targetTemp : widget.value,
        unit: isSelectedClimate ? (climateControlModel.temperatureUnit ?? widget.unit) : widget.unit,
      };
    });
  }, [climateControlModel, climateEntityId, climateEntityIds, haStates]);
  const climateSwiperEntityIds = React.useMemo(
    () =>
      isCompactClimateControls
        ? mobileClimateWidgets.map((widget) => widget.entityId)
        : climatePanelModels.map((entry) => entry.entityId),
    [climatePanelModels, isCompactClimateControls, mobileClimateWidgets],
  );
  const selectedMobileClimateIndex = Math.max(
    0,
    climateSwiperEntityIds.findIndex((entityId) => entityId === climateEntityId),
  );
  const scrollToMobileClimateSlide = React.useCallback(
    (index: number) => {
      const scroller = mobileClimateSwiperRef.current;
      if (!scroller) {
        return;
      }
      scrollRoomSwiperToSlide(scroller, index, Boolean(prefersReducedMotion));
    },
    [prefersReducedMotion],
  );
  const handleMobileClimateScroll = React.useCallback(() => {
    const scroller = mobileClimateSwiperRef.current;
    if (!scroller || scroller.clientWidth <= 0 || climateSwiperEntityIds.length <= 1) {
      return;
    }
    const index = Math.max(
      0,
      Math.min(climateSwiperEntityIds.length - 1, Math.round(scroller.scrollLeft / scroller.clientWidth)),
    );
    const nextEntityId = climateSwiperEntityIds[index];
    if (nextEntityId && nextEntityId !== climateEntityId) {
      setSelectedClimateEntityId(nextEntityId);
    }
  }, [climateEntityId, climateSwiperEntityIds]);

  React.useEffect(() => {
    if (climateSwiperEntityIds.length <= 1) {
      return;
    }
    scrollToMobileClimateSlide(selectedMobileClimateIndex);
  }, [climateSwiperEntityIds.length, scrollToMobileClimateSlide, selectedMobileClimateIndex]);
  const roomStatusChips = React.useMemo<RoomStatusChip[]>(() => {
    const chips: RoomStatusChip[] = [];

    if (climateControlModel?.isOn) {
      chips.push({
        id: 'climate',
        label: 'Clima',
        status: formatAmbientTemperature(climateControlModel.currentTemp),
        icon: <Thermometer size={14} className="text-[#FF9F0A]" />,
        className: '',
      });
    }

    if (isAnyMediaActive) {
      chips.push({
        id: 'media',
        label: 'Media',
        status: 'In riproduzione',
        icon: <Music2 size={14} className="text-[#0A84FF]" />,
        className: '',
      });
    }

    if (activeLightCount > 0) {
      chips.push({
        id: 'lights',
        label: 'Luci',
        status: activeLightCount === 1 ? '1 accesa' : `${activeLightCount} accese`,
        icon: <Lightbulb size={14} className="text-[#FFD60A]" />,
        className: '',
      });
    }

    return chips;
  }, [activeLightCount, climateControlModel?.currentTemp, climateControlModel?.isOn, isAnyMediaActive]);

  const buildWidgetsForEntities = React.useCallback(
    (entityIds: string[], layout: Widget['layout']): Widget[] =>
      entityIds.flatMap((entityId) => {
        const kind = resolveWidgetKindFromEntityId(entityId);
        if (!kind) {
          return [];
        }
        return [buildRoomWidget(entityId, kind, haStates[entityId], { ...layout, i: entityId })];
      }),
    [haStates],
  );

  const demoWidgets = React.useMemo(() => {
    if (!isDemoSeedRoom) {
      return {
        climate: [],
        lights: [],
        switches: [],
        sensors: [],
        security: [],
        media: [],
        covers: [],
      };
    }
    return {
      climate: [
        buildRoomWidget('climate.air_conditioner', 'climate', haStates['climate.air_conditioner'], {
          i: 'climate.air_conditioner',
          x: 0,
          y: 0,
          w: 4,
          h: 3,
        }),
      ],
      lights: [
        buildRoomWidget('light.living_room_lamp', 'light', haStates['light.living_room_lamp'], {
          i: 'light.living_room_lamp',
          x: 0,
          y: 0,
          w: 2,
          h: 2,
        }),
      ],
      switches: [
        buildRoomWidget('switch.smart_plug', 'switch', haStates['switch.smart_plug'], {
          i: 'switch.smart_plug',
          x: 0,
          y: 0,
          w: 2,
          h: 1,
        }),
      ],
      sensors: [
        buildRoomWidget('sensor.living_room_humidity', 'sensor', haStates['sensor.living_room_humidity'], {
          i: 'sensor.living_room_humidity',
          x: 0,
          y: 0,
          w: 2,
          h: 2,
        }),
      ],
      security: [
        buildRoomWidget('lock.front_door', 'lock', haStates['lock.front_door'], {
          i: 'lock.front_door',
          x: 0,
          y: 0,
          w: 2,
          h: 2,
        }),
      ],
      media: [
        buildRoomWidget('media_player.living_room_tv', 'media', haStates['media_player.living_room_tv'], {
          i: 'media_player.living_room_tv',
          x: 0,
          y: 0,
          w: 4,
          h: 2,
        }),
      ],
      covers: [],
    };
  }, [haStates, isDemoSeedRoom]);

  const applyOptimisticRoomWidgetState = React.useCallback(
    (widget: Widget) => {
      if (widget.kind !== 'light' && widget.kind !== 'switch') {
        return widget;
      }
      const optimisticState = resolveOptimisticRoomToggleState(widget.entityId);
      if (!optimisticState) {
        return widget;
      }
      const nextIsOn = optimisticState.isOn;
      const nextValue =
        widget.kind === 'light'
          ? nextIsOn
            ? optimisticState.brightnessPct ?? resolveLightBrightnessPercent(haStates[widget.entityId])
            : widget.value
          : widget.value;
      return {
        ...widget,
        isOn: nextIsOn,
        status: nextIsOn ? (widget.kind === 'light' ? 'Accesa' : 'Acceso') : 'Spento',
        value: nextValue,
      };
    },
    [haStates, resolveOptimisticRoomToggleState],
  );

  const roomWidgetClusters = React.useMemo<RoomWidgetCluster[]>(() => {
    const clusters: RoomWidgetCluster[] = [];
    const lightWidgets =
      visibleActiveBuckets.lights.length > 0
        ? buildWidgetsForEntities(visibleActiveBuckets.lights, { i: 'lights', x: 0, y: 0, w: 2, h: 2 })
        : demoWidgets.lights.map(applyOptimisticRoomWidgetState);
    const switchWidgets =
      visibleActiveBuckets.switches.length > 0
        ? visibleActiveBuckets.switches.map((entityId) =>
            buildRoomWidget(entityId, 'switch', haStates[entityId], {
              i: entityId,
              x: 0,
              y: 0,
              w: 2,
              h: 1,
            }),
          )
        : demoWidgets.switches.map(applyOptimisticRoomWidgetState);
    const resolvedLightWidgets = lightWidgets.map(applyOptimisticRoomWidgetState);
    const resolvedSwitchWidgets = switchWidgets.map(applyOptimisticRoomWidgetState);
    const sensorWidgets =
      visibleActiveBuckets.sensors.length > 0
        ? buildWidgetsForEntities(visibleActiveBuckets.sensors, { i: 'sensors', x: 0, y: 0, w: 2, h: 2 })
        : demoWidgets.sensors;
    const securityWidgets =
      visibleActiveBuckets.locks.length > 0 || visibleActiveBuckets.cameras.length > 0
        ? buildWidgetsForEntities([...visibleActiveBuckets.locks, ...visibleActiveBuckets.cameras], {
            i: 'security',
            x: 0,
            y: 0,
            w: 2,
            h: 2,
          })
        : demoWidgets.security;
    if (resolvedLightWidgets.length > 0) clusters.push({ id: 'lights', label: rt('lights'), widgets: resolvedLightWidgets });
    if (resolvedSwitchWidgets.length > 0) clusters.push({ id: 'switches', label: rt('switches'), widgets: resolvedSwitchWidgets });
    if (sensorWidgets.length > 0) clusters.push({ id: 'sensors', label: rt('sensors'), widgets: sensorWidgets });
    if (securityWidgets.length > 0) clusters.push({ id: 'security', label: rt('security'), widgets: securityWidgets });
    return clusters;
  }, [
    applyOptimisticRoomWidgetState,
    buildWidgetsForEntities,
    demoWidgets,
    haStates,
    visibleActiveBuckets.cameras,
    visibleActiveBuckets.lights,
    visibleActiveBuckets.locks,
    visibleActiveBuckets.sensors,
    visibleActiveBuckets.switches,
    rt,
  ]);

  const mediaRoomWidget = React.useMemo<Widget | null>(() => {
    const widgets = mediaEntityId
      ? buildWidgetsForEntities([mediaEntityId], { i: 'media', x: 0, y: 0, w: 4, h: 3 })
      : demoWidgets.media;
    return widgets[0] ?? null;
  }, [buildWidgetsForEntities, demoWidgets.media, mediaEntityId]);
  const mediaRoomWidgets = React.useMemo<Widget[]>(() => {
    const entityIds = mediaEntityIds.length > 0 ? mediaEntityIds : mediaEntityId ? [mediaEntityId] : [];
    const widgets = entityIds.length > 0
      ? buildWidgetsForEntities(entityIds, { i: 'media', x: 0, y: 0, w: 4, h: 3 })
      : demoWidgets.media;
    return widgets.map((widget) => ({
      ...widget,
      layout: {
        ...widget.layout,
        w: 4,
        h: 3,
      },
    }));
  }, [buildWidgetsForEntities, demoWidgets.media, mediaEntityId, mediaEntityIds]);
  const selectedMediaSlideIndex = Math.max(
    0,
    mediaRoomWidgets.findIndex((widget) => widget.entityId === mediaEntityId),
  );
  const scrollToMediaSlide = React.useCallback(
    (index: number) => {
      const scroller = mediaSwiperRef.current;
      if (!scroller) {
        return;
      }
      scrollRoomSwiperToSlide(scroller, index, Boolean(prefersReducedMotion));
    },
    [prefersReducedMotion],
  );
  const handleMediaSwiperScroll = React.useCallback(() => {
    const scroller = mediaSwiperRef.current;
    if (!scroller || scroller.clientWidth <= 0 || mediaRoomWidgets.length <= 1) {
      return;
    }
    const index = Math.max(
      0,
      Math.min(mediaRoomWidgets.length - 1, Math.round(scroller.scrollLeft / scroller.clientWidth)),
    );
    const nextEntityId = mediaRoomWidgets[index]?.entityId;
    if (nextEntityId && nextEntityId !== mediaEntityId) {
      setSelectedMediaEntityId(nextEntityId);
    }
  }, [mediaEntityId, mediaRoomWidgets]);

  React.useEffect(() => {
    if (mediaRoomWidgets.length <= 1 || showMediaBottomBar) {
      return;
    }
    scrollToMediaSlide(selectedMediaSlideIndex);
  }, [mediaRoomWidgets.length, scrollToMediaSlide, selectedMediaSlideIndex, showMediaBottomBar]);

  const sceneKeys = React.useMemo<SceneKey[]>(() => ['music', 'movie', 'night', 'morning'], []);
  const roomSceneEntityByKey = React.useMemo(() => {
    const result: Partial<Record<SceneKey, string>> = {};
    sceneEntityIds.slice(0, sceneKeys.length).forEach((entityId, index) => {
      result[sceneKeys[index]] = entityId;
    });
    return result;
  }, [sceneEntityIds, sceneKeys]);
  const roomSceneSection = React.useMemo<DashboardSection | null>(() => {
    if (sceneEntityIds.length === 0 && !isDemoSeedRoom) {
      return null;
    }
    const scenes = sceneEntityIds.length > 0 ? sceneKeys.slice(0, sceneEntityIds.length) : sceneKeys.slice(0, 4);
    const sceneLabels = scenes.reduce<NonNullable<DashboardSection['sceneLabels']>>((acc, sceneKey) => {
      const entityId = roomSceneEntityByKey[sceneKey];
      if (entityId) {
        acc[sceneKey] = getEntityFriendlyName(entityId, haStates[entityId]);
      }
      return acc;
    }, {});
    return {
      id: 'rooms-scenes',
      kind: 'scenes',
      title: 'Scene',
      scenes,
      sceneLabels,
      layout: { i: 'rooms-scenes', x: 0, y: 0, w: 4, h: 2 },
    };
  }, [haStates, isDemoSeedRoom, roomSceneEntityByKey, sceneEntityIds.length, sceneKeys]);
  const weatherSection = React.useMemo<DashboardSection>(
    () => ({
      id: 'rooms-weather',
      kind: 'weather',
      layout: { i: 'rooms-weather', x: 0, y: 0, w: 4, h: 2 },
      weatherLayout: 'card',
      weatherForecastType: 'hourly',
      weatherForecastDays: 5,
      weatherForecastDensity: 'compact',
      weatherSecondaryInfo: 'wind',
    }),
    [],
  );
  const hasWeatherCard = Boolean(weatherEntityId) || isDemoSeedRoom;

  const buildSectionDeviceTargets = React.useCallback(
    (entityIds: string[]): RoomSectionDeviceTarget[] => {
      type TargetDraft = {
        id: string;
        kind: 'device' | 'entity';
        deviceId?: string;
        entityIds: string[];
        domains: Set<string>;
      };

      const drafts = new Map<string, TargetDraft>();
      uniqueStrings(entityIds).forEach((entityId) => {
        const registryEntity = registryEntityByEntityId.get(entityId);
        const deviceId = registryEntity?.deviceId ?? null;
        const key = deviceId ? `device:${deviceId}` : `entity:${entityId}`;
        const draft =
          drafts.get(key) ??
          {
            id: key,
            kind: deviceId ? 'device' : 'entity',
            deviceId: deviceId ?? undefined,
            entityIds: [],
            domains: new Set<string>(),
          };
        draft.entityIds.push(entityId);
        draft.domains.add(entityId.split('.')[0]);
        drafts.set(key, draft);
      });

      return Array.from(drafts.values())
        .map((draft) => {
          const firstEntityId =
            draft.entityIds.find((entityId) => !hiddenActiveRoomEntityIds.has(entityId)) ?? draft.entityIds[0];
          const firstEntity = haStates[firstEntityId];
          const registryEntity = registryEntityByEntityId.get(firstEntityId);
          const registryDevice = draft.deviceId ? registryDeviceById.get(draft.deviceId) : undefined;
          const domains = Array.from(draft.domains).sort();
          const entities = draft.entityIds
            .map((entityId) => {
              const domain = entityId.split('.')[0];
              const state = haStates[entityId];
              return {
                entityId,
                name: getEntityFriendlyName(entityId, state),
                domain,
                status: formatEntityStateLabel(entityId, state, rt),
                isVisible: !hiddenActiveRoomEntityIds.has(entityId),
              } satisfies RoomSectionDeviceEntityTarget;
            })
            .sort((left, right) => left.name.localeCompare(right.name));
          const entityLabel = getEntityFriendlyName(firstEntityId, firstEntity);
          const deviceLabel = registryDevice?.name?.trim();
          const name = draft.entityIds.length > 1 && draft.kind === 'device' && deviceLabel ? deviceLabel : entityLabel;
          const deviceName =
            draft.kind === 'device' && deviceLabel
              ? deviceLabel
              : registryEntity?.originalName?.trim() || registryEntity?.name?.trim() || firstEntityId;
          const domainLabel = domains.map((domain) => formatDomainLabel(domain, rt)).join(' / ');
          const subtitle =
            draft.entityIds.length > 1
              ? rt('entityCount', { count: draft.entityIds.length, domain: domainLabel })
              : domainLabel;
          const areaId =
            registryEntity?.areaId ??
            (draft.deviceId ? registryDeviceById.get(draft.deviceId)?.areaId ?? null : null) ??
            entityAreaByEntityId[firstEntityId] ??
            null;
          return {
            id: draft.id,
            kind: draft.kind,
            deviceId: draft.deviceId,
            entityIds: draft.entityIds,
            entities,
            name,
            deviceName,
            subtitle,
            areaId,
            domains,
          } satisfies RoomSectionDeviceTarget;
        })
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    [entityAreaByEntityId, haStates, hiddenActiveRoomEntityIds, registryDeviceById, registryEntityByEntityId, rt],
  );

  const startEditRoomSection = React.useCallback(
    (target: RoomSectionEditTarget) => {
      if (!canOpenActiveHaRoomSection) {
        return;
      }
      setEditingRoomSection({
        ...target,
        entityIds: uniqueStrings(target.entityIds),
      });
      setSelectedSectionTargetIds({});
      setSelectedSectionAddTargetIds({});
      setIsSectionTargetSelectionMode(false);
      setSectionDeviceSheetMode(null);
      setSectionDeviceSearch('');
      setSectionMoveTargetAreaId('');
      setSectionActionError(null);
    },
    [canOpenActiveHaRoomSection],
  );

  const sectionEditTargets = React.useMemo(
    () => (editingRoomSection ? buildSectionDeviceTargets(editingRoomSection.entityIds) : []),
    [buildSectionDeviceTargets, editingRoomSection],
  );
  const selectedSectionTargets = React.useMemo(
    () => sectionEditTargets.filter((target) => selectedSectionTargetIds[target.id]),
    [sectionEditTargets, selectedSectionTargetIds],
  );
  const sectionAddCandidates = React.useMemo(() => {
    if (!editingRoomSection || activeRoomTab?.source !== 'ha') {
      return [];
    }
    const candidateEntityIds = registryEntityEntries
      .filter((entry) => {
        if (!Object.prototype.hasOwnProperty.call(haStates, entry.entityId)) {
          return false;
        }
        if (!doesEntityMatchRoomSection(entry.entityId, editingRoomSection.id)) {
          return false;
        }
        const effectiveAreaId = entityAreaByEntityId[entry.entityId] ?? null;
        return effectiveAreaId !== activeRoomTab.id;
      })
      .map((entry) => entry.entityId);
    return buildSectionDeviceTargets(candidateEntityIds).filter((target) => target.areaId !== activeRoomTab.id);
  }, [
    activeRoomTab,
    buildSectionDeviceTargets,
    editingRoomSection,
    entityAreaByEntityId,
    haStates,
    registryEntityEntries,
  ]);
  const visibleSectionAddCandidates = React.useMemo(() => {
    const query = sectionDeviceSearch.trim().toLowerCase();
    if (!query) {
      return sectionAddCandidates;
    }
    return sectionAddCandidates.filter((target) => {
      const haystack = [
        target.name,
        target.deviceName,
        target.subtitle,
        target.entityIds.join(' '),
        target.areaId ? areaById.get(target.areaId)?.name ?? '' : rt('unassignedRoom'),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [areaById, rt, sectionAddCandidates, sectionDeviceSearch]);
  const selectedSectionAddTargets = React.useMemo(
    () => sectionAddCandidates.filter((target) => selectedSectionAddTargetIds[target.id]),
    [sectionAddCandidates, selectedSectionAddTargetIds],
  );

  const applyRegistrySnapshotState = React.useCallback((snapshot: RegistrySnapshot) => {
    setEntityAreaByEntityId(snapshot.entityAreaByEntityId);
    setRegistryEntityEntries(snapshot.registryEntities);
    setRegistryDeviceEntries(snapshot.registryDevices);
    setRegistryLoadAt(Date.now());
  }, []);

  const refreshRegistrySnapshot = React.useCallback(async () => {
    if (!onCallApi) {
      return;
    }
    const snapshot = await fetchRegistrySnapshot(onCallApi);
    applyRegistrySnapshotState(snapshot);
  }, [applyRegistrySnapshotState, onCallApi]);

  const applyOptimisticRegistryAreaUpdate = React.useCallback(
    (targets: RoomSectionDeviceTarget[], nextAreaId: string | null) => {
      const targetDeviceIds = new Set(targets.flatMap((target) => (target.deviceId ? [target.deviceId] : [])));
      const directlyUpdatedEntityIds = new Set(targets.flatMap((target) => target.entityIds));
      const affectedEntityIds = new Set<string>();

      targets.forEach((target) => {
        if (target.kind === 'device' && target.deviceId) {
          registryEntityEntries.forEach((entry) => {
            if (entry.deviceId === target.deviceId && (!entry.areaId || target.entityIds.includes(entry.entityId))) {
              affectedEntityIds.add(entry.entityId);
            }
          });
          return;
        }
        target.entityIds.forEach((entityId) => affectedEntityIds.add(entityId));
      });

      setRegistryDeviceEntries((current) =>
        current.map((device) => (targetDeviceIds.has(device.id) ? { ...device, areaId: nextAreaId } : device)),
      );
      setRegistryEntityEntries((current) =>
        current.map((entry) =>
          directlyUpdatedEntityIds.has(entry.entityId) ? { ...entry, areaId: nextAreaId } : entry,
        ),
      );
      setEntityAreaByEntityId((current) => {
        const next = { ...current };
        affectedEntityIds.forEach((entityId) => {
          if (nextAreaId) {
            next[entityId] = nextAreaId;
            return;
          }
          delete next[entityId];
        });
        return next;
      });
      setRegistryLoadAt(Date.now());
    },
    [registryEntityEntries],
  );

  const assignSectionTargetsToArea = React.useCallback(
    async (targets: RoomSectionDeviceTarget[], nextAreaId: string | null) => {
      if (!canManageRooms || !onCallApi || targets.length === 0) {
        return false;
      }
      setSectionActionBusy(true);
      setSectionActionError(null);
      const normalizedAreaId = nextAreaId && nextAreaId.trim().length > 0 ? nextAreaId : null;
      try {
        for (const target of targets) {
          if (target.kind === 'device' && target.deviceId) {
            const deviceResult = await onCallApi({
              type: 'config/device_registry/update',
              device_id: target.deviceId,
              area_id: normalizedAreaId,
            });
            if (deviceResult === null) {
              throw new Error('device update failed');
            }

            const directEntityIds = target.entityIds.filter((entityId) => registryEntityByEntityId.get(entityId)?.areaId);
            for (const entityId of directEntityIds) {
              const entityResult = await onCallApi({
                type: 'config/entity_registry/update',
                entity_id: entityId,
                area_id: normalizedAreaId,
              });
              if (entityResult === null) {
                throw new Error('entity update failed');
              }
            }
            continue;
          }

          for (const entityId of target.entityIds) {
            const entityResult = await onCallApi({
              type: 'config/entity_registry/update',
              entity_id: entityId,
              area_id: normalizedAreaId,
            });
            if (entityResult === null) {
              throw new Error('entity update failed');
            }
          }
        }

        applyOptimisticRegistryAreaUpdate(targets, normalizedAreaId);
        const movedEntityIds = new Set(targets.flatMap((target) => target.entityIds));
        if (normalizedAreaId === activeRoomTab?.id) {
          setHiddenRoomEntitiesByRoom((current) => {
            const currentHiddenIds = current[activeRoomTab.id] ?? [];
            const nextHiddenIds = currentHiddenIds.filter((entityId) => !movedEntityIds.has(entityId));
            if (nextHiddenIds.length === currentHiddenIds.length) {
              return current;
            }
            const next = { ...current };
            if (nextHiddenIds.length > 0) {
              next[activeRoomTab.id] = nextHiddenIds;
            } else {
              delete next[activeRoomTab.id];
            }
            return next;
          });
        }
        setEditingRoomSection((current) => {
          if (!current || activeRoomTab?.source !== 'ha') {
            return current;
          }
          const nextEntityIds =
            normalizedAreaId === activeRoomTab.id
              ? uniqueStrings([...current.entityIds, ...Array.from(movedEntityIds)])
              : current.entityIds.filter((entityId) => !movedEntityIds.has(entityId));
          return { ...current, entityIds: nextEntityIds };
        });
        setSelectedSectionTargetIds({});
        setSelectedSectionAddTargetIds({});
        setIsSectionTargetSelectionMode(false);
        void refreshRegistrySnapshot().catch(() => undefined);
        return true;
      } catch {
        setSectionActionError(rt('devicesUpdateFailed'));
        return false;
      } finally {
        setSectionActionBusy(false);
      }
    },
    [
      activeRoomTab,
      applyOptimisticRegistryAreaUpdate,
      canManageRooms,
      onCallApi,
      refreshRegistrySnapshot,
      registryEntityByEntityId,
    ],
  );

  const toggleRoomEntityVisibility = React.useCallback((entityId: string) => {
    if (!canManageRooms || !activeRoomTab || activeRoomTab.source !== 'ha') {
      return;
    }
    const roomId = activeRoomTab.id;
    setHiddenRoomEntitiesByRoom((current) => {
      const currentHiddenIds = current[roomId] ?? [];
      const isHidden = currentHiddenIds.includes(entityId);
      const nextHiddenIds = isHidden
        ? currentHiddenIds.filter((hiddenEntityId) => hiddenEntityId !== entityId)
        : uniqueStrings([...currentHiddenIds, entityId]);
      const next = { ...current };
      if (nextHiddenIds.length > 0) {
        next[roomId] = nextHiddenIds;
      } else {
        delete next[roomId];
      }
      return next;
    });
    setSectionActionError(null);
  }, [activeRoomTab, canManageRooms]);

  const clearSectionTargetLongPress = React.useCallback(() => {
    const longPress = sectionTargetLongPressRef.current;
    if (!longPress) {
      return;
    }
    window.clearTimeout(longPress.timerId);
    sectionTargetLongPressRef.current = null;
  }, []);

  const enterSectionActionMode = React.useCallback(() => {
    if (!canEditActiveHaRoom) {
      return;
    }
    setIsSectionInteractionGuideOpen(false);
    setIsSectionTargetSelectionMode(true);
    setSectionActionError(null);
  }, [canEditActiveHaRoom]);

  const startSectionTargetSelection = React.useCallback((targetId: string) => {
    if (!canEditActiveHaRoom) {
      return;
    }
    enterSectionActionMode();
    setSelectedSectionTargetIds((current) => (current[targetId] ? current : { ...current, [targetId]: true }));
  }, [canEditActiveHaRoom, enterSectionActionMode]);

  const cancelSectionTargetSelection = React.useCallback(() => {
    clearSectionTargetLongPress();
    setIsSectionTargetSelectionMode(false);
    setSelectedSectionTargetIds({});
    setSectionActionError(null);
  }, [clearSectionTargetLongPress]);

  const toggleSectionTargetSelection = React.useCallback((targetId: string) => {
    if (!canManageRooms) {
      return;
    }
    setSelectedSectionTargetIds((current) => {
      const next = { ...current };
      if (next[targetId]) {
        delete next[targetId];
      } else {
        next[targetId] = true;
      }
      return next;
    });
    setSectionActionError(null);
  }, [canManageRooms]);

  const toggleSectionAddTargetSelection = React.useCallback((targetId: string) => {
    if (!canManageRooms) {
      return;
    }
    setSelectedSectionAddTargetIds((current) => {
      const next = { ...current };
      if (next[targetId]) {
        delete next[targetId];
      } else {
        next[targetId] = true;
      }
      return next;
    });
    setSectionActionError(null);
  }, [canManageRooms]);

  const beginSectionTargetLongPress = React.useCallback(
    (targetId: string, event: React.PointerEvent<HTMLDivElement>) => {
      if (!canEditActiveHaRoom) {
        return;
      }
      const targetElement = event.target as HTMLElement | null;
      const quickControl = targetElement?.closest('button, input, [data-quick-control="true"]') as HTMLElement | null;
      if (quickControl && quickControl.dataset.quickSlider !== 'true') {
        return;
      }
      clearSectionTargetLongPress();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const timerId = window.setTimeout(() => {
        sectionTargetLongPressRef.current = null;
        suppressNextSectionTargetClickRef.current = targetId;
        startSectionTargetSelection(targetId);
        window.setTimeout(() => {
          if (suppressNextSectionTargetClickRef.current === targetId) {
            suppressNextSectionTargetClickRef.current = null;
          }
        }, 500);
      }, ROOM_SECTION_TARGET_LONG_PRESS_MS);
      sectionTargetLongPressRef.current = { timerId, pointerId, targetId, startX, startY };
    },
    [canEditActiveHaRoom, clearSectionTargetLongPress, startSectionTargetSelection],
  );

  const beginSectionActionLongPress = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!canEditActiveHaRoom) {
        return;
      }
      const targetElement = event.target as HTMLElement | null;
      const quickControl = targetElement?.closest('button, input, [data-quick-control="true"]') as HTMLElement | null;
      if (quickControl && quickControl.dataset.quickSlider !== 'true') {
        return;
      }
      clearSectionTargetLongPress();
      const timerId = window.setTimeout(() => {
        sectionTargetLongPressRef.current = null;
        enterSectionActionMode();
      }, ROOM_SECTION_TARGET_LONG_PRESS_MS);
      sectionTargetLongPressRef.current = {
        timerId,
        pointerId: event.pointerId,
        targetId: '',
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [canEditActiveHaRoom, clearSectionTargetLongPress, enterSectionActionMode],
  );

  const updateSectionTargetLongPress = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const longPress = sectionTargetLongPressRef.current;
    if (!longPress || longPress.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - longPress.startX;
    const deltaY = event.clientY - longPress.startY;
    if (Math.hypot(deltaX, deltaY) > ROOM_SECTION_TARGET_LONG_PRESS_CANCEL_PX) {
      window.clearTimeout(longPress.timerId);
      sectionTargetLongPressRef.current = null;
    }
  }, []);

  React.useEffect(() => () => clearSectionTargetLongPress(), [clearSectionTargetLongPress]);

  const renderRoomWidget = (widget: Widget) => (
    <WidgetCardRenderer
      key={widget.id}
      widget={widget}
      dashboardState={roomDashboardState}
      isEditMode={false}
      isSelected={false}
      gridBreakpoint={roomsGridBreakpoint}
      value={
        widget.kind === 'sensor'
          ? resolveRoomWidgetLiveEntity(widget)?.numericValue
          : widget.value
      }
      onClick={() => {
        const domain = widget.entityId.split('.')[0];
        if (domain === 'camera') {
          setActiveCameraViewerEntityId(widget.entityId);
          return;
        }
        if (domain === 'media_player') {
          void onCallService?.('media_player', 'media_play_pause', { entity_id: widget.entityId });
          return;
        }
        if (['light', 'switch', 'input_boolean', 'fan'].includes(domain)) {
          const nextIsOn = !widget.isOn;
          const nextBrightnessPct =
            domain === 'light' && nextIsOn
              ? (() => {
                  const realBrightnessPct =
                    typeof widget.value === 'number' && widget.value > 0
                      ? widget.value
                      : resolveLightBrightnessPercent(haStates[widget.entityId]);
                  return realBrightnessPct !== undefined
                    ? Math.max(1, Math.min(100, Math.round(realBrightnessPct)))
                    : undefined;
                })()
              : undefined;
          setOptimisticRoomToggleByEntityId((current) => ({
            ...current,
            [widget.entityId]: {
              isOn: nextIsOn,
              brightnessPct: nextBrightnessPct,
              expiresAt: Date.now() + ROOM_LIGHT_OPTIMISTIC_TTL_MS,
            },
          }));
          if (!onCallService) {
            return;
          }
          void onCallService(domain, nextIsOn ? 'turn_on' : 'turn_off', { entity_id: widget.entityId }).then((success) => {
            if (success !== false) {
              return;
            }
            setOptimisticRoomToggleByEntityId((current) => {
              if (!current[widget.entityId]) {
                return current;
              }
              const next = { ...current };
              delete next[widget.entityId];
              return next;
            });
          });
        }
      }}
      liveEntity={resolveRoomWidgetLiveEntity(widget)}
      switchConsumptionEntity={
        widget.kind === 'switch' && widget.switchConsumptionEntityId
          ? haStates[widget.switchConsumptionEntityId] ?? haStates[widget.switchConsumptionEntityId.toLowerCase()]
          : undefined
      }
      onLightBrightnessChange={(nextWidget, value) => {
        void onCallService?.('light', 'turn_on', {
          entity_id: nextWidget.entityId,
          brightness_pct: Math.max(1, Math.min(100, Math.round(value))),
        });
      }}
      onClimateTargetTempChange={(nextWidget, value) => {
        void onCallService?.('climate', 'set_temperature', {
          entity_id: nextWidget.entityId,
          temperature: Math.round(value),
        });
      }}
      onClimateModeChange={(nextWidget, mode) => {
        void onCallService?.('climate', 'set_hvac_mode', {
          entity_id: nextWidget.entityId,
          hvac_mode: mode,
        });
      }}
      onClimateFanModeChange={(nextWidget, mode) => {
        void onCallService?.('climate', 'set_fan_mode', {
          entity_id: nextWidget.entityId,
          fan_mode: mode,
        });
      }}
      onMediaToggle={(nextWidget) => {
        void onCallService?.('media_player', 'media_play_pause', { entity_id: nextWidget.entityId });
      }}
      onMediaPrevious={(nextWidget) => {
        void onCallService?.('media_player', 'media_previous_track', { entity_id: nextWidget.entityId });
      }}
      onMediaNext={(nextWidget) => {
        void onCallService?.('media_player', 'media_next_track', { entity_id: nextWidget.entityId });
      }}
      onMediaSeek={(nextWidget, position) => {
        void onCallService?.('media_player', 'media_seek', {
          entity_id: nextWidget.entityId,
          seek_position: position,
        });
      }}
      onMediaShuffle={(nextWidget) => {
        const currentEntity = haStates[nextWidget.entityId];
        const currentShuffle =
          currentEntity?.shuffleEnabled ??
          (typeof currentEntity?.rawAttributes?.shuffle === 'boolean'
            ? currentEntity.rawAttributes.shuffle
            : typeof currentEntity?.rawAttributes?.shuffle_enabled === 'boolean'
              ? currentEntity.rawAttributes.shuffle_enabled
              : false);
        void onCallService?.('media_player', 'shuffle_set', {
          entity_id: nextWidget.entityId,
          shuffle: !currentShuffle,
        });
      }}
      onMediaRepeat={(nextWidget) => {
        const currentEntity = haStates[nextWidget.entityId];
        const currentRepeat = `${
          currentEntity?.repeatMode ??
          currentEntity?.rawAttributes?.repeat ??
          currentEntity?.rawAttributes?.repeat_mode ??
          'off'
        }`.trim().toLowerCase();
        const nextRepeat = currentRepeat === 'off' || currentRepeat === 'none' || currentRepeat === ''
          ? 'all'
          : currentRepeat === 'all'
            ? 'one'
            : 'off';
        void onCallService?.('media_player', 'repeat_set', {
          entity_id: nextWidget.entityId,
          repeat: nextRepeat,
        });
      }}
      onMediaSelectSource={(nextWidget, source) => {
        void onCallService?.('media_player', 'select_source', {
          entity_id: nextWidget.entityId,
          source,
        });
      }}
      mediaHideHeader={widget.kind === 'media'}
      onLockToggle={(nextWidget) => {
        void onCallService?.('lock', nextWidget.isOn ? 'lock' : 'unlock', { entity_id: nextWidget.entityId });
      }}
      onLockOpen={(nextWidget) => {
        void onCallService?.('lock', 'open', { entity_id: nextWidget.entityId });
      }}
    />
  );

  const roomWidgetGridCols = Math.max(1, Math.round(STACK_GRID_COLS_BY_BREAKPOINT[roomsGridBreakpoint] ?? 1));

  const renderWidgetGrid = (
    widgets: Widget[],
    gridCols = roomWidgetGridCols,
    resolvedRowCount?: number,
    options?: RoomWidgetGridOptions,
  ) => {
    const rowCount = resolvedRowCount ?? resolveRoomWidgetGridRowCount(widgets, roomsGridBreakpoint, gridCols, options);
    const gridMinHeight = resolveRoomWidgetGridHeightPx(rowCount);
    return (
      <div
        className="grid min-h-0 min-w-0 transition-[min-height] duration-300 ease-out"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          gridAutoRows: `${GRID_ENGINE_ROW_UNIT_PX}px`,
          columnGap: `${GRID_ENGINE_GAP_PX}px`,
          rowGap: `${GRID_ENGINE_GAP_PX}px`,
          gridAutoFlow: 'row dense',
          minHeight: gridMinHeight > 0 ? gridMinHeight : undefined,
        }}
      >
        {widgets.map((widget) => {
          const span = resolveRoomWidgetGridSpan(widget, roomsGridBreakpoint, options);
          const safeW = Math.min(gridCols, Math.max(1, Math.round(span.w)));
          const safeH = Math.max(1, Math.round(span.h));
          const sizedWidget: Widget = {
            ...widget,
            layout: {
              ...widget.layout,
              w: safeW,
              h: safeH,
            },
          };
          return (
            <div
              key={widget.id}
              className="relative h-full w-full min-h-0 min-w-0 overflow-hidden"
              style={{
                gridColumn: `span ${safeW}`,
                gridRow: `span ${safeH}`,
              }}
            >
              {renderRoomWidget(sizedWidget)}
            </div>
          );
        })}
      </div>
    );
  };

  const renderEntitySegmentControl = (
    entityIds: string[],
    selectedEntityId: string | null,
    onSelect: (entityId: string) => void,
    options?: { fillOnDesktop?: boolean },
  ) => {
    if (entityIds.length <= 1) {
      return null;
    }
    return (
      <div
        className={cn(
          'scrollbar-none flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] p-0.5',
          options?.fillOnDesktop && 'lg:w-full lg:overflow-visible lg:p-1',
        )}
      >
        {entityIds.map((entityId, index) => {
          const state = haStates[entityId];
          const label = getEntityFriendlyName(entityId, state) || rt('entityFallback', { count: index + 1 });
          const isSelected = selectedEntityId === entityId;
          return (
            <button
              key={entityId}
              type="button"
              onClick={() => onSelect(entityId)}
              className={cn(
                'max-w-[10rem] shrink-0 truncate rounded-full px-3 py-1.5 text-center text-[11px] font-semibold transition-all active:scale-95',
                options?.fillOnDesktop && 'lg:min-w-0 lg:flex-1 lg:basis-0 lg:px-4 lg:py-2 lg:max-w-none',
                isSelected
                  ? 'bg-[color:var(--ui-segment-active)] text-[color:var(--ui-text-primary)] shadow-sm'
                  : 'text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)]',
              )}
              title={label}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderRoomSectionHeader = (
    label: string,
    count: number,
    options?: {
      onOpen?: () => void;
      onEdit?: () => void;
      editDisabled?: boolean;
    },
  ) => (
    <div className="flex items-start justify-between gap-3">
      {options?.onOpen ? (
        <button
          type="button"
          onClick={options.onOpen}
          className="group min-w-0 text-left transition-all active:scale-[0.99]"
          aria-label={rt('showAllInSection', { section: label })}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight tracking-normal text-[color:var(--ui-text-primary)]">{label}</span>
            <ChevronRight size={14} className="shrink-0 text-[color:var(--ui-text-tertiary)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--ui-text-primary)]" />
          </span>
          <span className="mt-0.5 block text-[0.72rem] font-medium leading-tight text-[color:var(--ui-text-tertiary)]">
            {rt(count === 1 ? 'deviceCountOne' : 'deviceCountMany', { count })}
          </span>
        </button>
      ) : (
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold leading-tight tracking-normal text-[color:var(--ui-text-primary)]">{label}</h2>
          <p className="mt-0.5 text-[0.72rem] font-medium leading-tight text-[color:var(--ui-text-tertiary)]">
            {rt(count === 1 ? 'deviceCountOne' : 'deviceCountMany', { count })}
          </p>
        </div>
      )}
      {options?.onEdit && !options.editDisabled ? (
        <button
          type="button"
          onClick={options.onEdit}
          disabled={options.editDisabled}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--ui-text-tertiary)] transition-all hover:bg-[color:var(--ui-fill-secondary)] hover:text-[color:var(--ui-text-primary)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-25"
          aria-label={rt('editSection', { section: label })}
          title={options.editDisabled ? rt('connectedRoomRequired') : rt('editSectionShort', { section: label })}
        >
          <Pencil size={13} />
        </button>
      ) : null}
    </div>
  );

  const renderFloatingSectionEditButton = (target: RoomSectionEditTarget, className?: string) => {
    if (!canEditActiveHaRoom) {
      return null;
    }
    return (
      <button
        type="button"
        onClick={() => startEditRoomSection(target)}
        className={cn(
          'absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/22 text-white/56 shadow-sm backdrop-blur-md transition-all hover:bg-white/[0.08] hover:text-white active:scale-95',
          className,
        )}
        aria-label={rt('editSection', { section: target.label })}
        title={rt('editSectionShort', { section: target.label })}
      >
        <Pencil size={13} />
      </button>
    );
  };

  const openSectionDeviceAddSheet = (target: RoomSectionEditTarget) => {
    if (!canOpenActiveHaRoomSection) {
      return;
    }
    startEditRoomSection(target);
    setSectionDeviceSheetMode('add');
    setSectionDeviceSearch('');
    setSelectedSectionAddTargetIds({});
    setSectionActionError(null);
  };

  const renderEmptyRoomArea = (
    gridArea: string,
    title: string,
    description = rt('emptySectionDescription'),
    className?: string,
    editTarget?: RoomSectionEditTarget,
    options?: { mobileOutsideGrid?: boolean },
  ) => {
    const isMobileOutsideGrid = Boolean(isMobileRoomsGrid && options?.mobileOutsideGrid);
    if (isMobileRoomsGrid && !isMobileOutsideGrid) {
      return null;
    }
    const canOpenEmptySection = Boolean(editTarget && canOpenActiveHaRoomSection);
    return (
      <section
        key={gridArea}
        className={cn(
          'rooms-surface flex min-h-[12rem] min-w-0 flex-col p-3 sm:p-4',
          isMobileOutsideGrid && 'gap-4',
          className,
        )}
        style={isMobileOutsideGrid ? undefined : { gridArea, alignSelf: 'start' }}
      >
        {editTarget ? (
          <div className="mb-3">
            {renderRoomSectionHeader(editTarget.label, 0, {
              onOpen: canOpenActiveHaRoomSection ? () => startEditRoomSection(editTarget) : undefined,
            })}
          </div>
        ) : (
          <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--ui-text-tertiary)]">{rt('sectionNotConfigured')}</p>
        )}
        <div className="relative flex min-h-[8.5rem] flex-1 items-center justify-center overflow-hidden rounded-[1.25rem] border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] px-4 py-5 text-center">
          <div aria-hidden="true" className="absolute inset-0 opacity-45">
            <div className="absolute left-4 right-4 top-4 h-8 rounded-2xl border border-white/[0.035] bg-white/[0.025]" />
            <div className="absolute left-4 top-16 h-12 w-[34%] rounded-2xl border border-white/[0.03] bg-white/[0.018]" />
            <div className="absolute left-[40%] right-4 top-16 h-12 rounded-2xl border border-white/[0.03] bg-white/[0.016]" />
            <div className="absolute bottom-4 left-6 h-2 w-20 rounded-full bg-white/[0.035]" />
            <div className="absolute bottom-4 right-6 h-2 w-14 rounded-full bg-white/[0.025]" />
          </div>
          <div className="relative z-10 flex max-w-xs flex-col items-center">
            <h2 className="text-sm font-semibold leading-snug text-[color:var(--ui-text-primary)]">{title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--ui-text-secondary)]">{description}</p>
            {editTarget && canOpenEmptySection ? (
              <button
                type="button"
                onClick={() => openSectionDeviceAddSheet(editTarget)}
                className="mt-4 inline-flex items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-secondary)] px-3.5 py-2 text-xs font-semibold text-[color:var(--ui-text-primary)] shadow-sm backdrop-blur-md transition-all hover:bg-[color:var(--ui-fill-primary)] active:scale-95"
                title={rt('addDevices')}
              >
                {rt('addDevices')}
              </button>
            ) : (
              <div className="mt-4 h-1.5 w-14 rounded-full bg-white/[0.06]" />
            )}
          </div>
        </div>
      </section>
    );
  };

  const callAccessoryAction = (accessory: RoomAccessoryCard) => {
    if (!onCallService) {
      return;
    }
    if (accessory.domain === 'scene') {
      void onCallService('scene', 'turn_on', { entity_id: accessory.entityId });
      return;
    }
    if (accessory.domain === 'cover') {
      void onCallService('cover', accessory.isOn ? 'close_cover' : 'open_cover', { entity_id: accessory.entityId });
    }
  };

  const renderAccessoryCards = (accessories: RoomAccessoryCard[], variant: 'preview' | 'expanded' = 'preview') => (
    <div className={cn(variant === 'expanded' ? 'grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3' : 'flex flex-wrap gap-2')}>
      {accessories.map((accessory) => (
        <button
          key={accessory.id}
          type="button"
          onClick={() => callAccessoryAction(accessory)}
          className={cn(
            'flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.04] text-[10px] text-white/50 backdrop-blur-md transition-all hover:bg-white/[0.08] hover:text-white/75 active:scale-95',
            variant === 'expanded' ? 'aspect-square min-h-24 w-full' : 'h-20 w-20',
          )}
          title={`${accessory.title}: ${accessory.status}`}
        >
          <span className={cn('text-white/42', accessory.isOn && 'text-white/80')}>{accessory.icon}</span>
          <span className="max-w-[4.25rem] truncate font-semibold">{accessory.title}</span>
          <span className="max-w-[4.25rem] truncate text-white/34">{accessory.status}</span>
        </button>
      ))}
    </div>
  );

  const renderAccessoriesArea = () => {
    if (accessoryCards.length === 0) {
      const allAccessoryEntityIds = getRoomSectionEntityIds('accessories', activeBuckets);
      return renderEmptyRoomArea(
        'accessories',
        rt('noAccessories'),
        rt('accessoriesDescription'),
        undefined,
        { kind: 'accessories', id: 'accessories', label: rt('accessories'), entityIds: allAccessoryEntityIds },
      );
    }
    const visibleAccessories = accessoryCards.slice(0, ROOM_ACCESSORY_PREVIEW_LIMIT);
    const accessoryEntityIds = accessoryCards.map((accessory) => accessory.entityId);
    const allAccessoryEntityIds = getRoomSectionEntityIds('accessories', activeBuckets);
    const accessoryDeviceCount = buildSectionDeviceTargets(accessoryEntityIds).length;
    const accessoryEditTarget = {
      kind: 'accessories' as const,
      id: 'accessories',
      label: rt('accessories'),
      entityIds: allAccessoryEntityIds,
    };
    return (
      <section
        className="rooms-surface min-w-0 p-3 sm:p-4"
        style={{ gridArea: 'accessories' }}
      >
        <div className="mb-3">
          {renderRoomSectionHeader(
            rt('accessories'),
            accessoryDeviceCount,
            {
              onOpen: canOpenActiveHaRoomSection ? () => startEditRoomSection(accessoryEditTarget) : undefined,
            },
          )}
        </div>
        {renderAccessoryCards(visibleAccessories)}
      </section>
    );
  };

  const lightsCluster = roomWidgetClusters.find((cluster) => cluster.id === 'lights');
  const switchesCluster = roomWidgetClusters.find((cluster) => cluster.id === 'switches');
  const sensorsCluster = roomWidgetClusters.find((cluster) => cluster.id === 'sensors');
  const securityCluster = roomWidgetClusters.find((cluster) => cluster.id === 'security');
  const roomCameraViewerItems = React.useMemo(
    () => visibleActiveBuckets.cameras.map((entityId) => {
      const liveEntity = haStates[entityId];
      const widget = buildRoomWidget(entityId, 'camera', liveEntity, { i: entityId, x: 0, y: 0, w: 2, h: 2 });
      const model = buildCameraCardModel(widget, liveEntity);
      return {
        entityId,
        name: model.title,
        statusLabel: model.statusLabel,
        subtitle: model.subtitle,
        streamUrl: model.streamUrl,
        snapshotUrl: model.imageUrl,
        isOffline: !model.isAvailable,
        supportsPtz: cameraPtzEntityIds.includes(entityId),
      };
    }),
    [cameraPtzEntityIds, haStates, visibleActiveBuckets.cameras],
  );
  const renderWidgetCluster = (
    cluster: RoomWidgetCluster | undefined,
    options?: {
      sectionId?: string;
      label?: string;
      allEntityIds?: string[];
      gridArea?: string;
      controls?: React.ReactNode;
      count?: number;
      className?: string;
      emptyTitle?: string;
      emptyDescription?: string;
      emptyClassName?: string;
      previewLimit?: number;
      gridCols?: number;
      widgetWidth?: number;
      gridOptions?: RoomWidgetGridOptions;
      suppressMobileEmpty?: boolean;
    },
  ) => {
    if (!cluster) {
      if (isMobileRoomsGrid && !options?.suppressMobileEmpty && options?.label && options.sectionId) {
        return renderEmptyRoomArea(
          options.gridArea ?? options.sectionId,
          options.emptyTitle ?? rt('noDevicesInSection', { section: options.label }),
          options.emptyDescription,
          options.emptyClassName,
          { kind: 'widgets', id: options.sectionId, label: options.label, entityIds: uniqueStrings(options.allEntityIds ?? []) },
        );
      }
      if (options?.gridArea && options.emptyTitle) {
        const emptyEditTarget =
          options.sectionId && options.label
            ? { kind: 'widgets' as const, id: options.sectionId, label: options.label, entityIds: uniqueStrings(options.allEntityIds ?? []) }
            : undefined;
        return renderEmptyRoomArea(
          options.gridArea,
          options.emptyTitle,
          options.emptyDescription,
          options.emptyClassName,
          emptyEditTarget,
        );
      }
      if (options?.label && options.sectionId && options.allEntityIds && options.allEntityIds.length > 0) {
        const hiddenDeviceCount = buildSectionDeviceTargets(options.allEntityIds).length;
        return (
          <section className="rooms-surface min-w-0 space-y-3 p-3 transition-[min-height] duration-300 ease-out sm:p-4">
            {renderRoomSectionHeader(options.label, 0, {
              onOpen: canOpenActiveHaRoomSection
                ? () =>
                    startEditRoomSection({
                      kind: 'widgets',
                      id: options.sectionId ?? '',
                      label: options.label ?? '',
                      entityIds: uniqueStrings(options.allEntityIds ?? []),
                    })
                : undefined,
            })}
            <p className="text-xs font-medium text-[color:var(--ui-text-tertiary)]">
              {rt(hiddenDeviceCount === 1 ? 'hiddenDeviceOne' : 'hiddenDeviceMany', { count: hiddenDeviceCount })}
            </p>
          </section>
        );
      }
      return null;
    }
    const clusterEntityIds = cluster.widgets.map((widget) => widget.entityId);
    const editableEntityIds = uniqueStrings(options?.allEntityIds ?? clusterEntityIds);
    const clusterDeviceCount = buildSectionDeviceTargets(clusterEntityIds).length;
    const previewLimit = options?.previewLimit ?? ROOM_SECTION_PREVIEW_LIMIT;
    const visibleWidgets = cluster.widgets.slice(0, previewLimit);
    const sectionGridCols = resolveRoomSectionGridCols(options?.sectionId ?? cluster.id, roomsGridBreakpoint, roomWidgetGridCols);
    const clusterGridCols = Math.max(1, Math.round(options?.gridCols ?? sectionGridCols));
    const responsiveGridOptions = resolveRoomSectionGridOptions(options?.sectionId ?? cluster.id, roomsGridBreakpoint);
    const widgetGridOptions =
      options?.gridOptions ?? (options?.widgetWidth ? { ...responsiveGridOptions, widgetWidth: options.widgetWidth } : responsiveGridOptions);
    const gridRowCount = resolveRoomWidgetGridRowCount(visibleWidgets, roomsGridBreakpoint, clusterGridCols, widgetGridOptions);
    const clusterMinHeight = resolveRoomWidgetClusterMinHeightPx(
      gridRowCount,
      roomsGridBreakpoint,
      Boolean(options?.controls),
    );
    return (
      <section
        className={cn('rooms-surface min-w-0 space-y-3 p-3 transition-[min-height] duration-300 ease-out sm:p-4', options?.className)}
        style={{
          ...(options?.gridArea ? { gridArea: options.gridArea } : null),
          minHeight: clusterMinHeight > 0 ? clusterMinHeight : undefined,
        }}
      >
        {renderRoomSectionHeader(
          cluster.label,
          options?.count ?? clusterDeviceCount,
          {
            onOpen: canOpenActiveHaRoomSection
              ? () =>
                  startEditRoomSection({
                    kind: 'widgets',
                    id: cluster.id,
                    label: cluster.label,
                    entityIds: editableEntityIds,
                  })
              : undefined,
          },
        )}
        {options?.controls ? <div>{options.controls}</div> : null}
        {renderWidgetGrid(visibleWidgets, clusterGridCols, gridRowCount, widgetGridOptions)}
      </section>
    );
  };

  const mediaShuffleEnabled =
    mediaEntity?.shuffleEnabled ??
    (typeof mediaEntity?.rawAttributes?.shuffle === 'boolean'
      ? mediaEntity.rawAttributes.shuffle
      : typeof mediaEntity?.rawAttributes?.shuffle_enabled === 'boolean'
        ? mediaEntity.rawAttributes.shuffle_enabled
        : false);
  const mediaRepeatMode = `${
    mediaEntity?.repeatMode ??
    mediaEntity?.rawAttributes?.repeat ??
    mediaEntity?.rawAttributes?.repeat_mode ??
    'off'
  }`.trim().toLowerCase();
  const mediaRepeatActive = mediaRepeatMode !== '' && mediaRepeatMode !== 'off' && mediaRepeatMode !== 'none';
  const mediaCoverUrl = mediaEntity?.imageUrl;
  const toggleSelectedMediaPlayback = () => {
    if (!mediaEntityId) return;
    void onCallService?.('media_player', 'media_play_pause', { entity_id: mediaEntityId });
  };
  const skipSelectedMediaPrevious = () => {
    if (!mediaEntityId) return;
    void onCallService?.('media_player', 'media_previous_track', { entity_id: mediaEntityId });
  };
  const skipSelectedMediaNext = () => {
    if (!mediaEntityId) return;
    void onCallService?.('media_player', 'media_next_track', { entity_id: mediaEntityId });
  };
  const toggleSelectedMediaShuffle = () => {
    if (!mediaEntityId) return;
    void onCallService?.('media_player', 'shuffle_set', {
      entity_id: mediaEntityId,
      shuffle: !mediaShuffleEnabled,
    });
  };
  const toggleSelectedMediaRepeat = () => {
    if (!mediaEntityId) return;
    const nextRepeat = mediaRepeatMode === 'off' || mediaRepeatMode === 'none' || mediaRepeatMode === ''
      ? 'all'
      : mediaRepeatMode === 'all'
        ? 'one'
        : 'off';
    void onCallService?.('media_player', 'repeat_set', {
      entity_id: mediaEntityId,
      repeat: nextRepeat,
    });
  };

  const renderMediaPlayerArea = () => {
    const mediaEditTarget: RoomSectionEditTarget = {
      kind: 'widgets',
      id: 'media',
      label: 'Media',
      entityIds: getRoomSectionEntityIds('media', activeBuckets),
    };
    if (showMediaBottomBar) {
      return null;
    }
    if (!mediaRoomWidget || mediaRoomWidgets.length === 0) {
      return renderEmptyRoomArea(
        'media',
        rt('noMedia'),
        rt('mediaEmptyDescription'),
        undefined,
        mediaEditTarget,
      );
    }
    if (useMediaBottomBar) {
      return (
        <section
          className="relative flex min-w-0 flex-col gap-3 overflow-visible p-0"
          style={{ gridArea: 'media' }}
        >
          {renderFloatingSectionEditButton(mediaEditTarget)}
          <div className="-mx-1.5">
            <div
              ref={mediaSwiperRef}
              className={ROOM_SWIPER_SCROLLER_CLASS}
              onScroll={handleMediaSwiperScroll}
              {...mediaSwiperPointerHandlers}
            >
              {mediaRoomWidgets.map((widget) => {
                const entity = haStates[widget.entityId];
                const coverUrl = entity?.imageUrl;
                const playerLabel = getEntityFriendlyName(widget.entityId, entity);
                return (
                  <div key={widget.id} className="min-w-0 basis-full snap-center shrink-0 px-1.5">
                    <div className="flex min-w-0 items-center gap-3 rounded-[1.25rem] border border-white/[0.08] bg-white/[0.045] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/10">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-white/70">
                            <Music2 size={19} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight text-white">{playerLabel}</p>
                        <p className="mt-0.5 truncate text-[11px] font-medium leading-tight text-white/52">
                          {rt('noPlayback')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMediaEntityId(widget.entityId);
                          void onCallService?.('media_player', 'media_play_pause', { entity_id: widget.entityId });
                        }}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-zinc-950 shadow-[0_8px_20px_rgba(255,255,255,0.18)] transition-transform active:scale-95"
                        aria-label={`Avvia ${playerLabel}`}
                      >
                        <Play size={17} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {mediaRoomWidgets.length > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {mediaRoomWidgets.map((widget, index) => {
                  const active = widget.entityId === mediaEntityId;
                  return (
                    <button
                      key={widget.entityId}
                      type="button"
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-200 active:scale-95',
                        active ? 'w-5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.28)]' : 'w-1.5 bg-white/28 hover:bg-white/48',
                      )}
                      onClick={() => {
                        setSelectedMediaEntityId(widget.entityId);
                        scrollToMediaSlide(index);
                      }}
                      aria-label={rt('showItem', { name: widget.title })}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>
      );
    }
    return (
      <section
        className="relative flex min-h-[16rem] min-w-0 flex-col overflow-visible p-0"
        style={{ gridArea: 'media' }}
      >
        {renderFloatingSectionEditButton(mediaEditTarget)}
        <div className="min-h-0 flex-1">
          <div className="-mx-1.5 h-full min-h-[16rem]">
            <div
              ref={mediaSwiperRef}
              className={cn(ROOM_SWIPER_SCROLLER_CLASS, 'h-full')}
              onScroll={handleMediaSwiperScroll}
              {...mediaSwiperPointerHandlers}
            >
              {mediaRoomWidgets.map((widget) => (
                <div key={widget.id} className="min-w-0 basis-full snap-center shrink-0 px-1.5">
                  <div className="h-full min-h-[16rem] min-w-0 overflow-hidden">
                    {renderRoomWidget(widget)}
                  </div>
                </div>
              ))}
            </div>
            {mediaRoomWidgets.length > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-1.5">
                {mediaRoomWidgets.map((widget, index) => {
                  const active = widget.entityId === mediaEntityId;
                  return (
                    <button
                      key={widget.entityId}
                      type="button"
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-200 active:scale-95',
                        active ? 'w-5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.28)]' : 'w-1.5 bg-white/28 hover:bg-white/48',
                      )}
                      onClick={() => {
                        setSelectedMediaEntityId(widget.entityId);
                        scrollToMediaSlide(index);
                      }}
                      aria-label={rt('showItem', { name: widget.title })}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  };

  const renderMobileBottomEmptySections = () => {
    if (!isMobileRoomsGrid) {
      return null;
    }

    const emptySections = [
      !climateControlModel
        ? renderEmptyRoomArea(
            'clima-empty',
            rt('noClimate'),
            rt('climateEmptyDescription'),
            undefined,
            {
              kind: 'widgets',
              id: 'clima',
              label: 'Clima',
              entityIds: getRoomSectionEntityIds('clima', activeBuckets),
            },
            { mobileOutsideGrid: true },
          )
        : null,
      !lightsCluster
        ? renderEmptyRoomArea(
            'lights-empty',
            rt('noLights'),
            rt('lightsEmptyDescription'),
            undefined,
            {
              kind: 'widgets',
              id: 'lights',
              label: 'Luci',
              entityIds: getRoomSectionEntityIds('lights', activeBuckets),
            },
            { mobileOutsideGrid: true },
          )
        : null,
      !switchesCluster
        ? renderEmptyRoomArea(
            'switches-empty',
            rt('noSwitches'),
            rt('switchesEmptyDescription'),
            undefined,
            {
              kind: 'widgets',
              id: 'switches',
              label: 'Interruttori',
              entityIds: getRoomSectionEntityIds('switches', activeBuckets),
            },
            { mobileOutsideGrid: true },
          )
        : null,
      !sensorsCluster
        ? renderEmptyRoomArea(
            'sensors-empty',
            rt('noSensors'),
            rt('sensorsEmptyDescription'),
            undefined,
            {
              kind: 'widgets',
              id: 'sensors',
              label: 'Sensori',
              entityIds: getRoomSectionEntityIds('sensors', activeBuckets),
            },
            { mobileOutsideGrid: true },
          )
        : null,
      !securityCluster
        ? renderEmptyRoomArea(
            'security-empty',
            rt('noSecurity'),
            rt('securityEmptyDescription'),
            undefined,
            {
              kind: 'widgets',
              id: 'security',
              label: rt('security'),
              entityIds: getRoomSectionEntityIds('security', activeBuckets),
            },
            { mobileOutsideGrid: true },
          )
        : null,
      !mediaRoomWidget || mediaRoomWidgets.length === 0
        ? renderEmptyRoomArea(
            'media-empty',
            rt('noMedia'),
            rt('mediaEmptyDescription'),
            undefined,
            {
              kind: 'widgets',
              id: 'media',
              label: 'Media',
              entityIds: getRoomSectionEntityIds('media', activeBuckets),
            },
            { mobileOutsideGrid: true },
          )
        : null,
      accessoryCards.length === 0
        ? renderEmptyRoomArea(
            'accessories-empty',
            rt('noAccessories'),
            rt('accessoriesDescription'),
            undefined,
            {
              kind: 'accessories',
              id: 'accessories',
              label: rt('accessories'),
              entityIds: getRoomSectionEntityIds('accessories', activeBuckets),
            },
            { mobileOutsideGrid: true },
          )
        : null,
    ].filter(Boolean);

    if (emptySections.length === 0) {
      return null;
    }

    return <div className="relative z-10 mt-4 grid min-w-0 gap-4">{emptySections}</div>;
  };

  const renderMediaBottomBar = () => {
    if (!showMediaBottomBar || !mediaRoomWidget || !mediaEntityId) {
      return null;
    }
    return (
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.9rem)] z-[160] px-2 md:hidden">
        <div className="relative mx-auto max-w-xl overflow-hidden rounded-[1.35rem] border border-white/12 bg-[#16171d]/88 shadow-[0_18px_48px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
          {mediaCoverUrl ? (
            <div
              aria-hidden="true"
              className="absolute inset-0 scale-110 bg-cover bg-center opacity-70 blur-2xl"
              style={{ backgroundImage: `url("${mediaCoverUrl}")` }}
            />
          ) : null}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,8,12,0.82),rgba(6,8,12,0.68)_46%,rgba(6,8,12,0.78)),linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.02)_40%,rgba(0,0,0,0.18))]"
          />
          <div
            className="relative h-0.5 bg-white/22"
            aria-hidden="true"
          >
            <div className="h-full bg-white" style={{ width: `${Math.round(mediaProgress * 100)}%` }} />
          </div>
          <div className="relative flex min-w-0 items-center gap-2.5 px-2.5 py-2.5">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-white/10">
              {mediaCoverUrl ? (
                <img src={mediaCoverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-white/70">
                  <Music2 size={18} />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleSelectedMediaPlayback}
              className="min-w-0 flex-1 text-left"
              aria-label={rt('playPause')}
            >
              <p className="truncate text-sm font-semibold leading-tight text-white">{mediaTitle}</p>
              <p className="mt-0.5 truncate text-[11px] font-medium leading-tight text-white/58">{mediaArtist}</p>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={toggleSelectedMediaShuffle}
                className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full text-white/72 transition-colors active:scale-95', mediaShuffleEnabled && 'bg-white text-zinc-950')}
                aria-label="Shuffle"
                aria-pressed={mediaShuffleEnabled}
              >
                <Shuffle size={15} />
              </button>
              <button
                type="button"
                onClick={skipSelectedMediaPrevious}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/72 transition-colors active:scale-95"
                aria-label={rt('previousTrack')}
              >
                <SkipBack size={15} />
              </button>
              <button
                type="button"
                onClick={toggleSelectedMediaPlayback}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-950 shadow-[0_8px_20px_rgba(255,255,255,0.18)] transition-transform active:scale-95"
                aria-label={mediaIsPlaying ? rt('pause') : rt('play')}
              >
                {mediaIsPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                type="button"
                onClick={skipSelectedMediaNext}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/72 transition-colors active:scale-95"
                aria-label={rt('nextTrack')}
              >
                <SkipForward size={15} />
              </button>
              <button
                type="button"
                onClick={toggleSelectedMediaRepeat}
                className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full text-white/72 transition-colors active:scale-95', mediaRepeatActive && 'bg-white text-zinc-950')}
                aria-label="Repeat"
                aria-pressed={mediaRepeatActive}
              >
                <Repeat2 size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSectionDeviceIcon = (target: RoomSectionDeviceTarget) => {
    const domain = target.domains[0] ?? '';
    if (domain === 'light') return <Lightbulb size={18} />;
    if (domain === 'climate') return <Thermometer size={18} />;
    if (domain === 'media_player') return <Speaker size={18} />;
    if (domain === 'switch' || domain === 'input_boolean') return <Tv size={18} />;
    if (domain === 'fan') return <Fan size={18} />;
    if (domain === 'sensor' || domain === 'binary_sensor') return <Thermometer size={18} />;
    if (domain === 'lock') return <Lock size={18} />;
    if (domain === 'camera') return <Video size={18} />;
    if (domain === 'cover') return <ChevronRight size={18} />;
    if (domain === 'weather') return <Leaf size={18} />;
    if (domain === 'scene') return <Play size={18} />;
    return <Layers size={18} />;
  };

  const renderQuickEntityIcon = (domain: string, size = 28) => {
    if (domain === 'light') return <Lightbulb size={size} />;
    if (domain === 'climate') return <Thermometer size={size} />;
    if (domain === 'media_player') return <Speaker size={size} />;
    if (domain === 'switch' || domain === 'input_boolean') return <Tv size={size} />;
    if (domain === 'fan') return <Fan size={size} />;
    if (domain === 'sensor' || domain === 'binary_sensor') return <Thermometer size={size} />;
    if (domain === 'lock') return <Lock size={size} />;
    if (domain === 'camera') return <Video size={size} />;
    if (domain === 'cover') return <ChevronRight size={size} />;
    if (domain === 'weather') return <Leaf size={size} />;
    if (domain === 'scene') return <Play size={size} />;
    return <Layers size={size} />;
  };

  const resolveQuickEntitySlider = (entity: RoomSectionDeviceEntityTarget) => {
    const state = haStates[entity.entityId];
    if (entity.domain === 'light') {
      return {
        value: resolveLightBrightnessPercent(state) ?? (isEntityOn(entity.entityId, state) ? 100 : 0),
        min: 0,
        max: 100,
        step: 1,
        accent: 'rgb(250 204 21 / 0.24)',
        label: rt('brightness'),
        onChange: (value: number) => {
          const nextBrightness = Math.round(value);
          if (nextBrightness <= 0) {
            return onCallService?.('light', 'turn_off', { entity_id: entity.entityId });
          }
          return onCallService?.('light', 'turn_on', {
            entity_id: entity.entityId,
            brightness_pct: Math.max(1, Math.min(100, nextBrightness)),
          });
        },
      };
    }
    if (entity.domain === 'media_player') {
      const volume = toNumber(state?.volumeLevel) ?? toNumber(state?.rawAttributes?.volume_level);
      if (volume === undefined) {
        return null;
      }
      return {
        value: Math.max(0, Math.min(100, Math.round(volume * 100))),
        min: 0,
        max: 100,
        step: 1,
        accent: 'rgb(133 173 255 / 0.24)',
        label: 'Volume',
        onChange: (value: number) => {
          return onCallService?.('media_player', 'volume_set', {
            entity_id: entity.entityId,
            volume_level: Math.max(0, Math.min(1, value / 100)),
          });
        },
      };
    }
    if (entity.domain === 'cover') {
      const position =
        toNumber(state?.currentValue) ??
        toNumber(state?.numericValue) ??
        toNumber(state?.rawAttributes?.current_position) ??
        toNumber(state?.rawAttributes?.position);
      if (position === undefined) {
        return null;
      }
      return {
        value: Math.max(0, Math.min(100, Math.round(position))),
        min: 0,
        max: 100,
        step: 1,
        accent: 'rgb(148 163 184 / 0.22)',
        label: 'Posizione',
        onChange: (value: number) => {
          return onCallService?.('cover', 'set_cover_position', {
            entity_id: entity.entityId,
            position: Math.round(value),
          });
        },
      };
    }
    return null;
  };

  const canQuickToggleEntity = (entity: RoomSectionDeviceEntityTarget) =>
    Boolean(
      onCallService &&
        ['light', 'switch', 'input_boolean', 'fan', 'media_player', 'cover', 'scene'].includes(entity.domain),
    );

  const markQuickEntityTogglePending = (entityId: string, isOn: boolean, brightnessPct?: number) => {
    setOptimisticRoomToggleByEntityId((current) => ({
      ...current,
      [entityId]: {
        isOn,
        brightnessPct,
        expiresAt: Date.now() + ROOM_LIGHT_OPTIMISTIC_TTL_MS,
      },
    }));
  };

  const clearQuickEntityTogglePending = (entityId: string) => {
    setOptimisticRoomToggleByEntityId((current) => {
      if (!current[entityId]) {
        return current;
      }
      const next = { ...current };
      delete next[entityId];
      return next;
    });
  };

  const clearQuickSliderDraft = (entityId: string) => {
    setQuickSliderDraftByEntityId((current) => {
      if (!current[entityId]) {
        return current;
      }
      const next = { ...current };
      delete next[entityId];
      return next;
    });
  };

  const handleQuickEntitySliderChange = (
    entityId: string,
    slider: NonNullable<ReturnType<typeof resolveQuickEntitySlider>>,
    value: number,
  ) => {
    const clampedValue = Math.max(slider.min, Math.min(slider.max, value));
    const steppedValue =
      slider.step > 0
        ? Math.max(slider.min, Math.min(slider.max, Math.round((clampedValue - slider.min) / slider.step) * slider.step + slider.min))
        : clampedValue;

    setQuickSliderDraftByEntityId((current) => ({
      ...current,
      [entityId]: {
        value: steppedValue,
        expiresAt: Date.now() + ROOM_QUICK_SLIDER_DRAFT_TTL_MS,
      },
    }));

    const result = slider.onChange(steppedValue);
    if (result) {
      void result.then((success) => {
        if (success === false) {
          clearQuickSliderDraft(entityId);
        }
      });
    }
  };

  const toggleQuickEntity = (entity: RoomSectionDeviceEntityTarget) => {
    if (!onCallService) {
      return;
    }
    const state = haStates[entity.entityId];
    const isOn = optimisticRoomToggleByEntityId[entity.entityId]?.isOn ?? isEntityOn(entity.entityId, state);
    if (entity.domain === 'light') {
      const nextIsOn = !isOn;
      const nextBrightnessPct = nextIsOn ? resolveLightBrightnessPercent(state) ?? 100 : undefined;
      markQuickEntityTogglePending(entity.entityId, nextIsOn, nextBrightnessPct);
      void onCallService('light', nextIsOn ? 'turn_on' : 'turn_off', { entity_id: entity.entityId }).then((success) => {
        if (success === false) {
          clearQuickEntityTogglePending(entity.entityId);
        }
      });
      return;
    }
    if (entity.domain === 'switch' || entity.domain === 'input_boolean' || entity.domain === 'fan') {
      const nextIsOn = !isOn;
      markQuickEntityTogglePending(entity.entityId, nextIsOn);
      void onCallService(entity.domain, nextIsOn ? 'turn_on' : 'turn_off', { entity_id: entity.entityId }).then((success) => {
        if (success === false) {
          clearQuickEntityTogglePending(entity.entityId);
        }
      });
      return;
    }
    if (entity.domain === 'media_player') {
      void onCallService('media_player', 'media_play_pause', { entity_id: entity.entityId });
      return;
    }
    if (entity.domain === 'cover') {
      void onCallService('cover', isOn ? 'close_cover' : 'open_cover', { entity_id: entity.entityId });
      return;
    }
    if (entity.domain === 'scene') {
      void onCallService('scene', 'turn_on', { entity_id: entity.entityId });
    }
  };

  const renderQuickEntityCard = (
    entity: RoomSectionDeviceEntityTarget,
    target: RoomSectionDeviceTarget,
    options?: { compact?: boolean },
  ) => {
    const state = haStates[entity.entityId];
    const pendingToggle = optimisticRoomToggleByEntityId[entity.entityId];
    const isHidden = !entity.isVisible;
    const baseIsOn = pendingToggle?.isOn ?? isEntityOn(entity.entityId, state);
    const resolvedSlider = !isSectionTargetSelectionMode ? resolveQuickEntitySlider(entity) : null;
    const slider = resolvedSlider && (entity.domain !== 'light' || baseIsOn) ? resolvedSlider : null;
    const sliderDraft = slider ? quickSliderDraftByEntityId[entity.entityId] : undefined;
    const sliderValue = slider
      ? Math.max(slider.min, Math.min(slider.max, sliderDraft?.value ?? slider.value))
      : 0;
    const isOn = entity.domain === 'light' && sliderDraft ? sliderValue > 0 : baseIsOn;
    const isPoweringOn = Boolean(pendingToggle?.isOn && !isSectionTargetSelectionMode);
    const sliderPct = slider
      ? ((sliderValue - slider.min) / Math.max(1, slider.max - slider.min)) * 100
      : 0;
    const showToggle = canQuickToggleEntity(entity) || isSectionTargetSelectionMode;
    const isSwitchQuickCard = entity.domain === 'switch' || entity.domain === 'input_boolean';
    const secondaryLabel = target.kind === 'device' && hasDistinctDeviceName(target) ? target.name : formatDomainLabel(entity.domain, rt);
    const iconSize = options?.compact ? 24 : 30;
    const toggleSizeClass = options?.compact ? 'h-9 w-9' : 'h-11 w-11';

    return (
      <div
        key={entity.entityId}
        className={cn(
          'relative isolate aspect-square min-w-0 overflow-hidden rounded-[1.25rem] border text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_34px_rgba(0,0,0,0.16)] transition-all',
          options?.compact ? 'p-2.5' : 'p-3.5',
          isHidden
            ? 'border-white/[0.055] bg-black/12 text-white/42'
            : isSwitchQuickCard
              ? isOn
                ? 'border-emerald-300/24 bg-emerald-500/34 text-white'
                : 'border-white/[0.07] bg-white/[0.045] text-white'
              : isOn
                ? 'border-[#facc15]/18 bg-[rgb(72_59_24_/_0.74)] text-white'
                : 'border-white/[0.07] bg-white/[0.045] text-white',
        )}
      >
        {slider ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 z-0 transition-[width]"
              style={{ width: `${sliderPct}%`, background: slider.accent }}
            />
            <GlassSlider
              variant="overlay"
              data-quick-control="true"
              data-quick-slider="true"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={sliderValue}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => handleQuickEntitySliderChange(entity.entityId, slider, Number(event.currentTarget.value))}
              className="absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0 [touch-action:pan-y]"
              aria-label={`${slider.label} ${entity.name}`}
            />
          </>
        ) : null}
        <div className="pointer-events-none relative z-20 flex h-full flex-col">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                'text-white/72',
                isOn && (isSwitchQuickCard ? 'text-emerald-200' : 'text-[#facc15]'),
                isHidden && 'text-white/32',
              )}
            >
              {renderQuickEntityIcon(entity.domain, iconSize)}
            </span>
            {showToggle ? (
              <button
                type="button"
                data-quick-control="true"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (isSectionTargetSelectionMode) {
                    toggleRoomEntityVisibility(entity.entityId);
                    return;
                  }
                  toggleQuickEntity(entity);
                }}
                className={cn(
                  'pointer-events-auto relative z-30 inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full p-[2px] text-white shadow-sm transition-all active:scale-95',
                  toggleSizeClass,
                  isHidden && 'text-white/45',
                )}
                aria-label={
                  isSectionTargetSelectionMode
                    ? rt(entity.isVisible ? 'hideItem' : 'showNamedItem', { name: entity.name })
                    : rt(isOn ? 'turnOff' : 'turnOn', { name: entity.name })
                }
              >
                {isPoweringOn ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,rgba(255,255,255,0),rgba(255,255,255,0.95),rgba(255,255,255,0))] motion-reduce:animate-none"
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-[2px] rounded-full backdrop-blur-md transition-colors',
                    isOn && !isSectionTargetSelectionMode
                      ? isSwitchQuickCard
                        ? 'bg-emerald-500/68'
                        : 'bg-[rgb(72_59_24_/_0.92)]'
                      : isHidden
                        ? 'bg-white/14'
                        : 'bg-white/28',
                  )}
                />
                <span
                  className={cn(
                    'relative z-10 h-4 w-4 rounded-full border-[3px]',
                    isSectionTargetSelectionMode
                      ? entity.isVisible
                        ? 'border-white bg-white'
                        : 'border-white/70'
                      : isOn
                        ? 'border-white bg-white'
                        : 'border-white/80',
                  )}
                />
              </button>
            ) : null}
          </div>
          <div className="mt-auto min-w-0 pt-3">
            <p className={cn('line-clamp-2 font-bold leading-tight', options?.compact ? 'text-[13px]' : 'text-[15px]', isHidden ? 'text-white/44' : 'text-white/90')}>
              {entity.name}
            </p>
            <p
              className={cn(
                'mt-1 truncate font-semibold leading-tight',
                options?.compact ? 'text-[11px]' : 'text-[12px]',
                isOn ? (isSwitchQuickCard ? 'text-emerald-100' : 'text-[#fde68a]') : isHidden ? 'text-white/34' : 'text-white/62',
              )}
            >
              {entity.status}
            </p>
            <p className={cn('mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.08em]', isHidden ? 'text-white/24' : 'text-white/30')}>
              {secondaryLabel}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderSectionDeviceSheet = () => {
    if (!canManageRooms || !editingRoomSection || !sectionDeviceSheetMode) {
      return null;
    }
    const selectedCount = selectedSectionTargets.length;
    const selectedAddCount = selectedSectionAddTargets.length;
    const canMove = selectedCount > 0 && Boolean(sectionMoveTargetAreaId) && sectionMoveTargetAreaId !== activeRoomTab?.id;
    const canAddSelectedTargets = activeRoomTab?.source === 'ha' && selectedAddCount > 0;
    const moveLabel = rt(selectedCount === 1 ? 'moveDeviceOne' : 'moveDevices');
    const addLabel =
      selectedAddCount === 0
        ? rt('selectDevices')
        : selectedAddCount === 1
          ? rt('addDeviceOne')
          : rt('addDeviceMany', { count: selectedAddCount });

    return (
      <GlassBottomSheet
        isOpen
        onClose={() => {
          if (!sectionActionBusy) {
            setSectionDeviceSheetMode(null);
            setSelectedSectionAddTargetIds({});
          }
        }}
        title={sectionDeviceSheetMode === 'add' ? rt('addDevice') : rt('moveDevices')}
        position="container"
        usePortal={false}
        dismissible={!sectionActionBusy}
        showHeader={false}
        zIndex={30}
      >
          {sectionDeviceSheetMode === 'add' ? (
            <>
              <div className="text-center">
                <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-primary)] shadow-[0_12px_24px_var(--ui-shadow-soft)]">
                  <Plus size={22} />
                </span>
                <h3 className="mt-3 text-lg font-bold tracking-normal text-[color:var(--ui-text-primary)]">{rt('addDevice')}</h3>
                <p className="mt-0.5 text-sm font-medium text-[color:var(--ui-text-secondary)]">{editingRoomSection.label}</p>
              </div>
              <label className="mt-5 flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] px-3.5 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                <Search size={15} className="text-[color:var(--ui-text-secondary)]" />
                <input
                  value={sectionDeviceSearch}
                  onChange={(event) => setSectionDeviceSearch(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[color:var(--ui-text-primary)] outline-none placeholder:text-[color:var(--ui-text-secondary)]"
                  placeholder={rt('searchDevice')}
                />
              </label>
              {selectedAddCount > 0 ? (
                <div className="mt-3 flex items-center justify-between gap-3 px-1">
                  <p className="truncate text-xs font-semibold text-[color:rgb(var(--ui-accent-rgb)/0.96)]">
                    {rt(selectedAddCount === 1 ? 'selectedOne' : 'selectedMany', { count: selectedAddCount })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSectionAddTargetIds({});
                      setSectionActionError(null);
                    }}
                    disabled={sectionActionBusy}
                    className="shrink-0 text-xs font-semibold text-[color:var(--ui-text-secondary)] transition-colors hover:text-[color:var(--ui-text-primary)] disabled:cursor-wait disabled:opacity-55"
                  >
                    {rt('clear')}
                  </button>
                </div>
              ) : null}
              <div className="mt-4 max-h-[42dvh] overflow-y-auto pr-1 glass-scrollbar">
                {visibleSectionAddCandidates.length > 0 ? (
                  <div className="grid gap-2">
                    {visibleSectionAddCandidates.map((target) => {
                      const areaLabel = target.areaId ? areaById.get(target.areaId)?.name ?? rt('otherRoom') : rt('noRoom');
                      const isSelected = Boolean(selectedSectionAddTargetIds[target.id]);
                      return (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => toggleSectionAddTargetSelection(target.id)}
                          disabled={sectionActionBusy}
                          aria-pressed={isSelected}
                          className={cn(
                            'flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left shadow-sm transition-all active:scale-[0.99] disabled:cursor-wait disabled:opacity-60',
                            isSelected
                              ? 'border-[color:rgb(var(--ui-accent-rgb)/0.6)] bg-[linear-gradient(135deg,rgb(var(--ui-accent-rgb)/0.22)_0%,rgb(var(--ui-accent-secondary-rgb)/0.14)_100%)] shadow-[0_12px_24px_var(--ui-shadow-soft)]'
                              : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] hover:bg-[color:var(--ui-surface-glass-strong)]',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                              isSelected
                                ? 'border-[color:rgb(var(--ui-accent-rgb)/0.54)] bg-[color:rgb(var(--ui-accent-rgb)/0.2)] text-[color:rgb(var(--ui-accent-rgb)/0.98)]'
                                : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-secondary)]',
                            )}
                          >
                            {renderSectionDeviceIcon(target)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-[color:var(--ui-text-primary)]">{target.name}</span>
                            {hasDistinctDeviceName(target) ? (
                              <span className="mt-0.5 block truncate text-xs font-semibold text-[color:var(--ui-text-primary)]">{target.deviceName}</span>
                            ) : null}
                            <span className="mt-0.5 block truncate text-[11px] font-semibold text-[color:var(--ui-text-secondary)]">
                              {areaLabel} - {target.subtitle}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                              isSelected
                                ? 'bg-[color:rgb(var(--ui-accent-rgb)/0.9)] text-slate-950'
                                : 'bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-secondary)]',
                            )}
                          >
                            {isSelected ? <Check size={14} strokeWidth={3} /> : <Plus size={16} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm font-bold text-[color:var(--ui-text-primary)]">{rt('noDevicesAvailable')}</p>
                    <p className="mt-1 text-xs font-semibold text-[color:var(--ui-text-secondary)]">
                      {rt('noDevicesSearchDescription')}
                    </p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!canAddSelectedTargets || !activeRoomTab) {
                    return;
                  }
                  const success = await assignSectionTargetsToArea(selectedSectionAddTargets, activeRoomTab.id);
                  if (success) {
                    setSelectedSectionAddTargetIds({});
                    setSectionDeviceSheetMode(null);
                  }
                }}
                disabled={!canAddSelectedTargets || sectionActionBusy}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[color:rgb(var(--ui-accent-rgb)/0.45)] bg-[linear-gradient(135deg,rgb(var(--ui-accent-rgb)/0.88)_0%,rgb(var(--ui-accent-secondary-rgb)/0.72)_100%)] px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_14px_30px_var(--ui-shadow-soft)] transition-all hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-[color:var(--ui-border)] disabled:bg-[color:var(--ui-surface-glass)] disabled:text-[color:var(--ui-text-secondary)] disabled:shadow-none disabled:brightness-100 disabled:opacity-60"
              >
                <Plus size={16} />
                {sectionActionBusy ? rt('adding') : addLabel}
              </button>
            </>
          ) : (
            <>
              <div className="text-center">
                <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-primary)] shadow-[0_12px_24px_var(--ui-shadow-soft)]">
                  <Move size={22} />
                </span>
                <h3 className="mt-3 text-lg font-bold tracking-normal text-[color:var(--ui-text-primary)]">{rt('move')}</h3>
                <p className="mt-0.5 text-sm font-medium text-[color:var(--ui-text-secondary)]">{rt(selectedCount === 1 ? 'selectedOne' : 'selectedMany', { count: selectedCount })}</p>
              </div>
              {selectedSectionTargets.length > 0 ? (
                <div className="mt-5 flex justify-center gap-2 overflow-hidden">
                  {selectedSectionTargets.slice(0, 3).map((target) => (
                    <div
                      key={target.id}
                      className="flex w-20 flex-col items-center gap-2 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] p-3 text-center shadow-sm"
                      title={hasDistinctDeviceName(target) ? `${target.name} - ${target.deviceName}` : target.name}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass-strong)] text-[color:var(--ui-text-secondary)]">
                        {renderSectionDeviceIcon(target)}
                      </span>
                      <span className="max-w-full truncate text-[11px] font-bold text-[color:var(--ui-text-primary)]">{target.name}</span>
                      {hasDistinctDeviceName(target) ? (
                        <span className="max-w-full truncate text-[10px] font-semibold text-[color:var(--ui-text-secondary)]">{target.deviceName}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-5 grid gap-2">
                {effectiveHaAreas.map((area) => {
                  const isCurrentRoom = area.area_id === activeRoomTab?.id;
                  const isSelectedArea = sectionMoveTargetAreaId === area.area_id;
                  return (
                    <button
                      key={area.area_id}
                      type="button"
                      onClick={() => {
                        if (!isCurrentRoom) {
                          setSectionMoveTargetAreaId(area.area_id);
                          setSectionActionError(null);
                        }
                      }}
                      disabled={isCurrentRoom || sectionActionBusy}
                      className={cn(
                        'rounded-full border px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.99] disabled:cursor-not-allowed',
                        isSelectedArea
                          ? 'border-[color:rgb(var(--ui-accent-rgb)/0.55)] bg-[linear-gradient(135deg,rgb(var(--ui-accent-rgb)/0.24)_0%,rgb(var(--ui-accent-secondary-rgb)/0.16)_100%)] text-[color:var(--ui-text-primary)]'
                          : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface-glass)] text-[color:var(--ui-text-secondary)] hover:bg-[color:var(--ui-surface-glass-strong)] hover:text-[color:var(--ui-text-primary)]',
                        isCurrentRoom && 'opacity-45',
                      )}
                    >
                      {area.name}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!canMove) {
                    setSectionActionError(rt('destinationRequired'));
                    return;
                  }
                  const success = await assignSectionTargetsToArea(selectedSectionTargets, sectionMoveTargetAreaId);
                  if (success) {
                    setSectionDeviceSheetMode(null);
                    setSectionMoveTargetAreaId('');
                  }
                }}
                disabled={!canMove || sectionActionBusy}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[color:rgb(var(--ui-accent-rgb)/0.45)] bg-[linear-gradient(135deg,rgb(var(--ui-accent-rgb)/0.88)_0%,rgb(var(--ui-accent-secondary-rgb)/0.72)_100%)] px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_14px_30px_var(--ui-shadow-soft)] transition-all hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:border-[color:var(--ui-border)] disabled:bg-[color:var(--ui-surface-glass)] disabled:text-[color:var(--ui-text-secondary)] disabled:shadow-none disabled:brightness-100 disabled:opacity-60"
              >
                <Move size={16} />
                {sectionActionBusy ? rt('moving') : moveLabel}
              </button>
            </>
          )}
          {sectionActionError ? <p className="mt-3 text-center text-xs font-semibold text-rose-400">{sectionActionError}</p> : null}
      </GlassBottomSheet>
    );
  };

  const renderSectionEditOverlay = () => {
    if (!canManageRooms || !editingRoomSection) {
      return null;
    }
    const selectedCount = selectedSectionTargets.length;
    const hasSelectedSectionTargets = selectedCount > 0;
    const sectionDeviceCount = sectionEditTargets.length;
    const defaultMoveAreaId =
      effectiveHaAreas.find((area) => area.area_id !== activeRoomTab?.id)?.area_id ?? '';
    const groupedSectionTargets = sectionEditTargets.filter((target) => target.entities.length > 1);
    const singleSectionTargets = sectionEditTargets.filter((target) => target.entities.length === 1);
    const hasGroupedAndSingleTargets = groupedSectionTargets.length > 0 && singleSectionTargets.length > 0;

    const renderSectionTargetEntry = (target: RoomSectionDeviceTarget) => {
      const isSelected = Boolean(selectedSectionTargetIds[target.id]);
      const isActionSelected = isSectionTargetSelectionMode && isSelected;
      const singleEntity = target.entities.length === 1 ? target.entities[0] : null;
      const targetVisibleCount = target.entities.filter((entity) => entity.isVisible).length;

      const sharedTargetHandlers = {
        role: 'button',
        tabIndex: 0,
        'aria-pressed': isSectionTargetSelectionMode ? isSelected : undefined,
        onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => beginSectionTargetLongPress(target.id, event),
        onPointerMove: updateSectionTargetLongPress,
        onPointerUp: clearSectionTargetLongPress,
        onPointerCancel: clearSectionTargetLongPress,
        onPointerLeave: clearSectionTargetLongPress,
        onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => {
          event.preventDefault();
          clearSectionTargetLongPress();
          startSectionTargetSelection(target.id);
        },
        onClick: () => {
          if (suppressNextSectionTargetClickRef.current === target.id) {
            suppressNextSectionTargetClickRef.current = null;
            return;
          }
          if (isSectionTargetSelectionMode) {
            toggleSectionTargetSelection(target.id);
          }
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (isSectionTargetSelectionMode) {
              toggleSectionTargetSelection(target.id);
            } else {
              startSectionTargetSelection(target.id);
            }
          }
        },
      };

      if (singleEntity) {
        return (
          <div
            key={target.id}
            {...sharedTargetHandlers}
            className={cn(
              'relative min-w-0 cursor-pointer overflow-hidden rounded-[1.35rem] text-left transition-all active:scale-[0.99]',
              isActionSelected && 'ring-2 ring-[#85adff]/70 ring-offset-2 ring-offset-[#05070d]',
            )}
          >
            {renderQuickEntityCard(singleEntity, target)}
          </div>
        );
      }

      return (
        <div
          key={target.id}
          {...sharedTargetHandlers}
          className={cn(
            'relative flex h-full min-w-0 cursor-pointer flex-col rounded-[1.5rem] border border-white/[0.075] bg-white/[0.025] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_42px_rgba(0,0,0,0.14)] transition-all active:scale-[0.99]',
            isActionSelected && 'ring-2 ring-[#85adff]/70 ring-offset-2 ring-offset-[#05070d]',
          )}
        >
          <div className="min-w-0 pr-8">
            <p className={cn('truncate text-base font-bold leading-tight text-white', isActionSelected && 'text-[#dfe6ff]')}>
              {formatGroupTitle(target.name)}
            </p>
            <p className="mt-1 truncate text-[11px] font-semibold leading-tight text-white/38">
              {hasDistinctDeviceName(target) ? `${target.deviceName} - ` : ''}
              {rt('visibleCount', { visible: targetVisibleCount, total: target.entities.length })} - {target.domains.map((domain) => formatDomainLabel(domain, rt)).join(' / ')}
            </p>
          </div>
          <div className="mt-3 min-w-0 border-t border-white/[0.08] pt-3">
            <div className="grid min-w-0 grid-cols-2 gap-2">
              {target.entities.map((entity) => renderQuickEntityCard(entity, target, { compact: true }))}
            </div>
          </div>
          {isSectionTargetSelectionMode && isSelected ? (
            <span
              className={cn(
                'absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full border transition-all',
                'border-white bg-white text-[#3d5afe]',
              )}
            >
              <Check size={13} strokeWidth={3} />
            </span>
          ) : null}
        </div>
      );
    };

    return (
      <div className="fixed inset-0 z-[260] overflow-hidden bg-[#05070d]/86 text-white backdrop-blur-3xl">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_28%,rgba(0,0,0,0.18))]" />
        <div className="relative z-10 flex h-full min-h-0 w-full flex-col p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-6 lg:p-8">
          <header className="relative flex shrink-0 items-start justify-center">
            {!isSectionTargetSelectionMode ? (
              <button
                type="button"
                onClick={() => setIsSectionInteractionGuideOpen((current) => !current)}
                aria-label={rt(isSectionInteractionGuideOpen ? 'hideGuide' : 'showGuide')}
                aria-expanded={isSectionInteractionGuideOpen}
                className="absolute left-0 top-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/58 transition-all hover:bg-white/10 hover:text-white active:scale-95"
              >
                <CircleHelp size={17} />
              </button>
            ) : null}
            <div className="min-w-0 text-center">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] text-white/82 shadow-sm backdrop-blur-xl">
                {isSectionTargetSelectionMode ? <Pencil size={20} /> : <Layers size={20} />}
              </span>
              <h2 className="mt-3 text-lg font-bold tracking-normal">
                {isSectionTargetSelectionMode ? rt('edit') : editingRoomSection.label}
              </h2>
              <p className="mt-0.5 text-sm font-medium text-white/38">
                {isSectionTargetSelectionMode
                  ? rt(selectedCount === 1 ? 'selectedOne' : 'selectedMany', { count: selectedCount })
                  : rt(sectionDeviceCount === 1 ? 'deviceCountOne' : 'deviceCountMany', { count: sectionDeviceCount })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearSectionTargetLongPress();
                setSelectedSectionTargetIds({});
                setSelectedSectionAddTargetIds({});
                setIsSectionTargetSelectionMode(false);
                setEditingRoomSection(null);
              }}
              disabled={sectionActionBusy}
              className="absolute right-0 top-0 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/10 active:scale-95 disabled:cursor-wait disabled:opacity-55"
            >
              {rt('done')}
            </button>
          </header>

          <AnimatePresence initial={false}>
            {!isSectionTargetSelectionMode && isSectionInteractionGuideOpen ? (
              <motion.div
                key="room-section-interaction-guide"
                initial={prefersReducedMotion ? false : { opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, height: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="mt-5 shrink-0 overflow-hidden"
              >
                <RoomSectionInteractionGuide onDismiss={() => setIsSectionInteractionGuideOpen(false)} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {isSectionTargetSelectionMode ? (
            <div className="mt-8 flex shrink-0 items-start justify-center gap-3 sm:gap-4">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setSectionDeviceSheetMode('add');
                    setSectionDeviceSearch('');
                    setSelectedSectionAddTargetIds({});
                    setSectionActionError(null);
                  }}
                  disabled={sectionActionBusy}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.07] text-white/78 transition-all hover:bg-white/[0.12] hover:text-white active:scale-95 disabled:cursor-wait disabled:opacity-55"
                  aria-label={rt('addDevice')}
                  title={rt('addDevice')}
                >
                  <Plus size={20} />
                </button>
                <span className="text-[10px] font-semibold leading-none text-white/48">{rt('add')}</span>
              </div>
              <span aria-hidden="true" className="mt-1 h-12 w-px bg-white/[0.08]" />
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={async () => {
                    if (!hasSelectedSectionTargets) {
                      setSectionActionError(rt('selectionRequired'));
                      return;
                    }
                    await assignSectionTargetsToArea(selectedSectionTargets, null);
                  }}
                  disabled={!hasSelectedSectionTargets || sectionActionBusy}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-red-400/10 bg-red-500/12 text-red-200 transition-all hover:bg-red-500/18 hover:text-red-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={rt('removeFromRoom')}
                  title={rt('removeFromRoom')}
                >
                  <Trash2 size={18} />
                </button>
                <span className={cn('text-[10px] font-semibold leading-none', hasSelectedSectionTargets ? 'text-red-100/58' : 'text-white/24')}>
                  {rt('remove')}
                </span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!hasSelectedSectionTargets) {
                      setSectionActionError(rt('selectionRequired'));
                      return;
                    }
                    setSectionDeviceSheetMode('move');
                    setSectionMoveTargetAreaId((current) => current || defaultMoveAreaId);
                    setSectionActionError(null);
                  }}
                  disabled={!hasSelectedSectionTargets || sectionActionBusy || effectiveHaAreas.length <= 1}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.07] text-white/78 transition-all hover:bg-white/[0.12] hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={rt('moveDevice')}
                  title={rt('moveDevice')}
                >
                  <Move size={18} />
                </button>
                <span className={cn('text-[10px] font-semibold leading-none', hasSelectedSectionTargets ? 'text-white/48' : 'text-white/24')}>
                  {rt('move')}
                </span>
              </div>
              <span aria-hidden="true" className="mt-1 h-12 w-px bg-white/[0.08]" />
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={cancelSectionTargetSelection}
                  disabled={sectionActionBusy}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.07] text-white/78 transition-all hover:bg-white/[0.12] hover:text-white active:scale-95 disabled:cursor-wait disabled:opacity-55"
                  aria-label={rt('cancelSelection')}
                  title={rt('cancelSelection')}
                >
                  <X size={18} />
                </button>
                <span className="text-[10px] font-semibold leading-none text-white/48">{rt('cancel')}</span>
              </div>
            </div>
          ) : null}
          {sectionActionError && !sectionDeviceSheetMode ? (
            <p className="mt-3 text-center text-xs font-semibold text-rose-200/82">{sectionActionError}</p>
          ) : null}

          <section
            className={cn(
              'mt-8 min-h-0 flex-1 overflow-y-auto overscroll-contain glass-scrollbar',
              isSectionTargetSelectionMode ? 'px-2 pb-2 sm:px-3' : 'pr-1',
            )}
          >
            <div className="mb-4 min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-white/36">
                {isSectionTargetSelectionMode ? `${activeRoomTitle} - ${editingRoomSection.label}` : activeRoomTitle}
              </p>
            </div>
            {sectionEditTargets.length > 0 ? (
              <div className="space-y-4">
                {groupedSectionTargets.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[repeat(auto-fill,minmax(24rem,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(27rem,1fr))]">
                    {groupedSectionTargets.map(renderSectionTargetEntry)}
                  </div>
                ) : null}
                {singleSectionTargets.length > 0 ? (
                  <div className={cn(hasGroupedAndSingleTargets && 'border-t border-white/[0.08] pt-4')}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
                      {singleSectionTargets.map(renderSectionTargetEntry)}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                className="flex min-h-[12rem] flex-col items-center justify-center px-4 py-8 text-center"
                onPointerDown={beginSectionActionLongPress}
                onPointerMove={updateSectionTargetLongPress}
                onPointerUp={clearSectionTargetLongPress}
                onPointerCancel={clearSectionTargetLongPress}
                onPointerLeave={clearSectionTargetLongPress}
              >
                <p className="text-sm font-semibold text-white/72">{rt('emptySection')}</p>
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-white/38">
                  {rt('emptySectionAction')}
                </p>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setSectionDeviceSheetMode('add');
                    setSectionDeviceSearch('');
                    setSelectedSectionAddTargetIds({});
                    setSectionActionError(null);
                  }}
                  disabled={sectionActionBusy}
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white/78 shadow-sm transition-all hover:bg-white/[0.1] hover:text-white active:scale-95 disabled:cursor-wait disabled:opacity-55"
                >
                  <Plus size={15} />
                  {rt('addDevice')}
                </button>
              </div>
            )}
          </section>
        </div>
        {renderSectionDeviceSheet()}
      </div>
    );
  };

  const isEditingRoom = editingRoom !== null;
  const isEditingHaRoom = editingRoom?.source === 'ha';
  const isRoomFormBusy = editingRoom?.source === 'ha'
    ? areaActionById[editingRoom.id] === 'saving'
    : isCreatingRoom;
  const canUseHaAreaForm = Boolean(canManageRooms && haConnected && onCallApi);
  const showAreaDetailsControl = canUseHaAreaForm && (!isEditingRoom || isEditingHaRoom);
  const roomFormTitle = isEditingRoom ? rt('editRoom') : rt('newRoom');
  const roomFormBadge = isEditingRoom
    ? isEditingHaRoom
      ? rt('areaHa')
      : rt('local')
    : canUseHaAreaForm
      ? rt('areaHa')
      : rt('local');
  const roomFormPrimaryLabel = isEditingRoom
    ? isRoomFormBusy
      ? rt('saving')
      : rt('save')
    : isRoomFormBusy
      ? rt('creating')
      : canUseHaAreaForm
      ? rt('create')
      : rt('add');

  const handleRoomTitlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = roomTitleScrollerRef.current;
    const target = event.target as Element | null;
    if (
      !scroller ||
      event.pointerType !== 'mouse' ||
      target?.closest('button, a, input, textarea, select, [role="button"]') ||
      (event.pointerType === 'mouse' && event.button !== 0) ||
      scroller.scrollWidth <= scroller.clientWidth + 1
    ) {
      return;
    }
    roomTitleDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: scroller.scrollLeft,
      didMove: false,
    };
    roomTitleSuppressClickRef.current = false;
    if (!scroller.hasPointerCapture(event.pointerId)) {
      scroller.setPointerCapture(event.pointerId);
    }
  };

  const handleRoomTitlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = roomTitleScrollerRef.current;
    const dragState = roomTitleDragRef.current;
    if (!scroller || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const dragOffset = event.clientX - dragState.startX;
    if (!dragState.didMove && Math.abs(dragOffset) < ROOM_TITLE_DRAG_THRESHOLD_PX) {
      return;
    }
    dragState.didMove = true;
    event.preventDefault();
    scroller.scrollLeft = dragState.scrollLeft - dragOffset;
    updateRoomTitleScrollEdges();
  };

  const handleRoomTitlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = roomTitleScrollerRef.current;
    const dragState = roomTitleDragRef.current;
    if (!scroller || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    roomTitleDragRef.current = null;
    roomTitleSuppressClickRef.current = dragState.didMove;
    if (scroller.hasPointerCapture(event.pointerId)) {
      scroller.releasePointerCapture(event.pointerId);
    }
    if (dragState.didMove) {
      window.setTimeout(() => {
        roomTitleSuppressClickRef.current = false;
      }, 0);
    }
  };

  const handleRoomTitleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!roomTitleSuppressClickRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    roomTitleSuppressClickRef.current = false;
  };

  const createRoomSwiperPointerHandlers = (
    scrollerRef: React.RefObject<HTMLDivElement | null>,
    dragRef: React.MutableRefObject<RoomSwiperDragState | null>,
    suppressClickRef: React.MutableRefObject<boolean>,
  ) => {
    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      const scroller = scrollerRef.current;
      const target = event.target as Element | null;
      if (
        !scroller ||
        target?.closest('button, a, input, textarea, select, [role="button"]') ||
        (event.pointerType === 'mouse' && event.button !== 0) ||
        scroller.scrollWidth <= scroller.clientWidth + 1
      ) {
        return;
      }
      cancelRoomSwiperAnimation(scroller);
      const slideWidth = Math.max(1, scroller.clientWidth);
      const slideCount = getRoomSwiperSlideCount(scroller);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: scroller.scrollLeft,
        didMove: false,
        startIndex: clampNumber(Math.round(scroller.scrollLeft / slideWidth), 0, slideCount - 1),
        startTime: event.timeStamp,
        slideCount,
        slideWidth,
      };
      suppressClickRef.current = false;
      if (!scroller.hasPointerCapture(event.pointerId)) {
        scroller.setPointerCapture(event.pointerId);
      }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      const scroller = scrollerRef.current;
      const dragState = dragRef.current;
      if (!scroller || !dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      if (!dragState.didMove) {
        const dragOffsetY = event.clientY - dragState.startY;
        const dragOffsetX = event.clientX - dragState.startX;
        if (Math.abs(dragOffsetX) < FLOOR_CAROUSEL_DRAG_THRESHOLD_PX) {
          return;
        }
        if (Math.abs(dragOffsetY) > Math.abs(dragOffsetX)) {
          dragRef.current = null;
          if (scroller.hasPointerCapture(event.pointerId)) {
            scroller.releasePointerCapture(event.pointerId);
          }
          return;
        }
        dragState.didMove = true;
        setRoomSwiperSnap(scroller, false);
      }
      event.preventDefault();
      const dragOffset = event.clientX - dragState.startX;
      const slideWidth = Math.max(1, scroller.clientWidth || dragState.slideWidth);
      const slideCount = getRoomSwiperSlideCount(scroller);
      const minIndex = Math.max(0, dragState.startIndex - 1);
      const maxIndex = Math.min(slideCount - 1, dragState.startIndex + 1);
      scroller.scrollLeft = clampNumber(
        dragState.scrollLeft - dragOffset,
        minIndex * slideWidth,
        maxIndex * slideWidth,
      );
    };

    const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
      const scroller = scrollerRef.current;
      const dragState = dragRef.current;
      if (!scroller || !dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      dragRef.current = null;
      suppressClickRef.current = dragState.didMove;
      if (scroller.hasPointerCapture(event.pointerId)) {
        scroller.releasePointerCapture(event.pointerId);
      }
      if (dragState.didMove) {
        const slideWidth = Math.max(1, scroller.clientWidth || dragState.slideWidth);
        const slideCount = getRoomSwiperSlideCount(scroller);
        const dragOffset = event.clientX - dragState.startX;
        const dragDuration = Math.max(1, event.timeStamp - dragState.startTime);
        const dragVelocity = dragOffset / dragDuration;
        const visualDelta = scroller.scrollLeft - dragState.scrollLeft;
        const distanceThreshold = clampNumber(
          slideWidth * 0.18,
          ROOM_SWIPER_MIN_SWIPE_DISTANCE_PX,
          ROOM_SWIPER_MAX_SWIPE_DISTANCE_PX,
        );
        const shouldChangeSlide =
          Math.abs(dragOffset) >= distanceThreshold ||
          Math.abs(dragVelocity) >= ROOM_SWIPER_FLICK_VELOCITY_PX_PER_MS ||
          Math.abs(visualDelta) >= slideWidth * 0.32;
        const direction = dragOffset < 0 || visualDelta > 0 ? 1 : -1;
        const slideIndex = shouldChangeSlide
          ? clampNumber(dragState.startIndex + direction, 0, slideCount - 1)
          : dragState.startIndex;
        scrollRoomSwiperToSlide(scroller, slideIndex, Boolean(prefersReducedMotion));
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      } else {
        setRoomSwiperSnap(scroller, true);
      }
    };

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
      const scroller = scrollerRef.current;
      if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) {
        return;
      }
      const absDeltaX = Math.abs(event.deltaX);
      const absDeltaY = Math.abs(event.deltaY);
      const horizontalDelta = absDeltaX >= absDeltaY ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (Math.abs(horizontalDelta) < 1 || (!event.shiftKey && absDeltaX < absDeltaY * 0.9)) {
        return;
      }
      event.preventDefault();
      const lockedUntil = roomSwiperWheelLocks.get(scroller) ?? 0;
      if (event.timeStamp < lockedUntil) {
        return;
      }
      const slideWidth = Math.max(1, scroller.clientWidth);
      const slideCount = getRoomSwiperSlideCount(scroller);
      const currentIndex = clampNumber(Math.round(scroller.scrollLeft / slideWidth), 0, slideCount - 1);
      const direction = horizontalDelta > 0 ? 1 : -1;
      const slideIndex = clampNumber(currentIndex + direction, 0, slideCount - 1);
      roomSwiperWheelLocks.set(scroller, event.timeStamp + ROOM_SWIPER_WHEEL_LOCK_MS);
      scrollRoomSwiperToSlide(scroller, slideIndex, Boolean(prefersReducedMotion));
    };

    const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
      if (!suppressClickRef.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
    };

    return {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
      onWheel: handleWheel,
      onClickCapture: handleClickCapture,
    };
  };

  const climateSwiperPointerHandlers = createRoomSwiperPointerHandlers(
    mobileClimateSwiperRef,
    climateSwiperDragRef,
    climateSwiperSuppressClickRef,
  );
  const mediaSwiperPointerHandlers = createRoomSwiperPointerHandlers(
    mediaSwiperRef,
    mediaSwiperDragRef,
    mediaSwiperSuppressClickRef,
  );

  const handleFloorCarouselPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const carousel = floorCarouselRef.current;
    if (!carousel || event.button !== 0 || isFloorCarouselInteractiveTarget(event.target)) {
      return;
    }
    floorCarouselDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: carousel.scrollLeft,
      didMove: false,
    };
  };

  const handleFloorCarouselPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const carousel = floorCarouselRef.current;
    const dragState = floorCarouselDragRef.current;
    if (!carousel || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const dragOffset = event.clientX - dragState.startX;
    if (!dragState.didMove && Math.abs(dragOffset) < FLOOR_CAROUSEL_DRAG_THRESHOLD_PX) {
      return;
    }
    if (!dragState.didMove && !carousel.hasPointerCapture(event.pointerId)) {
      carousel.setPointerCapture(event.pointerId);
    }
    dragState.didMove = true;
    carousel.scrollLeft = dragState.scrollLeft - dragOffset;
  };

  const handleFloorCarouselPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const carousel = floorCarouselRef.current;
    const dragState = floorCarouselDragRef.current;
    if (!carousel || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    floorCarouselDragRef.current = null;
    floorCarouselSuppressClickRef.current = dragState.didMove;
    if (carousel.hasPointerCapture(event.pointerId)) {
      carousel.releasePointerCapture(event.pointerId);
    }
    if (dragState.didMove) {
      window.setTimeout(() => {
        floorCarouselSuppressClickRef.current = false;
      }, 0);
    }
  };

  const mobileVisibleGridAreas = React.useMemo(() => {
    const areas: string[] = [];
    if (climateControlModel) {
      areas.push('clima');
    }
    if (lightsCluster || switchesCluster) {
      areas.push('lights_switches');
    }
    if (sensorsCluster) {
      areas.push('sensors');
    }
    if (mediaRoomWidget && mediaRoomWidgets.length > 0 && !showMediaBottomBar) {
      areas.push('media');
    }
    if (securityCluster) {
      areas.push('security_cams');
    }
    return areas;
  }, [
    climateControlModel,
    lightsCluster,
    mediaRoomWidget,
    mediaRoomWidgets.length,
    securityCluster,
    sensorsCluster,
    showMediaBottomBar,
    switchesCluster,
  ]);

  const roomsGridStyle = React.useMemo(
    () => getRoomsGridStructure(isMobileRoomsGrid, isAnyMediaActive, isSecurityAlert, showMediaBottomBar, mobileVisibleGridAreas),
    [isAnyMediaActive, isMobileRoomsGrid, isSecurityAlert, mobileVisibleGridAreas, showMediaBottomBar],
  );

  const renderFloorCard = (floor: HaFloorEntry) => {
    const isSelected = selectedFloorId === floor.floor_id;
    const isEditingFloor = editingFloorId === floor.floor_id;
    const floorAction = floorActionById[floor.floor_id];
    const floorError = floorErrorById[floor.floor_id];
    const floorRoomCount = roomCountByFloorId[floor.floor_id] ?? 0;
    const floorDraft = floorDraftById[floor.floor_id] ?? buildFloorDraft(floor);
    const floorIndex = effectiveHaFloors.findIndex((entry) => entry.floor_id === floor.floor_id);
    const canMoveFloorLeft = floorIndex > 0;
    const canMoveFloorRight = floorIndex >= 0 && floorIndex < effectiveHaFloors.length - 1;
    const FloorIcon = getFloorIcon(floor);

    return (
      <div
        key={floor.floor_id}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (floorCarouselSuppressClickRef.current) {
            return;
          }
          if (isEditingFloor) {
            return;
          }
          setSelectedFloorId(floor.floor_id);
          setIsFloorLayerOpen(false);
        }}
        onKeyDown={(event) => {
          if (isEditingFloor) {
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedFloorId(floor.floor_id);
            setIsFloorLayerOpen(false);
          }
        }}
        className={cn(FLOOR_CARD_CLASS, isSelected && 'border-white/20 bg-white/[0.08]')}
      >
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-white/36">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035]">
                  <FloorIcon size={14} />
                </span>
                <p className="text-[11px] uppercase tracking-[0.22em]">{rt('floor')}</p>
              </div>
              {isEditingFloor ? (
                <div
                  className="mt-3 space-y-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    value={floorDraft.name}
                    onChange={(event) =>
                      setFloorDraftById((current) => ({
                        ...current,
                        [floor.floor_id]: { ...floorDraft, name: event.target.value },
                      }))
                    }
                    className={ROOM_MODAL_INPUT_CLASS}
                    placeholder={rt('floorName')}
                    autoFocus
                  />
                  <input
                    value={floorDraft.aliases}
                    onChange={(event) =>
                      setFloorDraftById((current) => ({
                        ...current,
                        [floor.floor_id]: { ...floorDraft, aliases: event.target.value },
                      }))
                    }
                    className={ROOM_MODAL_INPUT_CLASS}
                    placeholder={rt('voiceAliases')}
                  />
                  <input
                    value={floorDraft.level}
                    inputMode="numeric"
                    onChange={(event) =>
                      setFloorDraftById((current) => ({
                        ...current,
                        [floor.floor_id]: { ...floorDraft, level: event.target.value },
                      }))
                    }
                    className={ROOM_MODAL_INPUT_CLASS}
                    placeholder={rt('floorLevel')}
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void saveHaFloor(floor.floor_id);
                      }}
                      disabled={floorAction === 'saving'}
                      className={ROOM_MODAL_PRIMARY_BUTTON_CLASS}
                    >
                      <Save size={14} />
                    {rt('save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingFloorId(null)}
                      disabled={floorAction === 'saving'}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/35 transition-all hover:bg-white/[0.06] hover:text-white active:scale-95"
                      aria-label={rt('cancelFloorEdit')}
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="mt-3 truncate text-2xl font-semibold tracking-normal text-white">{floor.name}</h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {typeof floor.level === 'number' ? (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/46">
                        Livello {floor.level}
                      </span>
                    ) : null}
                    {floor.aliases && floor.aliases.length > 0 ? (
                      <span className="max-w-full truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/46">
                        {floor.aliases.join(', ')}
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            {canManageRooms ? <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  startEditFloor(floor);
                }}
                disabled={Boolean(floorAction)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/30 transition-all hover:text-white/70 active:scale-95 disabled:cursor-wait disabled:opacity-45"
                aria-label={rt('editFloor')}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setFloorDeleteCandidate(floor);
                }}
                disabled={Boolean(floorAction)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-500/35 transition-all hover:text-red-500 active:scale-95 disabled:cursor-wait disabled:opacity-45"
                aria-label={rt('deleteFloor')}
              >
                <MinusCircle size={16} />
              </button>
            </div> : null}
          </div>
          {floorError ? <p className="mt-3 text-xs leading-relaxed text-rose-200/80">{floorError}</p> : null}
        </div>

        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-4xl font-semibold leading-none text-white/90">{floorRoomCount}</p>
            <p className="mt-1 text-xs font-medium text-white/36">{rt(floorRoomCount === 1 ? 'roomOne' : 'roomMany')}</p>
          </div>
          {canManageRooms ? <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void reorderHaFloor(floor.floor_id, -1);
                }}
                disabled={!canMoveFloorLeft || Boolean(floorAction)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.025] text-white/34 transition-all hover:bg-white/[0.06] hover:text-white/78 active:scale-95 disabled:cursor-not-allowed disabled:opacity-25"
                aria-label={rt('moveFloorLeft')}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void reorderHaFloor(floor.floor_id, 1);
                }}
                disabled={!canMoveFloorRight || Boolean(floorAction)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.025] text-white/34 transition-all hover:bg-white/[0.06] hover:text-white/78 active:scale-95 disabled:cursor-not-allowed disabled:opacity-25"
                aria-label={rt('moveFloorRight')}
              >
                <ChevronRight size={20} />
              </button>
          </div> : null}
        </div>
      </div>
    );
  };

  const isRoomsInitialLoading =
    isLoading || (haConnected && Boolean(onCallApi) && (!hasLoadedRegistryMetadata || !hasLoadedFloorMetadata));

  if (isRoomsInitialLoading) {
    return (
      <div className="rooms-dashboard dashboard-page-scroll" aria-busy="true">
        <div className="dashboard-page-content dashboard-page-content-wide flex min-h-[calc(100dvh-5rem)] items-center justify-center">
          <GlassLoader
            size="lg"
            label={rt('loadingRooms')}
            description={rt('syncingRooms')}
          />
        </div>
      </div>
    );
  }

  if (roomTabs.length === 0) {
    return (
      <div className="rooms-dashboard dashboard-page-scroll">
        <div className="dashboard-page-content dashboard-page-content-wide flex min-h-[calc(100dvh-5rem)] items-center justify-center px-4">
          <section className="dashboard-content-surface flex w-full max-w-xl flex-col items-center rounded-[2rem] px-6 py-10 text-center sm:px-10 sm:py-12">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-fill-tertiary)] text-[color:var(--ui-text-secondary)]">
              <House size={24} />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[color:var(--ui-text-primary)]">
                {rt('noRooms')}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[color:var(--ui-text-secondary)]">
                {rt('noRoomsDescription')}
            </p>
            <p className="mt-5 text-xs font-medium text-[color:var(--ui-text-tertiary)]">
              Crea o assegna le aree da Home Assistant, quindi torna qui per visualizzarle.
            </p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="rooms-dashboard dashboard-page-scroll" onScroll={handleRoomsPageScroll}>
      <div
        className={cn(
          'dashboard-page-content dashboard-page-content-wide min-w-0 max-w-full transform-gpu',
          isFloorLayerOpen ? FLOOR_LAYER_BACKGROUND_OPEN_CLASS : FLOOR_LAYER_BACKGROUND_CLOSED_CLASS,
        )}
      >
        <main className="relative z-10 min-w-0 max-w-full" style={roomsGridStyle}>
          <header
            data-testid="rooms-page-header"
            data-compact={isRoomsHeaderCompact ? 'true' : 'false'}
            className={cn('rooms-page-header w-full', isRoomsHeaderCompact && 'rooms-page-header-compact')}
            style={{ gridArea: 'header' }}
          >
            <div className="rooms-page-header-surface">
            <div className="flex min-w-0 items-baseline gap-3">
              <div className="flex min-w-0 flex-1 items-baseline">
                <h1
                  className="rooms-page-title dashboard-page-title relative max-w-[58%] shrink-0 truncate pl-1 sm:max-w-[48%] sm:pl-0 lg:max-w-[42%]"
                  aria-live="polite"
                  title={activeRoomTitle}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={activeRoomTitleKey}
                      className="block truncate will-change-transform"
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, filter: 'blur(3px)' }}
                      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -7, filter: 'blur(3px)' }}
                      transition={ROOM_TITLE_TRANSITION}
                    >
                      {activeRoomTitle}
                    </motion.span>
                  </AnimatePresence>
                </h1>
                <div
                  ref={roomTitleScrollerRef}
                  onPointerDown={handleRoomTitlePointerDown}
                  onPointerMove={handleRoomTitlePointerMove}
                  onPointerUp={handleRoomTitlePointerEnd}
                  onPointerCancel={handleRoomTitlePointerEnd}
                  onClickCapture={handleRoomTitleClickCapture}
                  onScroll={updateRoomTitleScrollEdges}
                  data-testid="rooms-title-scroller"
                  style={roomTitleMaskStyle}
                  className="ml-3 flex min-w-0 flex-1 cursor-default touch-auto select-none items-baseline overflow-x-auto overscroll-x-contain pb-1 pr-5 hide-scrollbar sm:pr-4"
                >
                  <nav aria-label={rt('selectRoom')} className="flex min-w-max items-center gap-1 sm:gap-2">
                    {roomTabs
                      .filter((tab) => tab.id !== activeRoomTab?.id)
                      .map((tab) => (
                        <RoomsTopTab
                          key={tab.id}
                          tab={tab}
                          isActive={false}
                          onClick={() => setActiveRoomId(tab.id)}
                        />
                      ))}
                  </nav>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFloorLayerOpen(true)}
                className={cn(
                  'liquid-glass-control inline-flex shrink-0 cursor-pointer items-center justify-center p-0 text-xs font-semibold tracking-tight transition-all active:scale-95 sm:w-auto sm:gap-1 sm:px-4',
                  isRoomsHeaderCompact ? 'h-9 w-9' : 'h-11 w-11',
                )}
                aria-label={rt('openFloors', { floor: currentFloorLabel })}
                title={currentFloorLabel}
              >
                <CurrentFloorIcon className="h-3.5 w-3.5 shrink-0 sm:h-3 sm:w-3" />
                <span className="hidden max-w-[12rem] truncate sm:inline lg:max-w-none">{currentFloorLabel}</span>
                <ChevronDown className="hidden h-3 w-3 text-[color:var(--ui-text-tertiary)] sm:block" />
              </button>
            </div>
            <div className="rooms-page-header-details" aria-hidden={isRoomsHeaderCompact}>
              <div className="min-h-0 overflow-hidden">
                <p className="mt-0.5 pl-1 text-xs font-medium text-[color:var(--ui-text-secondary)] sm:pl-0">
                  {roomAmbientSubtitle}
                </p>
                {roomStatusChips.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5 pl-1 sm:pl-0">
                    {roomStatusChips.map((chip) => (
                      <span
                        key={chip.id}
                        className={cn(
                          'rooms-chip inline-flex cursor-pointer items-center gap-2 rounded-full border border-[color:var(--ui-border)] px-3.5 py-1.5 shadow-sm transition-all duration-200 active:scale-95',
                          chip.className,
                        )}
                      >
                        {chip.icon}
                        <span className="flex select-none flex-col leading-none">
                          <span className="text-xs font-semibold tracking-tight text-[color:var(--ui-text-primary)]">{chip.label}</span>
                          <span className="mt-0.5 text-[10px] font-semibold tracking-tight text-[color:var(--ui-text-tertiary)]">{chip.status}</span>
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            </div>
          </header>

          {climateControlModel ? (
            <section
              className={cn(
                'relative min-h-0 min-w-0 max-w-full p-0',
                isCompactClimateControls
                  ? 'overflow-visible'
                  : 'overflow-visible lg:min-h-[min(540px,calc(100dvh-13rem))] xl:min-h-[min(600px,calc(100dvh-12rem))]',
              )}
              style={{ gridArea: 'clima' }}
            >
              {renderFloatingSectionEditButton({
                kind: 'widgets',
                id: 'clima',
                label: 'Clima',
                entityIds: getRoomSectionEntityIds('clima', activeBuckets),
              })}
              {isCompactClimateControls ? (
                <div className="-mx-1.5">
                  <div
                    ref={mobileClimateSwiperRef}
                    className={ROOM_SWIPER_SCROLLER_CLASS}
                    onScroll={handleMobileClimateScroll}
                    {...climateSwiperPointerHandlers}
                  >
                    {mobileClimateWidgets.map((widget) => (
                      <div key={widget.id} className="min-w-0 basis-full snap-center shrink-0 px-1.5">
                        <div className="h-[min(15rem,42dvh)] min-h-[13rem] min-w-0">
                          {renderRoomWidget(widget)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {mobileClimateWidgets.length > 1 ? (
                    <div className="mt-3 flex items-center justify-center gap-1.5">
                      {mobileClimateWidgets.map((widget, index) => {
                        const active = widget.entityId === climateEntityId;
                        return (
                          <button
                            key={widget.entityId}
                            type="button"
                            className={cn(
                              'h-1.5 rounded-full transition-all duration-200 active:scale-95',
                              active ? 'w-5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.28)]' : 'w-1.5 bg-white/28 hover:bg-white/48',
                            )}
                            onClick={() => {
                              setSelectedClimateEntityId(widget.entityId);
                              scrollToMobileClimateSlide(index);
                            }}
                            aria-label={rt('showItem', { name: widget.title })}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="-mx-1.5 h-full min-h-[min(540px,calc(100dvh-13rem))] min-w-0 overflow-visible xl:min-h-[min(600px,calc(100dvh-12rem))]">
                  <div
                    ref={mobileClimateSwiperRef}
                    className={cn(ROOM_SWIPER_SCROLLER_CLASS, 'h-full')}
                    onScroll={handleMobileClimateScroll}
                    {...climateSwiperPointerHandlers}
                  >
                    {climatePanelModels.map(({ entityId, model }) => (
                      <div key={entityId} className="min-w-0 basis-full snap-center shrink-0 px-1.5">
                        <div className="rooms-surface h-full min-h-[min(540px,calc(100dvh-13rem))] min-w-0 overflow-hidden xl:min-h-[min(600px,calc(100dvh-12rem))]">
                          <RoomClimateCard
                            climate={model}
                            onTogglePower={() => {
                              const nextMode =
                                model.isOn
                                  ? 'off'
                                  : model.hvacModes?.find((mode) => mode !== 'off') ?? 'heat';
                              void onCallService?.('climate', 'set_hvac_mode', {
                                entity_id: entityId,
                                hvac_mode: nextMode,
                              });
                            }}
                            onDecreaseTarget={() => {
                              void onCallService?.('climate', 'set_temperature', {
                                entity_id: entityId,
                                temperature: Math.max(
                                  model.minTemp,
                                  model.targetTemp - (model.targetTempStep ?? 0.5),
                                ),
                              });
                            }}
                            onIncreaseTarget={() => {
                              void onCallService?.('climate', 'set_temperature', {
                                entity_id: entityId,
                                temperature: Math.min(
                                  model.maxTemp,
                                  model.targetTemp + (model.targetTempStep ?? 0.5),
                                ),
                              });
                            }}
                            onAutoAdjust={() => {
                              void onCallService?.('climate', 'set_temperature', {
                                entity_id: entityId,
                                temperature: Math.round(model.currentTemp),
                              });
                            }}
                            onRefreshCurrent={() => undefined}
                            onSetTargetTemp={(value) => {
                              void onCallService?.('climate', 'set_temperature', {
                                entity_id: entityId,
                                temperature: value,
                              });
                            }}
                            onSetTargetRange={(low, high) => {
                              void onCallService?.('climate', 'set_temperature', {
                                entity_id: entityId,
                                target_temp_low: low,
                                target_temp_high: high,
                              });
                            }}
                            onSetMode={(mode) => {
                              void onCallService?.('climate', 'set_hvac_mode', {
                                entity_id: entityId,
                                hvac_mode: mode,
                              });
                            }}
                            onSetFanMode={(mode) => {
                              void onCallService?.('climate', 'set_fan_mode', {
                                entity_id: entityId,
                                fan_mode: mode,
                              });
                            }}
                            onSetPresetMode={(mode) => {
                              void onCallService?.('climate', 'set_preset_mode', {
                                entity_id: entityId,
                                preset_mode: mode,
                              });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {climatePanelModels.length > 1 ? (
                    <div className="mt-3 flex items-center justify-center gap-1.5">
                      {climatePanelModels.map(({ entityId, model }, index) => {
                        const active = entityId === climateEntityId;
                        return (
                          <button
                            key={entityId}
                            type="button"
                            className={cn(
                              'h-1.5 rounded-full transition-all duration-200 active:scale-95',
                              active ? 'w-5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.28)]' : 'w-1.5 bg-white/28 hover:bg-white/48',
                            )}
                            onClick={() => {
                              setSelectedClimateEntityId(entityId);
                              scrollToMobileClimateSlide(index);
                            }}
                            aria-label={rt('showItem', { name: model.name })}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          ) : (
            renderEmptyRoomArea(
              'clima',
              rt('noClimate'),
              rt('climateEmptyDescription'),
              undefined,
              {
                kind: 'widgets',
                id: 'clima',
                label: rt('climate'),
                entityIds: getRoomSectionEntityIds('clima', activeBuckets),
              },
            )
          )}

        {renderWidgetCluster(sensorsCluster, {
          sectionId: 'sensors',
          label: rt('sensors'),
          allEntityIds: getRoomSectionEntityIds('sensors', activeBuckets),
          gridArea: 'sensors',
          emptyTitle: rt('noSensors'),
          emptyDescription: rt('sensorsEmptyDescription'),
          previewLimit: resolveRoomSensorPreviewLimit(roomsGridBreakpoint),
        })}

        {renderWidgetCluster(securityCluster, {
          sectionId: 'security',
          label: rt('security'),
          allEntityIds: getRoomSectionEntityIds('security', activeBuckets),
          gridArea: 'security_cams',
          emptyTitle: rt('noSecurity'),
          emptyDescription: rt('securityEmptyDescription'),
        })}

        {lightsCluster || switchesCluster ? (
          <section
            className="flex min-w-0 flex-col gap-4 overflow-visible transition-[min-height] duration-300 ease-out xl:gap-5"
            style={{ gridArea: 'lights_switches', alignSelf: 'start' }}
          >
            {renderWidgetCluster(lightsCluster, {
              sectionId: 'lights',
              label: rt('lights'),
              allEntityIds: getRoomSectionEntityIds('lights', activeBuckets),
              suppressMobileEmpty: true,
            })}
            {renderWidgetCluster(switchesCluster, {
              sectionId: 'switches',
              label: rt('switches'),
              allEntityIds: getRoomSectionEntityIds('switches', activeBuckets),
              suppressMobileEmpty: true,
            })}
          </section>
        ) : !isMobileRoomsGrid ? (
          renderEmptyRoomArea(
            'lights_switches',
            rt('noLightsSwitches'),
            rt('lightsSwitchesDescription'),
            undefined,
            {
              kind: 'widgets',
              id: 'lights_switches',
              label: rt('lightsAndSwitches'),
              entityIds: getRoomSectionEntityIds('lights_switches', activeBuckets),
            },
          )
        ) : null}

        {renderMediaPlayerArea()}
        </main>
        {renderMobileBottomEmptySections()}
      </div>
      {renderSectionEditOverlay()}
      {renderMediaBottomBar()}
      {isFloorLayerOpen ? (
        <div className="fixed inset-0 z-[240] flex flex-col items-center justify-center bg-black/20 p-6 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsFloorLayerOpen(false)}
            className="fixed right-6 top-8 z-[241] rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/10 active:scale-95"
          >
            Fine
          </button>

          <div className="mb-2 w-full max-w-5xl px-12">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/40">{rt('floors')}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-white">{rt('chooseFloor')}</h2>
          </div>

          <div
            ref={floorCarouselRef}
            onPointerDown={handleFloorCarouselPointerDown}
            onPointerMove={handleFloorCarouselPointerMove}
            onPointerUp={handleFloorCarouselPointerEnd}
            onPointerCancel={handleFloorCarouselPointerEnd}
            className="scrollbar-none w-full select-none overflow-x-auto overscroll-x-contain px-6 py-8 scroll-smooth hide-scrollbar [scrollbar-width:none] [touch-action:pan-x] sm:px-10 lg:px-[max(3rem,calc((100vw-80rem)/2))]"
          >
            <div className="mx-auto flex w-max snap-x snap-mandatory items-center gap-6">
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (floorCarouselSuppressClickRef.current) {
                    return;
                  }
                  setSelectedFloorId('all');
                  setIsFloorLayerOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedFloorId('all');
                    setIsFloorLayerOpen(false);
                  }
                }}
                className={cn(FLOOR_CARD_CLASS, selectedFloorId === 'all' && 'border-white/20 bg-white/[0.08]')}
              >
                <div>
                  <div className="flex items-center gap-2 text-white/36">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035]">
                      <Layers size={14} />
                    </span>
                    <p className="text-[11px] uppercase tracking-[0.22em]">{rt('view')}</p>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold tracking-normal text-white">{rt('allFloors')}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/42">
                    {rt('allFloorsDescription')}
                  </p>
                </div>
                <div>
                  <p className="text-4xl font-semibold leading-none text-white/90">{allRoomTabs.length}</p>
                  <p className="mt-1 text-xs font-medium text-white/36">{rt(allRoomTabs.length === 1 ? 'roomOne' : 'roomMany')}</p>
                </div>
              </div>

              {effectiveHaFloors.map((floor) => renderFloorCard(floor))}

              {canManageRooms ? <div className={FLOOR_ADD_CARD_CLASS}>
                {isAddingFloor ? (
                  <div className="w-full" onClick={(event) => event.stopPropagation()}>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/36">{rt('newFloor')}</p>
                    <input
                      value={newFloorDraft.name}
                      onChange={(event) => {
                        setNewFloorDraft((current) => ({ ...current, name: event.target.value }));
                        setFloorCreateError(null);
                      }}
                      placeholder={rt('floorExample')}
                      className={cn(ROOM_MODAL_INPUT_CLASS, 'mt-3')}
                      autoFocus
                    />
                    <input
                      value={newFloorDraft.aliases}
                      onChange={(event) => {
                        setNewFloorDraft((current) => ({ ...current, aliases: event.target.value }));
                        setFloorCreateError(null);
                      }}
                      placeholder={rt('voiceAliases')}
                      className={cn(ROOM_MODAL_INPUT_CLASS, 'mt-2')}
                    />
                    <input
                      value={newFloorDraft.level}
                      inputMode="numeric"
                      onChange={(event) => {
                        setNewFloorDraft((current) => ({ ...current, level: event.target.value }));
                        setFloorCreateError(null);
                      }}
                      placeholder={rt('floorLevel')}
                      className={cn(ROOM_MODAL_INPUT_CLASS, 'mt-2')}
                    />
                    {floorCreateError ? (
                      <p className="mt-3 text-xs leading-relaxed text-rose-200/80">{floorCreateError}</p>
                    ) : null}
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void createHaFloor();
                        }}
                        disabled={isCreatingFloor}
                        className={ROOM_MODAL_PRIMARY_BUTTON_CLASS}
                      >
                        <Save size={14} />
                        {isCreatingFloor ? 'Creo...' : 'Crea'}
                      </button>
                      <button
                        type="button"
                        onClick={resetFloorCreateForm}
                        disabled={isCreatingFloor}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/35 transition-all hover:bg-white/[0.06] hover:text-white active:scale-95 disabled:cursor-wait disabled:opacity-45"
                        aria-label={rt('cancel')}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingFloor(true)}
                    className="flex h-full w-full flex-col items-center justify-center gap-3 text-center"
                  >
                    <Plus size={42} className="text-white/20 transition-all group-hover:scale-110 group-hover:text-white/60" />
                    <span className="text-xs font-medium text-white/30 transition-colors group-hover:text-white/60">
                      {rt('addFloor')}
                    </span>
                  </button>
                )}
              </div> : null}
            </div>
          </div>
          {canManageRooms ? (
            <button
              type="button"
              onClick={() => {
                setIsFloorLayerOpen(false);
                setIsManageOpen(true);
              }}
              className="mt-1 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/70 shadow-sm backdrop-blur-md transition-all hover:bg-white/[0.08] hover:text-white active:scale-95"
            >
              <Plus size={14} />
                {rt('manageRoomsAction')}
            </button>
          ) : null}
          {floorDeleteCandidate ? (
            <GlassModal
              isOpen
              onClose={() => setFloorDeleteCandidate(null)}
              eyebrow={rt('deleteFloorTitle')}
              title={floorDeleteCandidate.name}
              description={rt('deleteFloorDescription')}
              size="sm"
              zIndex={70}
              usePortal={false}
              showCloseButton={false}
              dismissible={floorActionById[floorDeleteCandidate.floor_id] !== 'deleting'}
              backdropClassName="bg-black/45 backdrop-blur-md"
              panelClassName="bg-[#1C1C1E]/70 shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
              bodyClassName="mt-3 overflow-visible"
              footerClassName="grid grid-cols-2"
              footer={
                <>
                  <button
                    type="button"
                    onClick={() => setFloorDeleteCandidate(null)}
                    disabled={floorActionById[floorDeleteCandidate.floor_id] === 'deleting'}
                    className="inline-flex min-w-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/70 transition-all hover:bg-white/[0.08] hover:text-white active:scale-95 disabled:cursor-wait disabled:opacity-50"
                  >
                  {rt('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void removeHaFloor(floorDeleteCandidate); }}
                    disabled={floorActionById[floorDeleteCandidate.floor_id] === 'deleting'}
                    className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-200 transition-all hover:bg-red-500/15 hover:text-red-100 active:scale-95 disabled:cursor-wait disabled:opacity-55"
                  >
                    <MinusCircle size={14} />
                  {floorActionById[floorDeleteCandidate.floor_id] === 'deleting' ? rt('deleting') : rt('delete')}
                  </button>
                </>
              }
            >
              {floorErrorById[floorDeleteCandidate.floor_id] ? (
                <p className="text-xs leading-relaxed text-rose-200/80">{floorErrorById[floorDeleteCandidate.floor_id]}</p>
              ) : null}
            </GlassModal>
          ) : null}
        </div>
      ) : null}
      {isManageOpen && canManageRooms ? (
        <div className="fixed inset-0 z-[280] flex items-stretch justify-stretch p-0 md:items-center md:justify-center md:p-8">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            onClick={() => setIsManageOpen(false)}
            aria-label={rt('closeRoomManagement')}
          />
          <section className="liquid-glass-panel relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border-0 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] md:h-[calc(100dvh-4rem)] md:max-h-[46rem] md:max-w-3xl md:rounded-[2rem] md:border md:p-6">
            <button
              type="button"
              onClick={() => setIsManageOpen(false)}
              className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition-all hover:bg-white/[0.06] hover:text-white active:scale-95"
              aria-label={rt('close')}
            >
              <X size={16} />
            </button>

            <div className="shrink-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/58">{rt('manageRooms')}</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{rt('roomCards')}</h2>
            </div>

            <div className="mt-4 max-h-[45dvh] shrink-0 overflow-y-auto overscroll-contain rounded-[1.5rem] border border-white/[0.06] bg-white/[0.025] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_48px_rgba(0,0,0,0.16)] backdrop-blur-2xl glass-scrollbar md:max-h-[min(42dvh,28rem)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-white/72">{roomFormTitle}</p>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/50 backdrop-blur-md">
                  {roomFormBadge}
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={newRoomName}
                  onChange={(event) => {
                    setNewRoomName(event.target.value);
                    setRoomCreateError(null);
                  }}
                  placeholder={rt('roomExample')}
                  className={cn(ROOM_MODAL_INPUT_CLASS, 'flex-1')}
                />
                <div className={cn('flex gap-2', isEditingRoom ? 'flex-row' : 'flex-col sm:flex-row')}>
                <button
                  type="button"
                  onClick={() => {
                    void submitRoomForm();
                  }}
                  disabled={isRoomFormBusy}
                  className={cn(ROOM_MODAL_PRIMARY_BUTTON_CLASS, isEditingRoom && 'flex-1')}
                >
                  {isEditingRoom ? <Save size={15} /> : <CirclePlus size={15} />}
                  {roomFormPrimaryLabel}
                </button>
                {isEditingRoom ? (
                  <button
                    type="button"
                    onClick={resetRoomForm}
                    disabled={isRoomFormBusy}
                    className={cn(ROOM_MODAL_SECONDARY_BUTTON_CLASS, 'flex-1')}
                  >
                    <X size={15} />
                    {rt('cancel')}
                  </button>
                ) : null}
                </div>
              </div>
              {showAreaDetailsControl ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsAreaCreateDetailsOpen((current) => !current)}
                    aria-expanded={isAreaCreateDetailsOpen}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-xs font-semibold text-white/62 backdrop-blur-md transition-all duration-200 hover:bg-white/[0.06] hover:text-white active:scale-95"
                  >
                    <ChevronRight
                      size={15}
                      className={cn('transition-transform', isAreaCreateDetailsOpen && 'rotate-90')}
                    />
                    {rt('areaDetails')}
                  </button>
                  {isAreaCreateDetailsOpen ? (
                    <div className="mt-3 grid gap-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="block min-w-0">
                          <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">{rt('floor')}</span>
                          <GlassDropdown
                            ariaLabel={rt('floor')}
                            options={[
                              { id: '', name: rt('noFloor') },
                              ...effectiveHaFloors.map<GlassDropdownOption>((floor) => ({ id: floor.floor_id, name: floor.name })),
                            ]}
                            selected={
                              areaCreationDraft.floorId
                                ? { id: areaCreationDraft.floorId, name: effectiveHaFloors.find((floor) => floor.floor_id === areaCreationDraft.floorId)?.name ?? areaCreationDraft.floorId }
                                : { id: '', name: rt('noFloor') }
                            }
                            onChange={(option) =>
                              setAreaCreationDraft((current) => ({ ...current, floorId: option.id }))
                            }
                            className="mt-1"
                          />
                        </div>
                        <label className="block min-w-0">
                          <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">{rt('icon')}</span>
                          <input
                            value={areaCreationDraft.icon}
                            onChange={(event) =>
                              setAreaCreationDraft((current) => ({ ...current, icon: event.target.value }))
                            }
                            placeholder="mdi:sofa"
                            className={cn(ROOM_MODAL_INPUT_CLASS, 'mt-1')}
                          />
                        </label>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block min-w-0">
                          <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">{rt('aliases')}</span>
                          <input
                            value={areaCreationDraft.aliases}
                            onChange={(event) =>
                              setAreaCreationDraft((current) => ({ ...current, aliases: event.target.value }))
                            }
                            placeholder="studio, ufficio"
                            className={cn(ROOM_MODAL_INPUT_CLASS, 'mt-1')}
                          />
                          <span className="mt-1 block text-xs leading-relaxed text-white/42">
                            {rt('aliasesDescription')}
                          </span>
                        </label>
                        <label className="block min-w-0">
                          <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">{rt('image')}</span>
                          <input
                            value={areaCreationDraft.picture}
                            onChange={(event) =>
                              setAreaCreationDraft((current) => ({ ...current, picture: event.target.value }))
                            }
                            placeholder="/local/rooms/studio.jpg"
                            className={cn(ROOM_MODAL_INPUT_CLASS, 'mt-1')}
                          />
                        </label>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block min-w-0">
                          <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">{rt('temperatureEntity')}</span>
                          <input
                            list="room-temperature-entities"
                            value={areaCreationDraft.temperatureEntityId}
                            onChange={(event) =>
                              setAreaCreationDraft((current) => ({
                                ...current,
                                temperatureEntityId: event.target.value,
                              }))
                            }
                            placeholder="sensor.studio_temperature"
                            className={cn(ROOM_MODAL_INPUT_CLASS, 'mt-1')}
                          />
                        </label>
                        <label className="block min-w-0">
                          <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">{rt('humidityEntity')}</span>
                          <input
                            list="room-humidity-entities"
                            value={areaCreationDraft.humidityEntityId}
                            onChange={(event) =>
                              setAreaCreationDraft((current) => ({
                                ...current,
                                humidityEntityId: event.target.value,
                              }))
                            }
                            placeholder="sensor.studio_humidity"
                            className={cn(ROOM_MODAL_INPUT_CLASS, 'mt-1')}
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
              {roomCreateError ? (
                <p className="mt-2 text-xs text-rose-100/80">{roomCreateError}</p>
              ) : (
                <p className="mt-2 text-xs text-white/42">
                  {isEditingRoom
                    ? isEditingHaRoom
                      ? rt('currentHaArea')
                      : rt('browserEditStorage')
                    : canUseHaAreaForm
                      ? isLoadingAreaMetadata
                              ? rt('loadingFloors')
                              : rt('roomSavedToHa')
                            : rt('roomSavedOffline')}
                </p>
              )}
            </div>

            {canUseHaAreaForm ? (
              <>
                <datalist id="room-temperature-entities">
                  {temperatureEntityOptions.map((entity) => (
                    <option key={entity.entityId} value={entity.entityId}>
                      {entity.name}
                    </option>
                  ))}
                </datalist>
                <datalist id="room-humidity-entities">
                  {humidityEntityOptions.map((entity) => (
                    <option key={entity.entityId} value={entity.entityId}>
                      {entity.name}
                    </option>
                  ))}
                </datalist>
              </>
            ) : null}

            <div className="mt-4 flex min-h-[11rem] flex-1 flex-col overflow-hidden sm:min-h-[14rem]">
              <div className="flex shrink-0 items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">{rt('existingRooms')}</p>
                <span className="text-xs text-white/40">{allRoomTabs.length}</span>
              </div>
              <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1 backdrop-blur-md">
                <div className="h-full min-h-0 overflow-y-auto glass-scrollbar">
                  {allRoomTabs.map((tab) => {
                    const isPersistedCustomRoom = persistedCustomRoomIds.has(tab.id);
                    const isDemoTab = tab.source === 'custom' && !isPersistedCustomRoom;
                    const isHaTab = tab.source === 'ha';
                    const haArea = isHaTab ? effectiveHaAreas.find((area) => area.area_id === tab.id) : null;
                    const areaAction = areaActionById[tab.id];
                    const areaError = areaErrorById[tab.id];
                    const isEditingThisRoom = editingRoom?.id === tab.id;
                    const rowClassName = cn(ROOM_MODAL_ROW_CLASS, isEditingThisRoom && 'bg-white/[0.035]');
                    if (isHaTab && haArea) {
                      return (
                        <div key={`manager-${tab.id}`} className={rowClassName}>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/42">{rt('haAreaShort')}</p>
                            <p className="truncate text-sm font-semibold text-white/92">{tab.name}</p>
                            {areaAction ? (
                              <p className="mt-1 text-xs text-white/38">
                            {areaAction === 'saving' ? rt('savingArea') : rt('deletingArea')}
                              </p>
                            ) : null}
                            {areaError ? <p className="mt-1 text-xs text-rose-200/80">{areaError}</p> : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditRoom(tab, haArea)}
                              disabled={Boolean(areaAction)}
                              className={cn(
                                'inline-flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-all hover:text-white/80 active:scale-95 disabled:cursor-wait disabled:opacity-45',
                                isEditingThisRoom && 'text-white/85',
                              )}
                              aria-label={rt('editHaArea')}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void removeHaArea(tab.id, haArea.name || tab.name);
                              }}
                              disabled={Boolean(areaAction)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/30 transition-all hover:text-red-400 active:scale-95 disabled:cursor-wait disabled:opacity-45"
                              aria-label={rt('deleteHaArea')}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={`manager-${tab.id}`} className={rowClassName}>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-white/42">
                            {isHaTab ? rt('haAreaShort') : isDemoTab ? rt('demo') : rt('local')}
                          </p>
                          <p className="truncate text-sm font-semibold text-white/92">{tab.name}</p>
                        </div>
                        {isDemoTab ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/52 backdrop-blur-md">
                            <Lock size={12} />
                            {rt('defaultRoom')}
                          </span>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditRoom(tab)}
                              className={cn(
                                'inline-flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-all hover:text-white/80 active:scale-95',
                                isEditingThisRoom && 'text-white/85',
                              )}
                              aria-label={rt('editRoom')}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCustomRoom(tab.id, tab.name)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/30 transition-all hover:text-red-400 active:scale-95"
                              aria-label={rt('deleteRoom')}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-4 hidden shrink-0 text-xs text-white/50 sm:block">
                {rt('roomStorageDescription')}
              </p>
            </div>
          </section>
        </div>
      ) : null}

      <CameraViewer
        isOpen={Boolean(activeCameraViewerEntityId)}
        cameras={roomCameraViewerItems}
        activeEntityId={activeCameraViewerEntityId}
        onActiveEntityChange={setActiveCameraViewerEntityId}
        onClose={() => setActiveCameraViewerEntityId(null)}
        commandsEnabled={haConnected && !isEditMode}
        onPtzMove={onCameraPtzMove}
        onPtzStop={onCameraPtzStop}
      />
    </div>
  );
}

export default RoomsDashboard;

