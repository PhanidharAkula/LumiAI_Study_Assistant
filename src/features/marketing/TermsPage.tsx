import LegalLayout from "./LegalLayout";

const TermsPage = () => {
  return (
    <LegalLayout>
      <h1>Terms of Service</h1>
      <p className="text-muted! text-[0.95rem] mb-8!">
        Last updated: May 26, 2026
      </p>

      <p>
        These Terms of Service ("Terms") govern your use of Lumi AI (the
        "Service") at studywithlumi.com. By using the Service, you agree to
        these Terms. If you do not agree, please do not use the Service.
      </p>

      <h2>The Service</h2>
      <p>
        Lumi AI is an AI-powered study assistant that helps you organize study
        materials and generate explanations, quizzes, and flashcards.
      </p>

      <h2>Your account</h2>
      <p>
        You sign in using Google. You are responsible for the activity under
        your account and for keeping your Google account secure.
      </p>

      <h2>Your content</h2>
      <p>
        You retain ownership of the classes, files, notes, and other content you
        upload or create ("Your Content"). You grant us a limited license to
        store and process Your Content solely to operate and provide the Service
        to you. You are responsible for ensuring you have the rights to any
        content you upload.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>upload or share unlawful, infringing, or harmful content;</li>
        <li>
          attempt to disrupt, reverse engineer, or gain unauthorized access to
          the Service;
        </li>
        <li>misuse the Service in any way that violates applicable law.</li>
      </ul>

      <h2>AI-generated content</h2>
      <p>
        Study features are powered by AI and may produce inaccurate or
        incomplete information. AI output is provided for study assistance only
        and is not professional, legal, medical, or academic advice. Always
        verify important information and follow your institution&apos;s
        academic-integrity policies.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The Service, including its software, design, and branding, is owned by
        Lumi AI and protected by applicable laws. These Terms do not grant you
        any rights to our trademarks or branding.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the Service and delete your account at any time. We
        may suspend or terminate access if you violate these Terms or to protect
        the Service and its users.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The Service is provided on an &quot;as is&quot; and &quot;as
        available&quot; basis, without warranties of any kind, to the fullest
        extent permitted by law.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Lumi AI will not be liable for
        any indirect, incidental, or consequential damages arising from your use
        of the Service.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the
        Service after changes take effect means you accept the updated Terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Email us at{" "}
        <a href="mailto:support@studywithlumi.com">support@studywithlumi.com</a>
        .
      </p>
    </LegalLayout>
  );
};

export default TermsPage;
