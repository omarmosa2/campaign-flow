"use client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { Empty } from "./common";
export function OrdersChart({
  data,
}: {
  data: { day: string; orders: number }[];
}) {
  return data.length ? (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: -25, right: 12, top: 20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2b9b77" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#2b9b77" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 4"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="day"
            tick={{ fill: "var(--muted)", fontSize: 10 }}
            tickFormatter={(v) => String(v).slice(5)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: 8,
            }}
          />
          <Area
            name="الطلبات"
            type="monotone"
            dataKey="orders"
            stroke="#299575"
            strokeWidth={2.5}
            fill="url(#green)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <Empty
      title="الرسم ينتظر أول طلب"
      description="ستظهر حركة الطلبات خلال آخر 30 يوماً هنا."
    />
  );
}
export function RankingChart({
  data,
}: {
  data: { name: string; orders: number }[];
}) {
  return data.length ? (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 15 }}>
          <XAxis type="number" hide />
          <YAxis
            dataKey="name"
            type="category"
            width={120}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip />
          <Bar
            dataKey="orders"
            name="الطلبات"
            fill="#299575"
            radius={[0, 5, 5, 0]}
            barSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <Empty title="لا توجد نتائج بعد" />
  );
}
export function RevenueChart({
  data,
}: {
  data: { day: string; currency: string; revenue: number }[];
}) {
  const currencies = [...new Set(data.map((d) => d.currency))];
  return currencies.length ? (
    <div className="stack">
      {currencies.map((currency) => (
        <div key={currency}>
          <p className="small muted">{currency}</p>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.filter((d) => d.currency === currency)}>
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => String(v).slice(5)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area
                  name={`الإيراد ${currency}`}
                  dataKey="revenue"
                  stroke="#299575"
                  fill="#29957522"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty title="لا توجد إيرادات مؤكدة" />
  );
}
