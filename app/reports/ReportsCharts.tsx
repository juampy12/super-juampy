"use client";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

const STORE_COLORS: Record<string, string> = {
  "914dee4d-a78c-4f3f-8998-402c56fc88e9": "#CC2020",
  "06ca13ff-d96d-4670-84d7-41057b3f6bc7": "#1A5FA8",
  "fb38a57d-78cc-4ccc-92d4-c2cc2cefd22f": "#A8C62A",
};

type Store = { id: string; name: string };

type Props = {
  lineChartData: Record<string, string | number>[];
  barChartData: { name: string; id: string; total: number }[];
  stores: Store[];
  selectedStore: string | null;
  hasData: boolean;
  hasBarData: boolean;
  tooltipMoney: (v: number | string) => string;
};

function fmtMoneyAxis(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

export default function ReportsCharts({
  lineChartData, barChartData, stores, selectedStore, hasData, hasBarData, tooltipMoney,
}: Props) {
  return (
    <>
      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium mb-4">Evolución de ventas diarias</h2>
        {!hasData ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            Sin datos en el rango seleccionado.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={lineChartData} margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={30} />
              <YAxis tickFormatter={fmtMoneyAxis} tick={{ fontSize: 11 }} width={60} />
              <Tooltip
                formatter={(v, name) => [
                  tooltipMoney(v as number),
                  typeof name === "string" && name in STORE_COLORS
                    ? (stores.find((s) => s.id === name)?.name ?? name)
                    : name,
                ]}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              {selectedStore ? (
                <Line
                  type="monotone"
                  dataKey="total"
                  name={stores.find((s) => s.id === selectedStore)?.name ?? "Ventas"}
                  stroke={STORE_COLORS[selectedStore] ?? "#1A5FA8"}
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ) : (
                stores.map((s) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    name={s.name}
                    stroke={STORE_COLORS[s.id] ?? "#888"}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="font-medium mb-4">Ingresos totales por sucursal</h2>
        {!hasBarData ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            Sin datos en el rango seleccionado.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barChartData} margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={30} />
              <YAxis tickFormatter={fmtMoneyAxis} tick={{ fontSize: 11 }} width={60} />
              <Tooltip formatter={(v) => [tooltipMoney(v as number), "Ingresos"]} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {barChartData.map((entry) => (
                  <Cell key={entry.id} fill={STORE_COLORS[entry.id] ?? "#888"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </>
  );
}
