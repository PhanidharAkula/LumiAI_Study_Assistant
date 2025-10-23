/**
 * Vercel Serverless Function for OpenAI Chat API
 * This keeps the API key secure on the server-side
 */

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get API key from environment (server-side only)
  const API_KEY = process.env.OPENAI_API_KEY;
  
  // Debug logging (will appear in Vercel function logs)
  console.log('Environment check:', {
    hasKey: !!API_KEY,
    keyPrefix: API_KEY ? API_KEY.substring(0, 7) + '...' : 'undefined',
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('OPENAI') || k.includes('API'))
  });
  
  if (!API_KEY) {
    console.error('OPENAI_API_KEY not found in environment variables');
    console.error('Available env vars:', Object.keys(process.env));
    return res.status(500).json({ 
      error: 'Server configuration error',
      debug: 'OPENAI_API_KEY environment variable is not set'
    });
  }

  try {
    const { messages, stream = true } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request: messages array required' });
    }

    // Make request to OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        stream,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', errorData);
      
      // Return user-friendly error messages
      let errorMessage = 'Failed to get response from AI';
      if (response.status === 401) {
        errorMessage = 'Authentication error with AI service';
      } else if (response.status === 429) {
        errorMessage = 'Too many requests. Please try again later.';
      } else if (response.status === 500) {
        errorMessage = 'AI service is temporarily unavailable';
      }
      
      return res.status(response.status).json({ 
        error: errorMessage,
        details: errorData 
      });
    }

    // For streaming responses
    if (stream) {
      // Set headers for Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      // Pipe the OpenAI stream to the client
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            res.write('data: [DONE]\n\n');
            res.end();
            break;
          }

          // Decode and forward the chunk
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
        res.end();
      }
    } else {
      // For non-streaming responses
      const data = await response.json();
      return res.status(200).json(data);
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
