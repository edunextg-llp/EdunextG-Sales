import { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, AriaComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

// Apache ECharts, only the pieces the site uses (keeps the bundle small).
echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, AriaComponent, SVGRenderer]);

// Shared look: recessive axes / grid, text in ink colours (never the series colour).
export const CHART_TEXT = { primary: "#0f172a", secondary: "#475569", muted: "#94a3b8", grid: "#e2e8f0", surface: "#ffffff" };
export const CHART_BASE = {
  textStyle: { fontFamily: "Poppins, Roboto, sans-serif", color: CHART_TEXT.secondary },
  aria: { enabled: true },
  animationDuration: 500,
  tooltip: {
    backgroundColor: "#ffffff",
    borderColor: CHART_TEXT.grid,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: CHART_TEXT.primary, fontSize: 12 },
    extraCssText: "box-shadow: 0 8px 24px rgba(15,23,42,0.12); border-radius: 10px;",
  },
};

// <EChart option={...} height={300} />: sizes itself to its box and follows resizes.
function EChart({ option, height, ariaLabel }) {
  const boxRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const chart = echarts.init(boxRef.current, null, { renderer: "svg" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(boxRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption({ ...CHART_BASE, ...option }, { notMerge: true });
  }, [option]);

  return <div ref={boxRef} role="img" aria-label={ariaLabel} style={{ width: "100%", height }} />;
}

EChart.propTypes = {
  option: PropTypes.object.isRequired,
  height: PropTypes.number,
  ariaLabel: PropTypes.string,
};
EChart.defaultProps = { height: 300, ariaLabel: "Chart" };

export default EChart;
