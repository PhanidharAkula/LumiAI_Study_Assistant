import { useEffect, useState, useRef } from "react";
import { motion, useAnimation } from "framer-motion";
import { fetchAIResponse, type ChatMessage } from "@shared/services/aiService";
import {
  LumiStar,
  Starfield,
  UI,
  btnClass,
  starPath,
} from "@shared/components/atlas";
import { CloseButton } from "@shared/components/controls";
import { keyPress, pressLift } from "@shared/motion";
import { useEscapeToClose, useScrollLock } from "@shared/hooks/overlay";

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
  // Dashboard passes `initialClassId` (a class id, possibly numeric); this
  // component ignores it (the binding below is the unused-prefixed
  // `_initialClassId`). Accept both to keep the prop surface permissive.
  initialClassId?: string | number | null;
  _initialClassId?: string | number | null;
}

// Round bottom control keys (mute / stop) on the night scene - hairline
// starlight circle by default; muted = filled starlight; stop = vermilion ink.
const TALK_BTN =
  "flex h-[65px] w-[65px] cursor-pointer items-center justify-center rounded-full border border-solid transition-colors duration-200 max-md:h-16 max-md:w-16 max-[480px]:h-14 max-[480px]:w-14";
const TALK_BTN_RED =
  "border-[#e2674a]/60 bg-transparent text-[#ff9c82] hover:border-[#e2674a] hover:bg-[#b23a1d] hover:text-starlight";
const TALK_BTN_DEFAULT =
  "border-starlight/30 bg-transparent text-starlight hover:border-starlight/70 hover:bg-starlight/10";
const TALK_BTN_MUTED = "border-starlight bg-starlight text-ink";

const TalkComponent = ({
  isOpen = true,
  onClose = () => {},
  _initialClassId = null,
}: Props) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);

  const synthRef = useRef<SpeechSynthesis | null>(
    typeof window !== "undefined" ? window.speechSynthesis : null
  );
  // Web Speech API recognition typings are inconsistent across browsers - use
  // `any` for the recognition instance and event objects.
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationHistoryRef = useRef<ChatMessage[]>([]);
  const circleControls = useAnimation();
  const animationFrameRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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
      const lower = (s: string) => (s || "").toLowerCase();
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
  const selectVoice = (i: number) => {
    setVoiceIndex(i);
    setVoiceMenuOpen(false);
    // Save to localStorage
    localStorage.setItem("lumiTalkVoiceIndex", i.toString());
  };

  const speakText = (text: string) => {
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
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser.");
      return;
    }

    const r: any = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.maxAlternatives = 1;

    r.onresult = (ev: any) => {
      const last = ev.results[ev.results.length - 1];
      if (last.isFinal) {
        const text = last[0].transcript.trim();
        if (text) {
          // User spoke - interrupt AI if speaking
          if (speaking && currentUtteranceRef.current) {
            synthRef.current!.cancel();
            setSpeaking(false);
          }
          conversationHistoryRef.current.push({ role: "user", content: text });
          sendToAI(text);
        }
      }
    };

    r.onerror = (e: any) => {
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

  const sendToAI = async (userText: string) => {
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
        true,
        ac.signal
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
        // Don't leave the user in silence on failure (unless they stopped it).
        if (response?.error && response.errorType !== "aborted") {
          speakText(
            "Sorry, I'm having trouble responding right now. Please try again in a moment."
          );
        }
      }
    } catch (e) {
      setThinking(false);
      if (!(e instanceof Error) || e.name !== "AbortError") {
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

  // Dismiss the whole talk overlay - stop any in-flight speech/recognition,
  // then hand control back to the caller. Shared by the header ✕ and Escape.
  const handleClose = () => {
    handleStop();
    onClose();
  };

  // Lock background scroll while the fullscreen night scene is open and let
  // Escape leave it (routed through the same stop+close path), both via the
  // shared overlay hooks so this stacks with any dialog above it.
  useScrollLock(isOpen);
  useEscapeToClose(isOpen, handleClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col overflow-hidden bg-night">
      <Starfield count={70} seed={11} />
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% 110%, rgb(199 154 51 / 0.12), transparent 60%)",
        }}
      />
      <div className="fixed inset-x-0 top-0 z-[1210] flex items-center justify-between bg-transparent p-[30px]">
        <div className="flex items-center gap-2.5">
          {!started && (
            <div className="relative">
              <motion.button
                type="button"
                className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-solid border-starlight/30 bg-transparent px-4 text-starlight transition-colors duration-200 hover:border-starlight/70 hover:bg-starlight/10 max-[480px]:px-3"
                title={voices[voiceIndex]?.name || "Change voice"}
                aria-label="Change voice"
                onClick={openVoiceMenu}
                {...keyPress}
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
                <span className="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] tracking-wide">
                  {voices[voiceIndex]?.name?.substring(0, 15) || "Voice"}
                </span>
              </motion.button>
              {voiceMenuOpen && (
                <motion.div
                  className="absolute left-0 top-[58px] z-[1400] min-w-[240px] overflow-hidden rounded-xl border border-solid border-line-night bg-night-2 shadow-night"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {voices && voices.length ? (
                    voices.map((v, i) => (
                      <motion.button
                        key={i}
                        type="button"
                        className={`flex w-full cursor-pointer items-center gap-2.5 border-0 border-l-2 border-solid px-4 py-3 text-left font-mono text-[12.5px] transition-colors duration-200 ${
                          i === voiceIndex
                            ? "border-gold/50 bg-gold/10 font-semibold text-gold"
                            : "border-transparent bg-transparent text-starlight/85 hover:bg-starlight/[0.07]"
                        }`}
                        onClick={() => selectVoice(i)}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span
                          aria-hidden="true"
                          className={`text-[11px] text-gold ${
                            i === voiceIndex ? "opacity-100" : "opacity-0"
                          }`}
                        >
                          ✦
                        </span>
                        {v.name}
                      </motion.button>
                    ))
                  ) : (
                    <div className="p-4 text-center font-mono text-[12px] text-starlight/60">
                      No voices available
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <CloseButton
            variant="night"
            label="Close voice conversation"
            onClick={handleClose}
          />
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-5 pt-20 pb-10">
        {!started ? (
          <div className="flex flex-col items-center gap-[18px] text-center">
            <motion.div
              className="text-starlight/35"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <LumiStar
                size={110}
                orbit
                breathe
                core="var(--color-night)"
                className="max-md:h-20 max-md:w-20"
              />
            </motion.div>
            <p className={`m-0 ${UI.overlineNight}`}>
              The observatory is listening
            </p>
            <h3 className="m-0 font-display text-[28px] font-semibold leading-tight text-starlight max-md:text-[24px]">
              Talk with AI
            </h3>
            <p className="m-0 text-[16px] leading-[1.6] text-starlight/60 max-md:text-[14px]">
              Start a natural voice conversation
            </p>
            <motion.button
              type="button"
              className={`${btnClass("gold")} mt-3`}
              onClick={startConversation}
              {...pressLift}
            >
              <span aria-hidden="true" className="text-[13px]">
                ✦
              </span>
              Begin
            </motion.button>
          </div>
        ) : (
          <div className="flex h-full w-full max-w-[600px] flex-col items-center justify-center gap-10">
            <motion.div
              className="relative h-[250px] w-[250px] max-md:h-[210px] max-md:w-[210px] max-[480px]:h-[180px] max-[480px]:w-[180px]"
              animate={circleControls}
              initial={{ scale: 1 }}
            >
              {/* Outer soft halo */}
              <div
                className="pointer-events-none absolute -inset-10 rounded-full"
                aria-hidden="true"
                style={{
                  background:
                    "radial-gradient(rgb(199 154 51 / 0.35), transparent 70%)",
                }}
              />
              {/* Slow orbit ring with a tiny star riding it */}
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 h-full w-full text-starlight/40"
                aria-hidden="true"
              >
                <g
                  className="animate-orbit"
                  style={{ transformOrigin: "50px 50px" }}
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="47"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.6"
                    strokeDasharray="0.5 5.5"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                  <path d={starPath(97, 50, 2.6)} fill="var(--color-gold)" />
                </g>
              </svg>
              {/* The star core - long + short rays, bright starlight heart */}
              <svg
                viewBox="0 0 100 100"
                className="relative h-full w-full"
                aria-hidden="true"
                style={{
                  filter: "drop-shadow(0 0 18px rgb(199 154 51 / 0.45))",
                }}
              >
                <g
                  className="animate-breathe"
                  style={{ transformOrigin: "50px 50px" }}
                >
                  <path
                    d={starPath(50, 50, 25)}
                    transform="rotate(45 50 50)"
                    fill="var(--color-gold)"
                    opacity="0.65"
                  />
                  <path d={starPath(50, 50, 37)} fill="var(--color-gold)" />
                  <circle
                    cx="50"
                    cy="50"
                    r="11"
                    fill="var(--color-starlight)"
                    opacity="0.3"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="6.5"
                    fill="var(--color-starlight)"
                  />
                </g>
              </svg>
            </motion.div>
            <div className="flex flex-col items-center gap-2.5 text-center">
              <p className="m-0 font-mono text-[12px] font-medium uppercase tracking-[0.32em] text-gold">
                {speaking
                  ? "Speaking…"
                  : thinking
                    ? "Thinking…"
                    : muted
                      ? "Muted"
                      : "Listening…"}
              </p>
              <p className="m-0 text-[14px] text-starlight/60 max-[480px]:text-[13px]">
                {muted ? (
                  <>Microphone off - unmute to continue.</>
                ) : (
                  <>Speak whenever you&rsquo;re ready.</>
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {started && (
        <div className="fixed bottom-10 left-1/2 z-[1220] flex -translate-x-1/2 items-center justify-center gap-8 max-md:bottom-[30px] max-md:gap-6 max-[480px]:bottom-6 max-[480px]:gap-5">
          <motion.button
            type="button"
            className={`${TALK_BTN} ${muted ? TALK_BTN_MUTED : TALK_BTN_DEFAULT}`}
            title={muted ? "Unmute" : "Mute"}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            onClick={toggleMute}
            {...keyPress}
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
            type="button"
            className={`${TALK_BTN} ${TALK_BTN_RED}`}
            title="End conversation"
            aria-label="End conversation"
            onClick={handleStop}
            {...keyPress}
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
