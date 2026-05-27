-- Create quiz_history table to store completed quizzes
CREATE TABLE IF NOT EXISTS quiz_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  quiz_data JSONB NOT NULL, -- stores the entire quiz (questions, difficulty, etc.)
  user_answers JSONB NOT NULL, -- stores user's answers to each question
  score JSONB NOT NULL, -- stores scoring data (totalPoints, earnedPoints, percentage, results)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by user and class
CREATE INDEX IF NOT EXISTS idx_quiz_history_user_id ON quiz_history(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_history_class_id ON quiz_history(class_id);
CREATE INDEX IF NOT EXISTS idx_quiz_history_created_at ON quiz_history(created_at DESC);

-- Enable RLS
ALTER TABLE quiz_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own quiz history
CREATE POLICY "Users can view their own quiz history"
  ON quiz_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own quiz history
CREATE POLICY "Users can insert their own quiz history"
  ON quiz_history
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own quiz history (for retakes, etc.)
CREATE POLICY "Users can update their own quiz history"
  ON quiz_history
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own quiz history
CREATE POLICY "Users can delete their own quiz history"
  ON quiz_history
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_quiz_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quiz_history_updated_at
  BEFORE UPDATE ON quiz_history
  FOR EACH ROW
  EXECUTE FUNCTION update_quiz_history_updated_at();
