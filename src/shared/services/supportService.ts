import { supabase } from "@shared/lib/supabaseClient";

export type TicketStatus = "open" | "in_progress" | "resolved";

export interface SupportTicket {
  id: string;
  user_id: string;
  email: string | null;
  category: string;
  subject: string;
  message: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
}

export interface NewTicket {
  category: string;
  subject: string;
  message: string;
}

// Submit a new support ticket for the signed-in user.
export const createTicket = async (
  input: NewTicket
): Promise<{ data: SupportTicket | null; error: string | null }> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: "Please sign in to contact support." };
    }

    const { data, error } = await supabase
      .from("support_tickets")
      .insert([
        {
          user_id: user.id,
          email: user.email ?? null,
          category: input.category,
          subject: input.subject.trim(),
          message: input.message.trim(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return { data: data as SupportTicket, error: null };
  } catch (err) {
    console.error("createTicket error:", err);
    return {
      data: null,
      error: "Couldn't submit your request just now. Please try again.",
    };
  }
};

// All tickets belonging to the signed-in user, newest first.
export const getMyTickets = async (): Promise<{
  data: SupportTicket[];
  error: string | null;
}> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: null };

    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { data: (data ?? []) as SupportTicket[], error: null };
  } catch (err) {
    console.error("getMyTickets error:", err);
    return { data: [], error: "Couldn't load your requests." };
  }
};

// Admin: every ticket, newest first. Relies on the admin RLS read policy.
export const adminGetAllTickets = async (): Promise<{
  data: SupportTicket[];
  error: string | null;
}> => {
  try {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { data: (data ?? []) as SupportTicket[], error: null };
  } catch (err) {
    console.error("adminGetAllTickets error:", err);
    return { data: [], error: "Couldn't load tickets." };
  }
};

// Admin: change a ticket's status. Relies on the admin RLS update policy.
export const adminSetTicketStatus = async (
  id: string,
  status: TicketStatus
): Promise<{ error: string | null }> => {
  try {
    const { error } = await supabase
      .from("support_tickets")
      .update({ status })
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("adminSetTicketStatus error:", err);
    return { error: "Couldn't update the ticket." };
  }
};
