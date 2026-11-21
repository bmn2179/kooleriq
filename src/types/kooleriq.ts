export type NavTab = 'planogram' | 'audit' | 'insights' | 'inventory' | 'pricing' | 'settings';

export type BrandId =
  | 'monster'
  | 'celsius'
  | 'redbull'
  | 'coca-cola'
  | 'gatorade'
  | 'liquid-death'
  | 'starbucks';

export type ContainerType = 'can' | 'tall-can' | 'bottle' | 'glass-bottle';

export type FacingStatus = 'optimal' | 'low' | 'oos' | 'violation';

export interface SkuItem {
  id: string;
  skuCode: string;
  name: string;
  shortName: string;
  brand: BrandId;
  brandLabel: string;
  brandColor: string;
  size: string;
  containerType: ContainerType;
  price: number;
  weeklyVelocity: number;
  marginPct: number;
  backroomQty: number;
  parLevel: number;
  primaryColor: string;
  secondaryColor: string;
  capColor: string;
}

export interface AiRecommendation {
  targetSkuId: string;
  projectedLiftPct: number;
  weeklyDollarGain: number;
  reason: string;
  confidence: number;
  applied?: boolean;
}

export interface FacingSlot {
  id: string;
  coord: string;
  shelfIndex: number;
  facingIndex: number;
  skuId: string;
  plannedSkuId: string;
  currentDepth: number;
  maxDepth: number;
  status: FacingStatus;
  aiRecommendation?: AiRecommendation;
}

export interface CoolerDoor {
  id: string;
  number: string;
  label: string;
  category: string;
  tempF: number;
  targetTempF: number;
  humidityPct: number;
  doorOpensToday: number;
  lastAuditAt: string;
  compressorState: 'nominal' | 'defrost' | 'warning';
  shelves: FacingSlot[][];
}

export interface AuditRecord {
  id: string;
  doorId: string;
  doorLabel: string;
  timestamp: string;
  compliancePct: number;
  facingsDetected: number;
  totalFacings: number;
  oosCount: number;
  aiConfidence: number;
  status: 'verified' | 'synced';
  summary: string;
}

export interface InsightItem {
  id: string;
  doorId: string;
  doorLabel: string;
  slotId: string;
  slotCoord: string;
  currentSkuId: string;
  recommendedSkuId: string;
  projectedLiftPct: number;
  weeklyDollarGain: number;
  confidence: number;
  rationale: string;
  status: 'pending' | 'applied' | 'dismissed';
}

export interface StoreSettings {
  storeName: string;
  storeCode: string;
  address: string;
  routeId: string;
  tempUnit: 'F' | 'C';
  lowStockThresholdPct: number;
  minTempAlertF: number;
  maxTempAlertF: number;
  aiConfidenceMin: number;
  autoRestockSync: boolean;
  cameraGridOverlay: boolean;
}

export type PlanTier = 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'annual';

export interface SubscriptionState {
  planTier: PlanTier;
  billingCycle: BillingCycle;
  doorQuota: number;
  storeCount: number;
  googlePlayLinked: boolean;
  status: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'model';
  modelUsed: string;
  content: string;
  sources?: GroundingSource[];
  createdAt?: string;
}
