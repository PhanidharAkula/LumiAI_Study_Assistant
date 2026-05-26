-- Create flashcard_history table to store generated flashcard decks
CREATE TABLE IF NOT EXISTS flashcard_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  cards JSONB NOT NULL, -- stores the flashcard deck (array of {front, back, category})
  num_cards INTEGER NOT NULL,
  card_style VARCHAR(50) NOT NULL DEFAULT 'standard', -- standard, definition, qa
  source_files TEXT[] NOT NULL DEFAULT '{}', -- array of file names used to generate
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by user and class
CREATE INDEX IF NOT EXISTS idx_flashcard_history_user_id ON flashcard_history(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_history_class_id ON flashcard_history(class_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_history_created_at ON flashcard_history(created_at DESC);

-- Enable RLS
ALTER TABLE flashcard_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own flashcard history
CREATE POLICY "Users can view their own flashcard history"
  ON flashcard_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own flashcard history
CREATE POLICY "Users can insert their own flashcard history"
  ON flashcard_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own flashcard history
CREATE POLICY "Users can update their own flashcard history"
  ON flashcard_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own flashcard history
CREATE POLICY "Users can delete their own flashcard history"
  ON flashcard_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_flashcard_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_flashcard_history_updated_at
  BEFORE UPDATE ON flashcard_history
  FOR EACH ROW
  EXECUTE FUNCTION update_flashcard_history_updated_at();

-- Grant permissions
GRANT ALL ON flashcard_history TO authenticated;
GRANT ALL ON flashcard_history TO service_role;
