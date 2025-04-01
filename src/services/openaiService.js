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
export const fetchStreamingResponse = async (userMessage, context = "", onToken, signal) => {
  try {
    if (!API_KEY) {
      console.error("OpenAI API key not found in environment variables.");
      return { 
        text: null,
        error: "API key not configured", 
        errorType: "config"
      };
    }

    const systemPrompt = context 
      ? `You are Lumi AI, an intelligent study assistant designed to help students learn more effectively. 
      
The following is information about the student's study materials:
${context}

Use this information to provide helpful, accurate answers to the student's questions. 
Format your responses using Markdown for better readability. Use headings, bullet points, 
and code blocks as appropriate. If showing code examples, use proper syntax highlighting.`
      : "You are Lumi AI, an intelligent study assistant designed to help students learn more effectively. Format your responses using Markdown for better readability. Use headings, bullet points, and code blocks as appropriate.";

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
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
export const fetchAIResponse = async (userMessage, context = "") => {
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

    const systemPrompt = context 
      ? `You are Lumi AI, an intelligent study assistant designed to help students learn more effectively. 
      
The following is information about the student's study materials:
${context}

Use this information to provide helpful, accurate answers to the student's questions. If asked about class materials, file counts, or other details, refer to the information provided above. Be concise but thorough in your responses.`
      : "You are Lumi AI, an intelligent study assistant designed to help students learn more effectively. Provide concise, helpful answers to questions.";

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7,
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
        model: "gpt-4",
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
        model: "gpt-3.5-turbo", // Using a smaller model for efficiency
        messages: [
          {
            role: "system",
            content: "Generate a short, concise title (maximum 6 words) for this conversation. Return only the title with no extra text, punctuation, or quotes."
          },
          { role: "user", content: userMessage },
          { role: "assistant", content: aiResponse }
        ],
        temperature: 0.7,
        max_tokens: 15,
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
