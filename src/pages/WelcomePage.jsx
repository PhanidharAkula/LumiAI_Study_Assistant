import { Link } from "react-router-dom";
import "./WelcomePage.css";

const WelcomePage = () => {
  return (
    <div className="welcome-container">
      <header className="welcome-header">
        <h1>Lumi AI</h1>
        <p className="tagline">Your AI Study Assistant</p>

        <div className="auth-buttons">
          <Link to="/login" className="btn btn-primary">
            Login
          </Link>
          <Link to="/signup" className="btn btn-secondary">
            Sign Up
          </Link>
        </div>
      </header>

      <section className="features-section">
        <h2>Enhance Your Learning Experience</h2>

        <div className="features-grid">
          <div className="feature-card">
            <h3>Smart Summarization</h3>
            <p>
              Upload your study materials and get AI-generated concise summaries
            </p>
          </div>

          <div className="feature-card">
            <h3>Study Chat</h3>
            <p>
              Ask questions about your materials and get intelligent responses
            </p>
          </div>

          <div className="feature-card">
            <h3>Automated Flashcards</h3>
            <p>Generate study flashcards from your notes with one click</p>
          </div>

          <div className="feature-card">
            <h3>Quiz Generation</h3>
            <p>Create customized quizzes to test your knowledge</p>
          </div>
        </div>
      </section>

      <footer className="welcome-footer">
        <p>&copy; 2023 Lumi AI. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default WelcomePage;
