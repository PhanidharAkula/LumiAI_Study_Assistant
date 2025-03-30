import { supabase } from '../lib/supabaseClient';

/**
 * Gets a URL for a file with proper error handling
 * @param {string} bucketName - The bucket name
 * @param {string} filePath - The file path within the bucket
 * @returns {Promise<{url: string|null, error: Error|null}>} - URL or error
 */
export const getFilePublicUrl = async (bucketName, filePath) => {
  try {
    if (!filePath) {
      return { url: null, error: new Error('Invalid file path') };
    }
    
    // Try to get a signed URL first - this works most consistently
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from(bucketName)
      .createSignedUrl(filePath, 3600); // Valid for 1 hour
    
    if (signedData?.signedUrl) {
      return { url: signedData.signedUrl, error: null };
    }
    
    if (signedError) {
      console.log('Signed URL error:', signedError);
    }
    
    // Fall back to public URL if signed URL fails
    const { data: publicData } = supabase
      .storage
      .from(bucketName)
      .getPublicUrl(filePath);
    
    if (publicData?.publicUrl) {
      return { url: publicData.publicUrl, error: null };
    }
    
    return { url: null, error: new Error('Could not generate URL for file') };
  } catch (err) {
    console.error('Error getting file URL:', err);
    return { url: null, error: err };
  }
};

/**
 * Check if we can access the storage bucket by trying to list files
 * This method doesn't require admin privileges
 * @param {string} bucketName - The bucket name
 * @returns {Promise<boolean>} - If the bucket is accessible
 */
export const checkStorageAccess = async (bucketName = 'files') => {
  try {
    // Try to list files with a limit of 1 to check access
    const { data, error } = await supabase
      .storage
      .from(bucketName)
      .list('', { limit: 1 });
      
    // If we don't get an error, we have access
    return !error;
  } catch (err) {
    console.error('Storage access check error:', err);
    return false;
  }
};

/**
 * A simplified function that just checks if the bucket can be accessed
 * @param {string} bucketName - The bucket name to check
 * @returns {Promise<boolean>} - Returns true if the bucket can be accessed
 */
export const ensureBucketExists = async (bucketName = 'files') => {
  return await checkStorageAccess(bucketName);
};
