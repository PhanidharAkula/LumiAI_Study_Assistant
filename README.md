# Lumi AI - Your AI Study Assistant

Lumi AI is an intelligent study assistant designed to help students learn more effectively by leveraging AI to provide insights, summaries, and answer questions about their study materials.

![Lumi AI](./src/assets/home.png)

## Features

- **AI-powered Chat**: Ask questions about your study materials and get intelligent responses
- **Document Management**: Upload and organize your study documents by class
- **Contextual Understanding**: Lumi references your specific documents to provide relevant answers
- **Conversation History**: Save and review your previous interactions with the AI
- **Smart Responses**: Generate flashcards, summaries, and study outlines from your materials
- **Dark/Light Mode**: Study comfortably in any environment with theme switching

## Recent Updates

- Added left/right message alignment in chat interface for better readability
- Fixed database table creation and storage access issues
- Improved AI intelligence with better context handling
- Enhanced the user interface with responsive design
- Added document selection for targeted AI responses
- Fixed conversation history storage and retrieval

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account
- OpenAI API key

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/LumiAI.git
   cd LumiAI
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the project root with the following variables:

   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_OPENAI_API_KEY=your_openai_api_key
   ```

4. Set up the required Supabase resources:

   - Run the SQL scripts in `src/scripts/` to create necessary tables
   - Create a storage bucket named "files"

5. Start the development server:
   ```bash
   npm run dev
   ```

### Supabase Setup

1. Create a new Supabase project
2. Set up authentication (email sign-in)
3. Create required tables:
   - Run this SQL in the Supabase SQL Editor to create conversations table:

```sql
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  document_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_conversations_class_id ON public.conversations(class_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
```

4. Create a storage bucket named "files" and make it public

## Usage

1. Sign up for an account
2. Create a class
3. Upload study materials to your class
4. Chat with Lumi AI about your materials
5. Select specific documents when asking targeted questions

## Troubleshooting

- **Storage Issues**: If file uploads fail, ensure the "files" bucket exists in your Supabase project
- **Database Errors**: Run the SQL setup scripts in the Supabase SQL Editor
- **AI Not Responding**: Check that your OpenAI API key is valid and has sufficient credits
