# Deployment Guide - Securing Your OpenAI API Key

## Problem Fixed ✅

Your OpenAI API key was getting exposed in the frontend code, causing it to be flagged and terminated by OpenAI. We've now moved all OpenAI API calls to a secure backend serverless function.

## What Changed

1. **Created `/api/chat.js`** - A secure serverless function that handles all OpenAI requests
2. **Updated `openaiService.js`** - Now calls the backend API instead of directly calling OpenAI
3. **Removed frontend API key** - The `VITE_OPENAI_API_KEY` is no longer needed in the frontend

## Setup Instructions for Vercel

### 1. Remove Old Environment Variable (Frontend)

In your Vercel dashboard:

1. Go to your project settings
2. Navigate to **Environment Variables**
3. **Delete** the `VITE_OPENAI_API_KEY` variable (if it exists)

### 2. Add New Environment Variable (Backend)

In the same Environment Variables section:

1. Click **Add New**
2. Set the following:
   - **Key**: `OPENAI_API_KEY` (without the `VITE_` prefix!)
   - **Value**: Your OpenAI API key (starts with `sk-...`)
   - **Environments**: Select **Production**, **Preview**, and **Development**
3. Click **Save**

### 3. Redeploy Your Application

After adding the environment variable:

1. Go to the **Deployments** tab
2. Click the **three dots** (⋯) on your latest deployment
3. Click **Redeploy**

## Important Notes

⚠️ **Key Differences:**

- **Frontend variables** (starting with `VITE_`) are bundled into your JavaScript and visible to anyone
- **Backend variables** (without `VITE_`) stay on the server and remain secure

✅ **Security Benefits:**

- Your API key is never exposed to the browser
- OpenAI won't detect it as leaked
- You have full control over rate limiting and usage
- You can add authentication/authorization if needed

## Local Development

For local development, create a `.env` file in your project root:

```bash
# Backend API key (secure)
OPENAI_API_KEY=sk-your-key-here

# Frontend variables (if you have any)
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-key
```

**Never commit your `.env` file to git!** (It's already in `.gitignore`)

## Testing the Fix

1. After deployment, open your browser's DevTools (F12)
2. Go to the **Network** tab
3. Use the chat feature in your app
4. Look for requests to `/api/chat` - you should see them succeed
5. Check that no requests are going directly to `api.openai.com` from the browser

## Troubleshooting

### "Server configuration error"

- Make sure you added `OPENAI_API_KEY` (not `VITE_OPENAI_API_KEY`) to Vercel
- Verify it's enabled for all environments
- Redeploy the application

### "Authentication error with AI service"

- Double-check your API key is correct
- Make sure there are no extra spaces in the key
- Verify your OpenAI account has billing set up

### API still gets flagged

- Clear your browser cache
- Make sure you're using the latest deployment
- Verify no old `VITE_OPENAI_API_KEY` exists in Vercel settings

## Questions?

If you encounter any issues, check:

1. Vercel deployment logs for errors
2. Browser console for error messages
3. OpenAI dashboard for usage and any issues
