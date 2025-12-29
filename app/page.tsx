"use client";

import { useEffect, useMemo, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.trim() || "http://localhost:8080";

type Latest = { metric: string; time: string; value: number };
type Point = { time: string; value: number };
type Daily = { day: string; usage_kwh: number };

type ApiEnvelope<T> = { data?: T };

const METRICS = [
  "volts",
  "current",
  "active_power",
  "total_import_kwh",
] as const;

type Metric = (typeof METRICS)[number];

function toISO(d: Date) {
  return d.toISOString();
}

function fmtNum(n: number | null | undefined, digits = 6) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return n.toFixed(digits);
}

export default function Home() {
  const [deviceId, setDeviceId] = useState("iot");
  const [metric, setMetric] = useState<Metric>("volts");

  const [latest, setLatest] = useState<Latest[]>([]);
  const [series, setSeries] = useState<Point[]>([]);
  const [daily, setDaily] = useState<Daily[]>([]);

  const [loadingLatest, setLoadingLatest] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const from24h = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000), []);
  const from30d = useMemo(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    []
  );

  const latestMap = useMemo(() => {
    const m = new Map<string, Latest>();
    for (const item of latest) m.set(item.metric, item);
    return m;
  }, [latest]);

  async function fetchJSON<T>(url: string): Promise<T> {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`
      );
    }

    const json = (await res.json()) as unknown;

    // Support either direct payload (e.g., `[...]`) or envelope (e.g., `{ data: [...] }`).
    if (json && typeof json === "object" && "data" in (json as any)) {
      return (json as ApiEnvelope<T>).data as T;
    }

    return json as T;
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        setLoadingLatest(true);
        const url = `${API_BASE}/v1/api/power/latest?device_id=${encodeURIComponent(
          deviceId
        )}`;
        const data = await fetchJSON<Latest[]>(url);
        if (!cancelled) setLatest(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) setError(`Latest: ${e?.message ?? String(e)}`);
      } finally {
        if (!cancelled) setLoadingLatest(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        setLoadingSeries(true);
        const u = new URL(`${API_BASE}/v1/api/power/time-series`);
        u.searchParams.set("device_id", deviceId);
        u.searchParams.set("metric", metric);
        u.searchParams.set("from", toISO(from24h));
        u.searchParams.set("to", toISO(now));

        const data = await fetchJSON<Point[]>(u.toString());
        if (!cancelled) setSeries(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) setError(`Time-series: ${e?.message ?? String(e)}`);
      } finally {
        if (!cancelled) setLoadingSeries(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId, metric, from24h, now]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        setLoadingDaily(true);
        const from = from30d.toISOString().slice(0, 10);
        const to = new Date().toISOString().slice(0, 10);
        const u = new URL(`${API_BASE}/v1/api/power/daily-usage`);
        u.searchParams.set("device_id", deviceId);
        u.searchParams.set("from", from);
        u.searchParams.set("to", to);

        const data = await fetchJSON<Daily[]>(u.toString());
        if (!cancelled) setDaily(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) setError(`Daily usage: ${e?.message ?? String(e)}`);
      } finally {
        if (!cancelled) setLoadingDaily(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId, from30d]);

  const total30d = useMemo(() => {
    return daily.reduce((acc, d) => acc + (Number(d.usage_kwh) || 0), 0);
  }, [daily]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Power Meter Dashboard</h1>
            <p className="text-sm text-zinc-600">
              API: <span className="font-mono">{API_BASE}</span>
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm">
              <span className="mr-2 text-zinc-600">Device</span>
              <input
                className="w-44 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="iot"
              />
            </label>

            <label className="text-sm">
              <span className="mr-2 text-zinc-600">Metric</span>
              <select
                className="w-48 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
                value={metric}
                onChange={(e) => setMetric(e.target.value as Metric)}
              >
                {METRICS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold">Latest Metrics</h2>
            <span className="text-xs text-zinc-500">
              {loadingLatest ? "Loading..." : ""}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {METRICS.map((m) => {
              const item = latestMap.get(m);
              return (
                <div
                  key={m}
                  className="rounded-lg border border-zinc-200 bg-white p-4"
                >
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    {m}
                  </div>
                  <div className="mt-1 text-xl font-semibold">
                    {item ? fmtNum(item.value, 6) : "-"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {item ? new Date(item.time).toLocaleString() : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold">Time-series (last 24h)</h2>
            <span className="text-xs text-zinc-500">
              {loadingSeries ? "Loading..." : `${series.length} points`}
            </span>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="overflow-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {series.length === 0 && !loadingSeries ? (
                    <tr>
                      <td className="py-3 text-zinc-500" colSpan={2}>
                        No data.
                      </td>
                    </tr>
                  ) : null}

                  {series.map((p) => (
                    <tr key={`${p.time}-${p.value}`}>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {new Date(p.time).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">{fmtNum(p.value, 6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold">Daily Usage (last 30 days)</h2>
            <span className="text-xs text-zinc-500">
              {loadingDaily ? "Loading..." : `${daily.length} days`}
            </span>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm text-zinc-700">
                Total (30d):{" "}
                <span className="font-semibold">{fmtNum(total30d, 6)} kWh</span>
              </div>
            </div>

            <div className="overflow-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4">Day</th>
                    <th className="py-2 pr-4">Usage (kWh)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {daily.length === 0 && !loadingDaily ? (
                    <tr>
                      <td className="py-3 text-zinc-500" colSpan={2}>
                        No data.
                      </td>
                    </tr>
                  ) : null}

                  {daily.map((d) => (
                    <tr key={`${d.day}-${d.usage_kwh}`}>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {String(d.day).slice(0, 10)}
                      </td>
                      <td className="py-2 pr-4">{fmtNum(Number(d.usage_kwh), 6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <footer className="mt-8 text-xs text-zinc-500">
          Tip: If you see "No data", ensure your backend exposes:
          <span className="ml-1 font-mono">/v1/api/dashboard/latest</span>,
          <span className="ml-1 font-mono">/v1/api/dashboard/timeseries</span>, and
          <span className="ml-1 font-mono">/v1/api/dashboard/daily-usage</span>.
        </footer>
      </main>
    </div>
  );
}
