import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Sidebar from "../components/Sidebar";
import ClassList from "../components/ClassList";
import ClassDetail from "../components/ClassDetail";
import "./Dashboard.css";

const Dashboard = ({ session }) => {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (session && session.user) {
      fetchClasses();
    }
  }, [session]);

  async function fetchClasses() {
    try {
      setLoading(true);
      setError(null);

      console.log("Fetching classes for user:", session.user.id);

      // Verify if the classes table exists first
      const { error: tableError } = await supabase
        .from("classes")
        .select("count")
        .limit(1)
        .throwOnError();

      if (tableError) {
        console.error("Table check error:", tableError);
        // Table might not exist, let's try to create it
        await createClassesTable();
      }

      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fetch classes error details:", error);
        throw error;
      }

      console.log("Classes fetched successfully:", data);
      setClasses(data || []);
    } catch (error) {
      console.error("Error fetching classes:", error);
      setError(`Failed to load classes: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  async function createClassesTable() {
    try {
      // We'll use SQL to create the table if it doesn't exist
      const { error } = await supabase.rpc(
        "create_classes_table_if_not_exists"
      );

      if (error) {
        console.error("Error creating classes table:", error);
        throw error;
      }

      console.log("Classes table created or already exists");
    } catch (error) {
      console.error("Failed to create classes table:", error);
      throw new Error("Database setup issue. Please contact support.");
    }
  }

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <div className="dashboard-container">
      <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
        {mobileMenuOpen ? "×" : "☰"}
      </button>

      <Sidebar
        session={session}
        className={mobileMenuOpen ? "mobile-open" : ""}
      />

      <main className="dashboard-content">
        <Routes>
          <Route
            path="/"
            element={
              <ClassList
                classes={classes}
                loading={loading}
                error={error}
                onClassCreated={fetchClasses}
              />
            }
          />
          <Route path="/class/:id" element={<ClassDetail />} />
        </Routes>
      </main>
    </div>
  );
};

export default Dashboard;
