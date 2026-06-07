import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@shared/lib/supabaseClient";
import { detectRegion } from "@shared/utils/region";
import ClassDetails from "./ClassDetails";
import AddClassForm from "./AddClassForm";
import ConfirmDialog from "@shared/components/ConfirmDialog";
import { getDueCount } from "@shared/services/reviewService";
// Heavy AI overlays — loaded on demand (they pull in pdf.js, markdown, etc.).
const ChatComponent = lazy(() => import("@features/chat/ChatComponent"));
const TalkComponent = lazy(() => import("@features/talk/TalkComponent"));

// Shared "sticker" styles: profile-menu rows, the bottom AI buttons, and the
// class-card icon action buttons.
const MENU_BTN =
  "flex w-full items-center justify-center gap-2.5 rounded-full border-[1.5px] border-solid border-ink bg-transparent p-3 text-ink shadow-[0px_2px_0_#000] [transition:all_0.2s_ease-in-out]";
const MENU_BTN_TEXT = "text-[medium] font-medium";
const AI_BTN =
  "flex items-center justify-center gap-2.5 rounded-full border-[1.5px] border-solid border-ink bg-sage px-[50px] py-2.5 text-[medium] font-semibold text-ink shadow-[0px_2px_0_#000] max-md:px-5 max-md:py-3 max-md:text-[small] max-[480px]:px-[15px] max-[480px]:[&_svg]:h-[18px] max-[480px]:[&_svg]:w-[18px]";
const CARD_ACTION_BTN =
  "flex h-10 w-10 items-center justify-center rounded-full border border-solid border-ink shadow-[0px_1px_0_#000] [&_svg]:h-[18px] [&_svg]:w-[18px]";

// A class row from Supabase (with its related files). Permissive — extra
// columns from the DB are allowed via the index signature.
interface ClassItem {
  id: string | number;
  name: string;
  description?: string | null;
  created_at: string;
  files?: any[];
  isLoading?: boolean;
  [key: string]: any;
}

interface ClassDeleteConfirmState {
  isOpen: boolean;
  classId: string | number | null;
  className: string;
  hasFiles: boolean;
  fileCount: number;
}

interface Props {
  session: Session | null;
}

const Dashboard = ({ session }: Props) => {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(false);
  const hasInitialFetch = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const classIdFromUrl = params.get("classId");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const fetchingByUrlRef = useRef(false);
  // Set right before a manual "back to classes"/deselect so the URL→selection
  // restore effect below doesn't re-open the class during the brief render where
  // selectedClass is already null but classId hasn't left the URL yet.
  const skipUrlSelectRef = useRef(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const [classDeleteConfirm, setClassDeleteConfirm] =
    useState<ClassDeleteConfirmState>({
      isOpen: false,
      classId: null,
      className: "",
      hasFiles: false,
      fileCount: 0,
    });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatClassId, setChatClassId] = useState<string | number | null>(null);
  const [chatConversationId, setChatConversationId] = useState<
    string | null
  >(null);
  const [talkOpen, setTalkOpen] = useState(() => {
    // Restore Talk state from sessionStorage on page load
    return sessionStorage.getItem("lumiTalkOpen") === "true";
  });
  const [talkClassId, setTalkClassId] = useState<string | number | null>(null);
  const [accountDeleteSuccess, setAccountDeleteSuccess] = useState(false);

  // Spaced repetition: how many flashcards are due, for the menu badge.
  useEffect(() => {
    let active = true;
    getDueCount().then((n) => {
      if (active) setDueCount(n);
    });
    return () => {
      active = false;
    };
  }, []);
  const [accountDeleteError, setAccountDeleteError] = useState(false);
  const [accountDeletionEnabled, setAccountDeletionEnabled] = useState(true);
  const [deletionDisabledNotice, setDeletionDisabledNotice] = useState(false);

  useEffect(() => {
    if (!loading) {
      setHasLoaded(true);
    }
  }, [loading]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, location.search]);

  useEffect(() => {
    // Skip the one re-select that the back/deselect race would otherwise trigger
    // (selectedClass just became null but classId is still in the URL this render).
    if (skipUrlSelectRef.current) {
      skipUrlSelectRef.current = false;
      return;
    }
    if (classes.length > 0 && classIdFromUrl && !selectedClass) {
      const classFromUrl = classes.find(
        (c: ClassItem) => c.id.toString() === classIdFromUrl
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

      // Global self-service account-deletion toggle (admin-controlled).
      try {
        const { data: setting } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "account_deletion_enabled")
          .maybeSingle();
        if (setting) setAccountDeletionEnabled(setting.value !== false);
      } catch {
        // default to enabled
      }

      // fetch profile to determine admin flag
      try {
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("is_admin, region")
          .eq("id", user.id)
          .limit(1)
          .maybeSingle();
        if (!profileErr && profile && profile.is_admin === true) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
        // Backfill region for users created before region capture existed:
        // if it's still empty/Unknown, persist the browser-detected region.
        // set_my_region() is a no-op when region is already set, so this is
        // safe to fire on every load (and harmless if the RPC isn't deployed).
        if (!profile?.region || profile.region === "Unknown") {
          supabase
            .rpc("set_my_region", { p_region: detectRegion() })
            .then(
              () => {},
              () => {}
            );
        }
      } catch {
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
        setClasses((data as ClassItem[]) || []);

        if (classIdFromUrl && data) {
          const classFromUrl = (data as ClassItem[]).find(
            (c: ClassItem) => c.id.toString() === classIdFromUrl
          );
          if (classFromUrl) {
            setSelectedClass(classFromUrl);
            fetchingByUrlRef.current = false;
          }
        }
      }
    } catch (error) {
      console.error(
        "Error fetching classes:",
        error instanceof Error ? error.message : error
      );
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  };

  const handleAddClass = (newClass: ClassItem) => {
    // Ensure new class has files array for UI components that expect it
    const withFiles = { ...newClass, files: newClass.files || [] };
    setClasses((prev) => [withFiles, ...prev]);
    setShowAddForm(false);
  };

  const handleUpdateClass = async (updatedClass: ClassItem) => {
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

  const handleDeleteClass = async (id: string | number) => {
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

  const handleSelectClass = (classItem: ClassItem) => {
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
      console.error(
        "Error signing out:",
        error instanceof Error ? error.message : error
      );
    }
  };

  const confirmSignOut = () => {
    setShowMenu(false);
    setSignOutConfirm(true);
  };

  const confirmDeleteAccount = () => {
    setShowMenu(false);
    if (!accountDeletionEnabled) {
      setDeletionDisabledNotice(true);
      return;
    }
    setDeleteAccountConfirm(true);
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleteAccountConfirm(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.warn("No user found to delete; redirecting to login.");
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
      // Friendly, non-technical message (never the raw RPC/DB error string).
      setAccountDeleteError(true);
      // Don't sign out on error so user can retry
    }
  };

  const handleBackToClasses = () => {
    skipUrlSelectRef.current = true;
    setSelectedClass(null);
    navigate(location.pathname, { replace: true });
  };

  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  const handleChatWithAI = (
    classId: string | number | null = null,
    conversationId: string | null = null
  ) => {
    setChatClassId(classId);
    setChatConversationId(conversationId);
    setChatOpen(true);

    // Update URL to reflect state (without page refresh)
    const searchParams = new URLSearchParams(location.search);
    searchParams.set("chat", "true");
    if (classId) {
      searchParams.set("classId", String(classId));
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

  const handleTalkWithAI = (classId: string | number | null = null) => {
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

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: ({ index }: { index: number }) => ({
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

  const menuVariants: Variants = {
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
          className="flex w-full flex-col items-center justify-center px-5 py-[60px]"
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
          className="flex h-[70dvh] w-full cursor-pointer flex-col items-center justify-center gap-5 px-5 py-[60px] text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
        >
          <div className="text-muted">
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
          <h2 className="text-[xx-large] font-medium max-[480px]:text-[x-large]">
            No Classes Yet
          </h2>
          <p className="text-muted">
            Create your first class to start studying with Lumi AI
          </p>
          <motion.button
            className="mt-2.5 rounded-full border-[1.5px] border-solid border-ink bg-sage px-[50px] py-[15px] text-[medium] font-semibold text-ink shadow-[0px_2px_0_#000] max-[480px]:px-[30px] max-[480px]:py-3 max-[480px]:text-[small]"
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
        className="grid min-h-[300px] grid-cols-[repeat(auto-fill,minmax(350px,1fr))] content-start items-start gap-[30px] p-5 max-[1024px]:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] max-[1024px]:gap-5 max-[480px]:grid-cols-1 max-[480px]:gap-[15px] max-[480px]:p-2.5"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {classes.map((classItem, i) => (
          <motion.div
            key={classItem.id}
            className="relative flex cursor-pointer flex-col items-start justify-center gap-[15px] self-start rounded-[10px] bg-white p-[30px] max-md:p-5"
            onClick={() => handleSelectClass(classItem)}
            custom={{ index: i, loaded: hasLoaded }}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <div className="flex h-[50px] w-[50px] items-center justify-center rounded-[10px] border-[1.5px] border-solid border-ink bg-sage text-[x-large] font-semibold shadow-[0px_2px_0_#000]">
              {classItem.name.charAt(0).toUpperCase()}
            </div>

            {/* Card-level icon action buttons (Edit / Delete) */}
            <div
              className="absolute right-[15px] top-[15px] z-[5] flex gap-2"
              onClick={(e) => {
                // Prevent clicking the action buttons from selecting the class
                e.stopPropagation();
              }}
            >
              <motion.button
                className={`${CARD_ACTION_BTN} bg-sage [&_svg]:stroke-ink`}
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
                className={`${CARD_ACTION_BTN} bg-[#EF4444] [&_svg]:stroke-white`}
                title="Delete class"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const { data: files } = await supabase
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

            <div className="flex-1">
              <h3 className="text-[x-large] font-medium">{classItem.name}</h3>
              {classItem.description && <p>{classItem.description}</p>}
              <div>
                <span className="text-[small] text-muted">
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
      <div className="min-h-[100dvh] w-full overflow-hidden px-[50px] pt-0 pb-[100px] max-[1024px]:px-[30px] max-[1024px]:pb-[30px] max-md:px-5 max-md:pb-5 max-[480px]:px-[15px] max-[480px]:pb-20">
        {initialLoading ? (
          <motion.div
            className="fixed left-0 top-0 flex h-[100dvh] w-full flex-col items-center justify-center bg-cream"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="spinner"></div>
            <span>Loading...</span>
          </motion.div>
        ) : (
          <motion.div
            className="w-full overflow-y-auto"
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
                      skipUrlSelectRef.current = true;
                      setSelectedClass(null);
                      navigate(location.pathname, { replace: true });
                    }}
                    onUpdate={handleUpdateClass}
                    onDelete={handleDeleteClass}
                    onBack={handleBackToClasses}
                  />
                </motion.div>
              ) : (
                <motion.div
                  className="min-h-[calc(100dvh-220px)]"
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
                    className="flex items-center justify-between px-5 pt-[50px] pb-2.5 max-md:mb-5 max-md:flex-col max-md:items-start max-md:gap-5 max-md:px-2.5 max-md:pt-[30px] max-md:pb-2.5"
                  >
                    <div>
                      <h1 className="m-0 cursor-pointer text-[32px] font-extrabold text-ink max-[480px]:text-[24px]">
                        My Classes
                      </h1>
                    </div>
                    <div className="flex items-center gap-5 max-md:w-full max-md:justify-between">
                      <motion.button
                        className={`flex cursor-pointer items-center justify-center gap-2.5 rounded-full border-[1.5px] border-solid border-ink bg-sage px-[30px] py-3 text-[small] font-semibold text-ink shadow-[0px_2px_0_#000] max-md:px-5 max-md:py-2.5 max-md:text-[14px] ${
                          classes.length > 0
                            ? "min-[769px]:flex"
                            : "min-[769px]:hidden"
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

                      <div className="relative" ref={menuRef}>
                        <motion.button
                          className="flex h-[50px] w-[50px] items-center justify-center rounded-full border-[1.5px] border-solid border-ink bg-sage text-ink shadow-[0px_2px_0_#000]"
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
                              className="absolute right-0 top-[calc(100%+10px)] z-10 flex w-[300px] flex-col gap-2.5 rounded-xl border-[1.5px] border-solid border-ink bg-cream p-5 shadow-[0px_5px_15px_rgba(0,0,0,0.1)] max-md:w-[280px]"
                              variants={menuVariants}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                            >
                              {user && (
                                <div className="flex cursor-pointer items-center gap-2.5 rounded-[10px] p-2.5">
                                  <div className="flex h-[45px] w-[45px] items-center justify-center rounded-full border-[1.5px] border-solid border-ink bg-sage text-[large] font-semibold shadow-[0px_2px_0_#000]">
                                    {user.email
                                      ? user.email.charAt(0).toUpperCase()
                                      : "?"}
                                  </div>
                                  <div className="flex-1">
                                    <div className="mb-0.5 text-[medium] font-semibold text-ink">
                                      {user.user_metadata?.full_name ||
                                        user.email?.split("@")[0] ||
                                        "User"}
                                    </div>
                                    <div className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[x-small] text-ink">
                                      {user.email}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <motion.button
                                className={`${MENU_BTN} relative hover:bg-sage`}
                                onClick={() => {
                                  setShowMenu(false);
                                  navigate("/review");
                                }}
                                whileTap={{ scale: 0.98 }}
                              >
                                {/* Layers icon (flashcard stack) */}
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
                                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                  <polyline points="2 17 12 22 22 17"></polyline>
                                  <polyline points="2 12 12 17 22 12"></polyline>
                                </svg>
                                <p className={MENU_BTN_TEXT}>Review</p>
                                {dueCount > 0 && (
                                  <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#ef4444] px-1.5 text-[0.75rem] font-bold text-white">
                                    {dueCount}
                                  </span>
                                )}
                              </motion.button>

                              <motion.button
                                className={`${MENU_BTN} hover:bg-sage`}
                                onClick={() => {
                                  setShowMenu(false);
                                  navigate("/progress");
                                }}
                                whileTap={{ scale: 0.98 }}
                              >
                                {/* Bar-chart icon */}
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
                                  <line x1="18" y1="20" x2="18" y2="10"></line>
                                  <line x1="12" y1="20" x2="12" y2="4"></line>
                                  <line x1="6" y1="20" x2="6" y2="14"></line>
                                </svg>
                                <p className={MENU_BTN_TEXT}>Progress</p>
                              </motion.button>

                              {isAdmin && (
                                <motion.button
                                  className={`${MENU_BTN} hover:bg-[rgba(59,130,246,0.95)] hover:text-white`}
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
                                  <p className={MENU_BTN_TEXT}>Admin</p>
                                </motion.button>
                              )}

                              <motion.button
                                className={`${MENU_BTN} hover:bg-sage`}
                                onClick={() => {
                                  setShowMenu(false);
                                  navigate("/support");
                                }}
                                whileTap={{ scale: 0.98 }}
                              >
                                {/* Help-circle icon */}
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
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                                <p className={MENU_BTN_TEXT}>Support</p>
                              </motion.button>

                              <motion.button
                                className={`${MENU_BTN} mt-[5px] hover:bg-[#F97316] hover:text-white`}
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
                                <p className={MENU_BTN_TEXT}>Sign Out</p>
                              </motion.button>

                              <motion.button
                                className={`${MENU_BTN} mt-[5px] hover:bg-[#EF4444] hover:text-white`}
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
                                <p className={MENU_BTN_TEXT}>
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
                        className="mx-auto max-w-[600px]"
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
                          onClassCreated={handleAddClass as any}
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
          <Suspense fallback={null}>
            <ChatComponent
              isOpen={chatOpen}
              onClose={handleCloseChat}
              initialClassId={chatClassId as any}
              allClasses={classes}
              conversationId={chatConversationId}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {talkOpen && (
          <Suspense fallback={null}>
            <TalkComponent
              isOpen={talkOpen}
              onClose={handleCloseTalk}
              initialClassId={talkClassId}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {!selectedClass && hasLoaded && (
        <motion.div
          className="fixed bottom-0 left-0 z-[100] w-full max-md:p-[15px] max-[480px]:p-3"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 20,
            delay: 0.5,
          }}
        >
          <div className="flex items-center justify-center gap-5 p-[30px] max-md:px-2.5 max-md:py-0 max-[480px]:gap-2.5">
            <motion.button
              className={AI_BTN}
              onClick={() => handleChatWithAI((selectedClass as any)?.id)}
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
              className={AI_BTN}
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
        isOpen={deleteAccountConfirm}
        onClose={() => setDeleteAccountConfirm(false)}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message="Are you sure you want to permanently delete your account? This action cannot be undone and will delete all your classes and files."
        confirmText="Delete Account"
        cancelText="Cancel"
        danger={true}
      />

      {/* Self-service deletion disabled notice (admin-controlled toggle) */}
      <ConfirmDialog
        isOpen={deletionDisabledNotice}
        onClose={() => setDeletionDisabledNotice(false)}
        onConfirm={() => setDeletionDisabledNotice(false)}
        title="Account Deletion Unavailable"
        message="Account deletion is temporarily disabled. If you need to close your account, please contact support."
        confirmText="Got it"
        cancelText=""
        danger={false}
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

      {/* Account delete failure dialog — friendly, never shows the raw error */}
      <ConfirmDialog
        isOpen={accountDeleteError}
        onClose={() => setAccountDeleteError(false)}
        onConfirm={() => setAccountDeleteError(false)}
        title="Account Deletion Failed"
        message="Something went wrong while deleting your account. Please try again in a moment, or contact support if it keeps happening."
        confirmText="OK"
        cancelText=""
        danger={false}
      />
    </>
  );
};

export default Dashboard;
