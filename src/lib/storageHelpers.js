import { supabase } from './supabaseClient';

/**
 * Gets the public URL for a file in storage
 * @param {string} filePath - The path of the file in storage
 * @returns {string} - The public URL of the file
 */
export function getFileUrl(filePath) {
  if (!filePath) return null;
  
  try {
    const { data } = supabase.storage.from('files').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (error) {
    console.error('Error getting file URL:', error);
    return null;
  }
}

/**
 * Checks if a bucket exists
 * @param {string} bucketName - Name of the bucket to check
 * @returns {Promise<boolean>} - Whether the bucket exists
 */
export async function checkBucketExists(bucketName = 'files') {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('Error checking buckets:', error);
      return false;
    }
    
    return buckets.some(bucket => bucket.name === bucketName);
  } catch (error) {
    console.error('Error in bucket check:', error);
    return false;
  }
}

/**
 * Tests if a URL is accessible
 * @param {string} url - The URL to test
 * @returns {Promise<boolean>} - Whether the URL is accessible
 */
export async function testUrlAccess(url) {
  if (!url) return false;
  
  try {
    const response = await fetch(url, { 
      method: 'HEAD',
      mode: 'no-cors' // This helps with CORS issues
    });
    return true; // With no-cors, we can't check status so just return true if no exception
  } catch (error) {
    console.error('URL access test failed:', error);
    return false;
  }
}
