// This file uses the provided credentials to connect to your Supabase project.
// In a professional production environment, these would be injected via a build tool.
const supabaseUrl = "https://addjrmawsohthviqthvr.supabase.co";
const supabaseAnonKey = "sb_publishable_WU137dy98lKMkbuwTnVcog_zwp3SF-3";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase configuration! Please check your credentials.");
}

// Export the client for use in other parts of the app
window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
