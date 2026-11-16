import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Gift,
  IndianRupee,
  Layers,
  Package,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, StatCard, TableSkeleton } from "@/components/common";
import { api } from "@/lib/api";
import { qty, rupees, showDate, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

// Stock: everything the distributor received on its bills, one row per item with its
// MRP / batch / expiry lots underneath.

const SOON_DAYS = 60;

const daysLeft = (iso) => (iso ? Math.round((new Date(iso) - new Date(todayIso())) / 86400000) : null);

// expired → red, within 60 days → amber, otherwise fine.
const expiryState = (iso) => {
  const d = daysLeft(iso);
  if (d == null) return null;
  if (d < 0) return "expired";
  if (d <= SOON_DAYS) return "soon";
  return "ok";
};

const EXPIRY_TONE = {
  expired: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  soon: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  ok: "border-border text-muted-foreground",
};

const expiryNote = (iso) => {
  const d = daysLeft(iso);
  if (d == null) return "";
  if (d < 0) return `expired ${-d} day${d === -1 ? "" : "s"} ago`;
  if (d === 0) return "expires today";
  return `in ${d} day${d === 1 ? "" : "s"}`;
};

function ExpiryBadge({ iso, withNote }) {
  const state = expiryState(iso);
  if (!state) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Badge variant="outline" className={cn("gap-1", EXPIRY_TONE[state])}>
        {state !== "ok" && <CalendarClock />}
        {showDate(iso)}
      </Badge>
      {withNote && state !== "ok" && <span className={cn("text-[11px]", state === "expired" ? "text-rose-600" : "text-amber-600")}>{expiryNote(iso)}</span>}
    </span>
  );
}

// Add the derived fields each row needs once, when the data arrives.
const enrich = (it) => {
  const expiries = it.lots.map((l) => l.expiryDate).filter(Boolean).sort();
  const states = it.lots.map((l) => expiryState(l.expiryDate));
  const mrps = [...new Set(it.lots.map((l) => l.mrp).filter((m) => m != null))].sort((a, b) => a - b);
  return {
    ...it,
    name: it.variantName || it.productName || it.productErpId,
    nextExpiry: expiries.find((d) => daysLeft(d) >= 0) || expiries[expiries.length - 1] || null,
    expired: states.includes("expired"),
    soon: states.includes("soon"),
    mrps,
  };
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "soon", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "free", label: "Free goods" },
  { value: "multi", label: "2+ MRPs" },
];
const matchesFilter = (it, f) =>
  f === "all" || (f === "soon" && it.soon) || (f === "expired" && it.expired) || (f === "free" && it.freeQty > 0) || (f === "multi" && it.mrps.length > 1);

const SORTS = {
  name: { label: "Name", cmp: (a, b) => a.name.localeCompare(b.name), dir: "asc" },
  qty: { label: "Total pieces", cmp: (a, b) => a.qty - b.qty, dir: "desc" },
  amount: { label: "Value", cmp: (a, b) => a.amount - b.amount, dir: "desc" },
  last: { label: "Last received", cmp: (a, b) => String(a.lastDate || "").localeCompare(String(b.lastDate || "")), dir: "desc" },
  expiry: { label: "Next expiry", cmp: (a, b) => String(a.nextExpiry || "9999").localeCompare(String(b.nextExpiry || "9999")), dir: "asc" },
};

function SortHead({ id, children, sort, onSort, className }) {
  const active = sort.key === id;
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(id)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground", className?.includes("text-right") && "flex-row-reverse")}
      >
        {children}
        <Arrow className={cn("size-3.5", active ? "opacity-100" : "opacity-0")} />
      </button>
    </TableHead>
  );
}

function MrpChips({ mrps }) {
  if (!mrps.length) return null;
  const shown = mrps.slice(0, 3);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((m) => (
        <Badge key={m} variant="secondary" className="font-normal tabular-nums">
          MRP {rupees(m)}
        </Badge>
      ))}
      {mrps.length > shown.length && <Badge variant="outline">+{mrps.length - shown.length}</Badge>}
    </span>
  );
}

function LotsTable({ lots }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">MRP</th>
            <th className="px-3 py-2 text-left font-medium">Batch</th>
            <th className="px-3 py-2 text-right font-medium">Expiry</th>
            <th className="px-3 py-2 text-right font-medium">Pieces</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-2 tabular-nums">{lot.mrp != null ? rupees(lot.mrp) : "—"}</td>
              <td className="px-3 py-2 font-mono text-xs">{lot.batchNumber || <span className="font-sans text-muted-foreground">—</span>}</td>
              <td className="px-3 py-2 text-right">
                <ExpiryBadge iso={lot.expiryDate} withNote />
              </td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{qty(lot.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Stock() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [open, setOpen] = useState(() => new Set());

  const fetchStock = useCallback(
    () =>
      api("/stock")
        .then((d) => {
          setItems((d.items || []).map(enrich));
          setError("");
        })
        .catch((err) => {
          setItems([]);
          setError(err.message);
        }),
    []
  );
  const load = () => {
    setItems(null);
    fetchStock();
  };

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  const all = useMemo(() => items || [], [items]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.value, all.filter((it) => matchesFilter(it, f.value)).length])),
    [all]
  );

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = all.filter((it) => {
      if (!matchesFilter(it, filter)) return false;
      const hay = [it.productName, it.variantName, it.itemCode, it.productErpId, it.hsnCode, ...it.lots.map((l) => l.batchNumber)].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const { cmp } = SORTS[sort.key];
    return [...list].sort((a, b) => (sort.dir === "asc" ? cmp(a, b) : cmp(b, a)));
  }, [all, search, filter, sort]);

  const sum = (list, key) => list.reduce((t, it) => t + (Number(it[key]) || 0), 0);
  const totals = { qty: sum(all, "qty"), free: sum(all, "freeQty"), amount: sum(all, "amount") };
  const shownTotals = { paid: sum(shown, "paidQty"), free: sum(shown, "freeQty"), qty: sum(shown, "qty"), amount: sum(shown, "amount") };
  const attention = all.filter((it) => it.expired || it.soon).length;

  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: SORTS[key].dir }));
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpen = shown.length > 0 && shown.every((it) => open.has(it.productErpId));
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(shown.map((it) => it.productErpId)));

  const hasFilters = Boolean(search || filter !== "all");
  const clear = () => {
    setSearch("");
    setFilter("all");
  };

  return (
    <div>
      <PageHeader title="Stock" description="Everything you have received from the company on your bills, item by item. Open an item to see its MRP lots and expiry.">
        <Button variant="outline" size="sm" onClick={load} disabled={!items}>
          <RotateCcw className={cn(!items && "animate-spin")} />
          Refresh
        </Button>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Products" value={qty(all.length)} hint={`${qty(totals.qty)} pieces received`} icon={Boxes} loading={!items} />
        <StatCard label="Stock value" value={rupees(totals.amount)} hint="Billed amount" icon={IndianRupee} tone="sky" loading={!items} />
        <StatCard label="Free pieces" value={qty(totals.free)} hint="From free-goods schemes" icon={Gift} tone="green" loading={!items} />
        <StatCard
          label="Needs attention"
          value={qty(attention)}
          hint={`${qty(counts.expired || 0)} expired · ${qty(counts.soon || 0)} expiring in ${SOON_DAYS} days`}
          icon={AlertTriangle}
          tone={attention ? "rose" : "amber"}
          loading={!items}
        />
      </div>

      <Card className="gap-0 py-0">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={filter} onValueChange={setFilter} className="min-w-0">
            <TabsList className="h-auto max-w-full flex-wrap justify-start">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value} className="flex-none px-2.5">
                  {f.label}
                  {items && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[11px] tabular-nums",
                        f.value === "expired" && counts.expired ? "bg-rose-500/15 text-rose-700" : f.value === "soon" && counts.soon ? "bg-amber-500/15 text-amber-700" : "bg-muted-foreground/10"
                      )}
                    >
                      {counts[f.value]}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Item, code, HSN or batch" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={sort.key} onValueChange={(key) => setSort({ key, dir: SORTS[key].dir })}>
              <SelectTrigger className="w-40" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORTS).map(([key, s]) => (
                  <SelectItem key={key} value={key}>
                    Sort: {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={toggleAll} disabled={!shown.length} className="hidden md:inline-flex">
              {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          </div>
        </div>

        {hasFilters && items && (
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{shown.length}</span> of {all.length} items
            <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs" onClick={clear}>
              <X />
              Clear
            </Button>
          </div>
        )}

        <CardContent className="px-0">
          {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
          {!items ? (
            <TableSkeleton />
          ) : !shown.length ? (
            <EmptyState icon={Boxes} title={all.length ? "No matching items" : "No stock yet"}>
              {all.length ? "Try another search or filter." : "Items on your bills will show up here."}
            </EmptyState>
          ) : (
            <>
              {/* Desktop / tablet: table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-10 pl-4" />
                      <SortHead id="name" sort={sort} onSort={onSort}>
                        Item
                      </SortHead>
                      <TableHead>MRP</TableHead>
                      <TableHead className="text-right">Bought</TableHead>
                      <TableHead className="text-right">Free</TableHead>
                      <SortHead id="qty" sort={sort} onSort={onSort} className="text-right">
                        Total pcs
                      </SortHead>
                      <SortHead id="amount" sort={sort} onSort={onSort} className="text-right">
                        Value
                      </SortHead>
                      <SortHead id="expiry" sort={sort} onSort={onSort} className="text-right">
                        Next expiry
                      </SortHead>
                      <SortHead id="last" sort={sort} onSort={onSort} className="pr-4 text-right">
                        Last received
                      </SortHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((it) => {
                      const isOpen = open.has(it.productErpId);
                      return (
                        <Fragment key={it.productErpId}>
                          <TableRow
                            className={cn("cursor-pointer", isOpen && "border-b-0 bg-muted/30", it.expired && "bg-rose-50/40 dark:bg-rose-950/10")}
                            onClick={() => toggle(it.productErpId)}
                            aria-expanded={isOpen}
                          >
                            <TableCell className="pl-4 text-muted-foreground">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
                            <TableCell className="max-w-72">
                              <div className="flex items-center gap-3">
                                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                  <Package className="size-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-medium" title={it.name}>
                                    {it.name}
                                  </div>
                                  <div className="truncate text-xs text-muted-foreground">
                                    <span className="font-mono">{it.itemCode || it.productErpId}</span>
                                    {it.variantName && it.productName ? ` · ${it.productName}` : ""}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <MrpChips mrps={it.mrps} />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{qty(it.paidQty)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {it.freeQty ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600">
                                  <Gift className="size-3.5" />
                                  {qty(it.freeQty)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-semibold tabular-nums">{qty(it.qty)}</div>
                              {it.lots.length > 1 && (
                                <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Layers className="size-3" />
                                  {it.lots.length} lots
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{rupees(it.amount)}</TableCell>
                            <TableCell className="text-right">
                              <ExpiryBadge iso={it.nextExpiry} />
                            </TableCell>
                            <TableCell className="pr-4 text-right text-muted-foreground">{showDate(it.lastDate) || "—"}</TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell />
                              <TableCell colSpan={8} className="pt-0 pr-4 pb-4">
                                <LotsTable lots={it.lots} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell />
                      <TableCell colSpan={2} className="font-medium">
                        Total · {shown.length} item{shown.length === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{qty(shownTotals.paid)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600">{shownTotals.free ? qty(shownTotals.free) : "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{qty(shownTotals.qty)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{rupees(shownTotals.amount)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              {/* Phone: cards */}
              <ul className="divide-y md:hidden">
                {shown.map((it) => {
                  const isOpen = open.has(it.productErpId);
                  return (
                    <li key={it.productErpId} className={cn(it.expired && "bg-rose-50/40 dark:bg-rose-950/10")}>
                      <button type="button" className="flex w-full items-start gap-3 p-4 text-left" onClick={() => toggle(it.productErpId)} aria-expanded={isOpen}>
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          <Package className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-medium">{it.name}</div>
                              <div className="truncate font-mono text-xs text-muted-foreground">{it.itemCode || it.productErpId}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold tabular-nums">{qty(it.qty)} pcs</div>
                              <div className="text-xs text-muted-foreground tabular-nums">{rupees(it.amount)}</div>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <MrpChips mrps={it.mrps} />
                            {it.freeQty > 0 && (
                              <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                                <Gift />
                                {qty(it.freeQty)} free
                              </Badge>
                            )}
                            {it.nextExpiry && <ExpiryBadge iso={it.nextExpiry} />}
                          </div>
                        </div>
                        {isOpen ? <ChevronDown className="mt-2 size-4 text-muted-foreground" /> : <ChevronRight className="mt-2 size-4 text-muted-foreground" />}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4">
                          <LotsTable lots={it.lots} />
                          <p className="mt-2 text-xs text-muted-foreground">Last received {showDate(it.lastDate) || "—"}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
                <li className="flex justify-between bg-muted/40 p-4 text-sm font-medium">
                  <span>Total · {shown.length} items</span>
                  <span className="tabular-nums">
                    {qty(shownTotals.qty)} pcs · {rupees(shownTotals.amount)}
                  </span>
                </li>
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
