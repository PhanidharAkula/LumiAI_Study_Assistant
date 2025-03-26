import { supabase } from '../lib/supabaseClient';

/**
 * Directly checks if the files bucket exists and creates it if needed
 * @returns {Promise<Object>} Result of the check/creation
 */
export async function ensureFilesBucketExists() {
  try {
    console.log("Checking for files bucket...");
    
    // Check for existing buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error("Error listing buckets:", listError);
      return { success: false, error: listError };
    }
    
    // Check if files bucket exists
    const filesBucket = buckets.find(bucket => bucket.name === "files");
    console.log("Buckets found:", buckets.map(b => b.name));
    
    if (filesBucket) {
      console.log("Files bucket exists:", filesBucket);
      return { success: true, exists: true, bucket: filesBucket };
    }
    
    // Attempt to create the bucket
    console.log("Files bucket not found, attempting to create...");
    const { data: newBucket, error: createError } = await supabase.storage.createBucket("files", {
      public: true,
      fileSizeLimit: 10485760, // 10MB
    });
    
    if (createError) {
      console.error("Error creating bucket:", createError);
      return { success: false, error: createError };
    }
    
    console.log("Files bucket created:", newBucket);
    return { success: true, exists: false, created: true, bucket: newBucket };
    
  } catch (error) {
    console.error("Bucket check/creation error:", error);
    return { success: false, error };
  }
}

// This can be run directly from the console for debugging:
// import('/src/utils/bucketChecker.js').then(m => m.ensureFilesBucketExists()).then(console.log)
