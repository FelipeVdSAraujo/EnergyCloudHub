// client/src/models/plugins/ukraine/ResultsView.jsx
//
// Results explorer for the Ukraine FBMC slim web profile (plan task 3.4):
//  - run picker (GET /ukraine/results/runs)
//  - KPI cards from kpis.json (objective, shedding, congestion rent, VOLL…)
//  - zonal price line chart (market_prices.csv) — inline SVG, no chart lib
//  - load-shedding heatstrip (load_shedding.csv), only if any shedding occurred
//  - net-export and welfare-split bar charts from kpis.json zone KPIs,
//    Ukraine highlighted
//  - binding-CNEC table (cnec_binding.csv)
//  - per-file downloads (/ukraine/results/download)
// Charts are lightweight inline SVG on purpose: the client has no chart
// dependency; richer FBMC visualisations (domain polygon, zPTDF heatmap,
// dispatch stack) are parked for Phase 6 per the plan.

import React, { useEffect, useState } from "react";
import {
  fetchRuns,
  fetchKpis,
  fetchMeta,
  fetchRunFileText,
  getDownloadUrl,
} from "./api";

// ---------- formatting ----------

const fmtNum = (v, d = 1) =>
  v == null || !Number.isFinite(Number(v))
    ? "-"
    : Number(v).toLocaleString("en-GB", { maximumFractionDigits: d });

const eurCompact = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 2,
});
const fmtEur = (v) =>
  v == null || !Number.isFinite(Number(v)) ? "-" : eurCompact.format(Number(v));

// ---------- csv parsing (slim web profile format) ----------

function parseZoneCsv(text) {
  const rows = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .filter(Boolean);
  if (rows.length < 2) return null;
  const zones = rows[0].split(",").slice(1);
  const snapshots = [];
  const data = {};
  zones.forEach((z) => {
    data[z] = [];
  });
  for (let i = 1; i < rows.length; i += 1) {
    const cols = rows[i].split(",");
    snapshots.push(cols[0]);
    zones.forEach((z, j) => {
      const n = parseFloat(cols[j + 1]);
      data[z].push(Number.isFinite(n) ? n : 0);
    });
  }
  return { snapshots, zones, data };
}

function parseCnecCsv(text) {
  const rows = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .filter(Boolean);
  if (rows.length < 2) return [];
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cols = rows[i].split(",");
    if (cols.length < 13) continue;
    out.push({
      branch: cols[8],
      outage: cols[9],
      hoursUpper: Number(cols[5]) || 0,
      maxDual: Number(cols[12]) || 0,
    });
  }
  return out;
}

// ---------- tiny SVG charts (no chart dependency) ----------

function ticksFor(min, max, n = 5) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(min + ((max - min) * i) / (n - 1));
  }
  return out;
}

function LineChart({ series, xLabels, height = 250, width = 780, yFmt = (v) => String(Math.round(v)) }) {
  const usable = (series || []).filter((s) => (s.values || []).length > 0);
  if (!usable.length) return null;
  const all = usable.flatMap((s) => s.values);
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const span = rawMax - rawMin;
  const pad = (span || Math.abs(rawMax) || 1) * 0.08;
  const min = rawMin >= 0 ? 0 : rawMin - pad;
  const max = rawMax + pad;
  const padL = 58;
  const padR = 14;
  const padT = 14;
  const padB = 34;
  const n = usable[0].values.length;
  const x = (i) => padL + (i * (width - padL - padR)) / Math.max(1, n - 1);
  const y = (v) => padT + ((max - v) * (height - padT - padB)) / (max - min || 1);
  const pathFor = (values) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(n / 7));
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        {ticksFor(min, max, 5).map((tv, i) => (
          <g key={`tick${i}`}>
            <line x1={padL} x2={width - padR} y1={y(tv)} y2={y(tv)} stroke="#e5e7eb" strokeWidth="1" />
            <text x={padL - 6} y={y(tv) + 3} textAnchor="end" fontSize="10" fill="#6b7280">
              {yFmt(tv)}
            </text>
          </g>
        ))}
        {min < 0 && max > 0 && (
          <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke="#9ca3af" strokeDasharray="4 3" />
        )}
        {usable.map((s) => (
          <path key={s.name} d={pathFor(s.values)} fill="none" stroke={s.color} strokeWidth="2" />
        ))}
        {(xLabels || []).map((label, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={`xl${i}`} x={x(i)} y={height - 10} textAnchor="middle" fontSize="9" fill="#6b7280">
              {label}
            </text>
          ) : null
        )}
      </svg>
      <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-600">
        {usable.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ bars, height = 230, width = 780, yFmt = (v) => String(Math.round(v)) }) {
  if (!bars || bars.length === 0) return null;
  const values = bars.map((b) => Number(b.value) || 0);
  const rawMax = Math.max(...values.map((v) => Math.abs(v)));
  const hasNegative = values.some((v) => v < 0);
  const max = rawMax * 1.08 || 1;
  const min = hasNegative ? -max : 0;
  const padL = 58;
  const padR = 14;
  const padT = 14;
  const padB = 42;
  const plotW = width - padL - padR;
  const slot = plotW / bars.length;
  const bw = Math.min(30, slot * 0.7);
  const y = (v) => padT + ((max - v) * (height - padT - padB)) / (max - min || 1);
  const baseY = y(Math.max(min, 0));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      {ticksFor(min, max, 5).map((tv, i) => (
        <g key={`tick${i}`}>
          <line x1={padL} x2={width - padR} y1={y(tv)} y2={y(tv)} stroke="#e5e7eb" strokeWidth="1" />
          <text x={padL - 6} y={y(tv) + 3} textAnchor="end" fontSize="10" fill="#6b7280">
            {yFmt(tv)}
          </text>
        </g>
      ))}
      {bars.map((b, i) => {
        const value = Number(b.value) || 0;
        const yTop = value >= 0 ? y(value) : baseY;
        const h = Math.max(1, Math.abs(y(value) - baseY));
        const x0 = padL + (i + 0.5) * slot - bw / 2;
        return (
          <g key={b.label}>
            <rect x={x0} y={yTop} width={bw} height={h} fill={b.color} />
            <text x={x0 + bw / 2} y={height - 26} textAnchor="middle" fontSize="9" fill="#6b7280">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

// Run metadata panel (run_meta.json): window, chunking, solver, timings.
function MetaPanel({ meta }) {
  const chunkRows = Array.isArray(meta?.chunk_metas) ? meta.chunk_metas : [];
  const isN1 = Boolean(meta?.config?.add_security_constraints);
  return (
    <div className="mb-6 rounded-xl border bg-gray-50 p-4 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-700">
        <span>
          Window: <b>{meta?.window_start} → {meta?.window_end}</b>
        </span>
        <span>
          Security: <b>{isN1 ? "N-1" : "N-0"}</b>
        </span>
        <span>
          Chunks: <b>{meta?.chunks} × {meta?.chunk_days} day(s)</b>
        </span>
        <span>
          Solver: <b>{meta?.config?.solver_kwargs?.solver_name || "-"}</b>
        </span>
        <span>
          Status: <b>{meta?.status || "-"}</b>
        </span>
        <span>
          Solver time: <b>{fmtNum((Number(meta?.total_s) || 0) / 60, 1)} min</b>
        </span>
        <span>
          Peak RAM: <b>{fmtNum((Number(meta?.peak_ram_mb) || 0) / 1024, 1)} GB</b>
        </span>
      </div>
      {chunkRows.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-gray-600">
            Per-chunk timings and peak RAM
          </summary>
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1.5 pr-4">#</th>
                  <th className="py-1.5 pr-4 text-right">Load s</th>
                  <th className="py-1.5 pr-4 text-right">Zonal s</th>
                  <th className="py-1.5 pr-4 text-right">FBMC s</th>
                  <th className="py-1.5 pr-4 text-right">Total s</th>
                  <th className="py-1.5 pr-4 text-right">Peak RAM MB</th>
                  <th className="py-1.5 pr-4 text-right">Objective €</th>
                </tr>
              </thead>
              <tbody>
                {chunkRows.map((c) => (
                  <tr key={c.index} className="border-b last:border-b-0">
                    <td className="py-1.5 pr-4">{c.index}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtNum(c.timings_s?.load_s, 1)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtNum(c.timings_s?.to_zonal_s, 1)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtNum(c.timings_s?.run_fbmc_s, 1)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtNum(c.timings_s?.total_s, 1)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtNum(c.peak_ram_mb, 0)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtNum(c.objective_eur, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

const EMPTY_DETAIL = {
  loading: false,
  kpis: null,
  meta: null,
  prices: null,
  shedding: null,
  cnecs: null,
  error: "",
};

export default function ResultsView() {
  const [runs, setRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [currentRun, setCurrentRun] = useState("");
  const [detail, setDetail] = useState(EMPTY_DETAIL);
  const [zone, setZone] = useState("UA");
  const [compareZone, setCompareZone] = useState("");

  useEffect(() => {
    fetchRuns()
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setRuns(arr);
        if (arr.length) setCurrentRun(arr[0].runId);
      })
      .catch((error) => console.error("Failed to list Ukraine runs", error))
      .finally(() => setLoadingRuns(false));
  }, []);

  useEffect(() => {
    if (!currentRun) return undefined;
    let cancelled = false;
    setDetail({ ...EMPTY_DETAIL, loading: true });
    setCompareZone("");

    (async () => {
      try {
        const [kpis, meta] = await Promise.all([
          fetchKpis(currentRun),
          fetchMeta(currentRun),
        ]);
        if (cancelled) return;
        setDetail((d) => ({ ...d, loading: false, kpis, meta }));

        const [prices, shedding, cnecs] = await Promise.all([
          fetchRunFileText(currentRun, "market_prices.csv").catch(() => null),
          fetchRunFileText(currentRun, "load_shedding.csv").catch(() => null),
          fetchRunFileText(currentRun, "cnec_binding.csv").catch(() => null),
        ]);
        if (cancelled) return;
        setDetail((d) => ({
          ...d,
          prices: parseZoneCsv(prices),
          shedding: parseZoneCsv(shedding),
          cnecs: parseCnecCsv(cnecs),
        }));
      } catch (error) {
        if (cancelled) return;
        setDetail((d) => ({
          ...d,
          loading: false,
          error: error?.response?.data?.error || "Failed to load run results",
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentRun]);

  const zones = detail.kpis?.zones || {};
  const zoneList = detail.prices?.zones || Object.keys(zones);
  const windowKpis = detail.kpis?.window || {};
  const currentRunSummary = runs.find((r) => r.runId === currentRun);
  const totalShedding = Number(windowKpis.total_shedding_mwh || 0);
  const shedZones = detail.shedding
    ? detail.shedding.zones.filter((z) => detail.shedding.data[z].some((v) => v > 0))
    : [];
  const maxShed = shedZones.length
    ? Math.max(...shedZones.flatMap((z) => detail.shedding.data[z]), 1)
    : 1;

  const priceSeries = [];
  if (detail.prices && detail.prices.data[zone]) {
    priceSeries.push({
      name: `${zone} price (€/MWh)`,
      color: zone === "UA" ? "#f59e0b" : "#2563eb",
      values: detail.prices.data[zone],
    });
  }
  if (compareZone && detail.prices && detail.prices.data[compareZone]) {
    priceSeries.push({
      name: `${compareZone} price (€/MWh)`,
      color: "#0ea5e9",
      values: detail.prices.data[compareZone],
    });
  }
  const priceXLabels = (detail.prices?.snapshots || []).map(
    (s) => `${String(s).slice(5, 10)} ${String(s).slice(11, 13)}`
  );

  const netExportBars = Object.entries(zones).map(([z, k]) => ({
    label: z,
    value: Number(k.net_export_mwh) || 0,
    color: z === "UA" ? "#f59e0b" : "#93c5fd",
  }));

  const roeEntries = Object.entries(zones).filter(([z]) => z !== "UA");
  const sumRoE = (field) =>
    roeEntries.reduce((acc, [, k]) => acc + (Number(k[field]) || 0), 0);
  const welfareBars = [
    { label: "UA consumer", value: Number(zones.UA?.consumer_expense_eur) || 0, color: "#2563eb" },
    { label: "UA producer", value: Number(zones.UA?.producer_revenue_eur) || 0, color: "#10b981" },
    { label: "UA rent", value: Number(zones.UA?.rent_contribution_eur) || 0, color: "#f59e0b" },
    { label: "RoE consumer", value: sumRoE("consumer_expense_eur"), color: "#2563eb" },
    { label: "RoE producer", value: sumRoE("producer_revenue_eur"), color: "#10b981" },
    { label: "RoE rent", value: sumRoE("rent_contribution_eur"), color: "#f59e0b" },
  ];

  if (loadingRuns) {
    return <div className="text-sm text-gray-500">Loading Ukraine runs...</div>;
  }
  if (!runs.length) {
    return (
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold mb-2">Ukraine FBMC Results</h2>
        <p className="text-sm text-gray-600">
          No finished runs yet — start one under Run model.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Ukraine FBMC Results</h2>

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Run</label>
        <select
          value={currentRun}
          onChange={(e) => setCurrentRun(e.target.value)}
          className="rounded border px-3 py-2 bg-white text-sm max-w-xl"
        >
          {runs.map((r) => (
            <option key={r.runId} value={r.runId}>
              {r.runName || r.runId} —{" "}
              {String(r.submittedAt || "").slice(0, 16).replace("T", " ")} ({r.runId})
            </option>
          ))}
        </select>
      </div>

      {detail.error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {detail.error}
        </div>
      )}
      {detail.loading && (
        <div className="text-sm text-gray-500 mb-4">Loading run results...</div>
      )}

      {detail.kpis && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            <KpiCard
              label="Objective"
              value={fmtEur(windowKpis.objective_eur)}
              sub="total system cost"
            />
            <KpiCard
              label="Load shedding"
              value={`${fmtNum(windowKpis.total_shedding_mwh, 1)} MWh`}
              sub={`${fmtEur(windowKpis.total_shedding_cost_eur)} unserved cost`}
            />
            <KpiCard
              label="Congestion rent"
              value={fmtEur(windowKpis.congestion_rent_eur)}
              sub="transmission rent"
            />
            <KpiCard
              label="Binding CNECs"
              value={detail.cnecs ? detail.cnecs.length : "—"}
              sub="flow-based constraints"
            />
            <KpiCard
              label="Window"
              value={`${fmtNum(windowKpis.hours, 0)} h`}
              sub={`${String(windowKpis.start || "").slice(0, 10)} → ${String(
                windowKpis.end || ""
              ).slice(0, 10)}`}
            />
            <KpiCard
              label="VOLL"
              value={`${fmtNum(windowKpis.voll_eur_mwh, 0)} €/MWh`}
              sub="value of lost load"
            />
          </div>

          {detail.meta && <MetaPanel meta={detail.meta} />}

          <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold">Zonal market prices</h3>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-gray-600">Zone</label>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="rounded border px-2 py-1"
                >
                  {zoneList.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
                <label className="text-gray-600">Compare</label>
                <select
                  value={compareZone}
                  onChange={(e) => setCompareZone(e.target.value)}
                  className="rounded border px-2 py-1"
                >
                  <option value="">— none —</option>
                  {zoneList
                    .filter((z) => z !== zone)
                    .map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {detail.prices ? (
              <LineChart series={priceSeries} xLabels={priceXLabels} yFmt={(v) => fmtNum(v, 0)} />
            ) : (
              <p className="text-sm text-gray-500">Price series unavailable for this run.</p>
            )}
          </div>

          <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-2">Load shedding</h3>
            {totalShedding > 0 && shedZones.length > 0 ? (
              <div className="overflow-x-auto">
                <p className="text-sm text-gray-600 mb-2">
                  {fmtNum(totalShedding, 1)} MWh unserved in total — cells show
                  MWh per zone and hour.
                </p>
                <table className="text-[11px] border-separate" style={{ borderSpacing: "0 2px" }}>
                  <thead>
                    <tr className="text-gray-500">
                      <th className="pr-2 text-left">Zone</th>
                      {detail.shedding.snapshots.map((s, i) => (
                        <th key={i} className="px-1 font-normal">
                          {String(s).slice(11, 13)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shedZones.map((z) => (
                      <tr key={z}>
                        <td className="pr-2 font-medium">{z}</td>
                        {detail.shedding.data[z].map((v, i) => (
                          <td
                            key={i}
                            className="px-1 py-0.5 text-right rounded"
                            style={{
                              background:
                                v > 0
                                  ? `rgba(245, 158, 11, ${Math.min(
                                      1,
                                      0.15 + (v / maxShed) * 0.85
                                    )})`
                                  : undefined,
                            }}
                          >
                            {v > 0 ? fmtNum(v, 0) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-green-700 rounded border border-green-200 bg-green-50 inline-block px-3 py-1.5">
                No load shedding in this window.
              </p>
            )}
          </div>

          <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-2">Zone KPIs</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Zone</th>
                    <th className="py-2 pr-4 text-right">Mean €/MWh</th>
                    <th className="py-2 pr-4 text-right">Min</th>
                    <th className="py-2 pr-4 text-right">Max</th>
                    <th className="py-2 pr-4 text-right">Load MWh</th>
                    <th className="py-2 pr-4 text-right">Gen MWh</th>
                    <th className="py-2 pr-4 text-right">Net export MWh</th>
                    <th className="py-2 pr-4 text-right">Import h</th>
                    <th className="py-2 pr-4 text-right">Shed MWh</th>
                    <th className="py-2 pr-4 text-right">Consumer €</th>
                    <th className="py-2 pr-4 text-right">Producer €</th>
                    <th className="py-2 pr-4 text-right">Rent €</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(zones).map(([z, k]) => (
                    <tr
                      key={z}
                      className={`border-b last:border-b-0 ${
                        z === "UA" ? "bg-amber-50 font-semibold" : ""
                      }`}
                    >
                      <td className="py-2 pr-4">{z}</td>
                      <td className="py-2 pr-4 text-right">{fmtNum(k.mean_price_eur_mwh, 2)}</td>
                      <td className="py-2 pr-4 text-right">{fmtNum(k.min_price_eur_mwh, 2)}</td>
                      <td className="py-2 pr-4 text-right">{fmtNum(k.max_price_eur_mwh, 2)}</td>
                      <td className="py-2 pr-4 text-right">{fmtNum(k.load_mwh, 0)}</td>
                      <td className="py-2 pr-4 text-right">{fmtNum(k.generation_mwh, 0)}</td>
                      <td className="py-2 pr-4 text-right">{fmtNum(k.net_export_mwh, 0)}</td>
                      <td className="py-2 pr-4 text-right">{fmtNum(k.import_hours, 0)}</td>
                      <td className="py-2 pr-4 text-right">{fmtNum(k.shedding_mwh, 1)}</td>
                      <td className="py-2 pr-4 text-right">{fmtEur(k.consumer_expense_eur)}</td>
                      <td className="py-2 pr-4 text-right">{fmtEur(k.producer_revenue_eur)}</td>
                      <td className="py-2 pr-4 text-right">{fmtEur(k.rent_contribution_eur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold mb-2">Net exports (window total)</h3>
              <BarChart bars={netExportBars} yFmt={(v) => fmtNum(v, 0)} />
              <p className="text-xs text-gray-500 mt-1">
                Positive = net exporter; Ukraine in amber.
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold mb-2">Welfare split (window total)</h3>
              <BarChart bars={welfareBars} yFmt={(v) => fmtEur(v)} />
              <p className="text-xs text-gray-500 mt-1">
                Consumer expense, producer revenue and congestion-rent
                contribution; Ukraine vs rest of Europe (RoE).
              </p>
            </div>
          </div>

          {Array.isArray(detail.cnecs) && detail.cnecs.length > 0 && (
            <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold mb-2">
                Binding CNECs ({detail.cnecs.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-4">Branch</th>
                      <th className="py-2 pr-4">Outage</th>
                      <th className="py-2 pr-4 text-right">Hours binding (upper)</th>
                      <th className="py-2 pr-4 text-right">Max dual (€/MWh)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.cnecs.map((c, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-mono text-xs">{c.branch}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{c.outage}</td>
                        <td className="py-2 pr-4 text-right">{fmtNum(c.hoursUpper, 0)}</td>
                        <td className="py-2 pr-4 text-right">{fmtNum(c.maxDual, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Download slim web profile</h3>
        {(currentRunSummary?.files || []).length === 0 ? (
          <p className="text-sm text-gray-500">No downloadable files for this run.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(currentRunSummary?.files || []).map((f) => (
              <button
                key={f}
                onClick={() => window.open(getDownloadUrl(currentRun, f), "_blank")}
                className="px-3 py-1.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
