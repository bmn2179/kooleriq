import React, { useState } from 'react';
import {
  Check,
  CreditCard,
  Minus,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
} from 'lucide-react';
import { BillingCycle, PlanTier, SubscriptionState } from '../types/kooleriq';

interface PricingScreenProps {
  subscription: SubscriptionState;
  isAuthenticated: boolean;
  isSaving: boolean;
  onSelectPlan: (
    planTier: PlanTier,
    billingCycle: BillingCycle,
    doorQuota: number,
    storeCount: number
  ) => void;
  onSignInPrompt: () => void;
}

interface TierSpec {
  id: PlanTier;
  name: string;
  audience: string;
  monthlyUnitPrice: number;
  annualUnitPrice: number;
  unitLabel: string;
  defaultDoors: number;
  playChannel: string;
  summary: string;
  highlights: string[];
  featured?: boolean;
}

const TIERS: TierSpec[] = [
  {
    id: 'starter',
    name: 'Starter',
    audience: 'For single-door trials & independent operators',
    monthlyUnitPrice: 0,
    annualUnitPrice: 0,
    unitLabel: 'per store / mo',
    defaultDoors: 2,
    playChannel: 'Free on Google Play Store',
    summary: 'Core cooler planogram mapping and manual restock tracking on Android and web.',
    highlights: [
      'Up to 2 refrigerated cooler doors',
      '20 AI optical shelf audits per month',
      'Live temperature probe alerts (°F / °C)',
      'Walk-in backstock & CSV export',
    ],
  },
  {
    id: 'pro',
    name: 'Pro Operator',
    audience: 'For high-volume c-stores & route merchandisers',
    monthlyUnitPrice: 49,
    annualUnitPrice: 39,
    unitLabel: 'per door / mo',
    defaultDoors: 4,
    playChannel: 'Google Play Billing or Direct Invoice',
    summary: 'Unlimited AI camera audits, revenue swap recommendations, and live market grounding.',
    highlights: [
      'Up to 25 cooler doors per store',
      'Unlimited AI optical shelf audits',
      'Gemini Search market trend grounding',
      'Offline Android walk-in vault sync',
    ],
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise Fleet',
    audience: 'For multi-site chains & beverage distributors',
    monthlyUnitPrice: 119,
    annualUnitPrice: 95,
    unitLabel: 'per store / mo',
    defaultDoors: 20,
    playChannel: 'Managed Google Play Enterprise APK',
    summary: 'Fleet-wide planogram governance, POS velocity sync, and private Android deployment.',
    highlights: [
      'Unlimited stores & cooler doors',
      'Managed Google Play private distribution',
      'POS & route ERP velocity integration',
      'Custom compliance SLAs & role access',
    ],
  },
];

const COMPARISON_MATRIX: Array<{
  capability: string;
  starter: string;
  pro: string;
  enterprise: string;
}> = [
  {
    capability: 'Cooler Doors Included',
    starter: '2 doors max',
    pro: 'Up to 25 doors / store',
    enterprise: 'Unlimited doors',
  },
  {
    capability: 'AI Optical Shelf Audits',
    starter: '20 scans / month',
    pro: 'Unlimited scans',
    enterprise: 'Unlimited + batch fleet',
  },
  {
    capability: 'Gemini Search Grounding',
    starter: '5 queries / day',
    pro: 'Unlimited web grounding',
    enterprise: 'Unlimited + custom feeds',
  },
  {
    capability: 'Google Play Distribution',
    starter: 'Public Play Store app',
    pro: 'Play Store + Play Billing',
    enterprise: 'Managed Google Play MDM',
  },
  {
    capability: 'Offline Cooler Vault Mode',
    starter: 'Online only',
    pro: '48-hour offline queue',
    enterprise: '7-day multi-route cache',
  },
  {
    capability: 'Database & Telemetry Retention',
    starter: '14-day audit history',
    pro: '12-month Cloud SQL log',
    enterprise: '36-month fleet archive',
  },
];

export const PricingScreen: React.FC<PricingScreenProps> = ({
  subscription,
  isAuthenticated,
  isSaving,
  onSelectPlan,
  onSignInPrompt,
}) => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(subscription.billingCycle);
  const [doorCount, setDoorCount] = useState<number>(Math.max(4, subscription.doorQuota || 4));
  const [storeCount, setStoreCount] = useState<number>(Math.max(1, subscription.storeCount || 1));

  const getCalculatedPrice = (tier: TierSpec): number => {
    const unit =
      billingCycle === 'annual' ? tier.annualUnitPrice : tier.monthlyUnitPrice;
    if (tier.id === 'starter') return 0;
    if (tier.id === 'pro') return unit * doorCount * storeCount;
    return unit * storeCount;
  };

  return (
    <div className="space-y-6">
      {/* Google Play Availability & Distribution Banner */}
      <div className="glacier-glass rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#10B981]">
            <Smartphone className="w-4 h-4" />
            <span>GOOGLE PLAY RELEASE · ANDROID 10+ &amp; RETAIL HANDHELDS</span>
          </div>
          <h2 className="text-xl font-display font-bold text-[#DCE1FF]">
            Available on Google Play &amp; Web Telemetry Console
          </h2>
          <p className="text-sm text-[#BAC9CC] leading-relaxed">
            Deploy KoolerIQ directly to store managers and route merchandisers through the{' '}
            <span className="text-[#DCE1FF] font-medium">Google Play Store</span> or{' '}
            <span className="text-[#DCE1FF] font-medium">Managed Google Play</span> for Zebra
            and rugged Android scanners. Subscriptions sync seamlessly between Android Play
            Billing and <span className="font-mono-tabular text-[#00E5FF]">www.kooleriq.com</span>.
          </p>
        </div>

        {/* Google Play Store Badge Card */}
        <div className="rounded-xl bg-[#060D24] border border-white/15 p-4 flex items-center gap-4 shrink-0">
          <div className="w-11 h-11 rounded-lg bg-[#101F42] border border-[#00E5FF]/35 flex items-center justify-center shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3.6 2.3L14.2 12L3.6 21.7C3.2 21.3 3 20.8 3 20.2V3.8C3 3.2 3.2 2.7 3.6 2.3Z" fill="#00E5FF" />
              <path d="M17.8 8.7L14.2 12L17.8 15.3L21.3 13.3C22.2 12.8 22.2 11.2 21.3 10.7L17.8 8.7Z" fill="#FF9F1C" />
              <path d="M3.6 2.3L14.2 12L17.8 8.7L5.2 1.6C4.6 1.3 4 1.6 3.6 2.3Z" fill="#10B981" />
              <path d="M14.2 12L3.6 21.7C4 22.4 4.6 22.7 5.2 22.4L17.8 15.3L14.2 12Z" fill="#FF5A5F" />
            </svg>
          </div>
          <div>
            <div className="text-[11px] font-mono-tabular text-[#849396]">GET IT ON</div>
            <div className="text-base font-display font-bold text-[#DCE1FF]">Google Play</div>
            <div className="text-[11px] font-mono-tabular text-[#00E5FF] mt-0.5">
              com.kooleriq.telemetry · v2.4 Android
            </div>
          </div>
        </div>
      </div>

      {/* Billing Cadence & Fleet Estimator Controls */}
      <div className="glacier-card rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-[#BAC9CC]">Billing Cadence</span>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0A1128] border border-white/10">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                billingCycle === 'monthly'
                  ? 'bg-[#00E5FF] text-[#0A1128]'
                  : 'text-[#BAC9CC] hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                billingCycle === 'annual'
                  ? 'bg-[#00E5FF] text-[#0A1128]'
                  : 'text-[#BAC9CC] hover:text-white'
              }`}
            >
              Annual · Save 20%
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          {/* Cooler Doors Stepper */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[#BAC9CC]">Doors / Store</span>
            <button
              type="button"
              onClick={() => setDoorCount((d) => Math.max(1, d - 1))}
              className="min-h-[40px] min-w-[40px] rounded bg-[#0A1128] border border-white/15 flex items-center justify-center text-[#DCE1FF] hover:border-[#00E5FF]/50"
              aria-label="Decrease doors per store"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono-tabular text-sm font-bold text-[#DCE1FF] w-8 text-center">
              {doorCount}
            </span>
            <button
              type="button"
              onClick={() => setDoorCount((d) => Math.min(25, d + 1))}
              className="min-h-[40px] min-w-[40px] rounded bg-[#0A1128] border border-white/15 flex items-center justify-center text-[#DCE1FF] hover:border-[#00E5FF]/50"
              aria-label="Increase doors per store"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Store Count Stepper */}
          <div className="flex items-center gap-2.5">
            <Store className="w-4 h-4 text-[#00E5FF]" />
            <span className="text-xs text-[#BAC9CC]">Stores</span>
            <button
              type="button"
              onClick={() => setStoreCount((s) => Math.max(1, s - 1))}
              className="min-h-[40px] min-w-[40px] rounded bg-[#0A1128] border border-white/15 flex items-center justify-center text-[#DCE1FF] hover:border-[#00E5FF]/50"
              aria-label="Decrease store count"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono-tabular text-sm font-bold text-[#DCE1FF] w-8 text-center">
              {storeCount}
            </span>
            <button
              type="button"
              onClick={() => setStoreCount((s) => Math.min(100, s + 1))}
              className="min-h-[40px] min-w-[40px] rounded bg-[#0A1128] border border-white/15 flex items-center justify-center text-[#DCE1FF] hover:border-[#00E5FF]/50"
              aria-label="Increase store count"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3 Pricing Tier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        {TIERS.map((tier) => {
          const unitPrice =
            billingCycle === 'annual' ? tier.annualUnitPrice : tier.monthlyUnitPrice;
          const totalMonthly = getCalculatedPrice(tier);
          const isCurrentPlan = subscription.planTier === tier.id;

          return (
            <div
              key={tier.id}
              className={`rounded-xl p-5 flex flex-col justify-between transition-colors ${
                tier.featured
                  ? 'bg-[#14234B] border border-[#00E5FF]/60 shadow-[0_8px_32px_rgba(0,229,255,0.10)]'
                  : 'glacier-card'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-display font-bold text-[#DCE1FF]">{tier.name}</h3>
                  {tier.featured ? (
                    <span className="text-[11px] font-mono-tabular font-semibold text-[#00E5FF]">
                      RECOMMENDED
                    </span>
                  ) : isCurrentPlan ? (
                    <span className="text-[11px] font-mono-tabular font-semibold text-[#10B981]">
                      ACTIVE PLAN
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-[#BAC9CC] mt-1">{tier.audience}</p>

                <div className="mt-5 pb-4 border-b border-white/10">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-mono-tabular font-bold text-[#DCE1FF]">
                      ${unitPrice}
                    </span>
                    <span className="text-xs text-[#849396]">{tier.unitLabel}</span>
                  </div>
                  <div className="text-xs font-mono-tabular text-[#00E5FF] mt-1.5">
                    {tier.id === 'starter'
                      ? 'Free forever on Google Play'
                      : `Estimated total: $${totalMonthly.toLocaleString()}/mo (${storeCount} ${
                          storeCount === 1 ? 'store' : 'stores'
                        })`}
                  </div>
                  <div className="text-[11px] text-[#849396] mt-1">{tier.playChannel}</div>
                </div>

                <p className="text-xs text-[#BAC9CC] mt-4 leading-relaxed">{tier.summary}</p>

                <ul className="mt-4 space-y-2.5">
                  {tier.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-xs text-[#DCE1FF]">
                      <Check className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
                {isAuthenticated ? (
                  <button
                    type="button"
                    disabled={isSaving || (isCurrentPlan && subscription.billingCycle === billingCycle)}
                    onClick={() =>
                      onSelectPlan(
                        tier.id,
                        billingCycle,
                        tier.id === 'starter' ? 2 : doorCount,
                        storeCount
                      )
                    }
                    className={`w-full min-h-[44px] px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 ${
                      isCurrentPlan && subscription.billingCycle === billingCycle
                        ? 'bg-[#10B981]/15 border border-[#10B981]/50 text-[#A8FFD2]'
                        : tier.featured
                          ? 'bg-[#00E5FF] text-[#0A1128] hover:bg-[#33ECFF]'
                          : 'bg-[#00E5FF]/10 border border-[#00E5FF]/60 text-[#00E5FF] hover:bg-[#00E5FF]/20'
                    }`}
                  >
                    {isCurrentPlan && subscription.billingCycle === billingCycle ? (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Active ({billingCycle})
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        Activate {tier.name} via Google Play
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSignInPrompt}
                    className={`w-full min-h-[44px] px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 ${
                      tier.featured
                        ? 'bg-[#00E5FF] text-[#0A1128] hover:bg-[#33ECFF]'
                        : 'bg-[#00E5FF]/10 border border-[#00E5FF]/60 text-[#00E5FF] hover:bg-[#00E5FF]/20'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    Sign in with Google to Activate
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Concrete Capability & Limit Comparison Matrix */}
      <div className="glacier-card rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-base font-semibold text-[#DCE1FF]">
            Plan Limits &amp; Google Play Capability Matrix
          </h3>
          <p className="text-xs text-[#849396] mt-0.5">
            Exact operational quotas across web telemetry and Google Play Android handhelds
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#060D24] text-[11px] font-semibold text-[#849396] border-b border-white/10">
                <th className="py-3 px-5">Capability</th>
                <th className="py-3 px-5">Starter ($0)</th>
                <th className="py-3 px-5 text-[#00E5FF]">Pro Operator</th>
                <th className="py-3 px-5">Enterprise Fleet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-xs">
              {COMPARISON_MATRIX.map((row) => (
                <tr key={row.capability} className="hover:bg-white/[0.02]">
                  <td className="py-3.5 px-5 font-medium text-[#DCE1FF]">{row.capability}</td>
                  <td className="py-3.5 px-5 font-mono-tabular text-[#BAC9CC]">{row.starter}</td>
                  <td className="py-3.5 px-5 font-mono-tabular text-[#C3F5FF] font-semibold">
                    {row.pro}
                  </td>
                  <td className="py-3.5 px-5 font-mono-tabular text-[#BAC9CC]">
                    {row.enterprise}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
