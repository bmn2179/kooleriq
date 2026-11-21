import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  Bot,
  Camera,
  CreditCard,
  LayoutGrid,
  LogIn,
  LogOut,
  Package,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { AuditScreen } from './components/AuditScreen';
import { InsightsScreen } from './components/InsightsScreen';
import { InventoryScreen } from './components/InventoryScreen';
import { PlanogramScreen } from './components/PlanogramScreen';
import { PricingScreen } from './components/PricingScreen';
import { SettingsScreen } from './components/SettingsScreen';
import {
  INITIAL_AUDITS,
  INITIAL_DOORS,
  INITIAL_INSIGHTS,
  INITIAL_SETTINGS,
  SKU_CATALOG,
} from './data/mockStoreData';
import { auth, googleAuthProvider } from './lib/firebase';
import {
  AuditRecord,
  BillingCycle,
  ChatMessageItem,
  CoolerDoor,
  InsightItem,
  NavTab,
  PlanTier,
  SkuItem,
  StoreSettings,
  SubscriptionState,
} from './types/kooleriq';
import { formatTemp, getDoorMetrics } from './utils/formatters';

function cloneDoors(doors: CoolerDoor[]): CoolerDoor[] {
  return doors.map((d) => ({
    ...d,
    shelves: d.shelves.map((shelf) =>
      shelf.map((slot) => ({
        ...slot,
        aiRecommendation: slot.aiRecommendation ? { ...slot.aiRecommendation } : undefined,
      }))
    ),
  }));
}

function cloneCatalog(cat: Record<string, SkuItem>): Record<string, SkuItem> {
  const copy: Record<string, SkuItem> = {};
  for (const key of Object.keys(cat)) {
    copy[key] = { ...cat[key] };
  }
  return copy;
}

const DEFAULT_SUBSCRIPTION: SubscriptionState = {
  planTier: 'starter',
  billingCycle: 'monthly',
  doorQuota: 2,
  storeCount: 1,
  googlePlayLinked: true,
  status: 'active',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('planogram');
  const [doors, setDoors] = useState<CoolerDoor[]>(() => cloneDoors(INITIAL_DOORS));
  const [skuCatalog, setSkuCatalog] = useState<Record<string, SkuItem>>(() =>
    cloneCatalog(SKU_CATALOG)
  );
  const [insights, setInsights] = useState<InsightItem[]>(() =>
    INITIAL_INSIGHTS.map((i) => ({ ...i }))
  );
  const [audits, setAudits] = useState<AuditRecord[]>(() =>
    INITIAL_AUDITS.map((a) => ({ ...a }))
  );
  const [settings, setSettings] = useState<StoreSettings>({ ...INITIAL_SETTINGS });
  const [subscription, setSubscription] = useState<SubscriptionState>({ ...DEFAULT_SUBSCRIPTION });
  const [selectedDoorId, setSelectedDoorId] = useState<string>('door-01');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Firebase Auth state (token kept strictly in React memory)
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [isSavingPlan, setIsSavingPlan] = useState<boolean>(false);
  const workspaceLoadedRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<number | null>(null);

  // Gemini Multi-Turn Copilot state
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatSending, setChatSending] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Load persisted workspace, subscription, and chat history from Cloud SQL
  const hydrateFromCloudSql = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/workspace', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();

      if (data.workspace) {
        if (Array.isArray(data.workspace.doorsJson)) setDoors(data.workspace.doorsJson);
        if (data.workspace.catalogJson) setSkuCatalog(data.workspace.catalogJson);
        if (Array.isArray(data.workspace.insightsJson)) setInsights(data.workspace.insightsJson);
        if (Array.isArray(data.workspace.auditsJson)) setAudits(data.workspace.auditsJson);
        if (data.workspace.settingsJson) setSettings(data.workspace.settingsJson);
      }

      if (data.subscription) {
        setSubscription({
          planTier: data.subscription.planTier || 'starter',
          billingCycle: data.subscription.billingCycle || 'monthly',
          doorQuota: data.subscription.doorQuota || 2,
          storeCount: data.subscription.storeCount || 1,
          googlePlayLinked: Boolean(data.subscription.googlePlayLinked),
          status: data.subscription.status || 'active',
        });
      }

      if (Array.isArray(data.chatHistory)) {
        setChatMessages(
          data.chatHistory.map(
            (m: {
              id: number;
              role: 'user' | 'model';
              modelUsed: string;
              content: string;
              sourcesJson?: Array<{ title: string; uri: string }>;
            }) => ({
              id: String(m.id),
              role: m.role,
              modelUsed: m.modelUsed,
              content: m.content,
              sources: Array.isArray(m.sourcesJson) ? m.sourcesJson : undefined,
            })
          )
        );
      }
      workspaceLoadedRef.current = true;
    } catch {
      // Leave default state active if workspace hydration fails transiently
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        try {
          const token = await user.getIdToken();
          setAuthToken(token);
          await hydrateFromCloudSql(token);
        } catch {
          setAuthToken(null);
        }
      } else {
        setAuthToken(null);
        workspaceLoadedRef.current = false;
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [hydrateFromCloudSql]);

  // Debounced auto-save to Cloud SQL whenever authenticated user modifies cooler workspace
  useEffect(() => {
    if (!authUser || !authToken || !workspaceLoadedRef.current) return;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      try {
        const freshToken = await authUser.getIdToken();
        setAuthToken(freshToken);
        await fetch('/api/workspace', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`,
          },
          body: JSON.stringify({
            storeName: settings.storeName,
            storeCode: settings.storeCode,
            doorsJson: doors,
            catalogJson: skuCatalog,
            insightsJson: insights,
            auditsJson: audits,
            settingsJson: settings,
          }),
        });
      } catch {
        // Non-blocking background sync
      }
    }, 900);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [authUser, authToken, doors, skuCatalog, insights, audits, settings]);

  const handleGoogleSignIn = async () => {
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = await cred.user.getIdToken();
      setAuthToken(token);
      workspaceLoadedRef.current = true;
      await hydrateFromCloudSql(token);
      showToast(`Signed in as ${cred.user.email}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in was cancelled.';
      showToast(message);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setAuthToken(null);
    workspaceLoadedRef.current = false;
    setSubscription({ ...DEFAULT_SUBSCRIPTION });
    setChatMessages([]);
    showToast('Signed out.');
  };

  const handleSelectPlan = async (
    planTier: PlanTier,
    billingCycle: BillingCycle,
    doorQuota: number,
    storeCount: number
  ) => {
    if (!authUser) {
      await handleGoogleSignIn();
      return;
    }

    setIsSavingPlan(true);
    try {
      const token = await authUser.getIdToken();
      setAuthToken(token);
      const res = await fetch('/api/subscription', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planTier,
          billingCycle,
          doorQuota,
          storeCount,
          googlePlayLinked: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update subscription.');
      }
      setSubscription({
        planTier: data.subscription.planTier,
        billingCycle: data.subscription.billingCycle,
        doorQuota: data.subscription.doorQuota,
        storeCount: data.subscription.storeCount,
        googlePlayLinked: data.subscription.googlePlayLinked,
        status: data.subscription.status,
      });
      showToast(
        `Activated ${planTier.toUpperCase()} (${billingCycle}) linked to Google Play.`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save plan.');
    } finally {
      setIsSavingPlan(false);
    }
  };

  const storeContextSummary = useMemo(() => {
    return doors
      .map((door) => {
        const m = getDoorMetrics(door);
        const oosCoords = door.shelves
          .flat()
          .filter((s) => s.currentDepth === 0)
          .map((s) => `${s.coord} (${skuCatalog[s.skuId]?.shortName})`)
          .join(', ');
        return `Door ${door.number} (${door.category}): ${formatTemp(
          door.tempF,
          settings.tempUnit
        )}, compliance ${m.compliancePct.toFixed(1)}%, ${m.oosCount} OOS [${
          oosCoords || 'none'
        }], pending AI lift +$${m.projectedWeeklyLift}/wk.`;
      })
      .join('\n');
  }, [doors, skuCatalog, settings.tempUnit]);

  const handleSendChatMessage = async (
    text: string,
    modelMode: 'standard' | 'fast',
    useSearchGrounding: boolean
  ) => {
    setChatError(null);
    const userMsg: ChatMessageItem = {
      id: `local-u-${Date.now()}`,
      role: 'user',
      modelUsed: modelMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen',
      content: text,
    };

    const historySnapshot = chatMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setChatMessages((prev) => [...prev, userMsg]);
    setChatSending(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authUser) {
        const token = await authUser.getIdToken();
        setAuthToken(token);
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          history: historySnapshot,
          modelMode,
          useSearchGrounding,
          storeContext: storeContextSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gemini assistant failed to respond.');
      }

      const modelMsg: ChatMessageItem = {
        id: `local-m-${Date.now()}`,
        role: 'model',
        modelUsed: data.modelUsed || (modelMode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen'),
        content: data.reply,
        sources: Array.isArray(data.sources) ? data.sources : [],
      };
      setChatMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to reach KoolerIQ Copilot.');
    } finally {
      setChatSending(false);
    }
  };

  const handleClearChatHistory = async () => {
    setChatMessages([]);
    setChatError(null);
    if (authUser) {
      try {
        const token = await authUser.getIdToken();
        await fetch('/api/chat-history', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Ignore transient clear error
      }
    }
  };

  const recomputeSlotStatus = (
    skuId: string,
    plannedSkuId: string,
    depth: number,
    maxDepth: number,
    lowPct: number
  ): 'optimal' | 'low' | 'oos' | 'violation' => {
    if (depth <= 0) return 'oos';
    if (skuId !== plannedSkuId) return 'violation';
    if ((depth / maxDepth) * 100 <= lowPct) return 'low';
    return 'optimal';
  };

  const handleAdjustDepth = (doorId: string, slotId: string, delta: number) => {
    setDoors((prev) =>
      prev.map((door) => {
        if (door.id !== doorId) return door;
        return {
          ...door,
          shelves: door.shelves.map((shelf) =>
            shelf.map((slot) => {
              if (slot.id !== slotId) return slot;
              const nextDepth = Math.max(0, Math.min(slot.maxDepth, slot.currentDepth + delta));
              return {
                ...slot,
                currentDepth: nextDepth,
                status: recomputeSlotStatus(
                  slot.skuId,
                  slot.plannedSkuId,
                  nextDepth,
                  slot.maxDepth,
                  settings.lowStockThresholdPct
                ),
              };
            })
          ),
        };
      })
    );
  };

  const handleRestockFull = (doorId: string, slotId: string) => {
    let restockedUnits = 0;
    let targetSkuId = '';
    let slotCoord = '';

    setDoors((prev) =>
      prev.map((door) => {
        if (door.id !== doorId) return door;
        return {
          ...door,
          shelves: door.shelves.map((shelf) =>
            shelf.map((slot) => {
              if (slot.id !== slotId) return slot;
              restockedUnits = Math.max(0, slot.maxDepth - slot.currentDepth);
              targetSkuId = slot.skuId;
              slotCoord = slot.coord;
              return {
                ...slot,
                currentDepth: slot.maxDepth,
                status: recomputeSlotStatus(
                  slot.skuId,
                  slot.plannedSkuId,
                  slot.maxDepth,
                  slot.maxDepth,
                  settings.lowStockThresholdPct
                ),
              };
            })
          ),
        };
      })
    );

    if (restockedUnits > 0 && targetSkuId) {
      setSkuCatalog((prev) => {
        const sku = prev[targetSkuId];
        if (!sku) return prev;
        return {
          ...prev,
          [targetSkuId]: {
            ...sku,
            backroomQty: Math.max(0, sku.backroomQty - restockedUnits),
          },
        };
      });
      showToast(`Restocked ${slotCoord} (+${restockedUnits} units from walk-in).`);
    }
  };

  const handleApplySlotAi = (doorId: string, slotId: string) => {
    let appliedGain = 0;
    let newSkuName = '';

    setDoors((prev) =>
      prev.map((door) => {
        if (door.id !== doorId) return door;
        return {
          ...door,
          shelves: door.shelves.map((shelf) =>
            shelf.map((slot) => {
              if (slot.id !== slotId || !slot.aiRecommendation || slot.aiRecommendation.applied) {
                return slot;
              }
              const nextSkuId = slot.aiRecommendation.targetSkuId;
              appliedGain = slot.aiRecommendation.weeklyDollarGain;
              newSkuName = skuCatalog[nextSkuId]?.shortName ?? nextSkuId;
              return {
                ...slot,
                skuId: nextSkuId,
                plannedSkuId: nextSkuId,
                currentDepth: slot.maxDepth,
                status: 'optimal',
                aiRecommendation: { ...slot.aiRecommendation, applied: true },
              };
            })
          ),
        };
      })
    );

    setInsights((prev) =>
      prev.map((ins) => (ins.slotId === slotId ? { ...ins, status: 'applied' } : ins))
    );

    if (appliedGain > 0) {
      showToast(`AI Swap applied: ${newSkuName} (+$${appliedGain}/wk projected).`);
    }
  };

  const handleFixViolation = (doorId: string, slotId: string) => {
    let fixedCoord = '';
    setDoors((prev) =>
      prev.map((door) => {
        if (door.id !== doorId) return door;
        return {
          ...door,
          shelves: door.shelves.map((shelf) =>
            shelf.map((slot) => {
              if (slot.id !== slotId) return slot;
              fixedCoord = slot.coord;
              return {
                ...slot,
                skuId: slot.plannedSkuId,
                currentDepth: slot.maxDepth,
                status: 'optimal',
              };
            })
          ),
        };
      })
    );
    if (fixedCoord) {
      showToast(`Restored compliant planogram SKU at ${fixedCoord}.`);
    }
  };

  const handleOptimizeDoor = (doorId: string) => {
    let swaps = 0;
    let totalGain = 0;
    const appliedSlotIds = new Set<string>();

    setDoors((prev) =>
      prev.map((door) => {
        if (door.id !== doorId) return door;
        return {
          ...door,
          shelves: door.shelves.map((shelf) =>
            shelf.map((slot) => {
              if (!slot.aiRecommendation || slot.aiRecommendation.applied) return slot;
              swaps++;
              totalGain += slot.aiRecommendation.weeklyDollarGain;
              appliedSlotIds.add(slot.id);
              const nextSkuId = slot.aiRecommendation.targetSkuId;
              return {
                ...slot,
                skuId: nextSkuId,
                plannedSkuId: nextSkuId,
                currentDepth: slot.maxDepth,
                status: 'optimal',
                aiRecommendation: { ...slot.aiRecommendation, applied: true },
              };
            })
          ),
        };
      })
    );

    if (swaps > 0) {
      setInsights((prev) =>
        prev.map((ins) => (appliedSlotIds.has(ins.slotId) ? { ...ins, status: 'applied' } : ins))
      );
      showToast(`Optimized ${swaps} facings (+$${totalGain}/wk projected revenue).`);
    }
  };

  const handleRestockAllDoorOos = (doorId: string) => {
    let filledCount = 0;
    setDoors((prev) =>
      prev.map((door) => {
        if (door.id !== doorId) return door;
        return {
          ...door,
          lastAuditAt: 'Just now',
          shelves: door.shelves.map((shelf) =>
            shelf.map((slot) => {
              if (slot.currentDepth > 0 && slot.status !== 'violation') return slot;
              filledCount++;
              return {
                ...slot,
                skuId: slot.plannedSkuId,
                currentDepth: slot.maxDepth,
                status: 'optimal',
              };
            })
          ),
        };
      })
    );
    if (filledCount > 0) {
      showToast(`Filled ${filledCount} OOS/misplaced facings on cooler door.`);
    }
  };

  const handleRunAudit = (doorId: string) => {
    const door = doors.find((d) => d.id === doorId);
    if (!door) return;
    const metrics = getDoorMetrics(door);
    const newRecord: AuditRecord = {
      id: `aud-${Date.now()}`,
      doorId: door.id,
      doorLabel: door.label,
      timestamp: 'Just now',
      compliancePct: metrics.compliancePct,
      facingsDetected: metrics.totalFacings - metrics.oosCount,
      totalFacings: metrics.totalFacings,
      oosCount: metrics.oosCount,
      aiConfidence: 98.1,
      status: 'verified',
      summary:
        metrics.oosCount > 0
          ? `${metrics.oosCount} OOS gaps detected via optical scan; queued for pull.`
          : '100% shelf facing presence verified by KoolerIQ Vision.',
    };
    setAudits((prev) => [newRecord, ...prev]);
    setDoors((prev) =>
      prev.map((d) => (d.id === doorId ? { ...d, lastAuditAt: 'Just now' } : d))
    );
  };

  const handleApplyInsight = (insightId: string) => {
    const ins = insights.find((i) => i.id === insightId);
    if (!ins || ins.status === 'applied') return;
    handleApplySlotAi(ins.doorId, ins.slotId);
  };

  const handleDismissInsight = (insightId: string) => {
    setInsights((prev) =>
      prev.map((ins) => (ins.id === insightId ? { ...ins, status: 'dismissed' } : ins))
    );
    showToast('Recommendation dismissed.');
  };

  const handlePullSkuToFloor = (skuId: string) => {
    let pulled = 0;
    const available = skuCatalog[skuId]?.backroomQty ?? 0;
    if (available <= 0) return;

    let remaining = available;
    setDoors((prev) =>
      prev.map((door) => ({
        ...door,
        shelves: door.shelves.map((shelf) =>
          shelf.map((slot) => {
            if (slot.skuId !== skuId || slot.currentDepth >= slot.maxDepth || remaining <= 0) {
              return slot;
            }
            const needed = slot.maxDepth - slot.currentDepth;
            const add = Math.min(needed, remaining);
            remaining -= add;
            pulled += add;
            const nextDepth = slot.currentDepth + add;
            return {
              ...slot,
              currentDepth: nextDepth,
              status: recomputeSlotStatus(
                slot.skuId,
                slot.plannedSkuId,
                nextDepth,
                slot.maxDepth,
                settings.lowStockThresholdPct
              ),
            };
          })
        ),
      }))
    );

    if (pulled > 0) {
      setSkuCatalog((prev) => ({
        ...prev,
        [skuId]: {
          ...prev[skuId],
          backroomQty: Math.max(0, prev[skuId].backroomQty - pulled),
        },
      }));
      showToast(`Pulled ${pulled} units of ${skuCatalog[skuId].shortName} to cooler floor.`);
    }
  };

  const handleOrderBackroomCase = (skuId: string) => {
    setSkuCatalog((prev) => ({
      ...prev,
      [skuId]: {
        ...prev[skuId],
        backroomQty: prev[skuId].backroomQty + 12,
      },
    }));
    showToast(`Added +1 case (12 units) of ${skuCatalog[skuId].shortName} to backroom.`);
  };

  const handleBatchRestockOos = () => {
    let filledSlots = 0;
    setDoors((prev) =>
      prev.map((door) => ({
        ...door,
        shelves: door.shelves.map((shelf) =>
          shelf.map((slot) => {
            if (slot.currentDepth > 0) return slot;
            filledSlots++;
            return {
              ...slot,
              currentDepth: slot.maxDepth,
              status: recomputeSlotStatus(
                slot.skuId,
                slot.plannedSkuId,
                slot.maxDepth,
                slot.maxDepth,
                settings.lowStockThresholdPct
              ),
            };
          })
        ),
      }))
    );
    if (filledSlots > 0) {
      showToast(`Completed batch pull: restocked ${filledSlots} empty cooler facings.`);
    }
  };

  const handleUpdateDoorTargetTemp = (doorId: string, deltaF: number) => {
    setDoors((prev) =>
      prev.map((d) =>
        d.id === doorId
          ? {
              ...d,
              targetTempF: Math.max(32, Math.min(40, Number((d.targetTempF + deltaF).toFixed(1)))),
            }
          : d
      )
    );
  };

  const handleExportCsv = () => {
    const header = 'Door,Slot,SKU Code,SKU Name,Depth,Max Depth,Status,Retail Price\n';
    const rows = doors
      .flatMap((door) =>
        door.shelves.flat().map((slot) => {
          const sku = skuCatalog[slot.skuId];
          return [
            `Door ${door.number}`,
            slot.coord,
            sku.skuCode,
            `"${sku.name}"`,
            slot.currentDepth,
            slot.maxDepth,
            slot.status,
            sku.price.toFixed(2),
          ].join(',');
        })
      )
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kooleriq-planogram-${settings.storeCode.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Downloaded planogram CSV report.');
  };

  const handleResetDemo = () => {
    setDoors(cloneDoors(INITIAL_DOORS));
    setSkuCatalog(cloneCatalog(SKU_CATALOG));
    setInsights(INITIAL_INSIGHTS.map((i) => ({ ...i })));
    setAudits(INITIAL_AUDITS.map((a) => ({ ...a })));
    setSettings({ ...INITIAL_SETTINGS });
    showToast('Reset store telemetry to baseline.');
  };

  const desktopNavItems: { id: NavTab; label: string }[] = [
    { id: 'planogram', label: 'Planogram' },
    { id: 'audit', label: 'Audit' },
    { id: 'insights', label: 'AI Insights' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'pricing', label: 'Pricing' },
  ];

  const mobileNavItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'planogram', label: 'Planogram', icon: LayoutGrid },
    { id: 'insights', label: 'Insights', icon: Sparkles },
    { id: 'audit', label: 'Audit', icon: Camera },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'pricing', label: 'Pricing', icon: CreditCard },
  ];

  const pageTitleMap: Record<NavTab, string> = {
    planogram: 'Cooler Planogram Heatmap',
    audit: 'AI Optical Shelf Audit',
    insights: 'AI Revenue Insights',
    inventory: 'Walk-In & Floor Inventory',
    pricing: 'Pricing & Google Play Plans',
    settings: 'Store & Cooler Settings',
  };

  const planDisplayName =
    subscription.planTier === 'enterprise'
      ? 'Enterprise Fleet'
      : subscription.planTier === 'pro'
        ? 'Pro Operator'
        : 'Starter';

  return (
    <div className="min-h-screen bg-[#0A1128] text-[#DCE1FF] flex flex-col">
      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 h-14 lg:h-16 bg-[#0A1128]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1440px] mx-auto h-full px-4 lg:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('planogram')}
            className="text-lg font-display font-bold tracking-tight text-[#DCE1FF] hover:text-[#00E5FF] transition-colors whitespace-nowrap shrink-0"
          >
            KoolerIQ
          </button>

          {/* Zone 2: 5 Single-Line Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7" aria-label="Primary navigation">
            {desktopNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isActive ? 'text-[#00E5FF]' : 'text-[#BAC9CC] hover:text-[#DCE1FF]'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-[1px] h-0.5 bg-[#00E5FF] rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Contextual Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className="min-h-[40px] px-4 py-2 rounded bg-[#00E5FF] text-[#0A1128] text-xs font-semibold hover:bg-[#33ECFF] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Camera className="w-3.5 h-3.5" />
              Run AI Audit
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 lg:px-6 pt-5 pb-24 lg:pb-10">
        {/* Workspace Title & Operator Utility Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5 pb-4 border-b border-white/10">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-[#DCE1FF]">
              {pageTitleMap[activeTab]}
            </h1>
            <div className="text-xs text-[#849396] flex flex-wrap items-center gap-2 mt-1">
              <span>{settings.storeName}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-[#BAC9CC]">www.kooleriq.com</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-[#10B981]">
                {planDisplayName} · Google Play
              </span>
            </div>
          </div>

          {/* Workspace Action Controls: AI Copilot, Settings, Google Sign-In */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="min-h-[40px] px-3.5 py-2 rounded bg-[#00E5FF]/10 border border-[#00E5FF]/50 text-[#00E5FF] text-xs font-semibold hover:bg-[#00E5FF]/20 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <Bot className="w-4 h-4" />
              AI Copilot
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`min-h-[40px] px-3.5 py-2 rounded border text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-[#18274D] border-[#00E5FF] text-[#DCE1FF]'
                  : 'bg-[#101F42] border-white/15 text-[#BAC9CC] hover:text-white'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              Settings
            </button>

            {authLoading ? null : authUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[40px] px-3.5 py-2 rounded bg-[#101F42] border border-white/15 text-[#DCE1FF] text-xs font-medium hover:border-[#FF5A5F]/50 transition-colors flex items-center gap-2 whitespace-nowrap max-w-[220px]"
                title={`Signed in as ${authUser.email}`}
              >
                <span className="truncate">{authUser.email}</span>
                <LogOut className="w-3.5 h-3.5 text-[#849396] shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="min-h-[40px] px-3.5 py-2 rounded bg-[#101F42] border border-white/20 text-[#DCE1FF] text-xs font-semibold hover:border-[#00E5FF] transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5 text-[#00E5FF]" />
                Sign in with Google
              </button>
            )}
          </div>
        </div>

        {activeTab === 'planogram' && (
          <PlanogramScreen
            doors={doors}
            selectedDoorId={selectedDoorId}
            onSelectDoor={setSelectedDoorId}
            skuCatalog={skuCatalog}
            settings={settings}
            onAdjustDepth={handleAdjustDepth}
            onRestockFull={handleRestockFull}
            onApplySlotAi={handleApplySlotAi}
            onFixViolation={handleFixViolation}
            onOptimizeDoor={handleOptimizeDoor}
            onRestockAllDoorOos={handleRestockAllDoorOos}
            onGoToAudit={() => setActiveTab('audit')}
          />
        )}

        {activeTab === 'audit' && (
          <AuditScreen
            doors={doors}
            selectedDoorId={selectedDoorId}
            onSelectDoor={setSelectedDoorId}
            skuCatalog={skuCatalog}
            settings={settings}
            audits={audits}
            onRunAudit={handleRunAudit}
            onSyncDoorGaps={handleRestockAllDoorOos}
          />
        )}

        {activeTab === 'insights' && (
          <InsightsScreen
            insights={insights}
            skuCatalog={skuCatalog}
            settings={settings}
            authToken={authToken}
            onApplyInsight={handleApplyInsight}
            onDismissInsight={handleDismissInsight}
            onPreviewDoor={(doorId) => {
              setSelectedDoorId(doorId);
              setActiveTab('planogram');
            }}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryScreen
            doors={doors}
            skuCatalog={skuCatalog}
            settings={settings}
            onPullSkuToFloor={handlePullSkuToFloor}
            onOrderBackroomCase={handleOrderBackroomCase}
            onBatchRestockOos={handleBatchRestockOos}
          />
        )}

        {activeTab === 'pricing' && (
          <PricingScreen
            subscription={subscription}
            isAuthenticated={Boolean(authUser)}
            isSaving={isSavingPlan}
            onSelectPlan={handleSelectPlan}
            onSignInPrompt={handleGoogleSignIn}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsScreen
            settings={settings}
            doors={doors}
            onUpdateSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
            onUpdateDoorTargetTemp={handleUpdateDoorTargetTemp}
            onExportCsv={handleExportCsv}
            onResetDemo={handleResetDemo}
          />
        )}
      </main>

      {/* Quiet Desktop Footer */}
      <footer className="hidden lg:block border-t border-white/10 py-4 px-6">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between text-xs text-[#849396]">
          <span>KoolerIQ Cold-Chain Telemetry · www.kooleriq.com · Available on Google Play</span>
          <span>
            {settings.storeName} · Route {settings.routeId}
          </span>
        </div>
      </footer>

      {/* Multi-Turn Gemini Merchandising Copilot Drawer */}
      <AiAssistantDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={chatMessages}
        onSendMessage={handleSendChatMessage}
        onClearHistory={handleClearChatHistory}
        isSending={chatSending}
        errorMsg={chatError}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-50 max-w-sm glacier-hud rounded-lg border border-[#00E5FF]/50 px-4 py-3 text-xs font-medium text-[#DCE1FF]">
          {toastMsg}
        </div>
      )}

      {/* Mobile Anchored 5-Point Bottom Navigation */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0A1128]/90 backdrop-blur-md border-t border-white/10 px-2"
        aria-label="Mobile bottom navigation"
      >
        <div className="grid grid-cols-5 h-full items-center max-w-md mx-auto">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isCentralAudit = item.id === 'audit';

            if (isCentralAudit) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className="flex flex-col items-center justify-center -mt-4 focus-visible:outline-none"
                  aria-label="AI Camera Audit"
                >
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all ${
                      isActive
                        ? 'bg-[#00E5FF] text-[#0A1128] border-[#C3F5FF] shadow-[0_0_20px_rgba(0,229,255,0.55)]'
                        : 'bg-[#101F42] text-[#00E5FF] border-[#00E5FF]/60 shadow-[0_0_14px_rgba(0,229,255,0.28)]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-[10px] font-medium mt-0.5 ${
                      isActive ? 'text-[#00E5FF]' : 'text-[#BAC9CC]'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className="min-h-[44px] flex flex-col items-center justify-center gap-1 focus-visible:outline-none"
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#00E5FF]' : 'text-[#849396]'}`} />
                <span
                  className={`text-[10px] font-medium leading-none ${
                    isActive ? 'text-[#00E5FF]' : 'text-[#849396]'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
