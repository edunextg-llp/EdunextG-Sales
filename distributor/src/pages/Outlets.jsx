import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, MapPin, MoreHorizontal, Pencil, Phone, Plus, Search, Store, Trash2 } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, StatCard, TableSkeleton } from "@/components/common";
import { api } from "@/lib/api";
import { INDIAN_STATES, lookupPincode, matchState } from "@/lib/pincode";
import { initials } from "@/lib/format";

// Outlets: shops the distributor sells to. Same list as the Bawarchee app's Outlets screen
// (API /api/distributor/outlets). Each outlet gets a code DOT000001... and is in one of the
// distributor's areas (Areas page), chosen from the list.

const EMPTY = {
  name: "",
  ownerName: "",
  phone: "",
  whatsapp: "",
  areaId: "",
  address: "",
  pinCode: "",
  district: "",
  state: "West Bengal",
  hasGst: false,
  gstin: "",
  googleLocation: "",
};
const formOf = (o) => ({
  ...EMPTY,
  ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, o[k] == null || o[k] === "" ? EMPTY[k] : typeof EMPTY[k] === "boolean" ? Boolean(o[k]) : String(o[k])])),
});
const digits = (max) => (v) => v.replace(/\D/g, "").slice(0, max);

function OutletDialog({ open, editing, areas, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pinState, setPinState] = useState(""); // "", "loading", "found", "missing"

  useEffect(() => {
    if (!open) return;
    setError("");
    setPinState("");
    setForm(editing ? formOf(editing) : EMPTY);
  }, [open, editing]);

  const set = (k, clean) => (e) => setForm((f) => ({ ...f, [k]: clean ? clean(e.target.value) : e.target.value }));
  const sameAsMobile = form.phone.length === 10 && form.whatsapp === form.phone;

  // A full PIN code fills district and state.
  const changePin = async (e) => {
    const pin = digits(6)(e.target.value);
    setForm((f) => ({ ...f, pinCode: pin }));
    if (pin.length !== 6) return setPinState("");
    setPinState("loading");
    const found = await lookupPincode(pin);
    if (!found) return setPinState("missing");
    setForm((f) => (f.pinCode !== pin ? f : { ...f, district: found.district || f.district, state: matchState(found.state) || f.state }));
    setPinState("found");
    return undefined;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.areaId) return setError("Choose the area.");
    if (form.hasGst && !form.gstin) return setError("Enter the GSTIN, or switch GST off.");
    setBusy(true);
    setError("");
    try {
      const data = editing ? await api(`/outlets/${editing.id}`, { method: "PUT", body: form }) : await api("/outlets", { method: "POST", body: form });
      toast.success(data.message);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "Add outlet"}</DialogTitle>
            <DialogDescription>Outlet name, mobile number and area are needed; the rest is optional.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="o-name">Outlet name</Label>
              <Input id="o-name" autoFocus maxLength={255} value={form.name} onChange={set("name")} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="o-owner">Owner name</Label>
                <Input id="o-owner" maxLength={120} value={form.ownerName} onChange={set("ownerName")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="o-area">Area</Label>
                {areas.length ? (
                  <Select value={form.areaId} onValueChange={(v) => setForm((f) => ({ ...f, areaId: v }))}>
                    <SelectTrigger id="o-area" className="w-full">
                      <SelectValue placeholder="Choose area" />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    No areas yet.{" "}
                    <Link to="/areas" className="font-medium text-primary hover:underline">
                      Create an area
                    </Link>{" "}
                    first.
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="o-phone">Mobile number</Label>
                <Input id="o-phone" inputMode="numeric" placeholder="10 digits" value={form.phone} onChange={set("phone", digits(10))} required />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="o-wa">WhatsApp</Label>
                  <button
                    type="button"
                    className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${sameAsMobile ? "bg-emerald-500/15 text-emerald-700" : "text-primary hover:underline"}`}
                    disabled={form.phone.length !== 10}
                    onClick={() => setForm((f) => ({ ...f, whatsapp: f.phone }))}
                  >
                    {sameAsMobile ? <><CheckCircle2 className="mr-0.5 inline size-3" /> Same as mobile</> : "Same as mobile"}
                  </button>
                </div>
                <Input id="o-wa" inputMode="numeric" placeholder="10 digits" value={form.whatsapp} onChange={set("whatsapp", digits(10))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="o-address">Address</Label>
              <Input id="o-address" maxLength={500} value={form.address} onChange={set("address")} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="o-pin">PIN code</Label>
                <div className="relative">
                  <Input id="o-pin" inputMode="numeric" placeholder="6 digits" value={form.pinCode} onChange={changePin} />
                  {pinState === "loading" && <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                  {pinState === "found" && <CheckCircle2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-emerald-600" />}
                </div>
                {pinState === "missing" && <p className="text-xs text-amber-700">PIN not found. Fill district and state.</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="o-district">District</Label>
                <Input id="o-district" maxLength={120} value={form.district} onChange={set("district")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="o-state">State</Label>
                <Select value={form.state} onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}>
                  <SelectTrigger id="o-state" className="w-full">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="o-hasgst">Has GST?</Label>
                  <p className="text-xs text-muted-foreground">Switch on if the outlet is GST registered.</p>
                </div>
                <Switch id="o-hasgst" checked={form.hasGst} onCheckedChange={(v) => setForm((f) => ({ ...f, hasGst: v }))} />
              </div>
              {form.hasGst && (
                <div className="grid gap-2">
                  <Label htmlFor="o-gst">GSTIN</Label>
                  <Input
                    id="o-gst"
                    autoFocus
                    className="uppercase"
                    maxLength={15}
                    placeholder="15 letters and digits"
                    value={form.gstin}
                    onChange={set("gstin", (v) => v.toUpperCase().replace(/[^0-9A-Z]/g, ""))}
                  />
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="o-map">
                Google Maps link <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="o-map" maxLength={500} placeholder="https://maps.google.com/..." value={form.googleLocation} onChange={set("googleLocation")} />
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Add outlet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Outlets() {
  const [outlets, setOutlets] = useState(null);
  const [areas, setAreas] = useState([]);
  const [areaFilter, setAreaFilter] = useState("all");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [toRemove, setToRemove] = useState(null);

  const load = () =>
    api("/outlets")
      .then((d) => setOutlets(d.outlets))
      .catch((err) => {
        setOutlets([]);
        setError(err.message);
      });

  const loadAreas = () =>
    api("/areas")
      .then((d) => setAreas(d.areas || []))
      .catch(() => setAreas([]));

  useEffect(() => {
    load();
    loadAreas();
  }, []);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (outlets || []).filter((o) => (areaFilter === "all" || String(o.areaId) === areaFilter) && words.every((w) => [o.code, o.name, o.ownerName, o.phone, o.area, o.address, o.pinCode].join(" ").toLowerCase().includes(w)));
  }, [outlets, search, areaFilter]);
  const activeCount = (outlets || []).filter((o) => o.isActive).length;
  const areaCount = areas.length;

  const setActive = async (outlet, isActive) => {
    setOutlets((prev) => prev.map((o) => (o.id === outlet.id ? { ...o, isActive } : o)));
    try {
      const data = await api(`/outlets/${outlet.id}/active`, { method: "PUT", body: { isActive } });
      toast.success(`${outlet.name}: ${data.message.toLowerCase()}`);
    } catch (err) {
      setOutlets((prev) => prev.map((o) => (o.id === outlet.id ? { ...o, isActive: !isActive } : o)));
      toast.error(err.message);
    }
  };

  const remove = async () => {
    const outlet = toRemove;
    setToRemove(null);
    try {
      await api(`/outlets/${outlet.id}`, { method: "DELETE" });
      toast.success(`${outlet.name} removed.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader title="Outlets" description="The shops you sell to. Add them here; the same list shows in the Bawarchee app.">
        <Button variant="outline" asChild>
          <Link to="/areas">
            <MapPin /> Areas
          </Link>
        </Button>
        <Button onClick={() => setDialog({ open: true, editing: null })}>
          <Plus /> Add outlet
        </Button>
      </PageHeader>

      {areas.length === 0 && outlets && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          Create your areas first:{" "}
          <Link to="/areas" className="font-medium underline">
            go to Areas
          </Link>
          . Every outlet is added to one area.
        </p>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Outlets" value={outlets?.length ?? 0} icon={Store} loading={!outlets} />
        <StatCard label="Active" value={activeCount} icon={CheckCircle2} tone="green" loading={!outlets} />
        <StatCard label="Areas" value={areaCount} icon={MapPin} tone="sky" loading={!outlets} />
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, code, mobile, area" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {areas.length > 0 && (
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <CardContent className="px-0">
          {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
          {!outlets ? (
            <TableSkeleton rows={4} />
          ) : !shown.length ? (
            <EmptyState icon={Store} title={outlets.length ? "No matches" : "No outlets yet"}>
              {outlets.length ? (
                "Try another search."
              ) : (
                <>
                  Add the shops you sell to.
                  <Button className="mt-4" onClick={() => setDialog({ open: true, editing: null })}>
                    <Plus /> Add outlet
                  </Button>
                </>
              )}
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Outlet</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-12 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((o) => (
                  <TableRow key={o.id} className={o.isActive ? "" : "text-muted-foreground"}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className={o.isActive ? "bg-primary/10 font-medium text-primary" : ""}>{initials(o.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{o.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {o.code}
                            {o.ownerName ? <span className="font-sans"> · {o.ownerName}</span> : null}
                          </div>
                          {!o.isActive && (
                            <Badge variant="outline" className="mt-0.5">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <a href={`tel:${o.phone}`} className="inline-flex items-center gap-1.5 tabular-nums hover:text-primary">
                        <Phone className="size-3.5" /> {o.phone}
                      </a>
                    </TableCell>
                    <TableCell>{o.area || "—"}</TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate">{[o.address, o.district, o.state, o.pinCode].filter(Boolean).join(" · ") || "—"}</div>
                      {o.googleLocation && (
                        <a href={o.googleLocation} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <MapPin className="size-3" /> Map
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{o.gstin || "—"}</TableCell>
                    <TableCell>
                      <Switch checked={o.isActive} onCheckedChange={(v) => setActive(o, v)} aria-label={`${o.name} active`} />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="More">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ open: true, editing: o })}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setToRemove(o)}>
                            <Trash2 /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <OutletDialog
        open={dialog.open}
        editing={dialog.editing}
        areas={areas}
        onClose={() => setDialog({ open: false, editing: null })}
        onSaved={() => {
          load();
          loadAreas();
        }}
      />

      <AlertDialog open={Boolean(toRemove)} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {toRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This deletes the outlet. To keep it on record, switch it to inactive instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
