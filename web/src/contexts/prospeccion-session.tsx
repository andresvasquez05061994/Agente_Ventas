"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ApolloPerson } from "@/lib/types";
import { DEFAULT_SEARCH } from "@/lib/apollo-filters";

export type ProspeccionSearchStatus = "idle" | "loading" | "success" | "empty" | "error";

export type ProspeccionSearchMeta = {
  total_entries: number;
  page?: number;
  per_page?: number;
  total_pages?: number;
  next_page?: number | null;
  has_more?: boolean;
  with_contact_data?: number;
  scanned_profiles?: number;
  apollo_zero_results?: boolean;
  webhook_configured?: boolean;
  organization_name?: string;
  industry_relaxed?: boolean;
  credits_consumed?: number;
  portfolio_skipped?: number;
  country_rejected?: number;
  timed_out?: boolean;
  employee_ranges?: string[];
  enrich_stats?: {
    candidates?: number;
    matched?: number;
    with_email?: number;
    with_phone?: number;
    with_both?: number;
  };
};

function sessionStorageKey(userId: number): string {
  return `iac.prospeccion.v1.${userId}`;
}

type ProspeccionSessionState = {
  country: string;
  company: string;
  titles: string[];
  keyword: string;
  seniority: string;
  employeeRanges: string[];
  perPage: number;
  results: ApolloPerson[];
  selectedIds: string[];
  status: ProspeccionSearchStatus;
  meta: ProspeccionSearchMeta | null;
  /** Lectura comercial de la última búsqueda inteligente; viaja a la fuente del contacto al guardar. */
  searchIntent: SearchIntent | null;
};

export type SearchIntent = {
  text: string;
  titles: string[];
};

/**
 * La intención solo sigue vigente si la búsqueda actual comparte algún cargo con
 * la interpretada; si el vendedor cambió por completo la búsqueda, no se arrastra.
 */
export function activeSearchIntent(intent: SearchIntent | null, titles: string[]): string | null {
  if (!intent?.text.trim()) return null;
  return intent.titles.some((title) => titles.includes(title)) ? intent.text : null;
}

type ProspeccionSessionContextValue = ProspeccionSessionState & {
  selected: Set<string>;
  setSearchIntent: (intent: SearchIntent | null) => void;
  appendResults: (people: ApolloPerson[]) => void;
  setCountry: (v: string) => void;
  setCompany: (v: string) => void;
  setTitles: (v: string[]) => void;
  setKeyword: (v: string) => void;
  setSeniority: (v: string) => void;
  setEmployeeRanges: (v: string[]) => void;
  setPerPage: (v: number) => void;
  setResults: (results: ApolloPerson[]) => void;
  setSelectedIds: (ids: string[]) => void;
  setStatus: (status: ProspeccionSearchStatus) => void;
  setMeta: (meta: ProspeccionSearchMeta | null) => void;
  toggleSelected: (id: string) => void;
  selectAllResults: () => void;
  clearSelected: () => void;
  removeResultsByIds: (ids: string[]) => void;
  clearSession: () => void;
  applyInterpretedFilters: (filters: {
    country: string;
    company: string;
    titles: string[];
    keyword: string;
    seniority: string;
    employeeRanges?: string[];
    perPage: number;
  }) => void;
  applyFilters: (filters: {
    country: string;
    company: string;
    titles: string[];
    keyword: string;
    seniority: string;
    employeeRanges?: string[];
    perPage: number;
  }) => void;
};

function createInitialState(): ProspeccionSessionState {
  return {
    country: DEFAULT_SEARCH.country,
    company: DEFAULT_SEARCH.company,
    titles: [...DEFAULT_SEARCH.titles],
    keyword: DEFAULT_SEARCH.keyword,
    seniority: DEFAULT_SEARCH.seniority,
    employeeRanges: [...DEFAULT_SEARCH.employeeRanges],
    perPage: DEFAULT_SEARCH.perPage,
    results: [],
    selectedIds: [],
    status: "idle",
    meta: null,
    searchIntent: null,
  };
}

function persistable(state: ProspeccionSessionState): ProspeccionSessionState {
  return {
    ...state,
    status: state.status === "loading" ? (state.results.length ? "success" : "idle") : state.status,
  };
}

function readStoredSession(userId: number): ProspeccionSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(sessionStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProspeccionSessionState>;
    if (!parsed || typeof parsed !== "object") return null;
    const base = createInitialState();
    const status: ProspeccionSearchStatus =
      parsed.status === "success" || parsed.status === "empty" || parsed.status === "error"
        ? parsed.status
        : Array.isArray(parsed.results) && parsed.results.length
          ? "success"
          : "idle";
    return {
      ...base,
      country: typeof parsed.country === "string" ? parsed.country : base.country,
      company: typeof parsed.company === "string" ? parsed.company : base.company,
      titles: Array.isArray(parsed.titles) ? parsed.titles.filter((t) => typeof t === "string") : base.titles,
      keyword: typeof parsed.keyword === "string" ? parsed.keyword : base.keyword,
      seniority: typeof parsed.seniority === "string" ? parsed.seniority : base.seniority,
      employeeRanges: Array.isArray(parsed.employeeRanges)
        ? parsed.employeeRanges.filter((r) => typeof r === "string")
        : base.employeeRanges,
      perPage: typeof parsed.perPage === "number" ? parsed.perPage : base.perPage,
      results: Array.isArray(parsed.results) ? parsed.results : [],
      selectedIds: Array.isArray(parsed.selectedIds)
        ? parsed.selectedIds.filter((id) => typeof id === "string")
        : [],
      status,
      meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : null,
      searchIntent:
        parsed.searchIntent &&
        typeof parsed.searchIntent === "object" &&
        typeof parsed.searchIntent.text === "string" &&
        Array.isArray(parsed.searchIntent.titles)
          ? {
              text: parsed.searchIntent.text,
              titles: parsed.searchIntent.titles.filter((t) => typeof t === "string"),
            }
          : null,
    };
  } catch {
    return null;
  }
}

function writeStoredSession(userId: number, state: ProspeccionSessionState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(sessionStorageKey(userId), JSON.stringify(persistable(state)));
  } catch {
    /* quota or private mode */
  }
}

const ProspeccionSessionContext = createContext<ProspeccionSessionContextValue | null>(null);

export function ProspeccionSessionProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: number | null;
}) {
  const [state, setState] = useState<ProspeccionSessionState>(createInitialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(false);
    if (!userId) {
      setState(createInitialState());
      setHydrated(true);
      return;
    }
    setState(readStoredSession(userId) ?? createInitialState());
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!hydrated || !userId) return;
    writeStoredSession(userId, state);
  }, [hydrated, state, userId]);

  const selected = useMemo(() => new Set(state.selectedIds), [state.selectedIds]);

  const setCountry = useCallback((country: string) => {
    setState((s) => ({ ...s, country }));
  }, []);

  const setCompany = useCallback((company: string) => {
    setState((s) => ({ ...s, company }));
  }, []);

  const setTitles = useCallback((titles: string[]) => {
    setState((s) => ({ ...s, titles }));
  }, []);

  const setKeyword = useCallback((keyword: string) => {
    setState((s) => ({ ...s, keyword }));
  }, []);

  const setSeniority = useCallback((seniority: string) => {
    setState((s) => ({ ...s, seniority }));
  }, []);

  const setEmployeeRanges = useCallback((employeeRanges: string[]) => {
    setState((s) => ({ ...s, employeeRanges }));
  }, []);

  const setPerPage = useCallback((perPage: number) => {
    setState((s) => ({ ...s, perPage }));
  }, []);

  const setResults = useCallback((results: ApolloPerson[]) => {
    setState((s) => ({ ...s, results }));
  }, []);

  const setSelectedIds = useCallback((selectedIds: string[]) => {
    setState((s) => ({ ...s, selectedIds }));
  }, []);

  const setStatus = useCallback((status: ProspeccionSearchStatus) => {
    setState((s) => ({ ...s, status }));
  }, []);

  const setMeta = useCallback((meta: ProspeccionSearchMeta | null) => {
    setState((s) => ({ ...s, meta }));
  }, []);

  const setSearchIntent = useCallback((searchIntent: SearchIntent | null) => {
    setState((s) => ({ ...s, searchIntent }));
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setState((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, selectedIds: [...next] };
    });
  }, []);

  const selectAllResults = useCallback(() => {
    setState((s) => ({
      ...s,
      selectedIds: s.results.map((r) => r.apollo_id),
    }));
  }, []);

  const clearSelected = useCallback(() => {
    setState((s) => ({ ...s, selectedIds: [] }));
  }, []);

  const removeResultsByIds = useCallback((ids: string[]) => {
    const remove = new Set(ids);
    setState((s) => {
      const results = s.results.filter((r) => !remove.has(r.apollo_id));
      const selectedIds = s.selectedIds.filter((id) => !remove.has(id));
      return {
        ...s,
        results,
        selectedIds,
        status: results.length ? s.status : "idle",
        meta: results.length ? s.meta : null,
      };
    });
  }, []);

  const appendResults = useCallback((people: ApolloPerson[]) => {
    setState((s) => {
      const known = new Set(s.results.map((r) => r.apollo_id));
      const fresh = people.filter((p) => !known.has(p.apollo_id));
      return {
        ...s,
        results: [...s.results, ...fresh],
      };
    });
  }, []);

  const clearSession = useCallback(() => {
    setState(() => createInitialState());
  }, []);
  const applyInterpretedFilters = useCallback(
    (filters: {
      country: string;
      company: string;
      titles: string[];
      keyword: string;
      seniority: string;
      employeeRanges?: string[];
      perPage: number;
    }) => {
      setState((s) => ({
        ...s,
        country: filters.country,
        company: filters.company || "",
        titles: [...filters.titles],
        keyword: filters.keyword || "",
        seniority: filters.seniority || "",
        employeeRanges: filters.employeeRanges ?? [],
        perPage: filters.perPage,
        results: [],
        selectedIds: [],
        meta: null,
        status: "idle",
      }));
    },
    []
  );

  const applyFilters = applyInterpretedFilters;

  const value = useMemo<ProspeccionSessionContextValue>(
    () => ({
      ...state,
      selected,
      setSearchIntent,
      appendResults,
      setCountry,
      setCompany,
      setTitles,
      setKeyword,
      setSeniority,
      setEmployeeRanges,
      setPerPage,
      setResults,
      setSelectedIds,
      setStatus,
      setMeta,
      toggleSelected,
      selectAllResults,
      clearSelected,
      removeResultsByIds,
      clearSession,
      applyInterpretedFilters,
      applyFilters,
    }),
    [
      state,
      selected,
      setSearchIntent,
      appendResults,
      setCountry,
      setCompany,
      setTitles,
      setKeyword,
      setSeniority,
      setEmployeeRanges,
      setPerPage,
      setResults,
      setSelectedIds,
      setStatus,
      setMeta,
      toggleSelected,
      selectAllResults,
      clearSelected,
      removeResultsByIds,
      clearSession,
      applyInterpretedFilters,
      applyFilters,
    ]
  );

  return (
    <ProspeccionSessionContext.Provider value={value}>
      {children}
    </ProspeccionSessionContext.Provider>
  );
}

export function useProspeccionSession() {
  const ctx = useContext(ProspeccionSessionContext);
  if (!ctx) {
    throw new Error("useProspeccionSession debe usarse dentro de ProspeccionSessionProvider");
  }
  return ctx;
}
