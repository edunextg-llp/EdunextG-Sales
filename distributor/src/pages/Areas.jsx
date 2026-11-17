import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2, MapPin, Pencil, Plus, Search, Store, Trash2, X } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, StatCard, TableSkeleton } from "@/components/common";
import { api } from "@/lib/api";

// Areas: created first, then picked on each outlet (Outlets page). One name per area: the same
// name twice (any capitals / spaces) is refused. Same list as the Bawarchee app's Areas screen.

const clean = (v) => v.replace(/\s+/g, " ").trim();

export default function Areas() {
  const [areas, setAreas] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // { id, name }
  const [saving, setSaving] = useState(false);
  const [toRemove, setToRemove] = useState(null);

  const load = () =>
    api("/areas")
      .then((d) => setAreas(d.areas))
      .catch((err) => {
        setAreas([]);
        setError(err.message);
      });

  useEffect(() => {
    load();
  }, []);

  const taken = (value, exceptId) => (areas || []).find((a) => a.id !== exceptId && a.name.toLowerCase() === clean(value).toLowerCase());

  const add = async (e) => {
    e.preventDefault();
    const value = clean(name);
    setAddError("");
    if (!value) return setAddError("Enter the area name.");
    const dup = taken(value);
    if (dup) return setAddError(`"${dup.name}" is already added.`);
    setAdding(true);
    try {
      const data = await api("/areas", { method: "POST", body: { name: value } });
      toast.success(data.message);
      setName("");
      load();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
    return undefined;
  };

  const saveEdit = async () => {
    const value = clean(editing.name);
    if (!value) return toast.error("Enter the area name.");
    const dup = taken(value, editing.id);
    if (dup) return toast.error(`"${dup.name}" is already added.`);
    setSaving(true);
    try {
      await api(`/areas/${editing.id}`, { method: "PUT", body: { name: value } });
      toast.success("Area renamed.");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const remove = async () => {
    const area = toRemove;
    setToRemove(null);
    try {
      await api(`/areas/${area.id}`, { method: "DELETE" });
      toast.success(`${area.name} removed.`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (areas || []).filter((a) => !q || a.name.toLowerCase().includes(q));
  }, [areas, search]);
  const outletTotal = (areas || []).reduce((t, a) => t + (a.outletCount || 0), 0);

  return (
    <div>
      <PageHeader title="Areas" description="Create your areas first. Each outlet is then added to one of them." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Areas" value={areas?.length ?? 0} icon={MapPin} loading={!areas} />
        <StatCard label="Outlets in areas" value={outletTotal} icon={Store} tone="green" loading={!areas} />
      </div>

      <Card className="mb-6 gap-0 py-0">
        <form onSubmit={add} className="flex flex-wrap items-start gap-3 p-4">
          <div className="min-w-64 flex-1">
            <Input
              placeholder="New area name, e.g. Salt Lake"
              maxLength={120}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setAddError("");
              }}
            />
            {addError && <p className="mt-1.5 text-sm text-destructive">{addError}</p>}
          </div>
          <Button type="submit" disabled={adding}>
            {adding ? <Loader2 className="animate-spin" /> : <Plus />} Add area
          </Button>
        </form>
      </Card>

      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search areas" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" className="ml-auto" asChild>
            <Link to="/outlets">
              <Store /> Go to outlets
            </Link>
          </Button>
        </div>
        <CardContent className="px-0">
          {error && <p className="px-4 pt-4 text-sm text-destructive">{error}</p>}
          {!areas ? (
            <TableSkeleton rows={4} />
          ) : !shown.length ? (
            <EmptyState icon={MapPin} title={areas.length ? "No matches" : "No areas yet"}>
              {areas.length ? "Try another search." : "Add your first area above."}
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {shown.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <MapPin className="size-4" />
                  </div>
                  {editing?.id === a.id ? (
                    <div className="flex min-w-56 flex-1 items-center gap-2">
                      <Input
                        autoFocus
                        maxLength={120}
                        value={editing.name}
                        onChange={(e) => setEditing((ed) => ({ ...ed, name: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditing(null);
                        }}
                      />
                      <Button size="icon-sm" onClick={saveEdit} disabled={saving} aria-label="Save">
                        {saving ? <Loader2 className="animate-spin" /> : <Check />}
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel">
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{a.name}</div>
                    </div>
                  )}
                  <Badge variant="secondary" className="tabular-nums">
                    {a.outletCount} outlet{a.outletCount === 1 ? "" : "s"}
                  </Badge>
                  {editing?.id !== a.id && (
                    <span className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Rename ${a.name}`} onClick={() => setEditing({ id: a.id, name: a.name })}>
                        <Pencil />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${a.name}`} onClick={() => setToRemove(a)}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(toRemove)} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {toRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {toRemove?.outletCount
                ? `${toRemove.outletCount} outlet${toRemove.outletCount === 1 ? " is" : "s are"} in this area. Move ${toRemove.outletCount === 1 ? "it" : "them"} to another area first.`
                : "This area has no outlets, so it can be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={Boolean(toRemove?.outletCount)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
