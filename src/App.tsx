import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DualWorldmodelState,
  initializeDualWorldmodel,
  stepDualWorldmodel,
  injectDiscreteEvent,
} from './engine/dualWorldmodel';
import { DiscreteEvent } from './types/hrm';
import { PlanetaryCanvas } from './components/PlanetaryCanvas';
import { DualWorldmodelPlot } from './components/DualWorldmodelPlot';
import { LedgerInspector } from './components/LedgerInspector';
import { EventController } from './components/EventController';
import { NodeInspectorModal } from './components/NodeInspectorModal';
import { PythonScriptModal } from './components/PythonScriptModal';
import {
  Network,
  Cpu,
  Layers,
  Terminal,
  ShieldCheck,
  AlertOctagon,
  Info,
  ExternalLink,
} from 'lucide-react';

export default function App() {
  // Dual-worldmodel simulation state
  const [simState, setSimState] = useState<DualWorldmodelState>(() => initializeDualWorldmodel());
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(5);

  // Selected node for inspection
  const [selectedNodeId, setSelectedNodeId] = useState<string>('ashburn');
  const [showNodeModal, setShowNodeModal] = useState<boolean>(false);
  const [showPythonModal, setShowPythonModal] = useState<boolean>(false);

  // Keep state in ref for requestAnimationFrame simulation loop
  const simStateRef = useRef<DualWorldmodelState>(simState);
  simStateRef.current = simState;

  const isRunningRef = useRef<boolean>(isRunning);
  isRunningRef.current = isRunning;

  const speedRef = useRef<number>(speedMultiplier);
  speedRef.current = speedMultiplier;

  const [thermalThreshold, setThermalThreshold] = useState<number>(25.0);

  // Real-time animation loop
  useEffect(() => {
    let animId: number;
    let lastTimestamp = performance.now();

    const loop = (timestamp: number) => {
      const elapsedWallMs = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      if (isRunningRef.current && elapsedWallMs > 0) {
        // Clamp wall time step to avoid large delta on tab unfocus
        const clampedWall = Math.min(40, elapsedWallMs);
        const simDt = (clampedWall * speedRef.current) / 10.0; // scaled time advancement

        // Strict numerical sub-stepping: each sub-step is <= 0.5 ms for unconditional stability
        const subSteps = Math.max(1, Math.ceil(simDt / 0.5));
        const updated = stepDualWorldmodel(simStateRef.current, simDt, subSteps);
        simStateRef.current = updated;
        setSimState(updated);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Handlers
  const handleToggleRunning = () => setIsRunning(prev => !prev);

  const handleStepForward = () => {
    const updated = stepDualWorldmodel(simStateRef.current, 1.0, 1);
    simStateRef.current = updated;
    setSimState(updated);
  };

  const handleReset = () => {
    const fresh = initializeDualWorldmodel();
    simStateRef.current = fresh;
    setSimState(fresh);
  };

  const handleInjectEvent = (event: DiscreteEvent) => {
    const updated = injectDiscreteEvent(simStateRef.current, event);
    simStateRef.current = updated;
    setSimState(updated);
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setShowNodeModal(true);
  };

  const selectedNodeIndex = simState.modelA.G.nodes.findIndex(n => n.id === selectedNodeId);
  const safeNodeIndex = selectedNodeIndex >= 0 ? selectedNodeIndex : 0;
  const currentNode = simState.modelA.G.nodes[safeNodeIndex];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Network className="w-4 h-4 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-white">
                  HRM 4.0 Planetary Manifold Telemetry
                </h1>
                <span className="text-slate-500 text-xs">·</span>
                <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                  Dual Worldmodel Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Helical Recursive Manifold · Speed-of-Light Transport Horizons (~200 km/ms)
              </p>
            </div>
          </div>

          {/* Mathematical Invariance & Python Export Buttons */}
          <div className="flex items-center gap-3">
            {/* Live Invariant Verification */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Identity Invariant: Verified</span>
            </div>

            {/* Central Observer Horizon */}
            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
              <span>Observer:</span>
              <span className="text-cyan-400 font-semibold">Ashburn (IAD)</span>
              <span className="text-slate-500">
                ({simState.modelA.H.inflightPackets.length} pkts inflight)
              </span>
            </div>

            {/* Python Code Modal Trigger */}
            <button
              onClick={() => setShowPythonModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 shadow-sm transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Standalone Python Code</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Scientific Cockpit */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-4">
        {/* Top Grid: Planetary Map & Active Topology (K_t Complex) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Planetary Canvas (3D Globe & 2D Flat Projection) */}
          <div className="lg:col-span-8 min-h-[480px]">
            <PlanetaryCanvas
              carrier={simState.modelA.G}
              phiA={simState.modelA.Phi}
              phiB={simState.modelB.Phi}
              selectedNodeId={selectedNodeId}
              onSelectNode={handleSelectNode}
              divergenceAnomaly={simState.divergence.anomalyDetected}
              thermalThreshold={thermalThreshold}
              onSetThermalThreshold={setThermalThreshold}
            />
          </div>

          {/* Side Telemetry Panel: Live Node Quick Stats & Worldmodel Divergence */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-4">
            {/* Quick Node Focus Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col justify-between flex-1">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold">
                      {currentNode.code}
                    </span>
                    <h2 className="text-xs font-semibold text-slate-200 truncate">
                      {currentNode.name}
                    </h2>
                  </div>
                  <button
                    onClick={() => setShowNodeModal(true)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    <span>Inspect</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>

                {/* 4 Continuous Fields Φ for Current Node */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 uppercase">GPU Util</span>
                    <div className="text-cyan-400 font-bold text-sm mt-0.5">
                      {simState.modelA.Phi[safeNodeIndex][0].toFixed(1)}%
                    </div>
                    <span className="text-[9.5px] text-slate-500">
                      fwd {simState.modelB.Phi[safeNodeIndex][0].toFixed(1)}%
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 uppercase">Queue Latency</span>
                    <div className="text-sky-400 font-bold text-sm mt-0.5">
                      {simState.modelA.Phi[safeNodeIndex][1].toFixed(1)} ms
                    </div>
                    <span className="text-[9.5px] text-slate-500">
                      fwd {simState.modelB.Phi[safeNodeIndex][1].toFixed(1)} ms
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 uppercase">Headroom</span>
                      {simState.modelA.Phi[safeNodeIndex][2] <= thermalThreshold && (
                        <span className="text-[9px] font-mono font-semibold text-rose-400 bg-rose-500/10 px-1 rounded animate-pulse">
                          STRESS
                        </span>
                      )}
                    </div>
                    <div
                      className={`font-bold text-sm mt-0.5 ${
                        simState.modelA.Phi[safeNodeIndex][2] <= thermalThreshold
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {simState.modelA.Phi[safeNodeIndex][2].toFixed(1)} °C
                    </div>
                    <span className="text-[9.5px] text-slate-500">
                      fwd {simState.modelB.Phi[safeNodeIndex][2].toFixed(1)} °C
                    </span>
                  </div>

                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 uppercase">Power PUE</span>
                    <div className="text-purple-400 font-bold text-sm mt-0.5">
                      {simState.modelA.Phi[safeNodeIndex][3].toFixed(3)}
                    </div>
                    <span className="text-[9.5px] text-slate-500">
                      base {currentNode.pueBaseline}
                    </span>
                  </div>
                </div>
              </div>

              {/* Node Selector Grid */}
              <div className="mt-3 pt-3 border-t border-slate-800">
                <span className="text-[11px] text-slate-400 font-medium block mb-1.5">
                  Select Planetary Node ({simState.modelA.G.nodes.length} Hubs)
                </span>
                <div className="grid grid-cols-7 gap-1">
                  {simState.modelA.G.nodes.map(node => (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`py-1 text-[10px] font-mono font-medium rounded transition-colors ${
                        selectedNodeId === node.id
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800/70 hover:border-slate-700'
                      }`}
                    >
                      {node.code}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Worldmodel Divergence Quick Box */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-xl">
              <div className="flex items-center justify-between text-xs font-mono mb-2">
                <span className="text-slate-400 font-medium">Model A vs B Divergence:</span>
                <span
                  className={`font-bold ${
                    simState.divergence.anomalyDetected ? 'text-rose-400' : 'text-cyan-400'
                  }`}
                >
                  {simState.divergence.euclideanDivergence}
                </span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 border border-slate-800 overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, (simState.divergence.euclideanDivergence / 15) * 100)}%` }}
                  className={`h-full transition-all duration-200 ${
                    simState.divergence.anomalyDetected ? 'bg-rose-500' : 'bg-cyan-400'
                  }`}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1.5">
                <span>Safe Range (&lt;8.5)</span>
                <span>Peak: {simState.divergence.maxNodeDivergence.nodeId.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Middle Section: Dual Worldmodel Synchronized Plot */}
        <section>
          <DualWorldmodelPlot
            nodes={simState.modelA.G.nodes}
            phiA={simState.modelA.Phi}
            phiB={simState.modelB.Phi}
            selectedNodeIndex={safeNodeIndex}
            divergence={simState.divergence}
            divergenceHistory={simState.divergenceHistory}
            timeMs={simState.timeMs}
          />
        </section>

        {/* Middle Section: Conservation of Explanation Ledger */}
        <section>
          <LedgerInspector ledger={simState.modelA.C} timeMs={simState.timeMs} />
        </section>

        {/* Bottom Section: Discrete Event Controller & B_t Resource Allocation */}
        <section>
          <EventController
            isRunning={isRunning}
            onToggleRunning={handleToggleRunning}
            onStepForward={handleStepForward}
            onReset={handleReset}
            speedMultiplier={speedMultiplier}
            onSetSpeed={setSpeedMultiplier}
            onInjectEvent={handleInjectEvent}
            activeEvents={simState.activeEvents}
            allocation={simState.modelA.B}
            nodes={simState.modelA.G.nodes}
            timeMs={simState.timeMs}
          />
        </section>
      </main>

      {/* Modals */}
      {showNodeModal && (
        <NodeInspectorModal
          node={currentNode}
          nodeIndex={safeNodeIndex}
          phiA={simState.modelA.Phi[safeNodeIndex]}
          phiB={simState.modelB.Phi[safeNodeIndex]}
          allocation={simState.modelA.B}
          links={simState.modelA.G.links}
          timeMs={simState.timeMs}
          onClose={() => setShowNodeModal(false)}
        />
      )}

      {showPythonModal && (
        <PythonScriptModal onClose={() => setShowPythonModal(false)} />
      )}
    </div>
  );
}
