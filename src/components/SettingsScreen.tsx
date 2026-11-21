import React from 'react';
import { Download, Globe, Minus, Plus, RotateCcw, ShieldCheck, Thermometer } from 'lucide-react';
import { CoolerDoor, StoreSettings } from '../types/kooleriq';
import { formatTemp } from '../utils/formatters';

interface SettingsScreenProps {
  settings: StoreSettings;
  doors: CoolerDoor[];
  onUpdateSettings: (patch: Partial<StoreSettings>) => void;
  onUpdateDoorTargetTemp: (doorId: string, deltaF: number) => void;
  onExportCsv: () => void;
  onResetDemo: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  doors,
  onUpdateSettings,
  onUpdateDoorTargetTemp,
  onExportCsv,
  onResetDemo,
}) => {
  return (
    <div className="space-y-5 max-w-5xl">
      {/* Store & Fleet Endpoint */}
      <div className="glacier-card rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono-tabular text-[#00E5FF]">
            <Globe className="w-4 h-4" />
            <span>www.kooleriq.com</span>
            <span aria-hidden="true">·</span>
            <span>{settings.storeCode}</span>
          </div>
          <h2 className="text-lg font-semibold text-[#DCE1FF] mt-1">{settings.storeName}</h2>
          <p className="text-xs text-[#BAC9CC] mt-0.5">
            {settings.address} · Route {settings.routeId}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onExportCsv}
            className="min-h-[44px] px-4 py-2 rounded bg-[#00E5FF]/10 border border-[#00E5FF] text-[#00E5FF] text-xs font-semibold hover:bg-[#00E5FF]/20 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Export Planogram CSV
          </button>
          <button
            type="button"
            onClick={onResetDemo}
            className="min-h-[44px] px-4 py-2 rounded bg-[#101F42] border border-white/15 text-[#BAC9CC] text-xs font-medium hover:text-white hover:border-white/30 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Telemetry
          </button>
        </div>
      </div>

      {/* Telemetry Units & Alert Thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glacier-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-[#00E5FF]" />
            <h3 className="text-base font-semibold text-[#DCE1FF]">
              Cold-Chain &amp; Stock Thresholds
            </h3>
          </div>

          {/* Temperature Unit */}
          <div className="flex items-center justify-between gap-4 py-2 border-b border-white/10">
            <div>
              <div className="text-sm font-medium text-[#DCE1FF]">Temperature Scale</div>
              <div className="text-xs text-[#849396]">Applies live across all cooler doors</div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0A1128] border border-white/10">
              {(['F', 'C'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => onUpdateSettings({ tempUnit: unit })}
                  className={`min-h-[36px] px-3.5 py-1 rounded text-xs font-mono-tabular font-semibold transition-colors ${
                    settings.tempUnit === unit
                      ? 'bg-[#00E5FF] text-[#0A1128]'
                      : 'text-[#BAC9CC] hover:text-white'
                  }`}
                >
                  °{unit}
                </button>
              ))}
            </div>
          </div>

          {/* Low Stock Threshold */}
          <div className="flex items-center justify-between gap-4 py-2 border-b border-white/10">
            <div>
              <div className="text-sm font-medium text-[#DCE1FF]">Low-Stock Alert Level</div>
              <div className="text-xs text-[#849396]">
                Flags shelf facings in Amber below this capacity
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0A1128] border border-white/10">
              {[20, 25, 33].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => onUpdateSettings({ lowStockThresholdPct: pct })}
                  className={`min-h-[36px] px-3 py-1 rounded text-xs font-mono-tabular font-semibold transition-colors ${
                    settings.lowStockThresholdPct === pct
                      ? 'bg-[#00E5FF] text-[#0A1128]'
                      : 'text-[#BAC9CC] hover:text-white'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Max Temperature Fault */}
          <div className="flex items-center justify-between gap-4 py-2 border-b border-white/10">
            <div>
              <div className="text-sm font-medium text-[#DCE1FF]">High-Temp Fault Alert</div>
              <div className="text-xs text-[#849396]">
                Triggers Crimson alert when cooler warms past threshold
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    maxTempAlertF: Math.max(35, Number((settings.maxTempAlertF - 0.5).toFixed(1))),
                  })
                }
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded bg-[#0A1128] border border-white/15 text-[#DCE1FF] hover:border-[#00E5FF]/60"
                aria-label="Decrease max temp threshold"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="font-mono-tabular text-sm font-semibold text-[#DCE1FF] w-16 text-center">
                {formatTemp(settings.maxTempAlertF, settings.tempUnit)}
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    maxTempAlertF: Math.min(44, Number((settings.maxTempAlertF + 0.5).toFixed(1))),
                  })
                }
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded bg-[#0A1128] border border-white/15 text-[#DCE1FF] hover:border-[#00E5FF]/60"
                aria-label="Increase max temp threshold"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <div className="text-sm font-medium text-[#DCE1FF]">Auto-Sync Restock Queue</div>
              <div className="text-xs text-[#849396]">
                Push verified AI camera OOS gaps directly to route picklist
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSettings({ autoRestockSync: !settings.autoRestockSync })}
              className={`min-h-[36px] px-3.5 py-1.5 rounded text-xs font-semibold border transition-colors ${
                settings.autoRestockSync
                  ? 'bg-[#10B981]/20 border-[#10B981] text-[#A8FFD2]'
                  : 'bg-[#0A1128] border-white/15 text-[#849396]'
              }`}
            >
              {settings.autoRestockSync ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        {/* Individual Door Setpoints */}
        <div className="glacier-card rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            <h3 className="text-base font-semibold text-[#DCE1FF]">
              Cooler Door Setpoints (Doors 01–04)
            </h3>
          </div>

          <div className="space-y-3">
            {doors.map((door) => {
              const isWarm = door.tempF > settings.maxTempAlertF;
              return (
                <div
                  key={door.id}
                  className="rounded-lg bg-[#0A1128] border border-white/10 p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#DCE1FF] truncate">
                      {door.label}
                    </div>
                    <div className="text-xs font-mono-tabular text-[#849396] mt-0.5">
                      Live:{' '}
                      <span className={isWarm ? 'text-[#FF5A5F] font-semibold' : 'text-[#00E5FF]'}>
                        {formatTemp(door.tempF, settings.tempUnit)}
                      </span>{' '}
                      · Humidity {door.humidityPct}%
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onUpdateDoorTargetTemp(door.id, -0.5)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded bg-[#101F42] border border-white/15 text-[#DCE1FF] hover:border-[#00E5FF]/50"
                      aria-label={`Decrease target temp for ${door.label}`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono-tabular text-xs font-semibold text-[#DCE1FF] w-14 text-center">
                      {formatTemp(door.targetTempF, settings.tempUnit)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateDoorTargetTemp(door.id, 0.5)}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded bg-[#101F42] border border-white/15 text-[#DCE1FF] hover:border-[#00E5FF]/50"
                      aria-label={`Increase target temp for ${door.label}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
