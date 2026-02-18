import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GooglePlaceBasic {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
  types?: string[];
}

export interface GooglePlaceDetail {
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  geometry?: { location: { lat: number; lng: number } };
  photos?: Array<{ photo_reference: string; height: number; width: number }>;
  opening_hours?: { open_now?: boolean; weekday_text?: string[] };
  formatted_address?: string;
  business_status?: string;
  url?: string; // Google Maps URL
}

export interface GooglePlaceWithDetail extends GooglePlaceBasic {
  detail?: GooglePlaceDetail;
}

export function useGoogleMaps() {
  const [searchResults, setSearchResults] = useState<GooglePlaceBasic[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<GooglePlaceWithDetail | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string>('');

  // textSearch: cheap — only returns place_id + name + address
  const searchPlaces = useCallback(async (nicho: string, cidade: string, bairro?: string) => {
    if (!nicho.trim() || !cidade.trim()) return;
    setLoadingSearch(true);
    setSearchError(null);
    setSelectedPlace(null);
    setSearchResults([]);
    setNextPageToken(null);

    const query = [nicho, bairro, cidade].filter(Boolean).join(' ');
    setLastQuery(query);

    try {
      const { data, error } = await supabase.functions.invoke('google-maps-proxy', {
        body: { type: 'textSearch', query },
      });

      if (error) throw new Error(error.message);
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Maps: ${data.status}`);
      }

      const results: GooglePlaceBasic[] = (data.results || []).map((r: any) => ({
        place_id: r.place_id,
        name: r.name,
        vicinity: r.vicinity,
        formatted_address: r.formatted_address,
        rating: r.rating,
        user_ratings_total: r.user_ratings_total,
        business_status: r.business_status,
        types: r.types,
      }));

      setSearchResults(results);
      setNextPageToken(data.next_page_token || null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro na busca';
      setSearchError(msg);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  // Load next page of results using next_page_token
  const loadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);

    try {
      // Google requires a short delay before next_page_token is valid
      await new Promise(res => setTimeout(res, 2000));

      const { data, error } = await supabase.functions.invoke('google-maps-proxy', {
        body: { type: 'textSearch', query: lastQuery, pageToken: nextPageToken },
      });

      if (error) throw new Error(error.message);

      const results: GooglePlaceBasic[] = (data.results || []).map((r: any) => ({
        place_id: r.place_id,
        name: r.name,
        vicinity: r.vicinity,
        formatted_address: r.formatted_address,
        rating: r.rating,
        user_ratings_total: r.user_ratings_total,
        business_status: r.business_status,
        types: r.types,
      }));

      // Deduplicate
      setSearchResults(prev => {
        const existingIds = new Set(prev.map(p => p.place_id));
        const newResults = results.filter(r => !existingIds.has(r.place_id));
        return [...prev, ...newResults];
      });
      setNextPageToken(data.next_page_token || null);
    } catch (err) {
      console.error('loadMore error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [nextPageToken, loadingMore, lastQuery]);

  // getDetails: called ONLY when user clicks a row (lazy load to save credit)
  const fetchDetails = useCallback(async (place: GooglePlaceBasic): Promise<GooglePlaceWithDetail> => {
    setLoadingDetail(true);

    try {
      const { data, error } = await supabase.functions.invoke('google-maps-proxy', {
        body: { type: 'getDetails', placeId: place.place_id },
      });

      if (error) throw new Error(error.message);

      const detail: GooglePlaceDetail = data.result || {};

      const enriched: GooglePlaceWithDetail = { ...place, detail };
      setSelectedPlace(enriched);
      return enriched;
    } catch (err) {
      const basic: GooglePlaceWithDetail = { ...place };
      setSelectedPlace(basic);
      return basic;
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const selectPlace = useCallback(async (place: GooglePlaceBasic) => {
    // If same place already selected, deselect
    if (selectedPlace?.place_id === place.place_id) {
      setSelectedPlace(null);
      return;
    }
    // Set basic info immediately for snappy UI
    setSelectedPlace({ ...place });
    // Then lazy load details
    await fetchDetails(place);
  }, [selectedPlace, fetchDetails]);

  const reset = useCallback(() => {
    setSearchResults([]);
    setSelectedPlace(null);
    setSearchError(null);
    setNextPageToken(null);
    setLastQuery('');
  }, []);

  return {
    searchResults,
    loadingSearch,
    loadingMore,
    loadingDetail,
    searchError,
    selectedPlace,
    nextPageToken,
    searchPlaces,
    selectPlace,
    loadMore,
    reset,
  };
}
