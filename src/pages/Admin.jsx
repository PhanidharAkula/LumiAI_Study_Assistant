import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import "./Dashboard.css";

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
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
        .single();
      if (profileErr && profileErr.code !== "PGRST116")
        console.error(profileErr);

      const admin = profile && profile.is_admin === true;
      setIsAdmin(admin);

      if (admin) await fetchUsers();
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
      const { data, error } = await supabase.rpc("list_auth_users");
      if (error) throw error;
      const baseUsers = Array.isArray(data) ? data : [];

      // Fetch profiles, classes and files for aggregation (single multi-user queries)
      const ids = baseUsers.map((u) => u.id);

      // profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ids || []);

      // classes
      const { data: classes } = await supabase
        .from("classes")
        .select("id, user_id, name")
        .in("user_id", ids || []);

      // files
      const { data: files } = await supabase
        .from("files")
        .select("id, name, size, class_id, user_id, created_at")
        .in("user_id", ids || []);

      // Build per-user aggregates
      const userMap = {};
      for (const u of baseUsers) {
        userMap[u.id] = {
          ...u,
          full_name:
            (profiles && profiles.find((p) => p.id === u.id)?.full_name) ||
            (u.raw_user_meta_data && u.raw_user_meta_data.full_name) ||
            "",
          avatar_url:
            (profiles && profiles.find((p) => p.id === u.id)?.avatar_url) ||
            null,
          classes: [],
          totalStorage: 0,
          classesCount: 0,
          filesCount: 0,
        };
      }

      if (classes) {
        for (const c of classes) {
          if (userMap[c.user_id]) {
            userMap[c.user_id].classes.push({ ...c, files: [], storage: 0 });
          }
        }
      }

      if (files) {
        for (const f of files) {
          const um = userMap[f.user_id];
          if (!um) continue;
          um.totalStorage = (um.totalStorage || 0) + (f.size || 0);
          um.filesCount = (um.filesCount || 0) + 1;
          // find class
          const cls = um.classes.find((cc) => cc.id === f.class_id);
          if (cls) {
            cls.files.push(f);
            cls.storage = (cls.storage || 0) + (f.size || 0);
          } else {
            // file attached to no class (edge) - create a pseudo class
            const orphanId = f.class_id || "__none__";
            let orphan = um.classes.find((cc) => cc.id === orphanId);
            if (!orphan) {
              orphan = {
                id: orphanId,
                name: "(No class)",
                files: [],
                storage: 0,
              };
              um.classes.push(orphan);
            }
            orphan.files.push(f);
            orphan.storage = (orphan.storage || 0) + (f.size || 0);
            // already counted file via um.filesCount above, nothing extra needed
          }
        }
      }

      // finalize counts
      const enriched = Object.values(userMap).map((u) => ({
        ...u,
        classesCount: (u.classes && u.classes.length) || 0,
      }));

      setUsers(enriched);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError(err?.message || String(err) || "Error fetching users");
    } finally {
      setLoading(false);
    }
  }

  const container = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.06 } },
  };
  const item = {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 18 },
    },
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "30px 5px",
          }}
        >
          <h1 style={{ fontWeight: "500" }}>Admin</h1>
          <div className="admin-controls">
            {/* {isAdmin === true && ( */}
            <motion.button
              className="back-button"
              onClick={() => navigate("/dashboard")}
              whileHover={{
                scale: 1.05,
                transition: {
                  type: "spring",
                  stiffness: 300,
                  damping: 5,
                },
              }}
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
            {/* )} */}
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {loading ? (
          <div className="classes-loading">
            <div className="spinner" />
            <span>Loading users...</span>
          </div>
        ) : (
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="users-list"
          >
            {isAdmin === false && (
              <div
                className="auth-error"
                style={{
                  fontSize: "x-large",
                  fontWeight: "400",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  height: "70vh",
                  cursor: "pointer",
                }}
              >
                Not Authorised
              </div>
            )}

            {isAdmin === true && users.length === 0 && <p>No users found.</p>}

            {isAdmin === true &&
              users.map((u) => (
                <div
                  key={u.id}
                  className="user-card"
                  variants={item}
                  style={{ cursor: "pointer" }}
                >
                  <div className="user-card-left">
                    <div
                      className="user-avatar"
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        fontSize: 25,
                      }}
                    >
                      {u.full_name
                        ? u.full_name.charAt(0).toUpperCase()
                        : u.email.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ marginLeft: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "baseline",
                        }}
                      >
                        <strong style={{ fontSize: 16, fontWeight: "500" }}>
                          {u.full_name || u.email}
                        </strong>
                        -<div className="muted">{u.email}</div>
                        {/* <div className="muted">{u.id}</div> */}
                      </div>
                      <div className="muted" style={{ marginTop: 6 }}>
                        {u.classesCount} classes • {u.filesCount || 0} files •{" "}
                        {u.totalStorage ? formatBytes(u.totalStorage) : "0 B"}{" "}
                        total
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            {/* Summary statistics */}
            {isAdmin === true && users.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h3>Summary</h3>
                <div className="stats-row">
                  <div className="stat-card">
                    <div
                      className="stat-value"
                      style={{ fontWeight: "400", cursor: "pointer" }}
                    >
                      {users.length}
                    </div>
                    <div className="stat-label">Total users</div>
                  </div>
                  <div className="stat-card">
                    <div
                      className="stat-value"
                      style={{ fontWeight: "400", cursor: "pointer" }}
                    >
                      {formatBytes(
                        users.reduce((s, x) => s + (x.totalStorage || 0), 0)
                      )}
                    </div>
                    <div className="stat-label">Total storage</div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
