import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { SimulationLog } from '../types';

interface MetricsPanelProps {
  data: SimulationLog[];
}

const MetricsPanel: React.FC<MetricsPanelProps> = ({ data }) => {
  // Take last 30 data points for cleaner real-time graph
  const recentData = data.slice(-30);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
      {/* PDR Chart */}
      <div className="bg-cyber-800 rounded-lg p-4 border border-cyber-700 flex flex-col h-64">
        <h3 className="text-sm font-semibold text-cyber-400 mb-2 font-mono">PDR (Delivery Ratio)</h3>
        <div className="flex-1 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={recentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="timestamp" hide />
              <YAxis domain={[0, 1]} stroke="#94a3b8" fontSize={10} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
                labelStyle={{ display: 'none' }}
              />
              <Area type="monotone" dataKey="pdr" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Latency Chart (New) */}
      <div className="bg-cyber-800 rounded-lg p-4 border border-cyber-700 flex flex-col h-64">
        <h3 className="text-sm font-semibold text-cyber-400 mb-2 font-mono">Avg Latency (ms)</h3>
        <div className="flex-1 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={recentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="timestamp" hide />
              <YAxis stroke="#94a3b8" fontSize={10} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
                labelStyle={{ display: 'none' }}
              />
              <Line type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Throughput Chart */}
      <div className="bg-cyber-800 rounded-lg p-4 border border-cyber-700 flex flex-col h-64">
        <h3 className="text-sm font-semibold text-cyber-400 mb-2 font-mono">Throughput (Pkts/s)</h3>
        <div className="flex-1 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={recentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="timestamp" hide />
              <YAxis stroke="#94a3b8" fontSize={10} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }}
                labelStyle={{ display: 'none' }}
              />
              <Line type="monotone" dataKey="throughput" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default MetricsPanel;