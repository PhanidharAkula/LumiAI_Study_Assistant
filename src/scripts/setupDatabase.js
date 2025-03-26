import { supabase } from '../lib/supabaseClient.js';

async function setupDatabase() {
  try {
    console.log("Setting up database tables...");

    // Create classes table
    const { error: classesError } = await supabase.rpc('execute_sql', {
      sql_query: `
        CREATE TABLE IF NOT EXISTS public.classes (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES auth.users(id),
          name TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
      `
    });

    if (classesError) {
      console.error('Error creating classes table:', classesError);
      throw classesError;
    }

    // Create files table
    const { error: filesError } = await supabase.rpc('execute_sql', {
      sql_query: `
        CREATE TABLE IF NOT EXISTS public.files (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          class_id UUID NOT NULL REFERENCES public.classes(id),
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          file_path TEXT,
          size INTEGER,
          type TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
      `
    });

    if (filesError) {
      console.error('Error creating files table:', filesError);
      throw filesError;
    }

    console.log('Database setup completed successfully!');

  } catch (error) {
    console.error('Database setup failed:', error);
  }
}

setupDatabase();
