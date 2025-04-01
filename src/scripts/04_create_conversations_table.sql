-- Drop the table if it exists
DROP TABLE IF EXISTS public.conversations;

-- Create conversations table with class_id allowing NULL
CREATE TABLE public.conversations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id UUID NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    document_ids UUID[] DEFAULT '{}',
    context_classes UUID[] DEFAULT '{}',
    context_files UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_class_id ON public.conversations(class_id);
CREATE INDEX idx_conversations_created_at ON public.conversations(created_at);

-- Enable Row Level Security
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Users can view their own conversations
CREATE POLICY "Users can view their own conversations" 
    ON public.conversations 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Users can insert their own conversations
CREATE POLICY "Users can insert their own conversations" 
    ON public.conversations 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
CREATE POLICY "Users can update their own conversations" 
    ON public.conversations 
    FOR UPDATE 
    USING (auth.uid() = user_id);

-- Users can delete their own conversations
CREATE POLICY "Users can delete their own conversations" 
    ON public.conversations 
    FOR DELETE 
    USING (auth.uid() = user_id);

-- Add comment to table
COMMENT ON TABLE public.conversations IS 'Stores user conversations with the AI assistant';
