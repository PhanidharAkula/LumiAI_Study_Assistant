import LegalLayout from "./LegalLayout";

const PrivacyPage = () => {
  return (
    <LegalLayout>
      <h1>Privacy Policy</h1>
      <p className="text-muted! text-[0.95rem] mb-8!">
        Last updated: May 26, 2026
      </p>

      <p>
        LumiAI ("LumiAI", "we", "us", or "our") operates the LumiAI study
        assistant at studywithlumi.com (the "Service"). This Privacy Policy
        explains what information we collect, how we use it, and the choices you
        have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> When you sign in with Google, we
          receive your name, email address, and profile picture from your Google
          account.
        </li>
        <li>
          <strong>Content you create.</strong> The classes, uploaded files and
          documents, notes, chat and conversation history, quizzes, and
          flashcards you create or generate in the Service.
        </li>
        <li>
          <strong>Approximate region.</strong> We derive a coarse region (for
          example, your continent) from your browser time zone for analytics and
          to organize the admin dashboard. We do not collect precise location.
        </li>
        <li>
          <strong>Usage and device data.</strong> Standard technical information
          such as browser type and basic interaction logs needed to operate and
          secure the Service.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To provide, maintain, and improve the Service.</li>
        <li>
          To generate AI-powered study features (chat answers, quizzes, and
          flashcards) from the materials and questions you provide.
        </li>
        <li>To secure the Service and prevent abuse.</li>
        <li>To respond to your support requests and account questions.</li>
      </ul>

      <h2>AI processing</h2>
      <p>
        To power study features, the questions and study materials you submit
        are processed by trusted third-party AI service providers solely to
        generate responses for you, under their applicable data-processing and
        confidentiality terms. We do not use your content to train our own
        models.
      </p>

      <h2>How your information is stored and shared</h2>
      <ul>
        <li>
          Your data is stored using reputable third-party cloud infrastructure
          providers that host our database, file storage, and application.
        </li>
        <li>We do not sell your personal information.</li>
        <li>
          We share data only with service providers (such as hosting and AI
          processing providers) as needed to operate the Service, or where
          required by law.
        </li>
      </ul>

      <h2>Data retention and deletion</h2>
      <p>
        We retain your information for as long as your account is active. You
        can delete your account at any time from within the app. Deleting your
        account permanently removes your classes, files, notes, conversations,
        quizzes, flashcards, and profile from our systems.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct,
        export, or delete your personal information. To make a request, contact
        us at support@studywithlumi.com.
      </p>

      <h2>Children&apos;s privacy</h2>
      <p>
        The Service is not directed to children under 13 (or the minimum age
        required in your jurisdiction), and we do not knowingly collect their
        personal information.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will
        revise the &quot;Last updated&quot; date above.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about this policy? Email us at{" "}
        <a href="mailto:support@studywithlumi.com">support@studywithlumi.com</a>
        .
      </p>
    </LegalLayout>
  );
};

export default PrivacyPage;
