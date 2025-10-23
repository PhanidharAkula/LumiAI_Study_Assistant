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
    // Enhanced system prompt for more intelligent, engaging responses
    const formattingGuidelines = `
## Response Style Guidelines:

**Tone & Personality:**
- Be genuinely helpful, intelligent, and conversational - like talking to a knowledgeable friend
- Show enthusiasm and engagement with the topic
- Use natural language, contractions, and conversational phrasing
- Be personable but professional - avoid being overly formal or robotic

**Response Structure:**
- Start with direct, contextual acknowledgment (avoid generic "How can I help?" responses)
- For simple greetings, be warm and offer specific ways you can help
- For complex topics, provide comprehensive, well-organized explanations
- Use clear section headings (##, ###) for longer responses
- Include practical examples, analogies, and real-world applications
- Add code blocks with syntax highlighting when relevant
- End with thought-provoking questions or actionable next steps

**Content Quality:**
- Provide thorough, detailed explanations that go beyond surface-level information
- Share insights, best practices, and context that demonstrates deep understanding
- When listing items, explain WHY they matter, not just WHAT they are
- Include relevant warnings, tips, or "pro tips" where helpful
- Connect concepts to broader ideas and practical applications

**Engagement:**
- Ask clarifying questions when the user's intent is ambiguous
- Suggest related topics they might find interesting
- Anticipate follow-up questions and address them preemptively
- Show curiosity about their learning goals or projects

**Formatting:**
- Use bullet points and numbered lists effectively
- Include emojis sparingly for emphasis (✅, 🎯, 💡, ⚠️, 🚀)
- Format code with proper syntax highlighting
- Use bold and italics for emphasis
- Keep paragraphs short and scannable

**What NOT to do:**
- Don't use prefatory phrases like "ChatGPT said:" or "Alright, here's..."
- Don't give overly brief answers to complex questions
- Don't be generic or templated in your responses
- Don't just list facts without context or explanation
- Don't end with bland "Let me know if you need anything else"`;

    const systemPrompt = context
      ? `You are Lumi - an exceptionally intelligent, engaging, and helpful AI study assistant. You're like having a brilliant tutor who genuinely cares about helping students learn and understand complex topics.

**Context Awareness:**
The user has provided study materials (classes and files) as context below. Use this context thoughtfully when relevant to their questions.

=== BEGIN STUDY MATERIALS ===
${context}
=== END STUDY MATERIALS ===

**Your Approach:**
- When questions relate to their study materials, reference specific content and explain how concepts connect
- For general questions, provide comprehensive, insightful answers that go beyond basic facts
- Adapt your depth and style based on the complexity of their question
- Be proactive in offering related insights and deeper understanding
- Make learning engaging by connecting abstract concepts to concrete examples

${formattingGuidelines}`
      : `You are Lumi - an exceptionally intelligent, engaging, and helpful AI assistant. Think of yourself as a knowledgeable friend who loves diving deep into topics and making complex ideas accessible and interesting.

**Your Personality:**
- Genuinely curious and enthusiastic about learning and teaching
- Conversational but insightful - you explain things clearly without dumbing them down
- You understand context and can read between the lines
- You provide thorough, well-researched responses that show deep understanding
- You're helpful without being patronizing

**Your Approach:**
- For simple greetings, be warm and offer specific, relevant help based on the app's purpose (study assistant)
- For questions, provide comprehensive answers with context, examples, and practical insights
- Explain not just "what" but "why" and "how"
- Connect ideas to broader concepts and real-world applications
- Anticipate follow-up questions and address them proactively

${formattingGuidelines}`;

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
        temperature: 0.8,    // Higher for more engaging responses
        max_tokens: 4000,     // Increased for detailed responses
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
  // Use the same enhanced guidelines as streaming version
  const formattingGuidelines = `
## Response Style Guidelines:

**Tone & Personality:**
- Be genuinely helpful, intelligent, and conversational
- Show enthusiasm and engagement with the topic
- Use natural language and conversational phrasing

**Response Structure:**
- Provide comprehensive, well-organized explanations
- Use clear section headings for longer responses
- Include practical examples and real-world applications
- Add code blocks with syntax highlighting when relevant

**Content Quality:**
- Provide thorough, detailed explanations
- Share insights and best practices
- When listing items, explain WHY they matter
- Connect concepts to broader ideas

**Formatting:**
- Use bullet points and numbered lists effectively
- Include emojis sparingly for emphasis
- Keep paragraphs short and scannable`;

    const systemPrompt = context
      ? `You are Lumi - an exceptionally intelligent and engaging AI study assistant. Use the study materials provided below when relevant to answer questions with depth and insight.

=== BEGIN STUDY MATERIALS ===
${context}
=== END STUDY MATERIALS ===

${formattingGuidelines}`
      : `You are Lumi - an exceptionally intelligent and engaging AI assistant. Be conversational, insightful, and provide thorough explanations that go beyond basic facts. ${formattingGuidelines}`;

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
        max_tokens: 4000,    // Increased for longer responses
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
