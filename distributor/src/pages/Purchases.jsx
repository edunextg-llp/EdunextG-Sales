import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Printer, ReceiptText, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange, EmptyState, PageHeader, StatCard, TableSkeleton } from "@/components/common";
import { api } from "@/lib/api";
import { qty, rupees, showDate } from "@/lib/format";
import { printInvoice } from "@/lib/invoice";
import { IndianRupee, Wallet } from "lucide-react";

const num = (v) => Number(v) || 0;

function BillDialog({ id, onClose }) {
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setBill(null);
    setError("");
    api(`/purchases/${id}`)
      .then(setBill)
      .catch((err) => setError(err.message));
  }, [id]);

  const s = bill?.sale;
  const print = () => {
    try {
      printInvoice(bill);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Bill <span className="font-mono">{s?.invoice_number || ""}</span>
            {s?.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
          </DialogTitle>
          <DialogDescription>{s ? `${showDate(s.sale_date)} · ${s.company_name || ""}` : "Loading…"}</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!bill && !error && (
          <div className="grid h-40 place-items-center text-muted-foreground">
            <Loader2 className="animate-spin" />
          </div>
        )}

        {bill && (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.items.map((it, i) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="max-w-72">
                        <div className="truncate font-medium">
                          {it.variant_name || it.product_name}
                          {Number(it.is_free) === 1 && <Badge className="ml-2 bg-emerald-600 text-white">Free</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[it.item_code || it.product_erp_id, it.batch_number, it.expiry_date ? `Exp ${showDate(it.expiry_date)}` : ""].filter(Boolean).join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{it.mrp ? rupees(it.mrp) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(it.qty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{rupees(it.rate)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{rupees(it.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 text-sm">
                <p className="font-medium">Payments</p>
                {bill.payments.length ? (
                  bill.payments.map((p) => (
                    <p key={p.id} className="text-muted-foreground">
                      {showDate(p.payment_date)} · {String(p.payment_mode).toUpperCase()} · <span className="font-medium text-foreground">{rupees(p.amount)}</span>
                      {p.reference ? ` (${p.reference})` : ""}
                    </p>
                  ))
                ) : (
                  <p className="text-muted-foreground">No payment recorded yet.</p>
                )}
                {s.remarks && <p className="pt-2 text-muted-foreground">Remarks: {s.remarks}</p>}
              </div>
              <div className="space-y-1.5 rounded-lg bg-muted/50 p-4 text-sm">
                {[
                  ["Taxable", s.taxable_amount],
                  ["CGST", num(s.gst_amount) / 2],
                  ["SGST", num(s.gst_amount) / 2],
                  ["Round off", s.round_off],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-muted-foreground">
                    <span>{k}</span>
                    <span className="tabular-nums">{rupees(v)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{rupees(s.total_amount)}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Paid</span>
                  <span className="tabular-nums">{rupees(s.paid_amount)}</span>
                </div>
                <div className="flex justify-between font-medium text-rose-600">
                  <span>Balance</span>
                  <span className="tabular-nums">{rupees(s.balance_amount)}</span>
                </div>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={print} disabled={!bill}>
            <Printer /> Print / PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Purchases() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState(null);

  const load = useCallback(() => {
    setRows(null);
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api(`/purchases?${params}`)
      .then((d) => setRows(d.purchases))
      .catch((err) => {
        setRows([]);
        setError(err.message);
      });
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows || []).filter((r) => !q || String(r.invoice_number).toLowerCase().includes(q));
  }, [rows, search]);
  const active = shown.filter((r) => r.status !== "cancelled");
  const sum = (k) => active.reduce((t, r) => t + num(r[k]), 0);

  return (
    <div>
      <PageHeader title="Purchases" description="Bills the company has made for you. Open one to see its items or print it." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Bills" value={active.length} hint={`${qty(sum("total_qty"))} pcs`} icon={ReceiptText} loading={!rows} />
        <StatCard label="Bill value" value={rupees(sum("total_amount"))} icon={IndianRupee} tone="sky" loading={!rows} />
        <StatCard label="Balance due" value={rupees(sum("balance_amount"))} icon={Wallet} tone="rose" loading={!rows} />
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search invoice no." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
          {(from || to || search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
                setSearch("");
              }}
            >
              <RotateCcw /> Reset
            </Button>
          )}
        </div>
        <CardContent className="px-0">
          {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
          {!rows ? (
            <TableSkeleton />
          ) : !shown.length ? (
            <EmptyState icon={ReceiptText} title="No bills found">
              {rows.length ? "Try another search or date range." : "Bills the company makes for you will show up here."}
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-20 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => {
                  const cancelled = r.status === "cancelled";
                  return (
                    <TableRow key={r.id} className={cancelled ? "opacity-55" : "cursor-pointer"} onClick={() => setViewId(r.id)}>
                      <TableCell className="pl-4 font-mono font-medium">
                        {r.invoice_number}
                        {cancelled && (
                          <Badge variant="outline" className="ml-2 font-sans">
                            Cancelled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{showDate(r.sale_date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.item_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{qty(r.total_qty)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{rupees(r.total_amount)}</TableCell>
                      <TableCell className="text-right text-emerald-600 tabular-nums">{rupees(r.paid_amount)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${!cancelled && num(r.balance_amount) > 0 ? "font-medium text-rose-600" : ""}`}>
                        {cancelled ? "—" : rupees(r.balance_amount)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button variant="ghost" size="icon-sm" aria-label="View bill" onClick={(e) => (e.stopPropagation(), setViewId(r.id))}>
                          <Eye />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4" colSpan={3}>
                    Total ({active.length} bills)
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{qty(sum("total_qty"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{rupees(sum("total_amount"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{rupees(sum("paid_amount"))}</TableCell>
                  <TableCell className="text-right tabular-nums">{rupees(sum("balance_amount"))}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <BillDialog id={viewId} onClose={() => setViewId(null)} />
    </div>
  );
}
