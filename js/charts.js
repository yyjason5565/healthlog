const live = new Set();

const refBandPlugin = {
  id: "refBand",
  beforeDatasetsDraw(chart, _args, options) {
    if (!options || (options.low == null && options.high == null)) return;
    const { ctx, chartArea, scales } = chart;
    const y = scales.y;
    if (!y || !chartArea) return;
    const yHigh = options.high == null ? chartArea.top : y.getPixelForValue(options.high);
    const yLow = options.low == null ? chartArea.bottom : y.getPixelForValue(options.low);
    const top = Math.max(chartArea.top, Math.min(yHigh, yLow));
    const bottom = Math.min(chartArea.bottom, Math.max(yHigh, yLow));
    if (bottom - top <= 0) return;
    ctx.save();
    ctx.fillStyle = options.color || "rgba(15, 110, 107, 0.14)";
    ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
    ctx.restore();
  },
};

let configured = false;

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function setup() {
  if (configured || !window.Chart) return;
  window.Chart.register(refBandPlugin);
  window.Chart.defaults.font.family = "ui-sans-serif, system-ui, sans-serif";
  window.Chart.defaults.animation = false;
  configured = true;
}

export function destroyCharts() {
  live.forEach((chart) => chart.destroy());
  live.clear();
}

export function drawChart(canvas, spec) {
  if (!window.Chart) return null;
  setup();
  const grid = cssVar("--line", "#e3ddd2");
  const muted = cssVar("--muted", "#5e6f6c");
  window.Chart.defaults.color = muted;
  const chart = new window.Chart(canvas, {
    type: "line",
    data: {
      labels: spec.labels,
      datasets: spec.datasets.map((dataset) => ({
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false,
        ...dataset,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          display: spec.datasets.length > 1,
          labels: { boxWidth: 12, usePointStyle: true },
        },
        refBand: spec.band
          ? { low: spec.band.low, high: spec.band.high, color: spec.band.color }
          : {},
        tooltip: {
          callbacks: {
            label(ctx) {
              const extra = spec.extras?.[ctx.dataIndex] || "";
              const value = ctx.formattedValue;
              return extra ? `${ctx.dataset.label}: ${value} ${extra}` : `${ctx.dataset.label}: ${value}`;
            },
          },
        },
      },
      scales: {
        y: {
          grace: "12%",
          title: { display: Boolean(spec.yTitle), text: spec.yTitle || "" },
          grid: { color: grid },
        },
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
        },
      },
    },
  });
  live.add(chart);
  return chart;
}

export function bandColor() {
  return document.documentElement.dataset.theme === "dark"
    ? "rgba(61, 190, 182, 0.22)"
    : "rgba(15, 110, 107, 0.16)";
}
