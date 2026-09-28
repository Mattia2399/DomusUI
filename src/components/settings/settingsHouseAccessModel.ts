export type HouseAccessView = 'overview' | 'members' | 'guest' | 'share';

export const HOUSE_ACCESS_ROUTE = '/settings/access';

/** Each house access subpage has its own route, so it gets the standard page header. */
export const HOUSE_ACCESS_VIEW_ROUTES: Record<HouseAccessView, string> = {
  overview: HOUSE_ACCESS_ROUTE,
  members: `${HOUSE_ACCESS_ROUTE}/members`,
  guest: `${HOUSE_ACCESS_ROUTE}/guests`,
  share: `${HOUSE_ACCESS_ROUTE}/sharing`,
};

export function resolveHouseAccessView(path: string): HouseAccessView | null {
  const match = (Object.entries(HOUSE_ACCESS_VIEW_ROUTES) as [HouseAccessView, string][]).find(
    ([, route]) => route === path,
  );
  return match ? match[0] : null;
}

export type ProfileHouseMember = {
  id: string;
  name: string;
  userId?: string;
  /** The Home Assistant `person.*` entity; absent for a login with no person. */
  personEntityId?: string;
  /** Whether the member can sign in to Home Assistant. */
  hasAccount?: boolean;
  /** `false` for people defined in configuration.yaml (read-only in the UI). */
  personEditable?: boolean;
  avatarUrl?: string;
  roleLabel?: string;
  isCurrent?: boolean;
};

/** Link or unlink a Home Assistant login and a person (administrators only). */
export type PersonAccountLinking = {
  link: (personEntityId: string, userId: string) => Promise<void>;
  unlink: (personEntityId: string) => Promise<void>;
};

export const DASHBOARD_SHARE_SCHEMA = 'ha-dashboard-builder-role-share';
export const DASHBOARD_SHARE_VERSION = 1;

export type DashboardShareRoleKey = 'creator' | 'admin' | 'member';

export type DashboardRoleSharePayload = {
  schema: typeof DASHBOARD_SHARE_SCHEMA;
  version: typeof DASHBOARD_SHARE_VERSION;
  roleKey: DashboardShareRoleKey;
  roleLabel: string;
  createdAt: string;
  createdBy?: string;
  data: unknown;
};

function normalizeRoleToken(value: string | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function resolveDashboardShareRoleKey(
  value: string | undefined,
): DashboardShareRoleKey {
  const normalized = normalizeRoleToken(value);
  if (
    normalized.includes('creator') ||
    normalized.includes('creatore') ||
    normalized.includes('owner')
  ) {
    return 'creator';
  }
  if (normalized.includes('admin')) {
    return 'admin';
  }
  return 'member';
}

export function resolveDashboardShareRoleLabel(roleKey: DashboardShareRoleKey) {
  if (roleKey === 'creator') {
    return 'Creatore';
  }
  if (roleKey === 'admin') {
    return 'Admin';
  }
  return 'Membro';
}

export function normalizeHouseMembers(houseMembers: readonly ProfileHouseMember[]) {
  return houseMembers
    .reduce<ProfileHouseMember[]>((collection, member) => {
      const memberId = typeof member.id === 'string' ? member.id.trim() : '';
      const memberName = typeof member.name === 'string' ? member.name.trim() : '';
      if (!memberId || !memberName || collection.some((entry) => entry.id === memberId)) {
        return collection;
      }
      collection.push({
        id: memberId,
        name: memberName,
        userId: typeof member.userId === 'string' ? member.userId.trim() : undefined,
        personEntityId:
          typeof member.personEntityId === 'string' ? member.personEntityId.trim() : undefined,
        hasAccount: member.hasAccount,
        personEditable: member.personEditable,
        avatarUrl: typeof member.avatarUrl === 'string' ? member.avatarUrl.trim() : undefined,
        roleLabel: typeof member.roleLabel === 'string' ? member.roleLabel.trim() : undefined,
        isCurrent: member.isCurrent === true,
      });
      return collection;
    }, [])
    .sort((first, second) => {
      if (first.isCurrent === true && second.isCurrent !== true) {
        return -1;
      }
      if (second.isCurrent === true && first.isCurrent !== true) {
        return 1;
      }
      return first.name.localeCompare(second.name, 'it-IT');
    });
}

function decodeBase64Utf8(value: string) {
  try {
    if (typeof window === 'undefined' || !window.atob) {
      return null;
    }
    const binary = window.atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function parseDashboardRoleSharePayloadJson(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Partial<DashboardRoleSharePayload>;
    if (
      parsed.schema !== DASHBOARD_SHARE_SCHEMA ||
      parsed.version !== DASHBOARD_SHARE_VERSION ||
      (parsed.roleKey !== 'creator' &&
        parsed.roleKey !== 'admin' &&
        parsed.roleKey !== 'member') ||
      typeof parsed.roleLabel !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      parsed.data === undefined
    ) {
      return null;
    }
    return parsed as DashboardRoleSharePayload;
  } catch {
    return null;
  }
}

export function parseDashboardRoleSharePayload(rawValue: string) {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) {
    return null;
  }

  const parsedPlainJson = parseDashboardRoleSharePayloadJson(trimmedValue);
  if (parsedPlainJson) {
    return parsedPlainJson;
  }

  const decoded = decodeBase64Utf8(trimmedValue);
  return decoded ? parseDashboardRoleSharePayloadJson(decoded) : null;
}

export function createDashboardRoleSharePayload(params: {
  roleKey: DashboardShareRoleKey;
  roleLabel: string;
  createdBy?: string;
  data: unknown;
  createdAt?: string;
}): DashboardRoleSharePayload {
  return {
    schema: DASHBOARD_SHARE_SCHEMA,
    version: DASHBOARD_SHARE_VERSION,
    roleKey: params.roleKey,
    roleLabel: params.roleLabel,
    createdAt: params.createdAt ?? new Date().toISOString(),
    createdBy: params.createdBy,
    data: params.data,
  };
}
