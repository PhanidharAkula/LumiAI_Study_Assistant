import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "./DatabaseSetup.css";

const DatabaseSetup = ({ onSetupComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const setupTables = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      // Create classes table
      const { error: classesError } = await supabase.rpc("execute_sql", {
        sql_query: `
          CREATE TABLE IF NOT EXISTS classes (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL,
            name TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
          );
        `,
      });

      if (classesError) throw classesError;

      // Create files table
      const { error: filesError } = await supabase.rpc("execute_sql", {
        sql_query: `
          CREATE TABLE IF NOT EXISTS files (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            class_id UUID NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            file_path TEXT,
            size INTEGER,
            type TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
          );
        `,
      });

      if (filesError) throw filesError;

      setSuccess(true);
      onSetupComplete && onSetupComplete();
    } catch (error) {
      console.error("Database setup error:", error);
      setError(`Setup failed: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="db-setup-container">
      <div className="db-setup-card">
        <h2>Database Setup Required</h2>
        <p>
          It looks like your database tables haven't been set up yet. Click the
          button below to create the necessary tables for your application.
        </p>

        {error && <div className="db-setup-error">{error}</div>}
        {success && (
          <div className="db-setup-success">
            Database setup completed successfully!
          </div>
        )}

        <button
          onClick={setupTables}
          className="db-setup-button"
          disabled={loading}
        >
          {loading ? "Setting Up..." : "Set Up Database Tables"}
        </button>

        <div className="db-setup-note">
          Note: You need proper database permissions to complete this action.
        </div>
      </div>
    </div>
  );
};

export default DatabaseSetup;
