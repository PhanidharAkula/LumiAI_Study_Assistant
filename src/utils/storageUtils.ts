import { supabase } from "../lib/supabaseClient";

export interface FileUrlResult {
  url: string | null;
  error: Error | null;
}

/** Get a usable URL for a stored file (signed first, public as fallback). */
export const getFilePublicUrl = async (
  bucketName: string,
  filePath: string
): Promise<FileUrlResult> => {
  try {
    if (!filePath) {
      return { url: null, error: new Error("Invalid file path") };
    }

    // Signed URLs work most consistently for a private bucket.
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, 3600); // valid for 1 hour

    if (signedData?.signedUrl) {
      return { url: signedData.signedUrl, error: null };
    }
    if (signedError) {
      console.log("Signed URL error:", signedError);
    }

    // Fall back to a public URL.
    const { data: publicData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    if (publicData?.publicUrl) {
      return { url: publicData.publicUrl, error: null };
    }

    return { url: null, error: new Error("Could not generate URL for file") };
  } catch (err) {
    console.error("Error getting file URL:", err);
    return { url: null, error: err as Error };
  }
};
