import React, { useMemo } from 'react'
import PropTypes from 'prop-types'

/**
 * A premium, SVG-based doughnut chart with high-DPI support and minimal overhead.
 */
export default function DoughnutChart({ data = [], size = 160, thickness = 24 }) {
  const total = useMemo(() => data.reduce((acc, d) => acc + d.count, 0), [data])
  
  const segments = useMemo(() => {
    let currentAngle = -90 // Start at top
    return data.map((d, i) => {
      const angle = (d.count / (total || 1)) * 360
      const startAngle = currentAngle
      currentAngle += angle
      return { 
        ...d, 
        startAngle, 
        endAngle: currentAngle,
        color: d.color || `calc(var(--brand-hue) + ${i * 40}deg)`
      }
    })
  }, [data, total])

  const center = size / 2
  const radius = (size - thickness) / 2

  const getPath = (start, end) => {
    const startRad = (start * Math.PI) / 180
    const endRad = (end * Math.PI) / 180
    const x1 = center + radius * Math.cos(startRad)
    const y1 = center + radius * Math.sin(startRad)
    const x2 = center + radius * Math.cos(endRad)
    const y2 = center + radius * Math.sin(endRad)
    const largeArc = end - start > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`
  }

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background track */}
          <circle 
            cx={center} cy={center} r={radius} 
            fill="none" stroke="currentColor" strokeWidth={thickness}
            className="text-slate-800"
          />
          {/* Segments */}
          {total > 0 && segments.map((seg, i) => (
            <path
              key={i}
              d={getPath(seg.startAngle, seg.endAngle)}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeLinecap="round"
              className="transition-all duration-500 ease-out hover:opacity-80"
              style={{ stroke: seg.color.startsWith('calc') ? `hsl(${seg.color}, 60%, 50%)` : seg.color }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-white">{total >= 1000 ? (total/1000).toFixed(1)+'k' : total}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Total</span>
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-hidden">
        {data.map((d, i) => {
          const perc = total > 0 ? ((d.count / total) * 100).toFixed(1) : 0
          const color = d.color || `hsl(calc(var(--brand-hue) + ${i * 40}deg), 60%, 50%)`
          return (
            <div key={i} className="flex items-center justify-between text-xs group cursor-default">
              <div className="flex items-center gap-2 truncate">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-slate-400 truncate group-hover:text-white transition-colors" title={d.label}>
                  {d.label}
                </span>
              </div>
              <span className="text-slate-500 ml-2 font-mono whitespace-nowrap">{perc}%</span>
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
