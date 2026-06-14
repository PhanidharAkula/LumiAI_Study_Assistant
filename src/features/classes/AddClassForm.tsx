import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";
import { UI } from "@shared/components/atlas";
import { Button } from "@shared/components/controls";
import Modal from "@shared/components/Modal";
import { spring } from "@shared/motion";

interface ClassRecord {
  id?: string;
  name: string;
  [key: string]: unknown;
}

interface AddClassFormProps {
  onCancel: () => void;
  onClassCreated?: (cls: ClassRecord) => void;
  isEditing?: boolean;
  initialData?: ClassRecord;
  onClassUpdated?: (cls: ClassRecord) => void;
}

/** The create/rename-class dialog - a floating Modal plate above the page
 *  (the dashboard stays visible behind the scrim; sheet on phones). */
const AddClassForm = ({
  onCancel,
  onClassCreated,
  isEditing = false,
  initialData = { name: "" },
  onClassUpdated,
}: AddClassFormProps) => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && initialData) {
      setName(initialData.name);
    }
  }, [isEditing, initialData]);

  // The Modal moves focus to its plate on open; hand it on to the input so
  // typing can start immediately (this effect runs after Modal's, parent-last).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
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

      // Check for duplicate class names (case-insensitive) for this user
      const { data: existingClasses, error: fetchErr } = await supabase
        .from("classes")
        .select("id, name")
        .eq("user_id", user.id);

      if (fetchErr) throw fetchErr;

      const cleanName = name.trim().toLowerCase();
      const duplicate = (existingClasses || []).some((c) => {
        // when editing, ignore the current class id
        if (
          isEditing &&
          initialData &&
          initialData.id &&
          c.id === initialData.id
        )
          return false;
        return (c.name || "").trim().toLowerCase() === cleanName;
      });

      if (duplicate) {
        setError("A class with this name already exists.");
        setIsSubmitting(false);
        return;
      }

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
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        // Match the Cancel button: no dismissing mid-submit.
        if (!isSubmitting) onCancel();
      }}
      size="sm"
      sheetOnMobile
      hideClose
      overline={isEditing ? "Rename entry" : "New expedition"}
      title={isEditing ? "Rename class" : "Chart a new class"}
    >
      {error && (
        <motion.div
          className="mb-5 rounded-lg border border-solid border-vermilion/30 bg-vermilion-wash px-4 py-3 text-[14px] font-medium leading-[1.55] text-vermilion"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.plate}
        >
          {error}
        </motion.div>
      )}

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <div className="w-full">
          <label
            className={`${UI.overlineMuted} mb-2 block`}
            htmlFor="className"
          >
            Class Name
          </label>
          <input
            ref={inputRef}
            className={`${UI.input} max-md:py-2.5`}
            id="className"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter class name"
            required
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-3 max-[480px]:gap-2.5">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
            className="max-[480px]:px-5"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="min-w-40 max-[480px]:min-w-0 max-[480px]:px-5"
          >
            {isSubmitting
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
                ? "Save Changes"
                : "Create Class"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddClassForm;
