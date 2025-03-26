import { useState } from "react";
import { Link } from "react-router-dom";
import AddClassForm from "./AddClassForm";
import DatabaseSetup from "./DatabaseSetup";
import "./ClassList.css";

const ClassList = ({ classes, loading, error, onClassCreated }) => {
  const [showAddForm, setShowAddForm] = useState(false);

  if (loading) {
    return <div className="loading-spinner">Loading classes...</div>;
  }

  // Check if error contains database setup issues
  const needsDatabaseSetup =
    error &&
    (error.includes("relation") ||
      error.includes("not exist") ||
      error.includes("Database setup issue"));

  if (needsDatabaseSetup) {
    return <DatabaseSetup onSetupComplete={onClassCreated} />;
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">{error}</div>
        <button onClick={onClassCreated} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="class-list-container">
      <div className="class-list-header">
        <h1>My Classes</h1>
        <button
          className="add-class-button"
          onClick={() => setShowAddForm(true)}
        >
          Add Class
        </button>
      </div>

      {showAddForm && (
        <AddClassForm
          onSuccess={() => {
            onClassCreated();
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {classes.length === 0 ? (
        <div className="empty-classes">
          <p>You don't have any classes yet.</p>
          <button onClick={() => setShowAddForm(true)} className="start-button">
            Create your first class
          </button>
        </div>
      ) : (
        <div className="class-grid">
          {classes.map((classItem) => (
            <Link
              to={`/dashboard/class/${classItem.id}`}
              className="class-card"
              key={classItem.id}
            >
              <div className="class-card-content">
                <h3>{classItem.name}</h3>
                <p className="class-date">
                  Created: {new Date(classItem.created_at).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClassList;
