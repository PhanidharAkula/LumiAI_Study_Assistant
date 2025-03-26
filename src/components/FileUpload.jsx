import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import "./FileUpload.css";

const FileUpload = ({ classId, onUploadComplete, checkAuth = () => true }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [bucketExists, setBucketExists] = useState(true);

  // Update useEffect to always assume bucket exists since it's been manually created
  useEffect(() => {
    // Always assume bucket exists since you've manually created it in Supabase
    setBucketExists(true);
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const createBucket = async () => {
    try {
      const { data, error } = await supabase.storage.createBucket("files", {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });

      if (error) {
        console.error("Error creating bucket:", error);
        throw error;
      }

      setBucketExists(true);
      console.log("Storage bucket created successfully");
    } catch (error) {
      console.error("Failed to create storage bucket:", error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setProgress(0);

      // Get current user for adding user_id to file record
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("Auth error during upload:", userError);
        throw new Error(`Authentication error: ${userError.message}`);
      }

      // Skip bucket check - assume it exists since you've created it manually in Supabase

      // Generate a random file name to avoid conflicts
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()
        .toString(36)
        .substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${classId}/${fileName}`;

      console.log(`Uploading file to path: ${filePath}`);

      // Upload the file to storage
      const { error: uploadError, data } = await supabase.storage
        .from("files")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log("File uploaded successfully, data:", data);

      // Get the public URL
      const urlResponse = supabase.storage.from("files").getPublicUrl(filePath);
      console.log("URL response:", urlResponse);
      const publicUrl = urlResponse.data.publicUrl;

      // Basic insert with minimal fields
      const { error: insertError } = await supabase.from("files").insert({
        class_id: classId,
        name: file.name,
        url: publicUrl,
        file_path: filePath,
        type: file.type,
      });

      if (insertError) {
        console.error("Database insert error:", insertError);
        throw new Error(`Database error: ${insertError.message}`);
      }

      console.log("File metadata saved to database");

      // Reset form and notify parent
      setFile(null);
      onUploadComplete();
    } catch (error) {
      console.error("Upload error:", error);
      setError(error.message || "Failed to upload file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const cancelUpload = () => {
    setFile(null);
    setError(null);
  };

  return (
    <div className="file-upload">
      <h3>Upload Study Material</h3>
      {error && <div className="upload-error">{error}</div>}
      {!file ? (
        <form onSubmit={handleSubmit} className="upload-form">
          <div className="file-input-container">
            <input
              type="file"
              id="file"
              onChange={handleFileChange}
              disabled={uploading}
              className="file-input"
              accept=".pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png"
            />
            <label htmlFor="file" className="file-label">
              Choose File
            </label>
            <span className="file-name">No file selected</span>
          </div>
        </form>
      ) : (
        <div className="file-selected">
          <div className="selected-file-info">
            <span className="selected-file-name">{file.name}</span>
            <span className="selected-file-size">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
          {uploading ? (
            <div className="upload-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <span className="progress-text">{progress}%</span>
            </div>
          ) : (
            <div className="upload-actions">
              <button
                onClick={cancelUpload}
                className="cancel-upload-button"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="start-upload-button"
                disabled={uploading}
              >
                Upload
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
