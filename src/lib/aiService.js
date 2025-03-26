import { supabase } from './supabaseClient';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Send a message to the OpenAI API
 * @param {string} message - User's message
 * @param {Array} files - Array of file objects with name and url
 * @param {string} classId - ID of the current class
 * @returns {Promise<Object>} - AI response
 */
export async function sendMessageToAI(message, files = [], classId) {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is missing. Please check your environment variables.");
  }

  try {
    // Get previous conversation for context (increased from 5 to 8)
    const { data: conversations } = await supabase
      .from('conversations')
      .select('question, answer')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
      .limit(8);
    
    // Format context from previous conversations and files
    let context = ""; 
    
    if (conversations && conversations.length > 0) {
      context += "Previous conversations (most recent first):\n";
      conversations.forEach(conv => {
        context += `User: ${conv.question}\nYou: ${conv.answer}\n\n`;
      });
    }
    
    // Enhanced file context
    if (files.length > 0) {
      context += "Available study materials (assume these are the files the user is referring to):\n";
      files.forEach((file, index) => {
        context += `${index + 1}. "${file.name}" (ID: ${file.id})\n`;
      });
    }
    
    const systemPrompt = `You are Lumi AI, an intelligent study assistant designed to help students learn more effectively.

YOU MUST FOLLOW THESE RULES:
1. Be helpful, concise, and accurate.
2. Always assume the user is a student asking about their uploaded study materials.
3. When a student asks about content, assume they're referring to their uploaded files.
4. Never ask for clarification about which document they're referring to - use their most recently uploaded documents.
5. Make educated inferences from context rather than asking for clarification.
6. If asked to explain concepts, create flashcards, or summarize, do so immediately without asking for more specifics.
7. If the question is vague, pick the most likely interpretation and respond accordingly.
8. Use an engaging, friendly, and educational tone.
9. Format your responses with Markdown for readability.
10. When creating educational content like flashcards, quizzes, or summaries, make them comprehensive and directly useful for studying.

${context}

Remember: You have access to the user's course materials. While you can't directly read the content, you should operate under the assumption that the user's questions relate to these documents. Be confident and helpful in your responses.`;

    // Get the most recent conversations to build conversational context
    const conversationHistory = conversations ? 
      conversations.slice(0, 4).map(c => ({
        userQuestion: c.question,
        aiResponse: c.answer
      })).reverse() : [];
      
    // Build messages array with conversation history for better context
    let messages = [
      {
        role: "system",
        content: systemPrompt
      }
    ];
    
    // Add conversation history to provide context
    if (conversationHistory.length > 0) {
      conversationHistory.forEach(exchange => {
        messages.push({
          role: "user",
          content: exchange.userQuestion
        });
        messages.push({
          role: "assistant",
          content: exchange.aiResponse
        });
      });
    }
    
    // Add the current user message
    messages.push({
      role: "user",
      content: message
    });

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get AI response');
    }

    const data = await response.json();
    
    return {
      text: data.choices[0].message.content,
      sources: [] // In a real implementation, you could extract citation sources here
    };
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    throw error;
  }
}

/**
 * Generate a summary of a document
 * @param {string} text - The document text to summarize
 * @returns {Promise<string>} - Summary of the document
 */
export async function generateSummary(text) {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is missing");
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: "Generate a concise summary of the following text, highlighting the key points and main ideas."
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.5,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate summary');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error generating summary:", error);
    throw error;
  }
}

/**
 * Generate flashcards from text
 * @param {string} text - The document text to create flashcards from
 * @param {number} count - Number of flashcards to generate (default: 10)
 * @returns {Promise<Array>} - Array of flashcard objects with question and answer properties
 */
export async function generateFlashcards(text, count = 10) {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is missing");
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: "Generate study flashcards from the provided text. Each flashcard should have a concise question on one side and a comprehensive answer on the other. Focus on key concepts, definitions, and important facts. Format the output as a JSON array of objects with 'question' and 'answer' properties."
          },
          {
            role: "user",
            content: `Generate ${count} study flashcards from the following text:\n\n${text}`
          }
        ],
        temperature: 0.5,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate flashcards');
    }

    const data = await response.json();
    const parsedResponse = JSON.parse(data.choices[0].message.content);
    return parsedResponse.flashcards || [];
  } catch (error) {
    console.error("Error generating flashcards:", error);
    throw error;
  }
}

/**
 * Generate practice quiz questions
 * @param {string} text - Document content to generate questions from
 * @param {number} count - Number of questions to generate
 * @returns {Promise<Array>} - Array of quiz question objects
 */
export async function generateQuiz(text, count = 5) {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key is missing");
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: "Create practice quiz questions with multiple choice options and explanations for the correct answer. Format as JSON with 'question', 'options' (array), 'correctAnswer' (index), and 'explanation' properties."
          },
          {
            role: "user",
            content: `Generate ${count} quiz questions from the following study material:\n\n${text}`
          }
        ],
        temperature: 0.6,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate quiz');
    }

    const data = await response.json();
    const parsedResponse = JSON.parse(data.choices[0].message.content);
    return parsedResponse.questions || [];
  } catch (error) {
    console.error("Error generating quiz:", error);
    throw error;
  }
}
