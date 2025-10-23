/**
 * Test endpoint to verify environment variables
 */

export default async function handler(req, res) {
  const envKeys = Object.keys(process.env);
  
  return res.status(200).json({
    success: true,
    totalEnvVars: envKeys.length,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    openAIPrefix: process.env.OPENAI_API_KEY ? 
      process.env.OPENAI_API_KEY.substring(0, 7) + '...' : 'MISSING',
    allOpenAIKeys: envKeys.filter(k => k.includes('OPENAI')),
    sampleVars: envKeys.filter(k => 
      !k.includes('SECRET') && 
      !k.includes('PASSWORD') && 
      !k.includes('KEY')
    ).slice(0, 10)
  });
}
