import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  adminGetAllTickets,
  adminSetTicketStatus,
} from "../services/supportService";
import "./Dashboard.css";
import "./Admin.css";

const TICKET_STATUS_LABELS = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

const TICKET_CATEGORY_LABELS = {
  general: "General question",
  account: "Account & login",
  bug: "Something's broken",
  feature: "Feature request",
  other: "Other",
};

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all"); // all, today, week, month, year
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { userId, userName, userEmail }
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [accountDeletionEnabled, setAccountDeletionEnabled] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketFilter, setTicketFilter] = useState("all");
  const [savingTicketId, setSavingTicketId] = useState(null);
  const navigate = useNavigate();

  function formatBytes(bytes) {
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

  function formatDate(dateString) {
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

      const enrichedUsers = (data || []).map((user) => ({
        id: user.user_id,
        email: user.email,
        full_name:
          user.full_name ||
          (user.raw_user_meta_data && user.raw_user_meta_data.full_name) ||
          "",
        avatar_url: user.avatar_url,
        created_at: user.created_at,
        region: user.region || "Unknown",
        classesCount: parseInt(user.classes_count) || 0,
        filesCount: parseInt(user.files_count) || 0,
        totalStorage: parseInt(user.total_storage) || 0,
      }));

      setUsers(enrichedUsers);
      setFilteredUsers(enrichedUsers);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError(err?.message || String(err) || "Error fetching users");
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
        const diffMs = now - createdAt;
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

    setFilteredUsers(filtered);
  }, [searchQuery, regionFilter, dateFilter, users]);

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

  async function handleTicketStatusChange(id, status) {
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
      setDeleteError(error?.message || "Please try again.");
    }
  }

  const filteredTickets =
    ticketFilter === "all"
      ? tickets
      : tickets.filter((t) => t.status === ticketFilter);

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        {/* Header with gradient background */}
        <motion.div
          className="admin-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="admin-header-left">
            <div className="admin-header-icon">
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
            <div className="admin-header-left-text">
              <h1>Admin Dashboard</h1>
              <p className="admin-header-subtitle">
                Manage users and system resources
              </p>
            </div>
          </div>
          <div className="admin-controls">
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
          className={`admin-main-layout ${
            !(isAdmin === true && users.length > 0 && !loading)
              ? "single-column"
              : ""
          }`}
        >
          {/* LEFT COLUMN - Controls & Filters */}
          {isAdmin === true && users.length > 0 && !loading && (
            <motion.div
              className="admin-left-column"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              {/* App settings — self-service account deletion toggle */}
              <div
                className="admin-search-filter-card"
                style={{ marginBottom: 16 }}
              >
                <h2>
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
                        : "var(--background-primary-color)",
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
              <div className="admin-search-filter-card">
                <h2>
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
                <div className="admin-search-wrapper">
                  <input
                    type="text"
                    className="admin-search-input"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <motion.div
                    className="admin-search-icon"
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
                <div className="admin-filters-section">
                  {/* Region Filter */}
                  <div className="admin-filter-group">
                    <label className="admin-filter-label">
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
                    <div className="admin-filter-buttons desktop-filter">
                      <motion.button
                        className={`admin-filter-btn ${
                          regionFilter === "all" ? "active" : ""
                        }`}
                        onClick={() => setRegionFilter("all")}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        All
                      </motion.button>
                      {getUniqueRegions().map((region) => (
                        <motion.button
                          key={region}
                          className={`admin-filter-btn ${
                            regionFilter === region ? "active" : ""
                          }`}
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
                      className="admin-filter-select mobile-filter"
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
                  <div className="admin-filter-group">
                    <label className="admin-filter-label">
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
                    <div className="admin-filter-buttons desktop-filter">
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
                          className={`admin-filter-btn ${
                            dateFilter === option.value ? "active" : ""
                          }`}
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
                      className="admin-filter-select mobile-filter"
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
                </div>

                {/* Filter Results */}
                {(searchQuery ||
                  regionFilter !== "all" ||
                  dateFilter !== "all") && (
                  <motion.div
                    className="admin-filter-results"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <span className="admin-filter-results-text">
                      {filteredUsers.length} of {users.length}
                    </span>
                    <motion.button
                      className="clear-filters-btn"
                      onClick={() => {
                        setSearchQuery("");
                        setRegionFilter("all");
                        setDateFilter("all");
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
              <h2 className="admin-overview-title">
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
              <div className="admin-summary-grid">
                {/* Users Card */}
                <motion.div className="admin-stat-card">
                  <div className="admin-stat-card-watermark">
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
                  <div className="admin-stat-card-header">
                    <div className="admin-stat-card-icon">
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
                    <div className="admin-stat-card-label">Total Users</div>
                  </div>
                  <div className="admin-stat-card-value">{users.length}</div>
                </motion.div>

                {/* Storage Card */}
                <motion.div className="admin-stat-card">
                  <div className="admin-stat-card-watermark">
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
                  <div className="admin-stat-card-header">
                    <div className="admin-stat-card-icon">
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
                    <div className="admin-stat-card-label">Total Storage</div>
                  </div>
                  <div className="admin-stat-card-value">
                    {formatBytes(
                      users.reduce((s, x) => s + (x.totalStorage || 0), 0)
                    )}
                  </div>
                </motion.div>

                {/* Classes Card */}
                <motion.div className="admin-stat-card">
                  <div className="admin-stat-card-watermark">
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
                  <div className="admin-stat-card-header">
                    <div className="admin-stat-card-icon">
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
                    <div className="admin-stat-card-label">Total Classes</div>
                  </div>
                  <div className="admin-stat-card-value">
                    {users.reduce((s, x) => s + (x.classesCount || 0), 0)}
                  </div>
                </motion.div>

                {/* Files Card */}
                <motion.div className="admin-stat-card">
                  <div className="admin-stat-card-watermark">
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
                  <div className="admin-stat-card-header">
                    <div className="admin-stat-card-icon">
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
                    <div className="admin-stat-card-label">Total Files</div>
                  </div>
                  <div className="admin-stat-card-value">
                    {users.reduce((s, x) => s + (x.filesCount || 0), 0)}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* RIGHT COLUMN - User Data */}
          <div className="admin-right-column">
            {error && <div className="auth-error">{error}</div>}

            {/* Support tickets triage */}
            {isAdmin === true && (
              <motion.div
                className="admin-tickets-section"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <div className="admin-tickets-header">
                  <h2 className="admin-tickets-title">
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
                  <span className="admin-tickets-count">{tickets.length}</span>
                </div>

                <div className="admin-tickets-filters">
                  {[
                    { value: "all", label: "All" },
                    { value: "open", label: "Open" },
                    { value: "in_progress", label: "In progress" },
                    { value: "resolved", label: "Resolved" },
                  ].map((f) => (
                    <motion.button
                      key={f.value}
                      className={`admin-filter-btn ${
                        ticketFilter === f.value ? "active" : ""
                      }`}
                      onClick={() => setTicketFilter(f.value)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {f.label}
                    </motion.button>
                  ))}
                </div>

                {ticketsLoading ? (
                  <div className="admin-tickets-empty">Loading tickets…</div>
                ) : filteredTickets.length === 0 ? (
                  <div className="admin-tickets-empty">
                    {tickets.length === 0
                      ? "No support tickets yet."
                      : "No tickets match this filter."}
                  </div>
                ) : (
                  <div className="admin-tickets-list">
                    {filteredTickets.map((t) => (
                      <div key={t.id} className="admin-ticket-card">
                        <div className="admin-ticket-top">
                          <span className="admin-ticket-subject">
                            {t.subject}
                          </span>
                          <select
                            className="admin-ticket-status-select"
                            value={t.status}
                            disabled={savingTicketId === t.id}
                            onChange={(e) =>
                              handleTicketStatusChange(t.id, e.target.value)
                            }
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="resolved">Resolved</option>
                          </select>
                        </div>
                        <div className="admin-ticket-meta">
                          {t.email && (
                            <>
                              <a
                                className="admin-ticket-email"
                                href={`mailto:${t.email}?subject=Re: ${encodeURIComponent(
                                  t.subject
                                )}`}
                              >
                                {t.email}
                              </a>
                              <span className="admin-ticket-dot">•</span>
                            </>
                          )}
                          <span>
                            {TICKET_CATEGORY_LABELS[t.category] || t.category}
                          </span>
                          <span className="admin-ticket-dot">•</span>
                          <span>{formatDate(t.created_at)}</span>
                          <span
                            className={`admin-ticket-pill admin-ticket-pill--${t.status}`}
                          >
                            {TICKET_STATUS_LABELS[t.status] || t.status}
                          </span>
                        </div>
                        <p className="admin-ticket-message">{t.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {loading ? (
              <div className="classes-loading">
                <div className="spinner" />
                <span>Loading users...</span>
              </div>
            ) : (
              <motion.div
                key="users-container"
                className="users-list"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                {isAdmin === false && (
                  <div className="admin-not-authorized">Not Authorised</div>
                )}

                {isAdmin === true && users.length === 0 && (
                  <p>No users found.</p>
                )}

                {isAdmin === true &&
                  filteredUsers.length === 0 &&
                  users.length > 0 && (
                    <div className="admin-empty-state">
                      No users match your search.
                    </div>
                  )}

                {isAdmin === true &&
                  filteredUsers.map((u, index) => (
                    <div key={u.id} className="admin-user-card">
                      {/* Rank badge */}
                      <div className="admin-user-card-rank">#{index + 1}</div>

                      <div className="admin-user-card-left">
                        <motion.div
                          className="admin-user-avatar"
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          {u.full_name
                            ? u.full_name.charAt(0).toUpperCase()
                            : u.email.charAt(0).toUpperCase()}
                        </motion.div>
                        <div className="admin-user-info">
                          <div className="admin-user-name-email">
                            <strong className="admin-user-name">
                              {u.full_name || u.email.split("@")[0]}
                            </strong>
                            <span className="admin-user-email">{u.email}</span>
                          </div>
                          <div className="admin-user-stats">
                            <span className="admin-user-stat-badge">
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
                            <span className="admin-user-stat-badge">
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
                            <span className="admin-user-stat-badge">
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
                          <div className="admin-user-meta">
                            <span className="admin-user-meta-item">
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
                            <span className="admin-user-meta-divider">•</span>
                            <span className="admin-user-meta-item">
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

                      {/* Delete button */}
                      <motion.button
                        className="admin-user-delete-button"
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
                  ))}
              </motion.div>
            )}
          </div>
          {/* End RIGHT COLUMN */}
        </div>
        {/* End 2-Column Layout */}

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
