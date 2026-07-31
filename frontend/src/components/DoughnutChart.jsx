import React, { useMemo } from 'react'
import PropTypes from 'prop-types'

/**
 * A premium, SVG-based doughnut chart with high-DPI support and minimal overhead.
 */
export default function DoughnutChart({ data = [], size = 160, thickness = 24 }) {
  const rows = Array.isArray(data) ? data : []
  const total = useMemo(() => rows.reduce((acc, d) => acc + (d.count || 0), 0), [rows])

  const center = size / 2
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius

  const segments = useMemo(() => {
    let currentOffset = 0
    return rows.map((d, i) => {
      const share = d.count / (total || 1)
      const strokeLength = share * circumference
      const offset = currentOffset
      currentOffset += strokeLength

      // Compute color in JS to avoid CSS calc() pitfalls
      // Use the global brand hue (default 200) + offset
      const hue = (200 + (i * 45)) % 360
      const color = d.color || `hsl(${hue}, 60%, 50%)`

      return { ...d, strokeLength, offset, color }
    })
  }, [rows, total, circumference])

  return (
    <div className="flex flex-col sm:flex-row items-center gap-10">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size} height={size} viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90 transform" // Start from top
        >
          {/* Background track */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke="currentColor" strokeWidth={thickness}
            className="text-slate-800"
          />
          {/* Segments */}
          {total > 0 && segments.map((seg, i) => (
            <circle
              key={i}
              cx={center} cy={center} r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${seg.strokeLength} ${circumference}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap={seg.strokeLength > 5 ? "round" : "butt"} // Avoid rounding for tiny slivers
              className="transition-all duration-700 ease-out hover:opacity-80"
              style={{ stroke: seg.color }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-white">{total >= 1000 ? (total/1000).toFixed(1)+'k' : total}</span>
          <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Total</span>
        </div>
      </div>

      {/* Premium Legend with Checkboxes */}
      <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-2">
        {segments.map((d, i) => {
          const perc = total > 0 ? ((d.count / total) * 100).toFixed(1) : 0
          return (
            <div key={i} className="flex items-center justify-between text-[11px] group cursor-pointer hover:bg-white/5 p-1 px-2 rounded-lg transition-colors">
              <div className="flex items-center gap-3 truncate">
                <div
                  className="w-3.5 h-3.5 rounded border border-white/10 flex items-center justify-center shrink-0 transition-all group-hover:border-white/20 shadow-inner"
                  style={{ backgroundColor: `${d.color}20` }}
                >
                  <div className="w-1.5 h-1.5 rounded-sm shadow-sm" style={{ backgroundColor: d.color }} />
                </div>
                <span className="text-slate-400 truncate group-hover:text-slate-200 transition-colors uppercase tracking-tight font-medium" title={d.label}>
                  {d.label}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <span className="text-white font-bold font-mono">{perc}%</span>
                <div className="w-4 h-4 text-slate-600 group-hover:text-brand-500 transition-colors">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

DoughnutChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    count: PropTypes.number.isRequired,
    color: PropTypes.string
  })),
  size: PropTypes.number,
  thickness: PropTypes.number
}
