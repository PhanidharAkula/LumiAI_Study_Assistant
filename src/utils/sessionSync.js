import { supabase } from '../lib/supabaseClient';

const STORAGE_KEY = 'lumi-ai-session-sync';
const LAST_ACTIVITY_KEY = 'lumi-ai-last-activity';

// Update the last activity timestamp
export const updateLastActivity = () => {
  localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
};

// Check if the session is active in another tab
export const checkSessionActivity = () => {
  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  return lastActivity ? parseInt(lastActivity, 10) : null;
};

// Listen for auth changes across tabs
export const setupSessionSync = (setSession) => {
  // Listen for auth state changes from Supabase
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    // Broadcast the auth event to other tabs
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ event, timestamp: Date.now() }));
    
    // Update the session state
    setSession(session);
    
    // Update last activity
    if (session) {
      updateLastActivity();
    }
  });

  // Listen for auth events from other tabs
  const handleStorageChange = (e) => {
    if (e.key === STORAGE_KEY) {
      // Force refresh the session from storage
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
      });
    }
  };

  // Setup storage event listener
  window.addEventListener('storage', handleStorageChange);

  // Ping activity at regular intervals
  const activityInterval = setInterval(updateLastActivity, 60000); // Every minute

  // Return cleanup function
  return () => {
    subscription.unsubscribe();
    window.removeEventListener('storage', handleStorageChange);
    clearInterval(activityInterval);
  };
};
