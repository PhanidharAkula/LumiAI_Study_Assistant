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
import { useLoadingSignal, LoadingSignal } from "@shared/lib/loadingSignal";
import { loaderLabel } from "@shared/lib/loaderLabel";
import { Constellation, LumiStar, UI } from "@shared/components/atlas";
import {
  Button,
  CloseButton,
  IconButton,
  Spinner,
} from "@shared/components/controls";
import {
  DUR,
  fadeRise,
  keyPress,
  plateLift,
  spring,
  stagger,
} from "@shared/motion";
import { useEscapeToClose } from "@shared/hooks/overlay";
// Heavy AI overlays - loaded on demand (they pull in pdf.js, markdown, etc.).
const ChatComponent = lazy(() => import("@features/chat/ChatComponent"));
const TalkComponent = lazy(() => import("@features/talk/TalkComponent"));

// Shared instrument styles: profile-menu rows and the bottom AI dock actions
// (CSS supplies color hovers only - transform motion comes from framer).
const MENU_BTN =
  "flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-ink transition-colors duration-150 hover:bg-cream/80";
const MENU_BTN_DANGER =
  "flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-vermilion transition-colors duration-150 hover:bg-vermilion-wash";
const MENU_BTN_TEXT = "text-[14px] font-medium";
const AI_BTN =
  "flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border-0 bg-transparent px-6 py-2.5 text-[14.5px] font-semibold text-ink transition-colors duration-200 hover:bg-cream/90 max-md:px-4 max-md:py-2 max-md:text-[13.5px] max-[480px]:px-3 max-[480px]:[&_svg]:h-4.25 max-[480px]:[&_svg]:w-4.25";

// A class row from Supabase (with its related files). Permissive - extra
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
  // Covers the class<->dashboard view swap with the loader - the AnimatePresence
  // exit otherwise leaves a gap going in and an empty flash coming back.
  const [swapping, setSwapping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  // Rename-in-place from a dashboard card (a Modal over the grid, like create).
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(false);
  const hasInitialFetch = useRef(false);

  // Admin-set announcement banner. Dismissal is keyed by the exact text so a new
  // announcement re-appears even after the previous one was dismissed.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "announcement")
          .maybeSingle();
        const text = typeof data?.value === "string" ? data.value.trim() : "";
        if (
          text &&
          localStorage.getItem("lumi_announcement_dismissed") !== text
        ) {
          setAnnouncement(text);
        }
      } catch {
        /* ignore - banner just won't show */
      }
    })();
  }, []);

  const dismissAnnouncement = () => {
    localStorage.setItem("lumi_announcement_dismissed", announcement);
    setAnnouncement("");
  };
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
  const [chatConversationId, setChatConversationId] = useState<string | null>(
    null
  );
  // Keep the Talk overlay open across a refresh so a reload doesn't bounce the
  // user back to the dashboard. The conversation is in-memory, so it reopens to
  // the Begin screen (ready to start again), not mid-conversation.
  const [talkOpen, setTalkOpen] = useState(
    () => new URLSearchParams(window.location.search).get("talk") === "true"
  );
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

  // Feed the shared app loader during the first classes fetch, so a refresh
  // shows one continuous loader instead of a second spinner here.
  // Match the loader text to the URL (open overlay / class) so it doesn't flash
  // a generic label before the destination's own.
  useLoadingSignal(initialLoading, loaderLabel(location.pathname, location.search));
  // Loader while swapping between the dashboard grid and a class (cleared when
  // the AnimatePresence exit finishes); ClassDetails' own file-load loader then
  // takes over seamlessly going in.
  useLoadingSignal(swapping, loaderLabel(location.pathname, location.search));
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

  // Escape closes the profile menu (stacked - overlays above it win first).
  useEscapeToClose(showMenu, () => setShowMenu(false));

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
          supabase.rpc("set_my_region", { p_region: detectRegion() }).then(
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

  // Shared persist step for both rename entry points (DB write + list refresh).
  const persistClassUpdate = async (
    updatedClass: ClassItem
  ): Promise<boolean> => {
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
      return true;
    } catch (err) {
      console.error("Error updating class:", err);
      return false;
    }
  };

  // Rename from a dashboard card: stay on the dashboard, just close the modal.
  const handleUpdateClassInline = async (updatedClass: ClassItem) => {
    if (await persistClassUpdate(updatedClass)) setEditingClass(null);
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
    setSwapping(true);
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
    setSwapping(true);
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

  const handleTalkWithAI = () => {
    setTalkOpen(true);
    // Reflect Talk in the URL so the loader can name it ("Tuning in") and it's
    // deep-linkable, like chat.
    const searchParams = new URLSearchParams(location.search);
    searchParams.set("talk", "true");
    navigate(`?${searchParams.toString()}`, { replace: true });
  };

  const handleCloseTalk = () => {
    setTalkOpen(false);
    const searchParams = new URLSearchParams(location.search);
    searchParams.delete("talk");
    navigate(`?${searchParams.toString()}`, { replace: true });
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

  // Dropdown plate under the menu key - shared spring/duration, local geometry.
  const menuVariants: Variants = {
    hidden: { opacity: 0, y: -10, scale: 0.97 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: spring.plate,
    },
    exit: {
      opacity: 0,
      y: -8,
      scale: 0.98,
      transition: { duration: DUR.fast },
    },
  };

  const renderClassesGrid = () => {
    if (loading) {
      return (
        <motion.div
          className="flex w-full flex-col items-center justify-center px-5 py-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Spinner label="Loading classes..." />
        </motion.div>
      );
    }

    if (!loading && classes.length === 0 && hasLoaded) {
      return (
        <motion.div
          key="empty-state"
          className="flex h-[70dvh] w-full flex-col items-center justify-center gap-4 px-5 py-15 text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={spring.gentle}
        >
          <div className="text-ink/30">
            <Constellation
              name="an uncharted sky"
              size={180}
              className="max-[480px]:h-35 max-[480px]:w-35"
            />
          </div>
          <p className={UI.overline}>Fig. 1 - An uncharted sky</p>
          <h2 className="max-w-140 font-display text-[30px] font-semibold leading-tight tracking-[-0.01em] text-ink max-[480px]:text-[24px]">
            Your sky is empty - chart your{" "}
            <em className="text-gold-deep [font-variation-settings:'SOFT'_60,'WONK'_1]">
              first class
            </em>
            .
          </h2>
          <Button
            variant="gold"
            className="mt-2.5 max-[480px]:px-6 max-[480px]:py-2.5 max-[480px]:text-[14px]"
            onClick={() => setShowAddForm(true)}
          >
            Create Your First Class
            <span aria-hidden="true" className="text-[13px]">
              ✦
            </span>
          </Button>
        </motion.div>
      );
    }

    return (
      <motion.div
        className="grid min-h-75 grid-cols-[repeat(auto-fill,minmax(350px,1fr))] content-start items-start gap-6 p-5 max-[1024px]:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] max-[1024px]:gap-5 max-[480px]:grid-cols-1 max-[480px]:gap-4 max-[480px]:p-2.5"
        variants={stagger()}
        initial="hidden"
        animate="visible"
      >
        {/* Atlas plate header - names this leaf of the chart. */}
        <motion.div className="col-span-full min-w-0" variants={fadeRise}>
          <p className={`${UI.overline} mb-2`}>Atlas</p>
          <h1 className="font-display text-[34px] font-semibold leading-[1.12] tracking-[-0.015em] text-ink max-md:text-[27px]">
            Your sky{" "}
            <em className="text-gold-deep [font-variation-settings:'SOFT'_60,'WONK'_1]">
              so far
            </em>
            .
          </h1>
          <div className={`${UI.rule} mt-5`} />
        </motion.div>

        {classes.map((classItem, i) => (
          <motion.div
            key={classItem.id}
            className={`${UI.plate} ${UI.plateHover} group flex cursor-pointer flex-col items-start gap-3 self-start p-6 max-md:p-5`}
            onClick={() => handleSelectClass(classItem)}
            variants={i < 12 ? fadeRise : undefined}
            {...plateLift}
          >
            <div className="-ml-2 -mt-1 text-verdi/80">
              <Constellation name={classItem.name} size={64} />
            </div>

            {/* Card-level icon action keys (Edit / Delete) - revealed on
                hover on desktop, always visible on touch layouts. */}
            <div
              className="absolute right-3.75 top-3.75 z-5 flex gap-2 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100"
              onClick={(e) => {
                // Prevent clicking the action buttons from selecting the class
                e.stopPropagation();
              }}
            >
              <IconButton
                label="Edit class"
                title="Edit class"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  // Rename in place over the dashboard, same as create, not a
                  // detour through ClassDetails.
                  setEditingClass(classItem);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </IconButton>

              <IconButton
                label="Delete class"
                title="Delete class"
                size="sm"
                variant="danger"
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
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1-2 2v2"></path>
                </svg>
              </IconButton>
            </div>

            <div className="flex-1">
              <h3 className="font-display text-[21px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                {classItem.name}
              </h3>
              {classItem.description && (
                <p className="mt-1 text-[13.5px] leading-[1.6] text-muted">
                  {classItem.description}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={UI.overlineMuted}>
                  {`${classItem.files?.length ?? 0} ${
                    (classItem.files?.length ?? 0) === 1
                      ? "document"
                      : "documents"
                  }`}
                </span>
                <span className="text-[9px] text-gold" aria-hidden="true">
                  ✦
                </span>
                <span className={UI.overlineMuted}>
                  Created {new Date(classItem.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </motion.div>
        ))}

        {/* Chart a new class - dashed entry plate (same action as the header
            key; purely an additional affordance in the atlas grid). */}
        <motion.button
          type="button"
          className="group/add relative flex min-h-43 cursor-pointer flex-col items-center justify-center gap-3 self-stretch rounded-xl border border-dashed border-ink/25 bg-transparent p-6 text-muted transition-[border-color,color,background-color] duration-300 hover:border-gold-deep hover:bg-vellum/50 hover:text-gold-deep max-md:min-h-37.5 max-md:p-5"
          onClick={() => setShowAddForm(true)}
          variants={fadeRise}
          {...plateLift}
        >
          <span
            className="absolute right-4 top-3.5 text-[13px] text-gold opacity-0 transition-opacity duration-300 group-hover/add:opacity-100"
            aria-hidden="true"
          >
            ✦
          </span>
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="12" y1="4" x2="12" y2="20"></line>
            <line x1="4" y1="12" x2="20" y2="12"></line>
          </svg>
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em]">
            Chart a new class
          </span>
        </motion.button>
      </motion.div>
    );
  };

  return (
    <>
      <div className="min-h-dvh w-full overflow-hidden px-12.5 pt-0 pb-25 max-[1024px]:px-7.5 max-[1024px]:pb-7.5 max-md:px-5 max-md:pb-5 max-[480px]:px-3.75 max-[480px]:pb-20">
        {initialLoading ? null : (
          <motion.div
            className="w-full overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DUR.slow }}
          >
            <AnimatePresence mode="wait" onExitComplete={() => setSwapping(false)}>
              {selectedClass ? (
                <motion.div
                  key="class-details"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={spring.gentle}
                >
                  <ClassDetails
                    classData={selectedClass}
                    onBack={handleBackToClasses}
                  />
                </motion.div>
              ) : (
                <motion.div
                  className="mx-auto w-full max-w-310 min-h-[calc(100dvh-220px)]"
                  key="classes-container"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={spring.gentle}
                >
                  {announcement && (
                    <div className="mx-5 mt-7.5 flex items-start gap-3.5 rounded-xl border border-solid border-line bg-cream/80 px-5 py-4 shadow-plate max-md:mx-2.5">
                      <span
                        className="mt-px text-[13px] text-gold"
                        aria-hidden="true"
                      >
                        ✦
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`${UI.overline} mb-1`}>Bulletin</p>
                        <p className="m-0 text-[14px] font-medium leading-[1.6] text-ink whitespace-pre-wrap [word-break:break-word]">
                          {announcement}
                        </p>
                      </div>
                      <CloseButton
                        label="Dismiss announcement"
                        size="sm"
                        iconSize={14}
                        onClick={dismissAnnouncement}
                        className="-mr-1 -mt-0.5"
                      />
                    </div>
                  )}
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.gentle, delay: 0.1 }}
                    // relative z-20 lifts the whole header bar (and its profile
                    // dropdown) above the cards grid, which is a later sibling at
                    // z-auto - otherwise the menu opens *behind* the first card row.
                    className="relative z-20 flex items-center justify-between gap-4 px-5 pt-9 pb-2.5 max-md:px-2.5 max-md:pt-6 max-md:pb-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <LumiStar size={28} />
                      <span className="font-display text-[19px] font-semibold tracking-[-0.01em] text-ink max-[380px]:hidden">
                        Lumi AI
                      </span>
                    </div>
                    <div className="flex items-center gap-3 max-[480px]:gap-2">
                      <Button
                        size="sm"
                        className={`max-md:px-4 max-md:py-2 max-md:text-[13px] ${
                          classes.length > 0
                            ? "min-[769px]:inline-flex"
                            : "min-[769px]:hidden"
                        }`}
                        onClick={() => setShowAddForm(true)}
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
                          <line x1="12" y1="5" x2="12" y2="19"></line>
                          <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Create Class
                      </Button>

                      <div className="relative" ref={menuRef}>
                        <IconButton
                          label="Open menu"
                          variant="key"
                          onClick={toggleMenu}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                          </svg>
                        </IconButton>

                        <AnimatePresence>
                          {showMenu && (
                            <motion.div
                              className="absolute right-0 top-[calc(100%+10px)] z-10 flex w-75 flex-col gap-0.5 rounded-xl border border-solid border-line bg-vellum p-2.5 shadow-float max-md:w-70"
                              variants={menuVariants}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                            >
                              {user && (
                                <div className="mb-1.5 flex items-center gap-3 border-0 border-b border-solid border-line px-3 pb-3 pt-1.5">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-solid border-verdi/30 bg-sage/40 font-display text-[16px] font-semibold text-verdi">
                                    {user.email
                                      ? user.email.charAt(0).toUpperCase()
                                      : "?"}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="mb-0.5 text-[14px] font-semibold text-ink">
                                      {user.user_metadata?.full_name ||
                                        user.email?.split("@")[0] ||
                                        "User"}
                                    </div>
                                    <div className="max-w-45 overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-muted">
                                      {user.email}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <motion.button
                                className={`${MENU_BTN} relative`}
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
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                  <polyline points="2 17 12 22 22 17"></polyline>
                                  <polyline points="2 12 12 17 22 12"></polyline>
                                </svg>
                                <p className={MENU_BTN_TEXT}>Review</p>
                                {dueCount > 0 && (
                                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-full border border-solid border-gold-deep/40 bg-gold px-1.5 font-mono text-[10.5px] font-bold text-ink">
                                    <span
                                      className="text-[8px]"
                                      aria-hidden="true"
                                    >
                                      ✦
                                    </span>
                                    {dueCount}
                                  </span>
                                )}
                              </motion.button>

                              <motion.button
                                className={MENU_BTN}
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
                                  strokeWidth="1.75"
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
                                  className={MENU_BTN}
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
                                    strokeWidth="1.75"
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
                                className={MENU_BTN}
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
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle cx="12" cy="12" r="10"></circle>
                                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                  <line
                                    x1="12"
                                    y1="17"
                                    x2="12.01"
                                    y2="17"
                                  ></line>
                                </svg>
                                <p className={MENU_BTN_TEXT}>Support</p>
                              </motion.button>

                              <div className={`my-1 ${UI.rule}`} />

                              <motion.button
                                className={MENU_BTN}
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
                                  strokeWidth="1.75"
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
                                className={MENU_BTN_DANGER}
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
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M3 6h18"></path>
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                                <p className={MENU_BTN_TEXT}>Delete Account</p>
                              </motion.button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>

                  {/* The dashboard stays rendered; "create class" floats above
                      it as a Modal plate (AddClassForm renders the kit Modal -
                      scrim, Escape, and scroll-lock included). */}
                  {renderClassesGrid()}
                  {showAddForm && (
                    <AddClassForm
                      onClassCreated={handleAddClass as any}
                      onCancel={() => setShowAddForm(false)}
                    />
                  )}
                  {editingClass && (
                    <AddClassForm
                      isEditing
                      initialData={editingClass as any}
                      onClassUpdated={handleUpdateClassInline as any}
                      onCancel={() => setEditingClass(null)}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Add chat component with AnimatePresence for smooth transitions */}
      <AnimatePresence>
        {chatOpen && (
          <Suspense fallback={<LoadingSignal label="Opening the chat" />}>
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
          <Suspense fallback={<LoadingSignal label="Tuning in" />}>
            <TalkComponent isOpen={talkOpen} onClose={handleCloseTalk} />
          </Suspense>
        )}
      </AnimatePresence>

      {!selectedClass && hasLoaded && (
        <motion.div
          className="pointer-events-none fixed bottom-0 left-0 z-100 flex w-full justify-center px-4 pb-7 max-md:p-3.75 max-[480px]:p-3"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...spring.gentle, delay: 0.5 }}
        >
          {/* The instrument dock - one floating vellum pill holding both AI keys.
              Hover lift is framer's (doctrine: CSS never animates transform). */}
          <motion.div
            className="pointer-events-auto flex items-center gap-1 rounded-full border border-solid border-line bg-vellum/95 p-1.5 shadow-float backdrop-blur-[2px] max-[480px]:gap-0.5 max-[480px]:p-1"
            whileHover={{ y: -2, transition: spring.lift }}
          >
            <motion.button
              className={AI_BTN}
              onClick={() => handleChatWithAI((selectedClass as any)?.id)}
              {...keyPress}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              Chat with AI
            </motion.button>

            {/* Hairline divider between the two instruments. */}
            <span className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />

            <motion.button
              className={AI_BTN}
              onClick={() => {
                handleTalkWithAI();
              }}
              {...keyPress}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
              Talk with AI
            </motion.button>
          </motion.div>
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

      {/* Account delete failure dialog - friendly, never shows the raw error */}
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
