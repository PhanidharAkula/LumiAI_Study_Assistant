/**
 * OpenAI API service for handling AI chat interactions
 * In production: Uses secure backend API (/api/chat)
 * In development: Can use direct OpenAI calls with VITE_OPENAI_API_KEY
 */

// Check if we're in development mode and have a local API key
const isDevelopment = import.meta.env.MODE === 'development';
const DEV_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const USE_BACKEND = !isDevelopment || !DEV_API_KEY;

// Use backend API in production, or direct OpenAI in dev if key is available
const API_URL = USE_BACKEND ? "/api/chat" : "https://api.openai.com/v1/chat/completions";

console.log('OpenAI Service Config:', { 
  isDevelopment, 
  useBackend: USE_BACKEND,
  hasDevKey: !!DEV_API_KEY 
});

/**
 * Parses OpenAI API errors to provide meaningful messages
 * @param {Error} error - The error object 
 * @returns {string} A user-friendly error message
 */
const parseOpenAIError = (error) => {
  const errorMessage = error.message || '';
  
  if (errorMessage.includes('exceeded your current quota')) {
    return "OpenAI API quota exceeded. Please check your billing details in your OpenAI account or update your API key.";
  }
  
  if (errorMessage.includes('rate limit') || errorMessage.includes('Too many requests')) {
    return "OpenAI API rate limit reached. Please try again in a few moments.";
  }
  
  if (errorMessage.includes('invalid_api_key') || errorMessage.includes('Authentication error')) {
    return "Invalid OpenAI API key. Please check your API key configuration.";
  }
  
  if (error.status === 429) {
    return "Too many requests to OpenAI API. Please try again later.";
  }
  
  return "Error connecting to OpenAI. Please try again later.";
};

/**
 * Fetches a streaming response from OpenAI's API
 * @param {string} userMessage - The user's message
 * @param {string} context - Optional context from documents
 * @param {function} onToken - Callback for each token received
 * @param {AbortSignal} signal - Optional AbortSignal to cancel the request
 * @returns {Promise<Object>} Object containing response text or error
 */
export const fetchStreamingResponse = async (userMessage, context = "", onToken, signal, history = []) => {
  try {
    // Use a general ChatGPT-style assistant persona by default. When context is
    // provided, include it as an explicit block the model can reference. The
    // assistant should ask clarifying questions when the user's query is
    // ambiguous, and should avoid inventing access to files it doesn't have.
  const formattingGuidelines = `
  When you answer, provide a thorough, structured response using Markdown.
  Use clear section headings, short paragraphs, bullet lists, and examples.
  When showing code, include syntax-highlighted fenced code blocks and a brief explanation of the code.
  End with a short "Next steps" or follow-up question.
  If an acronym has multiple common meanings, provide the most likely technical/AI meaning first, then briefly list other common meanings.
  Do NOT include prefatory lines such as "ChatGPT said:" or informal lead-ins like "Alright, here's.".
  Keep explanations clear but comprehensive.`;

    const systemPrompt = context
      ? `You are a helpful, honest, and clear conversational assistant (like ChatGPT).

      The user may have selected study materials (classes and files) to provide as context.
      The following block is context that you SHOULD use when it is relevant to the user's question.

      === BEGIN CONTEXT ===
      ${context}
      === END CONTEXT ===

      Use the context above when the user asks about those classes or files. If the user asks general questions, answer as a general-purpose assistant. Ask brief clarifying questions when the user's message is ambiguous. ${formattingGuidelines}`
      : `You are a helpful, honest, and clear conversational assistant (like ChatGPT). Answer conversationally and ask concise clarifying questions when the user's intent is unclear. ${formattingGuidelines}`;

    const messagesPayload = [
      { role: "system", content: systemPrompt },
      // include any prior turns if provided (history should be array of {role,content})
      ...((Array.isArray(history) && history.length) ? history : []),
      { role: "user", content: userMessage },
    ];

    // Prepare request based on whether we're using backend or direct API
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal, // Pass the AbortSignal to fetch
    };

    // If using backend API, send messages directly
    if (USE_BACKEND) {
      fetchOptions.body = JSON.stringify({
        messages: messagesPayload,
        stream: true,
      });
    } else {
      // If using direct OpenAI API (dev mode), send full request
      fetchOptions.headers.Authorization = `Bearer ${DEV_API_KEY}`;
      fetchOptions.body = JSON.stringify({
        model: "gpt-4o-mini",
        messages: messagesPayload,
        temperature: 0.7,
        max_tokens: 2000,
        stream: true,
      });
    }

    const response = await fetch(API_URL, fetchOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || "Failed to get response from AI";
      
      if (errorMessage.includes('exceeded your current quota') || 
          errorMessage.includes('Too many requests') || 
          response.status === 429) {
        return {
          text: null,
          error: parseOpenAIError({ message: errorMessage, status: response.status }),
          errorType: "quota"
        };
      }
      
      throw new Error(errorMessage);
    }

    // Process the stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let completeResponse = '';

    // Read the stream
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        // Process each line in the chunk
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content;
              
              if (content) {
                completeResponse += content;
                onToken(content);
              }
            } catch (error) {
              console.error('Error parsing stream:', error);
            }
          }
        }
      }
    } catch (error) {
      // Check if this is an abort error
      if (error.name === 'AbortError') {
        return {
          text: completeResponse || null,
          error: "aborted"
        };
      }
      throw error;
    }

    return {
      text: completeResponse,
      error: null
    };
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    // Check if this is an abort error
    if (error.name === 'AbortError') {
      return { 
        text: null,
        error: "aborted"
      };
    }
    return { 
      text: null,
      error: parseOpenAIError(error),
      errorType: "api"
    };
  }
};

/**
 * Fetches a response from OpenAI's API based on user input (non-streaming version)
 * @param {string} userMessage - The user's message
 * @param {string} context - Optional context from documents
 * @returns {Promise<Object>} Object containing response text and any error info
 */
export const fetchAIResponse = async (userMessage, context = "", history = []) => {
  try {
  const formattingGuidelines = `When you answer, provide a thorough, structured response using Markdown. Use headings, short paragraphs, bullet lists, and examples. When showing code, provide syntax-highlighted code fences and a brief explanation of the code. If an acronym has multiple common meanings, provide the most likely technical/AI meaning first, then briefly list other common meanings. If the user asks follow-ups, reference earlier turns as needed. Keep explanations clear but comprehensive.`;

    const systemPrompt = context
      ? `You are a helpful, honest, and clear conversational assistant (like ChatGPT).

      The user may have provided context about classes and files below.

      === BEGIN CONTEXT ===
      ${context}
      === END CONTEXT ===

      When answering, incorporate the context above if it is relevant. If the user's question is general, respond as a general-purpose assistant. Ask concise clarifying questions if needed. ${formattingGuidelines}`
      : `You are a helpful, honest, and clear conversational assistant (like ChatGPT). Answer the user's question directly and ask brief clarifying questions when the user's message is ambiguous. ${formattingGuidelines}`;

    const messagesPayload = [
      { role: "system", content: systemPrompt },
      ...((Array.isArray(history) && history.length) ? history : []),
      { role: "user", content: userMessage },
    ];

    // Prepare request based on whether we're using backend or direct API
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    // If using backend API, send messages directly
    if (USE_BACKEND) {
      fetchOptions.body = JSON.stringify({
        messages: messagesPayload,
        stream: false,
      });
    } else {
      // If using direct OpenAI API (dev mode), send full request
      fetchOptions.headers.Authorization = `Bearer ${DEV_API_KEY}`;
      fetchOptions.body = JSON.stringify({
        model: "gpt-4o-mini",
        messages: messagesPayload,
        temperature: 0.8,
        max_tokens: 500,
      });
    }

    const response = await fetch(API_URL, fetchOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || "Failed to get response from AI";
      
      console.error("OpenAI API error:", errorData);
      
      // Check for quota exceeded error
      if (errorMessage.includes('exceeded your current quota') || 
          errorMessage.includes('Too many requests') || 
          response.status === 429) {
        return {
          text: null,
          error: parseOpenAIError({ message: errorMessage, status: response.status }),
          errorType: "quota",
          errorDetail: errorMessage
        };
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return {
      text: data.choices[0].message.content.trim(),
      error: null
    };
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    return { 
      text: null,
      error: parseOpenAIError(error),
      errorType: "api",
      errorDetail: error.message
    };
  }
};

/**
 * Generates flashcards from content
 * @param {string} content - The content to generate flashcards from
 * @returns {Promise<Array>} Array of flashcard objects
 */
export const generateFlashcards = async (content) => {
  try {
    const messagesPayload = [
      { 
        role: "system", 
        content: "Generate 5 study flashcards from the following content. Return only a JSON array with objects containing 'front' and 'back' properties." 
      },
      { role: "user", content }
    ];

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (USE_BACKEND) {
      fetchOptions.body = JSON.stringify({
        messages: messagesPayload,
        stream: false,
      });
    } else {
      fetchOptions.headers.Authorization = `Bearer ${DEV_API_KEY}`;
      fetchOptions.body = JSON.stringify({
        model: "gpt-4o-mini",
        messages: messagesPayload,
        temperature: 0.7,
        max_tokens: 1000,
      });
    }

    const response = await fetch(API_URL, fetchOptions);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Failed to generate flashcards");
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Extract JSON from the response
    const jsonMatch = content.match(/\[.*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error("Could not parse flashcards from response");
  } catch (error) {
    console.error("Error generating flashcards:", error);
    return [];
  }
};

/**
 * Generates a title for a conversation based on content
 * @param {string} userMessage - User's question
 * @param {string} aiResponse - AI's answer
 * @returns {Promise<string>} Generated title
 */
export const generateConversationTitle = async (userMessage, aiResponse) => {
  try {
    const messagesPayload = [
      {
        role: "system",
        content: `You are a concise title generator. 
                  Given a user's question and the AI's reply, create a short but meaningful title that captures the main topic or purpose of the conversation.
                  Rules:
                  - Keep it under 7 words.
                  - Use natural capitalization (e.g., "Understanding React Hooks").
                  - Do NOT use quotes or punctuation at the ends.
                  - Focus on clarity and relevance, not just generic terms.`
      },
      { role: "user", content: userMessage },
      { role: "assistant", content: aiResponse }
    ];

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (USE_BACKEND) {
      fetchOptions.body = JSON.stringify({
        messages: messagesPayload,
        stream: false,
      });
    } else {
      fetchOptions.headers.Authorization = `Bearer ${DEV_API_KEY}`;
      fetchOptions.body = JSON.stringify({
        model: "gpt-4o-mini",
        messages: messagesPayload,
        temperature: 0.8,
        max_tokens: 25,
      });
    }

    const response = await fetch(API_URL, fetchOptions);

    if (!response.ok) {
      return "New Conversation";
    }

    const data = await response.json();
    const title = data.choices[0].message.content.trim();
    
    // Remove quotes if present
    return title.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error("Error generating conversation title:", error);
    return "New Conversation";
  }
};
