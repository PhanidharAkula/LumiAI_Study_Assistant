import { supabase } from '../lib/supabaseClient';

// Function to test if the storage bucket exists and is accessible
export async function testStorageBucket() {
  console.log("Running storage bucket test...");
  
  try {
    // Step 1: List buckets
    console.log("Step 1: Listing storage buckets...");
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error("Error listing buckets:", bucketsError);
      return {
        success: false,
        error: bucketsError.message,
        stage: "list_buckets"
      };
    }
    
    console.log("Available buckets:", buckets);
    
    // Step 2: Check for 'files' bucket
    const filesBucket = buckets.find(bucket => bucket.name === "files");
    if (!filesBucket) {
      console.error("Files bucket not found");
      return {
        success: false,
        error: "Files bucket not found",
        stage: "find_bucket",
        availableBuckets: buckets.map(b => b.name)
      };
    }
    
    console.log("Files bucket found:", filesBucket);
    
    // Step 3: Try to list files in the bucket
    console.log("Step 3: Listing files in bucket...");
    const { data: files, error: filesError } = await supabase.storage
      .from("files")
      .list();
    
    if (filesError) {
      console.error("Error listing files:", filesError);
      return {
        success: false,
        error: filesError.message,
        stage: "list_files"
      };
    }
    
    console.log("Files in bucket:", files);
    
    // Step 4: Try to get the URL for a test path
    console.log("Step 4: Getting public URL...");
    try {
      const { data } = supabase.storage
        .from("files")
        .getPublicUrl('test-path.txt');
      
      console.log("Public URL response:", data);
    } catch (urlError) {
      console.error("Error getting URL:", urlError);
    }
    
    return {
      success: true,
      bucketInfo: filesBucket,
      fileCount: files?.length || 0
    };
    
  } catch (error) {
    console.error("Unexpected error in storage test:", error);
    return {
      success: false,
      error: error.message || "Unknown error",
      stage: "unknown"
    };
  }
}

// This function can be called from the browser console for debugging:
// import('/src/utils/storageDebugger.js').then(m => m.testStorageBucket()).then(console.log)
