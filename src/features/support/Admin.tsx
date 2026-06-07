import { useEffect, useState } from "react";
import { supabase } from "@shared/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ConfirmDialog from "@shared/components/ConfirmDialog";
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

// Tailwind class groups — kept here so the long utility strings aren't repeated
// across the four summary cards, the many filter buttons, and the pills.
const FILTER_BTN_BASE =
  "rounded-lg border-[1.5px] border-solid shadow-none text-[14px] font-medium cursor-pointer font-[inherit] py-1.5 px-3 [transition:all_0.2s_cubic-bezier(0.4,0,0.2,1)] max-md:py-2 max-md:px-3.5 max-md:text-[12px] max-md:min-h-9 max-[480px]:flex-[1_1_calc(50%-3px)] max-[480px]:min-w-20 max-[480px]:justify-center";
const filterBtn = (active: boolean) =>
  `${FILTER_BTN_BASE} ${
    active ? "border-ink bg-ink text-white" : "border-muted bg-white text-ink"
  }`;

const STAT_CARD =
  "relative overflow-hidden cursor-pointer rounded-[14px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] bg-sage p-3.5 [transition:all_0.2s_cubic-bezier(0.4,0,0.2,1)] min-[1025px]:[transition:transform_0.2s_ease,box-shadow_0.2s_ease] max-md:p-3 max-[480px]:p-4";
const STAT_WATERMARK =
  "absolute -top-[15px] -right-[15px] text-[60px] opacity-20 max-md:text-[50px] max-[480px]:text-[60px]";
const STAT_HEADER = "flex items-center gap-3 mb-2";
const STAT_ICON =
  "flex h-10 w-10 items-center justify-center rounded-[7px] border-[1.5px] border-solid border-ink bg-white text-[16px] max-md:h-7 max-md:w-7 max-md:text-[14px] max-[480px]:h-9 max-[480px]:w-9 max-[480px]:text-[18px]";
const STAT_LABEL =
  "text-[12px] font-medium text-ink max-md:text-[11px] max-[480px]:text-[13px]";
const STAT_VALUE =
  "text-[24px] font-medium leading-none max-md:text-[20px] max-[480px]:text-[28px]";

const STAT_BADGE =
  "inline-flex items-center gap-[5px] py-1 px-2.5 rounded-lg border border-solid border-ink font-medium max-md:rounded-[5px] max-md:text-[10px] max-md:py-[3px] max-md:px-[5px] max-md:flex-1 max-md:min-w-0 max-md:whitespace-nowrap max-md:overflow-hidden max-md:text-ellipsis max-md:my-[5px] max-md:mx-0 max-[480px]:flex-1 max-[480px]:min-w-0 max-[480px]:text-[9px] max-[480px]:py-2 max-[480px]:px-1 max-[480px]:justify-center";
const META_ITEM = "inline-flex items-center gap-[5px]";

const TICKET_PILL_BASE =
  "text-[0.72rem] font-semibold py-[3px] px-2.5 rounded-[100px] whitespace-nowrap";
const TICKET_PILL_COLORS: Record<string, string> = {
  open: "bg-[#fef3c7] text-[#92400e]",
  in_progress: "bg-[#dbeafe] text-[#1e40af]",
  resolved: "bg-[#dcfce7] text-[#15803d]",
};

export default function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all"); // all, today, week, month, year
  const [adminFilter, setAdminFilter] = useState("all"); // all, admin, member
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(
    null
  ); // { userId, userName, userEmail }
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [accountDeletionEnabled, setAccountDeletionEnabled] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketFilter, setTicketFilter] = useState("all");
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
        const diffMs = (now as unknown as number) - (createdAt as unknown as number);
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
  }, [searchQuery, regionFilter, dateFilter, adminFilter, users]);

  async function fetchSettings() {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "account_deletion_enabled")
        .maybeSingle();
      if (data) setAccountDeletionEnabled(data.value !== false);
    } catch (e) {
      console.error("Error loading settings:", e);
    }
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
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
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
    const { error: updErr } = await supabase
      .from("app_settings")
      .update({ value: next, updated_at: new Date().toISOString() })
      .eq("key", "account_deletion_enabled");
    if (updErr) {
      setAccountDeletionEnabled(!next); // revert on failure
      console.error("Error updating setting:", updErr);
    }
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
      setAdminActionError(
        "Couldn't update admin access. Please try again."
      );
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

  const filteredTickets =
    ticketFilter === "all"
      ? tickets
      : tickets.filter((t) => t.status === ticketFilter);

  return (
    <div className="min-h-[100dvh] w-full overflow-hidden pt-0 px-[50px] pb-[100px] max-[1024px]:px-[30px] max-[1024px]:pb-[30px] max-md:px-[20px] max-md:pb-[20px] max-[480px]:px-[15px] max-[480px]:pb-[80px]">
      <div className="w-full overflow-y-auto">
        {/* Header with gradient background */}
        <motion.div
          className="flex items-center justify-between rounded-2xl pt-[30px] px-2.5 pb-5 max-[1200px]:py-5 max-[1200px]:px-[15px] max-md:gap-[15px] max-md:py-4 max-md:px-3 max-md:mt-2.5 max-[480px]:py-3.5 max-[480px]:px-2.5"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-[15px] max-md:text-center max-md:justify-start max-md:gap-2.5">
            <div className="flex h-[50px] w-[50px] items-center justify-center rounded-xl border-[1.5px] border-solid border-ink bg-sage shadow-[0px_2px_0_#000] text-[24px] cursor-pointer max-md:h-11 max-md:w-11 max-md:text-[22px] max-[480px]:h-10 max-[480px]:w-10 max-[480px]:text-[20px]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 12h4l3-9 4 18 3-9h4" />
              </svg>
            </div>
            <div className="max-md:flex max-md:flex-col max-md:justify-start max-md:items-start">
              <h1 className="font-semibold m-0 text-[28px] max-[1200px]:text-[24px] max-md:text-[22px] max-[480px]:text-[20px]">
                Admin Dashboard
              </h1>
              <p className="m-0 text-[14px] text-muted max-md:text-[13px] max-[480px]:text-[12px]">
                Manage users and system resources
              </p>
            </div>
          </div>
          <div className="flex justify-start gap-3">
            <motion.button
              className="back-button"
              onClick={() => navigate("/dashboard")}
              whileHover={{
                scale: 1.08,
                transition: {
                  type: "spring",
                  stiffness: 300,
                  damping: 10,
                },
              }}
              whileTap={{ scale: 0.95 }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </motion.button>
          </div>
        </motion.div>

        {/* 2-Column Layout: Controls Left, Data Right */}
        <div
          className={`grid gap-5 items-start p-2.5 max-[1200px]:grid-cols-1 max-[1200px]:gap-[15px] ${
            isAdmin === true && users.length > 0 && !loading
              ? "grid-cols-[480px_1fr]"
              : "grid-cols-1"
          }`}
        >
          {/* LEFT COLUMN - Controls & Filters */}
          {isAdmin === true && users.length > 0 && !loading && (
            <motion.div
              className="sticky top-0 max-h-[calc(100dvh-140px)] overflow-visible self-start max-[1200px]:static max-[1200px]:max-h-none max-[1200px]:overflow-y-visible max-[1200px]:pr-0"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              {/* App settings — self-service account deletion toggle */}
              <div
                className="p-3.5 rounded-[14px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] bg-sage max-md:p-3"
                style={{ marginBottom: 16 }}
              >
                <h2 className="flex items-center gap-1.5 text-[14px] font-semibold mb-2.5 max-md:text-[13px]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      display: "inline-block",
                      marginRight: "6px",
                      transform: "translateY(2px)",
                    }}
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Settings
                </h2>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      Self-service account deletion
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary-color)",
                      }}
                    >
                      {accountDeletionEnabled
                        ? "Users can delete their own account"
                        : "Disabled — users see a notice instead"}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={accountDeletionEnabled}
                    onClick={toggleAccountDeletion}
                    title={
                      accountDeletionEnabled
                        ? "Disable account deletion"
                        : "Enable account deletion"
                    }
                    style={{
                      width: 48,
                      height: 28,
                      flexShrink: 0,
                      borderRadius: 999,
                      border: "2px solid var(--text-primary-color)",
                      cursor: "pointer",
                      padding: 0,
                      background: accountDeletionEnabled
                        ? "var(--text-primary-color)"
                        : "#fff",
                      position: "relative",
                      transition: "background 0.2s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 3,
                        left: accountDeletionEnabled ? 23 : 3,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: accountDeletionEnabled
                          ? "#fff"
                          : "var(--text-primary-color)",
                        transition: "left 0.2s, background 0.2s",
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Search and Filters Section - MOVED TO TOP */}
              <div className="p-3.5 rounded-[14px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] bg-sage max-md:p-3">
                <h2 className="flex items-center gap-1.5 text-[14px] font-semibold mb-2.5 max-md:text-[13px]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      display: "inline-block",
                      marginRight: "6px",
                      transform: "translateY(2px)",
                    }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  Search & Filter
                </h2>

                {/* Search Bar */}
                <div className="relative mb-5">
                  <input
                    type="text"
                    className="w-full py-2.5 pr-10 pl-3 rounded-[10px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] text-[13px] font-[inherit] text-ink [transition:all_0.2s_cubic-bezier(0.4,0,0.2,1)] focus:outline-none focus:shadow-[0px_2px_0_#000] focus:[transform:translateY(0)] min-[1025px]:focus:shadow-[0px_3px_0_#000] min-[1025px]:focus:[transform:translateY(-1px)] max-md:text-[14px] max-md:py-3 max-[480px]:text-[16px]"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <motion.div
                    className="absolute right-3 inset-y-0 flex items-center pointer-events-none"
                    animate={{
                      scale: searchQuery ? [1, 1.2, 1] : 1,
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-secondary-color)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="8"></circle>
                      <path d="m21 21-4.35-4.35"></path>
                    </svg>
                  </motion.div>
                </div>

                {/* Filters */}
                <div className="mb-0">
                  {/* Region Filter */}
                  <div className="mb-5 last:mb-0">
                    <label className="flex items-center gap-1 text-[14px] font-medium text-ink mb-2 max-md:text-[13px]">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      <span style={{ marginLeft: "4px" }}>Region</span>
                    </label>
                    {/* Desktop: Buttons */}
                    <div className="flex flex-wrap gap-1.5 max-md:hidden">
                      <motion.button
                        className={filterBtn(regionFilter === "all")}
                        onClick={() => setRegionFilter("all")}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        All
                      </motion.button>
                      {getUniqueRegions().map((region) => (
                        <motion.button
                          key={region}
                          className={filterBtn(regionFilter === region)}
                          onClick={() => setRegionFilter(region)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {region}
                        </motion.button>
                      ))}
                    </div>
                    {/* Mobile: Select Dropdown */}
                    <select
                      className="hidden w-full py-2.5 px-3 rounded-lg border-2 border-solid border-ink bg-white text-ink text-[14px] font-medium font-[inherit] cursor-pointer outline-none [transition:all_0.2s_ease] max-md:block"
                      value={regionFilter}
                      onChange={(e) => setRegionFilter(e.target.value)}
                    >
                      <option value="all">All Regions</option>
                      {getUniqueRegions().map((region) => (
                        <option key={region} value={region}>
                          {region}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date Filter */}
                  <div className="mb-5 last:mb-0">
                    <label className="flex items-center gap-1 text-[14px] font-medium text-ink mb-2 max-md:text-[13px]">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          x="3"
                          y="4"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span style={{ marginLeft: "4px" }}>Join Date</span>
                    </label>
                    {/* Desktop: Buttons */}
                    <div className="flex flex-wrap gap-1.5 max-md:hidden">
                      {[
                        { value: "all", label: "All" },
                        { value: "today", label: "Today" },
                        { value: "week", label: "7 Days" },
                        { value: "month", label: "30 Days" },
                        { value: "thisMonth", label: "This Month" },
                        { value: "thisYear", label: "This Year" },
                        { value: "year", label: "Year" },
                      ].map((option) => (
                        <motion.button
                          key={option.value}
                          className={filterBtn(dateFilter === option.value)}
                          onClick={() => setDateFilter(option.value)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {option.label}
                        </motion.button>
                      ))}
                    </div>
                    {/* Mobile: Select Dropdown */}
                    <select
                      className="hidden w-full py-2.5 px-3 rounded-lg border-2 border-solid border-ink bg-white text-ink text-[14px] font-medium font-[inherit] cursor-pointer outline-none [transition:all_0.2s_ease] max-md:block"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="week">Last 7 Days</option>
                      <option value="month">Last 30 Days</option>
                      <option value="thisMonth">This Month</option>
                      <option value="thisYear">This Year</option>
                      <option value="year">Last Year</option>
                    </select>
                  </div>

                  {/* Admin Access Filter */}
                  <div className="mb-5 last:mb-0">
                    <label className="flex items-center gap-1 text-[14px] font-medium text-ink mb-2 max-md:text-[13px]">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <span style={{ marginLeft: "4px" }}>Admin Access</span>
                    </label>
                    {/* Desktop: Buttons */}
                    <div className="flex flex-wrap gap-1.5 max-md:hidden">
                      {[
                        { value: "all", label: "All" },
                        { value: "admin", label: "Admins" },
                        { value: "member", label: "Members" },
                      ].map((option) => (
                        <motion.button
                          key={option.value}
                          className={filterBtn(adminFilter === option.value)}
                          onClick={() => setAdminFilter(option.value)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          {option.label}
                        </motion.button>
                      ))}
                    </div>
                    {/* Mobile: Select Dropdown */}
                    <select
                      className="hidden w-full py-2.5 px-3 rounded-lg border-2 border-solid border-ink bg-white text-ink text-[14px] font-medium font-[inherit] cursor-pointer outline-none [transition:all_0.2s_ease] max-md:block"
                      value={adminFilter}
                      onChange={(e) => setAdminFilter(e.target.value)}
                    >
                      <option value="all">All Users</option>
                      <option value="admin">Admins Only</option>
                      <option value="member">Members Only</option>
                    </select>
                  </div>
                </div>

                {/* Filter Results */}
                {(searchQuery ||
                  regionFilter !== "all" ||
                  dateFilter !== "all" ||
                  adminFilter !== "all") && (
                  <motion.div
                    className="mt-2.5 py-2 px-3 rounded-lg bg-white border-[1.5px] border-solid border-ink flex items-center justify-between flex-wrap gap-2 max-md:p-2.5 max-md:mt-2"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <span className="text-[14px] font-medium text-ink">
                      {filteredUsers.length} of {users.length}
                    </span>
                    <motion.button
                      className="py-[5px] px-2.5 rounded-md border-[1.5px] border-solid border-ink bg-sage text-ink text-[14px] font-medium cursor-pointer font-[inherit] max-md:py-1.5 max-md:px-3 max-md:text-[12px]"
                      onClick={() => {
                        setSearchQuery("");
                        setRegionFilter("all");
                        setDateFilter("all");
                        setAdminFilter("all");
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Clear
                    </motion.button>
                  </motion.div>
                )}
              </div>

              {/* Overview Section - MOVED TO BOTTOM */}
              <h2 className="text-[16px] font-semibold mt-5 mx-0 mb-2.5 text-ink max-md:text-[15px] max-md:mb-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    display: "inline-block",
                    marginRight: "8px",
                    transform: "translateY(3px)",
                  }}
                >
                  <line x1="12" y1="20" x2="12" y2="10" />
                  <line x1="18" y1="20" x2="18" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="16" />
                </svg>
                Overview
              </h2>
              <div className="grid grid-cols-2 gap-2.5 mb-0 max-md:gap-2">
                {/* Users Card */}
                <motion.div className={STAT_CARD}>
                  <div className={STAT_WATERMARK}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className={STAT_HEADER}>
                    <div className={STAT_ICON}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <div className={STAT_LABEL}>Total Users</div>
                  </div>
                  <div className={STAT_VALUE}>{users.length}</div>
                </motion.div>

                {/* Storage Card */}
                <motion.div className={STAT_CARD}>
                  <div className={STAT_WATERMARK}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="22" y1="12" x2="2" y2="12" />
                      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                      <line x1="6" y1="16" x2="6.01" y2="16" />
                      <line x1="10" y1="16" x2="10.01" y2="16" />
                    </svg>
                  </div>
                  <div className={STAT_HEADER}>
                    <div className={STAT_ICON}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="22" y1="12" x2="2" y2="12" />
                        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                        <line x1="6" y1="16" x2="6.01" y2="16" />
                        <line x1="10" y1="16" x2="10.01" y2="16" />
                      </svg>
                    </div>
                    <div className={STAT_LABEL}>Total Storage</div>
                  </div>
                  <div className={STAT_VALUE}>
                    {formatBytes(
                      users.reduce((s, x) => s + (x.totalStorage || 0), 0)
                    )}
                  </div>
                </motion.div>

                {/* Classes Card */}
                <motion.div className={STAT_CARD}>
                  <div className={STAT_WATERMARK}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                  </div>
                  <div className={STAT_HEADER}>
                    <div className={STAT_ICON}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                    </div>
                    <div className={STAT_LABEL}>Total Classes</div>
                  </div>
                  <div className={STAT_VALUE}>
                    {users.reduce((s, x) => s + (x.classesCount || 0), 0)}
                  </div>
                </motion.div>

                {/* Files Card */}
                <motion.div className={STAT_CARD}>
                  <div className={STAT_WATERMARK}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="80"
                      height="80"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <div className={STAT_HEADER}>
                    <div className={STAT_ICON}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                    <div className={STAT_LABEL}>Total Files</div>
                  </div>
                  <div className={STAT_VALUE}>
                    {users.reduce((s, x) => s + (x.filesCount || 0), 0)}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* RIGHT COLUMN - User Data */}
          <div className="min-w-0 self-start overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {error && <div>{error}</div>}

            {/* Support tickets triage */}
            {isAdmin === true && (
              <motion.div
                className="bg-white border-[1.5px] border-solid border-ink rounded-2xl shadow-[0px_2px_0_#000] p-[22px] mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <div className="flex items-center justify-between mb-3.5">
                  <h2 className="text-[1.1rem] font-bold m-0">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ marginRight: 8, transform: "translateY(3px)" }}
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    Support tickets
                  </h2>
                  <span className="text-[0.85rem] font-semibold bg-sage border-[1.5px] border-solid border-ink rounded-[100px] py-0.5 px-3">
                    {tickets.length}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    { value: "all", label: "All" },
                    { value: "open", label: "Open" },
                    { value: "in_progress", label: "In progress" },
                    { value: "resolved", label: "Resolved" },
                  ].map((f) => (
                    <motion.button
                      key={f.value}
                      className={filterBtn(ticketFilter === f.value)}
                      onClick={() => setTicketFilter(f.value)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {f.label}
                    </motion.button>
                  ))}
                </div>

                {ticketsLoading ? (
                  <div className="text-muted text-center p-[18px]">
                    Loading tickets…
                  </div>
                ) : filteredTickets.length === 0 ? (
                  <div className="text-muted text-center p-[18px]">
                    {tickets.length === 0
                      ? "No support tickets yet."
                      : "No tickets match this filter."}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filteredTickets.map((t) => (
                      <div
                        key={t.id}
                        className="border-[1.5px] border-solid border-ink rounded-xl p-4 bg-cream"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <span className="font-semibold [word-break:break-word]">
                            {t.subject}
                          </span>
                          <select
                            className="shrink-0 font-[inherit] text-[0.85rem] font-semibold py-1.5 px-2.5 rounded-lg border-[1.5px] border-solid border-ink bg-white text-ink cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                            value={t.status}
                            disabled={savingTicketId === t.id}
                            onChange={(e) =>
                              handleTicketStatusChange(
                                t.id,
                                e.target.value as TicketStatus
                              )
                            }
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[0.82rem] text-muted mb-2.5">
                          {t.email && (
                            <>
                              <a
                                className="text-ink font-semibold no-underline hover:underline"
                                href={`mailto:${t.email}?subject=Re: ${encodeURIComponent(
                                  t.subject
                                )}`}
                              >
                                {t.email}
                              </a>
                              <span className="opacity-50">•</span>
                            </>
                          )}
                          <span>
                            {TICKET_CATEGORY_LABELS[t.category] || t.category}
                          </span>
                          <span className="opacity-50">•</span>
                          <span>{formatDate(t.created_at)}</span>
                          <span
                            className={`${TICKET_PILL_BASE} ${
                              TICKET_PILL_COLORS[t.status] || ""
                            }`}
                          >
                            {TICKET_STATUS_LABELS[t.status] || t.status}
                          </span>
                        </div>
                        <p className="leading-normal whitespace-pre-wrap [word-break:break-word] m-0">
                          {t.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-[60px] px-5 w-full">
                <div className="spinner" />
                <span>Loading users...</span>
              </div>
            ) : (
              <motion.div
                key="users-container"
                className="flex flex-col gap-3 mt-0"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                {isAdmin === false && (
                  <div className="text-[x-large] font-normal flex justify-center items-center h-[70dvh] cursor-pointer">
                    Not Authorised
                  </div>
                )}

                {isAdmin === true && users.length === 0 && (
                  <p>No users found.</p>
                )}

                {isAdmin === true &&
                  filteredUsers.length === 0 &&
                  users.length > 0 && (
                    <div className="text-center p-10 text-muted">
                      No users match your search.
                    </div>
                  )}

                {isAdmin === true &&
                  filteredUsers.map((u, index) => (
                    <div
                      key={u.id}
                      className="relative overflow-hidden flex justify-between items-center p-[22px] rounded-2xl border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] bg-white mb-4 [transition:all_0.2s_cubic-bezier(0.4,0,0.2,1)] min-[1025px]:[transition:transform_0.2s_ease,box-shadow_0.2s_ease] max-md:flex-col max-md:items-start max-md:gap-[15px] max-md:py-4 max-md:px-3 max-md:first:mt-2.5"
                    >
                      {/* Rank badge */}
                      <div className="absolute top-2.5 left-2.5 text-[11px] font-semibold py-[3px] px-2 rounded-md border border-solid border-ink text-muted max-md:top-2 max-md:left-auto max-md:right-2 max-md:text-[10px] max-md:py-0.5 max-md:px-1.5">
                        #{index + 1}
                      </div>

                      <div className="flex items-center flex-1 cursor-pointer max-md:w-full max-md:flex-row max-md:items-center max-md:gap-3 max-[480px]:flex-col max-[480px]:items-start">
                        <motion.div
                          className="flex h-16 w-16 items-center justify-center rounded-[14px] text-[28px] bg-sage border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] font-semibold ml-[30px] max-md:h-13 max-md:w-13 max-md:text-[22px] max-md:ml-0 max-[480px]:h-14 max-[480px]:w-14 max-[480px]:text-[24px]"
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          {u.full_name
                            ? u.full_name.charAt(0).toUpperCase()
                            : u.email.charAt(0).toUpperCase()}
                        </motion.div>
                        <div className="ml-[18px] max-md:ml-0 max-md:w-full max-md:flex-1">
                          <div className="flex gap-2.5 items-center mb-2 flex-wrap max-md:flex-col max-md:items-start max-md:gap-1 max-md:mb-1.5">
                            <strong className="text-[19px] font-semibold max-md:text-[16px] max-[480px]:text-[17px]">
                              {u.full_name || u.email.split("@")[0]}
                            </strong>
                            <span className="text-muted text-[14px] font-normal break-words [overflow-wrap:break-word] whitespace-normal overflow-visible [text-overflow:clip] max-w-none max-md:text-[13px] max-[480px]:text-[13px] max-[480px]:[word-break:break-all]">
                              {u.email}
                            </span>
                          </div>
                          <div className="text-muted text-[14px] flex gap-3 items-center flex-wrap max-md:flex-nowrap max-md:gap-1 max-[480px]:flex-row max-[480px]:items-center max-[480px]:gap-1 max-[480px]:w-full max-[480px]:flex-nowrap">
                            <span className={STAT_BADGE}>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  display: "inline-block",
                                  marginRight: "4px",
                                  transform: "translateY(1px)",
                                }}
                              >
                                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                              </svg>
                              {u.classesCount} classes
                            </span>
                            <span className={STAT_BADGE}>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  display: "inline-block",
                                  marginRight: "4px",
                                  transform: "translateY(1px)",
                                }}
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                              </svg>
                              {u.filesCount} files
                            </span>
                            <span className={STAT_BADGE}>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  display: "inline-block",
                                  marginRight: "4px",
                                  transform: "translateY(1px)",
                                }}
                              >
                                <line x1="22" y1="12" x2="2" y2="12" />
                                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                                <line x1="6" y1="16" x2="6.01" y2="16" />
                                <line x1="10" y1="16" x2="10.01" y2="16" />
                              </svg>
                              {formatBytes(u.totalStorage)}
                            </span>
                          </div>
                          <div className="text-muted text-[13px] flex gap-3 items-center mt-1.5 flex-wrap max-md:text-[12px] max-md:gap-2">
                            <span className={META_ITEM}>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  display: "inline-block",
                                  marginRight: "4px",
                                  transform: "translateY(1px)",
                                }}
                              >
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                <circle cx="12" cy="10" r="3" />
                              </svg>
                              {u.region}
                            </span>
                            <span className="text-muted opacity-50">•</span>
                            <span className={META_ITEM}>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  display: "inline-block",
                                  marginRight: "4px",
                                  transform: "translateY(1px)",
                                }}
                              >
                                <rect
                                  x="3"
                                  y="4"
                                  width="18"
                                  height="18"
                                  rx="2"
                                  ry="2"
                                />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              Joined {formatDate(u.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions: admin toggle (left) + delete (right) */}
                      <div className="flex items-center gap-3.5 shrink-0 max-md:w-full max-md:justify-between max-md:gap-2.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={u.is_admin}
                          className="flex items-center gap-2 border-0 bg-transparent p-0 text-ink text-[13px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={
                            u.id === currentUserId || savingAdminId === u.id
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
                              userName: u.full_name || u.email.split("@")[0],
                              makeAdmin: !u.is_admin,
                            })
                          }
                        >
                          <span className="leading-none">Admin</span>
                          {/* Switch — matched 1:1 to the Settings toggle above */}
                          <span
                            className={`relative w-12 h-7 rounded-full border-2 border-solid border-ink shrink-0 [transition:background-color_0.2s] ${
                              u.is_admin ? "bg-ink" : "bg-white"
                            }`}
                          >
                            <span
                              className={`absolute top-[3px] w-[18px] h-[18px] rounded-full [transition:left_0.2s,background-color_0.2s] ${
                                u.is_admin
                                  ? "left-[23px] bg-white"
                                  : "left-[3px] bg-ink"
                              }`}
                            />
                          </span>
                        </button>

                        <motion.button
                          className="flex items-center gap-2 py-3 px-[22px] rounded-[120px] border-[1.5px] border-solid border-ink shadow-[0px_2px_0_#000] bg-[#f64646] text-white text-[14px] font-medium cursor-pointer max-md:justify-center max-md:py-3.5 max-md:px-[18px] max-md:text-[15px] max-md:min-h-12"
                          onClick={() =>
                            setDeleteConfirm({
                              userId: u.id,
                              userName: u.full_name || u.email.split("@")[0],
                              userEmail: u.email,
                            })
                          }
                          whileHover={{
                            scale: 1.08,
                            y: -3,
                            transition: {
                              type: "spring",
                              stiffness: 400,
                              damping: 15,
                            },
                          }}
                          whileTap={{ scale: 0.95, y: 0 }}
                        >
                          Delete
                        </motion.button>
                      </div>
                    </div>
                  ))}
              </motion.div>
            )}
          </div>
          {/* End RIGHT COLUMN */}
        </div>
        {/* End 2-Column Layout */}

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
    </div>
  );
}
