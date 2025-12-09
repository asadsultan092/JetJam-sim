export enum AttackType {
  NONE = 'None',
  CONSTANT = 'Constant',
  REACTIVE = 'Reactive',
  RANDOM = 'Random',
  SWEEP = 'Sweep',
  INTELLIGENT = 'Intelligent'
}

export interface Node {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isJammer: boolean;
  isTarget: boolean; // For intelligent attacks
  battery: number;
  packetQueue: number;
}

export interface Link {
  source: number; // Node ID
  target: number; // Node ID
  quality: number; // 0.0 to 1.0 (Impacted by jamming)
}

export interface Packet {
  id: string;
  sourceId: number;
  targetId: number;
  x: number;
  y: number;
  progress: number; // 0 to 1
  delivered: boolean;
  lost: boolean;
  createdAt: number; // For latency calculation
}

export interface NetworkMetrics {
  timestamp: number;
  pdr: number; // Packet Delivery Ratio
  throughput: number; // Packets per second
  latency: number; // Avg ms
  energyConsumed: number; // Abstract units
  activeNodes: number;
  jammingIntensity: number; // 0-1 measure of current attack power
}

export interface SimulationLog {
  timestamp: number;
  attackType: AttackType;
  pdr: number;
  plr: number; // Packet Loss Rate (1 - PDR)
  throughput: number;
  latency: number; // Average latency in ms
  energy: number;
  avgLinkQuality: number; // Average signal quality across network
  jammingIntensity: number;
}