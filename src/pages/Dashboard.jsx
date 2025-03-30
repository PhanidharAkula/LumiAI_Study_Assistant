import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import ClassDetails from "../components/ClassDetails";
import AddClassForm from "../components/AddClassForm";
import ConfirmDialog from "../components/ConfirmDialog";
import "./Dashboard.css";

const Dashboard = ({ session }) => {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [user, setUser] = useState(null);
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

    if (!hasInitialFetch.current || session?.user?.id !== user?.id) {
      fetchClasses();
      hasInitialFetch.current = true;
    } else {
      setLoading(false);
    }

    return () => {
      isMounted.current = false;
    };
  }, [session]);

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
        navigate("/login");
        return;
      }

      setUser(user);

      const { data, error } = await supabase
        .from("classes")
        .select("*")
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
    setClasses((prev) => [newClass, ...prev]);
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

  const handleBackToClasses = () => {
    setSelectedClass(null);
    navigate("", { replace: true });
  };

  const toggleMenu = () => {
    setShowMenu(!showMenu);
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
                    onCancelEdit={() => setIsEditing(false)}
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
                      <Link to={"./dashboard"} className="link">
                        <h1>My Classes</h1>
                      </Link>
                    </div>
                    <div className="header-right">
                      {classes.length > 0 && (
                        <motion.button
                          className="add-class-button"
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
                      )}

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
                                <div className="user-profile">
                                  <div className="user-avatar">
                                    {user.email
                                      ? user.email.charAt(0).toUpperCase()
                                      : "?"}
                                  </div>
                                  <div className="user-details">
                                    <div className="user-name">
                                      {user.user_metadata?.full_name ||
                                        "Phanidhar Akula"}
                                    </div>
                                    <div className="user-email">
                                      {user.email}
                                    </div>
                                  </div>
                                </div>
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

      <div className="dashboard-background-container">
        <motion.div
          custom={{ rotate: 45, x: -40, y: 40 }}
          variants={bgVariants}
          initial="hidden"
          animate="visible"
          className="dashboard-background dashboard-background1"
        />

        <motion.div
          custom={{ rotate: -45, x: 40, y: 40, opacity: 0.2 }}
          variants={bgVariants}
          initial="hidden"
          animate="visible"
          className="dashboard-background dashboard-background2"
        />
      </div>

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
    </>
  );
};

export default Dashboard;
