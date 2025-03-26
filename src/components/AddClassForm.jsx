import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "./AddClassForm.css";

const AddClassForm = ({ onSuccess, onCancel }) => {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Class name is required");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error: insertError } = await supabase
        .from("classes")
        .insert([{ name, user_id: user.id }])
        .select();

      if (insertError) throw insertError;

      onSuccess(data);
    } catch (error) {
      console.error("Error creating class:", error);
      setError("Failed to create class. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-class-form">
      <h2>Add New Class</h2>

      {error && <div className="form-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="className">Class Name</label>
          <input
            id="className"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter class name"
            disabled={loading}
            autoFocus
          />
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={onCancel}
            className="cancel-button"
            disabled={loading}
          >
            Cancel
          </button>

          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? "Creating..." : "Create Class"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddClassForm;
