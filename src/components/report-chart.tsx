import type { ChartModel } from "@/lib/chart-model";

/**
 * Inline SVG, rendered on the server. No chart library and no client JavaScript:
 * these are bars, the data is already on the server, and a payload uploaded over
 * FTP to shared hosting does not need another 40kB of runtime.
 *
 * Colours come from the CSS tokens, so the theme toggle and the OS setting both
 * swap them without this component knowing which mode it is in.
 */
const SLOT_FILL = {
  1: "var(--viz-1)",
  2: "var(--viz-2)",
  3: "var(--viz-3)",
  4: "var(--viz-4)",
  seq: "var(--viz-seq)",
} as const;

/** A 2px gap in the surface colour is what separates touching segments. */
const GAP = 2;
const BAR = 18; // <= 24px per the mark spec; the band's leftover is air
const ROW_GAP = 10;
const RADIUS = 4;

/**
 * The viewBox is sized near a phone's content width on purpose. An SVG with
 * `width: 100%` scales its text along with everything else, so a canvas wider
 * than the screen shrinks 11px labels into something nobody can read — on the
 * device this app is for. At this width the phone renders roughly 1:1 and a
 * desktop scales it up, which is the right direction to be wrong in.
 */
const LABEL_WIDTH = 86;
const VALUE_WIDTH = 26;
const PLOT_WIDTH = 190;

/**
 * A rectangle with only two corners rounded. `rx` on a <rect> rounds all four,
 * which would round the end that meets the previous segment or the baseline —
 * the spec is a rounded data-end and a square start, and that difference is
 * what makes a stack read as one bar rather than a row of pills.
 */
function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  round: "right" | "top" | "none",
): string {
  const r = Math.min(RADIUS, width / 2, height / 2);
  if (round === "none" || r <= 0) {
    return `M${x} ${y}h${width}v${height}h${-width}z`;
  }
  if (round === "right") {
    return `M${x} ${y}h${width - r}a${r} ${r} 0 0 1 ${r} ${r}v${height - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(width - r)}z`;
  }
  // Top: for a column, rounded cap and square where it meets the baseline.
  return `M${x} ${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${width - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${height - r}h${-width}z`;
}

function Legend({ model }: { model: ChartModel }) {
  // One series needs no legend: there is a single colour and the caption names it.
  if (model.series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
      {model.series.map((series) => (
        <li key={series.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: SLOT_FILL[series.slot] }}
          />
          {series.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Horizontal stacked bars. Horizontal because the labels are people's names, and
 * a vertical version would either clip them or turn them sideways.
 */
/** What a screen reader hears instead of the picture. */
function describe(model: ChartModel, title: string): string {
  const parts = model.rows
    .slice(0, 6)
    .map((row) =>
      model.series.length > 1
        ? `${row.label}: ${row.values
            .map((value, index) => `${model.series[index].label} ${value}`)
            .filter((_, index) => row.values[index] > 0)
            .join(", ")}`
        : `${row.label} ${row.values[0]}`,
    );
  const more = model.rows.length > parts.length ? ` and ${model.rows.length - parts.length} more` : "";
  return `${title}. ${parts.join(". ")}${more}.`;
}

function StackedBars({ model, label }: { model: ChartModel; label: string }) {
  const height = model.rows.length * (BAR + ROW_GAP);
  const width = LABEL_WIDTH + PLOT_WIDTH + VALUE_WIDTH;
  // Leave room for the gaps between segments, so a full-width bar plus its
  // gaps still ends before the value label rather than under it.
  const maxGaps = Math.max(...model.rows.map((row) => row.values.filter((v) => v > 0).length)) - 1;
  const scale = model.max > 0 ? (PLOT_WIDTH - Math.max(maxGaps, 0) * GAP) / model.max : 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      style={{ maxHeight: `${height}px` }}
      role="img"
      aria-label={label}
    >
      {model.rows.map((row, rowIndex) => {
        const y = rowIndex * (BAR + ROW_GAP);
        const total = row.values.reduce((sum, value) => sum + value, 0);
        let x = LABEL_WIDTH;

        return (
          <g key={row.label}>
            <text
              x={LABEL_WIDTH - 8}
              y={y + BAR / 2 + 4}
              textAnchor="end"
              className="fill-ink text-[12px] font-semibold"
            >
              {row.label.length > 13 ? `${row.label.slice(0, 12)}…` : row.label}
            </text>

            {row.values.map((value, index) => {
              if (value <= 0) return null;
              const segmentWidth = Math.max(value * scale, 2);
              const isLast = row.values.slice(index + 1).every((rest) => rest <= 0);
              const left = x;
              x += segmentWidth + GAP;

              return (
                <path
                  key={index}
                  d={barPath(left, y, segmentWidth, BAR, isLast ? "right" : "none")}
                  fill={SLOT_FILL[model.series[index].slot]}
                >
                  <title>{`${row.label} · ${model.series[index].label}: ${value}`}</title>
                </path>
              );
            })}

            {/* The total at the tip: one label per bar, not one per segment. */}
            <text
              x={LABEL_WIDTH + total * scale + GAP * row.values.filter((v) => v > 0).length + 6}
              y={y + BAR / 2 + 4}
              className="fill-muted text-[12px]"
            >
              {Number.isInteger(total) ? total : total.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Columns, for a count over time where the axis is months rather than names. */
function Columns({ model, label }: { model: ChartModel; label: string }) {
  // The columns are sized to fill a fixed plot width rather than the other way
  // round: twelve months at a fixed 24px each made a canvas wider than a phone,
  // and an SVG scaled to fit shrinks its labels with it.
  const count = Math.max(model.rows.length, 1);
  const gap = count > 16 ? 3 : count > 8 ? 5 : 10;
  const columnWidth = Math.max(8, (PLOT_WIDTH + LABEL_WIDTH - gap * (count - 1)) / count);
  const plotHeight = 110;
  const labelHeight = 26;
  /** Headroom for the value above the tallest column, which would otherwise be
      drawn above the canvas and clipped. */
  const headroom = 14;
  const width = count * columnWidth + gap * (count - 1);
  const height = headroom + plotHeight + labelHeight;
  const scale = model.max > 0 ? plotHeight / model.max : 0;
  const baseline = headroom + plotHeight;

  /**
   * Which columns get a number on the cap. Up to eight, all of them. Past that
   * the caps are 15px apart and a number on each is a row of noise — and when
   * most days are identical it is the repeated value that gets labelled while
   * the one short day, the only thing worth looking at, gets nothing. So label
   * the extremes instead: the first tallest column and the first shortest one
   * that still has something in it.
   */
  const values = model.rows.map((row) => row.values[0]);
  const lowest = Math.min(...values.filter((value) => value > 0), model.max);
  const labelled = new Set<number>();
  if (values.length <= 8) {
    values.forEach((value, index) => value > 0 && labelled.add(index));
  } else {
    const tallest = values.indexOf(model.max);
    if (tallest >= 0) labelled.add(tallest);
    const shortest = values.indexOf(lowest);
    if (shortest >= 0) labelled.add(shortest);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={label}
    >
      {/* A single hairline baseline, recessive: the bars carry the data. */}
      <line
        x1={0}
        y1={baseline}
        x2={width}
        y2={baseline}
        stroke="var(--viz-grid)"
        strokeWidth={1}
      />
      {model.rows.map((row, index) => {
        const value = row.values[0];
        const barHeight = value > 0 ? Math.max(value * scale, 3) : 0;
        const x = index * (columnWidth + gap);

        return (
          <g key={row.label}>
            {barHeight > 0 ? (
              <path
                d={barPath(x, baseline - barHeight, columnWidth, barHeight, "top")}
                fill={SLOT_FILL[model.series[0].slot]}
              >
                <title>{`${row.label}: ${value}`}</title>
              </path>
            ) : null}
            {labelled.has(index) ? (
              <text
                x={x + columnWidth / 2}
                y={baseline - barHeight - 5}
                textAnchor="middle"
                className="fill-ink text-[11px] font-semibold"
              >
                {value}
              </text>
            ) : null}
            <text
              x={x + columnWidth / 2}
              y={baseline + 13}
              textAnchor="middle"
              className={columnWidth < 14 ? "fill-muted text-[9px]" : "fill-muted text-[10px]"}
            >
              {row.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ReportChart({ model, title }: { model: ChartModel; title: string }) {
  // Nothing to plot is not an error, and an empty axis is worse than no chart.
  if (model.max <= 0 || model.rows.length === 0) return null;

  return (
    <figure className="mb-4 rounded-card border border-hairline bg-card p-4">
      <figcaption className="mb-2 text-sm font-bold text-ink">{title}</figcaption>
      <Legend model={model} />
      {model.shape === "stacked" ? (
        <StackedBars model={model} label={describe(model, title)} />
      ) : (
        <Columns model={model} label={describe(model, title)} />
      )}
    </figure>
  );
}
