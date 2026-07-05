import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { dashboardApi } from '../lib/dashboardApi';

interface TrainerData {
  id: string;
  name: string;
  totalClasses: number;
  privateClasses: number;
  groupClasses: number;
}

export const TrainerUtilizationChart: React.FC = () => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<TrainerData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUtilization = async () => {
      try {
        const response = await dashboardApi.getTrainerUtilization();
        setData(response.trainers);
        setLoading(false);
      } catch (e) {
        console.error('Error fetching typed trainer utilization', e);
        setLoading(false);
      }
    };
    fetchUtilization();
  }, []);

  useEffect(() => {
    if (!data.length || !chartRef.current) return;

    const container = chartRef.current;
    container.innerHTML = '';
    
    // Set up dimensions
    const margin = { top: 30, right: 30, bottom: 60, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleBand()
      .range([0, width])
      .domain(data.map(d => d.name))
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max<TrainerData, number>(data, d => d.totalClasses) || 10])
      .nice()
      .range([height, 0]);

    // X Axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'translate(-10,0)rotate(-45)')
      .style('text-anchor', 'end')
      .style('font-size', '12px')
      .style('fill', '#64748b');

    // Y Axis
    svg.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#64748b');

    // Remove domain lines
    svg.selectAll('.domain').remove();
    // Gridlines
    svg.selectAll('.tick line').attr('stroke', '#e2e8f0');

    // Stack data
    const stack = d3.stack<TrainerData>()
      .keys(['privateClasses', 'groupClasses']);
    const stackedData = stack(data);

    // Color scale
    const color = d3.scaleOrdinal<string>()
      .domain(['privateClasses', 'groupClasses'])
      .range(['#10b981', '#6366f1']); // emerald for private, indigo for group

    // Tooltip
    const tooltip = d3.select(container)
      .append('div')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', '#fff')
      .style('border', '1px solid #e2e8f0')
      .style('border-radius', '8px')
      .style('padding', '8px')
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('box-shadow', '0 4px 6px -1px rgb(0 0 0 / 0.1)');

    // Bars
    svg.append('g')
      .selectAll('g')
      .data(stackedData)
      .join('g')
      .attr('fill', d => color(d.key))
      .selectAll('rect')
      .data(d => d)
      .join('rect')
        .attr('x', d => x(d.data.name) || 0)
        .attr('y', d => y(d[1]))
        .attr('height', d => Math.max(0, y(d[0]) - y(d[1])))
        .attr('width', x.bandwidth())
        .on('mouseover', function(event, d) {
          const type = (d3.select((this as any).parentNode).datum() as any).key;
          const label = type === 'privateClasses' ? 'Private' : 'Group';
          const value = d[1] - d[0];
          
          d3.select(this).attr('opacity', 0.8);
          tooltip.transition().duration(200).style('opacity', 1);
          tooltip.html(`
            <div class="font-bold text-slate-800">${d.data.name}</div>
            <div class="text-slate-600">${label}: ${value}</div>
            <div class="text-slate-500 text-[10px] mt-1">Total: ${d.data.totalClasses}</div>
          `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
        })
        .on('mousemove', function(event) {
           tooltip.style('left', (event.pageX + 10) + 'px')
                  .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
          d3.select(this).attr('opacity', 1);
          tooltip.transition().duration(500).style('opacity', 0);
        });

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 100}, 0)`);
    
    legend.append('rect').attr('x', 0).attr('y', 0).attr('width', 12).attr('height', 12).attr('fill', '#6366f1').attr('rx', 2);
    legend.append('text').attr('x', 18).attr('y', 10).text('Group').style('font-size', '12px').style('fill', '#64748b');
    
    legend.append('rect').attr('x', 0).attr('y', 20).attr('width', 12).attr('height', 12).attr('fill', '#10b981').attr('rx', 2);
    legend.append('text').attr('x', 18).attr('y', 30).text('Private').style('font-size', '12px').style('fill', '#64748b');

  }, [data]);

  if (loading) {
     return <div className="h-[300px] flex items-center justify-center text-slate-400">Loading utilization data...</div>;
  }

  if (data.length === 0) {
     return <div className="h-[300px] flex items-center justify-center text-slate-400">No trainer data available.</div>;
  }

  return (
    <div className="relative w-full h-[300px]" ref={chartRef}></div>
  );
};
