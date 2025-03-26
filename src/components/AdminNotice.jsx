import { useState } from "react";
import "./AdminNotice.css";

const AdminNotice = () => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <div className="admin-notice">
      <div className="admin-notice-content">
        <h3>Administrator Notice</h3>
        <p>
          The storage bucket "files" needs to be created in the Supabase
          dashboard. Please follow these steps:
        </p>
        <ol>
          <li>
            Go to the{" "}
            <a href="https://app.supabase.com" target="_blank" rel="noreferrer">
              Supabase Dashboard
            </a>
          </li>
          <li>Select your project</li>
          <li>Go to "Storage" in the left sidebar</li>
          <li>Click "Create bucket"</li>
          <li>Name it exactly "files" (without quotes)</li>
          <li>Check "Public bucket"</li>
          <li>Click "Create bucket"</li>
        </ol>
        <button className="dismiss-button" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default AdminNotice;
