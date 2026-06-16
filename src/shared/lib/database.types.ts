export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      auth_error_log: {
        Row: {
          context: string | null
          created_at: string | null
          error_text: string | null
          id: number
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          error_text?: string | null
          id?: number
        }
        Update: {
          context?: string | null
          created_at?: string | null
          error_text?: string | null
          id?: number
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          answer: string
          class_id: string | null
          context_classes: string[] | null
          context_files: string[] | null
          created_at: string | null
          document_ids: string[] | null
          id: string
          messages_metadata: string | null
          question: string
          session_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          answer: string
          class_id?: string | null
          context_classes?: string[] | null
          context_files?: string[] | null
          created_at?: string | null
          document_ids?: string[] | null
          id?: string
          messages_metadata?: string | null
          question: string
          session_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          answer?: string
          class_id?: string | null
          context_classes?: string[] | null
          context_files?: string[] | null
          created_at?: string | null
          document_ids?: string[] | null
          id?: string
          messages_metadata?: string | null
          question?: string
          session_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_accounts: {
        Row: {
          can_reregister_at: string
          deleted_at: string
          deleted_by: string | null
          email: string
          id: string
          reason: string | null
        }
        Insert: {
          can_reregister_at?: string
          deleted_at?: string
          deleted_by?: string | null
          email: string
          id?: string
          reason?: string | null
        }
        Update: {
          can_reregister_at?: string
          deleted_at?: string
          deleted_by?: string | null
          email?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      files: {
        Row: {
          class_id: string
          created_at: string | null
          id: string
          name: string
          path: string
          size: number
          type: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string | null
          id?: string
          name: string
          path: string
          size: number
          type: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string | null
          id?: string
          name?: string
          path?: string
          size?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_history: {
        Row: {
          card_style: string
          cards: Json
          class_id: string
          created_at: string | null
          id: string
          num_cards: number
          source_files: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          card_style?: string
          cards: Json
          class_id: string
          created_at?: string | null
          id?: string
          num_cards: number
          source_files?: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          card_style?: string
          cards?: Json
          class_id?: string
          created_at?: string | null
          id?: string
          num_cards?: number
          source_files?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_history_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_srs: {
        Row: {
          card_index: number
          created_at: string
          deck_id: string
          due_at: string
          ease: number
          id: string
          interval_days: number
          last_reviewed_at: string | null
          repetitions: number
          user_id: string
        }
        Insert: {
          card_index: number
          created_at?: string
          deck_id: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          repetitions?: number
          user_id: string
        }
        Update: {
          card_index?: number
          created_at?: string
          deck_id?: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          repetitions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_srs_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_history"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          class_id: string | null
          content: string
          created_at: string | null
          id: string
          tags: string[] | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          class_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          class_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_admin: boolean | null
          metadata: Json | null
          region: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_admin?: boolean | null
          metadata?: Json | null
          region?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean | null
          metadata?: Json | null
          region?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          class_id: string
          created_at: string | null
          difficulty: string
          file_ids: string[] | null
          id: string
          question_count: number
          questions: Json
          score: number
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string | null
          difficulty: string
          file_ids?: string[] | null
          id?: string
          question_count: number
          questions: Json
          score: number
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string | null
          difficulty?: string
          file_ids?: string[] | null
          id?: string
          question_count?: number
          questions?: Json
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_history: {
        Row: {
          class_id: string
          created_at: string | null
          id: string
          quiz_data: Json
          score: Json
          updated_at: string | null
          user_answers: Json
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string | null
          id?: string
          quiz_data: Json
          score: Json
          updated_at?: string | null
          user_answers: Json
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string | null
          id?: string
          quiz_data?: Json
          score?: Json
          updated_at?: string | null
          user_answers?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_history_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          email: string | null
          id: string
          message: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          message: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          message?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: { Args: { target_user_id: string }; Returns: Json }
      admin_get_user_stats: {
        Args: never
        Returns: {
          avatar_url: string
          classes_count: number
          created_at: string
          email: string
          files_count: number
          full_name: string
          is_admin: boolean
          raw_user_meta_data: Json
          region: string
          total_storage: number
          user_id: string
        }[]
      }
      admin_set_user_admin: {
        Args: { make_admin: boolean; target_user_id: string }
        Returns: Json
      }
      cleanup_old_deleted_accounts: { Args: never; Returns: number }
      set_my_region: { Args: { p_region: string }; Returns: undefined }
      user_delete_own_account: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
