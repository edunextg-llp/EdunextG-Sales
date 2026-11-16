import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowRight, Boxes, CalendarDays, IndianRupee, ReceiptText, Truck, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StatCard } from "@/components/common";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { monthLabel, qty, rupees, rupeesShort, showDate } from "@/lib/format";

const chartConfig = { amount: { label: "Purchases", color: "var(--chart-1)" } };

// Last 6 months, oldest first, with 0 for months without bills.
const lastSixMonths = (rows) => {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { month: monthLabel(key), amount: byMonth.get(key)?.amount || 0 };
  });
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function Dashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  const loading = !data && !error;
  const t = data?.totals || {};
  const chart = useMemo(() => lastSixMonths(data?.monthly || []), [data]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{greeting()},</p>
        <h1 className="text-2xl font-semibold tracking-tight">{profile?.contactPerson || profile?.name}</h1>
      </div>

      {error && <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total purchases" value={rupeesShort(t.purchased)} hint={`${t.bills || 0} bills · ${qty(t.qty)} pcs`} icon={IndianRupee} loading={loading} />
        <StatCard label="This month" value={rupeesShort(t.monthPurchased)} hint={`${t.monthBills || 0} bills`} icon={CalendarDays} tone="sky" loading={loading} />
        <StatCard label="Paid" value={rupeesShort(t.paid)} hint="Payments recorded" icon={Wallet} tone="green" loading={loading} />
        <StatCard label="Balance due" value={rupeesShort(t.balance)} hint="Still to be paid" icon={ReceiptText} tone={t.balance > 0 ? "rose" : "green"} loading={loading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Purchases</CardTitle>
            <CardDescription>Bill value over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ChartContainer config={chartConfig} className="h-64 w-full">
                <BarChart data={chart} margin={{ left: 4, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => rupeesShort(v)} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v) => rupees(v)} />} />
                  <Bar dataKey="amount" fill="var(--color-amount)" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <StatCard label="Items received" value={qty(t.products)} hint="Different products bought" icon={Boxes} tone="amber" loading={loading} />
          <StatCard
            label="Delivery boys"
            value={qty(t.activeDeliveryBoys)}
            hint={`${t.deliveryBoys || 0} added · ${t.activeDeliveryBoys || 0} active`}
            icon={Truck}
            tone="sky"
            loading={loading}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent bills</CardTitle>
          <CardDescription>Your latest purchases from the company</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" asChild>
              <Link to="/purchases">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-2 px-6">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data?.recent?.length ? (
            <EmptyState icon={ReceiptText} title="No bills yet">
              Bills the company makes for you will show up here.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="pr-6 text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="pl-6 font-mono font-medium">
                      {b.invoice_number}
                      {b.status === "cancelled" && (
                        <Badge variant="outline" className="ml-2 text-muted-foreground">
                          Cancelled
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{showDate(b.sale_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{qty(b.total_qty)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{rupees(b.total_amount)}</TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {b.status === "cancelled" ? "—" : Number(b.balance_amount) > 0 ? <span className="text-rose-600">{rupees(b.balance_amount)}</span> : <span className="text-emerald-600">Paid</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
