/**
 * Wrapper around useGoogleMaps that persists search state to localStorage.
 * This ensures that navigating away from the Prospeccao page and returning
 * restores the last results instead of resetting to an empty state.
 */
import { useState, useCallback, useEffect } from 'react';
import { useGoogleMaps, GooglePlaceBasic } from './useGoogleMaps';

const STORAGE_KEY = 'prospeccao_search_state';

interface PersistedState {
  nicho: string;
  cidade: string;
  bairro: string;
  results: GooglePlaceBasic[];
  nextPageToken: string | null;
  lastQuery: string;
  savedAt: number;
}

const TTL_MS = 1000 * 60 * 30; // 30 minutes

function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: PersistedState = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors (quota, private mode)
  }
}

export function useGoogleMapsSearch() {
  const maps = useGoogleMaps();

  // Form fields — restored from localStorage if available
  const [nicho, setNicho] = useState('');
  const [cidade, setCidade] = useState('');
  const [bairro, setBairro] = useState('');
  const [restoredResults, setRestoredResults] = useState<GooglePlaceBasic[]>([]);
  const [isRestored, setIsRestored] = useState(false);

  // On mount, restore persisted state
  useEffect(() => {
    const saved = loadPersistedState();
    if (!saved) return;
    setNicho(saved.nicho);
    setCidade(saved.cidade);
    setBairro(saved.bairro);
    setRestoredResults(saved.results);
    setIsRestored(true);
    // Inject results back into the maps hook's internal state via the injector
    // We'll merge them in the returned object below
  }, []);

  // Once useGoogleMaps has its own results (after a fresh search), stop using restored ones
  const activeResults = maps.searchResults.length > 0 ? maps.searchResults : restoredResults;

  // Persist whenever results or form fields change
  useEffect(() => {
    if (activeResults.length === 0) return;
    saveState({
      nicho,
      cidade,
      bairro,
      results: activeResults,
      nextPageToken: maps.nextPageToken,
      lastQuery: '',
      savedAt: Date.now(),
    });
  }, [activeResults, nicho, cidade, bairro, maps.nextPageToken]);

  const handleSearch = useCallback(async () => {
    setRestoredResults([]); // clear restored — fresh search
    await maps.searchPlaces(nicho, cidade, bairro || undefined);
  }, [maps, nicho, cidade, bairro]);

  const reset = useCallback(() => {
    maps.reset();
    setRestoredResults([]);
    setIsRestored(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, [maps]);

  return {
    // Form state
    nicho, setNicho,
    cidade, setCidade,
    bairro, setBairro,
    // Results — prefer live results, fall back to restored
    searchResults: activeResults,
    isRestored,
    // Passthrough from useGoogleMaps
    loadingSearch: maps.loadingSearch,
    loadingMore: maps.loadingMore,
    loadingDetail: maps.loadingDetail,
    searchError: maps.searchError,
    selectedPlace: maps.selectedPlace,
    nextPageToken: maps.nextPageToken,
    selectPlace: maps.selectPlace,
    loadMore: maps.loadMore,
    handleSearch,
    reset,
  };
}
