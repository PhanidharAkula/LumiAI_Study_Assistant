import { useEffect, useState, useRef } from "react";
import { motion, useAnimation } from "framer-motion";
import { fetchAIResponse } from "../services/aiService";
import "./TalkComponent.css";

const TalkComponent = ({
  isOpen = true,
  onClose = () => {},
  _initialClassId = null,
}) => {
  const [voices, setVoices] = useState([]);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);

  const synthRef = useRef(
    typeof window !== "undefined" ? window.speechSynthesis : null
  );
  const recognitionRef = useRef(null);
  const abortControllerRef = useRef(null);
  const conversationHistoryRef = useRef([]);
  const circleControls = useAnimation();
  const animationFrameRef = useRef(null);
  const currentUtteranceRef = useRef(null);

  // Cleanup on unmount or page refresh
  useEffect(() => {
    return () => {
      // Stop everything when component unmounts
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        } catch {}
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (synthRef.current) synthRef.current.cancel();
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Animate circle with dynamic pulsing based on speech or thinking
  useEffect(() => {
    if (speaking) {
      const animatePulse = () => {
        const randomScale = 1.05 + Math.random() * 0.15;
        circleControls.start({
          scale: randomScale,
          transition: {
            duration: 0.12 + Math.random() * 0.08,
            ease: "easeOut",
          },
        });
        animationFrameRef.current = setTimeout(
          animatePulse,
          120 + Math.random() * 80
        );
      };
      animatePulse();
    } else if (thinking) {
      // Gentle pulsing while thinking
      const animateThinking = () => {
        circleControls.start({
          scale: [1, 1.08, 1],
          transition: { duration: 1.2, ease: "easeInOut", repeat: Infinity },
        });
      };
      animateThinking();
    } else {
      if (animationFrameRef.current) clearTimeout(animationFrameRef.current);
      circleControls.start({ scale: 1, transition: { duration: 0.3 } });
    }
    return () => {
      if (animationFrameRef.current) clearTimeout(animationFrameRef.current);
    };
  }, [speaking, thinking, circleControls]);

  useEffect(() => {
    const loadVoices = () => {
      const all = synthRef.current?.getVoices?.() || [];
      const preferred = [
        "google",
        "enhanced",
        "premium",
        "neural",
        "natural",
        "samantha",
        "alex",
        "karen",
        "daniel",
        "en-us",
        "en-gb",
      ];
      const lower = (s) => (s || "").toLowerCase();
      const scored = all
        .map((v) => ({
          v,
          score: preferred.reduce(
            (acc, p) =>
              acc +
              (lower(v.name).includes(p) || lower(v.lang).includes(p) ? 2 : 0),
            0
          ),
        }))
        .sort((a, b) => b.score - a.score || (a.v.name > b.v.name ? 1 : -1))
        .map((s) => s.v);

      // Remove duplicates by voice name
      const uniqueVoices = [];
      const seenNames = new Set();
      for (const voice of scored) {
        if (!seenNames.has(voice.name)) {
          seenNames.add(voice.name);
          uniqueVoices.push(voice);
        }
      }

      const top5 = uniqueVoices.length
        ? uniqueVoices.slice(0, 5)
        : all.slice(0, 5);
      setVoices(top5);
    };
    loadVoices();
    if (synthRef.current) {
      synthRef.current.onvoiceschanged = loadVoices;
    }
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (synthRef.current) synthRef.current.onvoiceschanged = null;
    };
  }, []);

  // Load saved voice index from localStorage
  useEffect(() => {
    const savedVoiceIndex = localStorage.getItem("lumiTalkVoiceIndex");
    if (savedVoiceIndex !== null) {
      setVoiceIndex(parseInt(savedVoiceIndex, 10));
    }
  }, []);

  const openVoiceMenu = () => setVoiceMenuOpen((v) => !v);
  const selectVoice = (i) => {
    setVoiceIndex(i);
    setVoiceMenuOpen(false);
    // Save to localStorage
    localStorage.setItem("lumiTalkVoiceIndex", i.toString());
  };

  const speakText = (text) => {
    if (!synthRef.current || !text || muted) return;

    // Cancel any existing speech
    if (currentUtteranceRef.current) {
      synthRef.current.cancel();
    }

    try {
      const u = new SpeechSynthesisUtterance(text);
      if (voices && voices[voiceIndex]) u.voice = voices[voiceIndex];

      // Natural, comfortable speech settings
      u.rate = 1.02;
      u.pitch = 1.05;
      u.volume = 1.0;

      u.onstart = () => setSpeaking(true);
      u.onend = () => {
        setSpeaking(false);
        currentUtteranceRef.current = null;
      };
      u.onerror = (e) => {
        console.error("Speech error:", e);
        setSpeaking(false);
        currentUtteranceRef.current = null;
      };

      currentUtteranceRef.current = u;
      synthRef.current.speak(u);
    } catch (e) {
      console.error("Speech synthesis error:", e);
    }
  };

  // Continuous listening - always on when started
  const startListening = () => {
    if (muted || recognitionRef.current) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 1;

    r.onresult = (ev) => {
      const last = ev.results[ev.results.length - 1];
      if (last.isFinal) {
        const text = last[0].transcript.trim();
        if (text) {
          // User spoke - interrupt AI if speaking
          if (speaking && currentUtteranceRef.current) {
            synthRef.current.cancel();
            setSpeaking(false);
          }
          conversationHistoryRef.current.push({ role: "user", content: text });
          sendToAI(text);
        }
      }
    };

    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.error("Speech recognition error:", e);
      }
    };

    r.onend = () => {
      // Auto-restart if still active and not muted
      if (started && !muted) {
        setTimeout(() => startListening(), 100);
      }
    };

    recognitionRef.current = r;
    try {
      r.start();
    } catch (e) {
      console.error("Error starting recognition:", e);
    }
  };

  const sendToAI = async (userText) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    try {
      setThinking(true);
      // Build conversation history - pass isVoiceMode: true for natural conversation
      const response = await fetchAIResponse(
        userText,
        "",
        conversationHistoryRef.current,
        true
      );

      if (response?.text) {
        const aiText = response.text;
        conversationHistoryRef.current.push({
          role: "assistant",
          content: aiText,
        });
        setThinking(false);
        speakText(aiText);
      } else {
        setThinking(false);
      }
    } catch (e) {
      setThinking(false);
      if (e.name !== "AbortError") {
        console.error("Error getting AI response:", e);
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const startConversation = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      setStarted(true);

      // Simple, natural greeting
      const greetings = [
        "Hi! What can I help you with?",
        "Hello! How can I assist you today?",
        "Hey! What would you like to know?",
        "Hi there! What can I do for you?",
      ];

      const greeting = greetings[Math.floor(Math.random() * greetings.length)];
      conversationHistoryRef.current = [
        { role: "assistant", content: greeting },
      ];
      speakText(greeting);

      // Start listening immediately
      setTimeout(() => startListening(), 500);
    } catch (err) {
      console.error("Microphone permission denied:", err);
      alert("Microphone permission is required for voice conversation.");
    }
  };

  const handleStop = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch {}
    }
    if (synthRef.current) synthRef.current.cancel();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setSpeaking(false);
    setThinking(false);
    setStarted(false);
    conversationHistoryRef.current = [];
  };

  const toggleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);

    if (newMuted) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        } catch {}
      }
    } else {
      if (started) {
        startListening();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="talk-component">
      <div className="talk-header">
        <div className="header-left">
          {!started && (
            <div style={{ position: "relative" }}>
              <motion.button
                className="talk-voice-button"
                title={voices[voiceIndex]?.name || "Change voice"}
                onClick={openVoiceMenu}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                </svg>
                <span className="talk-voice-label">
                  {voices[voiceIndex]?.name?.substring(0, 15) || "Voice"}
                </span>
              </motion.button>
              {voiceMenuOpen && (
                <motion.div
                  className="talk-voice-menu"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {voices && voices.length ? (
                    voices.map((v, i) => (
                      <motion.button
                        key={i}
                        className={`talk-voice-menu-item ${
                          i === voiceIndex ? "active" : ""
                        }`}
                        onClick={() => selectVoice(i)}
                        whileHover={{
                          backgroundColor: "rgba(139,92,246,0.08)",
                        }}
                        whileTap={{ scale: 0.98 }}
                      >
                        {v.name}
                      </motion.button>
                    ))
                  ) : (
                    <div className="talk-voice-menu-empty">
                      No voices available
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </div>
        <div className="header-right">
          <motion.button
            className="talk-close-button"
            onClick={() => {
              handleStop();
              onClose();
            }}
            title="Close"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </motion.button>
        </div>
      </div>
      <div className="talk-body">
        {!started ? (
          <div className="talk-empty">
            <motion.div
              className="talk-empty-icon"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </motion.div>
            <h3>Talk with AI</h3>
            <p className="talk-sub">Start a natural voice conversation</p>
            <motion.button
              className="talk-start-button"
              onClick={startConversation}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              Start
            </motion.button>
          </div>
        ) : (
          <div className="talk-active">
            <motion.div
              className="talk-circle"
              animate={circleControls}
              initial={{ scale: 1 }}
            />
          </div>
        )}
      </div>

      {started && (
        <div className="talk-controls-fixed">
          <motion.button
            className={`talk-button-mute ${muted ? "muted" : ""}`}
            title={muted ? "Unmute" : "Mute"}
            onClick={toggleMute}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            {muted ? (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            ) : (
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            )}
          </motion.button>
          <motion.button
            className="talk-button-stop"
            title="End conversation"
            onClick={handleStop}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </motion.button>
        </div>
      )}
    </div>
  );
};

export default TalkComponent;
