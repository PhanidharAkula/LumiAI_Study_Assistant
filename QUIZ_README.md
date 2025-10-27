# Quiz Feature - Setup and Usage Guide

## Database Setup

Before using the quiz feature, you need to run the database migration script to create the `quiz_history` table.

### Steps:

1. Open Supabase SQL Editor
2. Navigate to the SQL editor
3. Copy the contents of `/src/scripts/09_create_quiz_history_table.sql`
4. Paste and run the script
5. Verify the table was created successfully

The script creates:

- `quiz_history` table with JSONB columns for flexible data storage
- Indexes for performance optimization
- Row Level Security (RLS) policies
- Automatic timestamp triggers

## Quiz Feature Overview

The quiz feature allows students to test their knowledge on class materials with AI-generated questions.

### Key Features:

1. **Difficulty Levels**: Easy, Medium, Hard

   - Easy: 5-10 points per question
   - Medium: 8-15 points per question
   - Hard: 12-20 points per question

2. **Question Counts**: 10, 20, 30, 50, or 100 questions

3. **File Selection**: Select specific files from a class to generate questions

4. **Question Types**:

   - Multiple Choice (4 options)
   - True/False (2 options)
   - Short Answer (text input)

5. **Dynamic Scoring**: Points assigned based on question complexity

6. **Quiz History**: View all past quizzes with scores and review answers

## How to Use

### For Users:

1. **Navigate to a Class**:

   - Go to Dashboard
   - Select a class from your classes
   - Click on the class to view ClassDetails

2. **Start Quiz**:

   - Click the "Quiz" button in the study tools section
   - Configure quiz settings:
     - Select difficulty level (Easy/Medium/Hard)
     - Choose number of questions (10/20/30/50/100)
     - Select files to generate questions from (at least one required)
   - Click "Generate Quiz"

3. **Take Quiz**:

   - Answer all questions
   - Progress bar shows completion status
   - Different input types for different question types
   - Submit button enables when all questions are answered

4. **Review Results**:

   - View overall score with percentage and points
   - Review each question with:
     - Your answer
     - Correct answer (if incorrect)
     - Explanation
   - Options to:
     - Retake with same settings
     - Generate new quiz with different settings
     - Return to class

5. **View History**:
   - Click the history icon (clock/trophy) in quiz header
   - View all past quizzes for this class
   - Click any history item to review that quiz
   - See date, score, and quiz configuration

## Technical Details

### File Content Extraction:

- **PDF Files**: Extracts up to 30 pages, max 50,000 characters
- **Text Files**: Extracts up to 50,000 characters
- **Other Files**: Shows file name with note about unsupported extraction

### Quiz Generation:

- Uses OpenAI GPT-4 to generate questions based on file content
- Streaming response for better UX
- JSON parsing with validation and error handling
- Questions include explanations for learning

### Data Storage:

```sql
quiz_history {
  id: UUID,
  user_id: UUID,
  class_id: UUID,
  quiz_data: JSONB {
    questions: Array<Question>,
    difficulty: string,
    numQuestions: number,
    selectedFiles: Array<string>,
    classId: UUID,
    className: string,
    createdAt: string
  },
  user_answers: JSONB {
    [questionId]: string | number
  },
  score: JSONB {
    totalPoints: number,
    earnedPoints: number,
    percentage: number,
    correctCount: number,
    totalQuestions: number,
    results: Object
  },
  created_at: timestamp,
  updated_at: timestamp
}
```

## Components

### QuizComponent.jsx

Main quiz component with 4 states:

- **setup**: Configuration screen
- **taking**: Active quiz with questions
- **reviewing**: Results and answer review
- **history**: Past quiz list

### QuizComponent.css

Professional styling with:

- Modal overlay design
- Left sidebar controls
- Right content area
- Responsive layout
- Smooth animations

## Future Enhancements

Potential improvements:

- [ ] Timed quizzes with countdown
- [ ] Question shuffle option
- [ ] Export quiz results as PDF
- [ ] Share quiz with classmates
- [ ] Leaderboard for class quizzes
- [ ] Study recommendations based on quiz results
- [ ] Spaced repetition integration
- [ ] Multi-select answers for complex questions
- [ ] Image-based questions
- [ ] Audio/video question support

## Troubleshooting

### Quiz not generating:

- Ensure at least one file is selected
- Check that files have extractable content (not image-only PDFs)
- Verify internet connection for OpenAI API
- Check console for specific error messages

### History not loading:

- Verify database migration was run successfully
- Check RLS policies in Supabase
- Ensure user is authenticated
- Look for errors in browser console

### Score calculation incorrect:

- Short answer questions are case-insensitive
- True/False questions use index (0 or 1)
- Multiple choice uses option index (0-3)
- Check user_answers format in database

## API Usage

The quiz feature uses:

- OpenAI API: GPT-4 for question generation
- Supabase: Database for quiz history
- PDF.js: PDF text extraction
- Storage API: File content retrieval

Ensure your environment has proper API keys configured.
