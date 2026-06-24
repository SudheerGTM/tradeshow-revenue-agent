"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { RoleBadge } from "@/components/admin/RoleBadge";
import { useToast } from "@/components/ui/Toast";

interface ProfileData {
  id: string; name: string; email: string; role: string;
  tenantName: string | null; lastLoginAt: string | null; createdAt: string;
  allEvents: boolean; eventNames: string[];
  avatarDisplayUrl: string | null; onboardingStep: number;
}

export function ProfileClient() {
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { fetchProfile(); }, []);

  async function fetchProfile() {
    setLoading(true);
    const res = await fetch("/api/users/me");
    if (res.ok) {
      const data = await res.json();
      setProfile(data);
      setNameInput(data.name);
    }
    setLoading(false);
  }

  async function handleSaveName() {
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput }),
    });
    if (res.ok) {
      setProfile((p) => (p ? { ...p, name: nameInput } : p));
      setEditingName(false);
      toast.success("Profile updated");
    } else {
      toast.error("Failed to update profile");
    }
  }

  async function handleAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const initiateRes = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileType: file.type, fileSizeBytes: file.size }),
      });
      if (!initiateRes.ok) {
        const data = await initiateRes.json();
        throw new Error(data.error ?? "Failed to start upload");
      }
      const { uploadUrl, s3Key } = await initiateRes.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: s3Key }),
      });

      await fetchProfile();
      toast.success("Avatar updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#94A3B8]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Profile" description="Manage your account settings" />

      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative w-16 h-16 rounded-2xl bg-[#0F4C81] flex items-center justify-center text-white text-xl font-bold shrink-0 overflow-hidden group"
          >
            {profile.avatarDisplayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarDisplayUrl} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              profile.name[0]?.toUpperCase()
            )}
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              {uploadingAvatar ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelected} />
          <div className="min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
                <Button size="sm" onClick={handleSaveName}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => { setEditingName(false); setNameInput(profile.name); }}>Cancel</Button>
              </div>
            ) : (
              <button onClick={() => setEditingName(true)} className="text-left">
                <p className="text-lg font-semibold text-[#0F172A] hover:underline">{profile.name}</p>
              </button>
            )}
            <p className="text-sm text-[#94A3B8]">{profile.email}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[#94A3B8] text-xs uppercase tracking-wider mb-1">Role</dt>
            <dd><RoleBadge role={profile.role} /></dd>
          </div>
          <div>
            <dt className="text-[#94A3B8] text-xs uppercase tracking-wider mb-1">Tenant</dt>
            <dd className="text-[#0F172A]">{profile.tenantName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[#94A3B8] text-xs uppercase tracking-wider mb-1">Last Login</dt>
            <dd className="text-[#0F172A]">{profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : "Never"}</dd>
          </div>
          <div>
            <dt className="text-[#94A3B8] text-xs uppercase tracking-wider mb-1">Joined</dt>
            <dd className="text-[#0F172A]">{new Date(profile.createdAt).toLocaleDateString()}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[#94A3B8] text-xs uppercase tracking-wider mb-1">Event Access</dt>
            <dd className="text-[#0F172A]">{profile.allEvents ? "All Events" : (profile.eventNames.join(", ") || "No events assigned")}</dd>
          </div>
        </dl>

        <div className="pt-2 border-t border-[#E2E8F0]">
          <Button variant="secondary" onClick={() => setShowChangePassword(true)}>Change Password</Button>
        </div>
      </div>

      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to change password");
      return;
    }
    toast.success("Password changed");
    setCurrentPassword(""); setNewPassword(""); setConfirm("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Change Password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <Input label="Confirm New Password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p className="text-xs text-[#94A3B8]">At least 12 characters, with uppercase, lowercase, number, and special character.</p>
        {error && <p className="text-xs text-[#DC2626] bg-[#fee2e2] border border-[#DC2626]/20 rounded-xl px-3 py-2">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">Change Password</Button>
      </form>
    </Modal>
  );
}
