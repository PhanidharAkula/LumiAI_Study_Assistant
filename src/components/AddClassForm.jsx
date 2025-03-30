import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import "./AddClassForm.css";

const AddClassForm = ({
  onCancel,
  onClassCreated,
  isEditing = false,
  initialData = { name: "" },
  onClassUpdated,
}) => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isEditing && initialData) {
      setName(initialData.name);
    }
  }, [isEditing, initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Class name is required");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("You must be logged in");

      if (isEditing) {
        // Update existing class
        if (onClassUpdated) {
          onClassUpdated({
            ...initialData,
            name: name.trim(),
          });
        }
      } else {
        // Create new class
        const { data, error: insertError } = await supabase
          .from("classes")
          .insert([
            {
              name: name.trim(),
              user_id: user.id,
            },
          ])
          .select();

        if (insertError) throw insertError;

        if (typeof onClassCreated === "function") {
          onClassCreated(data[0]);
        } else {
          console.warn("onClassCreated is not a function or not provided");
        }
      }
    } catch (error) {
      console.error(
        `Error ${isEditing ? "updating" : "creating"} class:`,
        error
      );
      setError(
        `Failed to ${isEditing ? "update" : "create"} class: ${
          error.message || "Unknown error"
        }`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="add-class-form-container">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        exit={{ opacity: 0, y: 30 }}
        className="add-class-form"
        style={{ marginTop: isEditing ? "200px" : "0" }}
      >
        <p className="form-title-text">
          {isEditing ? "Edit Class" : "Create New Class"}
        </p>

        {error && (
          <motion.div
            className="form-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-text" htmlFor="className">
              Class Name
            </label>
            <input
              className="form-input"
              id="className"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter class name"
              required
              autoFocus
            />
          </div>

          <div className="form-actions">
            <motion.button
              type="button"
              className="cancel-button"
              onClick={onCancel}
              disabled={isSubmitting}
              whileHover={{
                scale: 1.03,
                y: -3,
                transition: { type: "spring", stiffness: 300, damping: 5 },
              }}
              whileTap={{ scale: 0.98 }}
            >
              Cancel
            </motion.button>

            <motion.button
              type="submit"
              className="submit-button"
              disabled={isSubmitting || !name.trim()}
              whileHover={{
                scale: 1.03,
                y: -3,
                transition: { type: "spring", stiffness: 300, damping: 5 },
              }}
              whileTap={{ scale: 0.98 }}
            >
              {isSubmitting
                ? isEditing
                  ? "Saving..."
                  : "Creating..."
                : isEditing
                ? "Save Changes"
                : "Create Class"}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddClassForm;
