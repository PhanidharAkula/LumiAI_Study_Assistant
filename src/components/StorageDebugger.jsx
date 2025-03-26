import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { testStorageBucket } from "../utils/storageDebugger";
import "./StorageDebugger.css";

const StorageDebugger = () => {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    const testResults = await testStorageBucket();
    setResults(testResults);
    setLoading(false);
  };

  const fixBucket = async () => {
    setLoading(true);
    try {
      // Create the files bucket
      const { error } = await supabase.storage.createBucket("files", {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });

      if (error) throw error;

      // Run the test again to verify
      const testResults = await testStorageBucket();
      setResults({
        ...testResults,
        message: "Bucket creation attempted. See results for status.",
      });
    } catch (error) {
      setResults({
        success: false,
        error: `Failed to create bucket: ${error.message}`,
        fixAttempted: true,
      });
    }
    setLoading(false);
  };

  const reload = () => {
    window.location.reload();
  };

  return (
    <div className="storage-debugger">
      <h2>Storage Debugger</h2>

      <div className="debug-actions">
        <button onClick={runTest} disabled={loading}>
          {loading ? "Running..." : "Test Storage"}
        </button>
        <button onClick={fixBucket} disabled={loading}>
          {loading ? "Running..." : "Attempt Fix"}
        </button>
        <button onClick={reload}>Reload Page</button>
      </div>

      {results && (
        <div className={`results ${results.success ? "success" : "error"}`}>
          <h3>Test Results:</h3>
          <pre>{JSON.stringify(results, null, 2)}</pre>

          {!results.success && (
            <div className="error-help">
              <h4>Troubleshooting Tips:</h4>
              <ul>
                <li>Check your browser console for detailed logs</li>
                <li>
                  Verify the bucket named "files" exists in your Supabase
                  dashboard
                </li>
                <li>
                  Ensure policies are set up correctly as mentioned in the
                  documentation
                </li>
                <li>Try clearing your browser cache and reloading</li>
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="manual-instructions">
        <h3>Manual Setup Instructions:</h3>
        <ol>
          <li>
            Open the{" "}
            <a href="https://app.supabase.com" target="_blank" rel="noreferrer">
              Supabase Dashboard
            </a>
          </li>
          <li>Select your project</li>
          <li>Go to "Storage" in the left sidebar</li>
          <li>Verify that a bucket named "files" exists (case sensitive)</li>
          <li>
            If it doesn't exist, click "New Bucket", enter "files" and check
            "Public"
          </li>
          <li>After creating the bucket, click on "Policies" tab</li>
          <li>
            Create the 4 policies as described in our previous instructions
          </li>
          <li>After completing setup, reload the page</li>
        </ol>
      </div>
    </div>
  );
};

export default StorageDebugger;
