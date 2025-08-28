import csvUrl from '../data/awards_data.csv?url';
import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

/**
 * CSV expected (NO TOTALS column):
 * DEPT,STATE CONTROL NUMBER,PROGRAM TITLE,AWARD TYPE,2017-18,2018-19,...,2026-27
 *
 * Place the file at: /public/awards_data.csv
 * It will be fetched via (import.meta.env.BASE_URL || "/") + "awards_data.csv"
 */

// ---------- parsing & shaping ----------
function tidyRow(row) {
  const years = Object.keys(row).filter((k) => /\d{4}-\d{2}/.test(k));
  const numericYears = Object.fromEntries(
    years.map((y) => [y, Number(row[y] ?? 0) || 0])
  );
  return {
    dept: (row["DEPT"] || "").trim(),
    code: String(row["STATE CONTROL NUMBER"] || "").trim(),
    title: (row["PROGRAM TITLE"] || "").trim(),
    award: (row["AWARD TYPE"] || "").trim(),
    years: numericYears, // totals computed dynamically for the selected range
  };
}

function parseCsvText(text) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return parsed.data.map(tidyRow);
}

const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

// ---- Rec Deactivation thresholds (tweak as you wish) ----
const REC_MIN_TOTAL_5Y = 15; // total over last 5 yrs
const REC_MIN_AVG_5Y   = 3;  // average over last 5 yrs
const REC_MIN_PEAK_5Y  = 3;  // max single year must be >= 3, else "no peak"
function assessRecDeact(row, allYears) {
  // Use the last 5 available academic years in the dataset (independent of UI range)
  const last5 = allYears.slice(-5);
  if (last5.length === 0) return { flag: false, reason: "No years" };

  const vals = last5.map((y) => Number(row.years[y] || 0));
  const total5 = vals.reduce((a, b) => a + b, 0);
  const avg5 = total5 / last5.length;
  const zeros = vals.filter((v) => v === 0).length;
  const peak = Math.max(...vals);

  const lowOverall = total5 < REC_MIN_TOTAL_5Y && avg5 < REC_MIN_AVG_5Y;
  const manyZeros = zeros >= 3;       // ≥3 zeros in 5 yrs
  const noPeak = peak < REC_MIN_PEAK_5Y; // never reached 3 in a year

  if (lowOverall || manyZeros || noPeak) {
    const reasons = [];
    if (lowOverall) reasons.push(`5y total ${total5} & avg ${avg5.toFixed(1)} (<${REC_MIN_TOTAL_5Y}, <${REC_MIN_AVG_5Y})`);
    if (manyZeros) reasons.push(`zeros ${zeros}/5`);
    if (noPeak) reasons.push(`max/year ${peak} (<${REC_MIN_PEAK_5Y})`);
    return { flag: true, reason: reasons.join("; ") };
  }
  return { flag: false, reason: `5y total ${total5}, avg ${avg5.toFixed(1)}, max ${peak}, zeros ${zeros}` };
}

export default function Dashboard() {
  // data
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState("");

  // filters
  const [dept, setDept] = useState("All");
  const [award, setAward] = useState("All");
  const [q, setQ] = useState("");                  // keyword search
  const [topN, setTopN] = useState("All");
  const [sortKey, setSortKey] = useState("totalRange"); // 'totalRange' | 'avgPerYear' | <year>
  const [sortDir, setSortDir] = useState("desc");
  const [recDeactOnly, setRecDeactOnly] = useState(false);

  // fetch CSV on mount
  useEffect(() => {
    async function load() {
      try {
        setLoadError("");
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ${csvPath}`);
        const text = await res.text();
        const data = parseCsvText(text);
        setRows(data);
      } catch (err) {
        console.error(err);
        setLoadError(String(err));
      }
    }
    load();
  }, []);

  // available years
  const allYears = useMemo(() => {
    const years = new Set();
    rows.forEach((r) => Object.keys(r.years).forEach((y) => years.add(y)));
    return Array.from(years).sort();
  }, [rows]);

  // year range (defaults to ALL)
  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);

  useEffect(() => {
    if (rows.length && allYears.length && (rangeStart === null || rangeEnd === null)) {
      setRangeStart(allYears[0]);
      setRangeEnd(allYears[allYears.length - 1]);
    }
  }, [rows, allYears, rangeStart, rangeEnd]);

  const visibleYears = useMemo(() => {
    if (!allYears.length || !rangeStart || !rangeEnd) return allYears;
    const i0 = allYears.indexOf(rangeStart);
    const i1 = allYears.indexOf(rangeEnd);
    if (i0 === -1 || i1 === -1) return allYears;
    const [lo, hi] = i0 <= i1 ? [i0, i1] : [i1, i0];
    return allYears.slice(lo, hi + 1);
  }, [allYears, rangeStart, rangeEnd]);

  // dropdown lists
  const allDepts = useMemo(() => ["All", ...uniq(rows.map((r) => r.dept)).sort()], [rows]);
  const allAwards = useMemo(() => ["All", ...uniq(rows.map((r) => r.award)).sort()], [rows]);

  // main pipeline
  const filtered = useMemo(() => {
    let out = rows.filter(Boolean);

    if (dept !== "All") out = out.filter((r) => r.dept === dept);
    if (award !== "All") out = out.filter((r) => r.award === award);

    if (q.trim() !== "") {
      const needle = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.title.toLowerCase().includes(needle) ||
          r.award.toLowerCase().includes(needle) ||
          r.code.toLowerCase().includes(needle)
      );
    }

    // attach computed total (range), avg/yr, and Rec Deact flag/reason
    const yearCount = Math.max(1, visibleYears.length);
    out = out.map((r) => {
      const totalRange = visibleYears.reduce((sum, y) => sum + (r.years[y] || 0), 0);
      const avgPerYear = totalRange / yearCount;
      const deact = assessRecDeact(r, allYears);
      return { ...r, totalRange, avgPerYear, recDeact: deact.flag, recDeactReason: deact.reason };
    });

    // if toggle is on, keep only flagged rows
    if (recDeactOnly) {
      out = out.filter((r) => r.recDeact);
    }

    // sort
    out.sort((a, b) => {
      const getVal = (row) => {
        if (sortKey === "totalRange") return row.totalRange;
        if (sortKey === "avgPerYear") return row.avgPerYear;
        return row.years[sortKey] ?? 0; // year column
      };
      const av = getVal(a);
      const bv = getVal(b);
      return sortDir === "asc" ? av - bv : bv - av;
    });

    // top-N
    const n = topN === "All" ? out.length : Number(topN);
    return out.slice(0, n);
  }, [rows, dept, award, q, sortKey, sortDir, topN, visibleYears, recDeactOnly, allYears]);

  // export current view
  function downloadFilteredCsv() {
    const header = [
      "DEPT",
      "STATE CONTROL NUMBER",
      "PROGRAM TITLE",
      "AWARD TYPE",
      "TOTAL (Range)",
      "AVG / yr",
      "Rec Deact (last 5y)",
      ...visibleYears,
    ];
    const lines = [header.join(",")];

    filtered.forEach((r) => {
      const ys = visibleYears.map((y) => r.years[y] ?? 0);
      const row = [
        r.dept,
        r.code,
        `"${r.title.replaceAll('"', '""')}"`,
        `"${r.award.replaceAll('"', '""')}"`,
        r.totalRange,
        r.avgPerYear.toFixed(2),
        r.recDeact ? "Yes" : "No",
        ...ys,
      ];
      lines.push(row.join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "awards_filtered.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // UI
  const muted = "#6b7280";

  return (
    <div>
      {/* top-right: export */}
      <div className="topbar">
        <button onClick={downloadFilteredCsv} className="btn">Export Filtered CSV</button>
      </div>

      {/* error / load info */}
      {loadError && (
        <div style={{ marginBottom: 12, color: "#b91c1c", background: "#fee2e2", padding: 10, borderRadius: 8 }}>
          Failed to load CSV: {loadError}
        </div>
      )}
      {!rows.length && !loadError && (
        <div style={{ marginBottom: 12, color: "#374151" }}>Loading data…</div>
      )}

      {/* Filters */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="filters">
          <div>
            <div className="label">Department</div>
            <select className="select" value={dept} onChange={(e)=>setDept(e.target.value)}>
              {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <div className="label">Award Type</div>
            <select className="select" value={award} onChange={(e)=>setAward(e.target.value)}>
              {allAwards.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div>
            <div className="label">Search</div>
            <input className="input" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="title, award type, or control #"/>
          </div>

          <div>
            <div className="label">Top N</div>
            <select className="select" value={topN} onChange={(e)=>setTopN(e.target.value)}>
              {["All","5","10","20","50"].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div>
            <div className="label">Sort by</div>
            <select className="select" value={sortKey} onChange={(e)=>setSortKey(e.target.value)}>
              <option value="totalRange">TOTAL (Range)</option>
              <option value="avgPerYear">AVG / yr</option>
              {visibleYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <div className="label">Direction</div>
            <select className="select" value={sortDir} onChange={(e)=>setSortDir(e.target.value)}>
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>

          <div>
            <div className="label">From (year)</div>
            <select className="select" value={rangeStart || ""} onChange={(e)=>setRangeStart(e.target.value)}>
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <div className="label">To (year)</div>
            <select className="select" value={rangeEnd || ""} onChange={(e)=>setRangeEnd(e.target.value)}>
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <button
              onClick={()=>{
                if(!allYears.length) return;
                setRangeStart(allYears[0]);
                setRangeEnd(allYears[allYears.length-1]);
              }}
              className="btn"
              style={{ width: "100%" }}
            >
              Reset Range
            </button>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <label className="toggle-row">
              <input type="checkbox" checked={recDeactOnly} onChange={(e)=>setRecDeactOnly(e.target.checked)} />
              <span>Rec Deact (last 5 yrs)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Year totals chips */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Completions by Year (selected range)</div>
        <div className="chips">
          {visibleYears.map(y => (
            <div key={y} className="chip">
              <div className="muted">{y}</div>
              <div className="strong">
                {rows.reduce((s, r) => s + (r.years[y] || 0), 0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="panel">
        <div className="label" style={{ marginBottom: 8 }}>
          Showing <b>{filtered.length}</b> programs
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>DEPT</th>
                <th>CONTROL #</th>
                <th>PROGRAM TITLE</th>
                <th>AWARD TYPE</th>
                <th>TOTAL (Range)</th>
                <th>AVG / yr</th>
                <th>Recommend Deactivation</th>
                {visibleYears.map(y => <th key={y} className="right">{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.dept + "-" + r.code + "-" + i}>
                  <td style={{ fontWeight: 700 }}>{r.dept}</td>
                  <td>{r.code}</td>
                  <td>{r.title}</td>
                  <td>{r.award}</td>
                  <td style={{ fontWeight: 700 }}>{r.totalRange}</td>
                  <td>{r.avgPerYear.toFixed(1)}</td>
                  <td>
                    <span title={r.recDeactReason || ""} className="badge">
                      {r.recDeact ? "Yes" : "No"}
                    </span>
                  </td>
                  {visibleYears.map(y => (
                    <td key={y} className="right">{r.years[y] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="label" style={{ marginTop: 12 }}>
          Data from <code>public/awards_data.csv</code>. “Rec Deact” is evaluated on the last 5 academic years only.
        </p>
      </div>
    </div>
  );
}