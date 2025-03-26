import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getFileUrl } from "../lib/storageHelpers";
import FileUpload from "./FileUpload";
import ChatInterface from "./ChatInterface";
import StorageSetup from "./StorageSetup";
import StorageDebugger from "./StorageDebugger";
import "./ClassDetail.css";
import { resetDatabaseSecurity } from "../utils/emergencyFix";
import AdminNotice from "./AdminNotice";
import { ensureFilesBucketExists } from "../utils/bucketChecker";

const ClassDetail = () => {
  const { id } = useParams();
  const [classData, setClassData] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [storageReady, setStorageReady] = useState(true);
  const [activeTab, setActiveTab] = useState("files");
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    fetchClassData();
    fetchFiles();
  }, [id]);

  async function fetchClassData() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      setClassData(data);
    } catch (error) {
      console.error("Error fetching class data:", error);
      setError("Failed to load class details");
    } finally {
      setLoading(false);
    }
  }

  async function fetchFiles() {
    try {
      const { data, error } = await supabase
        .from("files")
        .select("*")
        .eq("class_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setFiles(data || []);
    } catch (error) {
      console.error("Error fetching files:", error);
      setError("Failed to load files");
    }
  }

  const handleFileUploadComplete = () => {
    fetchFiles();
    setShowUploadForm(false);
  };

  const handleFileClick = (file) => {
    console.log("File selected:", file);

    try {
      const {
        data: { publicUrl },
      } = supabase.storage.from("files").getPublicUrl(file.file_path);

      setSelectedFile({
        ...file,
        url: publicUrl,
      });
    } catch (error) {
      console.error("Error getting file URL:", error);
      setSelectedFile(file);
    }
  };

  const handleDeleteFile = async (fileId, filePath) => {
    try {
      if (filePath) {
        const { error: storageError } = await supabase.storage
          .from("files")
          .remove([filePath]);

        if (storageError) throw storageError;
      }

      const { error } = await supabase.from("files").delete().eq("id", fileId);

      if (error) throw error;

      fetchFiles();

      setDeleteConfirmation(null);
      if (selectedFile && selectedFile.id === fileId) {
        setSelectedFile(null);
      }
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("Failed to delete file. Please try again.");
    }
  };

  const closeFilePreview = () => {
    setSelectedFile(null);
  };

  const checkAuth = async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        console.error("Authentication error:", error);
        setAuthError("You must be logged in to upload files");
        return false;
      }

      return true;
    } catch (err) {
      console.error("Auth check failed:", err);
      setAuthError("Authentication verification failed");
      return false;
    }
  };

  if (loading) {
    return <div className="loading">Loading class details...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!classData) {
    return <div className="not-found">Class not found</div>;
  }

  return (
    <div className="class-detail">
      <div className="class-header">
        <Link to="/dashboard" className="back-button">
          ← Back to classes
        </Link>
        <h1>{classData.name}</h1>
      </div>

      <div className="class-tabs">
        <button
          className={`tab-button ${activeTab === "files" ? "active" : ""}`}
          onClick={() => setActiveTab("files")}
        >
          Files
        </button>
        <button
          className={`tab-button ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          Chat with AI
        </button>
      </div>

      {activeTab === "files" ? (
        <div className="file-section">
          <div className="section-header">
            <h2>Study Materials</h2>
            <button
              className="upload-button"
              disabled={!storageReady}
              onClick={() => setShowUploadForm(!showUploadForm)}
            >
              {showUploadForm ? "Cancel Upload" : "Upload File"}
            </button>
          </div>

          {showUploadForm && storageReady && (
            <FileUpload
              classId={id}
              onUploadComplete={handleFileUploadComplete}
              checkAuth={checkAuth}
            />
          )}

          {authError && <div className="error">{authError}</div>}

          {files.length === 0 ? (
            <div className="empty-files">
              <p>No files uploaded yet</p>
              <button
                className="start-upload-button"
                onClick={() => setShowUploadForm(true)}
                disabled={!storageReady}
              >
                Upload your first file
              </button>
            </div>
          ) : (
            <div className="file-list">
              {files.map((file) => (
                <div key={file.id} className="file-item">
                  <div
                    className="file-name"
                    onClick={() => handleFileClick(file)}
                  >
                    {file.name}
                  </div>
                  <div className="file-actions">
                    <button
                      className="file-action"
                      onClick={() => handleFileClick(file)}
                    >
                      View
                    </button>
                    {deleteConfirmation === file.id ? (
                      <>
                        <button
                          className="file-action delete-confirm"
                          onClick={() =>
                            handleDeleteFile(file.id, file.file_path)
                          }
                        >
                          Confirm
                        </button>
                        <button
                          className="file-action delete-cancel"
                          onClick={() => setDeleteConfirmation(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="file-action delete"
                        onClick={() => setDeleteConfirmation(file.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="chat-section">
          <h2>Chat with Lumi AI</h2>
          <div className="chat-container">
            <ChatInterface classId={id} files={files} />
          </div>
        </div>
      )}

      {selectedFile && (
        <div className="file-preview-overlay">
          <div className="file-preview-container">
            <div className="preview-header">
              <h3>{selectedFile.name}</h3>
              <button className="close-preview" onClick={closeFilePreview}>
                &times;
              </button>
            </div>
            <div className="preview-content">
              {(() => {
                try {
                  if (selectedFile.type?.startsWith("image/")) {
                    return (
                      <img
                        src={selectedFile.url}
                        className="preview-image"
                        alt={selectedFile.name}
                        onError={(e) => {
                          console.error("Image load error:", e);
                          e.target.onerror = null;
                          e.target.src =
                            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23ccc' d='M21 5v14h-18v-14h18m0-2h-18a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-14a2 2 0 0 0-2-2z'/%3E%3Cpath fill='%23ccc' d='M8.5 13.5l2.5 3 3.5-4.5 4.5 6h-14z'/%3E%3C/svg%3E";
                        }}
                      />
                    );
                  } else if (selectedFile.type === "application/pdf") {
                    return (
                      <iframe
                        src={selectedFile.url}
                        className="preview-pdf"
                        title={selectedFile.name}
                        onError={(e) => console.error("PDF load error:", e)}
                      />
                    );
                  } else {
                    return (
                      <div className="preview-fallback">
                        <p>Preview not available for this file type.</p>
                        <p className="file-url-debug">
                          URL: {selectedFile.url}
                        </p>
                        <a
                          href={selectedFile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="download-link"
                        >
                          Download File
                        </a>
                      </div>
                    );
                  }
                } catch (error) {
                  console.error("Preview rendering error:", error);
                  return (
                    <div className="preview-error">
                      Error loading preview: {error.message}
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassDetail;
