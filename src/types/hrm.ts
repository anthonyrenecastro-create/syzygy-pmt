/**
 * Helical Recursive Manifold (HRM 4.0) Types
 * Mathematical Typed Product State: X_t = [Φ, G, T, M, C, H, B]
 */

export interface HubNode {
  id: string;
  name: string;
  code: string;
  lat: number;
  lng: number;
  country: string;
  region: 'Americas' | 'Europe' | 'APAC' | 'Africa' | 'Middle East';
  pueBaseline: number;
  coolingCapacityMw: number;
  solarExposureCoeff: number; // 0 to 1 daylight sensitivity
}

export interface FiberLink {
  id: string;
  sourceId: string;
  targetId: string;
  name: string;
  type: 'submarine' | 'terrestrial';
  lengthKm: number;
  latencyMs: number; // based on c_fiber = 200 km/ms
  capacityTbps: number;
  weight: number;
  isSevered: boolean;
  health: number; // 0.0 to 1.0
}

/**
 * Continuous Field Channels (Φ_t in R^{N x 4})
 * Channel 0: GPU Compute Utilization % [0, 100]
 * Channel 1: Egress Queue Latency ms [0, 250]
 * Channel 2: Thermal Headroom °C [0, 45]
 * Channel 3: Power Usage Effectiveness (PUE) [1.05, 2.0]
 */
export type FieldChannels = [number, number, number, number]; // [util, queueLatency, thermalHeadroom, pue]

export interface CarrierComplexG {
  nodes: HubNode[];
  links: FiberLink[];
  adjacency: number[][]; // N x N weight matrix W
  laplacian: number[][]; // N x N Graph Laplacian L = D - W
  distanceMatrix: number[][]; // N x N geodesic km
  propagationLatency: number[][]; // N x N fiber propagation ms
}

export interface TransportOperatorStateT {
  lastTopologyMutationTime: number;
  activeSeveredLinks: string[];
  divertedTrafficRatio: number;
  phantomEnergyResidual: number; // must remain ~0
}

export interface MetricTensorM {
  curvature: number[]; // scalar curvature per node
  helicalPhase: number[]; // theta_i coordinate phase
  radiusZ: number[]; // helical elevation / radius coordinate
}

export interface AttributionLedgerC {
  step: number;
  timestampMs: number;
  // Breakdown of Explanation Vector: ΔX_t = A_0 + A_k + A_ij + A_xi + A_event + A_corr + eps
  A_0: number[]; // Planetary diurnal follow-the-sun drift (norm or per channel)
  A_react: number[]; // Local node cubic reaction R_Φ
  A_diff: number[]; // Graph Laplacian diffusion -D_Φ L Φ
  A_xi: number[]; // Stochastic micro-bursts / Gaussian fluctuations
  A_event: number[]; // Discrete topological / operational perturbations
  A_corr: number[]; // Stabilization projection correction S_t ∘ P_t
  epsilon: number[]; // Residual vector
  totalDelta: number[]; // Total ΔX_t
  residualRatio: number; // ||ε_t|| / (||ΔX_t|| + δ)
  invariantPreserved: boolean; // true if residualRatio <= tau_ledger
}

export interface TelemetryPacket {
  nodeId: string;
  timestamp: number;
  sentAt: number;
  deliverAt: number;
  fields: FieldChannels;
}

export interface TelemetryHorizonH {
  inflightPackets: TelemetryPacket[];
  observerLocationId: string; // Ground truth telemetry aggregation hub (e.g. Ashburn)
  receivedHistory: Map<string, TelemetryPacket[]>;
}

export interface ResourceAllocationB {
  dispatchVector: number[]; // Workload a_i* summing to 1.0
  utilityScores: number[]; // u_i per node
  switchingPenalty: number; // λ_switch * ||a - a_{t-1}||_1
  totalBudgetCost: number;
  carbonIntensity: number[];
}

/**
 * Full Typed Product State X_t = [Φ, G, T, M, C, H, B]
 */
export interface ProductStateX {
  timeMs: number;
  Phi: FieldChannels[]; // N x 4
  G: CarrierComplexG;
  T: TransportOperatorStateT;
  M: MetricTensorM;
  C: AttributionLedgerC;
  H: TelemetryHorizonH;
  B: ResourceAllocationB;
}

export interface DiscreteEvent {
  id: string;
  timeMs: number;
  type: 'CABLE_SEVER' | 'NODE_THERMAL_TRIP' | 'SOLAR_SHIFT' | 'MICROBURST_SPIKE' | 'TOPOLOGY_RESTORE';
  label: string;
  description: string;
  targetId?: string; // link or node ID
  magnitude: number;
  durationMs?: number; // optional transient expiration in ms
}

export interface DivergenceMetrics {
  timestampMs: number;
  euclideanDivergence: number;
  channelDivergences: [number, number, number, number];
  maxNodeDivergence: {
    nodeId: string;
    divergence: number;
  };
  anomalyDetected: boolean;
}
