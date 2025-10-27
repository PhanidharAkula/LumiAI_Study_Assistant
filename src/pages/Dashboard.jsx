import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import ClassDetails from "../components/ClassDetails";
import AddClassForm from "../components/AddClassForm";
import ConfirmDialog from "../components/ConfirmDialog";
import ChatComponent from "../components/ChatComponent";
import TalkComponent from "../components/TalkComponent";
import "./Dashboard.css";

const Dashboard = ({ session }) => {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const isMounted = useRef(false);
  const hasInitialFetch = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const classIdFromUrl = params.get("classId");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const fetchingByUrlRef = useRef(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [classDeleteConfirm, setClassDeleteConfirm] = useState({
    isOpen: false,
    classId: null,
    className: "",
    hasFiles: false,
    fileCount: 0,
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatClassId, setChatClassId] = useState(null);
  const [chatConversationId, setChatConversationId] = useState(null);
  const [talkOpen, setTalkOpen] = useState(() => {
    // Restore Talk state from sessionStorage on page load
    return sessionStorage.getItem("lumiTalkOpen") === "true";
  });
  const [talkClassId, setTalkClassId] = useState(null);
  const [bottomComingSoon, setBottomComingSoon] = useState({
    isOpen: false,
    feature: "",
  });
  const [accountComingSoon, setAccountComingSoon] = useState({
    isOpen: false,
    feature: "",
  });
  const [accountDeletedInfo, setAccountDeletedInfo] = useState({
    isOpen: false,
    deletedDate: "",
    canReregisterDate: "",
    isAdminDeleted: false,
  });
  const [accountDeleteSuccess, setAccountDeleteSuccess] = useState(false);
  const hasCheckedDeletedAccount = useRef(false);

  useEffect(() => {
    if (!loading) {
      setHasLoaded(true);
    }
  }, [loading]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    isMounted.current = true;

    // Check URL for chat parameter
    const searchParams = new URLSearchParams(location.search);
    const chatParam = searchParams.get("chat");
    const classIdParam = searchParams.get("classId");
    const conversationIdParam = searchParams.get("conversationId");

    if (chatParam === "true") {
      setChatOpen(true);
      if (classIdParam) {
        setChatClassId(classIdParam);
      }
      if (conversationIdParam) {
        setChatConversationId(conversationIdParam);
      }
    }

    if (!hasInitialFetch.current || session?.user?.id !== user?.id) {
      fetchClasses();
      hasInitialFetch.current = true;
    } else {
      setLoading(false);
    }

    return () => {
      isMounted.current = false;
    };
  }, [session, location.search]);

  useEffect(() => {
    if (classes.length > 0 && classIdFromUrl && !selectedClass) {
      const classFromUrl = classes.find(
        (c) => c.id.toString() === classIdFromUrl
      );
      if (classFromUrl) {
        setSelectedClass(classFromUrl);
        fetchingByUrlRef.current = false;
      }
    }
  }, [classes, classIdFromUrl, selectedClass]);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      if (classIdFromUrl) {
        fetchingByUrlRef.current = true;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // If the server no longer recognizes the user (deleted), clear
        // any stale client session and force a full redirect to login.
        try {
          await supabase.auth.signOut();
        } catch (signOutErr) {
          console.warn("Error signing out stale session:", signOutErr);
        }
        navigate("/login");
        return;
      }

      setUser(user);

      // Check if this account was recently deleted (only once per session)
      if (!hasCheckedDeletedAccount.current) {
        hasCheckedDeletedAccount.current = true;

        try {
          const { data: deletedAccount, error: deletedError } = await supabase
            .from("deleted_accounts")
            .select("deleted_at, can_reregister_at, reason")
            .eq("email", user.email?.toLowerCase())
            .gt("can_reregister_at", new Date().toISOString())
            .single();

          // Silently ignore errors (table doesn't exist, no rows, RLS, etc.)
          if (!deletedError && deletedAccount) {
            // Account was deleted - show confirmation dialog
            const deletedDate = new Date(
              deletedAccount.deleted_at
            ).toLocaleDateString();
            const canReregisterDate = new Date(
              deletedAccount.can_reregister_at
            ).toLocaleDateString();
            const isAdminDeleted = deletedAccount.reason === "deleted_by_admin";

            setAccountDeletedInfo({
              isOpen: true,
              deletedDate,
              canReregisterDate,
              isAdminDeleted,
            });
            return; // Stop loading, dialog will handle sign out
          }
        } catch (deletedCheckErr) {
          // Silently continue - deleted accounts feature not available
        }
      }

      // fetch profile to determine admin flag
      try {
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
          .limit(1)
          .single();
        if (!profileErr && profile && profile.is_admin === true) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (pe) {
        setIsAdmin(false);
      }

      const { data, error } = await supabase
        .from("classes")
        // include related files so callers (like ChatComponent -> TagSelector)
        // have access to each class's files for tagging
        .select("*, files(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (isMounted.current) {
        setClasses(data || []);

        if (classIdFromUrl && data) {
          const classFromUrl = data.find(
            (c) => c.id.toString() === classIdFromUrl
          );
          if (classFromUrl) {
            setSelectedClass(classFromUrl);
            fetchingByUrlRef.current = false;
          }
        }
      }
    } catch (error) {
      console.error("Error fetching classes:", error.message);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  };

  const refreshClasses = () => {
    hasInitialFetch.current = false;
    fetchClasses();
  };

  const handleAddClass = (newClass) => {
    // Ensure new class has files array for UI components that expect it
    const withFiles = { ...newClass, files: newClass.files || [] };
    setClasses((prev) => [withFiles, ...prev]);
    setShowAddForm(false);
  };

  const handleUpdateClass = async (updatedClass) => {
    try {
      const { error } = await supabase
        .from("classes")
        .update({
          name: updatedClass.name,
          description: updatedClass.description,
        })
        .eq("id", updatedClass.id);

      if (error) throw error;

      setClasses((prev) =>
        prev.map((c) =>
          c.id === updatedClass.id ? { ...c, ...updatedClass } : c
        )
      );

      setSelectedClass(updatedClass);
      setIsEditing(false);
    } catch (err) {
      console.error("Error updating class:", err);
    }
  };

  const handleDeleteClass = async (id) => {
    try {
      const { data: files, error: filesError } = await supabase
        .from("files")
        .select("id, path")
        .eq("class_id", id);

      if (filesError) throw filesError;

      if (files && files.length > 0) {
        for (const file of files) {
          if (file.path) {
            await supabase.storage
              .from("files")
              .remove([file.path])
              .catch((err) =>
                console.error("Error deleting file from storage:", err)
              );
          }
        }

        const { error: filesDeleteError } = await supabase
          .from("files")
          .delete()
          .eq("class_id", id);

        if (filesDeleteError)
          console.error(
            "Error deleting files from database:",
            filesDeleteError
          );
      }

      const { error } = await supabase.from("classes").delete().eq("id", id);

      if (error) throw error;

      setClasses((prev) => prev.filter((c) => c.id !== id));
      setSelectedClass(null);
    } catch (err) {
      console.error("Error deleting class:", err);
    }
  };

  const handleSelectClass = (classItem) => {
    setSelectedClass({ ...classItem, isLoading: true });
    setShowAddForm(false);
    navigate(`?classId=${classItem.id}`, { replace: true });
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate("/");
    } catch (error) {
      console.error("Error signing out:", error.message);
    }
  };

  const confirmSignOut = () => {
    setShowMenu(false);
    setSignOutConfirm(true);
  };

  const confirmDeleteAccount = () => {
    setShowMenu(false);
    setDeleteAccountConfirm(true);
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleteAccountConfirm(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error("No user found to delete");
        alert("Session expired. Please log in again.");
        navigate("/login");
        return;
      }

      console.log("Starting account deletion for user:", user.id);

      // Step 1: Get all file paths for storage cleanup
      const { data: files, error: filesError } = await supabase
        .from("files")
        .select("path")
        .eq("user_id", user.id);

      if (filesError) {
        console.error("Error fetching files:", filesError);
      }

      const filePaths = files?.map((f) => f.path).filter(Boolean) || [];
      console.log(`Found ${filePaths.length} files to delete from storage`);

      // Step 2: Delete files from storage
      if (filePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("files")
          .remove(filePaths);

        if (storageError) {
          console.error("Error deleting files from storage:", storageError);
          // Continue with deletion even if storage cleanup fails
        } else {
          console.log(`Deleted ${filePaths.length} files from storage`);
        }
      }

      // Step 3: Call the SQL function to delete all user data
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "user_delete_own_account"
      );

      if (rpcError) {
        console.error("Error calling user_delete_own_account:", rpcError);
        throw new Error(
          `Failed to delete account data: ${
            rpcError.message || "Unknown error"
          }`
        );
      }

      console.log("RPC response:", rpcData);

      // Check if the RPC returned an error
      if (rpcData && rpcData.ok === false) {
        throw new Error(
          `Account deletion failed: ${rpcData.error || "Unknown error"}`
        );
      }

      // Step 4: Account data deleted successfully
      // Note: The auth user is deleted by the SQL function if it has sufficient permissions
      // Otherwise, it requires admin API which we can't call from the client
      console.log("Account data deleted successfully");

      // Show success dialog FIRST (don't sign out yet)
      // Sign out will happen when user clicks "Done" on the success dialog
      setAccountDeleteSuccess(true);
    } catch (error) {
      console.error("Error deleting account:", error);
      alert(
        `An error occurred while deleting your account: ${
          error.message || "Please try again or contact support."
        }`
      );
      // Don't sign out on error so user can retry
    }
  };

  const handleBackToClasses = () => {
    setSelectedClass(null);
    navigate("", { replace: true });
  };

  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  const handleChatWithAI = (classId = null, conversationId = null) => {
    setChatClassId(classId);
    setChatConversationId(conversationId);
    setChatOpen(true);

    // Update URL to reflect state (without page refresh)
    const searchParams = new URLSearchParams(location.search);
    searchParams.set("chat", "true");
    if (classId) {
      searchParams.set("classId", classId);
    } else {
      searchParams.delete("classId");
    }

    if (conversationId) {
      searchParams.set("conversationId", conversationId);
    } else {
      searchParams.delete("conversationId");
    }

    navigate(`?${searchParams.toString()}`, { replace: true });
  };

  const handleTalkWithAI = (classId = null) => {
    setTalkClassId(classId);
    setTalkOpen(true);
    sessionStorage.setItem("lumiTalkOpen", "true");
  };

  const handleCloseTalk = () => {
    setTalkOpen(false);
    setTalkClassId(null);
    sessionStorage.removeItem("lumiTalkOpen");
  };

  const handleCloseChat = () => {
    setChatOpen(false);
    setChatConversationId(null);

    // Update URL to reflect state (without page refresh)
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete("chat");
    searchParams.delete("classId");
    searchParams.delete("conversationId");

    navigate(`?${searchParams.toString()}`, { replace: true });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const bgVariants = {
    hidden: (custom) => ({
      scale: 0.5,
      opacity: 0,
      x: custom.x ?? 0,
      y: custom.y ?? 0,
      rotate: custom.rotate ?? 0,
    }),
    visible: (custom) => ({
      scale: 1,
      opacity: custom.opacity ?? 0.3,
      x: 0,
      y: 0,
      rotate: custom.rotate ?? 0,
      transition: {
        type: "spring",
        stiffness: 150,
        damping: 12,
      },
    }),
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: ({ index, loaded }) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.15,
        delay: index * 0.05,
      },
    }),
    hover: {
      y: -5,
      scale: 1.01,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 8,
      },
    },
    tap: { scale: 0.98 },
  };

  const menuVariants = {
    hidden: { opacity: 0, y: -50, scale: 0.5 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 18,
      },
    },
    exit: {
      opacity: 0,
      y: -50,
      scale: 0.5,
      transition: { duration: 0.2 },
    },
  };

  const renderClassesGrid = () => {
    if (loading) {
      return (
        <motion.div
          className="classes-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="spinner"></div>
          <span>Loading classes...</span>
        </motion.div>
      );
    }

    if (!loading && classes.length === 0 && hasLoaded) {
      return (
        <motion.div
          key="empty-state"
          className="empty-classes"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
        >
          <div className="empty-classes-icon">
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
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1-2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
          </div>
          <h2>No Classes Yet</h2>
          <p>Create your first class to start studying with Lumi AI</p>
          <motion.button
            className="create-first-class-btn"
            onClick={() => setShowAddForm(true)}
            whileHover={{
              scale: 1.03,
              y: -5,
            }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            Create Your First Class
          </motion.button>
        </motion.div>
      );
    }

    return (
      <motion.div
        className="classes-grid"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {classes.map((classItem, i) => (
          <motion.div
            key={classItem.id}
            className="class-card"
            onClick={() => handleSelectClass(classItem)}
            custom={{ index: i, loaded: hasLoaded }}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <div className="class-card-icon">
              {classItem.name.charAt(0).toUpperCase()}
            </div>

            {/* Card-level icon action buttons (Edit / Delete) */}
            <div
              className="class-card-actions"
              onClick={(e) => {
                // Prevent clicking the action buttons from selecting the class
                e.stopPropagation();
              }}
            >
              <motion.button
                className="card-action-btn view-btn"
                title="Edit class"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedClass(classItem);
                  setIsEditing(true);
                }}
                whileHover={{
                  scale: 1.1,
                  transition: { type: "spring", stiffness: 400, damping: 10 },
                }}
                whileTap={{ scale: 0.98 }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </motion.button>

              <motion.button
                className="card-action-btn delete-btn"
                title="Delete class"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const { data: files, error } = await supabase
                      .from("files")
                      .select("id")
                      .eq("class_id", classItem.id);
                    const fileCount = files ? files.length : 0;
                    setClassDeleteConfirm({
                      isOpen: true,
                      classId: classItem.id,
                      className: classItem.name,
                      hasFiles: fileCount > 0,
                      fileCount,
                    });
                  } catch (err) {
                    console.error("Error checking class files:", err);
                    setClassDeleteConfirm({
                      isOpen: true,
                      classId: classItem.id,
                      className: classItem.name,
                      hasFiles: false,
                      fileCount: 0,
                    });
                  }
                }}
                whileHover={{
                  scale: 1.1,
                  transition: { type: "spring", stiffness: 400, damping: 10 },
                }}
                whileTap={{ scale: 0.98 }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1-2 2v2"></path>
                </svg>
              </motion.button>
            </div>

            <div className="class-card-content">
              <h3 className="class-card-title">{classItem.name}</h3>
              {classItem.description && (
                <p className="class-card-description">
                  {classItem.description}
                </p>
              )}
              <div className="class-card-footer">
                <span className="class-date">
                  Created {new Date(classItem.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    );
  };

  return (
    <>
      <div className="dashboard-container">
        {initialLoading ? (
          <motion.div
            className="classes-loading full-page"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="spinner"></div>
            <span>Loading...</span>
          </motion.div>
        ) : (
          <motion.div
            className="dashboard-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <AnimatePresence mode="wait">
              {selectedClass ? (
                <motion.div
                  key="class-details"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ type: "spring", stiffness: 100, damping: 15 }}
                >
                  <ClassDetails
                    classData={selectedClass}
                    isEditing={isEditing}
                    onEdit={() => setIsEditing(true)}
                    onCancelEdit={() => {
                      // when canceling edit from ClassDetails, go back to the dashboard
                      setIsEditing(false);
                      setSelectedClass(null);
                      navigate("", { replace: true });
                    }}
                    onUpdate={handleUpdateClass}
                    onDelete={handleDeleteClass}
                    onBack={handleBackToClasses}
                  />
                </motion.div>
              ) : (
                <motion.div
                  className="classes-container"
                  key="classes-container"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ type: "spring", stiffness: 100, damping: 15 }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.1,
                      type: "spring",
                      stiffness: 300,
                      damping: 15,
                    }}
                    className="classes-header"
                  >
                    <div className="header-left">
                      <h1>My Classes</h1>
                    </div>
                    <div className="header-right">
                      <motion.button
                        className={`add-class-button ${
                          classes.length > 0 ? "has-classes" : ""
                        }`}
                        onClick={() => setShowAddForm(true)}
                        whileHover={{
                          scale: 1.03,
                          y: -3,
                          transition: {
                            type: "spring",
                            stiffness: 300,
                            damping: 5,
                          },
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
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
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Create Class
                      </motion.button>

                      <div className="menu-container" ref={menuRef}>
                        <motion.button
                          className="menu-button"
                          onClick={toggleMenu}
                          whileHover={{
                            scale: 1.05,
                            transition: {
                              type: "spring",
                              stiffness: 300,
                              damping: 5,
                            },
                          }}
                          whileTap={{ scale: 0.98 }}
                        >
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
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                          </svg>
                        </motion.button>

                        <AnimatePresence>
                          {showMenu && (
                            <motion.div
                              className="menu-popup"
                              variants={menuVariants}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                            >
                              {user && (
                                <div className="dash-user-profile">
                                  <div className="dash-user-avatar">
                                    {user.email
                                      ? user.email.charAt(0).toUpperCase()
                                      : "?"}
                                  </div>
                                  <div className="dash-user-details">
                                    <div className="dash-user-name">
                                      {user.user_metadata?.full_name ||
                                        "Phanidhar Akula"}
                                    </div>
                                    <div className="dash-user-email">
                                      {user.email}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {isAdmin && (
                                <motion.button
                                  className="admin-button"
                                  onClick={() => {
                                    setShowMenu(false);
                                    navigate("/admin");
                                  }}
                                  whileTap={{ scale: 0.98 }}
                                >
                                  {/* Lock icon for admin to indicate protected area */}
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <rect
                                      x="3"
                                      y="11"
                                      width="18"
                                      height="10"
                                      rx="2"
                                    ></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                  </svg>
                                  <p className="sign-out-button-text">Admin</p>
                                </motion.button>
                              )}

                              <motion.button
                                className="sign-out-button"
                                onClick={confirmSignOut}
                                whileTap={{ scale: 0.98 }}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2-2h4"></path>
                                  <polyline points="16 17 21 12 16 7"></polyline>
                                  <line x1="21" y1="12" x2="9" y2="12"></line>
                                </svg>
                                <p className="sign-out-button-text">Sign Out</p>
                              </motion.button>

                              <motion.button
                                className="delete-account-button"
                                onClick={confirmDeleteAccount}
                                whileTap={{ scale: 0.98 }}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M3 6h18"></path>
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                                <p className="delete-account-button-text">
                                  Delete Account
                                </p>
                              </motion.button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>

                  <AnimatePresence mode="wait">
                    {showAddForm ? (
                      <motion.div
                        className="add-class-container"
                        key="add-form"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{
                          type: "spring",
                          stiffness: 100,
                          damping: 15,
                        }}
                      >
                        <AddClassForm
                          onClassCreated={handleAddClass}
                          onCancel={() => setShowAddForm(false)}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="classes-grid"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        {renderClassesGrid()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Add chat component with AnimatePresence for smooth transitions */}
      <AnimatePresence>
        {chatOpen && (
          <ChatComponent
            isOpen={chatOpen}
            onClose={handleCloseChat}
            initialClassId={chatClassId}
            allClasses={classes}
            conversationId={chatConversationId}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {talkOpen && (
          <TalkComponent
            isOpen={talkOpen}
            onClose={handleCloseTalk}
            initialClassId={talkClassId}
          />
        )}
      </AnimatePresence>

      {!selectedClass && hasLoaded && (
        <motion.div
          className="bottom-navbar"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 20,
            delay: 0.5,
          }}
        >
          <div className="bottom-navbar-container">
            <motion.button
              className="ai-action-button chat-ai-button"
              onClick={() => handleChatWithAI(selectedClass?.id)}
              whileHover={{
                scale: 1.03,
                y: -5,
                transition: { type: "spring", stiffness: 300, damping: 8 },
              }}
              whileTap={{ scale: 0.98 }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Chat with AI
            </motion.button>

            <motion.button
              className="ai-action-button talk-ai-button"
              onClick={() => {
                handleTalkWithAI();
              }}
              whileHover={{
                scale: 1.03,
                y: -5,
                transition: { type: "spring", stiffness: 300, damping: 8 },
              }}
              whileTap={{ scale: 0.98 }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
              Talk with AI
            </motion.button>
          </div>
        </motion.div>
      )}

      <ConfirmDialog
        isOpen={signOutConfirm}
        onClose={() => setSignOutConfirm(false)}
        onConfirm={handleSignOut}
        title="Sign Out"
        message="Are you sure you want to sign out of your account?"
        confirmText="Sign Out"
        cancelText="Cancel"
        danger={true}
      />

      <ConfirmDialog
        isOpen={bottomComingSoon?.isOpen}
        onClose={() => setBottomComingSoon({ isOpen: false, feature: "" })}
        onConfirm={() => setBottomComingSoon({ isOpen: false, feature: "" })}
        title={
          bottomComingSoon?.feature
            ? `${bottomComingSoon.feature} — Coming Soon`
            : "Coming Soon"
        }
        message={`This feature is coming soon. We'll notify you when ${
          bottomComingSoon?.feature || "it"
        } is available.`}
        confirmText="Got it"
        cancelText=""
        danger={false}
      />

      <ConfirmDialog
        isOpen={accountComingSoon?.isOpen}
        onClose={() => setAccountComingSoon({ isOpen: false, feature: "" })}
        onConfirm={() => setAccountComingSoon({ isOpen: false, feature: "" })}
        title={
          accountComingSoon?.feature
            ? `${accountComingSoon.feature} — Coming Soon`
            : "Coming Soon"
        }
        message={`This feature is coming soon. We'll notify you when ${
          accountComingSoon?.feature || "it"
        } is available.`}
        confirmText="Got it"
        cancelText=""
        danger={false}
      />

      <ConfirmDialog
        isOpen={deleteAccountConfirm}
        onClose={() => setDeleteAccountConfirm(false)}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message="Are you sure you want to permanently delete your account? This action cannot be undone and will delete all your classes and files."
        confirmText="Delete Account"
        cancelText="Cancel"
        danger={true}
      />

      {/* Class delete confirm dialog (reuses ConfirmDialog component) */}
      <ConfirmDialog
        isOpen={classDeleteConfirm.isOpen}
        onClose={() =>
          setClassDeleteConfirm({
            isOpen: false,
            classId: null,
            className: "",
            hasFiles: false,
            fileCount: 0,
          })
        }
        onConfirm={async () => {
          const id = classDeleteConfirm.classId;
          setClassDeleteConfirm({
            isOpen: false,
            classId: null,
            className: "",
            hasFiles: false,
            fileCount: 0,
          });
          if (id) await handleDeleteClass(id);
        }}
        title={
          classDeleteConfirm.hasFiles
            ? "Delete Class and Files"
            : "Delete Class"
        }
        message={
          classDeleteConfirm.hasFiles
            ? `This class contains ${classDeleteConfirm.fileCount} file(s). Deleting the class will also delete all associated files. This action cannot be undone. Are you sure you want to proceed?`
            : `Are you sure you want to delete ${classDeleteConfirm.className}? This action cannot be undone.`
        }
        confirmText={classDeleteConfirm.hasFiles ? "Delete All" : "Delete"}
        danger={true}
      />

      {/* Account deleted confirmation dialog - shown when user tries to log back in */}
      <ConfirmDialog
        isOpen={accountDeletedInfo.isOpen}
        onClose={async () => {
          setAccountDeletedInfo({
            isOpen: false,
            deletedDate: "",
            canReregisterDate: "",
          });
          // Sign out and redirect when dialog is closed
          try {
            await supabase.auth.signOut();
          } catch (err) {
            console.error("Error signing out:", err);
          }
          navigate("/");
        }}
        onConfirm={async () => {
          // Sign out and navigate immediately to prevent dashboard flash
          try {
            await supabase.auth.signOut();
          } catch (err) {
            console.error("Error signing out:", err);
          }
          // Navigate immediately before closing dialog
          navigate("/");
          // Clean up state after navigation
          setAccountDeletedInfo({
            isOpen: false,
            deletedDate: "",
            canReregisterDate: "",
            isAdminDeleted: false,
          });
        }}
        title={
          accountDeletedInfo.isAdminDeleted
            ? "Account Deleted by Administrator"
            : "Account Successfully Deleted"
        }
        message={
          accountDeletedInfo.deletedDate
            ? accountDeletedInfo.isAdminDeleted
              ? `Your account was deleted by an administrator on ${accountDeletedInfo.deletedDate} due to violation of terms.\n\nAll your classes, files, notes, and conversations have been permanently removed from our servers.\n\nYou may create a new account after ${accountDeletedInfo.canReregisterDate} if you wish to return to LumiAI.`
              : `Your account and all associated data were permanently removed on ${accountDeletedInfo.deletedDate}.\n\nAll classes, files, notes, and conversations have been deleted from our servers.\n\nYou may create a new account after ${accountDeletedInfo.canReregisterDate} if you wish to return to LumiAI.`
            : "Your account has been deleted."
        }
        confirmText="Understood"
        cancelText=""
        danger={false}
        hideBackground={true}
      />

      {/* Account delete success dialog - shown after successful deletion */}
      <ConfirmDialog
        isOpen={accountDeleteSuccess}
        onClose={async () => {
          setAccountDeleteSuccess(false);
          // Sign out before navigating
          try {
            await supabase.auth.signOut();
          } catch (err) {
            console.log(
              "Sign out error (expected if user already deleted):",
              err
            );
          }
          navigate("/");
        }}
        onConfirm={async () => {
          setAccountDeleteSuccess(false);
          // Sign out before navigating
          try {
            await supabase.auth.signOut();
          } catch (err) {
            console.log(
              "Sign out error (expected if user already deleted):",
              err
            );
          }
          navigate("/");
        }}
        title="Account Deleted Successfully"
        message="Your account and all associated data have been permanently removed from our servers. Thank you for using LumiAI."
        confirmText="Done"
        cancelText=""
        danger={false}
        hideBackground={true}
      />
    </>
  );
};

export default Dashboard;
