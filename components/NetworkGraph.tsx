import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Node, Link, Packet, AttackType } from '../types';

interface NetworkGraphProps {
  nodes: Node[];
  links: Link[];
  packets: Packet[];
  attackType: AttackType;
  width: number;
  height: number;
}

const NetworkGraph: React.FC<NetworkGraphProps> = ({
  nodes,
  links,
  packets,
  attackType,
  width,
  height,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    // Define gradients and filters
    const defs = svg.append("defs");
    
    // Glow filter
    const filter = defs.append("filter")
        .attr("id", "glow");
    filter.append("feGaussianBlur")
        .attr("stdDeviation", "2.5")
        .attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Jammer Pulse Gradient
    const radialGradient = defs.append("radialGradient")
        .attr("id", "jammerGradient")
        .attr("cx", "50%")
        .attr("cy", "50%")
        .attr("r", "50%")
        .attr("fx", "50%")
        .attr("fy", "50%");
    radialGradient.append("stop")
        .attr("offset", "0%")
        .attr("style", "stop-color:rgb(239, 68, 68);stop-opacity:0.6");
    radialGradient.append("stop")
        .attr("offset", "100%")
        .attr("style", "stop-color:rgb(239, 68, 68);stop-opacity:0");

    // --- Draw Links ---
    svg.append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("x1", d => nodes.find(n => n.id === d.source)?.x || 0)
      .attr("y1", d => nodes.find(n => n.id === d.source)?.y || 0)
      .attr("x2", d => nodes.find(n => n.id === d.target)?.x || 0)
      .attr("y2", d => nodes.find(n => n.id === d.target)?.y || 0)
      .attr("stroke", d => {
         // Link turns red/faded if quality is low due to jamming
         return d.quality < 0.3 ? "#ef4444" : "#3b82f6";
      })
      .attr("stroke-width", d => Math.max(0.5, d.quality * 2))
      .attr("stroke-opacity", d => Math.max(0.1, d.quality * 0.5));

    // --- Draw Jamming Radius (Visual Effect) ---
    const jammer = nodes.find(n => n.isJammer);
    if (jammer && attackType !== AttackType.NONE) {
        svg.append("circle")
            .attr("cx", jammer.x)
            .attr("cy", jammer.y)
            .attr("r", attackType === AttackType.SWEEP ? 150 : 100)
            .attr("fill", "url(#jammerGradient)")
            .attr("class", "animate-pulse");
    }

    // --- Draw Nodes ---
    const nodeGroup = svg.append("g")
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.isJammer ? 12 : (d.isTarget ? 8 : 5))
      .attr("fill", d => {
        if (d.isJammer) return "#ef4444"; // Red
        if (d.isTarget) return "#f59e0b"; // Orange (target of intelligent attack)
        return "#60a5fa"; // Blue
      })
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 2)
      .style("filter", d => d.isJammer ? "url(#glow)" : "none");

    // --- Draw Packets ---
    svg.append("g")
      .selectAll("circle")
      .data(packets.filter(p => !p.delivered && !p.lost))
      .enter()
      .append("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 3)
      .attr("fill", "#22c55e") // Green packets
      .attr("class", "packet");

  }, [nodes, links, packets, attackType, width, height]);

  return (
    <div className="rounded-xl overflow-hidden border border-cyber-700 bg-cyber-900 shadow-2xl relative">
        <div className="absolute top-2 left-2 text-xs text-cyber-400 font-mono z-10 bg-cyber-800/80 p-2 rounded">
            <div>Nodes: {nodes.length}</div>
            <div>Active Packets: {packets.length}</div>
            <div>Mode: {attackType}</div>
        </div>
      <svg 
        ref={svgRef} 
        width={width} 
        height={height} 
        className="block w-full h-full"
        style={{ background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)' }}
      />
    </div>
  );
};

export default NetworkGraph;