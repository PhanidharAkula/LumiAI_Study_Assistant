import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@shared/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import ConfirmDialog from "@shared/components/ConfirmDialog";
import { Constellation, UI } from "@shared/components/atlas";
import {
  Button,
  CloseButton,
  IconButton,
  Spinner,
} from "@shared/components/controls";
import { useLoadingSignal } from "@shared/lib/loadingSignal";
import Select from "@shared/components/Select";
import { fadeRiseSoft, stagger } from "@shared/motion";
import AdminAnalytics from "./AdminAnalytics";
import {
  adminGetAllTickets,
  adminSetTicketStatus,
  type SupportTicket,
  type TicketStatus,
} from "@shared/services/supportService";

// A row in the admin user list, derived from the admin_get_user_stats RPC.
interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  region: string;
  is_admin: boolean;
  classesCount: number;
  filesCount: number;
  totalStorage: number;
}

// Pending action descriptors for the confirmation dialogs.
interface DeleteConfirm {
  userId: string;
  userName: string;
  userEmail: string;
}

interface AdminToggleConfirm {
  userId: string;
  userName: string;
  makeAdmin: boolean;
}

type AdminSection = "analytics" | "tickets" | "users" | "controls";

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

const TICKET_CATEGORY_LABELS: Record<string, string> = {
  general: "General question",
  account: "Account & login",
  bug: "Something's broken",
  feature: "Feature request",
  other: "Other",
};

const USERS_PER_PAGE = 10;

// ── Observatory chrome - shared class groups ───────────────────────────────
// One canonical filter pill (used by the Users region/date/admin filters AND
// the ticket-status filter). Hairline → ink-fill when armed; body font for the
// label (mono is reserved for overline LABELS, never action text).
const FILTER_PILL_BASE =
  "rounded-full border border-solid px-3.5 py-1.5 text-[13px] font-medium cursor-pointer font-[inherit] transition-[color,background-color,border-color,box-shadow] duration-200 max-md:py-2 max-md:min-h-9 max-[480px]:flex-1 max-[480px]:min-w-20 max-[480px]:justify-center";
const filterPill = (active: boolean) =>
  `${FILTER_PILL_BASE} ${
    active
      ? "border-ink bg-ink text-cream"
      : "border-ink/25 bg-transparent text-ink hover:border-ink"
  }`;

// Form select used in the canonical toolbars (region/date/admin/sort/ticket).
const TOOLBAR_SELECT =
  "rounded-lg border border-solid border-ink/20 bg-white/60 px-3 py-2 text-[13px] font-medium font-[inherit] text-ink cursor-pointer outline-none transition-colors focus:border-gold-deep max-md:text-[14px] max-[480px]:text-[16px]";

// One status/severity chip vocabulary: hairline border + wash bg + text-safe
// colour. verdi = good (in progress / resolved-ish), gold-deep = pending
// (open), vermilion = bad. Used by tickets + the maintenance banner.
type ChipTone = "good" | "pending" | "bad" | "neutral";
const CHIP_TONES: Record<ChipTone, string> = {
  good: "border-verdi/40 bg-sage/25 text-verdi",
  pending: "border-gold-deep/40 bg-gold/10 text-gold-deep",
  bad: "border-vermilion/40 bg-vermilion-wash text-vermilion",
  neutral: "border-line bg-cream/70 text-muted",
};
const chip = (tone: ChipTone) =>
  `inline-flex items-center gap-1.5 rounded-full border border-solid px-2.5 py-0.75 font-mono text-[10px] font-medium uppercase tracking-[0.12em] whitespace-nowrap ${CHIP_TONES[tone]}`;
const TICKET_STATUS_TONE: Record<string, ChipTone> = {
  open: "pending",
  in_progress: "good",
  resolved: "neutral",
};

// Mono overline column head for the desktop semantic tables.
const TH =
  "px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted whitespace-nowrap";
// Vellum row hover for desktop table rows.
const TR =
  "border-0 border-t border-solid border-line transition-colors duration-200 hover:bg-cream/60";
const TD = "px-3 py-3 align-middle text-[13.5px] text-ink";

// Stacked plate-card label/value pair (the <768px table fallback).
const CARD_ROW =
  "flex items-baseline justify-between gap-3 border-0 border-t border-solid border-line py-2 first:border-t-0 first:pt-0";
const CARD_LABEL =
  "font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted shrink-0";
const CARD_VALUE = "text-[13.5px] text-ink text-right [word-break:break-word]";

const USER_SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "classes", label: "Most classes" },
  { value: "files", label: "Most files" },
  { value: "storage", label: "Most storage" },
];

// Returns a sorted COPY of the user list for the chosen key.
function sortUsers(list: AdminUser[], by: string) {
  const copy = [...list];
  const t = (u: AdminUser) => new Date(u.created_at).getTime();
  switch (by) {
    case "oldest":
      return copy.sort((a, b) => t(a) - t(b));
    case "name":
      return copy.sort((a, b) =>
        (a.full_name || a.email)
          .toLowerCase()
          .localeCompare((b.full_name || b.email).toLowerCase())
      );
    case "classes":
      return copy.sort((a, b) => b.classesCount - a.classesCount);
    case "files":
      return copy.sort((a, b) => b.filesCount - a.filesCount);
    case "storage":
      return copy.sort((a, b) => b.totalStorage - a.totalStorage);
    case "newest":
    default:
      return copy.sort((a, b) => t(b) - t(a));
  }
}

// Instrument switch - hairline track + muted knob when off; filled track +
// starlight knob when on. `tone="vermilion"` is the maintenance warning state.
function SettingToggle({
  checked,
  onChange,
  title,
  tone = "ink",
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  tone?: "ink" | "vermilion";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      title={title}
      className={`relative w-12 h-7 shrink-0 rounded-full border border-solid cursor-pointer p-0 [transition:background-color_0.2s,border-color_0.2s] ${
        checked
          ? tone === "vermilion"
            ? "border-vermilion bg-vermilion"
            : "border-ink bg-ink"
          : "border-ink/25 bg-transparent hover:border-ink/50"
      }`}
    >
      <span
        className={`absolute top-1 w-4.5 h-4.5 rounded-full [transition:left_0.2s,background-color_0.2s] ${
          checked ? "left-6 bg-starlight" : "left-1 bg-muted"
        }`}
      />
    </button>
  );
}

// ── Section header row (sticky) - mono plate code + Fraunces heading + the
// section's own toolbar. Shared by every plate so they read like atlas pages.
function SectionHeader({
  code,
  title,
  badge,
  toolbar,
}: {
  code: string;
  title: string;
  badge?: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-5.5 -mt-5.5 mb-5 flex flex-col gap-3 rounded-t-xl border-0 border-b border-solid border-line bg-vellum/95 px-5.5 py-4 backdrop-blur-[2px] max-md:-mx-4 max-md:-mt-4 max-md:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-col gap-1">
          <span className={UI.overline}>{code}</span>
          <h2 className="m-0 font-display text-[22px] font-semibold leading-none tracking-[-0.01em] text-ink max-md:text-[19px]">
            {title}
          </h2>
        </div>
        {badge}
      </div>
      {toolbar}
    </div>
  );
}

export default function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AdminUser[]>([]);
  // Right-column view: analytics overview, tickets, the (paginated) users list,
  // and the global instrument controls (settings).
  const [activeTab, setActiveTab] = useState<AdminSection>("users");
  const [usersPage, setUsersPage] = useState(1);
  const [sortBy, setSortBy] = useState("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all"); // all, today, week, month, year
  const [adminFilter, setAdminFilter] = useState("all"); // all, admin, member
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  // Feed the one persistent loader during the admin check ("Reading the
  // instruments", matching the route label) instead of a separate spinner below
  // the masthead - so it stays in place from the route chunk, no position jump.
  useLoadingSignal(isAdmin === null, "Reading the instruments");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(
    null
  ); // { userId, userName, userEmail }
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [accountDeletionEnabled, setAccountDeletionEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketFilter, setTicketFilter] = useState("all");
  const [ticketSearch, setTicketSearch] = useState("");
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [adminToggleConfirm, setAdminToggleConfirm] =
    useState<AdminToggleConfirm | null>(null); // { userId, userName, makeAdmin }
  const [savingAdminId, setSavingAdminId] = useState<string | null>(null);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
  const navigate = useNavigate();

  function formatBytes(bytes: number) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i += 1;
    }
    return `${Math.round(val * 10) / 10} ${units[i]}`;
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return "Unknown";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getUniqueRegions() {
    const regions = users.map((u) => u.region).filter(Boolean);
    return [...new Set(regions)].sort();
  }

  // Download the current (filtered + sorted) user list as a CSV file.
  function exportUsersCsv() {
    const rows = sortUsers(filteredUsers, sortBy);
    const header = [
      "Name",
      "Email",
      "Region",
      "Admin",
      "Joined",
      "Classes",
      "Files",
      "Storage",
    ];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    rows.forEach((u) => {
      lines.push(
        [
          esc(u.full_name || ""),
          esc(u.email),
          esc(u.region),
          u.is_admin ? "Yes" : "No",
          esc(formatDate(u.created_at)),
          u.classesCount,
          u.filesCount,
          esc(formatBytes(u.totalStorage)),
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lumi-users-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session || !session.user) {
        navigate("/login");
        return;
      }

      const userId = session.user.id;
      setCurrentUserId(userId);
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", userId)
        .limit(1)
        .maybeSingle();
      if (profileErr && profileErr.code !== "PGRST116")
        console.error(profileErr);

      const admin = profile && profile.is_admin === true;
      setIsAdmin(admin);

      if (admin) {
        await fetchUsers();
        await fetchSettings();
        await fetchTickets();
      }
    } catch (err) {
      console.error("init error:", err);
      setError("Failed to initialize admin");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    try {
      // Use new admin RPC function that bypasses RLS
      const { data, error } = await supabase.rpc("admin_get_user_stats");

      if (error) throw error;

      const enrichedUsers: AdminUser[] = (data || []).map((user: any) => ({
        id: user.user_id,
        email: user.email,
        full_name:
          user.full_name ||
          (user.raw_user_meta_data && user.raw_user_meta_data.full_name) ||
          "",
        avatar_url: user.avatar_url,
        created_at: user.created_at,
        region: user.region || "Unknown",
        is_admin: user.is_admin === true,
        classesCount: parseInt(user.classes_count) || 0,
        filesCount: parseInt(user.files_count) || 0,
        totalStorage: parseInt(user.total_storage) || 0,
      }));

      setUsers(enrichedUsers);
      setFilteredUsers(enrichedUsers);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError(
        (err instanceof Error ? err.message : String(err)) ||
          "Error fetching users"
      );
    } finally {
      setLoading(false);
    }
  }

  // Filter users based on search query, region, and date
  useEffect(() => {
    let filtered = [...users];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((user) => {
        const name = (user.full_name || "").toLowerCase();
        const email = (user.email || "").toLowerCase();
        return name.includes(query) || email.includes(query);
      });
    }

    // Region filter
    if (regionFilter !== "all") {
      filtered = filtered.filter((user) => user.region === regionFilter);
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter((user) => {
        const createdAt = new Date(user.created_at);
        const diffMs =
          (now as unknown as number) - (createdAt as unknown as number);
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        switch (dateFilter) {
          case "today":
            return diffDays < 1;
          case "week":
            return diffDays < 7;
          case "month":
            return diffDays < 30;
          case "thisMonth": {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); // 1st day of current month
            return createdAt >= startOfMonth;
          }
          case "thisYear": {
            const startOfYear = new Date(now.getFullYear(), 0, 1); // Jan 1st of current year
            return createdAt >= startOfYear;
          }
          case "year":
            return diffDays < 365;
          default:
            return true;
        }
      });
    }

    // Admin access filter
    if (adminFilter !== "all") {
      filtered = filtered.filter((user) =>
        adminFilter === "admin" ? user.is_admin : !user.is_admin
      );
    }

    setFilteredUsers(filtered);
    setUsersPage(1); // any filter/search change → back to the first page
  }, [searchQuery, regionFilter, dateFilter, adminFilter, users]);

  async function fetchSettings() {
    try {
      const { data } = await supabase.from("app_settings").select("key, value");
      if (data) {
        const map: Record<string, any> = Object.fromEntries(
          data.map((r: any) => [r.key, r.value])
        );
        if ("account_deletion_enabled" in map)
          setAccountDeletionEnabled(map.account_deletion_enabled !== false);
        setMaintenanceMode(map.maintenance_mode === true);
        const ann =
          typeof map.announcement === "string" ? map.announcement : "";
        setAnnouncement(ann);
        setAnnouncementDraft(ann);
      }
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  }

  // Upsert a single key/value into app_settings (RLS lets admins insert+update).
  async function updateSetting(key: string, value: unknown) {
    const { error: updErr } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (updErr) console.error(`Error updating ${key}:`, updErr);
    return !updErr;
  }

  async function fetchTickets() {
    setTicketsLoading(true);
    try {
      const { data } = await adminGetAllTickets();
      setTickets(data);
    } catch (e) {
      console.error("Error loading tickets:", e);
    } finally {
      setTicketsLoading(false);
    }
  }

  async function handleTicketStatusChange(id: string, status: TicketStatus) {
    setSavingTicketId(id);
    // Optimistic update; refetch from the server if the write fails.
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    const { error: updErr } = await adminSetTicketStatus(id, status);
    if (updErr) {
      console.error("Error updating ticket:", updErr);
      await fetchTickets();
    }
    setSavingTicketId(null);
  }

  async function toggleAccountDeletion() {
    const next = !accountDeletionEnabled;
    setAccountDeletionEnabled(next); // optimistic
    if (!(await updateSetting("account_deletion_enabled", next)))
      setAccountDeletionEnabled(!next); // revert on failure
  }

  async function toggleMaintenance() {
    const next = !maintenanceMode;
    setMaintenanceMode(next); // optimistic
    if (!(await updateSetting("maintenance_mode", next)))
      setMaintenanceMode(!next); // revert on failure
  }

  async function saveAnnouncement() {
    const next = announcementDraft.trim();
    const prev = announcement;
    setAnnouncement(next); // optimistic
    if (!(await updateSetting("announcement", next))) setAnnouncement(prev);
  }

  async function confirmToggleAdmin() {
    if (!adminToggleConfirm) return;
    const { userId, makeAdmin } = adminToggleConfirm;
    setAdminToggleConfirm(null);
    setSavingAdminId(userId);

    // Optimistic: flip the flag locally; the filter effect re-derives the list.
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_admin: makeAdmin } : u))
    );

    const { data, error } = await supabase.rpc("admin_set_user_admin", {
      target_user_id: userId,
      make_admin: makeAdmin,
    });

    if (error || (data && data.ok === false)) {
      console.error("admin_set_user_admin failed:", error || data);
      // Revert on failure.
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_admin: !makeAdmin } : u))
      );
      setAdminActionError("Couldn't update admin access. Please try again.");
    }
    setSavingAdminId(null);
  }

  async function handleDeleteUser() {
    if (!deleteConfirm) return;

    try {
      const { userId } = deleteConfirm;

      // Get all file paths for storage cleanup
      const { data: files, error: filesError } = await supabase
        .from("files")
        .select("path")
        .eq("user_id", userId);

      if (filesError) {
        console.error("Error fetching files:", filesError);
      }

      const filePaths = files?.map((f) => f.path).filter(Boolean) || [];

      // Delete files from storage
      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("files")
          .remove(filePaths);

        if (storageError) {
          console.error("Error deleting files from storage:", storageError);
        }
      }

      // Call admin delete user RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "admin_delete_user",
        { target_user_id: userId }
      );

      if (rpcError) {
        console.error("Error calling admin_delete_user:", rpcError);
        throw new Error(
          `Failed to delete user: ${rpcError.message || "Unknown error"}`
        );
      }

      if (rpcData && rpcData.ok === false) {
        throw new Error(
          `User deletion failed: ${rpcData.error || "Unknown error"}`
        );
      }

      // Close confirm dialog and show success
      setDeleteConfirm(null);
      setDeleteSuccess(true);

      // Refresh user list
      await fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      setDeleteConfirm(null);
      setDeleteError(
        (error instanceof Error ? error.message : "") || "Please try again."
      );
    }
  }

  const ticketQuery = ticketSearch.trim().toLowerCase();
  const filteredTickets = tickets
    .filter((t) => ticketFilter === "all" || t.status === ticketFilter)
    .filter((t) => {
      if (!ticketQuery) return true;
      return (
        (t.subject || "").toLowerCase().includes(ticketQuery) ||
        (t.email || "").toLowerCase().includes(ticketQuery) ||
        (t.message || "").toLowerCase().includes(ticketQuery) ||
        (t.category || "").toLowerCase().includes(ticketQuery)
      );
    });

  // Users pagination (10 per page). currentPage is clamped so deleting users
  // or shrinking the filtered set can't strand us on a now-empty page.
  const totalUserPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / USERS_PER_PAGE)
  );
  const currentPage = Math.min(usersPage, totalUserPages);
  const pageStart = (currentPage - 1) * USERS_PER_PAGE;
  const sortedUsers = sortUsers(filteredUsers, sortBy);
  const pagedUsers = sortedUsers.slice(pageStart, pageStart + USERS_PER_PAGE);

  const hasUserFilters =
    !!searchQuery ||
    regionFilter !== "all" ||
    dateFilter !== "all" ||
    adminFilter !== "all";

  // Plate-code per section (atlas-page styling for the sticky section header).
  const SECTION_META: Record<AdminSection, { code: string; title: string }> = {
    analytics: { code: "PLATE A1 · OVERVIEW", title: "Analytics" },
    tickets: { code: "PLATE A2 · TICKETS", title: "Support tickets" },
    users: { code: "PLATE A3 · OBSERVERS", title: "Users" },
    controls: { code: "PLATE A4 · INSTRUMENTS", title: "Controls" },
  };

  // Rail / tab-band navigation model - shared by the desktop left rail and the
  // mobile horizontal segmented band. Counts render as small badges.
  const NAV: {
    id: AdminSection;
    label: string;
    badge?: number;
    icon: ReactNode;
  }[] = [
    {
      id: "analytics",
      label: "Analytics",
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      id: "tickets",
      label: "Tickets",
      badge: tickets.length,
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      id: "users",
      label: "Users",
      badge: users.length,
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      id: "controls",
      label: "Controls",
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  // ── The canonical Users filter toolbar (ONE per section, adapts at 768px) ─
  // Desktop: a search field + three select dropdowns + a result/clear readout.
  // Below 768px the same controls stack full-width. We never render the old
  // pills-AND-selects pair that overlapped at the break.
  const usersToolbar = users.length > 0 && (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
        {/* Search */}
        <div className="relative min-w-45 flex-1 max-md:min-w-0">
          <input
            type="text"
            className="w-full rounded-lg border border-solid border-ink/20 bg-white/60 py-2 pl-3.5 pr-9 text-[13px] font-[inherit] text-ink transition-colors placeholder:text-muted/60 focus:border-gold-deep focus:outline-none max-md:text-[14px] max-md:py-2.5 max-[480px]:text-[16px]"
            placeholder="Search users…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        {/* Region */}
        <Select
          ariaLabel="Filter by region"
          className={`${TOOLBAR_SELECT} max-md:w-full`}
          value={regionFilter}
          onChange={setRegionFilter}
          options={[
            { value: "all", label: "All regions" },
            ...getUniqueRegions().map((region) => ({
              value: region,
              label: region,
            })),
          ]}
        />
        {/* Join date */}
        <Select
          ariaLabel="Filter by join date"
          className={`${TOOLBAR_SELECT} max-md:w-full`}
          value={dateFilter}
          onChange={setDateFilter}
          options={[
            { value: "all", label: "All time" },
            { value: "today", label: "Today" },
            { value: "week", label: "Last 7 days" },
            { value: "month", label: "Last 30 days" },
            { value: "thisMonth", label: "This month" },
            { value: "thisYear", label: "This year" },
            { value: "year", label: "Last year" },
          ]}
        />
        {/* Admin access */}
        <Select
          ariaLabel="Filter by admin access"
          className={`${TOOLBAR_SELECT} max-md:w-full`}
          value={adminFilter}
          onChange={setAdminFilter}
          options={[
            { value: "all", label: "All users" },
            { value: "admin", label: "Admins only" },
            { value: "member", label: "Members only" },
          ]}
        />
      </div>
      {hasUserFilters && (
        <motion.div
          className="flex items-center justify-between gap-2"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            {filteredUsers.length} of {users.length} shown
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="py-1.5! px-3.5! text-[12px]!"
            onClick={() => {
              setSearchQuery("");
              setRegionFilter("all");
              setDateFilter("all");
              setAdminFilter("all");
            }}
          >
            Clear filters
          </Button>
        </motion.div>
      )}
    </div>
  );

  // ── The canonical Tickets toolbar (ONE per section, adapts at 768px) ──────
  const ticketsToolbar = (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Search subject, email, message…"
          value={ticketSearch}
          onChange={(e) => setTicketSearch(e.target.value)}
          className="w-full rounded-lg border border-solid border-ink/20 bg-white/60 py-2 pl-9 pr-3 text-[13px] font-[inherit] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-gold-deep max-md:text-[14px] max-md:py-2.5 max-[480px]:text-[16px]"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "All" },
          { value: "open", label: "Open" },
          { value: "in_progress", label: "In progress" },
          { value: "resolved", label: "Resolved" },
        ].map((f) => (
          <button
            key={f.value}
            type="button"
            className={filterPill(ticketFilter === f.value)}
            onClick={() => setTicketFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );

  // ── The canonical Users sort/export toolbar row (in-body, not the header) ─
  const usersSortRow = (
    <div className="mb-4 flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <Button
        variant="ghost"
        size="sm"
        onClick={exportUsersCsv}
        title="Download the current (filtered) user list as CSV"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export CSV
      </Button>
      <div className="flex items-center gap-2 max-md:justify-between">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
          Sort by
        </span>
        <Select
          ariaLabel="Sort by"
          value={sortBy}
          onChange={(v) => {
            setSortBy(v);
            setUsersPage(1);
          }}
          className={TOOLBAR_SELECT}
          options={USER_SORTS}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh w-full overflow-x-hidden px-12.5 pb-25 pt-0 max-[1024px]:px-7.5 max-md:px-5 max-md:pb-20 max-[480px]:px-3.75">
      {/* Masthead - the control-room banner */}
      <motion.div
        className="flex items-center justify-between gap-4 px-2.5 pb-5 pt-7.5 max-md:px-1 max-md:pt-5"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex flex-col gap-1">
          <span className={`${UI.overline} max-[480px]:tracking-[0.16em]`}>
            Observatory control
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 font-display text-[30px] font-semibold tracking-[-0.01em] text-ink max-[1200px]:text-[26px] max-md:text-[22px] max-[480px]:text-[20px]">
              Admin Dashboard
            </h1>
            <span className={`${chip("pending")} max-[480px]:hidden`}>
              Admin ✦
            </span>
          </div>
          <p className="m-0 text-[13.5px] text-muted max-md:text-[12.5px]">
            Manage users, tickets, and system instruments
          </p>
        </div>
        {/* Right-side dismiss = close icon (leaves the portal for the dashboard). */}
        <CloseButton
          variant="key"
          onClick={() => navigate("/dashboard")}
          label="Close admin portal"
          className="shrink-0"
        />
      </motion.div>

      {/* Hairline rule under the masthead */}
      <div className="px-2.5 max-md:px-1">
        <div className={UI.rule} />
      </div>

      {error && (
        <div className="mx-2.5 mt-4 rounded-lg border border-solid border-vermilion/30 bg-vermilion-wash p-3 text-[14px] font-medium text-vermilion max-md:mx-1">
          {error}
        </div>
      )}

      {/* Access denied - restricted instruments */}
      {isAdmin === false && (
        <div className="flex h-[70dvh] flex-col items-center justify-center gap-3 text-center">
          <Constellation
            name="observatory control"
            size={120}
            className="text-ink/30"
          />
          <span className={UI.overlineMuted}>Restricted instruments</span>
          <p className="m-0 font-display text-[26px] font-semibold text-ink">
            Not Authorised
          </p>
        </div>
      )}

      {/* Initial boot covered by the global loader (useLoadingSignal above). */}

      {/* Control room - compact left rail + content plate */}
      {isAdmin === true && (
        <div className="mt-4 grid grid-cols-[240px_1fr] items-start gap-5 px-2.5 max-[1100px]:grid-cols-1 max-md:px-1">
          {/* LEFT RAIL (desktop) / TOP TAB BAND (mobile) */}
          <nav
            aria-label="Admin sections"
            className="sticky top-3 z-30 self-start max-[1100px]:static"
          >
            {/* Desktop rail - vertical instrument index */}
            <div
              className={`${UI.plate} flex flex-col gap-1 p-2 max-[1100px]:hidden`}
            >
              <p className={`px-2 pb-1 pt-1.5 ${UI.overlineMuted}`}>Sections</p>
              {NAV.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2.5 rounded-lg border border-solid px-2.5 py-2 text-left transition-[color,background-color,border-color,box-shadow] duration-200 ${
                      active
                        ? "border-ink bg-ink text-cream"
                        : "border-transparent bg-transparent text-ink hover:border-line hover:bg-cream/60"
                    }`}
                  >
                    <span className={active ? "text-gold" : "text-muted"}>
                      {item.icon}
                    </span>
                    <span className="flex-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">
                      {item.label}
                    </span>
                    {item.badge !== undefined && (
                      <span
                        className={`min-w-5 rounded-full px-1.5 py-0.5 text-center font-mono text-[10px] font-medium ${
                          active
                            ? "bg-cream/20 text-cream"
                            : "bg-ink/6 text-muted"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile band - horizontal segmented track, scrolls in its own
                lane (never wraps/overlaps). Hidden scrollbar. */}
            <div className="hidden max-[1100px]:block">
              <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="inline-flex min-w-full gap-1 rounded-full border border-solid border-line bg-vellum p-1 shadow-plate">
                  {NAV.map((item) => {
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={active ? "page" : undefined}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-[color,background-color] duration-200 ${
                          active
                            ? "bg-ink text-cream"
                            : "bg-transparent text-muted hover:text-ink"
                        }`}
                      >
                        {item.label}
                        {item.badge !== undefined && (
                          <span
                            className={`min-w-4 rounded-full px-1 text-center text-[10px] ${
                              active
                                ? "bg-cream/20 text-cream"
                                : "bg-ink/6 text-muted"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </nav>

          {/* CONTENT PLATE */}
          <div className="min-w-0">
            <motion.section
              key={activeTab}
              className={`${UI.plate} p-5.5 max-md:p-4`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {/* ── ANALYTICS ─────────────────────────────────────────── */}
              {activeTab === "analytics" && (
                <>
                  <SectionHeader
                    code={SECTION_META.analytics.code}
                    title={SECTION_META.analytics.title}
                  />
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <Spinner label="Reading the instruments…" />
                    </div>
                  ) : (
                    <AdminAnalytics users={users} />
                  )}
                </>
              )}

              {/* ── TICKETS ───────────────────────────────────────────── */}
              {activeTab === "tickets" && (
                <>
                  <SectionHeader
                    code={SECTION_META.tickets.code}
                    title={SECTION_META.tickets.title}
                    badge={
                      <span className={chip("neutral")}>{tickets.length}</span>
                    }
                    toolbar={ticketsToolbar}
                  />
                  {ticketsLoading ? (
                    <div className="flex justify-center py-10">
                      <Spinner label="Loading tickets…" />
                    </div>
                  ) : filteredTickets.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 p-6.5 text-center">
                      <Constellation
                        name="support tickets"
                        size={96}
                        className="text-ink/30"
                      />
                      <span className={UI.overlineMuted}>
                        All quiet tonight
                      </span>
                      <p className="m-0 font-display text-[16px] text-muted">
                        {tickets.length === 0
                          ? "No support tickets yet."
                          : "No tickets match this filter."}
                      </p>
                    </div>
                  ) : (
                    <motion.div
                      className="flex flex-col gap-3"
                      variants={stagger(0.04, 0.04)}
                      initial="hidden"
                      animate="visible"
                    >
                      {filteredTickets.map((t) => (
                        <motion.div
                          key={t.id}
                          variants={fadeRiseSoft}
                          className="rounded-xl border border-solid border-line bg-cream/60 p-4 transition-colors duration-200 hover:border-ink/30"
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <span className="font-semibold [word-break:break-word]">
                              {t.subject}
                            </span>
                            <Select
                              ariaLabel="Ticket status"
                              className="shrink-0 cursor-pointer rounded-lg border border-solid border-ink/20 bg-white/60 px-2.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink outline-none transition-colors focus:border-gold-deep"
                              value={t.status}
                              disabled={savingTicketId === t.id}
                              onChange={(v) =>
                                handleTicketStatusChange(
                                  t.id,
                                  v as TicketStatus
                                )
                              }
                              options={[
                                { value: "open", label: "Open" },
                                { value: "in_progress", label: "In progress" },
                                { value: "resolved", label: "Resolved" },
                              ]}
                            />
                          </div>
                          <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[0.82rem] text-muted">
                            {t.email && (
                              <>
                                <a
                                  className="font-semibold text-ink no-underline transition-colors hover:text-gold-deep hover:underline"
                                  href={`mailto:${t.email}?subject=Re: ${encodeURIComponent(
                                    t.subject
                                  )}`}
                                >
                                  {t.email}
                                </a>
                                <span className="text-gold" aria-hidden="true">
                                  ✦
                                </span>
                              </>
                            )}
                            <span className={chip("neutral")}>
                              {TICKET_CATEGORY_LABELS[t.category] || t.category}
                            </span>
                            <span className="font-mono text-[11px] uppercase tracking-[0.06em]">
                              {formatDate(t.created_at)}
                            </span>
                            <span
                              className={chip(
                                TICKET_STATUS_TONE[t.status] || "neutral"
                              )}
                            >
                              {TICKET_STATUS_LABELS[t.status] || t.status}
                            </span>
                          </div>
                          <p className="m-0 whitespace-pre-wrap leading-normal [word-break:break-word]">
                            {t.message}
                          </p>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </>
              )}

              {/* ── USERS ─────────────────────────────────────────────── */}
              {activeTab === "users" && (
                <>
                  <SectionHeader
                    code={SECTION_META.users.code}
                    title={SECTION_META.users.title}
                    badge={
                      <span className={chip("neutral")}>{users.length}</span>
                    }
                    toolbar={usersToolbar || undefined}
                  />
                  {loading ? (
                    <div className="flex justify-center py-15">
                      <Spinner label="Reading the instruments…" />
                    </div>
                  ) : users.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 p-10 text-center">
                      <Constellation
                        name="observers"
                        size={110}
                        className="text-ink/30"
                      />
                      <span className={UI.overlineMuted}>An empty ledger</span>
                      <p className="m-0 font-display text-[16px] text-muted">
                        No users found.
                      </p>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 p-10 text-center">
                      <Constellation
                        name="search the sky"
                        size={96}
                        className="text-ink/30"
                      />
                      <span className={UI.overlineMuted}>
                        Nothing in this quadrant
                      </span>
                      <p className="m-0 font-display text-[16px] text-muted">
                        No users match your search.
                      </p>
                    </div>
                  ) : (
                    <>
                      {usersSortRow}

                      {totalUserPages > 1 && (
                        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-solid border-line bg-cream/60 px-4 py-2.5 max-md:flex-col max-md:gap-2">
                          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                            Showing {pageStart + 1}–
                            {Math.min(
                              pageStart + USERS_PER_PAGE,
                              filteredUsers.length
                            )}{" "}
                            of {filteredUsers.length}
                          </span>
                          <div className="flex items-center gap-3">
                            <IconButton
                              size="sm"
                              variant="ghost"
                              label="Previous page"
                              disabled={currentPage === 1}
                              onClick={() => setUsersPage(currentPage - 1)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="15 18 9 12 15 6" />
                              </svg>
                            </IconButton>
                            <span className="font-mono text-[12px] font-semibold text-ink">
                              {currentPage} / {totalUserPages}
                            </span>
                            <IconButton
                              size="sm"
                              variant="ghost"
                              label="Next page"
                              disabled={currentPage === totalUserPages}
                              onClick={() => setUsersPage(currentPage + 1)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            </IconButton>
                          </div>
                        </div>
                      )}

                      {/* Desktop: semantic table (hairline rules, mono heads) */}
                      <div className="overflow-hidden rounded-xl border border-solid border-line max-md:hidden">
                        <table className="w-full border-collapse text-left">
                          <thead className="bg-cream/60">
                            <tr>
                              <th className={`${TH} w-10`}>#</th>
                              <th className={TH}>Observer</th>
                              <th className={TH}>Region</th>
                              <th className={TH}>Joined</th>
                              <th className={`${TH} text-right`}>Classes</th>
                              <th className={`${TH} text-right`}>Files</th>
                              <th className={`${TH} text-right`}>Storage</th>
                              <th className={`${TH} text-right`}>Admin</th>
                              <th className={`${TH} text-right`}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedUsers.map((u, index) => (
                              <tr key={u.id} className={TR}>
                                <td
                                  className={`${TD} font-mono text-[11px] text-muted`}
                                >
                                  {pageStart + index + 1}
                                </td>
                                <td className={TD}>
                                  <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-solid border-verdi/30 bg-sage/40 font-display text-[17px] font-semibold text-verdi">
                                      {(u.full_name || u.email)
                                        .charAt(0)
                                        .toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">
                                          {u.full_name || u.email.split("@")[0]}
                                        </span>
                                        {u.is_admin && (
                                          <span className={chip("pending")}>
                                            Admin ✦
                                          </span>
                                        )}
                                      </div>
                                      <div className="truncate text-[12.5px] text-muted">
                                        {u.email}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td
                                  className={`${TD} whitespace-nowrap text-muted`}
                                >
                                  {u.region}
                                </td>
                                <td
                                  className={`${TD} whitespace-nowrap text-muted`}
                                >
                                  {formatDate(u.created_at)}
                                </td>
                                <td
                                  className={`${TD} text-right font-mono text-[13px]`}
                                >
                                  {u.classesCount}
                                </td>
                                <td
                                  className={`${TD} text-right font-mono text-[13px]`}
                                >
                                  {u.filesCount}
                                </td>
                                <td
                                  className={`${TD} whitespace-nowrap text-right font-mono text-[13px]`}
                                >
                                  {formatBytes(u.totalStorage)}
                                </td>
                                <td className={`${TD} text-right`}>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={u.is_admin}
                                    aria-label={
                                      u.is_admin
                                        ? `Revoke admin access for ${u.full_name || u.email}`
                                        : `Make ${u.full_name || u.email} an admin`
                                    }
                                    className="ml-auto inline-flex cursor-pointer items-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={
                                      u.id === currentUserId ||
                                      savingAdminId === u.id
                                    }
                                    title={
                                      u.id === currentUserId
                                        ? "You can't change your own admin access"
                                        : u.is_admin
                                          ? "Revoke admin access"
                                          : "Make this user an admin"
                                    }
                                    onClick={() =>
                                      setAdminToggleConfirm({
                                        userId: u.id,
                                        userName:
                                          u.full_name || u.email.split("@")[0],
                                        makeAdmin: !u.is_admin,
                                      })
                                    }
                                  >
                                    <span
                                      className={`relative h-7 w-12 shrink-0 rounded-full border border-solid [transition:background-color_0.2s,border-color_0.2s] ${
                                        u.is_admin
                                          ? "border-ink bg-ink"
                                          : "border-ink/25 bg-transparent"
                                      }`}
                                    >
                                      <span
                                        className={`absolute top-1 h-4.5 w-4.5 rounded-full [transition:left_0.2s,background-color_0.2s] ${
                                          u.is_admin
                                            ? "left-6 bg-starlight"
                                            : "left-1 bg-muted"
                                        }`}
                                      />
                                    </span>
                                  </button>
                                </td>
                                <td className={`${TD} text-right`}>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    className="py-1.5! px-3.5! text-[12px]!"
                                    onClick={() =>
                                      setDeleteConfirm({
                                        userId: u.id,
                                        userName:
                                          u.full_name || u.email.split("@")[0],
                                        userEmail: u.email,
                                      })
                                    }
                                  >
                                    Delete
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile: each row → a stacked plate card */}
                      <motion.div
                        className="hidden flex-col gap-3 max-md:flex"
                        variants={stagger(0.04, 0.04)}
                        initial="hidden"
                        animate="visible"
                      >
                        {pagedUsers.map((u, index) => (
                          <motion.div
                            key={u.id}
                            variants={fadeRiseSoft}
                            className="rounded-xl border border-solid border-line bg-cream/60 p-4"
                          >
                            <div className="mb-3 flex items-center gap-3">
                              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-solid border-verdi/30 bg-sage/40 font-display text-[20px] font-semibold text-verdi">
                                {(u.full_name || u.email)
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">
                                    {u.full_name || u.email.split("@")[0]}
                                  </span>
                                  {u.is_admin && (
                                    <span className={chip("pending")}>
                                      Admin ✦
                                    </span>
                                  )}
                                </div>
                                <div className="text-[12.5px] text-muted break-all">
                                  {u.email}
                                </div>
                              </div>
                              <span className="shrink-0 self-start font-mono text-[10px] font-medium text-muted">
                                #{pageStart + index + 1}
                              </span>
                            </div>

                            <div className="flex flex-col">
                              <div className={CARD_ROW}>
                                <span className={CARD_LABEL}>Region</span>
                                <span className={CARD_VALUE}>{u.region}</span>
                              </div>
                              <div className={CARD_ROW}>
                                <span className={CARD_LABEL}>Joined</span>
                                <span className={CARD_VALUE}>
                                  {formatDate(u.created_at)}
                                </span>
                              </div>
                              <div className={CARD_ROW}>
                                <span className={CARD_LABEL}>Classes</span>
                                <span className={CARD_VALUE}>
                                  {u.classesCount}
                                </span>
                              </div>
                              <div className={CARD_ROW}>
                                <span className={CARD_LABEL}>Files</span>
                                <span className={CARD_VALUE}>
                                  {u.filesCount}
                                </span>
                              </div>
                              <div className={CARD_ROW}>
                                <span className={CARD_LABEL}>Storage</span>
                                <span className={CARD_VALUE}>
                                  {formatBytes(u.totalStorage)}
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2.5 border-0 border-t border-solid border-line pt-3">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={u.is_admin}
                                aria-label={
                                  u.is_admin
                                    ? `Revoke admin access for ${u.full_name || u.email}`
                                    : `Make ${u.full_name || u.email} an admin`
                                }
                                className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={
                                  u.id === currentUserId ||
                                  savingAdminId === u.id
                                }
                                title={
                                  u.id === currentUserId
                                    ? "You can't change your own admin access"
                                    : u.is_admin
                                      ? "Revoke admin access"
                                      : "Make this user an admin"
                                }
                                onClick={() =>
                                  setAdminToggleConfirm({
                                    userId: u.id,
                                    userName:
                                      u.full_name || u.email.split("@")[0],
                                    makeAdmin: !u.is_admin,
                                  })
                                }
                              >
                                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                                  Admin
                                </span>
                                <span
                                  className={`relative h-7 w-12 shrink-0 rounded-full border border-solid [transition:background-color_0.2s,border-color_0.2s] ${
                                    u.is_admin
                                      ? "border-ink bg-ink"
                                      : "border-ink/25 bg-transparent"
                                  }`}
                                >
                                  <span
                                    className={`absolute top-1 h-4.5 w-4.5 rounded-full [transition:left_0.2s,background-color_0.2s] ${
                                      u.is_admin
                                        ? "left-6 bg-starlight"
                                        : "left-1 bg-muted"
                                    }`}
                                  />
                                </span>
                              </button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() =>
                                  setDeleteConfirm({
                                    userId: u.id,
                                    userName:
                                      u.full_name || u.email.split("@")[0],
                                    userEmail: u.email,
                                  })
                                }
                              >
                                Delete
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    </>
                  )}
                </>
              )}

              {/* ── CONTROLS (settings instruments) ───────────────────── */}
              {activeTab === "controls" && (
                <>
                  <SectionHeader
                    code={SECTION_META.controls.code}
                    title={SECTION_META.controls.title}
                  />
                  <div className="flex flex-col gap-4">
                    {/* Maintenance - armed/disarmed instrument switch. Wears a
                        vermilion wash + explicit ARMED state label when ON. */}
                    <div
                      className={`rounded-xl border border-solid p-4 transition-colors duration-200 ${
                        maintenanceMode
                          ? "border-vermilion/40 bg-vermilion-wash"
                          : "border-line bg-cream/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink">
                              Maintenance mode
                            </span>
                            <span
                              className={chip(maintenanceMode ? "bad" : "good")}
                            >
                              {maintenanceMode ? "✦ Armed" : "Disarmed"}
                            </span>
                          </div>
                          <p className="mt-1 mb-0 text-[12.5px] leading-relaxed text-muted">
                            {maintenanceMode
                              ? "App locked - non-admins see a maintenance screen."
                              : "App is live for everyone."}
                          </p>
                        </div>
                        <SettingToggle
                          checked={maintenanceMode}
                          onChange={toggleMaintenance}
                          tone="vermilion"
                          title={
                            maintenanceMode
                              ? "Turn off maintenance mode"
                              : "Turn on maintenance mode"
                          }
                        />
                      </div>
                    </div>

                    {/* Self-service account deletion */}
                    <div className="rounded-xl border border-solid border-line bg-cream/60 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink">
                              Self-service account deletion
                            </span>
                            <span
                              className={chip(
                                accountDeletionEnabled ? "good" : "neutral"
                              )}
                            >
                              {accountDeletionEnabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <p className="mt-1 mb-0 text-[12.5px] leading-relaxed text-muted">
                            {accountDeletionEnabled
                              ? "Users can delete their own account."
                              : "Disabled - users see a notice instead."}
                          </p>
                        </div>
                        <SettingToggle
                          checked={accountDeletionEnabled}
                          onChange={toggleAccountDeletion}
                          title={
                            accountDeletionEnabled
                              ? "Disable account deletion"
                              : "Enable account deletion"
                          }
                        />
                      </div>
                    </div>

                    {/* Announcement banner */}
                    <div className="rounded-xl border border-solid border-line bg-cream/60 p-4">
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink">
                        Announcement banner
                      </span>
                      <p className="mb-2 mt-1 text-[12.5px] leading-relaxed text-muted">
                        Shown to users on their dashboard. Leave empty to hide
                        it.
                      </p>
                      <textarea
                        value={announcementDraft}
                        onChange={(e) => setAnnouncementDraft(e.target.value)}
                        placeholder="e.g. New: voice mode is live! 🎙️"
                        rows={2}
                        className="w-full resize-y rounded-lg border border-solid border-ink/20 bg-white/60 px-2.5 py-2 text-[13px] font-[inherit] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-gold-deep"
                      />
                      <div className="mt-2 flex items-center justify-end gap-2">
                        {announcementDraft.trim() !== announcement && (
                          <span className="mr-auto self-center font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-gold-deep">
                            Unsaved changes
                          </span>
                        )}
                        <Button
                          size="sm"
                          onClick={saveAnnouncement}
                          disabled={announcementDraft.trim() === announcement}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.section>
          </div>
        </div>
      )}

      {/* Admin role toggle confirmation */}
      <ConfirmDialog
        isOpen={adminToggleConfirm !== null}
        onClose={() => setAdminToggleConfirm(null)}
        onConfirm={confirmToggleAdmin}
        title={
          adminToggleConfirm?.makeAdmin
            ? "Grant Admin Access"
            : "Revoke Admin Access"
        }
        message={
          adminToggleConfirm
            ? adminToggleConfirm.makeAdmin
              ? `Give ${adminToggleConfirm.userName} admin access? They'll be able to view all users, change admin access, delete accounts, and manage support.`
              : `Remove admin access from ${adminToggleConfirm.userName}? They'll lose access to the admin dashboard.`
            : ""
        }
        confirmText={adminToggleConfirm?.makeAdmin ? "Make Admin" : "Revoke"}
        cancelText="Cancel"
        danger={false}
      />

      {/* Admin toggle error */}
      <ConfirmDialog
        isOpen={adminActionError !== null}
        onClose={() => setAdminActionError(null)}
        onConfirm={() => setAdminActionError(null)}
        title="Couldn't Update Admin Access"
        message={adminActionError || ""}
        confirmText="OK"
        cancelText=""
        danger={false}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteUser}
        title="Delete User Account"
        message={
          deleteConfirm
            ? `Are you sure you want to permanently delete ${deleteConfirm.userName}'s account (${deleteConfirm.userEmail})?\n\nThis will delete all their classes, files, notes, and conversations. This action cannot be undone.`
            : ""
        }
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
      />

      {/* Delete success dialog */}
      <ConfirmDialog
        isOpen={deleteSuccess}
        onClose={() => setDeleteSuccess(false)}
        onConfirm={() => setDeleteSuccess(false)}
        title="User Deleted Successfully"
        message="The user account and all associated data have been permanently removed."
        confirmText="OK"
        cancelText=""
        danger={false}
      />

      {/* Delete error dialog */}
      <ConfirmDialog
        isOpen={deleteError !== null}
        onClose={() => setDeleteError(null)}
        onConfirm={() => setDeleteError(null)}
        title="Couldn't Delete User"
        message={
          deleteError
            ? `An error occurred while deleting the user: ${deleteError}`
            : ""
        }
        confirmText="OK"
        cancelText=""
        danger={false}
      />
    </div>
  );
}
