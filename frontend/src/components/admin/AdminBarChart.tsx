export type ChartDatum = {
  label: string;
  value: number;
  secondary?: number;
};

type SharedProps = {
  title: string;
  data: ChartDatum[];
  emptyLabel?: string;
  valueLabel?: string;
  secondaryLabel?: string;
};

export function AdminBarChart({
  title,
  data,
  emptyLabel = 'No data in this window',
  valueLabel = 'Total',
  secondaryLabel = 'Errors',
}: SharedProps) {
  const max = Math.max(1, ...data.map((item) => Math.max(item.value, item.secondary ?? 0)));
  const hasSecondary = data.some((item) => (item.secondary ?? 0) > 0);

  return (
    <article className="admin-chart-card">
      <header className="admin-chart-head">
        <h3>{title}</h3>
        {hasSecondary ? (
          <p className="muted admin-chart-legend">
            <span className="admin-chart-swatch primary" /> {valueLabel}
            <span className="admin-chart-swatch secondary" /> {secondaryLabel}
          </p>
        ) : null}
      </header>
      {data.length === 0 ? (
        <p className="muted admin-chart-empty">{emptyLabel}</p>
      ) : (
        <div className="admin-chart-bars" role="img" aria-label={title}>
          {data.map((item) => {
            const primaryHeight = `${Math.max(2, (item.value / max) * 100)}%`;
            const secondaryHeight = `${Math.max(0, ((item.secondary ?? 0) / max) * 100)}%`;
            return (
              <div key={item.label} className="admin-chart-col" title={`${item.label}: ${item.value}`}>
                <div className="admin-chart-col-bars">
                  {hasSecondary ? (
                    <span className="admin-chart-bar secondary" style={{ height: secondaryHeight }} />
                  ) : null}
                  <span className="admin-chart-bar primary" style={{ height: primaryHeight }} />
                </div>
                <span className="admin-chart-value">{item.value}</span>
                <span className="admin-chart-label">{item.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function buildPolyline(values: number[], max: number, width: number, height: number, padY: number): string {
  if (values.length === 0) return '';
  if (values.length === 1) {
    const y = padY + (1 - values[0]! / max) * (height - padY * 2);
    return `0,${y} ${width},${y}`;
  }
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = padY + (1 - value / max) * (height - padY * 2);
      return `${x},${y}`;
    })
    .join(' ');
}

export function AdminLineChart({
  title,
  data,
  emptyLabel = 'No data in this window',
  valueLabel = 'Total',
  secondaryLabel = 'Errors',
}: SharedProps) {
  const width = 320;
  const height = 140;
  const padY = 10;
  const max = Math.max(1, ...data.map((item) => Math.max(item.value, item.secondary ?? 0)));
  const hasSecondary = data.some((item) => (item.secondary ?? 0) > 0);
  const primaryPoints = buildPolyline(
    data.map((item) => item.value),
    max,
    width,
    height,
    padY
  );
  const secondaryPoints = hasSecondary
    ? buildPolyline(
        data.map((item) => item.secondary ?? 0),
        max,
        width,
        height,
        padY
      )
    : '';

  const labelStep = Math.max(1, Math.ceil(data.length / 6));

  return (
    <article className="admin-chart-card">
      <header className="admin-chart-head">
        <h3>{title}</h3>
        <p className="muted admin-chart-legend">
          <span className="admin-chart-swatch primary" /> {valueLabel}
          {hasSecondary ? (
            <>
              <span className="admin-chart-swatch secondary" /> {secondaryLabel}
            </>
          ) : null}
        </p>
      </header>
      {data.length === 0 ? (
        <p className="muted admin-chart-empty">{emptyLabel}</p>
      ) : (
        <div className="admin-line-chart" role="img" aria-label={title}>
          <svg viewBox={`0 0 ${width} ${height}`} className="admin-line-svg" preserveAspectRatio="none">
            <line
              className="admin-line-grid"
              x1="0"
              y1={height - padY}
              x2={width}
              y2={height - padY}
            />
            {hasSecondary ? (
              <polyline className="admin-line secondary" fill="none" points={secondaryPoints} />
            ) : null}
            <polyline className="admin-line primary" fill="none" points={primaryPoints} />
            {data.map((item, index) => {
              const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
              const y = padY + (1 - item.value / max) * (height - padY * 2);
              return (
                <circle
                  key={`${item.label}-primary`}
                  className="admin-line-dot primary"
                  cx={x}
                  cy={y}
                  r="2.5"
                >
                  <title>
                    {item.label}: {item.value}
                    {hasSecondary ? ` / errors ${item.secondary ?? 0}` : ''}
                  </title>
                </circle>
              );
            })}
          </svg>
          <div className="admin-line-labels">
            {data.map((item, index) =>
              index % labelStep === 0 || index === data.length - 1 ? (
                <span key={item.label} style={{ left: `${data.length === 1 ? 50 : (index / (data.length - 1)) * 100}%` }}>
                  {item.label}
                </span>
              ) : null
            )}
          </div>
        </div>
      )}
    </article>
  );
}
