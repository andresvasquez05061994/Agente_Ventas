"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ApolloPerson } from "@/lib/types";
import { DEFAULT_SEARCH } from "@/lib/apollo-filters";

export type ProspeccionSearchStatus = "idle" | "loading" | "success" | "empty" | "error";

export type ProspeccionSearchMeta = {
  total_entries: number;
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
};

type ProspeccionSessionContextValue = ProspeccionSessionState & {
  selected: Set<string>;
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
  };
}

const ProspeccionSessionContext = createContext<ProspeccionSessionContextValue | null>(null);

export function ProspeccionSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProspeccionSessionState>(createInitialState);

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

  const clearSession = useCallback(() => {
    setState(createInitialState());
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
