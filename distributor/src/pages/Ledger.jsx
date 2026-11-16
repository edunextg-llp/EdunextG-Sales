import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, BookOpenText, RotateCcw, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange, EmptyState, PageHeader, StatCard, TableSkeleton } from "@/components/common";
import { api } from "@/lib/api";
import { rupees, showDate } from "@/lib/format";

// Balance shown as "₹500.00 Dr" (you owe) / "₹200.00 Cr" (paid in advance).
const balanceText = (v) => {
  const n = Number(v) || 0;
  if (!n) return rupees(0);
  return `${rupees(Math.abs(n))} ${n > 0 ? "Dr" : "Cr"}`;
};

export default function Ledger() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api(`/ledger?${params}`)
      .then(setData)
      .catch((err) => {
        setError(err.message);
        setData({ opening: 0, entries: [], totals: { debit: 0, credit: 0 }, closing: 0 });
      });
  }, [from, to]);

  const loading = !data;

  return (
    <div>
      <PageHeader title="Ledger" description="Every bill (debit) and payment (credit) on your account, with the running balance.">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {(from || to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            <RotateCcw /> Reset
          </Button>
        )}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Opening balance" value={balanceText(data?.opening)} hint={from ? `Before ${showDate(from)}` : "From the start"} icon={Scale} tone="sky" loading={loading} />
        <StatCard label="Bills (debit)" value={rupees(data?.totals.debit)} icon={ArrowUpRight} tone="rose" loading={loading} />
        <StatCard label="Payments (credit)" value={rupees(data?.totals.credit)} icon={ArrowDownLeft} tone="green" loading={loading} />
        <StatCard
          label="Closing balance"
          value={balanceText(data?.closing)}
          hint={Number(data?.closing) > 0 ? "Amount you owe" : "Nothing due"}
          icon={BookOpenText}
          tone={Number(data?.closing) > 0 ? "rose" : "green"}
          loading={loading}
        />
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="px-0">
          {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
          {loading ? (
            <TableSkeleton />
          ) : !data.entries.length ? (
            <EmptyState icon={BookOpenText} title="No entries">
              {from || to ? "Nothing in this date range." : "Bills and payments will show up here."}
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="pr-4 text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/20">
                  <TableCell className="pl-4 text-muted-foreground">{from ? showDate(from) : "—"}</TableCell>
                  <TableCell className="font-medium" colSpan={4}>
                    Opening balance
                  </TableCell>
                  <TableCell className="pr-4 text-right font-medium tabular-nums">{balanceText(data.opening)}</TableCell>
                </TableRow>
                {data.entries.map((e) => (
                  <TableRow key={`${e.type}-${e.refId}`}>
                    <TableCell className="pl-4">{showDate(e.date)}</TableCell>
                    <TableCell>
                      {e.type === "bill" ? (
                        <Badge variant="secondary" className="bg-rose-500/10 text-rose-700">
                          Bill
                        </Badge>
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700">
                            Payment
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {String(e.mode || "").toUpperCase()}
                            {e.reference ? ` · ${e.reference}` : ""}
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{e.invoiceNumber}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.debit ? rupees(e.debit) : ""}</TableCell>
                    <TableCell className="text-right text-emerald-600 tabular-nums">{e.credit ? rupees(e.credit) : ""}</TableCell>
                    <TableCell className="pr-4 text-right font-medium tabular-nums">{balanceText(e.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4" colSpan={3}>
                    Closing balance
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rupees(data.totals.debit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{rupees(data.totals.credit)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{balanceText(data.closing)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
