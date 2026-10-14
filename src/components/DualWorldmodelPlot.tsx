import React, { useRef, useEffect, useState } from 'react';
import { FieldChannels, DivergenceMetrics, HubNode } from '../types/hrm';
import { Activity, AlertTriangle, Eye, Sparkles } from 'lucide-react';

interface DualWorldmodelPlotProps {
  nodes: HubNode[];
  phiA: FieldChannels[];
  phiB: FieldChannels[];
  selectedNodeIndex: number;
  divergence: DivergenceMetrics;
  divergenceHistory: { timeMs: number; div: number }[];
  timeMs: number;
}

const CHANNEL_CONFIG = [
  { name: 'GPU Compute Util', unit: '%', min: 0, max: 100, colorA: '#22d3ee', colorB: '#f59e0b', precision: 1 },
  { name: 'Egress Queue Latency', unit: 'ms', min: 0, max: 120, colorA: '#38bdf8', colorB: '#fb923c', precision: 1 },
  { name: 'Thermal Headroom', unit: '°C', min: 0, max: 45, colorA: '#34d399', colorB: '#f43f5e', precision: 1 },
  { name: 'Power Usage Eff. (PUE)', unit: '', min: 1.0, max: 1.8, colorA: '#a78bfa', colorB: '#ec4899', precision: 3 },
];

export const DualWorldmodelPlot: React.FC<DualWorldmodelPlotProps> = ({
  nodes,
  phiA,
  phiB,
  selectedNodeIndex,
  divergence,
  divergenceHistory,
  timeMs,
}) => {
  const [selectedChannel, setSelectedChannel] = useState<number>(0);
  const [plotMode, setPlotMode] = useState<'channel' | 'divergence'>('channel');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Rolling history buffer for node channels (last 80 samples)
  const historyRef = useRef<{
    timeMs: number;
    valA: number;
    valB: number;
  }[]>([]);

  const currentNode = nodes[selectedNodeIndex] || nodes[0];
  const nodeIndex = selectedNodeIndex >= 0 && selectedNodeIndex < nodes.length ? selectedNodeIndex : 0;

  const currentValA = phiA[nodeIndex] ? phiA[nodeIndex][selectedChannel] : 0;
  const currentValB = phiB[nodeIndex] ? phiB[nodeIndex][selectedChannel] : 0;

  // Setup resize handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Update history buffer
  useEffect(() => {
    historyRef.current.push({
      timeMs,
      valA: currentValA,
      valB: currentValB,
    });
    if (historyRef.current.length > 90) {
      historyRef.current.shift();
    }
  }, [timeMs, currentValA, currentValB]);

  // Keep refs for smooth 60fps render loop
  const plotModeRef = useRef(plotMode);
  plotModeRef.current = plotMode;
  const selectedChannelRef = useRef(selectedChannel);
  selectedChannelRef.current = selectedChannel;
  const divergenceRef = useRef(divergence);
  divergenceRef.current = divergence;
  const divergenceHistoryRef = useRef(divergenceHistory);
  divergenceHistoryRef.current = divergenceHistory;

  // Persistent Render loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Padding
      const padTop = 18;
      const padBottom = 26;
      const padLeft = 45;
      const padRight = 20;

      const plotW = width - padLeft - padRight;
      const plotH = height - padTop - padBottom;

      const currentPlotMode = plotModeRef.current;
      const currentChan = selectedChannelRef.current;

      if (currentPlotMode === 'channel') {
        const cfg = CHANNEL_CONFIG[currentChan];
        const minVal = cfg.min;
        const maxVal = cfg.max;

        // Draw grid lines & Y labels
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Fira Code, monospace';
        ctx.textAlign = 'right';

        const gridSteps = 4;
        for (let s = 0; s <= gridSteps; s++) {
          const val = minVal + ((maxVal - minVal) / gridSteps) * s;
          const y = padTop + plotH - (s / gridSteps) * plotH;

          ctx.beginPath();
          ctx.moveTo(padLeft, y);
          ctx.lineTo(width - padRight, y);
          ctx.stroke();

          ctx.fillText(`${val.toFixed(cfg.precision === 3 ? 2 : 0)}${cfg.unit}`, padLeft - 6, y + 3);
        }

        const history = historyRef.current;
        if (history.length > 1) {
          // Draw Model B (Counterfactual Prediction) dashed orange line
          ctx.save();
          ctx.strokeStyle = cfg.colorB;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          history.forEach((pt, idx) => {
            const x = padLeft + (idx / (history.length - 1)) * plotW;
            const normY = Math.max(0, Math.min(1, (pt.valB - minVal) / (maxVal - minVal)));
            const y = padTop + plotH - normY * plotH;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.restore();

          // Draw Model A (Ground Truth Observational) solid cyan line
          ctx.save();
          ctx.strokeStyle = cfg.colorA;
          ctx.lineWidth = 2.2;
          ctx.shadowColor = cfg.colorA;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          history.forEach((pt, idx) => {
            const x = padLeft + (idx / (history.length - 1)) * plotW;
            const normY = Math.max(0, Math.min(1, (pt.valA - minVal) / (maxVal - minVal)));
            const y = padTop + plotH - normY * plotH;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.restore();

          // Current tip points
          const lastPt = history[history.length - 1];
          const lastX = padLeft + plotW;
          const lastYA = padTop + plotH - Math.max(0, Math.min(1, (lastPt.valA - minVal) / (maxVal - minVal))) * plotH;
          const lastYB = padTop + plotH - Math.max(0, Math.min(1, (lastPt.valB - minVal) / (maxVal - minVal))) * plotH;

          ctx.fillStyle = cfg.colorA;
          ctx.beginPath();
          ctx.arc(lastX, lastYA, 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = cfg.colorB;
          ctx.beginPath();
          ctx.arc(lastX, lastYB, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Divergence Mode
        const maxDiv = 15.0;
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Fira Code, monospace';
        ctx.textAlign = 'right';

        for (let s = 0; s <= 3; s++) {
          const val = (maxDiv / 3) * s;
          const y = padTop + plotH - (s / 3) * plotH;
          ctx.beginPath();
          ctx.moveTo(padLeft, y);
          ctx.lineTo(width - padRight, y);
          ctx.stroke();
          ctx.fillText(`${val.toFixed(1)}`, padLeft - 6, y + 3);
        }

        // Anomaly threshold line at 8.5
        const anomY = padTop + plotH - (8.5 / maxDiv) * plotH;
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padLeft, anomY);
        ctx.lineTo(width - padRight, anomY);
        ctx.stroke();
        ctx.fillStyle = '#f43f5e';
        ctx.fillText('THRESHOLD (8.5)', width - padRight - 5, anomY - 4);
        ctx.setLineDash([]);

        const divHist = divergenceHistoryRef.current;
        const currentDiv = divergenceRef.current;
        if (divHist.length > 1) {
          ctx.save();
          ctx.strokeStyle = currentDiv.anomalyDetected ? '#f43f5e' : '#38bdf8';
          ctx.lineWidth = 2.4;
          ctx.shadowColor = currentDiv.anomalyDetected ? '#f43f5e' : '#38bdf8';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          divHist.forEach((pt, idx) => {
            const x = padLeft + (idx / (divHist.length - 1)) * plotW;
            const normY = Math.max(0, Math.min(1, pt.div / maxDiv));
            const y = padTop + plotH - normY * plotH;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          ctx.restore();
        }
      }

      // Time Axis Label
      ctx.fillStyle = '#64748b';
      ctx.font = '9px Fira Code, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('-90ms', padLeft + 15, height - 8);
      ctx.fillText('Current Time (t)', padLeft + plotW / 2, height - 8);
      ctx.fillText('+500ms Lookahead', padLeft + plotW - 30, height - 8);

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const currentCfg = CHANNEL_CONFIG[selectedChannel];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-xl">
      {/* Header with Title and Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Dual-Worldmodel Telemetry Sync
          </h3>
          <span className="text-slate-500 text-xs">·</span>
          <span className="text-xs text-slate-400 font-mono">
            Node: <span className="text-cyan-300 font-semibold">{currentNode.name}</span> ({currentNode.code})
          </span>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setPlotMode('channel')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              plotMode === 'channel'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Field Channels
          </button>
          <button
            onClick={() => setPlotMode('divergence')}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              plotMode === 'divergence'
                ? 'bg-slate-800 text-rose-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Divergence D(A, B)
          </button>
        </div>
      </div>

      {/* Channel Selector Pills (Functional filter tabs) */}
      {plotMode === 'channel' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {CHANNEL_CONFIG.map((cfg, idx) => {
            const valA = phiA[nodeIndex] ? phiA[nodeIndex][idx] : 0;
            const valB = phiB[nodeIndex] ? phiB[nodeIndex][idx] : 0;
            const isSelected = selectedChannel === idx;

            return (
              <button
                key={cfg.name}
                onClick={() => setSelectedChannel(idx)}
                className={`flex flex-col p-2 text-left rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-slate-800/90 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/20'
                    : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-850 hover:border-slate-700'
                }`}
              >
                <span className="text-[11px] text-slate-400 font-medium truncate">{cfg.name}</span>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono font-semibold text-cyan-400">
                      {valA.toFixed(cfg.precision)}
                    </span>
                    <span className="text-[10px] text-slate-500">{cfg.unit}</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[10px] text-amber-400">
                    <span className="text-slate-500">fwd:</span>
                    <span>{valB.toFixed(cfg.precision)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Divergence Header Summary */}
      {plotMode === 'divergence' && (
        <div className="flex items-center justify-between p-2.5 mb-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Global Divergence:</span>
            <span className={`font-semibold text-sm ${divergence.anomalyDetected ? 'text-rose-400' : 'text-cyan-400'}`}>
              {divergence.euclideanDivergence}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Peak Node:</span>
            <span className="text-amber-300 uppercase">{divergence.maxNodeDivergence.nodeId}</span>
            <span className="text-slate-500">({divergence.maxNodeDivergence.divergence})</span>
          </div>
          {divergence.anomalyDetected && (
            <div className="flex items-center gap-1 text-rose-400">
              <AlertTriangle className="w-3.5 h-3.5 animate-bounce" />
              <span>BREACH &gt; 8.5</span>
            </div>
          )}
        </div>
      )}

      {/* Canvas Time Series Plot */}
      <div className="relative w-full h-48 bg-slate-950 rounded-lg border border-slate-800/90 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Legend Footer */}
      <div className="flex items-center justify-between text-xs text-slate-400 mt-3 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
            <span className="text-slate-300">Model A: Observational Ground Truth</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-amber-400 border-b border-dashed border-amber-300" />
            <span className="text-slate-300">Model B: Counterfactual Twin (+500ms)</span>
          </div>
        </div>

        <div className="font-mono text-[11px] text-slate-500">
          Speed-of-light horizon: ~200 km/ms
        </div>
      </div>
    </div>
  );
};
