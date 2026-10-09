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
import type { ExcelCompanyQueue } from "@/lib/excel-companies";

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

const SESSION_STORAGE_KEY = "iac.prospeccion.v1";

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
  excelQueue: ExcelCompanyQueue | null;
};

type ProspeccionSessionContextValue = ProspeccionSessionState & {
  selected: Set<string>;
  setExcelQueue: (
    next: ExcelCompanyQueue | null | ((current: ExcelCompanyQueue | null) => ExcelCompanyQueue | null)
  ) => void;
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
    excelQueue: null,
  };
}

function persistable(state: ProspeccionSessionState): ProspeccionSessionState {
  return {
    ...state,
    status: state.status === "loading" ? (state.results.length ? "success" : "idle") : state.status,
  };
}

function readStoredSession(): ProspeccionSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
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
      excelQueue: parsed.excelQueue && typeof parsed.excelQueue === "object" ? parsed.excelQueue : null,
    };
  } catch {
    return null;
  }
}

function writeStoredSession(state: ProspeccionSessionState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persistable(state)));
  } catch {
    /* quota or private mode */
  }
}

const ProspeccionSessionContext = createContext<ProspeccionSessionContextValue | null>(null);

export function ProspeccionSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProspeccionSessionState>(createInitialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredSession();
    if (stored) setState(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeStoredSession(state);
  }, [hydrated, state]);

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

  const setExcelQueue = useCallback(
    (
      next:
        | ExcelCompanyQueue
        | null
        | ((current: ExcelCompanyQueue | null) => ExcelCompanyQueue | null)
    ) => {
      setState((s) => ({
        ...s,
        excelQueue: typeof next === "function" ? next(s.excelQueue) : next,
      }));
    },
    []
  );

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
    setState((s) => ({ ...createInitialState(), excelQueue: s.excelQueue }));
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
      setExcelQueue,
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
      setExcelQueue,
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
