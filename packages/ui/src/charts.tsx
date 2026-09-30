import { tokens } from "@pgrs/config/tokens";

/** Simple dependency-free SVG bar chart for dashboards. */
export function BarChart({
  data,
  height = 160,
  formatLabel,
  formatValue,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  formatLabel?: (label: string) => string;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg
        viewBox={`0 0 100 ${height / 4}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="Bar chart"
      >
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 4 - 6);
          return (
            <rect
              key={d.label + i}
              x={i * barWidth + barWidth * 0.18}
              y={height / 4 - h}
              width={barWidth * 0.64}
              height={Math.max(0.4, h)}
              rx="0.8"
              fill={tokens.color.primary}
              opacity={0.55 + 0.45 * (d.value / max)}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        {data.map((d, i) => (
          <span key={d.label + i} className="flex-1 truncate text-center">
            {formatLabel ? formatLabel(d.label) : d.label}
          </span>
        ))}
      </div>
      {formatValue ? (
        <div className="mt-1 text-right text-[10px] text-muted">peak {formatValue(max)}</div>
      ) : null}
    </div>
  );
}
