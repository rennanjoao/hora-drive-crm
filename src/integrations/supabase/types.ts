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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_settings: {
        Row: {
          email_remetente_padrao: string | null
          google_maps_key: string | null
          id: string
          resend_api_key: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          email_remetente_padrao?: string | null
          google_maps_key?: string | null
          id?: string
          resend_api_key?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          email_remetente_padrao?: string | null
          google_maps_key?: string | null
          id?: string
          resend_api_key?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          cost_estimated: number | null
          created_at: string | null
          id: string
          service_name: string | null
        }
        Insert: {
          cost_estimated?: number | null
          created_at?: string | null
          id?: string
          service_name?: string | null
        }
        Update: {
          cost_estimated?: number | null
          created_at?: string | null
          id?: string
          service_name?: string | null
        }
        Relationships: []
      }
      cnpj_consultas: {
        Row: {
          cidade: string | null
          cnae_codigo: string | null
          cnae_descricao: string | null
          cnpj: string
          consultado_por: string
          created_at: string
          dados_completos: Json | null
          email: string | null
          estado: string | null
          id: string
          importado: boolean | null
          lead_id: string | null
          logradouro: string | null
          nome_fantasia: string | null
          razao_social: string | null
          telefone: string | null
        }
        Insert: {
          cidade?: string | null
          cnae_codigo?: string | null
          cnae_descricao?: string | null
          cnpj: string
          consultado_por: string
          created_at?: string
          dados_completos?: Json | null
          email?: string | null
          estado?: string | null
          id?: string
          importado?: boolean | null
          lead_id?: string | null
          logradouro?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          telefone?: string | null
        }
        Update: {
          cidade?: string | null
          cnae_codigo?: string | null
          cnae_descricao?: string | null
          cnpj?: string
          consultado_por?: string
          created_at?: string
          dados_completos?: Json | null
          email?: string | null
          estado?: string | null
          id?: string
          importado?: boolean | null
          lead_id?: string | null
          logradouro?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cnpj_consultas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_sends: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          last_opened_at: string | null
          lead_id: string
          open_count: number
          replied: boolean
          replied_at: string | null
          scheduled_for: string | null
          sdr_id: string
          sent_at: string | null
          status: string
          step_id: string
          tracking_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          last_opened_at?: string | null
          lead_id: string
          open_count?: number
          replied?: boolean
          replied_at?: string | null
          scheduled_for?: string | null
          sdr_id: string
          sent_at?: string | null
          status?: string
          step_id: string
          tracking_id?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          last_opened_at?: string | null
          lead_id?: string
          open_count?: number
          replied?: boolean
          replied_at?: string | null
          scheduled_for?: string | null
          sdr_id?: string
          sent_at?: string | null
          status?: string
          step_id?: string
          tracking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sends_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "email_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      email_steps: {
        Row: {
          body_html: string
          campaign_id: string
          condition_ref_step_id: string | null
          condition_type: string | null
          created_at: string
          delay_days: number
          id: string
          step_order: number
          step_type: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          campaign_id: string
          condition_ref_step_id?: string | null
          condition_type?: string | null
          created_at?: string
          delay_days?: number
          id?: string
          step_order?: number
          step_type?: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          campaign_id?: string
          condition_ref_step_id?: string | null
          condition_type?: string | null
          created_at?: string
          delay_days?: number
          id?: string
          step_order?: number
          step_type?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_steps_condition_ref_step_id_fkey"
            columns: ["condition_ref_step_id"]
            isOneToOne: false
            referencedRelation: "email_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_timeline: {
        Row: {
          author_id: string | null
          contact_type: string | null
          content: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          author_id?: string | null
          contact_type?: string | null
          content: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          author_id?: string | null
          contact_type?: string | null
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_timeline_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_timeline_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          bairro: string | null
          cidade: string | null
          cnae_codigo: string | null
          cnae_descricao: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          data_ultimo_envio: string | null
          email: string | null
          emails_enviados_count: number | null
          estado: string | null
          fonte: string | null
          foto_url: string | null
          id: string
          nome_fantasia: string | null
          origem_lead: string | null
          place_id: string | null
          rating: number | null
          razao_social: string
          setor: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          status_automacao: string | null
          telefone: string | null
          updated_at: string
          website: string | null
          zona: string | null
        }
        Insert: {
          assigned_to?: string | null
          bairro?: string | null
          cidade?: string | null
          cnae_codigo?: string | null
          cnae_descricao?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          data_ultimo_envio?: string | null
          email?: string | null
          emails_enviados_count?: number | null
          estado?: string | null
          fonte?: string | null
          foto_url?: string | null
          id?: string
          nome_fantasia?: string | null
          origem_lead?: string | null
          place_id?: string | null
          rating?: number | null
          razao_social: string
          setor?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          status_automacao?: string | null
          telefone?: string | null
          updated_at?: string
          website?: string | null
          zona?: string | null
        }
        Update: {
          assigned_to?: string | null
          bairro?: string | null
          cidade?: string | null
          cnae_codigo?: string | null
          cnae_descricao?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          data_ultimo_envio?: string | null
          email?: string | null
          emails_enviados_count?: number | null
          estado?: string | null
          fonte?: string | null
          foto_url?: string | null
          id?: string
          nome_fantasia?: string | null
          origem_lead?: string | null
          place_id?: string | null
          rating?: number | null
          razao_social?: string
          setor?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          status_automacao?: string | null
          telefone?: string | null
          updated_at?: string
          website?: string | null
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          contact_name: string | null
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number
          id: string
          jitsi_link: string
          lead_id: string | null
          meeting_date: string
          meeting_type: string
          recording_url: string | null
          sdr_id: string
          status: string
          title: string
          transcription: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number
          id?: string
          jitsi_link: string
          lead_id?: string | null
          meeting_date: string
          meeting_type?: string
          recording_url?: string | null
          sdr_id: string
          status?: string
          title: string
          transcription?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          jitsi_link?: string
          lead_id?: string | null
          meeting_date?: string
          meeting_type?: string
          recording_url?: string | null
          sdr_id?: string
          status?: string
          title?: string
          transcription?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          all_day: boolean | null
          assigned_to: string
          completed: boolean | null
          created_at: string
          created_by: string
          description: string | null
          end_time: string | null
          id: string
          lead_id: string | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean | null
          assigned_to: string
          completed?: boolean | null
          created_at?: string
          created_by: string
          description?: string | null
          end_time?: string | null
          id?: string
          lead_id?: string | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean | null
          assigned_to?: string
          completed?: boolean | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_time?: string | null
          id?: string
          lead_id?: string | null
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_profile_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "sdr" | "gerente" | "motorista"
      lead_status:
        | "novo"
        | "contato"
        | "qualificado"
        | "proposta"
        | "negociacao"
        | "ganho"
        | "perdido"
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
    Enums: {
      app_role: ["admin", "sdr", "gerente", "motorista"],
      lead_status: [
        "novo",
        "contato",
        "qualificado",
        "proposta",
        "negociacao",
        "ganho",
        "perdido",
      ],
    },
  },
} as const
