import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@shared/lib/supabaseClient";
import { getFilePublicUrl } from "@shared/utils/storageUtils";
import { extractPdfText } from "@shared/lib/pdf";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import ContextTags from "./ContextTags";
import TagSelector from "./TagSelector";
import ConfirmDialog from "@shared/components/ConfirmDialog";
import { Constellation, LumiStar, UI } from "@shared/components/atlas";
import { CloseButton, IconButton, Spinner } from "@shared/components/controls";
import { scrimFade, spring } from "@shared/motion";
import { useEscapeToClose, useScrollLock } from "@shared/hooks/overlay";
import {
  fetchStreamingResponse,
  generateConversationTitle,
  type ChatMessage as AIChatMessage,
} from "@shared/services/aiService";

// A single chat message rendered in the conversation thread. Fields are
// loosely typed because messages come from several sources (local state,
// Supabase rows, stored metadata) that don't all share the same shape.
interface ChatMsg {
  type: string;
  content: string;
  id: string;
  isStreaming?: boolean;
  errorType?: string;
  files?: any[];
  contextFiles?: any[];
  selectedClasses?: any[];
  selectedFiles?: any[];
  contextContent?: string;
  statusLabel?: string;
}

// A processed conversation row used in the chat history dropdown.
interface ChatHistoryItem {
  id: any;
  class_id?: any;
  question?: any;
  answer?: any;
  created_at?: any;
  updated_at?: any;
  session_id?: any;
  title?: string;
  displayQuestion?: string;
  context_classes?: any;
  context_files?: any;
  classes?: { name?: string } | null;
  [key: string]: any;
}

// Stored per-message metadata persisted alongside a conversation row.
interface StoredMessageMeta {
  type: string;
  index: number;
  contextFiles?: any[];
  files?: any[];
}

// v2 persistence: a full, ordered snapshot of the thread stored in
// messages_metadata. Reloading from this is exact - it preserves message order,
// type (including error turns), and per-message context - instead of re-pairing
// two parallel question/answer columns by index, which silently desynced the
// whole thread whenever a turn had no clean answer (an error, or an
// aborted-before-any-token reply).
interface StoredMessageV2 {
  type: "user" | "assistant" | "error";
  content: string;
  contextFiles?: any[];
  files?: any[];
  // The resolved study-material text for a user turn. Persisting it (not just
  // the file ids) is what lets a reloaded conversation replay its materials to
  // the model on a follow-up - without it, continuing an old chat went blind.
  contextContent?: string;
  errorType?: string;
}
interface StoredMetaV2 {
  v: 2;
  messages: StoredMessageV2[];
}

interface ChatComponentProps {
  isOpen: boolean;
  onClose: () => void;
  initialClassId?: string | null;
  allClasses?: any[];
  conversationId?: string | null;
}

const STORAGE_KEY_PREFIX = "lumiAI_chat_";

// Cap the resolved study-material text persisted per turn in messages_metadata.
// Uncapped, a few large PDFs would bloat every conversation row (and the history
// query that reads them). ~120k chars covers roughly 30-40 pages per turn.
const MAX_PERSISTED_CONTEXT = 120000;

// Monotonic suffix so two message ids minted in the same millisecond (rapid
// retry, fast back-to-back errors) can't collide - a duplicate id would clash a
// React key and let id-based filters/maps mutate the wrong message.
let messageIdSeq = 0;
const nextMessageId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${(messageIdSeq += 1)}`;

// Rotating labels for the thinking bubble so a wait never reads as frozen. The
// label cycles every ~1.4s through one phase while tagged files are being read,
// then through the other while the model composes - until the first token lands.
const READING_PHRASES = [
  "Reading through your materials",
  "Skimming the key pages",
  "Pulling out the important parts",
  "Connecting the details",
];
const THINKING_PHRASES = [
  "Thinking",
  "Working through it",
  "Putting it together",
  "Organizing the answer",
];

// Drop short meta-preface lines an assistant sometimes opens with ("Sure,
// here's...", "Alright,"). Module-scope helper for the streaming send path.
const sanitizeAssistantResponse = (text: string): string => {
  if (!text || typeof text !== "string") return "";
  const lines = text.split(/\r?\n/);
  let start = 0;
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const l = lines[i].trim();
    if (!l) {
      start = i + 1;
      continue;
    }
    const metaPreface =
      /^(chatgpt|assistant|ai)\b|^(alright|ok|okay|sure)([,.!]?\s+here'?s?)?/i;
    if (metaPreface.test(l) && l.length < 80) {
      start = i + 1;
      continue;
    }
    break;
  }
  return lines.slice(start).join("\n").trim();
};

// Brand rule: Lumi never uses em dashes. The model still slips one in despite
// the prompt, so strip them from streamed + saved chat text. The dash char is
// built with String.fromCharCode so this file itself stays em-dash-free.
const EM_DASH = String.fromCharCode(8212);
const stripEmDash = (text: string): string =>
  typeof text === "string"
    ? text
        .split(" " + EM_DASH + " ")
        .join(", ")
        .split(EM_DASH)
        .join(", ")
    : text;
// Use an explicit turn separator that is very unlikely to appear in normal text
const TURN_SEP = "\n\n--LUMI_TURN--\n\n";

// Safely split stored conversation text into parts using the sentinel separator.
// If no sentinel is found, treat the entire text as a single part (no splitting).
const splitConversationParts = (text: string | null | undefined): string[] => {
  if (!text || typeof text !== "string") return [];
  const bySentinel = text.split(TURN_SEP).filter(Boolean);
  if (bySentinel.length > 1) return bySentinel;
  // Return the whole text as a single part if no separator found
  return [text];
};

// Build the persisted payload for a conversation from its live message list.
// Produces the v2 ordered snapshot (the source of truth on reload) plus the
// legacy question/answer columns, which are kept for the history-list preview,
// search, and pre-v2 fallback. The columns pair each user turn with the next
// answer/error so the two stay index-aligned even across errored or empty turns.
const buildConversationPayload = (
  messages: ChatMsg[]
): { question: string; answer: string; messages_metadata: string } => {
  const ordered: StoredMessageV2[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg.content !== "string") continue;
    if (msg.type === "assistant" && msg.isStreaming) continue; // live bubble
    if (msg.type === "user") {
      if (!msg.content.trim()) continue;
      ordered.push({
        type: "user",
        content: msg.content,
        contextFiles: msg.contextFiles || [],
        files: msg.files || [],
        // Capped so a few large PDFs can't bloat the row; enough to replay the
        // turn's materials to the model after a reload.
        contextContent: (msg.contextContent || "").slice(
          0,
          MAX_PERSISTED_CONTEXT
        ),
      });
    } else if (msg.type === "error") {
      ordered.push({
        type: "error",
        content: msg.content,
        errorType: msg.errorType || "general",
      });
    } else if (msg.content.trim()) {
      ordered.push({ type: "assistant", content: msg.content });
    }
    // else: an empty assistant bubble (aborted before any token) - drop it; the
    // question it followed simply restores with no answer.
  }

  const questionParts: string[] = [];
  const answerParts: string[] = [];
  let awaitingAnswer = false;
  for (const m of ordered) {
    if (m.type === "user") {
      if (awaitingAnswer) answerParts.push("");
      questionParts.push(m.content.trim());
      awaitingAnswer = true;
    } else {
      if (!awaitingAnswer) continue;
      answerParts.push(m.content.trim());
      awaitingAnswer = false;
    }
  }
  if (awaitingAnswer) answerParts.push("");

  const meta: StoredMetaV2 = { v: 2, messages: ordered };
  return {
    question: questionParts.join(TURN_SEP),
    answer: answerParts.join(TURN_SEP),
    messages_metadata: JSON.stringify(meta),
  };
};

// Reconstruct a conversation's messages for display. Prefers the v2 ordered
// snapshot (exact); falls back to the legacy two-column interleave for old rows.
const messagesFromConv = (conv: any): ChatMsg[] => {
  let parsedMeta: any = null;
  try {
    if (conv && conv.messages_metadata) {
      parsedMeta = JSON.parse(conv.messages_metadata);
    }
  } catch (e) {
    console.warn("Could not parse messages_metadata:", e);
  }

  if (parsedMeta && parsedMeta.v === 2 && Array.isArray(parsedMeta.messages)) {
    return (parsedMeta.messages as StoredMessageV2[]).map((m, i) => {
      if (m.type === "error") {
        return {
          type: "error",
          content: m.content,
          id: `m-${conv.id}-${i}`,
          errorType: m.errorType || "general",
        } as ChatMsg;
      }
      if (m.type === "assistant") {
        return {
          type: "assistant",
          content: m.content,
          id: `m-${conv.id}-${i}`,
        } as ChatMsg;
      }
      return {
        type: "user",
        content: m.content,
        id: `m-${conv.id}-${i}`,
        contextFiles: m.contextFiles || [],
        files: m.files || [],
        // Restored so a follow-up turn re-sends this turn's materials (the
        // history builder reads m.contextContent).
        contextContent: m.contextContent || "",
      } as ChatMsg;
    });
  }

  // Legacy fallback: interleave the question/answer columns by index.
  const legacyMeta: StoredMessageMeta[] = Array.isArray(parsedMeta)
    ? parsedMeta
    : [];
  const qParts = splitConversationParts(conv?.question);
  const aParts = splitConversationParts(conv?.answer);
  const out: ChatMsg[] = [];
  const maxParts = Math.max(qParts.length, aParts.length);
  for (let i = 0; i < maxParts; i++) {
    if (i < qParts.length) {
      const storedUserMsg = legacyMeta.find(
        (m) => m.type === "user" && m.index === i
      );
      out.push({
        type: "user",
        content: qParts[i],
        id: `q-${conv.id}-${i}`,
        contextFiles: storedUserMsg?.contextFiles || [],
        files: storedUserMsg?.files || [],
      });
    }
    if (i < aParts.length) {
      out.push({
        type: "assistant",
        content: aParts[i],
        id: `a-${conv.id}-${i}`,
      });
    }
  }
  return out;
};

const ChatComponent = ({
  isOpen,
  onClose,
  initialClassId = null,
  allClasses: allClassesProp = [],
  conversationId = null,
}: ChatComponentProps) => {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const messagesRef = useRef<ChatMsg[]>(messages);
  const [loading, setLoading] = useState(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<any[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [selectedClasses, setSelectedClasses] = useState<any[]>(
    initialClassId ? [initialClassId] : []
  );
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
  const [uploadedLocalFiles, setUploadedLocalFiles] = useState<any[]>([]);

  // A refreshable local copy of the classes. The parent (Dashboard) fetches them
  // once, so a file added to a class elsewhere wouldn't appear here until a full
  // page reload. Seed from the prop, keep it in sync, and re-pull fresh (classes
  // + their files) whenever the tag picker opens - so tagging always sees current
  // files. `allClasses` aliases this, so every consumer (the picker AND the
  // send-time context builder) reads the live data.
  const [classesData, setClassesData] = useState<any[]>(allClassesProp || []);
  const allClasses = classesData;
  // Once a fresh classes+files list has been pulled (on tag-picker open), that
  // local copy is fresher than the parent's prop - so stop the prop-sync below
  // from clobbering it (which dropped files added during this session).
  const classesRefreshedRef = useRef(false);
  useEffect(() => {
    if (classesRefreshedRef.current) return;
    setClassesData(allClassesProp || []);
  }, [allClassesProp]);
  useEffect(() => {
    if (!showTagSelector) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("classes")
          .select("*, files(*)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });
        if (!cancelled && !error && data) {
          setClassesData(data);
          classesRefreshedRef.current = true;
        }
      } catch (e) {
        console.warn("Could not refresh classes for tagging:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showTagSelector]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(conversationId);
  const [currentSessionId, setCurrentSessionId] = useState(
    `session-${Date.now()}`
  );
  const [editingTitle, setEditingTitle] = useState<any>(null);
  const [titleInput, setTitleInput] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<ChatHistoryItem | null>(
    null
  );
  // Drives the floating "jump to latest" button (mirror of !pinnedToBottom,
  // surfaced as state so AnimatePresence can fade it in/out).
  const [showJumpButton, setShowJumpButton] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  // Pinned-to-bottom model: while the view is glued to the bottom we follow
  // new tokens instantly; the moment the user scrolls up we let go and stop
  // following, so in-flight auto-scroll never fights them. Default true so the
  // first message and conversation loads start glued to the latest turn.
  const pinnedToBottom = useRef(true);

  // The scrollTop we last parked at the bottom while following (-1 = none).
  // Content growth never LOWERS scrollTop, so if it drops below this the user
  // scrolled up - and we let go instead of slamming back, which removes the
  // residual one-frame scroll fight at its source.
  const followParkRef = useRef(-1);

  // Guards the "create a new conversation" insert so two rapid saves can't both
  // insert a row before the first conversation id propagates (would duplicate).
  const creatingConvRef = useRef(false);

  // How close to the bottom (px) counts as "at the bottom" for RE-PINNING when
  // the user scrolls back down. Kept small: unpinning is driven by scroll-up
  // INTENT (below), not by distance, so this only governs snapping follow back
  // on - it never re-pins mid-scroll, which is what caused the scroll fight.
  const PIN_AT_BOTTOM = 24;

  // Instantly jump to the bottom. Instant (not smooth) is deliberate: a
  // programmatic smooth animation is exactly what fought the user before.
  const scrollToBottomInstant = () => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
      followParkRef.current = container.scrollTop;
    }
  };

  // Auto-follow during streaming. Unlike the unconditional jump above, this lets
  // go the instant the user scrolls up: while following we park at the bottom
  // each frame, and content growth never lowers scrollTop - so any drop below
  // the park is the user, and we release rather than fight to re-pin them.
  const followToBottom = () => {
    if (!pinnedToBottom.current) return;
    const container = chatContainerRef.current;
    if (!container) return;
    if (
      followParkRef.current >= 0 &&
      container.scrollTop < followParkRef.current - 2
    ) {
      pinnedToBottom.current = false;
      setShowJumpButton(true);
      return;
    }
    container.scrollTop = container.scrollHeight;
    followParkRef.current = container.scrollTop;
  };

  // Re-pin and snap to the latest turn (used on send/submit and the jump btn).
  const pinAndScrollToBottom = () => {
    pinnedToBottom.current = true;
    followParkRef.current = -1; // fresh follow: let it catch up to the bottom
    setShowJumpButton(false);
    requestAnimationFrame(scrollToBottomInstant);
  };

  // Track whether the scroll container is pinned to the bottom. A single
  // `scroll` listener computes the distance from the bottom on every scroll
  // (programmatic OR user) and updates the pin + the jump-button visibility.
  //
  // Deps include `initialLoading` on purpose: the scroll container lives ONLY
  // in the loaded tree - the `initialLoading` early-return renders a spinner
  // with no ref. With [] this effect would run once on that first (loading)
  // render, find a null ref, bail, and never re-run, leaving the jump button
  // permanently dead. Re-running when loading flips false binds the listener to
  // the real container. The one `handleScroll()` call on attach syncs the
  // initial button state to wherever the view actually starts.
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    // Let go of auto-follow the moment the user takes manual control, so the
    // streaming auto-scroll (which now re-pins every animation frame) can never
    // yank them back.
    const unpinFollow = () => {
      if (pinnedToBottom.current) {
        pinnedToBottom.current = false;
        setShowJumpButton(true);
      }
    };

    // While pinned, the auto-scroll only ever INCREASES scrollTop, so any
    // decrease is the user scrolling up - let go. Re-pin only once they are
    // genuinely back at the bottom. (The old pure-distance threshold re-pinned
    // on every small scroll, so the per-frame auto-scroll kept winning.)
    let lastScrollTop = container.scrollTop;
    const handleScroll = () => {
      const top = container.scrollTop;
      const distanceFromBottom =
        container.scrollHeight - top - container.clientHeight;
      if (top < lastScrollTop - 1) {
        pinnedToBottom.current = false;
      } else if (distanceFromBottom < PIN_AT_BOTTOM) {
        pinnedToBottom.current = true;
        followParkRef.current = -1; // re-pinned by the user: allow catch-up
      }
      lastScrollTop = top;
      const pinned = pinnedToBottom.current;
      // Only flip state when it actually changes (avoids per-frame re-renders
      // during a streaming-driven scroll storm).
      setShowJumpButton((prev) => (prev === !pinned ? prev : !pinned));
    };

    // Intent listeners fire on real user input ONLY (never on programmatic
    // scrolls) and before the resulting scroll event, so they unpin with no race
    // against the per-frame auto-scroll.
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) unpinFollow();
    };
    const handleTouchMove = () => unpinFollow();

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    // The container exists only once the chat has loaded; on that first attach
    // (a fresh open or a page refresh) land at the bottom - the latest turn -
    // instead of the top. rAF waits for layout so scrollHeight is final.
    pinnedToBottom.current = true;
    setShowJumpButton(false);
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      lastScrollTop = container.scrollTop;
      followParkRef.current = container.scrollTop;
    });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, [initialLoading]);

  useEffect(() => {
    // keep a ref in sync so async handlers can access the latest messages
    messagesRef.current = messages;

    if (messages.length > 0) {
      const storageKey = `${STORAGE_KEY_PREFIX}${initialClassId || "global"}`;
      // Persist a clean snapshot: drop an empty in-flight assistant placeholder
      // and never store the live `isStreaming` flag, or a reload mid-stream would
      // restore a message stuck "thinking" forever.
      const persistable = messages
        .filter((m) => !(m.type === "assistant" && m.isStreaming && !m.content))
        .map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m));
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          messages: persistable,
          selectedClasses,
          selectedFiles,
          // Persist the session id so reopening this chat (the component
          // unmounts when closed) continues the SAME conversation instead of
          // inserting a duplicate row under a fresh session.
          sessionId: currentSessionId,
          timestamp: Date.now(),
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedClasses, selectedFiles, currentSessionId]);

  useEffect(() => {
    // Follow new/updated messages via the guarded follow so a scrolled-up user
    // is never dragged back (it releases instead of slamming to the bottom).
    followToBottom();
  }, [messages]);

  useEffect(() => {
    if (conversationId) {
      loadSpecificConversation(conversationId);
      return;
    }

    if (initialClassId) {
      setSelectedClasses([initialClassId]);

      const storageKey = `${STORAGE_KEY_PREFIX}${initialClassId}`;
      const savedChat = localStorage.getItem(storageKey);

      if (savedChat) {
        try {
          const {
            messages: savedMessages,
            selectedClasses: savedClasses,
            selectedFiles: savedFiles,
            sessionId: savedSessionId,
            timestamp,
          } = JSON.parse(savedChat);
          if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
            setMessages(savedMessages);
            setSelectedClasses(savedClasses);
            setSelectedFiles(savedFiles);
            // Restore the session so a continued turn updates the existing
            // conversation (found by session) instead of inserting a duplicate.
            if (savedSessionId) setCurrentSessionId(savedSessionId);
            setInitialLoading(false);
            return;
          }
        } catch (e) {
          console.error("Error parsing saved chat:", e);
        }
      }

      fetchClassData(initialClassId);
    } else {
      const storageKey = `${STORAGE_KEY_PREFIX}global`;
      const savedChat = localStorage.getItem(storageKey);

      if (savedChat) {
        try {
          const {
            messages: savedMessages,
            selectedClasses: savedClasses,
            selectedFiles: savedFiles,
            sessionId: savedSessionId,
            timestamp,
          } = JSON.parse(savedChat);
          if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
            setMessages(savedMessages);
            setSelectedClasses(savedClasses);
            setSelectedFiles(savedFiles);
            // Restore the session so a continued turn updates the existing
            // conversation (found by session) instead of inserting a duplicate.
            if (savedSessionId) setCurrentSessionId(savedSessionId);
            setInitialLoading(false);
            return;
          }
        } catch (e) {
          console.error("Error parsing saved chat:", e);
        }
      }

      setInitialLoading(false);
      setMessages([]);
      setSelectedClasses([]);
      setSelectedFiles([]);
    }

    fetchChatHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClassId, conversationId]);

  useEffect(() => {
    if (!showHistory) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        historyDropdownRef.current &&
        !historyDropdownRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest(".history-button")
      ) {
        setShowHistory(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showHistory]);

  const handleClose = () => {
    // Abort any in-flight stream so closing mid-response doesn't keep the
    // request running (wasted work + setState-after-unmount).
    if (abortController) abortController.abort();
    onClose();
  };

  // Shared overlay behaviors (reference-counted, stacked). The history
  // dropdown registers its Escape handler after chat's, so it sits on top of
  // the stack: Escape closes the dropdown first, then the chat overlay.
  useScrollLock(isOpen);
  useEscapeToClose(isOpen, handleClose);
  useEscapeToClose(showHistory, () => setShowHistory(false));

  const fetchClassData = async (classId: string) => {
    try {
      setInitialLoading(true);

      const { error: classError } = await supabase
        .from("classes")
        .select("id")
        .eq("id", classId)
        .maybeSingle();

      if (classError) throw classError;

      const { data: docs, error: docsError } = await supabase
        .from("files")
        .select("*")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });

      if (docsError) throw docsError;
      setDocuments(docs || []);

      const { data: conversations, error: convError } = await supabase
        .from("conversations")
        .select("*")
        .eq("class_id", classId)
        .order("created_at", { ascending: true });

      if (convError) throw convError;

      if (conversations && conversations.length > 0) {
        // For each conversation row, split into parts and interleave user/assistant
        const formattedMessages = conversations.flatMap((conv: any) =>
          messagesFromConv(conv)
        );

        setMessages(formattedMessages);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setMessages([]);
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchChatHistory = async () => {
    setHistoryLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setHistoryLoading(false);
        return;
      }

      // Get all conversations
      let query = supabase
        .from("conversations")
        .select(
          `
          id,
          class_id,
          question,
          answer,
          created_at,
          updated_at,
          title,
          session_id,
          classes(name)
        `
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (initialClassId) {
        query = query.eq("class_id", initialClassId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Process conversations for display
      const processedHistory: ChatHistoryItem[] = (data as any[]).map(
        (conv) => {
          // Count questions in this conversation using safe splitter
          const questions = splitConversationParts(conv.question);

          // Get the first question for display
          const firstQuestion = questions[0] || "";

          return {
            ...conv,
            title: conv.title || `Conversation`,
            displayQuestion: firstQuestion,
          };
        }
      );

      setChatHistory(processedHistory);
    } catch (error) {
      console.error("Error fetching chat history:", error);
      setChatHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadSpecificConversation = async (id: string) => {
    try {
      setInitialLoading(true);

      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // If this conversation has a session_id, fetch all conversations in the same session
        // and combine their turns so the full session history is loaded (enables continuation)
        let sessionConversations = [data];
        if (data.session_id) {
          try {
            const { data: sessionRows, error: sessionError } = await supabase
              .from("conversations")
              .select("*")
              .eq("session_id", data.session_id)
              .eq("user_id", data.user_id)
              .order("created_at", { ascending: true });

            if (!sessionError && sessionRows && sessionRows.length) {
              sessionConversations = sessionRows;
            }
          } catch (e) {
            console.warn("Error fetching session conversations:", e);
          }
        }

        // Combine all rows into a single ordered messages array
        const messageArray: ChatMsg[] = [];
        for (const conv of sessionConversations as any[]) {
          messageArray.push(...messagesFromConv(conv));
        }

        setMessages(messageArray);
        setCurrentConversationId(id);
        setCurrentSessionId(data.session_id || `session-${Date.now()}`);

        if (data.context_classes) {
          setSelectedClasses(data.context_classes);
        }
        if (data.context_files) {
          setSelectedFiles(data.context_files);
        }

        // Scroll to bottom after loading conversation
        setTimeout(pinAndScrollToBottom, 100);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error("Error fetching conversation:", error);
      setMessages([]);
    } finally {
      setInitialLoading(false);
    }
  };

  // Tag selection is handled by `handleTagSelection` defined below (keeps modal control with TagSelector)

  const buildAIContext = async () => {
    // Build a clear, delimited context block. This returns a short string
    // describing which classes and files are active. If nothing is selected,
    // return an empty string so the assistant behaves as a general chat model.
    try {
      if (!selectedClasses.length && !selectedFiles.length) return "";

      const parts = [];
      // List selected classes and how many files are included
      if (selectedClasses.length) {
        parts.push("Selected classes:");
        selectedClasses.forEach((classId) => {
          const cls = allClasses.find((c) => c.id === classId);
          if (!cls) return;
          const totalFiles = cls.files?.length || 0;
          // count how many of this class's files are selected
          const filesSelectedFromClass = (cls.files || []).filter((f: any) =>
            selectedFiles.includes(f.id)
          );
          const filesSelectedCount = filesSelectedFromClass.length;
          parts.push(
            `- ${cls.name} (id: ${cls.id}): ${filesSelectedCount}/${totalFiles} files selected`
          );
        });
      }

      // List explicitly selected files and attempt to include their text
      if (selectedFiles.length) {
        parts.push("Selected files:");
        // Use for..of so we can await inside the loop when fetching content
        for (const fileId of selectedFiles) {
          let found = false;
          for (const cls of allClasses) {
            const fileObj = cls.files?.find((f: any) => f.id === fileId);
            if (fileObj) {
              found = true;
              parts.push(
                `- ${fileObj.name} (id: ${fileObj.id}) from ${cls.name}`
              );

              // Attempt to fetch textual content for supported MIME types
              try {
                const mime = (fileObj.type || "").toLowerCase();
                const fileName = (fileObj.name || "").toLowerCase();
                const isText =
                  mime.startsWith("text") ||
                  mime.includes("json") ||
                  mime.includes("xml") ||
                  mime.includes("markdown") ||
                  mime.includes("csv") ||
                  mime.includes("plain");
                const isPDF = mime.includes("pdf") || fileName.endsWith(".pdf");

                if (isText) {
                  const { url, error } = await getFilePublicUrl(
                    "files",
                    fileObj.path
                  );
                  if (url && !error) {
                    try {
                      const resp = await fetch(url);
                      if (resp.ok) {
                        const text = await resp.text();
                        const truncated = text.slice(0, 20000);
                        parts.push("---BEGIN FILE CONTENT---");
                        parts.push(truncated);
                        parts.push("---END FILE CONTENT---");
                        if (text.length > truncated.length)
                          parts.push("[Truncated file content]");
                      } else {
                        parts.push(
                          `[Could not fetch file content: HTTP ${resp.status}]`
                        );
                      }
                    } catch {
                      parts.push("[Error fetching file content]");
                    }
                  } else {
                    parts.push(
                      "[Could not generate URL for file to fetch content]"
                    );
                  }
                } else if (isPDF) {
                  // Try to extract text from PDF client-side (all pages, no limit)
                  try {
                    const { url, error } = await getFilePublicUrl(
                      "files",
                      fileObj.path
                    );
                    if (url && !error) {
                      // fetch binary and pass arrayBuffer to pdfjs
                      const resp = await fetch(url);
                      if (resp.ok) {
                        const arrayBuffer = await resp.arrayBuffer();
                        const pdfText = await extractPdfText(arrayBuffer);

                        if (pdfText.trim().length > 0) {
                          parts.push("---BEGIN FILE CONTENT (PDF EXTRACT)---");
                          parts.push(pdfText);
                          parts.push("---END FILE CONTENT (PDF EXTRACT)---");
                        } else {
                          parts.push(
                            `[PDF "${fileObj.name}" appears to be image-based or contains no extractable text. Consider uploading it via the + button for image analysis.]`
                          );
                        }
                      } else {
                        console.error(
                          `❌ PDF fetch failed: HTTP ${resp.status}`
                        );
                        parts.push(
                          `[Could not fetch PDF: HTTP ${resp.status}]`
                        );
                      }
                    } else {
                      console.error(`❌ Could not get PDF URL:`, error);
                      parts.push(
                        "[Could not generate URL for PDF to extract content]"
                      );
                    }
                  } catch (err) {
                    console.error("PDF extraction error:", err);
                    parts.push(
                      `[⚠️ Unable to extract text from PDF "${fileObj.name}". The file may be image-based or have extraction restrictions. Consider uploading it via the + button for analysis.]`
                    );
                  }
                } else {
                  parts.push(
                    `[${
                      fileObj.type || "file"
                    } not included - content not extracted]`
                  );
                }
              } catch {
                parts.push("[Error while attempting to include file content]");
              }

              break;
            }
          }
          if (!found)
            parts.push(`- file id: ${fileId} (metadata not found locally)`);
        }
      }

      // Include any explicitly selected documents
      if (selectedDocs && selectedDocs.length) {
        parts.push("Selected documents:");
        selectedDocs.forEach((docId) => {
          const doc = documents.find((d) => d.id === docId);
          if (doc) {
            parts.push(`- ${doc.name} (id: ${doc.id})`);
          } else {
            parts.push(`- document id: ${docId}`);
          }
        });
      }

      return parts.join("\n");
    } catch (err) {
      console.error("Error building AI context:", err);
      return "";
    }
  };

  const handleSendMessage = async (
    message: string,
    files: any[] = [],
    retryMsg: ChatMsg | null = null
  ) => {
    if (!retryMsg && !message.trim() && files.length === 0) return;
    // Holds the rotating-status interval so it can be cleared on first token,
    // completion, error, or abort (declared out here so `finally` can reach it).
    let statusTimer: ReturnType<typeof setInterval> | null = null;
    // Handle for the smooth-streaming animation frame (same reason: `finally`
    // must be able to cancel it on any exit path so it can't leak a render loop).
    let smoothRaf: number | null = null;
    try {
      // Prior turns (for the history payload), the user-message id, and whether
      // any class/files are tagged - set up one way for a fresh send, another
      // for a retry of an existing message.
      let priorMessages: ChatMsg[];
      let hasTaggedContext: boolean;
      let userMessageId: string;

      if (retryMsg) {
        // Retry: the caller already removed the error message. Reuse the
        // existing user message (don't add a new one) and re-run its turn from
        // its stored content/files/context, so the conversation just continues.
        message = retryMsg.content;
        files = retryMsg.files || [];
        userMessageId = retryMsg.id;
        const all = Array.isArray(messagesRef.current)
          ? messagesRef.current
          : messages;
        const idx = all.findIndex((m) => m.id === retryMsg.id);
        priorMessages = idx >= 0 ? all.slice(0, idx) : [...all];
        hasTaggedContext = !!(
          (retryMsg.contextContent && retryMsg.contextContent.trim()) ||
          (retryMsg.contextFiles && retryMsg.contextFiles.length)
        );
      } else {
        // Snapshot prior turns BEFORE adding this one, so the history payload
        // (built after the async context read below) doesn't double-count this
        // message - which is also sent separately via the `message` argument.
        priorMessages = Array.isArray(messagesRef.current)
          ? [...messagesRef.current]
          : [...messages];

        // Build context files metadata for display (fast - just names/ids)
        const contextFiles: any[] = [];

        // Add tagged files from selected context
        selectedFiles.forEach((fileId) => {
          for (const cls of allClasses) {
            const fileObj = cls.files?.find((f: any) => f.id === fileId);
            if (fileObj) {
              contextFiles.push({
                id: fileObj.id,
                name: fileObj.name,
                type: fileObj.type,
                source: "context", // tagged via context selector
                className: cls.name,
                classId: cls.id,
              });
              break;
            }
          }
        });

        hasTaggedContext =
          selectedFiles.length > 0 || selectedClasses.length > 0;

        userMessageId = nextMessageId("user");
        const userMessage = {
          type: "user",
          content: message,
          files: files, // Locally uploaded files
          contextFiles: contextFiles, // Tagged files from context selector
          selectedClasses: [...selectedClasses], // Store which classes were selected
          selectedFiles: [...selectedFiles], // Store which files were selected
          contextContent: "", // resolved after the async context read below
          id: userMessageId,
        };

        // Render the user's message + loading state IMMEDIATELY - before the
        // possibly slow file fetch + PDF extraction - so sending feels instant
        // instead of frozen for a couple of seconds.
        setMessages((prev) => [...prev, userMessage]);

        // Clear all context immediately after sending (hide active context area)
        setUploadedLocalFiles([]);
        setSelectedClasses([]);
        setSelectedFiles([]);
      }

      setLoading(true);

      // Sending a new message always re-pins and snaps to the bottom.
      pinAndScrollToBottom();

      // Create a new AbortController for this request
      const controller = new AbortController();
      setAbortController(controller);

      const aiMessageId = nextMessageId("ai");
      // Rotate the thinking-bubble label through a few natural phrases so the
      // wait feels alive in every phase - reading tagged files first (if any),
      // then the model composing - until the first token streams in.
      let statusPhase: "reading" | "thinking" = hasTaggedContext
        ? "reading"
        : "thinking";
      let statusIdx = 0;
      const firstLabel = (
        statusPhase === "reading" ? READING_PHRASES : THINKING_PHRASES
      )[0];
      setMessages((prev) => [
        ...prev,
        {
          type: "assistant",
          content: "",
          id: aiMessageId,
          isStreaming: true,
          statusLabel: firstLabel,
        },
      ]);

      statusTimer = setInterval(() => {
        statusIdx += 1;
        const arr =
          statusPhase === "reading" ? READING_PHRASES : THINKING_PHRASES;
        const label = arr[Math.min(statusIdx, arr.length - 1)];
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId ? { ...m, statusLabel: label } : m
          )
        );
      }, 1400);

      // Resolve the context: a retry reuses what the original message already
      // resolved; a fresh send does the (possibly slow) file fetch + PDF
      // extraction now, with the message + rotating indicator already on screen.
      const messageContext = retryMsg
        ? retryMsg.contextContent || ""
        : await buildAIContext();

      // Reading done: persist the resolved context onto the user message and
      // move the rotating label into its "thinking" phase for the rest of the wait.
      statusPhase = "thinking";
      statusIdx = 0;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === userMessageId)
            return { ...m, contextContent: messageContext };
          if (m.id === aiMessageId)
            return { ...m, statusLabel: THINKING_PHRASES[0] };
          return m;
        })
      );

      const context = messageContext;

      let fullResponse = "";

      // Smooth streaming. Claude's text arrives in variable-size network bursts,
      // which paint as blocky jumps. Decouple arrival from display: tokens land
      // in `streamTarget`, and an animation-frame loop releases characters toward
      // it at a steady, self-balancing rate - it absorbs bursts and settles to
      // the model's own pace, so the text flows instead of snapping in blocks.
      let streamTarget = "";
      let streamShown = 0;
      let lastFrameTs = 0;
      const FRAME_MIN_MS = 28; // cap the re-render / markdown reparse to ~33fps
      const renderSmooth = (ts: number) => {
        smoothRaf = null;
        if (
          ts - lastFrameTs >= FRAME_MIN_MS &&
          streamShown < streamTarget.length
        ) {
          lastFrameTs = ts;
          const remaining = streamTarget.length - streamShown;
          // Release a fraction of the backlog (min a few chars, capped) so it
          // catches up after a burst without dumping a whole block in one frame.
          const step = Math.min(80, Math.max(2, Math.ceil(remaining / 5)));
          streamShown = Math.min(streamTarget.length, streamShown + step);
          // The first painted character is the cue to stop the rotating label.
          if (statusTimer) {
            clearInterval(statusTimer);
            statusTimer = null;
          }
          const display = streamTarget.slice(0, streamShown);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, content: display } : msg
            )
          );
        }
        // Follow every frame (cheap, separate from the throttled reparse) so the
        // parked guard releases within a single frame when the user scrolls up.
        followToBottom();
        if (streamShown < streamTarget.length) {
          smoothRaf = requestAnimationFrame(renderSmooth);
        }
      };
      const ensureSmooth = () => {
        if (smoothRaf == null && streamShown < streamTarget.length) {
          smoothRaf = requestAnimationFrame(renderSmooth);
        }
      };

      // Build history array from prior messages so the model receives full context
      const historyPayload: AIChatMessage[] = [];

      for (const m of priorMessages) {
        if (!m || typeof m.content !== "string") continue;
        const trimmed = m.content.trim();
        if (!trimmed) continue;

        if (m.type === "user") {
          // Build user message with context if it was included originally
          let userContent = trimmed;

          // If this message had context content, include it
          if (m.contextContent && m.contextContent.trim()) {
            userContent = `[📚 Study Materials Context - Files from your classes]\n\n${m.contextContent}\n\n[End of Study Materials Context]\n\n${trimmed}`;
          }

          // If this message had uploaded files with text content, include them
          if (m.files && m.files.length > 0) {
            m.files.forEach((file) => {
              if (file.text) {
                userContent += `\n\n[📎 Uploaded Document: ${file.name}]\n${file.text}\n[End of uploaded document]\n`;
              }
            });
          }

          historyPayload.push({ role: "user", content: userContent });
        }

        if (m.type === "assistant" && !m.isStreaming) {
          historyPayload.push({ role: "assistant", content: trimmed });
        }
      }

      // Limit history to last N messages to avoid exceeding token limits
      const MAX_HISTORY_MESSAGES = 20;
      const trimmedHistory = historyPayload.slice(-MAX_HISTORY_MESSAGES);

      const response = await fetchStreamingResponse(
        message,
        context,
        (token, opts) => {
          if (opts?.reset) {
            // The server flagged a web search: whatever streamed so far was a
            // preamble, not the answer. Drop it (text + buffer) and fall back to
            // the thinking indicator until the real answer streams. (With
            // adaptive thinking on, the search decision is hidden, so it's rare.)
            fullResponse = "";
            streamTarget = "";
            streamShown = 0;
            lastFrameTs = 0;
            if (smoothRaf != null) {
              cancelAnimationFrame(smoothRaf);
              smoothRaf = null;
            }
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId ? { ...msg, content: "" } : msg
              )
            );
            return;
          }
          // Feed the buffer; the animation-frame loop paints it smoothly and
          // stops the rotating label as it lands the first character.
          fullResponse += token;
          streamTarget = stripEmDash(fullResponse);
          ensureSmooth();
        },
        controller.signal,
        trimmedHistory,
        files, // Pass files to the API
        { mode: "chat" } // conversational study prompt; web search always available
      );

      // Final clean: meta-preface trim, then strip any em dashes the model
      // slipped in. (Any web-search preamble is already gone, dropped
      // structurally when the server flagged the search, not by its wording.)
      fullResponse = stripEmDash(sanitizeAssistantResponse(fullResponse));

      // Stop the smooth-streaming loop and snap to the final, sanitized text
      // (any small remaining buffer lands at once now that the reply is done).
      if (smoothRaf != null) {
        cancelAnimationFrame(smoothRaf);
        smoothRaf = null;
      }

      // Update the streaming message in state to the sanitized content
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId ? { ...msg, content: fullResponse } : msg
        )
      );

      // Clear the controller after the response is complete
      setAbortController(null);

      const baseArr = Array.isArray(messagesRef.current)
        ? messagesRef.current
        : messages;

      if (response.error && response.error !== "aborted") {
        // A truncated reply ("cut off") still streamed real text the user
        // watched appear. Keep that partial bubble (as an abort does) and add
        // the error beneath it for the retry affordance, rather than deleting
        // the answer wholesale. A hard error with no partial drops the empty
        // bubble. Either way, sync the ref synchronously so the save sees it.
        const hasPartial = !!fullResponse.trim();
        const errorMsg: ChatMsg = {
          type: "error",
          content: response.error as string,
          id: nextMessageId("error"),
          errorType: response.errorType || "general",
        };
        const cleaned = hasPartial
          ? baseArr.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, isStreaming: false, content: fullResponse }
                : msg
            )
          : baseArr.filter((msg) => msg.id !== aiMessageId);
        const next = cleaned.concat(errorMsg);
        messagesRef.current = next;
        setMessages(next);
      } else {
        // Success or aborted: clear the streaming flag, keep any partial text,
        // and sync the ref synchronously so the save below reads the final
        // thread regardless of when React commits this state update.
        const next = baseArr.map((msg) =>
          msg.id === aiMessageId
            ? { ...msg, isStreaming: false, content: fullResponse }
            : msg
        );
        messagesRef.current = next;
        setMessages(next);
      }

      // Always save conversation, even if aborted
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        try {
          // Snapshot the live thread (the post-stream ref includes the turn
          // just sent, plus any error message). buildConversationPayload
          // produces the v2 ordered metadata (source of truth on reload) and the
          // index-aligned question/answer columns.
          const currentMessages = Array.isArray(messagesRef.current)
            ? messagesRef.current
            : messages;

          const payload = buildConversationPayload(currentMessages);
          const allUserMessages = payload.question;
          const allAiResponses = payload.answer;
          const messagesMetadataJson = payload.messages_metadata;

          // Only write context tags when the live selection is non-empty.
          // Selections are cleared on send, so a follow-up turn would otherwise
          // overwrite the conversation's saved tags with [] and lose them on
          // reload. Omitting the keys leaves the existing values untouched.
          const contextUpdate: {
            context_classes?: any[];
            context_files?: any[];
          } = {};
          if (selectedClasses.length > 0)
            contextUpdate.context_classes = selectedClasses;
          if (selectedFiles.length > 0)
            contextUpdate.context_files = selectedFiles;

          if (currentConversationId) {
            // Update an explicitly-selected conversation

            const updatedConversation = {
              question: allUserMessages,
              answer: allAiResponses,
              updated_at: new Date().toISOString(),
              ...contextUpdate,
              messages_metadata: messagesMetadataJson,
            };

            const { error: updateError } = await supabase
              .from("conversations")
              .update(updatedConversation)
              .eq("id", currentConversationId);

            if (updateError)
              console.error("Error updating conversation:", updateError);
          } else {
            // No explicit id: try to find an existing conversation for this session
            let existingConvId = null;
            try {
              const { data: found, error: foundErr } = await supabase
                .from("conversations")
                .select("id")
                .eq("session_id", currentSessionId)
                .eq("user_id", user.id)
                .limit(1)
                .maybeSingle();

              if (!foundErr && found && found.id) existingConvId = found.id;
            } catch (e) {
              console.warn(
                "Error looking up existing conversation by session:",
                e
              );
            }

            if (existingConvId) {
              const updatedConversation = {
                question: allUserMessages,
                answer: allAiResponses,
                updated_at: new Date().toISOString(),
                ...contextUpdate,
                messages_metadata: messagesMetadataJson,
              };

              const { error: updateErr } = await supabase
                .from("conversations")
                .update(updatedConversation)
                .eq("id", existingConvId);

              if (updateErr) {
                console.error(
                  "Error updating existing conversation:",
                  updateErr
                );
              } else {
                setCurrentConversationId(existingConvId);
              }
            } else if (!creatingConvRef.current) {
              // Set synchronously so a racing save sees it and skips, rather than
              // inserting a second brand-new conversation row.
              creatingConvRef.current = true;
              try {
                const firstUser = currentMessages.find(
                  (m) => m.type === "user" && m.content && m.content.trim()
                );
                const firstAnswer = currentMessages.find(
                  (m) =>
                    m.type === "assistant" &&
                    !m.isStreaming &&
                    m.content &&
                    m.content.trim()
                );
                const title = await generateConversationTitle(
                  firstUser?.content || message,
                  firstAnswer?.content || fullResponse
                );

                const newConversation = {
                  class_id: initialClassId || null,
                  user_id: user.id,
                  question: allUserMessages,
                  answer: allAiResponses,
                  document_ids: selectedDocs,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  context_classes: selectedClasses,
                  context_files: selectedFiles,
                  session_id: currentSessionId,
                  title: title || "New Conversation",
                  messages_metadata: messagesMetadataJson,
                };

                const { data, error } = await supabase
                  .from("conversations")
                  .insert(newConversation)
                  .select();
                if (error) {
                  console.error("Error saving conversation:", error);
                } else if (data && data[0]) {
                  setCurrentConversationId(data[0].id);
                }
              } finally {
                creatingConvRef.current = false;
              }
            }
          }

          // Refresh chat history to show updated conversation
          fetchChatHistory();
        } catch (error) {
          console.error("Error handling conversation:", error);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Don't show an error message if the request was aborted
      if ((error as { name?: string })?.name !== "AbortError") {
        // Drop any still-streaming (empty) assistant placeholder first, so a
        // thrown failure never leaves a dangling "Lumi" bubble above the error.
        setMessages((prev) => [
          ...prev.filter((m) => !(m.type === "assistant" && m.isStreaming)),
          {
            type: "error",
            content:
              "Sorry, there was an error processing your request. Please try again.",
            id: nextMessageId("error"),
          },
        ]);
      }
    } finally {
      if (statusTimer) clearInterval(statusTimer);
      if (smoothRaf != null) cancelAnimationFrame(smoothRaf);
      setLoading(false);
      setAbortController(null);
    }
  };

  // Retry the last turn: only valid when the very last message is an error.
  // Drops that error and re-runs the assistant for the user message before it,
  // reusing its stored content/files/context so the flow simply continues.
  const handleRetry = () => {
    if (loading) return;
    const all = Array.isArray(messagesRef.current)
      ? messagesRef.current
      : messages;
    const last = all[all.length - 1];
    if (!last || last.type !== "error") return;
    let userMsg: ChatMsg | null = null;
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].type === "user") {
        userMsg = all[i];
        break;
      }
    }
    if (!userMsg) return;
    // Drop the error. If the failed turn left a partial assistant bubble (a
    // cut-off reply we kept on screen), drop that too so the re-run starts clean
    // from the user message instead of stacking a second answer below it.
    let next = all.filter((m) => m.id !== last.id);
    const tail = next[next.length - 1];
    if (tail && tail.type === "assistant") {
      next = next.filter((m) => m.id !== tail.id);
    }
    messagesRef.current = next;
    setMessages(next);
    handleSendMessage(userMsg.content, userMsg.files || [], userMsg);
  };

  // Function to stop the AI response generation
  const handleStopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setLoading(false);
      // Stop streaming. Drop an assistant bubble that never received any text
      // (an immediate stop) so it doesn't linger as an empty "Lumi"; keep and
      // freeze any partial response. Sync messagesRef synchronously so the
      // in-flight handler's abort finalize + save read THIS cleaned thread, not
      // a stale copy (which could re-add the empty bubble we just dropped).
      const base = Array.isArray(messagesRef.current)
        ? messagesRef.current
        : messages;
      const next = base
        .filter(
          (msg) =>
            !(msg.type === "assistant" && msg.isStreaming && !msg.content)
        )
        .map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg));
      messagesRef.current = next;
      setMessages(next);
    }
  };

  const handleTagSelection = ({
    selectedClasses: newClasses,
    selectedFiles: newFiles,
  }: {
    selectedClasses: any[];
    selectedFiles: any[];
  }) => {
    setSelectedClasses(newClasses);
    setSelectedFiles(newFiles);
  };

  const handleRemoveTag = (type: string, id: any) => {
    if (type === "class") {
      setSelectedClasses((prev) => prev.filter((classId) => classId !== id));
      const classFiles =
        allClasses.find((c: any) => c.id === id)?.files.map((f: any) => f.id) ||
        [];
      setSelectedFiles((prev) =>
        prev.filter((fileId) => !classFiles.includes(fileId))
      );
    } else {
      setSelectedFiles((prev) => prev.filter((fileId) => fileId !== id));
    }
  };

  const handleClearAll = () => {
    setSelectedClasses([]);
    setSelectedFiles([]);
    setUploadedLocalFiles([]);
  };

  const toggleDocumentSelection = (docId: any) => {
    setSelectedDocs((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  const toggleHistory = () => {
    if (!showHistory) {
      fetchChatHistory();
    }
    setShowHistory(!showHistory);
  };

  const loadConversation = async (conversationPair: ChatHistoryItem) => {
    setShowHistory(false);
    setCurrentConversationId(conversationPair.id);
    setCurrentSessionId(conversationPair.session_id || `session-${Date.now()}`);

    // If this conversation belongs to a session, fetch entire session to enable continuation
    let sessionConversations: any[] = [conversationPair];
    if (conversationPair.session_id) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const { data: sessionRows, error: sessionError } = await supabase
          .from("conversations")
          .select("*")
          .eq("session_id", conversationPair.session_id)
          .eq("user_id", user?.id)
          .order("created_at", { ascending: true });

        if (!sessionError && sessionRows && sessionRows.length) {
          sessionConversations = sessionRows;
        }
      } catch (e) {
        // fallback to single conversationPair
        console.warn("Error loading session conversations:", e);
      }
    }

    const messageArray: ChatMsg[] = [];
    for (const conv of sessionConversations) {
      messageArray.push(...messagesFromConv(conv));
    }

    setMessages(messageArray);

    if (conversationPair.context_classes) {
      setSelectedClasses(conversationPair.context_classes);
    }
    if (conversationPair.context_files) {
      setSelectedFiles(conversationPair.context_files);
    }

    // Scroll to bottom after loading conversation
    setTimeout(pinAndScrollToBottom, 100);
  };

  const handleNewConversation = () => {
    // Clear localStorage for this conversation
    const storageKey = `${STORAGE_KEY_PREFIX}${initialClassId || "global"}`;
    localStorage.removeItem(storageKey);

    // Reset the chat state
    setMessages([]);
    setCurrentConversationId(null);
    setCurrentSessionId(`session-${Date.now()}`);
    setSelectedDocs([]);

    // Reset the class and file selections based on context
    if (!initialClassId) {
      setSelectedClasses([]);
      setSelectedFiles([]);
    } else {
      setSelectedClasses([initialClassId]);
      setSelectedFiles([]);
    }

    // Update URL if needed
    if (window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete("conversationId");
      window.history.replaceState({}, "", url.toString());
    }

    // Close the history panel if it's open
    if (showHistory) {
      setShowHistory(false);
    }

    // Refresh the chat history
    fetchChatHistory();

    // Empty thread: re-pin so the next message starts glued to the bottom.
    pinAndScrollToBottom();
  };

  const handleTitleEdit = (conv: ChatHistoryItem) => {
    setEditingTitle(conv.id);
    setTitleInput(conv.title || "");
  };

  const handleTitleSave = async () => {
    if (!editingTitle || !titleInput.trim()) {
      setEditingTitle(null);
      return;
    }
    try {
      const { error } = await supabase
        .from("conversations")
        .update({ title: titleInput.trim() })
        .eq("id", editingTitle);

      if (error && error.code === "42703") {
        console.warn(
          "Title column does not exist yet. Update your database schema."
        );
      } else if (error) {
        throw error;
      }

      const newChatHistory = chatHistory.map((conv) =>
        conv.id === editingTitle ? { ...conv, title: titleInput.trim() } : conv
      );
      setChatHistory(newChatHistory);
    } catch (error) {
      console.error("Error updating conversation title:", error);
    }
    setEditingTitle(null);
  };

  const handleDeleteConfirm = (conv: ChatHistoryItem) => {
    setDeleteConfirm(conv);
  };

  const deleteConversation = async () => {
    if (!deleteConfirm) return;
    try {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", deleteConfirm.id);

      if (error) throw error;

      const newChatHistory = chatHistory.filter(
        (conv) => conv.id !== deleteConfirm.id
      );

      setChatHistory(newChatHistory);

      if (currentConversationId === deleteConfirm.id) {
        handleNewConversation();
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }

    setDeleteConfirm(null);
  };

  if (!isOpen) return null;

  if (initialLoading) {
    return (
      <motion.div
        className="fixed inset-0 z-1000 flex flex-col overflow-hidden atlas-sky pt-7.5 max-md:p-2.5"
        variants={scrimFade}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div className="flex h-full flex-col items-center justify-center">
          <Spinner label="Loading chat" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-1000 flex flex-col overflow-hidden atlas-sky pt-17 max-[1024px]:pt-16 max-md:px-2.5 max-md:pb-2.5 max-md:pt-15"
      variants={scrimFade}
      initial="hidden"
      animate="visible"
      exit="exit"
      tabIndex={-1}
    >
      {/* The desk's header rail - instrument keys over a veiled hairline band. */}
      <motion.div
        className="fixed left-0 top-0 z-110 flex w-full items-center gap-3.75 border-0 atlas-sky px-7 py-3.5 max-[1024px]:px-4.5 max-[1024px]:py-3 max-md:right-0 max-md:z-130 max-md:p-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex gap-3.75">
          <div className="relative">
            <IconButton
              variant="key"
              size="md"
              label="Chat history"
              aria-expanded={showHistory}
              className={`history-button ${
                showHistory ? "border-gold-deep! text-gold-deep!" : ""
              }`}
              onClick={toggleHistory}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </IconButton>
            <AnimatePresence>
              {showHistory && (
                <motion.div
                  className="absolute top-full mt-2 left-0 w-87.5 max-w-[calc(100vw-24px)] max-h-[70dvh] z-100 flex flex-col overflow-hidden rounded-xl border border-solid border-line bg-vellum shadow-float max-md:w-[min(90vw,300px)]"
                  style={{ transformOrigin: "top left" }}
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  transition={spring.plate}
                  ref={historyDropdownRef}
                >
                  <div className="border-0 border-b border-solid border-line px-5 pb-3 pt-4">
                    <h3 className={`m-0 ${UI.overline}`}>Chat History</h3>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto py-1.5 px-3 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {historyLoading ? (
                      <div className="flex flex-col items-center justify-center p-5">
                        <Spinner label="Loading history" />
                      </div>
                    ) : chatHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                        <Constellation
                          name="correspondence"
                          size={56}
                          className="text-ink/35"
                        />
                        <p className={`m-0 ${UI.overlineMuted}`}>
                          No conversation history yet
                        </p>
                      </div>
                    ) : (
                      chatHistory.map((conv) => (
                        <div
                          key={conv.id}
                          className="group relative mb-0.5 cursor-pointer rounded-lg border-0 border-b border-solid border-line px-2.5 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-cream/80"
                        >
                          {editingTitle === conv.id ? (
                            <div className="py-1.5 px-0">
                              <input
                                type="text"
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                autoFocus
                                onBlur={handleTitleSave}
                                onKeyDown={(e) =>
                                  e.key === "Enter" && handleTitleSave()
                                }
                                className="w-full rounded-md border border-solid border-ink/25 bg-white/80 px-2.5 py-1.5 font-display text-[14px] font-semibold text-ink transition-colors focus:border-gold-deep focus:outline-none"
                              />
                            </div>
                          ) : (
                            <>
                              <div
                                className="flex flex-col"
                                onClick={() => loadConversation(conv)}
                              >
                                <p className="mt-0 mx-0 mb-0.5 truncate font-display text-[14.5px] font-semibold leading-[1.3] text-ink">
                                  {conv.title || "New Conversation"}
                                </p>
                                <p className="mt-0 mx-0 mb-1.5 overflow-hidden text-ellipsis whitespace-nowrap pr-22 text-[12.5px] leading-[1.35] text-muted">
                                  {conv.displayQuestion}
                                </p>
                              </div>
                              <div className="flex items-center justify-between gap-2 pr-22">
                                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted/80">
                                  {new Date(
                                    conv.updated_at || conv.created_at
                                  ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                                {conv.classes && (
                                  <span className="overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-solid border-verdi/40 bg-sage/15 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-verdi">
                                    {conv.classes.name}
                                  </span>
                                )}
                              </div>
                              {/* Edit / delete float at the bottom-right (hover-revealed on
                                  desktop, always shown on touch). The text rows reserve right
                                  padding so they truncate with "..." before these buttons. */}
                              <div className="absolute bottom-2.5 right-2.5 flex gap-1.5 opacity-0 [transition:opacity_0.2s_ease] group-hover:opacity-100 max-md:opacity-100">
                                <IconButton
                                  size="sm"
                                  label="Edit title"
                                  className="h-8! w-8! bg-vellum text-ink/70 hover:border-ink hover:bg-ink hover:text-cream"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTitleEdit(conv);
                                  }}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                  </svg>
                                </IconButton>
                                <IconButton
                                  size="sm"
                                  variant="danger"
                                  label="Delete conversation"
                                  className="h-8! w-8! bg-vellum"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteConfirm(conv);
                                  }}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </IconButton>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {messages.length > 0 && (
            <IconButton
              variant="key"
              size="md"
              label="New conversation"
              onClick={handleNewConversation}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                <line x1="12" y1="7" x2="12" y2="13"></line>
                <line x1="9" y1="10" x2="15" y2="10"></line>
              </svg>
            </IconButton>
          )}
        </div>

        {/* Plate label - purely decorative observatory register. */}
        <p
          className="pointer-events-none absolute left-1/2 top-1/2 m-0 -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-muted/80 max-md:hidden"
          aria-hidden="true"
        >
          ✦&ensp;Correspondence&ensp;✦
        </p>

        <div className="flex-1"></div>

        {/* Right-side dismiss = close icon, matching the header instrument keys. */}
        <CloseButton variant="key" label="Close chat" onClick={handleClose} />
      </motion.div>

      <TagSelector
        isOpen={showTagSelector}
        onClose={() => setShowTagSelector(false)}
        classes={allClasses}
        onSelectTags={handleTagSelection}
        initialSelectedClasses={selectedClasses}
        initialSelectedFiles={selectedFiles}
      />

      <div className="flex flex-1 relative overflow-hidden">
        <motion.div
          className="flex-1 flex flex-col justify-center items-center w-full"
          animate={{
            width: "100%",
            marginRight: "0",
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
        >
          {documents.length > 0 && (
            <motion.div
              className="w-full border-0 border-b border-solid border-line px-5 py-3.75"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className={`m-0 ${UI.overlineMuted}`}>
                  Select documents for context
                </p>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gold-deep">
                  {selectedDocs.length} selected
                </span>
              </div>

              <div className="flex gap-2.5 overflow-x-auto pb-2.5 scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => toggleDocumentSelection(doc.id)}
                    className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-solid px-3 py-1.5 font-mono text-[12px] text-ink transition-colors duration-150 ${
                      selectedDocs.includes(doc.id)
                        ? "border-verdi bg-sage/40"
                        : "border-ink/25 bg-vellum hover:border-ink"
                    }`}
                  >
                    <div className="flex items-center opacity-70">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    </div>
                    {doc.name}
                    {selectedDocs.includes(doc.id) && (
                      <div
                        className="flex items-center text-[11px] leading-none text-gold-deep"
                        aria-hidden="true"
                      >
                        ✦
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {/* Scroll happens on the FULL width (ref here) so hovering anywhere
              scrolls; messages stay centered via the inner 820px column. */}
          <motion.div
            className="w-full flex-1 overflow-y-auto scrollbar-none [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-5 max-[1024px]:pb-3.5 max-md:pb-20"
            ref={chatContainerRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            {/* Centered content column - messages live here at max 820px. */}
            <div className="mx-auto flex min-h-full w-full max-w-205 flex-col px-5 max-[1024px]:max-w-none max-[1024px]:px-3.5 max-md:px-3">
              {messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
                  <div className="mb-6 text-ink/40">
                    <LumiStar size={76} orbit breathe />
                  </div>
                  <h3 className="mx-0 my-0 mb-2 font-display text-[26px] font-semibold tracking-[-0.01em] text-ink max-md:text-[23px]">
                    Start a conversation
                  </h3>
                  <p className="m-0 text-[15px] leading-[1.6] text-muted">
                    Ask your AI study assistant anything
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg.content}
                    type={msg.type}
                    isStreaming={!!msg.isStreaming}
                    files={msg.files || []}
                    contextFiles={msg.contextFiles || []}
                    statusLabel={msg.statusLabel}
                    isLast={i === messages.length - 1}
                    onRetry={handleRetry}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </motion.div>
          {/* `atlas-sky` is background-attachment:fixed, so the dock paints the
              SAME sky as the chat surface, aligned by viewport coords - a
              seamless, borderless blend that still hides messages scrolling
              under the fixed mobile dock (the sky is opaque). */}
          <div className="atlas-sky relative mx-auto w-full max-w-205 max-[1024px]:max-w-none max-md:fixed max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:z-120 max-md:py-2 max-md:px-3">
            {/* Floating "jump to latest" - only while unpinned; sits just above
                the dock (centered) and never overlaps it. */}
            <AnimatePresence>
              {showJumpButton && (
                <motion.div
                  className="pointer-events-none absolute -top-12 left-1/2 z-121 -translate-x-1/2 max-md:-top-11"
                  initial={{ opacity: 0, y: 8, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.85 }}
                  transition={spring.plate}
                >
                  <IconButton
                    variant="key"
                    size="md"
                    label="Jump to latest"
                    className="pointer-events-auto shadow-float"
                    onClick={pinAndScrollToBottom}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </IconButton>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(selectedClasses.length > 0 ||
                selectedFiles.length > 0 ||
                uploadedLocalFiles.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                >
                  <ContextTags
                    selectedClasses={selectedClasses}
                    selectedFiles={selectedFiles}
                    allClasses={allClasses}
                    onRemoveTag={handleRemoveTag}
                    onShowTagSelector={() => setShowTagSelector(true)}
                    uploadedFiles={uploadedLocalFiles}
                    onRemoveUploadedFile={(index) => {
                      setUploadedLocalFiles((prev) =>
                        prev.filter((_, i) => i !== index)
                      );
                    }}
                    onClearAll={handleClearAll}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <ChatInput
              onSendMessage={handleSendMessage}
              loading={loading}
              onShowTagSelector={() => setShowTagSelector(true)}
              onStopGeneration={handleStopGeneration}
              isGenerating={!!abortController}
              onUploadFiles={(files) => {
                // Add uploaded files to the unified context display
                setUploadedLocalFiles((prev) => [...prev, ...files]);
              }}
            />
          </div>
        </motion.div>
      </div>

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={deleteConversation}
        title="Delete Conversation"
        message="Are you sure you want to delete this conversation? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
      />
    </motion.div>
  );
};

export default ChatComponent;
