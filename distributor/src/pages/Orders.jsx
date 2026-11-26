import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  Gift,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  Search,
  Send,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader } from "@/components/common";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { qty, rupees, showDate } from "@/lib/format";
import { isCnf, printOrderCopy, priceTypeLabel } from "@/lib/orderCopy";

// Orders. "New order": the company's items in stock (left) and the order being built (right).
// Items with a free goods offer show it ("Buy 100 pcs, get 30 pcs <item> free"), and the order
// works out the free pieces as quantities are typed. Submitting sends it to the company: it is
// approved on DMS (Sales > Distributor Orders) with a requisition number, then billed.
// "My orders": every order with its items, free goods, status and requisition number.

const STATUS = {
  pending: { label: "Waiting for approval", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  approved: { label: "Approved", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  billed: { label: "Billed", className: "bg-sky-500/15 text-sky-700 border-sky-500/30" },
  rejected: { label: "Rejected", className: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const key = (v) => String(v || "").trim().toLowerCase();
const itemName = (it) => it?.variantName || it?.productName || it?.productErpId || "";
const offerText = (s) =>
  s.sameItem ? `Buy ${qty(s.buyQty)} pcs, get ${qty(s.freeQty)} pcs free` : `Buy ${qty(s.buyQty)} pcs, get ${qty(s.freeQty)} pcs ${s.freeItemName} free`;

// Free pieces earned by `bought` pcs of an item under its scheme.
const freeEarned = (scheme, bought) => (scheme && scheme.buyQty > 0 ? Math.floor(bought / scheme.buyQty) * scheme.freeQty : 0);

function OfferBadge({ scheme }) {
  return (
    <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
      <Gift className="size-3" />
      {offerText(scheme)}
    </Badge>
  );
}

function Stepper({ value, onChange, onStep }) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => onStep(-1)} aria-label="Less">
        <Minus />
      </Button>
      <Input
        inputMode="numeric"
        className="h-8 w-20 text-right tabular-nums"
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
      <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => onStep(1)} aria-label="More">
        <Plus />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New order
// ---------------------------------------------------------------------------

function NewOrder({ onPlaced }) {
  const [data, setData] = useState(null); // { companyName, items, schemes }
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [onlyOffers, setOnlyOffers] = useState(false);
  const [cart, setCart] = useState({}); // productErpId -> qty string
  const [remarks, setRemarks] = useState("");
  // Retail or wholesale price for the whole order (Retail unless changed). A CNF company's
  // distributors have no choice: their orders are at the product MRP (data.mrpOnly).
  const [chosenPrice, setPriceType] = useState("retail");
  const [busy, setBusy] = useState(false);
  const cartRef = useRef(null);

  const load = () => {
    setData(null);
    setError("");
    api("/order-items")
      .then((d) => setData({ companyName: d.companyName || "", items: d.items || [], schemes: d.schemes || [], mrpOnly: Boolean(d.mrpOnly) }))
      .catch((err) => {
        setData({ companyName: "", items: [], schemes: [] });
        setError(err.message);
      });
  };
  useEffect(load, []);

  const items = data?.items || [];
  const mrpOnly = Boolean(data?.mrpOnly);
  const priceType = mrpOnly ? "mrp" : chosenPrice;
  const schemeOf = useMemo(() => new Map((data?.schemes || []).map((s) => [key(s.productErpId), s])), [data]);
  const itemByKey = useMemo(() => new Map(items.map((it) => [key(it.productErpId), it])), [items]);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(
      (it) =>
        (!onlyOffers || schemeOf.has(key(it.productErpId))) &&
        words.every((w) => [it.productName, it.variantName, it.productErpId, it.itemCode].join(" ").toLowerCase().includes(w))
    );
  }, [items, search, onlyOffers, schemeOf]);

  // The order: paid lines, each with the free goods it earns.
  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([erp, q]) => {
          const item = itemByKey.get(key(erp));
          const pcs = Math.floor(Number(q)) || 0;
          const scheme = schemeOf.get(key(erp));
          const free = freeEarned(scheme, pcs);
          return { item, pcs, scheme, free, freeName: scheme ? scheme.freeItemName : "" };
        })
        .filter((l) => l.item && l.pcs > 0),
    [cart, itemByKey, schemeOf]
  );
  const totalPcs = lines.reduce((t, l) => t + l.pcs, 0);
  const totalFree = lines.reduce((t, l) => t + l.free, 0);
  const priceOf = (it) =>
    (priceType === "retail" ? it.retailPrice : priceType === "wholesale" ? it.wholesalePrice : priceType === "mrp" ? it.mrp : 0) || 0;
  // Estimate only: the bill sets the final rates (lot by lot) and free goods.
  // Retail / wholesale are before GST; MRP already includes GST.
  const gross = lines.reduce((t, l) => t + l.pcs * priceOf(l.item), 0);
  const estGst = lines.reduce((t, l) => {
    const amount = l.pcs * priceOf(l.item);
    const rate = (l.item.gstPercent || 5) / 100;
    return t + (mrpOnly ? amount - amount / (1 + rate) : amount * rate);
  }, 0);
  const estTaxable = mrpOnly ? gross - estGst : gross;

  const setQty = (erp, v) => setCart((c) => ({ ...c, [erp]: v }));
  const step = (it, by) => {
    const box = it.pcsPerBox > 1 ? it.pcsPerBox : 1;
    setCart((c) => ({ ...c, [it.productErpId]: String(Math.max(0, (Math.floor(Number(c[it.productErpId])) || 0) + by * box)) }));
  };

  const submit = async () => {
    if (!lines.length) return toast.error("Enter a quantity for at least one item.");
    if (!priceType) return toast.error("Choose Retail or Wholesale price.");
    setBusy(true);
    try {
      const res = await api("/orders", {
        method: "POST",
        body: { items: lines.map((l) => ({ productErpId: l.item.productErpId, qty: l.pcs })), remarks, priceType },
      });
      toast.success(res.message);
      setCart({});
      setRemarks("");
      onPlaced();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  if (!data) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 pb-20 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0">
      {/* Products */}
      <div className="grid min-w-0 gap-4">
        {mrpOnly ? (
          <Card className="gap-0 py-0">
            <div className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">Price</div>
                <div className="text-xs text-muted-foreground">The order is billed at the product MRP. Rates are per piece, incl. GST.</div>
              </div>
              <Badge variant="outline">MRP</Badge>
            </div>
          </Card>
        ) : (
          <Card className={`gap-0 py-0 ${priceType ? "" : "ring-2 ring-amber-500/60"}`}>
            <div className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">Price</div>
                <div className="text-xs text-muted-foreground">
                  {priceType ? "The order is billed at this price. Rates are per piece, before GST." : "Choose the price for this order first."}
                </div>
              </div>
              <div className="inline-flex rounded-lg border p-0.5">
                {[
                  ["retail", "Retail price"],
                  ["wholesale", "Wholesale price"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={priceType === value ? "default" : "ghost"}
                    className="rounded-md"
                    onClick={() => setPriceType(value)}
                    aria-pressed={priceType === value}
                  >
                    {priceType === value && <CheckCircle2 />}
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        )}
        <Card className="gap-0 py-0">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search item, ERP ID, code" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {data.schemes.length > 0 && (
              <Button variant={onlyOffers ? "default" : "outline"} size="sm" onClick={() => setOnlyOffers((v) => !v)}>
                <Gift /> With offers
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {shown.length} of {items.length} items{data.companyName ? ` · ${data.companyName}` : ""}
            </span>
          </div>
          {error && <p className="px-4 pt-3 text-sm text-destructive">{error}</p>}
          {!shown.length ? (
            <EmptyState icon={Package} title={items.length ? "No matches" : "No items to order"}>
              {items.length ? "Try another search." : "The company has no items in stock right now."}
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {shown.map((it) => {
                const scheme = schemeOf.get(key(it.productErpId));
                const q = cart[it.productErpId] || "";
                const pcs = Math.floor(Number(q)) || 0;
                const free = freeEarned(scheme, pcs);
                const toNext = scheme && pcs > 0 ? scheme.buyQty - (pcs % scheme.buyQty) : 0;
                return (
                  <li key={it.productErpId} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${pcs > 0 ? "bg-primary/5" : ""}`}>
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Package className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{itemName(it)}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{it.productErpId}</span>
                        {it.pcsPerBox > 1 && <span>{it.pcsPerBox} pcs/box</span>}
                        <span>In stock {qty(it.available)} pcs</span>
                        {priceType ? (
                          <span className="font-medium text-foreground">
                            {rupees(priceOf(it))}/pc <span className="font-normal text-muted-foreground">{priceTypeLabel(priceType).toLowerCase()}</span>
                          </span>
                        ) : (
                          <span>
                            Retail {rupees(it.retailPrice)} · Wholesale {rupees(it.wholesalePrice)}
                          </span>
                        )}
                      </div>
                      {scheme && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <OfferBadge scheme={scheme} />
                          {scheme.validTo && <span className="text-xs text-muted-foreground">Through {showDate(scheme.validTo)}</span>}
                          {free > 0 ? (
                            <span className="text-xs font-medium text-emerald-700">
                              You get {qty(free)} pcs {scheme.sameItem ? "" : `${scheme.freeItemName} `}free
                            </span>
                          ) : pcs > 0 ? (
                            <span className="text-xs text-muted-foreground">Add {qty(toNext)} more pcs for {qty(scheme.freeQty)} free</span>
                          ) : null}
                        </div>
                      )}
                      {pcs > it.available && <div className="mt-1 text-xs text-amber-700">More than in stock now: the company may bill less.</div>}
                    </div>
                    <Stepper value={q} onChange={(v) => setQty(it.productErpId, v)} onStep={(by) => step(it, by)} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Your order */}
      <Card ref={cartRef} className="gap-0 py-0 lg:sticky lg:top-20">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4" /> Your order
          </CardTitle>
          <CardDescription>{lines.length ? `${lines.length} item${lines.length === 1 ? "" : "s"}` : "Add pieces to items on the left."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4">
          {lines.length === 0 ? (
            <div className="grid place-items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <ShoppingCart className="size-8 opacity-30" />
              Your order is empty.
            </div>
          ) : (
            <ul className="grid max-h-[45svh] gap-2 overflow-auto pr-1">
              {lines.map((l) => (
                <li key={l.item.productErpId} className="rounded-lg border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{itemName(l.item)}</div>
                      <div className="font-mono text-xs text-muted-foreground">{l.item.productErpId}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums">{qty(l.pcs)} pcs</span>
                        {priceType && (
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            × {rupees(priceOf(l.item))} = {rupees(l.pcs * priceOf(l.item))}
                          </span>
                        )}
                      </span>
                      <Button variant="ghost" size="icon" className="size-7" aria-label="Remove" onClick={() => setQty(l.item.productErpId, "")}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {l.free > 0 && (
                    <div className="mt-2 flex items-start justify-between gap-2 rounded-md bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-800">
                      <span className="min-w-0">
                        <span className="mr-1">↳</span>
                        <b>FREE</b> {l.freeName}
                        <span className="block text-emerald-700/80">
                          with {itemName(l.item)} · buy {qty(l.scheme.buyQty)} get {qty(l.scheme.freeQty)}
                        </span>
                      </span>
                      <b className="shrink-0 tabular-nums">+{qty(l.free)} pcs</b>
                    </div>
                  )}
                  {l.scheme && l.free === 0 && (
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      Add {qty(l.scheme.buyQty - (l.pcs % l.scheme.buyQty))} more pcs for {qty(l.scheme.freeQty)} pcs free
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ordered</span>
              <b className="tabular-nums">{qty(totalPcs)} pcs</b>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Free</span>
              <b className="tabular-nums text-emerald-700">+{qty(totalFree)} pcs</b>
            </div>
            {priceType && (
              <>
                <div className="mt-1 flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">Amount ({priceTypeLabel(priceType).toLowerCase()}, before GST)</span>
                  <b className="tabular-nums">{rupees(estTaxable)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST</span>
                  <b className="tabular-nums">{rupees(estGst)}</b>
                </div>
                <div className="flex justify-between">
                  <span>Estimated total</span>
                  <b className="tabular-nums">{rupees(estTaxable + estGst)}</b>
                </div>
              </>
            )}
            <div className="mt-1 flex justify-between border-t pt-1">
              <span>Total you receive</span>
              <b className="tabular-nums">{qty(totalPcs + totalFree)} pcs</b>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="order-remarks">Note for the company (optional)</Label>
            <Input id="order-remarks" maxLength={1000} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy || !lines.length} onClick={() => setCart({})}>
              Clear
            </Button>
            <Button className="flex-[2]" disabled={busy || !lines.length || !priceType} onClick={submit}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Submit order
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{priceType ? "Amounts are an estimate. " : "Choose Retail or Wholesale price to submit. "}Rates and free goods are confirmed on the bill, by the prices, offers and stock on that day.</p>
        </CardContent>
      </Card>

      {/* Phones: order summary bar */}
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="min-w-0 flex-1 text-sm">
            <b>{lines.length}</b> item{lines.length === 1 ? "" : "s"} · <b className="tabular-nums">{qty(totalPcs)}</b> pcs
            {totalFree > 0 && <span className="text-emerald-700"> · +{qty(totalFree)} free</span>}
          </div>
          <Button size="sm" onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth" })}>
            Review order
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My orders
// ---------------------------------------------------------------------------

function OrderCard({ order, sr, onCancel, profile }) {
  const [open, setOpen] = useState(order.status === "pending" || order.status === "approved");
  const st = STATUS[order.status] || { label: order.status, className: "" };
  const freeQty = order.items.filter((it) => it.is_free).reduce((t, it) => t + Number(it.qty || 0), 0);
  // Sr No. of each paid item (free lines sit under their item, unnumbered).
  let paidNo = 0;
  const itemNo = order.items.map((it) => (it.is_free ? null : ++paidNo));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.requisition_number);
      toast.success(`${order.requisition_number} copied.`);
    } catch {
      toast.error("Could not copy. Select the number and copy it by hand.");
    }
  };

  return (
    <Card className="gap-0 py-0">
      <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)}>
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <span className="text-sm font-bold tabular-nums" title="Sr No.">{sr}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold">{order.order_number || `ORD${String(order.id).padStart(6, "0")}`}</span>
            <Badge variant="outline" className={st.className}>
              {st.label}
            </Badge>
            <Badge variant="outline">{priceTypeLabel(order.price_type)} price</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {showDate(order.created_at)} · {order.item_count} item{order.item_count === 1 ? "" : "s"} · {qty(order.total_qty)} pcs
            {freeQty > 0 && <span className="text-emerald-700"> · +{qty(freeQty)} free</span>}
          </div>
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {(order.requisition_number || order.status === "rejected" || order.status === "billed") && (
        <div className="flex flex-wrap items-center gap-3 border-t bg-muted/30 px-4 py-2 text-sm">
          {order.requisition_number && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="size-4 text-emerald-600" /> Requisition No.
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 font-mono font-semibold" onClick={copy}>
                {order.requisition_number} <Copy className="size-3.5" />
              </Button>
            </span>
          )}
          {order.status === "billed" && order.invoice_number && <span className="text-muted-foreground">Bill {order.invoice_number}</span>}
          {order.status === "rejected" && order.reject_reason && <span className="text-rose-700">Reason: {order.reject_reason}</span>}
        </div>
      )}

      {open && (
        <CardContent className="border-t px-4 py-3">
          <ul className="grid gap-1.5">
            {order.items.map((it, i) =>
              it.is_free ? (
                <li key={`${it.product_erp_id}-${i}`} className="ml-9 flex items-start justify-between gap-3 rounded-md bg-emerald-500/10 px-2 py-1.5 text-sm text-emerald-800">
                  <span className="min-w-0">
                    <span className="mr-1">↳</span>
                    <b>FREE</b> {it.variant_name || it.product_name || it.product_erp_id}
                    {it.free_note && <span className="block text-xs text-emerald-700/80">{it.free_note}</span>}
                  </span>
                  <b className="shrink-0 tabular-nums">+{qty(it.qty)} pcs</b>
                </li>
              ) : (
                <li key={`${it.product_erp_id}-${i}`} className="flex items-start justify-between gap-3 px-2 py-1 text-sm">
                  <span className="min-w-0">
                    <span className="mr-2 inline-block w-5 text-right tabular-nums text-muted-foreground">{itemNo[i]}.</span>
                    <span className="font-medium">{it.variant_name || it.product_name || it.product_erp_id}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{it.product_erp_id}</span>
                  </span>
                  <b className="shrink-0 tabular-nums">{qty(it.qty)} pcs</b>
                </li>
              )
            )}
          </ul>
          {order.remarks && <p className="mt-2 text-xs text-muted-foreground">Your note: “{order.remarks}”</p>}
          {(order.status === "pending" || isCnf(profile)) && (
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {/* A4 order copy: CNF distributors only. */}
              {isCnf(profile) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try {
                      printOrderCopy(order, profile);
                    } catch (err) {
                      toast.error(err.message);
                    }
                  }}
                >
                  <Printer /> Order copy (A4)
                </Button>
              )}
              {order.status === "pending" && (
                <Button variant="destructive" size="sm" onClick={() => onCancel(order)}>
                  Cancel order
                </Button>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function MyOrders({ orders, error, onNew, onCancel }) {
  const { profile } = useAuth();
  const [filter, setFilter] = useState("");
  const shown = (orders || []).filter((o) => !filter || o.status === filter);
  if (!orders) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {[["", "All"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([value, label]) => {
          const n = value ? orders.filter((o) => o.status === value).length : orders.length;
          return (
            <Button key={value || "all"} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
              {label}
              <span className="ml-1 tabular-nums opacity-70">{n}</span>
            </Button>
          );
        })}
      </div>
      {!shown.length ? (
        <Card>
          <EmptyState icon={ShoppingCart} title={orders.length ? "No orders here" : "No orders yet"}>
            {orders.length ? (
              "Choose another status."
            ) : (
              <>
                Place your first order.
                <Button className="mt-4" onClick={onNew}>
                  <Plus /> New order
                </Button>
              </>
            )}
          </EmptyState>
        </Card>
      ) : (
        shown.map((o, i) => <OrderCard key={o.id} order={o} sr={i + 1} onCancel={onCancel} profile={profile} />)
      )}
    </div>
  );
}

export default function Orders() {
  const [tab, setTab] = useState("new");
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  const [toCancel, setToCancel] = useState(null);

  const load = () =>
    api("/orders")
      .then((d) => setOrders(d.orders || []))
      .catch((err) => {
        setOrders([]);
        setError(err.message);
      });

  useEffect(() => {
    load();
  }, []);

  const pending = (orders || []).filter((o) => o.status === "pending").length;

  const cancel = async () => {
    const order = toCancel;
    setToCancel(null);
    try {
      const res = await api(`/orders/${order.id}/cancel`, { method: "POST" });
      toast.success(res.message);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader title="Orders" description="Order items from your company. Approved orders get a requisition number and are billed to you." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="new">
            <Plus /> New order
          </TabsTrigger>
          <TabsTrigger value="mine">
            <ClipboardList /> My orders
            {orders?.length ? <span className="ml-1 tabular-nums opacity-70">{orders.length}</span> : null}
            {pending > 0 && <Badge className="ml-1 h-4 bg-amber-500 px-1.5 text-[10px] text-white">{pending}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="new">
          <NewOrder
            onPlaced={() => {
              load();
              setTab("mine");
            }}
          />
        </TabsContent>
        <TabsContent value="mine">
          <MyOrders orders={orders} error={error} onNew={() => setTab("new")} onCancel={setToCancel} />
        </TabsContent>
      </Tabs>

      <AlertDialog open={Boolean(toCancel)} onOpenChange={(o) => !o && setToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order {toCancel?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>The company will no longer see it for approval. You can place a new order any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction onClick={cancel}>Cancel order</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
