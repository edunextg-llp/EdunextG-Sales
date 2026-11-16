import { useEffect, useMemo, useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Phone, Plus, Search, Trash2, Truck, UserCheck, Users } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader, StatCard, TableSkeleton } from "@/components/common";
import { api } from "@/lib/api";
import { initials, showDate } from "@/lib/format";

const EMPTY = { name: "", phone: "", vehicleNo: "", area: "" };

function BoyDialog({ open, editing, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(editing ? { name: editing.name, phone: editing.phone, vehicleNo: editing.vehicleNo || "", area: editing.area || "" } : EMPTY);
  }, [open, editing]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = editing
        ? await api(`/delivery-boys/${editing.id}`, { method: "PUT", body: form })
        : await api("/delivery-boys", { method: "POST", body: form });
      toast.success(data.message);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit delivery boy" : "Add delivery boy"}</DialogTitle>
            <DialogDescription>Name and mobile number are needed; vehicle and area are optional.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="db-name">Full name</Label>
              <Input id="db-name" autoFocus maxLength={120} value={form.name} onChange={set("name")} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="db-phone">Mobile number</Label>
              <Input
                id="db-phone"
                inputMode="numeric"
                maxLength={10}
                placeholder="10 digits"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "") }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="db-vehicle">Vehicle no.</Label>
                <Input id="db-vehicle" className="uppercase" maxLength={30} placeholder="WB 12 AB 3456" value={form.vehicleNo} onChange={set("vehicleNo")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="db-area">Area</Label>
                <Input id="db-area" maxLength={120} placeholder="e.g. Salt Lake" value={form.area} onChange={set("area")} />
              </div>
            </div>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Add delivery boy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function DeliveryBoys() {
  const [boys, setBoys] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [toRemove, setToRemove] = useState(null);

  const load = () =>
    api("/delivery-boys")
      .then((d) => setBoys(d.deliveryBoys))
      .catch((err) => {
        setBoys([]);
        setError(err.message);
      });

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (boys || []).filter((b) => words.every((w) => [b.name, b.phone, b.vehicleNo, b.area].join(" ").toLowerCase().includes(w)));
  }, [boys, search]);
  const activeCount = (boys || []).filter((b) => b.isActive).length;

  const setActive = async (boy, isActive) => {
    setBoys((prev) => prev.map((b) => (b.id === boy.id ? { ...b, isActive } : b)));
    try {
      const data = await api(`/delivery-boys/${boy.id}/active`, { method: "PUT", body: { isActive } });
      toast.success(`${boy.name}: ${data.message.toLowerCase()}`);
    } catch (err) {
      setBoys((prev) => prev.map((b) => (b.id === boy.id ? { ...b, isActive: !isActive } : b)));
      toast.error(err.message);
    }
  };

  const remove = async () => {
    const boy = toRemove;
    setToRemove(null);
    try {
      await api(`/delivery-boys/${boy.id}`, { method: "DELETE" });
      toast.success(`${boy.name} removed.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <PageHeader title="Delivery Boys" description="Your delivery team. Add people, keep their details up to date, and switch them off when they leave.">
        <Button onClick={() => setDialog({ open: true, editing: null })}>
          <Plus /> Add delivery boy
        </Button>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Delivery boys" value={boys?.length ?? 0} icon={Users} loading={!boys} />
        <StatCard label="Active" value={activeCount} hint="Working now" icon={UserCheck} tone="green" loading={!boys} />
      </div>

      <Card className="gap-0 py-0">
        <div className="border-b p-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, mobile, vehicle, area" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <CardContent className="px-0">
          {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
          {!boys ? (
            <TableSkeleton rows={4} />
          ) : !shown.length ? (
            <EmptyState icon={Truck} title={boys.length ? "No matches" : "No delivery boys yet"}>
              {boys.length ? (
                "Try another search."
              ) : (
                <>
                  Add your first delivery boy to get started.
                  <Button className="mt-4" onClick={() => setDialog({ open: true, editing: null })}>
                    <Plus /> Add delivery boy
                  </Button>
                </>
              )}
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-12 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((b) => (
                  <TableRow key={b.id} className={b.isActive ? "" : "text-muted-foreground"}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className={b.isActive ? "bg-primary/10 font-medium text-primary" : ""}>{initials(b.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-foreground">{b.name}</div>
                          {!b.isActive && (
                            <Badge variant="outline" className="mt-0.5">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <a href={`tel:${b.phone}`} className="inline-flex items-center gap-1.5 tabular-nums hover:text-primary">
                        <Phone className="size-3.5" /> {b.phone}
                      </a>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{b.vehicleNo || "—"}</TableCell>
                    <TableCell>{b.area || "—"}</TableCell>
                    <TableCell>{showDate(String(b.createdAt || "").slice(0, 10))}</TableCell>
                    <TableCell>
                      <Switch checked={b.isActive} onCheckedChange={(v) => setActive(b, v)} aria-label={`${b.name} active`} />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="More">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDialog({ open: true, editing: b })}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setToRemove(b)}>
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

      <BoyDialog open={dialog.open} editing={dialog.editing} onClose={() => setDialog({ open: false, editing: null })} onSaved={load} />

      <AlertDialog open={Boolean(toRemove)} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {toRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This deletes their details. To keep them on record, switch them to inactive instead.</AlertDialogDescription>
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
