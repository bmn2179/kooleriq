import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Eye,
  ScanLine,
  Upload,
  Video,
  VideoOff,
} from 'lucide-react';
import { AuditRecord, CoolerDoor, SkuItem, StoreSettings } from '../types/kooleriq';
import { formatTemp, getDoorMetrics } from '../utils/formatters';
import { BeverageVisual } from './BeverageVisual';

interface AuditScreenProps {
  doors: CoolerDoor[];
  selectedDoorId: string;
  onSelectDoor: (doorId: string) => void;
  skuCatalog: Record<string, SkuItem>;
  settings: StoreSettings;
  audits: AuditRecord[];
  onRunAudit: (doorId: string) => void;
  onSyncDoorGaps: (doorId: string) => void;
}

export const AuditScreen: React.FC<AuditScreenProps> = ({
  doors,
  selectedDoorId,
  onSelectDoor,
  skuCatalog,
  settings,
  audits,
  onRunAudit,
  onSyncDoorGaps,
}) => {
  const activeDoor = useMemo(
    () => doors.find((d) => d.id === selectedDoorId) ?? doors[0],
    [doors, selectedDoorId]
  );
  const metrics = useMemo(() => getDoorMetrics(activeDoor), [activeDoor]);

  const [isScanning, setIsScanning] = useState(false);
  const [scanCompleteBanner, setScanCompleteBanner] = useState<string | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showOosOverlay, setShowOosOverlay] = useState(true);
  const [showDepthGrid, setShowDepthGrid] = useState(settings.cameraGridOverlay);
  const [cameraMode, setCameraMode] = useState<'simulated' | 'webcam' | 'photo'>('simulated');
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraMode('simulated');
    setCameraError(null);
  };

  const startWebcam = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Live camera access is unavailable in this browser context. Using cooler telemetry view.');
      setCameraMode('simulated');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraMode('webcam');
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      setCameraError('Camera permission declined or unavailable. Showing live simulated Door HUD.');
      setCameraMode('simulated');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const url = URL.createObjectURL(file);
    setUploadedImageUrl(url);
    setCameraMode('photo');
    setCameraError(null);
  };

  const triggerScan = () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanCompleteBanner(null);
    setTimeout(() => {
      setIsScanning(false);
      onRunAudit(activeDoor.id);
      setScanCompleteBanner(
        `Verified Door ${activeDoor.number}: ${metrics.compliancePct.toFixed(1)}% compliant · ${metrics.oosCount} OOS gaps logged.`
      );
    }, 1400);
  };

  // Top 3 shelves previewed inside the camera optical frame for crisp readability
  const previewShelves = activeDoor.shelves.slice(0, 3);
  const discrepancies = activeDoor.shelves
    .flat()
    .filter((s) => s.currentDepth === 0 || s.status === 'violation' || s.status === 'low');

  return (
    <div className="space-y-5">
      {/* Header Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {doors.map((door) => (
            <button
              key={door.id}
              type="button"
              onClick={() => onSelectDoor(door.id)}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                door.id === activeDoor.id
                  ? 'bg-[#18274D] border-[#00E5FF] text-[#DCE1FF]'
                  : 'bg-[#101F42] border-white/10 text-[#BAC9CC] hover:text-white'
              }`}
            >
              Door {door.number} · {formatTemp(door.tempF, settings.tempUnit)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {cameraMode === 'webcam' ? (
            <button
              type="button"
              onClick={stopWebcam}
              className="min-h-[44px] px-3.5 py-2 rounded bg-[#101F42] border border-white/15 text-[#DCE1FF] text-xs font-medium hover:border-[#00E5FF]/50 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <VideoOff className="w-4 h-4 text-[#FF9F1C]" />
              Stop Camera
            </button>
          ) : (
            <button
              type="button"
              onClick={startWebcam}
              className="min-h-[44px] px-3.5 py-2 rounded bg-[#00E5FF]/10 border border-[#00E5FF]/60 text-[#00E5FF] text-xs font-semibold hover:bg-[#00E5FF]/20 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Video className="w-4 h-4" />
              Live Camera
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3.5 py-2 rounded bg-[#101F42] border border-white/15 text-[#DCE1FF] text-xs font-medium hover:border-[#00E5FF]/50 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-[#BAC9CC]" />
            Upload Photo
          </button>

          {cameraMode !== 'simulated' && (
            <button
              type="button"
              onClick={stopWebcam}
              className="min-h-[44px] px-3 py-2 rounded bg-[#101F42] border border-white/15 text-[#BAC9CC] text-xs font-medium hover:text-white"
            >
              Sim View
            </button>
          )}
        </div>
      </div>

      {cameraError && (
        <div className="rounded-lg bg-[#FF9F1C]/10 border border-[#FF9F1C]/40 px-4 py-2.5 text-xs text-[#FFCF87]">
          {cameraError}
        </div>
      )}

      {/* Main Split: Camera HUD (8 cols) + Detected Gaps & Audit Log (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 glacier-card rounded-xl p-4 space-y-4">
          {/* HUD Layer Toggles */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-[#BAC9CC]">
              <Eye className="w-4 h-4 text-[#00E5FF]" />
              <span className="font-semibold text-[#DCE1FF]">Optical Shelf Scanner</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-[#00E5FF]">Door {activeDoor.number}</span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setShowBoundingBoxes((v) => !v)}
                className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  showBoundingBoxes
                    ? 'bg-[#00E5FF]/15 border-[#00E5FF]/60 text-[#00E5FF]'
                    : 'bg-[#0A1128] border-white/10 text-[#849396]'
                }`}
              >
                SKU Boxes
              </button>
              <button
                type="button"
                onClick={() => setShowOosOverlay((v) => !v)}
                className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  showOosOverlay
                    ? 'bg-[#FF5A5F]/15 border-[#FF5A5F]/60 text-[#FFB4AB]'
                    : 'bg-[#0A1128] border-white/10 text-[#849396]'
                }`}
              >
                OOS Gaps
              </button>
              <button
                type="button"
                onClick={() => setShowDepthGrid((v) => !v)}
                className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  showDepthGrid
                    ? 'bg-[#18274D] border-white/25 text-[#DCE1FF]'
                    : 'bg-[#0A1128] border-white/10 text-[#849396]'
                }`}
              >
                Grid HUD
              </button>
            </div>
          </div>

          {/* Camera Optical Viewport */}
          <div className="relative rounded-xl overflow-hidden bg-[#060D24] border border-[#00E5FF]/30 min-h-[380px] sm:min-h-[430px] flex flex-col justify-between p-4">
            {/* Background Media Layer */}
            {cameraMode === 'webcam' && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover opacity-80"
              />
            )}
            {cameraMode === 'photo' && uploadedImageUrl && (
              <img
                src={uploadedImageUrl}
                alt="Uploaded cooler door audit frame"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-80"
              />
            )}

            {/* Simulated Cooler LED & Frost Grid Background */}
            {cameraMode === 'simulated' && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle at 50% 0%, rgba(0, 229, 255, 0.14), rgba(6, 13, 36, 0.96) 70%)',
                }}
                aria-hidden="true"
              />
            )}

            {/* Optical Rule-of-Thirds HUD Grid */}
            {showDepthGrid && (
              <div
                className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3"
                aria-hidden="true"
              >
                {Array.from({ length: 9 }).map((_, idx) => (
                  <div key={idx} className="border border-white/[0.04]" />
                ))}
              </div>
            )}

            {/* Animated Laser Scan Sweep */}
            {isScanning && (
              <div
                className="absolute inset-x-0 top-0 h-20 pointer-events-none z-20 animate-scan-sweep"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(0, 229, 255, 0) 0%, rgba(0, 229, 255, 0.35) 92%, #00E5FF 100%)',
                  borderBottom: '2px solid #00E5FF',
                }}
                aria-hidden="true"
              />
            )}

            {/* Corner Viewfinder Brackets */}
            <div className="relative z-10 flex items-center justify-between text-[11px] font-mono-tabular text-[#00E5FF]">
              <span className="px-2 py-1 rounded bg-[#0A1128]/80 border border-[#00E5FF]/30">
                DOOR {activeDoor.number} · {activeDoor.category}
              </span>
              <span className="px-2 py-1 rounded bg-[#0A1128]/80 border border-white/10 text-[#DCE1FF]">
                {formatTemp(activeDoor.tempF, settings.tempUnit)} · 97.8% CONF
              </span>
            </div>

            {/* Detection Overlay Rows */}
            <div className="relative z-10 my-4 space-y-3">
              {previewShelves.map((shelf, sIdx) => (
                <div key={sIdx} className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {shelf.map((slot) => {
                    const sku = skuCatalog[slot.skuId];
                    const isOos = slot.currentDepth === 0;
                    const isViolation = slot.skuId !== slot.plannedSkuId;

                    return (
                      <div
                        key={slot.id}
                        className={`relative rounded p-2 flex flex-col items-center justify-center min-h-[92px] transition-all ${
                          cameraMode === 'simulated'
                            ? 'bg-[#0A1128]/70'
                            : 'bg-[#0A1128]/40 backdrop-blur-[2px]'
                        } ${
                          isOos && showOosOverlay
                            ? 'border border-dashed border-[#FF5A5F]'
                            : showBoundingBoxes
                              ? isViolation
                                ? 'border border-[#FF9F1C]'
                                : 'border border-[#00E5FF]/55'
                              : 'border border-transparent'
                        }`}
                      >
                        {/* Corner Brackets for AI Detection */}
                        {showBoundingBoxes && !isOos && (
                          <>
                            <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#00E5FF]" />
                            <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#00E5FF]" />
                            <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-[#00E5FF]" />
                            <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[#00E5FF]" />
                          </>
                        )}

                        {cameraMode === 'simulated' && !isOos && (
                          <BeverageVisual sku={sku} size="sm" />
                        )}

                        {isOos && showOosOverlay ? (
                          <span className="text-[10px] font-mono-tabular font-bold text-[#FF5A5F] text-center">
                            GAP · {slot.coord}
                          </span>
                        ) : (
                          showBoundingBoxes && (
                            <span className="mt-1 text-[10px] font-mono-tabular text-[#C3F5FF] truncate max-w-full">
                              {sku.skuCode} · {slot.currentDepth}/{slot.maxDepth}
                            </span>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Camera Capture Footer */}
            <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
              <div className="text-xs text-[#BAC9CC] font-mono-tabular">
                {metrics.totalFacings - metrics.oosCount}/{metrics.totalFacings} facings active ·{' '}
                {metrics.oosCount} empty slots
              </div>
              <button
                type="button"
                onClick={triggerScan}
                disabled={isScanning}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#00E5FF] text-[#0A1128] font-semibold text-sm hover:bg-[#33ECFF] disabled:opacity-60 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {isScanning ? (
                  <>
                    <ScanLine className="w-4 h-4" />
                    Scanning Door {activeDoor.number}...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Capture &amp; Audit Door {activeDoor.number}
                  </>
                )}
              </button>
            </div>
          </div>

          {scanCompleteBanner && (
            <div className="rounded-lg bg-[#10B981]/15 border border-[#10B981]/50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[#A8FFD2]">
                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>{scanCompleteBanner}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Detected Discrepancies & Audit History */}
        <div className="lg:col-span-4 space-y-5">
          <div className="glacier-card rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#DCE1FF]">
                Detected Shelf Discrepancies
              </h3>
              <span className="text-xs font-mono-tabular text-[#FF9F1C]">
                {discrepancies.length} flagged
              </span>
            </div>

            {discrepancies.length === 0 ? (
              <div className="rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 p-4 text-xs text-[#A8FFD2]">
                All facings on Door {activeDoor.number} match the active planogram with optimal depth.
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {discrepancies.map((slot) => {
                  const sku = skuCatalog[slot.skuId];
                  const isOos = slot.currentDepth === 0;
                  const isViolation = slot.skuId !== slot.plannedSkuId;
                  return (
                    <div
                      key={slot.id}
                      className="rounded-lg bg-[#0A1128] border border-white/10 p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-mono-tabular">
                          <AlertTriangle
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isOos ? 'text-[#FF5A5F]' : 'text-[#FF9F1C]'
                            }`}
                          />
                          <span className="text-[#DCE1FF] font-semibold">{slot.coord}</span>
                          <span aria-hidden="true">·</span>
                          <span className={isOos ? 'text-[#FF5A5F]' : 'text-[#FF9F1C]'}>
                            {isOos ? 'OUT OF STOCK' : isViolation ? 'MISPLACED' : 'LOW STOCK'}
                          </span>
                        </div>
                        <p className="text-xs text-[#BAC9CC] truncate mt-1">{sku.name}</p>
                      </div>
                      <span className="text-xs font-mono-tabular text-[#849396] shrink-0">
                        {slot.currentDepth}/{slot.maxDepth}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {discrepancies.length > 0 && (
              <button
                type="button"
                onClick={() => onSyncDoorGaps(activeDoor.id)}
                className="mt-3 w-full min-h-[44px] px-4 py-2 rounded bg-[#00E5FF]/10 border border-[#00E5FF] text-[#00E5FF] text-xs font-semibold hover:bg-[#00E5FF]/20 transition-colors"
              >
                Restock &amp; Resolve All Door {activeDoor.number} Gaps
              </button>
            )}
          </div>

          {/* Recent Audit Log */}
          <div className="glacier-card rounded-xl p-4">
            <h3 className="text-sm font-semibold text-[#DCE1FF] mb-3">Recent Cooler Audits</h3>
            <div className="space-y-2.5">
              {audits.slice(0, 4).map((audit) => (
                <div
                  key={audit.id}
                  className="border-b border-white/10 last:border-b-0 pb-2.5 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#DCE1FF] truncate">{audit.doorLabel}</span>
                    <span className="font-mono-tabular text-[#10B981] shrink-0">
                      {audit.compliancePct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-[#849396] font-mono-tabular mt-0.5">
                    {audit.timestamp} · {audit.oosCount} OOS · {audit.aiConfidence}% conf
                  </div>
                  <p className="text-xs text-[#BAC9CC] mt-1 leading-snug">{audit.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
