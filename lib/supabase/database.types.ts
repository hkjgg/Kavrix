/**
 * Generated from the migrations by `pnpm db:types` (`supabase gen types typescript --local`).
 * Do not edit by hand — change a migration and regenerate.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          created_at: string
          currency: string
          equity: number
          id: string
          last_heartbeat_at: string | null
          last_ingest_at: string | null
          leverage: number
          login: number
          server: string
          symbol_info: Json
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency: string
          equity?: number
          id?: string
          last_heartbeat_at?: string | null
          last_ingest_at?: string | null
          leverage?: number
          login: number
          server: string
          symbol_info?: Json
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          equity?: number
          id?: string
          last_heartbeat_at?: string | null
          last_ingest_at?: string | null
          leverage?: number
          login?: number
          server?: string
          symbol_info?: Json
          user_id?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          account_id: string
          issued_at: string
          karat: number
          month: string
          partial: boolean
          period: string
          serial: string
          tier: string
          trade_count: number
          trading_days: number
        }
        Insert: {
          account_id: string
          issued_at?: string
          karat: number
          month: string
          partial?: boolean
          period: string
          serial: string
          tier: string
          trade_count: number
          trading_days: number
        }
        Update: {
          account_id?: string
          issued_at?: string
          karat?: number
          month?: string
          partial?: boolean
          period?: string
          serial?: string
          tier?: string
          trade_count?: number
          trading_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_tokens: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          account_id: string
          comment: string
          commission: number
          entry: string
          magic: number
          position_id: number
          price: number
          profit: number
          received_at: string
          sl: number
          spread_points: number
          swap: number
          symbol: string
          ticket: number
          time: string
          tp: number
          type: string
          volume: number
        }
        Insert: {
          account_id: string
          comment?: string
          commission?: number
          entry: string
          magic?: number
          position_id: number
          price: number
          profit?: number
          received_at?: string
          sl?: number
          spread_points?: number
          swap?: number
          symbol: string
          ticket: number
          time: string
          tp?: number
          type: string
          volume: number
        }
        Update: {
          account_id?: string
          comment?: string
          commission?: number
          entry?: string
          magic?: number
          position_id?: number
          price?: number
          profit?: number
          received_at?: string
          sl?: number
          spread_points?: number
          swap?: number
          symbol?: string
          ticket?: number
          time?: string
          tp?: number
          type?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      eas: {
        Row: {
          account_id: string
          baseline_expectancy_r: number | null
          baseline_std_dev_r: number | null
          created_at: string
          magic: number
          name: string
        }
        Insert: {
          account_id: string
          baseline_expectancy_r?: number | null
          baseline_std_dev_r?: number | null
          created_at?: string
          magic: number
          name: string
        }
        Update: {
          account_id?: string
          baseline_expectancy_r?: number | null
          baseline_std_dev_r?: number | null
          created_at?: string
          magic?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "eas_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      findings: {
        Row: {
          account_id: string
          as_of: string
          computed_at: string
          finding: Json
          finding_key: string
          headline: string
          kind: string
          refinery_rank: number | null
          severity: string
          tentative: boolean
        }
        Insert: {
          account_id: string
          as_of: string
          computed_at?: string
          finding: Json
          finding_key: string
          headline: string
          kind: string
          refinery_rank?: number | null
          severity: string
          tentative: boolean
        }
        Update: {
          account_id?: string
          as_of?: string
          computed_at?: string
          finding?: Json
          finding_key?: string
          headline?: string
          kind?: string
          refinery_rank?: number | null
          severity?: string
          tentative?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "findings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_rate_limits: {
        Row: {
          count: number
          token_id: string
          window_start: string
        }
        Insert: {
          count?: number
          token_id: string
          window_start: string
        }
        Update: {
          count?: number
          token_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_rate_limits_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "connector_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      karat_snapshots: {
        Row: {
          account_id: string
          as_of: string
          computed_at: string
          day: string
          karat: number | null
          pillars: Json
          points: number | null
          state: string
          tier: string | null
          trade_count: number
        }
        Insert: {
          account_id: string
          as_of: string
          computed_at?: string
          day: string
          karat?: number | null
          pillars: Json
          points?: number | null
          state: string
          tier?: string | null
          trade_count: number
        }
        Update: {
          account_id?: string
          as_of?: string
          computed_at?: string
          day?: string
          karat?: number | null
          pillars?: Json
          points?: number | null
          state?: string
          tier?: string | null
          trade_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "karat_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      news_events: {
        Row: {
          account_id: string
          currency: string
          event_id: number
          importance: string
          name: string
          time: string
        }
        Insert: {
          account_id: string
          currency: string
          event_id: number
          importance: string
          name: string
          time: string
        }
        Update: {
          account_id?: string
          currency?: string
          event_id?: number
          importance?: string
          name?: string
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          daily_max_trades: number
          news_window_minutes: number
          risk_limit_percent: number
          rollover_window_minutes: number
          server_utc_offset_hours: number
          updated_at: string
          user_id: string
        }
        Insert: {
          daily_max_trades?: number
          news_window_minutes?: number
          risk_limit_percent?: number
          rollover_window_minutes?: number
          server_utc_offset_hours?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          daily_max_trades?: number
          news_window_minutes?: number
          risk_limit_percent?: number
          rollover_window_minutes?: number
          server_utc_offset_hours?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sl_modifications: {
        Row: {
          account_id: string
          position_id: number
          received_at: string
          sl: number
          time: string
          tp: number
        }
        Insert: {
          account_id: string
          position_id: number
          received_at?: string
          sl?: number
          time: string
          tp?: number
        }
        Update: {
          account_id?: string
          position_id?: number
          received_at?: string
          sl?: number
          time?: string
          tp?: number
        }
        Relationships: [
          {
            foreignKeyName: "sl_modifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          account_id: string
          close_price: number
          close_time: string
          comment: string
          commission: number
          contract_size: number
          direction: string
          duration_seconds: number
          entry_deal_ticket: number
          exit_deal_ticket: number
          final_sl: number | null
          final_tp: number | null
          gross_profit: number
          id: string
          initial_sl: number | null
          initial_tp: number | null
          mae_price: number
          magic: number
          mfe_price: number
          net_profit: number
          open_price: number
          open_time: string
          position_id: number
          rebuilt_at: string
          spread_points_at_entry: number
          spread_points_at_exit: number
          swap: number
          symbol: string
          volume: number
        }
        Insert: {
          account_id: string
          close_price: number
          close_time: string
          comment?: string
          commission: number
          contract_size: number
          direction: string
          duration_seconds: number
          entry_deal_ticket: number
          exit_deal_ticket: number
          final_sl?: number | null
          final_tp?: number | null
          gross_profit: number
          id: string
          initial_sl?: number | null
          initial_tp?: number | null
          mae_price: number
          magic?: number
          mfe_price: number
          net_profit: number
          open_price: number
          open_time: string
          position_id: number
          rebuilt_at?: string
          spread_points_at_entry: number
          spread_points_at_exit: number
          swap: number
          symbol: string
          volume: number
        }
        Update: {
          account_id?: string
          close_price?: number
          close_time?: string
          comment?: string
          commission?: number
          contract_size?: number
          direction?: string
          duration_seconds?: number
          entry_deal_ticket?: number
          exit_deal_ticket?: number
          final_sl?: number | null
          final_tp?: number | null
          gross_profit?: number
          id?: string
          initial_sl?: number | null
          initial_tp?: number | null
          mae_price?: number
          magic?: number
          mfe_price?: number
          net_profit?: number
          open_price?: number
          open_time?: string
          position_id?: number
          rebuilt_at?: string
          spread_points_at_entry?: number
          spread_points_at_exit?: number
          swap?: number
          symbol?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ingest_rate_hit: {
        Args: { p_token_id: string; p_window_seconds: number }
        Returns: number
      }
      verify_certificate: {
        Args: { p_serial: string }
        Returns: {
          issued_at: string
          karat: number
          month: string
          partial: boolean
          period: string
          serial: string
          tier: string
          trade_count: number
          trading_days: number
        }[]
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

