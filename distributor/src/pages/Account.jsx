import { useState } from "react";
import { Building2, KeyRound, Loader2, Mail, MapPin, Phone, ReceiptText, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/common";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function Account() {
  const { profile } = useAuth();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.newPassword !== form.confirm) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      const data = await api("/password", { method: "PUT", body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      toast.success(data.message);
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div>
      <PageHeader title="Account" description="Your details on record with the company, and your password." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>To change these, please contact the company.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <Row icon={Building2} label="Business name" value={profile?.name} />
            <Row icon={User} label="Contact person" value={profile?.contactPerson} />
            <Row icon={KeyRound} label="Login ID" value={profile?.loginId} />
            <Row icon={Phone} label="Phone" value={profile?.phone} />
            <Row icon={Mail} label="Email" value={profile?.email} />
            <Row icon={ReceiptText} label="GSTIN" value={profile?.gstin} />
            <Row icon={MapPin} label="Address" value={profile?.address} />
            <Row icon={Building2} label="Company" value={profile?.companyName} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>At least 6 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cur">Current password</Label>
                <Input id="cur" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set("currentPassword")} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new">New password</Label>
                <Input id="new" type="password" autoComplete="new-password" minLength={6} value={form.newPassword} onChange={set("newPassword")} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input id="confirm" type="password" autoComplete="new-password" minLength={6} value={form.confirm} onChange={set("confirm")} required />
              </div>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-fit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
