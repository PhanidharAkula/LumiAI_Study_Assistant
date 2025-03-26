import { supabase } from '../lib/supabaseClient.js';

async function setupStorage() {
  try {
    // Create a public bucket for files
    const { data, error } = await supabase
      .storage
      .createBucket('files', {
        public: true,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'application/pdf', 'application/msword', 
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
                          'application/vnd.ms-powerpoint', 'application/vnd.ms-excel', 'text/plain'],
        fileSizeLimit: 10485760, // 10MB
      });

    if (error) {
      console.error('Error creating bucket:', error);
    } else {
      console.log('Storage bucket created successfully:', data);
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

setupStorage();

// Run this script with: node src/scripts/setupStorage.js
// Note: You might need to add "type": "module" to package.json or convert to CommonJS
