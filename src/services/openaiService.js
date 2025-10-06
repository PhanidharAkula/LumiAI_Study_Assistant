/**
 * OpenAI API service for handling AI chat interactions
 */

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const API_URL = "https://api.openai.com/v1/chat/completions";

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
  
  if (errorMessage.includes('rate limit')) {
    return "OpenAI API rate limit reached. Please try again in a few moments.";
  }
  
  if (errorMessage.includes('invalid_api_key')) {
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
    if (!API_KEY) {
      console.error("OpenAI API key not found in environment variables.");
      return { 
        text: null,
        error: "API key not configured", 
        errorType: "config"
      };
    }

    // Use a general ChatGPT-style assistant persona by default. When context is
    // provided, include it as an explicit block the model can reference. The
    // assistant should ask clarifying questions when the user's query is
    // ambiguous, and should avoid inventing access to files it doesn't have.
  const formattingGuidelines = `When you answer, provide a thorough, structured response using Markdown. Start with a one-line TL;DR, then a "Detailed explanation" section with headings, short paragraphs, bullet lists and examples. When showing code, include syntax-highlighted fenced code blocks and a brief explanation of the code. End with a short "Next steps" or follow-up question. If an acronym has multiple common meanings, provide the most likely technical/AI meaning first, then briefly list other common meanings. Do NOT include prefatory lines such as "ChatGPT said:" or informal lead-ins like "Alright, here's...". Keep explanations clear but comprehensive.`;

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

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: messagesPayload,
        temperature: 0.7,
        max_tokens: 1000,
        stream: true,
      }),
      signal, // Pass the AbortSignal to fetch
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.error?.message || "Failed to get response from OpenAI";
      
      if (errorMessage.includes('exceeded your current quota') || response.status === 429) {
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
    if (!API_KEY) {
      console.error("OpenAI API key not found in environment variables.");
      return { 
        text: null,
        error: "API key not configured", 
        errorType: "config",
        errorDetail: "OpenAI API key not found in environment variables."
      };
    }

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

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messagesPayload,
        temperature: 0.8,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.error?.message || "Failed to get response from OpenAI";
      
      console.error("OpenAI API error:", errorData);
      
      // Check for quota exceeded error
      if (errorMessage.includes('exceeded your current quota') || response.status === 429) {
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
    if (!API_KEY) {
      throw new Error("API key not configured");
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { 
            role: "system", 
            content: "Generate 5 study flashcards from the following content. Return only a JSON array with objects containing 'front' and 'back' properties." 
          },
          { role: "user", content }
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to generate flashcards");
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
    if (!API_KEY) {
      return "New Conversation";
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
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
        ],
        temperature: 0.8,
        max_tokens: 25,
      }),
    });

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
