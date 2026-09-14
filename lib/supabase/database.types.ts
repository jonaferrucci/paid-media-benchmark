// Hand-written to mirror supabase/migrations/*.sql exactly, verified
// against a real local PostgreSQL instance (see Phase 2/3 reports).
//
// STRUCTURE NOTE (Phase 3 bug fix): every table below is a fully
// inlined literal object type -- Row/Insert/Update/Relationships all
// spelled out per table, matching the actual output shape of
// `supabase gen types typescript`. This is deliberate, not
// accidental duplication.
//
// ROOT CAUSE, confirmed by bisection: an earlier version of this file
// used a shared `interface TaxonomyRow { ... }` referenced by several
// tables' `Row` (and composed via `Partial<TaxonomyRow> & {...}` for
// `Insert`/`Update`). Declaring the shared shape as an `interface`
// (rather than a `type` alias or an inline literal) caused it to fail
// postgrest-js's structural check against its `Record<string, unknown>`
// -constrained generic types deep in the query-builder's type
// inference. The failure was silent and total: TypeScript did not
// error on the interface declaration itself, but every `.from(table)`
// query anywhere in the file -- including tables with no relation to
// the offending one -- resolved to `never`, because a single entry
// failing `GenericTable` compatibility invalidates the whole
// `Record<string, GenericTable>` that `Tables` must satisfy. Verified
// via minimal reproductions: swapping `interface TaxonomyRow` for
// `type TaxonomyRow = {...}` (still shared, still referenced) resolved
// it immediately, confirming interface-vs-type-alias as the exact
// mechanism. The fix applied here goes further than the minimal patch,
// per Phase 3 instructions: every table is independently inlined,
// matching real codegen output, so no future shared-type shortcut can
// reintroduce this class of bug.
//
// TO REGENERATE FOR REAL once Docker or a live Supabase project is
// available:
//   npx supabase gen types typescript --db-url "<connection-string>" > lib/supabase/database.types.ts
// or, against a linked hosted project:
//   npx supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
//
// Keep this file in sync with the migrations directory manually until
// then. Do not let frontend enums (lib/types.ts) and these database
// enums drift silently -- see lib/supabase/mappings.ts for the
// translation layer between the two.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ValidationStatus = "pending" | "valid" | "flagged" | "excluded" | "deleted";
export type DataSourceType = "manual" | "csv" | "api" | "admin_import" | "other";
export type BenchmarkDirection = "lower_is_better" | "higher_is_better" | "contextual";
export type MetricValueKind = "base" | "derived";
export type GenderTargetingType = "all" | "female" | "male" | "platform_defined" | "not_specified";
export type GeographicScopeType =
  | "national" | "regional" | "state_province" | "city" | "local_radius"
  | "multiple_regions" | "international" | "other";
export type PerformanceScopeType = "full_account" | "campaign_group" | "individual_campaign" | "mixed" | "other";
export type MetricUnitType = "currency" | "percentage" | "multiplier" | "count";
export type OrganizationRole = "owner" | "admin" | "analyst" | "contributor" | "viewer";

export interface Database {
  public: {
    Tables: {
      platforms: {
        Row: {
          id: string;
          internal_key: string;
          display_label: string;
          active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          internal_key: string;
          display_label: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          internal_key?: string;
          display_label?: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_types: {
        Row: {
          id: string;
          platform_id: string;
          internal_key: string;
          display_label: string;
          active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          platform_id: string;
          internal_key: string;
          display_label: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          platform_id?: string;
          internal_key?: string;
          display_label?: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_types_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          }
        ];
      };
      objectives: {
        Row: {
          id: string;
          internal_key: string;
          display_label: string;
          active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          internal_key: string;
          display_label: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          internal_key?: string;
          display_label?: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      verticals: {
        Row: {
          id: string;
          internal_key: string;
          display_label: string;
          parent_id: string | null;
          active: boolean;
          display_order: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          internal_key: string;
          display_label: string;
          parent_id?: string | null;
          active?: boolean;
          display_order?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          internal_key?: string;
          display_label?: string;
          parent_id?: string | null;
          active?: boolean;
          display_order?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verticals_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "verticals";
            referencedColumns: ["id"];
          }
        ];
      };
      audience_strategies: {
        Row: {
          id: string;
          internal_key: string;
          display_label: string;
          active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          internal_key: string;
          display_label: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          internal_key?: string;
          display_label?: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      funnel_stages: {
        Row: {
          id: string;
          internal_key: string;
          display_label: string;
          active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          internal_key: string;
          display_label: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          internal_key?: string;
          display_label?: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      countries: {
        Row: {
          id: string;
          iso_code: string;
          display_label: string;
          active: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          iso_code: string;
          display_label: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          iso_code?: string;
          display_label?: string;
          active?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_models: {
        Row: {
          id: string;
          internal_key: string;
          display_label: string;
          active: boolean;
          display_order: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          internal_key: string;
          display_label: string;
          active?: boolean;
          display_order?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          internal_key?: string;
          display_label?: string;
          active?: boolean;
          display_order?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      metrics: {
        Row: {
          id: string;
          internal_key: string;
          display_label: string;
          metric_kind: MetricValueKind;
          unit_type: MetricUnitType;
          benchmark_direction: BenchmarkDirection;
          formula_identifier: string | null;
          description: string | null;
          benchmark_eligible: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          internal_key: string;
          display_label: string;
          metric_kind: MetricValueKind;
          unit_type: MetricUnitType;
          benchmark_direction: BenchmarkDirection;
          formula_identifier?: string | null;
          description?: string | null;
          benchmark_eligible?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          internal_key?: string;
          display_label?: string;
          metric_kind?: MetricValueKind;
          unit_type?: MetricUnitType;
          benchmark_direction?: BenchmarkDirection;
          formula_identifier?: string | null;
          description?: string | null;
          benchmark_eligible?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      metric_definition_variants: {
        Row: {
          id: string;
          metric_id: string;
          internal_key: string;
          display_label: string;
          description: string | null;
          is_unknown_default: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          metric_id: string;
          internal_key: string;
          display_label: string;
          description?: string | null;
          is_unknown_default?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          metric_id?: string;
          internal_key?: string;
          display_label?: string;
          description?: string | null;
          is_unknown_default?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metric_definition_variants_metric_id_fkey";
            columns: ["metric_id"];
            isOneToOne: false;
            referencedRelation: "metrics";
            referencedColumns: ["id"];
          }
        ];
      };
      platform_metrics: {
        Row: {
          id: string;
          platform_id: string;
          metric_id: string;
          required: boolean;
          active: boolean;
          display_order: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          platform_id: string;
          metric_id: string;
          required?: boolean;
          active?: boolean;
          display_order?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          platform_id?: string;
          metric_id?: string;
          required?: boolean;
          active?: boolean;
          display_order?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_metrics_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_metrics_metric_id_fkey";
            columns: ["metric_id"];
            isOneToOne: false;
            referencedRelation: "metrics";
            referencedColumns: ["id"];
          }
        ];
      };
      platform_metric_compatible_variants: {
        Row: {
          id: string;
          platform_metric_id: string;
          metric_definition_variant_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform_metric_id: string;
          metric_definition_variant_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          platform_metric_id?: string;
          metric_definition_variant_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_metric_compatible_variants_platform_metric_id_fkey";
            columns: ["platform_metric_id"];
            isOneToOne: false;
            referencedRelation: "platform_metrics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_metric_compatible_variants_metric_definition_variant_id_fkey";
            columns: ["metric_definition_variant_id"];
            isOneToOne: false;
            referencedRelation: "metric_definition_variants";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role?: OrganizationRole;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: OrganizationRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      performance_datasets: {
        Row: {
          id: string;
          owner_user_id: string | null;
          organization_id: string | null;
          platform_id: string;
          campaign_type_id: string | null;
          objective_id: string;
          vertical_id: string;
          country_id: string;
          audience_strategy_id: string | null;
          funnel_stage_id: string | null;
          business_model_id: string | null;
          performance_scope: PerformanceScopeType;
          start_date: string;
          end_date: string;
          original_currency: string;
          min_age: number | null;
          max_age: number | null;
          gender_targeting: GenderTargetingType;
          geographic_scope: GeographicScopeType | null;
          potential_audience_size: number | null;
          data_source: DataSourceType;
          validation_status: ValidationStatus;
          review_notes: string | null;
          created_at: string;
          updated_at: string;
          duration_days: number;
          year: number;
          month: number;
          quarter: number;
        };
        Insert: {
          id?: string;
          owner_user_id?: string | null;
          organization_id?: string | null;
          platform_id: string;
          campaign_type_id?: string | null;
          objective_id: string;
          vertical_id: string;
          country_id: string;
          audience_strategy_id?: string | null;
          funnel_stage_id?: string | null;
          business_model_id?: string | null;
          performance_scope?: PerformanceScopeType;
          start_date: string;
          end_date: string;
          original_currency: string;
          min_age?: number | null;
          max_age?: number | null;
          gender_targeting?: GenderTargetingType;
          geographic_scope?: GeographicScopeType | null;
          potential_audience_size?: number | null;
          data_source?: DataSourceType;
          validation_status?: ValidationStatus;
          review_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_user_id?: string | null;
          organization_id?: string | null;
          platform_id?: string;
          campaign_type_id?: string | null;
          objective_id?: string;
          vertical_id?: string;
          country_id?: string;
          audience_strategy_id?: string | null;
          funnel_stage_id?: string | null;
          business_model_id?: string | null;
          performance_scope?: PerformanceScopeType;
          start_date?: string;
          end_date?: string;
          original_currency?: string;
          min_age?: number | null;
          max_age?: number | null;
          gender_targeting?: GenderTargetingType;
          geographic_scope?: GeographicScopeType | null;
          potential_audience_size?: number | null;
          data_source?: DataSourceType;
          validation_status?: ValidationStatus;
          review_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "performance_datasets_owner_user_id_fkey";
            columns: ["owner_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_datasets_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_datasets_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_datasets_campaign_type_id_fkey";
            columns: ["campaign_type_id"];
            isOneToOne: false;
            referencedRelation: "campaign_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_datasets_objective_id_fkey";
            columns: ["objective_id"];
            isOneToOne: false;
            referencedRelation: "objectives";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_datasets_vertical_id_fkey";
            columns: ["vertical_id"];
            isOneToOne: false;
            referencedRelation: "verticals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_datasets_country_id_fkey";
            columns: ["country_id"];
            isOneToOne: false;
            referencedRelation: "countries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_datasets_audience_strategy_id_fkey";
            columns: ["audience_strategy_id"];
            isOneToOne: false;
            referencedRelation: "audience_strategies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_datasets_funnel_stage_id_fkey";
            columns: ["funnel_stage_id"];
            isOneToOne: false;
            referencedRelation: "funnel_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "performance_datasets_business_model_id_fkey";
            columns: ["business_model_id"];
            isOneToOne: false;
            referencedRelation: "business_models";
            referencedColumns: ["id"];
          }
        ];
      };
      dataset_metric_values: {
        Row: {
          id: string;
          dataset_id: string;
          metric_id: string;
          metric_definition_variant_id: string | null;
          raw_numeric_value: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          dataset_id: string;
          metric_id: string;
          metric_definition_variant_id?: string | null;
          raw_numeric_value: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          dataset_id?: string;
          metric_id?: string;
          metric_definition_variant_id?: string | null;
          raw_numeric_value?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dataset_metric_values_dataset_id_fkey";
            columns: ["dataset_id"];
            isOneToOne: false;
            referencedRelation: "performance_datasets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dataset_metric_values_metric_id_fkey";
            columns: ["metric_id"];
            isOneToOne: false;
            referencedRelation: "metrics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dataset_metric_values_metric_definition_variant_id_fkey";
            columns: ["metric_definition_variant_id"];
            isOneToOne: false;
            referencedRelation: "metric_definition_variants";
            referencedColumns: ["id"];
          }
        ];
      };
      normalized_metric_values: {
        Row: {
          id: string;
          dataset_metric_value_id: string;
          normalized_value: number;
          normalization_currency: string | null;
          exchange_rate_source: string | null;
          exchange_rate_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          dataset_metric_value_id: string;
          normalized_value: number;
          normalization_currency?: string | null;
          exchange_rate_source?: string | null;
          exchange_rate_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          dataset_metric_value_id?: string;
          normalized_value?: number;
          normalization_currency?: string | null;
          exchange_rate_source?: string | null;
          exchange_rate_date?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "normalized_metric_values_dataset_metric_value_id_fkey";
            columns: ["dataset_metric_value_id"];
            isOneToOne: true;
            referencedRelation: "dataset_metric_values";
            referencedColumns: ["id"];
          }
        ];
      };
      benchmark_settings: {
        Row: {
          id: string;
          setting_key: string;
          setting_value: Json;
          description: string | null;
          active: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          setting_key: string;
          setting_value: Json;
          description?: string | null;
          active?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          setting_key?: string;
          setting_value?: Json;
          description?: string | null;
          active?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "benchmark_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      fn_normalized_monthly_spend: {
        Args: { raw_spend: number; duration_days: number };
        Returns: number | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
