import React, { useMemo, useState } from 'react';
import { Check, PackageCheck, Plus, Search } from 'lucide-react';
import { BrandId, CoolerDoor, SkuItem, StoreSettings } from '../types/kooleriq';
import { BeverageVisual } from './BeverageVisual';

interface InventoryScreenProps {
  doors: CoolerDoor[];
  skuCatalog: Record<string, SkuItem>;
  settings: StoreSettings;
  onPullSkuToFloor: (skuId: string) => void;
  onOrderBackroomCase: (skuId: string) => void;
  onBatchRestockOos: () => void;
}

type StockFilter = 'all' | 'oos' | 'low' | 'optimal';

export const InventoryScreen: React.FC<InventoryScreenProps> = ({
  doors,
  skuCatalog,
  settings,
  onPullSkuToFloor,
  onOrderBackroomCase,
  onBatchRestockOos,
}) => {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<'all' | BrandId>('all');
  const [statusFilter, setStatusFilter] = useState<StockFilter>('all');

  // Aggregate floor stock per SKU across all 4 cooler doors
  const inventoryRows = useMemo(() => {
    const skuAgg: Record<
      string,
      {
        sku: SkuItem;
        floorQty: number;
        floorCapacity: number;
        oosSlots: number;
        lowSlots: number;
        locations: string[];
      }
    > = {};

    Object.values(skuCatalog).forEach((sku) => {
      skuAgg[sku.id] = {
        sku,
        floorQty: 0,
        floorCapacity: 0,
        oosSlots: 0,
        lowSlots: 0,
        locations: [],
      };
    });

    doors.forEach((door) => {
      door.shelves.flat().forEach((slot) => {
        const entry = skuAgg[slot.skuId];
        if (!entry) return;
        entry.floorQty += slot.currentDepth;
        entry.floorCapacity += slot.maxDepth;
        if (slot.currentDepth === 0) {
          entry.oosSlots += 1;
        } else if (slot.currentDepth / slot.maxDepth <= settings.lowStockThresholdPct / 100) {
          entry.lowSlots += 1;
        }
        entry.locations.push(`D${door.number}·${slot.coord}`);
      });
    });

    return Object.values(skuAgg).sort((a, b) => {
      // Sort OOS first, then low stock, then weekly velocity
      if (b.oosSlots !== a.oosSlots) return b.oosSlots - a.oosSlots;
      if (b.lowSlots !== a.lowSlots) return b.lowSlots - a.lowSlots;
      return b.sku.weeklyVelocity - a.sku.weeklyVelocity;
    });
  }, [doors, skuCatalog, settings.lowStockThresholdPct]);

  const totalOosSlots = inventoryRows.reduce((sum, r) => sum + r.oosSlots, 0);
  const totalFloorUnits = inventoryRows.reduce((sum, r) => sum + r.floorQty, 0);
  const totalBackroomUnits = inventoryRows.reduce((sum, r) => sum + r.sku.backroomQty, 0);

  const filteredRows = useMemo(() => {
    return inventoryRows.filter((row) => {
      const q = search.trim().toLowerCase();
      if (
        q &&
        !row.sku.name.toLowerCase().includes(q) &&
        !row.sku.skuCode.toLowerCase().includes(q) &&
        !row.sku.brandLabel.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (brandFilter !== 'all' && row.sku.brand !== brandFilter) return false;
      if (statusFilter === 'oos' && row.oosSlots === 0) return false;
      if (statusFilter === 'low' && row.lowSlots === 0 && row.oosSlots === 0) return false;
      if (statusFilter === 'optimal' && (row.oosSlots > 0 || row.lowSlots > 0)) return false;
      return true;
    });
  }, [inventoryRows, search, brandFilter, statusFilter]);

  return (
    <div className="space-y-5">
      {/* Top Summary & Batch Picklist Action */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <div className="glacier-card rounded-lg p-3.5">
            <div className="text-xs text-[#BAC9CC]">Floor Units Stocked</div>
            <div className="text-2xl font-mono-tabular font-bold text-[#DCE1FF] mt-1">
              {totalFloorUnits}
            </div>
            <div className="text-[11px] text-[#849396] mt-0.5">Across 4 cooler doors</div>
          </div>

          <div className="glacier-card rounded-lg p-3.5">
            <div className="text-xs text-[#BAC9CC]">Walk-In Backstock</div>
            <div className="text-2xl font-mono-tabular font-bold text-[#00E5FF] mt-1">
              {totalBackroomUnits}
            </div>
            <div className="text-[11px] text-[#849396] mt-0.5">Ready for pull</div>
          </div>

          <div className="glacier-card rounded-lg p-3.5">
            <div className="text-xs text-[#BAC9CC]">Critical OOS Gaps</div>
            <div
              className={`text-2xl font-mono-tabular font-bold mt-1 ${
                totalOosSlots > 0 ? 'text-[#FF5A5F]' : 'text-[#10B981]'
              }`}
            >
              {totalOosSlots}
            </div>
            <div className="text-[11px] text-[#849396] mt-0.5">Facings at 0 depth</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onBatchRestockOos}
          disabled={totalOosSlots === 0}
          className="min-h-[48px] px-5 py-3 rounded-lg bg-[#00E5FF] text-[#0A1128] font-semibold text-sm hover:bg-[#33ECFF] disabled:opacity-45 transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <PackageCheck className="w-4 h-4" />
          {totalOosSlots > 0
            ? `Pull & Restock All ${totalOosSlots} OOS Gaps`
            : 'All Cooler Facings Stocked'}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="glacier-card rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#849396] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU name, code, or brand..."
              className="w-full min-h-[44px] pl-10 pr-4 rounded bg-[#101F42]/60 border border-white/15 text-sm text-[#DCE1FF] placeholder:text-[#849396] focus:outline-none focus:border-[#00E5FF] focus:shadow-[0_0_8px_rgba(0,229,255,0.3)] transition-all"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0A1128] border border-white/10 overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All Status' },
                { id: 'oos', label: 'OOS' },
                { id: 'low', label: 'Low Stock' },
                { id: 'optimal', label: 'Optimal' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(s.id)}
                className={`min-h-[36px] px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === s.id
                    ? 'bg-[#00E5FF] text-[#0A1128] font-semibold'
                    : 'text-[#BAC9CC] hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Brand Filter Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(
            [
              { id: 'all', label: 'All Brands' },
              { id: 'celsius', label: 'Celsius' },
              { id: 'monster', label: 'Monster' },
              { id: 'redbull', label: 'Red Bull' },
              { id: 'coca-cola', label: 'Coca-Cola' },
              { id: 'gatorade', label: 'Gatorade' },
              { id: 'liquid-death', label: 'Liquid Death' },
              { id: 'starbucks', label: 'Starbucks' },
            ] as const
          ).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBrandFilter(b.id)}
              className={`min-h-[36px] px-3 py-1 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                brandFilter === b.id
                  ? 'bg-[#18274D] border-[#00E5FF] text-[#DCE1FF]'
                  : 'bg-[#0A1128] border-white/10 text-[#BAC9CC] hover:text-white'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Catalog Grid / Table */}
      <div className="glacier-card rounded-xl overflow-hidden">
        {filteredRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#BAC9CC]">
            No SKUs match your current search or filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {/* Desktop Column Header */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-3 bg-[#060D24] text-[11px] font-semibold text-[#849396]">
              <div className="col-span-4">SKU &amp; Brand</div>
              <div className="col-span-2">Locations</div>
              <div className="col-span-2 text-right">Floor Stock</div>
              <div className="col-span-1 text-right">Backroom</div>
              <div className="col-span-1 text-right">Vel / wk</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {filteredRows.map((row) => {
              const needsFloorPull = row.floorQty < row.floorCapacity;
              const isCritical = row.oosSlots > 0;
              const isLow = !isCritical && row.lowSlots > 0;

              return (
                <div
                  key={row.sku.id}
                  className="p-4 lg:px-5 lg:py-3.5 hover:bg-white/[0.02] transition-colors grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-center"
                >
                  {/* SKU Info */}
                  <div className="lg:col-span-4 flex items-center gap-3 min-w-0">
                    <div className="w-10 h-14 rounded bg-[#0A1128] border border-white/10 flex items-center justify-center shrink-0">
                      <BeverageVisual sku={row.sku} size="sm" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: row.sku.brandColor }}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-semibold text-[#DCE1FF] truncate">
                          {row.sku.name}
                        </span>
                      </div>
                      <div className="text-xs text-[#849396] font-mono-tabular mt-0.5">
                        {row.sku.skuCode} · {row.sku.size} · ${row.sku.price.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Locations */}
                  <div className="lg:col-span-2 text-xs font-mono-tabular text-[#BAC9CC] truncate">
                    {row.locations.length > 0
                      ? row.locations.slice(0, 3).join(', ') +
                        (row.locations.length > 3 ? ` +${row.locations.length - 3}` : '')
                      : 'Backroom Only'}
                  </div>

                  {/* Floor Depth */}
                  <div className="lg:col-span-2 flex lg:justify-end items-center gap-2 font-mono-tabular text-xs">
                    <span
                      className={
                        isCritical
                          ? 'text-[#FF5A5F] font-semibold'
                          : isLow
                            ? 'text-[#FF9F1C] font-semibold'
                            : 'text-[#10B981] font-semibold'
                      }
                    >
                      {row.floorQty}/{row.floorCapacity}
                    </span>
                    <span className="text-[#849396]">
                      {isCritical
                        ? `(${row.oosSlots} OOS)`
                        : isLow
                          ? `(${row.lowSlots} Low)`
                          : 'Optimal'}
                    </span>
                  </div>

                  {/* Backroom */}
                  <div className="lg:col-span-1 lg:text-right font-mono-tabular text-xs text-[#DCE1FF]">
                    <span className="lg:hidden text-[#849396] mr-1">Backroom:</span>
                    {row.sku.backroomQty} u
                  </div>

                  {/* Velocity */}
                  <div className="lg:col-span-1 lg:text-right font-mono-tabular text-xs text-[#BAC9CC]">
                    <span className="lg:hidden text-[#849396] mr-1">Velocity:</span>
                    {row.sku.weeklyVelocity}
                  </div>

                  {/* Actions */}
                  <div className="lg:col-span-2 flex items-center lg:justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onPullSkuToFloor(row.sku.id)}
                      disabled={!needsFloorPull || row.sku.backroomQty === 0}
                      className="min-h-[40px] px-3 py-1.5 rounded bg-[#00E5FF]/10 border border-[#00E5FF]/60 text-[#00E5FF] text-xs font-semibold hover:bg-[#00E5FF]/20 disabled:opacity-35 transition-colors flex items-center gap-1 whitespace-nowrap"
                    >
                      {needsFloorPull ? (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          Fill Floor
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Full
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onOrderBackroomCase(row.sku.id)}
                      className="min-h-[40px] px-3 py-1.5 rounded bg-[#101F42] border border-white/15 text-[#DCE1FF] text-xs font-medium hover:border-[#00E5FF]/45 transition-colors whitespace-nowrap"
                    >
                      +1 Case (12)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
