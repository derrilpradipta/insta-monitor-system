"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function TrendChart({ data }: { data: { month: string; total: number; done: number; overdue: number }[] }) {
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data tren.</p>;
  }

  const formatted = data.map((item) => ({
    ...item,
    label: new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" }).format(
      new Date(`${item.month}-01T00:00:00Z`),
    ),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formatted} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
            labelStyle={{ fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="total" name="Total" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="done" name="Selesai" stroke="#059669" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="overdue" name="Terlambat" stroke="#dc2626" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
