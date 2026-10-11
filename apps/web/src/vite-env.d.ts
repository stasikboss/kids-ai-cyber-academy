/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_CREATE_FAMILY_URL?: string;
  readonly VITE_POLICY_VERSION?: string;
  /** "on" once Google sign-in is configured in Supabase Auth. */
  readonly VITE_GOOGLE_SIGNIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
