import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Download, Activity, ShieldAlert, Cpu, RefreshCw, Trash2 } from 'lucide-react';
import { Node, Link, Packet, AttackType, SimulationLog } from './types';
import NetworkGraph from './components/NetworkGraph';
import MetricsPanel from './components/MetricsPanel';
import { analyzeSimulationData } from './services/geminiService';

// Constants
const NODE_COUNT = 40;
const WIDTH = 800;
const HEIGHT = 500;
const MAX_RANGE = 120; // Communication range
const PACKET_SPEED = 3;
const LOG_INTERVAL = 500; // ms

// Helper to calculate distance
const dist = (n1: { x: number, y: number }, n2: { x: number, y: number }) => {
  return Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
};

const App: React.FC = () => {
  // State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [attackType, setAttackType] = useState<AttackType>(AttackType.NONE);
  const [logs, setLogs] = useState<SimulationLog[]>([]); // For UI visualization (limited buffer)
  const [geminiAnalysis, setGeminiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recordCount, setRecordCount] = useState(0); // Display count of total records
  
  // Refs for simulation loop to avoid closure staleness
  const nodesRef = useRef<Node[]>([]);
  const packetsRef = useRef<Packet[]>([]);
  const logsRef = useRef<SimulationLog[]>([]); // For UI sync
  const fullDatasetRef = useRef<SimulationLog[]>([]); // Unlimited storage for CSV
  const frameRef = useRef<number>(0);
  const lastLogTimeRef = useRef<number>(0);
  
  // Stats Counters (Reset every log interval)
  const packetsSentRef = useRef(0);
  const packetsDeliveredRef = useRef(0);
  const packetsLostRef = useRef(0);
  const accumulatedEnergyRef = useRef(0);
  const latencyAccumulatorRef = useRef<number[]>([]);
  
  // Attack State Refs
  const randomAttackStateRef = useRef({ isActive: false, nextSwitch: 0 });

  // --- Initialization ---
  const initializeNodes = useCallback(() => {
    const initialNodes: Node[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      initialNodes.push({
        id: i,
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        isJammer: i === 0, // Node 0 is the attacker
        isTarget: false,
        battery: 100,
        packetQueue: 0
      });
    }
    setNodes(initialNodes);
    nodesRef.current = initialNodes;
  }, []);

  useEffect(() => {
    initializeNodes();
  }, [initializeNodes]);

  // --- Simulation Logic ---
  const updateSimulation = useCallback(() => {
    if (!isRunning) return;

    let currentNodes = [...nodesRef.current];
    let currentPackets = [...packetsRef.current];
    const timestamp = Date.now();
    const jammer = currentNodes.find(n => n.isJammer);

    // 1. Move Nodes (Dynamic Topology)
    currentNodes = currentNodes.map(node => {
      let { x, y, vx, vy } = node;
      x += vx;
      y += vy;
      // Bounce off walls
      if (x <= 0 || x >= WIDTH) vx *= -1;
      if (y <= 0 || y >= HEIGHT) vy *= -1;
      return { ...node, x, y, vx, vy };
    });

    // 2. Determine Attack Parameters
    let jammingActive = false;
    let jammingPower = 0;
    
    if (jammer && attackType !== AttackType.NONE) {
      switch (attackType) {
        case AttackType.CONSTANT:
          jammingActive = true;
          jammingPower = 1.0;
          break;
        case AttackType.RANDOM:
          // Timer-based random switching
          if (timestamp > randomAttackStateRef.current.nextSwitch) {
            const isActive = Math.random() > 0.5;
            const duration = Math.random() * 1500 + 500; 
            randomAttackStateRef.current = { isActive, nextSwitch: timestamp + duration };
          }
          jammingActive = randomAttackStateRef.current.isActive;
          jammingPower = jammingActive ? 1.0 : 0.0;
          break;
        case AttackType.REACTIVE:
          // Jam only if packets are detected nearby
          const packetNearby = currentPackets.some(p => 
            !p.delivered && !p.lost && dist(p, jammer) < 100
          );
          jammingActive = packetNearby;
          jammingPower = packetNearby ? 1.0 : 0.0;
          break;
        case AttackType.SWEEP:
           // Power fluctuates as a sine wave
           jammingActive = true;
           jammingPower = (Math.sin(timestamp / 500) + 1) / 2;
           break;
        case AttackType.INTELLIGENT:
           // Target node with highest connectivity
           jammingActive = true;
           jammingPower = 0.9;
           
           // Recalculate target occasionally
           if (frameRef.current % 60 === 0) {
             let maxNeighbors = -1;
             let targetNode = null;
             currentNodes.forEach(n => {
               if (n.isJammer) return;
               const neighborCount = currentNodes.filter(other => 
                 n.id !== other.id && dist(n, other) < MAX_RANGE
               ).length;

               if (neighborCount > maxNeighbors) {
                 maxNeighbors = neighborCount;
                 targetNode = n;
               }
             });
             currentNodes.forEach(n => {
               n.isTarget = (targetNode && n.id === (targetNode as any).id) || false;
             });
           }
           break;
      }
    } else {
         currentNodes.forEach(n => n.isTarget = false);
    }

    // 3. Update Links & Calculate Interference
    const newLinks: Link[] = [];
    let totalQuality = 0;
    let linkCount = 0;

    for (let i = 0; i < currentNodes.length; i++) {
      for (let j = i + 1; j < currentNodes.length; j++) {
        const n1 = currentNodes[i];
        const n2 = currentNodes[j];
        const d = dist(n1, n2);
        
        if (d < MAX_RANGE) {
          // Base quality based on distance
          let quality = 1 - (d / MAX_RANGE);
          
          // Apply Jamming Impact
          if (jammingActive && jammer) {
             const distToJammer = Math.min(dist(n1, jammer), dist(n2, jammer));
             const isTargetedLink = n1.isTarget || n2.isTarget;
             const powerMultiplier = isTargetedLink && attackType === AttackType.INTELLIGENT ? 3.0 : 2.0;

             const jammerImpact = Math.max(0, 1 - (distToJammer / (attackType === AttackType.SWEEP ? 150 : 120))); 
             quality -= (jammerImpact * jammingPower * powerMultiplier); 
          }
          
          const finalQuality = Math.max(0, Math.min(1, quality));
          newLinks.push({ source: n1.id, target: n2.id, quality: finalQuality });
          
          totalQuality += finalQuality;
          linkCount++;
        }
      }
    }

    const avgLinkQuality = linkCount > 0 ? totalQuality / linkCount : 0;

    // 4. Packet Generation (Traffic)
    if (Math.random() < 0.15) { // Increased traffic slightly
      const source = currentNodes[Math.floor(Math.random() * currentNodes.length)];
      if (!source.isJammer) {
        const neighbors = newLinks
          .filter(l => (l.source === source.id || l.target === source.id) && l.quality > 0.1)
          .map(l => l.source === source.id ? l.target : l.source);
          
        if (neighbors.length > 0) {
          const targetId = neighbors[Math.floor(Math.random() * neighbors.length)];
          const target = currentNodes.find(n => n.id === targetId);
          if (target) {
            currentPackets.push({
              id: Math.random().toString(36),
              sourceId: source.id,
              targetId: targetId,
              x: source.x,
              y: source.y,
              progress: 0,
              delivered: false,
              lost: false,
              createdAt: timestamp
            });
            packetsSentRef.current++;
          }
        }
      }
    }

    // 5. Move Packets & Check Delivery
    currentPackets = currentPackets.map(p => {
      if (p.delivered || p.lost) return p;

      const source = currentNodes.find(n => n.id === p.sourceId);
      const target = currentNodes.find(n => n.id === p.targetId);
      
      if (!source || !target) {
        packetsLostRef.current++;
        return { ...p, lost: true };
      }

      // Find link quality
      const link = newLinks.find(l => 
        (l.source === p.sourceId && l.target === p.targetId) ||
        (l.target === p.sourceId && l.source === p.targetId)
      );

      // Packet Loss Logic
      if (!link || link.quality <= 0.2) {
          // High probability of loss if link is jammed or broken
          if (Math.random() < 0.15) {
            packetsLostRef.current++;
            return { ...p, lost: true };
          }
      }

      // Movement
      const totalDist = dist(source, target);
      const moveStep = PACKET_SPEED / totalDist;
      const newProgress = p.progress + moveStep;

      const newX = source.x + (target.x - source.x) * newProgress;
      const newY = source.y + (target.y - source.y) * newProgress;

      if (newProgress >= 1) {
        packetsDeliveredRef.current++;
        latencyAccumulatorRef.current.push(Date.now() - p.createdAt);
        return { ...p, x: target.x, y: target.y, progress: 1, delivered: true };
      }

      return { ...p, x: newX, y: newY, progress: newProgress };
    }).filter(p => !p.delivered && !p.lost);

    // 6. Logging
    if (timestamp - lastLogTimeRef.current > LOG_INTERVAL) {
       const sent = packetsSentRef.current;
       const delivered = packetsDeliveredRef.current;
       const lost = packetsLostRef.current;
       
       const pdr = sent === 0 ? 1 : delivered / (sent + 0.0001); 
       const plr = sent === 0 ? 0 : lost / (sent + 0.0001);
       const throughput = delivered * (1000 / LOG_INTERVAL); // pkts/sec
       
       const avgLatency = latencyAccumulatorRef.current.length > 0 
          ? latencyAccumulatorRef.current.reduce((a, b) => a + b, 0) / latencyAccumulatorRef.current.length 
          : 0;

       const newLog: SimulationLog = {
         timestamp,
         attackType,
         pdr: parseFloat(pdr.toFixed(3)),
         plr: parseFloat(plr.toFixed(3)),
         throughput: parseFloat(throughput.toFixed(2)),
         latency: parseFloat(avgLatency.toFixed(2)),
         energy: parseFloat((accumulatedEnergyRef.current + (jammingActive ? 15 : 2)).toFixed(2)), 
         avgLinkQuality: parseFloat(avgLinkQuality.toFixed(3)),
         jammingIntensity: parseFloat(jammingPower.toFixed(2))
       };
       
       // Update UI Buffer (Limited)
       const updatedLogs = [...logsRef.current, newLog];
       if (updatedLogs.length > 50) updatedLogs.shift(); // Keep only 50 for smooth UI
       setLogs(updatedLogs);
       logsRef.current = updatedLogs;

       // Update Full Dataset (Unlimited)
       fullDatasetRef.current.push(newLog);
       setRecordCount(fullDatasetRef.current.length); // Trigger re-render for counter

       lastLogTimeRef.current = timestamp;
       
       // Reset counters
       packetsSentRef.current = 0;
       packetsDeliveredRef.current = 0;
       packetsLostRef.current = 0;
       latencyAccumulatorRef.current = [];
    }

    // Update Refs
    nodesRef.current = currentNodes;
    packetsRef.current = currentPackets;
    
    // Update State for Render
    setNodes(currentNodes);
    setLinks(newLinks);
    setPackets(currentPackets);

    frameRef.current = requestAnimationFrame(updateSimulation);
  }, [isRunning, attackType]);

  useEffect(() => {
    if (isRunning) {
      frameRef.current = requestAnimationFrame(updateSimulation);
    } else {
      cancelAnimationFrame(frameRef.current);
    }
    return () => cancelAnimationFrame(frameRef.current);
  }, [isRunning, updateSimulation]);

  // --- Handlers ---
  const toggleSimulation = () => setIsRunning(!isRunning);

  const resetData = () => {
    fullDatasetRef.current = [];
    logsRef.current = [];
    setLogs([]);
    setRecordCount(0);
  };

  const exportCSV = () => {
    const headers = [
      "Timestamp", 
      "AttackType", 
      "PDR", 
      "PLR", 
      "Throughput", 
      "Latency_ms", 
      "Energy", 
      "AvgLinkQuality", 
      "JammingIntensity"
    ];
    
    // Use fullDatasetRef for CSV export
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + fullDatasetRef.current.map(row => 
          `${row.timestamp},${row.attackType},${row.pdr},${row.plr},${row.throughput},${row.latency},${row.energy},${row.avgLinkQuality},${row.jammingIntensity}`
        ).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `netjam_dataset_${attackType}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setGeminiAnalysis("Analyzing full dataset for ML feature extraction...");
    // Pass the full dataset for analysis, or a representative sample if too large
    const sampleSize = 100;
    const sample = fullDatasetRef.current.length > sampleSize 
        ? fullDatasetRef.current.slice(-sampleSize) 
        : fullDatasetRef.current;
        
    const result = await analyzeSimulationData(sample, attackType);
    setGeminiAnalysis(result);
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-cyber-900 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-cyber-700 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-cyber-400 font-mono tracking-tight flex items-center gap-2">
              <Activity className="w-8 h-8 text-cyber-accent" />
              NetJam Sim
            </h1>
            <p className="text-slate-400 text-sm mt-1">ML Data Generation Platform for Network Jamming</p>
          </div>
          <div className="mt-4 md:mt-0 flex gap-2 flex-wrap">
             <div className="flex items-center gap-2 bg-cyber-800 px-3 py-2 rounded text-xs font-mono border border-cyber-700">
               <span className="text-slate-400">Records:</span>
               <span className="text-cyber-accent font-bold">{recordCount}</span>
             </div>
             <button 
               onClick={resetData}
               className="p-2 rounded bg-cyber-800 text-cyber-danger hover:bg-cyber-700 border border-cyber-700 transition-colors"
               title="Reset Data"
             >
               <Trash2 size={18} />
             </button>
             <button 
               onClick={toggleSimulation}
               className={`flex items-center gap-2 px-4 py-2 rounded font-semibold transition-colors ${isRunning ? 'bg-cyber-800 text-cyber-400 hover:bg-cyber-700' : 'bg-cyber-500 text-white hover:bg-cyber-400'}`}
             >
               {isRunning ? <Pause size={18} /> : <Play size={18} />}
               {isRunning ? "Pause" : "Start"}
             </button>
             <button 
               onClick={exportCSV}
               disabled={recordCount === 0}
               className="flex items-center gap-2 px-4 py-2 rounded bg-cyber-800 text-cyber-400 hover:bg-cyber-700 border border-cyber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
             >
               <Download size={18} />
               Export CSV
             </button>
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Controls & Stats */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Attack Control Panel */}
            <div className="bg-cyber-800 rounded-xl p-5 border border-cyber-700 shadow-lg">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <ShieldAlert size={20} className="text-cyber-danger" />
                Select Attack Vector
              </h2>
              <div className="space-y-2">
                {Object.values(AttackType).map((type) => (
                  <button
                    key={type}
                    onClick={() => setAttackType(type)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all duration-200 flex items-center justify-between group
                      ${attackType === type 
                        ? 'bg-cyber-700 border-cyber-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
                        : 'bg-cyber-900/50 border-cyber-700 text-slate-400 hover:bg-cyber-700 hover:border-cyber-600'
                      }`}
                  >
                    <span className="font-mono text-sm">{type}</span>
                    {attackType === type && <div className="w-2 h-2 rounded-full bg-cyber-accent animate-pulse" />}
                  </button>
                ))}
              </div>
              <div className="mt-4 p-3 bg-cyber-900/50 rounded text-xs text-slate-400 border border-cyber-700/50">
                <span className="font-bold text-cyber-400">Description:</span> 
                {attackType === AttackType.NONE && " Baseline operation with no interference."}
                {attackType === AttackType.CONSTANT && " Continuous high-power signal jamming (High PLR, High Energy)."}
                {attackType === AttackType.REACTIVE && " Listens for activity, jams on transmission (Stealthy, Energy Efficient)."}
                {attackType === AttackType.RANDOM && " Intermittent jamming pulses (Unpredictable patterns)."}
                {attackType === AttackType.SWEEP && " Periodic power sweeps (Sinusoidal interference)."}
                {attackType === AttackType.INTELLIGENT && " Targets high-centrality nodes to maximize fragmentation."}
              </div>
            </div>

            {/* AI Analysis Panel */}
             <div className="bg-cyber-800 rounded-xl p-5 border border-cyber-700 shadow-lg flex flex-col h-[300px]">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Cpu size={20} className="text-purple-400" />
                    AI Analyst
                  </h2>
                  <button 
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || logs.length === 0}
                    className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {isAnalyzing ? <RefreshCw className="animate-spin" size={12} /> : null}
                    {isAnalyzing ? "Analyzing..." : "Analyze Impact"}
                  </button>
                </div>
                <div className="flex-1 bg-cyber-900 rounded p-4 overflow-y-auto text-sm text-slate-300 font-mono border border-cyber-700/50">
                  {geminiAnalysis ? (
                    <div className="whitespace-pre-wrap">{geminiAnalysis}</div>
                  ) : (
                    <div className="text-slate-600 italic text-center mt-10">
                      Run simulation to collect data, then click "Analyze" to get ML-focused insights on the jamming signature.
                    </div>
                  )}
                </div>
             </div>

          </div>

          {/* Right Column: Visualizer & Metrics */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Visualizer */}
            <div className="bg-black/20 rounded-xl overflow-hidden shadow-2xl border border-cyber-700 h-[500px]">
              <NetworkGraph 
                nodes={nodes} 
                links={links} 
                packets={packets} 
                attackType={attackType}
                width={WIDTH}
                height={HEIGHT}
              />
            </div>

            {/* Real-time Metrics */}
            <div className="h-64">
              <MetricsPanel data={logs} />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default App;