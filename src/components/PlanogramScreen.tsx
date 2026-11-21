import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  ThermometerSnowflake,
  X,
} from 'lucide-react';
import { CoolerDoor, FacingSlot, SkuItem, StoreSettings } from '../types/kooleriq';
import { formatTemp, getDoorMetrics } from '../utils/formatters';
import { BeverageVisual } from './BeverageVisual';

interface PlanogramScreenProps {
  doors: CoolerDoor[];
  selectedDoorId: string;
  onSelectDoor: (doorId: string) => void;
  skuCatalog: Record<string, SkuItem>;
  settings: StoreSettings;
  onAdjustDepth: (doorId: string, slotId: string, delta: number) => void;
  onRestockFull: (doorId: string, slotId: string) => void;
  onApplySlotAi: (doorId: string, slotId: string) => void;
  onFixViolation: (doorId: string, slotId: string) => void;
  onOptimizeDoor: (doorId: string) => void;
  onRestockAllDoorOos: (doorId: string) => void;
  onGoToAudit: () => void;
}

type PlanogramFilter = 'all' | 'oos' | 'ai' | 'low';

export const PlanogramScreen: React.FC<PlanogramScreenProps> = ({
  doors,
  selectedDoorId,
  onSelectDoor,
  skuCatalog,
  settings,
  onAdjustDepth,
  onRestockFull,
  onApplySlotAi,
  onFixViolation,
  onOptimizeDoor,
  onRestockAllDoorOos,
  onGoToAudit,
}) => {
  const [filter, setFilter] = useState<PlanogramFilter>('all');
  const [selectedSlotId, setSelectedSlotId] = useState<string>('D1-S2-F05');
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const activeDoor = useMemo(
    () => doors.find((d) => d.id === selectedDoorId) ?? doors[0],
    [doors, selectedDoorId]
  );

  const metrics = useMemo(() => getDoorMetrics(activeDoor), [activeDoor]);

  const selectedSlot: FacingSlot | undefined = useMemo(() => {
    const flat = activeDoor.shelves.flat();
    return flat.find((s) => s.id === selectedSlotId) ?? flat[0];
  }, [activeDoor, selectedSlotId]);

  const handleDoorSwitch = (doorId: string) => {
    onSelectDoor(doorId);
    const door = doors.find((d) => d.id === doorId);
    if (door && door.shelves[0]?.[0]) {
      setSelectedSlotId(door.shelves[0][0].id);
    }
  };

  const handleSlotClick = (slot: FacingSlot) => {
    setSelectedSlotId(slot.id);
    if (window.innerWidth < 1024) {
      setMobileSheetOpen(true);
    }
  };

  const matchesFilter = (slot: FacingSlot): boolean => {
    if (filter === 'all') return true;
    if (filter === 'oos') return slot.currentDepth === 0 || slot.status === 'oos';
    if (filter === 'ai') return Boolean(slot.aiRecommendation && !slot.aiRecommendation.applied);
    if (filter === 'low') {
      return (
        slot.currentDepth > 0 &&
        (slot.status === 'low' ||
          slot.status === 'violation' ||
          slot.currentDepth / slot.maxDepth <= settings.lowStockThresholdPct / 100)
      );
    }
    return true;
  };

  const isTempWarning =
    activeDoor.tempF > settings.maxTempAlertF || activeDoor.tempF < settings.minTempAlertF;

  const renderInspectorContent = (slot: FacingSlot) => {
    const sku = skuCatalog[slot.skuId];
    const plannedSku = skuCatalog[slot.plannedSkuId];
    const recSku = slot.aiRecommendation ? skuCatalog[slot.aiRecommendation.targetSkuId] : null;
    const isOos = slot.currentDepth === 0;
    const isViolation = slot.skuId !== slot.plannedSkuId;

    return (
      <div className="space-y-5">
        {/* Coordinate Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-20 rounded-lg bg-[#0A1128] border border-white/10 flex items-center justify-center shrink-0">
              <BeverageVisual sku={sku} size="md" dimmed={isOos} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#00E5FF]">
                <span>DOOR {activeDoor.number}</span>
                <span aria-hidden="true">·</span>
                <span>{slot.coord}</span>
                <span aria-hidden="true">·</span>
                <span>{sku.skuCode}</span>
              </div>
              <h3 className="text-base font-semibold text-[#DCE1FF] mt-1 truncate">{sku.name}</h3>
              <p className="text-xs text-[#BAC9CC] mt-0.5">
                {sku.brandLabel} · {sku.size} · ${sku.price.toFixed(2)} retail ·{' '}
                <span className="font-mono-tabular text-[#DCE1FF]">{sku.weeklyVelocity}/wk</span>
              </p>
            </div>
          </div>
          {mobileSheetOpen && (
            <button
              type="button"
              onClick={() => setMobileSheetOpen(false)}
              className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-[#BAC9CC] hover:text-white hover:bg-white/5"
              aria-label="Close slot inspector"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Facing Depth Control */}
        <div className="bg-[#0A1128]/80 rounded-lg p-3.5 border border-white/10">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-[#BAC9CC]">Shelf Facing Depth</span>
            <span
              className={`text-sm font-mono-tabular font-semibold ${
                isOos
                  ? 'text-[#FF5A5F]'
                  : slot.currentDepth <= 1
                    ? 'text-[#FF9F1C]'
                    : 'text-[#10B981]'
              }`}
            >
              {slot.currentDepth} / {slot.maxDepth} units
            </span>
          </div>

          {/* Segmented Depth Bars */}
          <div className="grid grid-cols-6 gap-1.5 mb-3.5" aria-hidden="true">
            {Array.from({ length: slot.maxDepth }).map((_, idx) => (
              <div
                key={idx}
                className={`h-2 rounded-sm transition-colors ${
                  idx < slot.currentDepth
                    ? isOos
                      ? 'bg-[#FF5A5F]'
                      : slot.currentDepth <= 1
                        ? 'bg-[#FF9F1C]'
                        : 'bg-[#00E5FF]'
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAdjustDepth(activeDoor.id, slot.id, -1)}
              disabled={slot.currentDepth <= 0}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded bg-[#18274D] border border-white/10 text-[#DCE1FF] hover:border-[#00E5FF]/50 disabled:opacity-40 transition-colors"
              aria-label="Decrease facing depth by 1"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onAdjustDepth(activeDoor.id, slot.id, 1)}
              disabled={slot.currentDepth >= slot.maxDepth}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded bg-[#18274D] border border-white/10 text-[#DCE1FF] hover:border-[#00E5FF]/50 disabled:opacity-40 transition-colors"
              aria-label="Increase facing depth by 1"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onRestockFull(activeDoor.id, slot.id)}
              disabled={slot.currentDepth >= slot.maxDepth}
              className="flex-1 min-h-[44px] px-4 rounded bg-[#00E5FF] text-[#0A1128] font-semibold text-sm hover:bg-[#33ECFF] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              Restock to {slot.maxDepth}/{slot.maxDepth}
            </button>
          </div>
          <p className="text-xs text-[#849396] mt-2.5 font-mono-tabular">
            Walk-in backroom stock: {sku.backroomQty} units
          </p>
        </div>

        {/* Planogram Violation Resolution */}
        {isViolation && (
          <div className="rounded-lg p-3.5 bg-[#FF5A5F]/10 border border-[#FF5A5F]/40">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FFB4AB]">
              <AlertTriangle className="w-4 h-4 text-[#FF5A5F] shrink-0" />
              <span>Planogram Misplacement Detected</span>
            </div>
            <p className="text-xs text-[#DCE1FF] mt-1.5 leading-relaxed">
              Expected <span className="font-semibold">{plannedSku.name}</span> in {slot.coord},
              currently stocked with {sku.shortName}.
            </p>
            <button
              type="button"
              onClick={() => onFixViolation(activeDoor.id, slot.id)}
              className="mt-3 w-full min-h-[44px] px-3 rounded bg-[#FF5A5F]/20 border border-[#FF5A5F] text-white text-xs font-semibold hover:bg-[#FF5A5F]/30 transition-colors"
            >
              Restore {plannedSku.shortName} to Slot
            </button>
          </div>
        )}

        {/* AI Recommendation Card */}
        {slot.aiRecommendation && !slot.aiRecommendation.applied && recSku && (
          <div className="rounded-lg p-3.5 bg-[#10B981]/10 border border-[#10B981]/40">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#A8FFD2] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#10B981]" />
                AI Facing Optimization
              </span>
              <span className="font-mono-tabular text-xs font-bold text-[#10B981]">
                +{slot.aiRecommendation.projectedLiftPct}% REV · +$
                {slot.aiRecommendation.weeklyDollarGain}/wk
              </span>
            </div>

            <div className="flex items-center gap-2.5 mt-3 bg-[#0A1128]/70 rounded p-2.5 border border-white/10">
              <span className="text-xs text-[#BAC9CC] truncate">{sku.shortName}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
              <span className="text-xs font-semibold text-[#DCE1FF] truncate">{recSku.name}</span>
            </div>

            <p className="text-xs text-[#BAC9CC] mt-2.5 leading-relaxed">
              {slot.aiRecommendation.reason}
            </p>

            <button
              type="button"
              onClick={() => onApplySlotAi(activeDoor.id, slot.id)}
              className="mt-3 w-full min-h-[44px] px-4 rounded bg-[#10B981] text-[#052016] font-semibold text-sm hover:bg-[#34D399] transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Apply AI Swap (+${slot.aiRecommendation.weeklyDollarGain}/wk)
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Door Selector Tabs & Quick Actions */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {doors.map((door) => {
            const isSelected = door.id === activeDoor.id;
            const doorStats = getDoorMetrics(door);
            const warnTemp =
              door.tempF > settings.maxTempAlertF || door.tempF < settings.minTempAlertF;

            return (
              <button
                key={door.id}
                type="button"
                onClick={() => handleDoorSwitch(door.id)}
                className={`min-h-[44px] px-3.5 py-2 rounded-lg border text-left transition-colors shrink-0 flex items-center gap-3 ${
                  isSelected
                    ? 'bg-[#18274D] border-[#00E5FF] text-[#DCE1FF]'
                    : 'bg-[#101F42] border-white/10 text-[#BAC9CC] hover:border-white/25 hover:text-[#DCE1FF]'
                }`}
              >
                <div>
                  <div className="text-xs font-semibold whitespace-nowrap">
                    Door {door.number} · {door.category.split(' ')[0]}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-[#849396] flex items-center gap-1.5 mt-0.5">
                    <span className={warnTemp ? 'text-[#FF5A5F] font-semibold' : 'text-[#00E5FF]'}>
                      {formatTemp(door.tempF, settings.tempUnit)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{doorStats.compliancePct.toFixed(0)}%</span>
                    {doorStats.oosCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#FF5A5F]">{doorStats.oosCount} OOS</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onGoToAudit}
            className="min-h-[44px] px-4 py-2 rounded bg-[#00E5FF]/10 border border-[#00E5FF] text-[#00E5FF] text-xs font-semibold hover:bg-[#00E5FF]/20 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4" />
            Scan Shelves
          </button>
          {metrics.oosCount > 0 && (
            <button
              type="button"
              onClick={() => onRestockAllDoorOos(activeDoor.id)}
              className="min-h-[44px] px-4 py-2 rounded bg-[#FF9F1C]/15 border border-[#FF9F1C] text-[#FFCF87] text-xs font-semibold hover:bg-[#FF9F1C]/25 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Fill {metrics.oosCount} OOS Gaps
            </button>
          )}
          <button
            type="button"
            onClick={() => onOptimizeDoor(activeDoor.id)}
            disabled={metrics.aiOpportunityCount === 0}
            className="min-h-[44px] px-4 py-2 rounded bg-[#00E5FF] text-[#0A1128] text-xs font-semibold hover:bg-[#33ECFF] disabled:opacity-45 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {metrics.aiOpportunityCount > 0
              ? `AI Optimize (+$${metrics.projectedWeeklyLift}/wk)`
              : 'Door AI Optimized'}
          </button>
        </div>
      </div>

      {/* 4-Column Telemetry Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glacier-card rounded-lg p-3.5">
          <div className="flex items-center justify-between text-xs text-[#BAC9CC]">
            <span>Cooler Temp</span>
            <ThermometerSnowflake
              className={`w-4 h-4 ${isTempWarning ? 'text-[#FF5A5F]' : 'text-[#00E5FF]'}`}
            />
          </div>
          <div
            className={`text-2xl font-mono-tabular font-bold mt-1 ${
              isTempWarning ? 'text-[#FF5A5F]' : 'text-[#DCE1FF]'
            }`}
          >
            {formatTemp(activeDoor.tempF, settings.tempUnit)}
          </div>
          <div className="text-[11px] text-[#849396] mt-0.5 font-mono-tabular">
            Target {formatTemp(activeDoor.targetTempF, settings.tempUnit)} · {activeDoor.doorOpensToday} opens
          </div>
        </div>

        <div className="glacier-card rounded-lg p-3.5">
          <div className="text-xs text-[#BAC9CC]">Planogram Compliance</div>
          <div className="text-2xl font-mono-tabular font-bold text-[#DCE1FF] mt-1">
            {metrics.compliancePct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-[#849396] mt-0.5 font-mono-tabular">
            {metrics.compliantCount}/{metrics.totalFacings} facings compliant
          </div>
        </div>

        <div className="glacier-card rounded-lg p-3.5">
          <div className="text-xs text-[#BAC9CC]">Stock Alerts</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-2xl font-mono-tabular font-bold ${
                metrics.oosCount > 0 ? 'text-[#FF5A5F]' : 'text-[#10B981]'
              }`}
            >
              {metrics.oosCount} OOS
            </span>
            <span className="text-xs font-mono-tabular text-[#FF9F1C]">
              · {metrics.lowCount} Low
            </span>
          </div>
          <div className="text-[11px] text-[#849396] mt-0.5">
            {metrics.violationCount > 0
              ? `${metrics.violationCount} misplaced SKU`
              : 'Zero placement violations'}
          </div>
        </div>

        <div className="glacier-card rounded-lg p-3.5">
          <div className="text-xs text-[#BAC9CC]">AI Projected Lift</div>
          <div className="text-2xl font-mono-tabular font-bold text-[#10B981] mt-1">
            +${metrics.projectedWeeklyLift}/wk
          </div>
          <div className="text-[11px] text-[#849396] mt-0.5 font-mono-tabular">
            {metrics.aiOpportunityCount} pending facing swaps
          </div>
        </div>
      </div>

      {/* Main Split: Cooler Schematic (8 cols) + Inspector (4 cols on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Cooler Door Planogram Frame */}
        <div className="lg:col-span-8 glacier-card rounded-xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-[#DCE1FF]">
                {activeDoor.label}
              </h2>
              <p className="text-xs text-[#849396] mt-0.5">
                Last verified {activeDoor.lastAuditAt} · Tap any facing slot to adjust depth or apply AI swap
              </p>
            </div>

            {/* Filter Segmented Control */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0A1128] border border-white/10 self-start">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'oos', label: 'OOS' },
                  { id: 'ai', label: 'AI Moves' },
                  { id: 'low', label: 'Low' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`min-h-[36px] px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    filter === tab.id
                      ? 'bg-[#00E5FF] text-[#0A1128] font-semibold'
                      : 'text-[#BAC9CC] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Refrigerated Glass Vault Interior */}
          <div className="rounded-xl bg-[#060D24] border border-[#00E5FF]/20 p-3 sm:p-4 space-y-4">
            {activeDoor.shelves.map((shelf, shelfIdx) => (
              <div key={shelfIdx} className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#849396] px-1">
                  <span>
                    SHELF S{shelfIdx + 1}{' '}
                    {shelfIdx === 0 ? '· EYE LEVEL' : shelfIdx === 1 ? '· PRIME REACH' : ''}
                  </span>
                  <span>
                    {shelf.filter((f) => f.currentDepth > 0).length}/{shelf.length} stocked
                  </span>
                </div>

                {/* 6 Facing Slots Row */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {shelf.map((slot) => {
                    const sku = skuCatalog[slot.skuId];
                    const isSelected = slot.id === selectedSlot?.id;
                    const isOos = slot.currentDepth === 0;
                    const isLow =
                      !isOos && slot.currentDepth / slot.maxDepth <= settings.lowStockThresholdPct / 100;
                    const isViolation = slot.skuId !== slot.plannedSkuId;
                    const hasAi = Boolean(slot.aiRecommendation && !slot.aiRecommendation.applied);
                    const dimmedByFilter = !matchesFilter(slot);

                    let slotStyle =
                      'bg-[#101F42]/80 border-white/10 hover:border-[#00E5FF]/45';
                    if (isOos) {
                      slotStyle =
                        'bg-[#FF5A5F]/10 border-dashed border-[#FF5A5F]/80 hover:border-[#FF5A5F]';
                    } else if (hasAi) {
                      slotStyle =
                        'bg-[#10B981]/10 border-[#10B981]/70 hover:border-[#10B981]';
                    } else if (isViolation) {
                      slotStyle =
                        'bg-[#FF5A5F]/10 border-[#FF5A5F]/65 hover:border-[#FF5A5F]';
                    } else if (isLow) {
                      slotStyle =
                        'bg-[#FF9F1C]/10 border-[#FF9F1C]/70 hover:border-[#FF9F1C]';
                    }

                    if (isSelected) {
                      slotStyle += ' ring-2 ring-[#00E5FF] ring-offset-1 ring-offset-[#060D24]';
                    }

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => handleSlotClick(slot)}
                        className={`relative min-h-[112px] rounded-md border p-2 flex flex-col items-center justify-between text-center transition-all ${slotStyle} ${
                          dimmedByFilter ? 'opacity-25' : 'opacity-100'
                        }`}
                      >
                        {/* Top Coordinate + AI Lift Micro-badge */}
                        <div className="w-full flex items-center justify-between gap-1">
                          <span className="text-[10px] font-mono-tabular text-[#849396]">
                            {slot.coord}
                          </span>
                          {hasAi && slot.aiRecommendation ? (
                            <span className="text-[9px] font-mono-tabular font-bold px-1 py-0.5 rounded bg-[#10B981] text-[#041E14] leading-none">
                              +{slot.aiRecommendation.projectedLiftPct}% REV
                            </span>
                          ) : (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: sku.brandColor }}
                              aria-hidden="true"
                            />
                          )}
                        </div>

                        {/* Bottle / Can Visual or OOS Callout */}
                        {isOos ? (
                          <div className="my-auto flex flex-col items-center justify-center py-1">
                            <span className="text-[10px] font-mono-tabular font-bold text-[#FF5A5F] tracking-tight">
                              +RESTOCK
                            </span>
                            <span className="text-[10px] text-[#BAC9CC] truncate max-w-[84px] mt-0.5">
                              {sku.shortName}
                            </span>
                          </div>
                        ) : (
                          <div className="my-1 flex flex-col items-center">
                            <BeverageVisual sku={sku} size="sm" />
                            <span className="text-[10px] font-medium text-[#DCE1FF] truncate max-w-[86px] mt-1">
                              {sku.shortName}
                            </span>
                          </div>
                        )}

                        {/* Bottom Depth Counter */}
                        <div className="w-full flex items-center justify-between text-[10px] font-mono-tabular pt-1 border-t border-white/5">
                          <span
                            className={
                              isOos
                                ? 'text-[#FF5A5F] font-semibold'
                                : isLow
                                  ? 'text-[#FF9F1C] font-semibold'
                                  : isViolation
                                    ? 'text-[#FFB4AB] font-semibold'
                                    : 'text-[#BAC9CC]'
                            }
                          >
                            {isViolation ? 'MISPLACED' : `${slot.currentDepth}/${slot.maxDepth}`}
                          </span>
                          <span className="text-[#849396]">${sku.price.toFixed(2)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Frosted Glass Cooler Shelf Ledge */}
                <div className="cooler-shelf-ledge h-2 rounded-sm" aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Right Inspector Panel */}
        <aside className="hidden lg:block lg:col-span-4 glacier-glass rounded-xl p-5 sticky top-20">
          {selectedSlot ? renderInspectorContent(selectedSlot) : null}
        </aside>
      </div>

      {/* Mobile Bottom Sheet Inspector */}
      {mobileSheetOpen && selectedSlot && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileSheetOpen(false)}
        >
          <div
            className="w-full max-h-[84vh] overflow-y-auto glacier-hud rounded-t-2xl border-t border-[#00E5FF]/30 p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-4" aria-hidden="true" />
            {renderInspectorContent(selectedSlot)}
          </div>
        </div>
      )}
    </div>
  );
};
