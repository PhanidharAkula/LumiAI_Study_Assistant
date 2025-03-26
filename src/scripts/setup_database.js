import { supabase } from '../lib/supabaseClient.js';

/**
 * Run this script to set up all required database tables
 */
async function setupDatabase() {
  try {
    console.log("Setting up database tables...");
    
    // Create execute_sql function if it doesn't exist
    const { error: functionError } = await supabase.rpc('execute_sql', {
      sql_query: `
        CREATE OR REPLACE FUNCTION execute_sql(sql_query text) RETURNS void AS $$
        BEGIN
          EXECUTE sql_query;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        
        -- Grant access to authenticated users
        GRANT EXECUTE ON FUNCTION execute_sql(text) TO authenticated;
        GRANT EXECUTE ON FUNCTION execute_sql(text) TO anon;
      `
    }).catch(() => {
      // If the function doesn't exist yet, we'll get an error
      // Let's create it directly
      return supabase.rpc('exec_sql', {
        query: `
          CREATE OR REPLACE FUNCTION public.execute_sql(sql_query text) RETURNS void AS $$
          BEGIN
            EXECUTE sql_query;
          END;
          $$ LANGUAGE plpgsql SECURITY DEFINER;
          
          -- Grant access to authenticated users
          GRANT EXECUTE ON FUNCTION public.execute_sql(text) TO authenticated;
          GRANT EXECUTE ON FUNCTION public.execute_sql(text) TO anon;
        `
      });
    });

    if (functionError) {
      console.error("Error creating execute_sql function:", functionError);
    }

    // Create conversations table
    console.log("Creating conversations table...");
    const { error: conversationsError } = await supabase.rpc('execute_sql', {
      sql_query: `
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
      `
    });

    if (conversationsError) {
      console.error("Error creating conversations table:", conversationsError);
    } else {
      console.log("Conversations table created successfully");
    }
    
    console.log("Database setup completed!");
  } catch (error) {
    console.error("Error setting up database:", error);
  }
}

setupDatabase();

// To run this script:
// 1. Make it executable: chmod +x src/scripts/setup_database.js
// 2. Run it: node src/scripts/setup_database.js
