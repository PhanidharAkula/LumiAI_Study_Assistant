import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  fetchAIResponse,
  fetchStreamingResponse,
} from "../services/openaiService";
import "./TalkComponent.css";

const TalkComponent = ({
  isOpen = true,
  onClose = () => {},
  initialClassId = null,
}) => {
  const [voices, setVoices] = useState([]);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState([]); // { speaker: 'user'|'assistant', text }
  const [aiPartial, setAiPartial] = useState("");
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const utteranceRef = useRef(null);
  const synthRef = useRef(
    typeof window !== "undefined" ? window.speechSynthesis : null
  );
  const recognitionRef = useRef(null);
  const abortControllerRef = useRef(null);
  const tokenBufferRef = useRef("");
  const flushTimerRef = useRef(null);
  const aiQueueRef = useRef([]);
  const playingRef = useRef(false);

  useEffect(() => {
    // load available voices
    const loadVoices = () => {
      const all =
        (synthRef.current &&
          synthRef.current.getVoices &&
          synthRef.current.getVoices()) ||
        [];

      // Prefer high-quality English voices and pick top 5 best matches.
      const preferred = [
        "google", // Google voices (Chrome)
        "neural",
        "wave",
        "alloy",
        "alex",
        "samantha",
        "daniel",
        "en-US",
      ];

      const lower = (s) => (s || "").toLowerCase();

      // Score voices by presence of preferred substrings
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

      // Take top 5; if none match scoring, fall back to first 5 available
      const top5 = scored.length ? scored.slice(0, 5) : all.slice(0, 5);
      setVoices(top5);
    };

    loadVoices();
    if (
      synthRef.current &&
      typeof synthRef.current.onvoiceschanged !== "undefined"
    ) {
      synthRef.current.onvoiceschanged = loadVoices;
    }

    return () => {
      if (synthRef.current) synthRef.current.onvoiceschanged = null;
    };
  }, []);

  const cycleVoice = () => {
    if (!voices || voices.length === 0) return;
    setVoiceIndex((i) => (i + 1) % voices.length);
  };

  const openVoiceMenu = () => setVoiceMenuOpen((v) => !v);

  const selectVoice = (i) => {
    setVoiceIndex(i);
    setVoiceMenuOpen(false);
  };

  const speakText = (text) => {
    if (!synthRef.current) return;
    try {
      // cancel any existing speech
      const u = new SpeechSynthesisUtterance(text);
      if (voices && voices[voiceIndex]) u.voice = voices[voiceIndex];
      // Make voice slightly faster and a bit lower pitch to sound more human/robotic hybrid
      u.rate = 1.05;
      u.pitch = 0.98;
      u.onstart = () => setSpeaking(true);
      u.onend = () => {
        setSpeaking(false);
        // play next queued chunk if any
        playingRef.current = false;
        playAiQueue();
      };
      utteranceRef.current = u;
      // Queue speaking so incremental chunks don't interrupt
      aiQueueRef.current.push(u);
      playAiQueue();
    } catch (e) {
      console.error("Speech synthesis error:", e);
    }
  };

  const playAiQueue = () => {
    if (playingRef.current) return;
    const u = aiQueueRef.current.shift();
    if (!u) return;
    playingRef.current = true;
    try {
      synthRef.current.speak(u);
    } catch (e) {
      console.error("Error playing queued utterance:", e);
      playingRef.current = false;
    }
  };

  const flushTokenBuffer = () => {
    const buf = tokenBufferRef.current;
    if (!buf) return;
    tokenBufferRef.current = "";
    // append to partial AI text
    setAiPartial((p) => p + buf);
    // enqueue TTS for the buffered chunk
    speakText(buf);
  };

  const handleStart = async () => {
    // Start the voice-first conversation — user speaks first.
    setLoading(false);
    setStarted(true);
    // Immediately begin listening so the user can speak first.
    startListening();
  };

  const handleStop = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setListening(false);
    }
    if (synthRef.current) synthRef.current.cancel();
    // stop any streaming
    if (abortControllerRef.current) abortControllerRef.current.abort();
    tokenBufferRef.current = "";
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setSpeaking(false);
    // keep the session started so user can start again if desired
  };

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      console.error("Speech recognition error:", e);
      setListening(false);
    };
    r.onresult = (ev) => {
      const text = Array.from(ev.results)
        .map((res) => res[0].transcript)
        .join(" ");
      if (text && text.trim()) {
        // push user transcript
        setTranscript((t) => [...t, { speaker: "user", text }]);
        // send to AI streaming
        sendToAI(text);
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
    setLoading(true);
    setAiPartial("");
    tokenBufferRef.current = "";
    // ensure any previous stream is aborted
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    // start periodic flush to group tokens for TTS
    if (!flushTimerRef.current) {
      flushTimerRef.current = setInterval(() => {
        if (tokenBufferRef.current) flushTokenBuffer();
      }, 400);
    }

    try {
      const onToken = (token) => {
        // accumulate tokens into a small buffer, flush periodically
        tokenBufferRef.current += token;
        // also update live assistant text for transcript preview
        setAiPartial((p) => p + token);
      };

      const result = await fetchStreamingResponse(
        userText,
        "",
        onToken,
        ac.signal
      );
      if (result && result.text) {
        setTranscript((t) => [
          ...t,
          { speaker: "assistant", text: result.text },
        ]);
      } else if (result && result.error && result.text) {
        setTranscript((t) => [
          ...t,
          { speaker: "assistant", text: result.text },
        ]);
      }
    } catch (e) {
      if (e.name === "AbortError") {
        console.log("AI stream aborted");
      } else {
        console.error("Error streaming AI response:", e);
      }
    } finally {
      setLoading(false);
      // flush any remaining buffer
      if (tokenBufferRef.current) flushTokenBuffer();
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      abortControllerRef.current = null;
      setAiPartial("");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="talk-component">
      <div className="talk-header">
        <div className="header-left">
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                className="history-button"
                title={voices[voiceIndex]?.name || "Change voice"}
                onClick={openVoiceMenu}
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
              </button>

              <div className="current-voice-label">
                {voices[voiceIndex]?.name || "Default"}
              </div>
            </div>

            {voiceMenuOpen && (
              <div className="voice-menu">
                <div className="voice-menu-list">
                  {voices && voices.length ? (
                    voices.map((v, i) => (
                      <button
                        key={i}
                        className={`voice-menu-item ${
                          i === voiceIndex ? "active" : ""
                        }`}
                        onClick={() => selectVoice(i)}
                      >
                        {v.name} {v.lang ? `(${v.lang})` : ""}
                      </button>
                    ))
                  ) : (
                    <div className="voice-menu-empty">No voices available</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="header-right">
          <button
            className="history-button"
            onClick={() => {
              handleStop();
              onClose();
            }}
            title="Close"
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
          </button>
        </div>
      </div>

      <div className="talk-body">
        {!started ? (
          <div className="empty-talk">
            <div className="empty-talk-icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="44"
                height="44"
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
            </div>
            <h3>Talk with AI</h3>
            <p className="talk-sub">
              Have a voice-first conversation with the assistant.
            </p>
            <button
              className="start-button"
              onClick={handleStart}
              disabled={loading}
            >
              {loading ? "Starting…" : "Start"}
            </button>
          </div>
        ) : (
          <div className="talk-active">
            <motion.div
              className="talk-circle"
              animate={
                speaking || listening ? { scale: [1, 1.35, 1] } : { scale: 1 }
              }
              transition={{
                duration: 1.2,
                repeat: speaking || listening ? Infinity : 0,
                type: "spring",
                stiffness: 200,
              }}
            />

            <div className="talk-bottom-icons">
              <button
                className={`icon-button mute-button ${
                  listening ? "" : "muted"
                }`}
                title={listening ? "Mute microphone" : "Unmute microphone"}
                onClick={() => {
                  if (listening && recognitionRef.current) {
                    try {
                      recognitionRef.current.stop();
                    } catch (e) {}
                    setListening(false);
                  } else {
                    startListening();
                  }
                }}
              >
                <svg
                  width="20"
                  height="20"
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
              </button>

              <button
                className="icon-button end-button"
                title="End conversation"
                onClick={() => {
                  handleStop();
                  onClose();
                }}
              >
                <svg
                  width="20"
                  height="20"
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
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TalkComponent;
