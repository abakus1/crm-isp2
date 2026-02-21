export type StaffAddressPrg = {
  place_name: string;
  terc: string;
  simc: string;
  street_name: string;
  ulic: string;
  building_no: string;

  // opcjonalne
  local_no?: string | null;
  postal_code?: string | null;
  post_city?: string | null;
};

export type StaffOut = {
  id: number;
  username: string;
  email?: string | null;
  role: string;
  status: string;
  must_change_credentials: boolean;
  mfa_required: boolean;

  first_name?: string | null;
  last_name?: string | null;
  phone_company?: string | null;
  job_title?: string | null;
  birth_date?: string | null;
  pesel?: string | null;
  id_document_no?: string | null;

  // legacy
  address_registered?: string | null;
  address_current?: string | null;

  // PRG structured
  address_registered_prg?: StaffAddressPrg | null;
  address_current_prg?: StaffAddressPrg | null;

  address_current_same_as_registered?: boolean;
};

export type Role = {
  code: string;
  label_pl: string;
  description_pl: string;
};

export type ResolvedAction = {
  code: string;
  label_pl: string;
  description_pl: string;
  allowed: boolean;
  source: "role" | "override_allow" | "override_deny" | "none";
  override: "allow" | "deny" | null;
};

export type OverrideEffect = "allow" | "deny" | null;