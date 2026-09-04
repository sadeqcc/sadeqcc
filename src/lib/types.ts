export type ReconciliationStatus =
  | 'not_started'
  | 'draft'
  | 'matched'
  | 'has_differences'
  | 'needs_review'
  | 'finalized'
  | 'locked';

export type CashEntryKind =
  | 'principal'
  | 'debt'
  | 'commission'
  | 'amanat'
  | 'unregistered_sale'
  | 'duplicate_sale'
  | 'system_error';

export const CASH_ENTRY_KINDS: CashEntryKind[] = [
  'principal',
  'debt',
  'commission',
  'amanat',
  'unregistered_sale',
  'duplicate_sale',
  'system_error',
];

/** Which side of the equation a kind belongs to, and its sign. */
export const CASH_KIND_EFFECT: Record<CashEntryKind, { side: 'physical' | 'system'; sign: 1 | -1 }> = {
  principal: { side: 'physical', sign: 1 },
  debt: { side: 'physical', sign: 1 },
  commission: { side: 'physical', sign: 1 },
  amanat: { side: 'physical', sign: -1 },
  unregistered_sale: { side: 'physical', sign: -1 },
  duplicate_sale: { side: 'system', sign: -1 },
  system_error: { side: 'system', sign: -1 },
};

export type AdjustmentDirection = 'add_physical' | 'sub_physical' | 'add_system' | 'sub_system';

export const ADJUSTMENT_EFFECT: Record<AdjustmentDirection, { side: 'physical' | 'system'; sign: 1 | -1 }> = {
  add_physical: { side: 'physical', sign: 1 },
  sub_physical: { side: 'physical', sign: -1 },
  add_system: { side: 'system', sign: 1 },
  sub_system: { side: 'system', sign: -1 },
};

export type HolderType = 'ashraf' | 'person' | 'office' | 'factory' | 'goldsmith' | 'other';
export const HOLDER_TYPES: HolderType[] = ['ashraf', 'person', 'office', 'factory', 'goldsmith', 'other'];

/** 'out' = our gold held outside the drawer. 'in' = someone else's gold sitting with us. */
export type MovementDirection = 'out' | 'in';
export type MovementStatus = 'outstanding' | 'partially_returned' | 'returned' | 'overdue';

export type DifferenceReason =
  | 'unregistered_sale'
  | 'duplicate_entry'
  | 'counting_mistake'
  | 'customer_deposit'
  | 'debt'
  | 'commission'
  | 'gold_with_person'
  | 'borrowed_gold'
  | 'system_mistake'
  | 'other';

export const DIFFERENCE_REASONS: DifferenceReason[] = [
  'unregistered_sale',
  'duplicate_entry',
  'counting_mistake',
  'customer_deposit',
  'debt',
  'commission',
  'gold_with_person',
  'borrowed_gold',
  'system_mistake',
  'other',
];

export type MatchState = 'matched' | 'over' | 'short';

export interface CashEntry {
  id: string;
  ownerId: string;
  dayId: string;
  kind: CashEntryKind;
  amountFils: number;
  personName: string | null;
  description: string | null;
  refNo: string | null;
  entryDate: string;
  dueDate: string | null;
  note: string | null;
  attachmentId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface CashAdjustment {
  id: string;
  ownerId: string;
  dayId: string;
  name: string;
  amountFils: number;
  direction: AdjustmentDirection;
  note: string | null;
  entryDate: string;
  attachmentId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface GoldRow {
  id: string;
  ownerId: string;
  dayId: string;
  karat: string;
  systemMg: number;
  drawerMg: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface GoldMovement {
  id: string;
  ownerId: string;
  karat: string;
  direction: MovementDirection;
  holderType: HolderType;
  holderName: string;
  weightMg: number;
  returnedMg: number;
  deliveryDate: string;
  expectedReturnDate: string | null;
  returnedAt: string | null;
  reason: string | null;
  refNo: string | null;
  note: string | null;
  attachmentId: string | null;
  status: MovementStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface Denominations {
  [face: string]: number; // face value in fils -> quantity
}

export const AED_DENOMS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100]; // fils
export const AED_COINS = [100, 50, 25]; // 1 AED, 50 fils, 25 fils

export interface DayRecord {
  id: string;
  ownerId: string;
  date: string; // YYYY-MM-DD (Asia/Dubai business date)
  shift: string;
  status: ReconciliationStatus;
  employeeName: string | null;
  systemCashFils: number | null;
  physicalMode: 'total' | 'count';
  physicalCashFils: number;
  denominations: Denominations;
  notes: string | null;
  differenceReasons: DifferenceReason[];
  reasonText: string | null;
  snapshot: unknown | null;
  engineVersion: string | null;
  startedAt: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface Person {
  id: string;
  ownerId: string;
  name: string;
  type: HolderType;
  phone: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface LocationRow {
  id: string;
  ownerId: string;
  name: string;
  kind: string;
  note: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt: string | null;
}

export interface AuditLog {
  id: string;
  ownerId: string;
  entity: string;
  entityId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  actor: string;
  reason: string | null;
  createdAt: string;
}

export interface AppSettings {
  language: 'ar' | 'en';
  theme: 'dark' | 'light';
  palette: 'black_gold' | 'navy_gold' | 'white_gold' | 'emerald' | 'burgundy' | 'high_contrast';
  employeeName: string;
  shopName: string;
  currency: string;
  timezone: string;
  cashDecimals: number;
  goldDecimals: number;
  goldPrecision: 1 | 10 | 100; // milligram step
  karats: string[];
  tolerances: Record<string, number>; // karat -> mg
  cashTolerance: number; // fils
  pinEnabled: boolean;
  tipsEnabled: boolean;
  alertsEnabled: boolean;
  multiShift: boolean;
  autoBackup: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'ar',
  theme: 'dark',
  palette: 'black_gold',
  employeeName: '',
  shopName: '',
  currency: 'AED',
  timezone: 'Asia/Dubai',
  cashDecimals: 2,
  goldDecimals: 3,
  goldPrecision: 1,
  karats: ['995', '22K', '21K', '18K', '16K', '14K'],
  tolerances: {},
  cashTolerance: 0,
  pinEnabled: false,
  tipsEnabled: true,
  alertsEnabled: true,
  multiShift: false,
  autoBackup: true,
};
