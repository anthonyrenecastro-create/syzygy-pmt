/**
 * Dual-Worldmodel Telemetry Architecture
 *
 * Model A: Ground-Truth Observational State Reconstructor
 * - 1ms discretized physical plant simulation
 * - Asynchronous packet-delayed telemetry stream respecting speed-of-light horizons
 * - Transport operator T_{t->t+1} handles topology transitions & link outages
 *
 * Model B: Predictive Counterfactual Twin
 * - Speculative +500ms forward trajectory projection
 * - Proactively forecasts buffer bloat, thermal throttling, and routing shifts
 * - Continuous divergence scoring against Model A
 */

import {
  FieldChannels,
  CarrierComplexG,
  TransportOperatorStateT,
  MetricTensorM,
  TelemetryHorizonH,
  DiscreteEvent,
  ProductStateX,
  DivergenceMetrics,
  TelemetryPacket
} from '../types/hrm';
import {
  computeHRMTransitionStep,
  initializeFieldChannels,
  initializeMetricTensor
} from './hrmMath';
import { buildInitialCarrierComplex, recalculateMatrices } from './planetaryCarrier';

export const FORWARD_PROJECTION_HORIZON_MS = 500; // 500ms speculative lookahead
export const OBSERVER_HUB_ID = 'ashburn'; // Central observability collector
export const DIVERGENCE_ANOMALY_THRESHOLD = 8.5;

export interface DualWorldmodelState {
  timeMs: number;
  dt: number;
  modelA: ProductStateX; // Observational Ground Truth
  modelB: ProductStateX; // Speculative Counterfactual Twin
  divergence: DivergenceMetrics;
  divergenceHistory: { timeMs: number; div: number }[];
  activeEvents: DiscreteEvent[];
  eventHistory: DiscreteEvent[];
}

export function initializeDualWorldmodel(): DualWorldmodelState {
  const G_A = buildInitialCarrierComplex();
  const G_B = buildInitialCarrierComplex();

  const N = G_A.nodes.length;
  const basePueValues = G_A.nodes.map(n => n.pueBaseline);

  const Phi_A = initializeFieldChannels(N, basePueValues);
  const Phi_B = Phi_A.map(row => [...row] as FieldChannels);

  const T_A: TransportOperatorStateT = {
    lastTopologyMutationTime: 0,
    activeSeveredLinks: [],
    divertedTrafficRatio: 0,
    phantomEnergyResidual: 0,
  };
  const T_B: TransportOperatorStateT = { ...T_A };

  const M_A = initializeMetricTensor(N);
  const M_B = initializeMetricTensor(N);

  const H_A: TelemetryHorizonH = {
    inflightPackets: [],
    observerLocationId: OBSERVER_HUB_ID,
    receivedHistory: new Map(),
  };
  const H_B: TelemetryHorizonH = {
    inflightPackets: [],
    observerLocationId: OBSERVER_HUB_ID,
    receivedHistory: new Map(),
  };

  const initialTime = 0;
  const initialAllocation = Array(N).fill(1.0 / N);

  // Compute initial step for A
  const stepA = computeHRMTransitionStep(Phi_A, G_A, T_A, M_A, initialTime, 1.0, [], initialAllocation);
  // Compute initial step for B
  const stepB = computeHRMTransitionStep(Phi_B, G_B, T_B, M_B, initialTime, 1.0, [], initialAllocation);

  const modelA: ProductStateX = {
    timeMs: initialTime,
    Phi: stepA.Phi_next,
    G: G_A,
    T: stepA.updatedT,
    M: stepA.updatedM,
    C: stepA.ledger,
    H: H_A,
    B: stepA.allocation,
  };

  const modelB: ProductStateX = {
    timeMs: initialTime + FORWARD_PROJECTION_HORIZON_MS,
    Phi: stepB.Phi_next,
    G: G_B,
    T: stepB.updatedT,
    M: stepB.updatedM,
    C: stepB.ledger,
    H: H_B,
    B: stepB.allocation,
  };

  const initialDivergence: DivergenceMetrics = {
    timestampMs: 0,
    euclideanDivergence: 0.05,
    channelDivergences: [0.02, 0.04, 0.01, 0.005],
    maxNodeDivergence: { nodeId: 'ashburn', divergence: 0.05 },
    anomalyDetected: false,
  };

  return {
    timeMs: 0,
    dt: 1.0, // 1 ms simulation resolution
    modelA,
    modelB,
    divergence: initialDivergence,
    divergenceHistory: [{ timeMs: 0, div: 0.05 }],
    activeEvents: [],
    eventHistory: [],
  };
}

/**
 * Steps the dual-worldmodel system by dt milliseconds
 */
export function stepDualWorldmodel(
  state: DualWorldmodelState,
  dt: number = 1.0,
  subSteps: number = 1
): DualWorldmodelState {
  let currentState = state;
  for (let s = 0; s < subSteps; s++) {
    currentState = executeSingleStep(currentState, dt / subSteps);
  }
  return currentState;
}

function executeSingleStep(state: DualWorldmodelState, dt: number): DualWorldmodelState {
  const nextTimeMs = state.timeMs + dt;
  const N = state.modelA.Phi.length;

  // Prune expired transient events
  const liveEvents = state.activeEvents.filter(
    ev => !ev.durationMs || (nextTimeMs - ev.timeMs) <= ev.durationMs
  );

  // 1. Advance Model A (Ground Truth)
  const G_A = state.modelA.G;
  const T_A = state.modelA.T;
  const M_A = state.modelA.M;

  const resA = computeHRMTransitionStep(
    state.modelA.Phi,
    G_A,
    T_A,
    M_A,
    nextTimeMs,
    dt,
    liveEvents,
    state.modelA.B.dispatchVector
  );

  // 2. Ingest delayed telemetry packets into Horizon H_A
  // Observer Hub (Ashburn) receives telemetry packets after physical fiber latency
  const observerIdx = G_A.nodes.findIndex(n => n.id === OBSERVER_HUB_ID);
  let currentInflight = state.modelA.H.inflightPackets;

  // Emit packets roughly every 20ms of simulation time
  if (Math.floor(nextTimeMs / 20) !== Math.floor(state.timeMs / 20)) {
    const newPackets: TelemetryPacket[] = [];
    for (let i = 0; i < N; i++) {
      const node = G_A.nodes[i];
      const delayMs = G_A.propagationLatency[i][observerIdx >= 0 ? observerIdx : 0];
      newPackets.push({
        nodeId: node.id,
        timestamp: nextTimeMs,
        sentAt: nextTimeMs,
        deliverAt: nextTimeMs + delayMs,
        fields: [...resA.Phi_next[i]] as FieldChannels,
      });
    }
    currentInflight = [...currentInflight, ...newPackets];
  }

  // Filter arrived packets vs still inflight (and prune old delivered)
  const updatedInflight = currentInflight.filter(pkt => pkt.deliverAt > nextTimeMs).slice(-80);

  const nextModelA: ProductStateX = {
    timeMs: nextTimeMs,
    Phi: resA.Phi_next,
    G: G_A,
    T: resA.updatedT,
    M: resA.updatedM,
    C: resA.ledger,
    H: {
      ...state.modelA.H,
      inflightPackets: updatedInflight,
    },
    B: resA.allocation,
  };

  // 3. Advance Model B (Predictive Counterfactual Twin)
  // Model B projects forward trajectory into the future
  // It evaluates proactive counterfactual dispatch without delay horizons
  const G_B = state.modelB.G;
  const T_B = state.modelB.T;
  const M_B = state.modelB.M;
  const lookaheadTimeMs = nextTimeMs + FORWARD_PROJECTION_HORIZON_MS;

  const resB = computeHRMTransitionStep(
    state.modelB.Phi,
    G_B,
    T_B,
    M_B,
    lookaheadTimeMs,
    dt,
    liveEvents,
    state.modelB.B.dispatchVector
  );

  const nextModelB: ProductStateX = {
    timeMs: lookaheadTimeMs,
    Phi: resB.Phi_next,
    G: G_B,
    T: resB.updatedT,
    M: resB.updatedM,
    C: resB.ledger,
    H: state.modelB.H,
    B: resB.allocation,
  };

  // 4. Calculate Divergence Score between Model A and Model B
  // Normalized across the 4 channel scales: GPU (100), Queue (80), Thermal (40), PUE (0.5)
  const channelScale = [50.0, 40.0, 20.0, 0.4];
  let sumEuclidean = 0;
  const channelDivs: [number, number, number, number] = [0, 0, 0, 0];
  let maxNodeId = G_A.nodes[0].id;
  let maxNodeDiv = 0;

  for (let i = 0; i < N; i++) {
    const phiA = nextModelA.Phi[i];
    const phiB = nextModelB.Phi[i];
    let nodeDistSq = 0;

    for (let c = 0; c < 4; c++) {
      const diffNorm = (phiA[c] - phiB[c]) / channelScale[c];
      const diffSq = diffNorm * diffNorm;
      channelDivs[c] += Math.abs(phiA[c] - phiB[c]) / N;
      nodeDistSq += diffSq;
    }

    const nodeDist = Math.sqrt(nodeDistSq);
    sumEuclidean += nodeDist;
    if (nodeDist > maxNodeDiv) {
      maxNodeDiv = nodeDist;
      maxNodeId = G_A.nodes[i].id;
    }
  }

  const avgDivergence = sumEuclidean / N;
  const anomalyDetected = avgDivergence > DIVERGENCE_ANOMALY_THRESHOLD;

  const divergenceMetrics: DivergenceMetrics = {
    timestampMs: nextTimeMs,
    euclideanDivergence: Number(avgDivergence.toFixed(3)),
    channelDivergences: [
      Number(channelDivs[0].toFixed(2)),
      Number(channelDivs[1].toFixed(2)),
      Number(channelDivs[2].toFixed(2)),
      Number(channelDivs[3].toFixed(3)),
    ],
    maxNodeDivergence: {
      nodeId: maxNodeId,
      divergence: Number(maxNodeDiv.toFixed(2)),
    },
    anomalyDetected,
  };

  // Keep a rolling window of divergence history (last 120 points)
  const updatedHistory = [...state.divergenceHistory, { timeMs: nextTimeMs, div: avgDivergence }];
  if (updatedHistory.length > 120) {
    updatedHistory.shift();
  }

  return {
    ...state,
    timeMs: nextTimeMs,
    activeEvents: liveEvents,
    modelA: nextModelA,
    modelB: nextModelB,
    divergence: divergenceMetrics,
    divergenceHistory: updatedHistory,
  };
}

/**
 * Injects a discrete event into both or either worldmodel (supports toggle-to-repair)
 */
export function injectDiscreteEvent(
  state: DualWorldmodelState,
  event: DiscreteEvent
): DualWorldmodelState {
  // 1. Toggle Cable Severance if already severed
  if (event.type === 'CABLE_SEVER' && event.targetId) {
    const existingIdx = state.activeEvents.findIndex(
      e => e.type === 'CABLE_SEVER' && e.targetId === event.targetId
    );

    if (existingIdx >= 0) {
      // Toggle back to repaired!
      const applyRepair = (G: CarrierComplexG) => {
        const links = G.links.map(l =>
          l.id === event.targetId ? { ...l, isSevered: false, health: 1.0 } : l
        );
        const { adjacency, laplacian } = recalculateMatrices(G.nodes, links);
        return { ...G, links, adjacency, laplacian };
      };

      const repairEvent: DiscreteEvent = {
        id: `repair_${Date.now()}`,
        timeMs: state.timeMs,
        type: 'TOPOLOGY_RESTORE',
        label: `Repaired Trunk`,
        description: `Reconnected severed cable: ${event.targetId}`,
        targetId: event.targetId,
        magnitude: 1.0,
      };

      return {
        ...state,
        activeEvents: state.activeEvents.filter((_, idx) => idx !== existingIdx),
        eventHistory: [repairEvent, ...state.eventHistory].slice(0, 50),
        modelA: { ...state.modelA, G: applyRepair(state.modelA.G) },
        modelB: { ...state.modelB, G: applyRepair(state.modelB.G) },
      };
    }
  }

  // 2. Toggle Node Thermal Trip if already tripped
  if (event.type === 'NODE_THERMAL_TRIP' && event.targetId) {
    const existingTripIdx = state.activeEvents.findIndex(
      e => e.type === 'NODE_THERMAL_TRIP' && e.targetId === event.targetId
    );

    if (existingTripIdx >= 0) {
      // Toggle back to nominal!
      const untripEvent: DiscreteEvent = {
        id: `untrip_${Date.now()}`,
        timeMs: state.timeMs,
        type: 'TOPOLOGY_RESTORE',
        label: `Cooled Node`,
        description: `Restored thermal cooling on: ${event.targetId}`,
        targetId: event.targetId,
        magnitude: 1.0,
      };

      return {
        ...state,
        activeEvents: state.activeEvents.filter((_, idx) => idx !== existingTripIdx),
        eventHistory: [untripEvent, ...state.eventHistory].slice(0, 50),
      };
    }
  }

  // Set transient duration for impulse spikes
  const normalizedEvent: DiscreteEvent = {
    ...event,
    durationMs:
      event.durationMs !== undefined
        ? event.durationMs
        : event.type === 'MICROBURST_SPIKE'
        ? 400
        : event.type === 'SOLAR_SHIFT'
        ? 800
        : undefined,
  };

  const newActive = [...state.activeEvents, normalizedEvent];
  const newHistory = [normalizedEvent, ...state.eventHistory].slice(0, 50);

  // If the event mutates a fiber link topology, sever that link in G_A and G_B
  let nextModelA = { ...state.modelA };
  let nextModelB = { ...state.modelB };

  if (normalizedEvent.type === 'CABLE_SEVER' && normalizedEvent.targetId) {
    const applySever = (G: CarrierComplexG) => {
      const links = G.links.map(l =>
        l.id === normalizedEvent.targetId ? { ...l, isSevered: true, health: 0.0 } : l
      );
      const { adjacency, laplacian } = recalculateMatrices(G.nodes, links);
      return { ...G, links, adjacency, laplacian };
    };

    nextModelA = { ...nextModelA, G: applySever(state.modelA.G) };
    nextModelB = { ...nextModelB, G: applySever(state.modelB.G) };
  } else if (normalizedEvent.type === 'TOPOLOGY_RESTORE') {
    const restoreAll = (G: CarrierComplexG) => {
      const links = G.links.map(l => ({ ...l, isSevered: false, health: 1.0 }));
      const { adjacency, laplacian } = recalculateMatrices(G.nodes, links);
      return { ...G, links, adjacency, laplacian };
    };

    nextModelA = { ...nextModelA, G: restoreAll(state.modelA.G) };
    nextModelB = { ...nextModelB, G: restoreAll(state.modelB.G) };
    return {
      ...state,
      activeEvents: [],
      eventHistory: newHistory,
      modelA: nextModelA,
      modelB: nextModelB,
    };
  }

  return {
    ...state,
    activeEvents: newActive,
    eventHistory: newHistory,
    modelA: nextModelA,
    modelB: nextModelB,
  };
}
