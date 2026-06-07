import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";

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

  useEffect(() => {
    if (isEditing && initialData) {
      setName(initialData.name);
    }
  }, [isEditing, initialData]);

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
    <div className="flex h-[70dvh] w-full items-center justify-center max-md:px-3 max-md:py-6 max-[480px]:px-2.5 max-[480px]:py-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        exit={{ opacity: 0, y: 30 }}
        className="flex w-full flex-col items-center justify-center gap-5 rounded-[10px] bg-white p-[30px] max-md:max-w-[560px] max-md:items-stretch max-md:gap-3.5 max-md:p-5 max-[480px]:max-w-[420px] max-[480px]:rounded-lg max-[480px]:p-4"
        style={{ marginTop: isEditing ? "200px" : "0" }}
      >
        <p className="text-[x-large] font-semibold max-md:text-center max-md:text-[1.15rem] max-[480px]:text-[1.05rem]">
          {isEditing ? "Edit Class" : "Create New Class"}
        </p>

        {error && (
          <motion.div
            className="rounded-[10px] border-[1.5px] border-solid border-[#EF4444] bg-[#FEE2E2] p-3 text-center font-medium text-[#B91C1C]"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            {error}
          </motion.div>
        )}

        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="w-full max-w-[500px] max-md:max-w-full">
            <label
              className="mb-2 block font-semibold text-ink"
              htmlFor="className"
            >
              Class Name
            </label>
            <input
              className="block w-[600px] max-w-[500px] appearance-none rounded-[10px] border-[1.5px] border-solid border-ink bg-sage px-[15px] py-3 text-[16px] text-ink shadow-none [transition:all_0.2s_ease-in-out] placeholder:text-ink placeholder:opacity-60 focus:border-ink focus:outline-none max-md:w-full max-md:max-w-full max-md:px-3 max-md:py-2.5 max-md:text-[15px]"
              id="className"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter class name"
              required
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-5 max-md:gap-3 max-[480px]:gap-2.5">
            <motion.button
              type="button"
              className="rounded-full border-[1.5px] border-solid border-ink bg-white px-[30px] py-3 text-[medium] font-medium shadow-[0px_2px_0_#000] [transition:none] disabled:opacity-70 max-md:px-5 max-md:py-2.5 max-md:text-[small] max-[480px]:px-[15px] max-[480px]:py-2.5"
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
              className="min-w-[160px] rounded-full border-[1.5px] border-solid border-ink bg-sage px-[30px] py-3 text-[medium] font-medium shadow-[0px_2px_0_#000] [transition:none] disabled:opacity-70 max-md:px-5 max-md:py-2.5 max-md:text-[small] max-[480px]:min-w-0 max-[480px]:px-[15px] max-[480px]:py-2.5"
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
