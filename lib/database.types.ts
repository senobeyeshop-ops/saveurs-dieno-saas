// Généré depuis le projet Supabase « saveurs-dieno » (supabase gen types)
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Rel = { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] }

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" }
  public: {
    Tables: {
      articles: {
        Row: { actif: boolean; categorie: string; created_at: string; id: string; nom: string; ordre: number; prix: number; prix_max: number | null; prix_min: number | null; prix_variable: boolean; restaurant_id: string }
        Insert: { actif?: boolean; categorie?: string; created_at?: string; id?: string; nom: string; ordre?: number; prix: number; prix_max?: number | null; prix_min?: number | null; prix_variable?: boolean; restaurant_id: string }
        Update: { actif?: boolean; categorie?: string; created_at?: string; id?: string; nom?: string; ordre?: number; prix?: number; prix_max?: number | null; prix_min?: number | null; prix_variable?: boolean; restaurant_id?: string }
        Relationships: Rel[]
      }
      depenses: {
        Row: { categorie: string; created_at: string; created_by: string | null; id: string; jour: string; libelle: string; mode_paiement: string; montant: number; restaurant_id: string }
        Insert: { categorie?: string; created_at?: string; created_by?: string | null; id?: string; jour?: string; libelle: string; mode_paiement?: string; montant: number; restaurant_id: string }
        Update: { categorie?: string; created_at?: string; created_by?: string | null; id?: string; jour?: string; libelle?: string; mode_paiement?: string; montant?: number; restaurant_id?: string }
        Relationships: Rel[]
      }
      ingredients: {
        Row: { cout_unitaire: number; created_at: string; id: string; nom: string; restaurant_id: string; seuil: number; stock: number; unite: string }
        Insert: { cout_unitaire?: number; created_at?: string; id?: string; nom: string; restaurant_id: string; seuil?: number; stock?: number; unite?: string }
        Update: { cout_unitaire?: number; created_at?: string; id?: string; nom?: string; restaurant_id?: string; seuil?: number; stock?: number; unite?: string }
        Relationships: Rel[]
      }
      membres: {
        Row: { created_at: string; nom_affiche: string | null; restaurant_id: string; role: string; user_id: string }
        Insert: { created_at?: string; nom_affiche?: string | null; restaurant_id: string; role?: string; user_id: string }
        Update: { created_at?: string; nom_affiche?: string | null; restaurant_id?: string; role?: string; user_id?: string }
        Relationships: Rel[]
      }
      mouvements_stock: {
        Row: { cout: number | null; created_at: string; created_by: string | null; id: string; ingredient_id: string; note: string | null; quantite: number; restaurant_id: string; type: string; vente_id: string | null }
        Insert: { cout?: number | null; created_at?: string; created_by?: string | null; id?: string; ingredient_id: string; note?: string | null; quantite: number; restaurant_id: string; type: string; vente_id?: string | null }
        Update: { cout?: number | null; created_at?: string; created_by?: string | null; id?: string; ingredient_id?: string; note?: string | null; quantite?: number; restaurant_id?: string; type?: string; vente_id?: string | null }
        Relationships: Rel[]
      }
      recettes: {
        Row: { article_id: string; ingredient_id: string; quantite: number; restaurant_id: string }
        Insert: { article_id: string; ingredient_id: string; quantite: number; restaurant_id: string }
        Update: { article_id?: string; ingredient_id?: string; quantite?: number; restaurant_id?: string }
        Relationships: Rel[]
      }
      restaurants: {
        Row: { adresse: string | null; code_invitation: string; code_proprietaire: string | null; created_at: string; email: string | null; id: string; nom: string; telephone: string | null }
        Insert: { adresse?: string | null; code_invitation?: string; code_proprietaire?: string | null; created_at?: string; email?: string | null; id?: string; nom: string; telephone?: string | null }
        Update: { adresse?: string | null; code_invitation?: string; code_proprietaire?: string | null; created_at?: string; email?: string | null; id?: string; nom?: string; telephone?: string | null }
        Relationships: Rel[]
      }
      vente_lignes: {
        Row: { article_id: string | null; id: string; nom: string; prix_unitaire: number; quantite: number; restaurant_id: string; vente_id: string }
        Insert: { article_id?: string | null; id?: string; nom: string; prix_unitaire: number; quantite: number; restaurant_id: string; vente_id: string }
        Update: { article_id?: string | null; id?: string; nom?: string; prix_unitaire?: number; quantite?: number; restaurant_id?: string; vente_id?: string }
        Relationships: [{ foreignKeyName: "vente_lignes_vente_id_fkey"; columns: ["vente_id"]; isOneToOne: false; referencedRelation: "ventes"; referencedColumns: ["id"] }]
      }
      ventes: {
        Row: { annulee: boolean; annulee_par: string | null; caissier_id: string | null; created_at: string; id: string; jour: string; mode_paiement: string; montant_recu: number | null; numero: number; restaurant_id: string; total: number }
        Insert: { annulee?: boolean; annulee_par?: string | null; caissier_id?: string | null; created_at?: string; id?: string; jour?: string; mode_paiement: string; montant_recu?: number | null; numero: number; restaurant_id: string; total: number }
        Update: { annulee?: boolean; annulee_par?: string | null; caissier_id?: string | null; created_at?: string; id?: string; jour?: string; mode_paiement?: string; montant_recu?: number | null; numero?: number; restaurant_id?: string; total?: number }
        Relationships: Rel[]
      }
    }
    Views: {
      stats_articles_jour: { Row: { jour: string | null; montant: number | null; nom: string | null; quantite: number | null; restaurant_id: string | null }; Relationships: Rel[] }
      stats_depenses_jour: { Row: { depenses: number | null; jour: string | null; restaurant_id: string | null }; Relationships: Rel[] }
      stats_ventes_jour: { Row: { ca: number | null; ca_especes: number | null; ca_orange_money: number | null; ca_wave: number | null; jour: string | null; restaurant_id: string | null; tickets: number | null }; Relationships: Rel[] }
    }
    Functions: {
      annuler_vente: { Args: { p_vente: string }; Returns: undefined }
      creer_restaurant: { Args: { p_adresse?: string; p_nom: string; p_telephone?: string }; Returns: string }
      encaisser: { Args: { p_lignes: Json; p_mode: string; p_recu: number; p_restaurant: string }; Returns: { numero: number; total: number; vente_id: string }[] }
      mouvement_stock: { Args: { p_cout?: number; p_en_depense?: boolean; p_ingredient: string; p_mode?: string; p_note?: string; p_quantite: number; p_type: string }; Returns: undefined }
      debloquer_compte: { Args: { p_email: string; p_restaurant: string }; Returns: undefined }
      rejoindre_restaurant: { Args: { p_code: string }; Returns: string | null }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type T = Database["public"]["Tables"]
export type Article = T["articles"]["Row"]
export type Ingredient = T["ingredients"]["Row"]
export type Recette = T["recettes"]["Row"]
export type Vente = T["ventes"]["Row"]
export type VenteLigne = T["vente_lignes"]["Row"]
export type Depense = T["depenses"]["Row"]
export type Mouvement = T["mouvements_stock"]["Row"]
export type Membre = T["membres"]["Row"]
export type Restaurant = Omit<T["restaurants"]["Row"], "code_proprietaire">
