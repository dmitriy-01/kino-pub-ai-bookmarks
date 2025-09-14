/**
 * Kino.pub API Client Interface
 * Based on actual stremio.kino.pub auth.js and client.js implementation
 */

export interface KinoPubAuthResponse {
  code: string;           // device_code in OAuth spec
  user_code: string;
  verification_uri: string;
  interval: number;
}

export interface KinoPubTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface KinoPubApiResponse<T = any> {
  status: number;
  data?: T;
  item?: T;  // Some endpoints return data in 'item' field
  items?: T; // Some endpoints return data in 'items' field
  pagination?: {
    current: number;
    total: number;
    per_page: number;
    total_items?: number;
    perpage?: number;
  };
}

// Specific response types for bookmarks API
export interface KinoPubBookmarkFoldersResponse {
  status: number;
  items: KinoPubBookmarkFolder[];
}

export interface KinoPubBookmarkFolderResponse {
  status: number;
  data: KinoPubBookmarkFolderContent;
}

export interface KinoPubBookmarkActionResponse {
  status: number;
  message?: string;
}

export interface KinoPubMediaItem {
  id: number;
  title: string;
  type: 'movie' | 'documovie' | '3d' | 'serial' | 'docuserial' | 'tvshow';
  subtype?: string;
  year?: number;
  genres?: KinoPubGenre[];
  countries?: KinoPubCountry[];
  rating?: {
    imdb?: number;
    kinopoisk?: number;
  };
  imdb_rating?: number; // Direct IMDB rating field
  kinopoisk_rating?: number; // Direct Kinopoisk rating field
  description?: string;
  actors?: string[];
  directors?: string[];
  poster?: string;
  posters?: {
    small?: string;
    medium?: string;
    big?: string;
  };
  trailer?: string;
  quality?: string;
  ac3?: number;
  director?: string;
  cast?: string;
  subscribed?: boolean; // Indicates if user is subscribed to this item
  in_watchlist?: boolean; // Indicates if item is in watchlist
  videos?: KinoPubVideo[];      // For movies
  seasons?: KinoPubSeason[];    // For TV shows
}

export interface KinoPubVideo {
  id: number;
  title?: string;
  duration?: number;
  files: KinoPubFile[];
  subtitles?: KinoPubSubtitle[];
  audios?: KinoPubAudio[];
}

export interface KinoPubSeason {
  id: number;
  number: number;
  episodes: KinoPubVideo[];
}

export interface KinoPubFile {
  id: number;
  url: string;
  quality: string;
  size?: number;
}

export interface KinoPubSubtitle {
  id: number;
  lang: string;
  url: string;
}

export interface KinoPubAudio {
  id: number;
  lang: string;
  codec?: string;
}

export interface KinoPubWatchingItem {
  id: number;
  item: KinoPubMediaItem;
  time: number;
  duration: number;
  updated_at: string;
}

export interface KinoPubWatchingSerial {
  id: number;
  type: string;
  title: string;
  subtype: string;
  posters: {
    small: string;
    medium: string;
    big: string;
  };
  total: string | number;
  watched: number;
  new: number | string;
}

export interface KinoPubBookmarkFolder {
  id: number;
  title: string;
  views: number;
  count: string | number;
  created: number;
  updated: number;
}

export interface KinoPubBookmarkFolderContent {
  id: number;
  title: string;
  count: number;
  items: KinoPubBookmarkItem[];
  pagination?: {
    current: number;
    total: number;
    per_page: number;
    total_items?: number;
  };
}

export interface KinoPubBookmarkItem {
  id: number;
  title: string;
  type: 'movie' | 'documovie' | '3d' | 'serial' | 'docuserial' | 'tvshow';
  subtype?: string;
  year?: number;
  genres?: KinoPubGenre[];
  countries?: KinoPubCountry[];
  rating?: {
    imdb?: number;
    kinopoisk?: number;
  };
  imdb_rating?: number; // Direct IMDB rating field
  kinopoisk_rating?: number; // Direct Kinopoisk rating field
  description?: string;
  actors?: string[];
  directors?: string[];
  poster?: string;
  posters?: {
    small?: string;
    medium?: string;
    big?: string;
  };
  trailer?: string;
  quality?: string;
  ac3?: number;
  director?: string;
  cast?: string;
  subscribed?: boolean; // Indicates if user is subscribed to this item
  in_watchlist?: boolean; // Indicates if item is in watchlist
  videos?: KinoPubVideo[];      // For movies
  seasons?: KinoPubSeason[];    // For TV shows
}

export interface KinoPubGenre {
  id: number;
  title: string;
}

export interface KinoPubCountry {
  id: number;
  title: string;
}

/**
 * Kino.pub API Client Interface
 * Based on actual stremio.kino.pub client.js implementation
 */
export interface KinoPubApiClient {
  // Authentication methods (from auth.js)
  startDeviceAuth(): Promise<KinoPubAuthResponse>;
  pollForToken(deviceCode: string, interval: number): Promise<KinoPubTokenResponse>;
  refreshToken(refreshToken: string): Promise<KinoPubTokenResponse>;
  isAuthenticated(): boolean;
  
  // Simple test endpoints (from client.js)
  getWatching(): Promise<KinoPubApiResponse<KinoPubWatchingItem[]>>;
  
  // Content discovery methods (from client.js)
  getItems(type?: string, page?: number, perPage?: number): Promise<KinoPubApiResponse<KinoPubMediaItem[]>>;
  searchItems(query: string, type?: string): Promise<KinoPubApiResponse<KinoPubMediaItem[]>>;
  getItemById(id: number): Promise<KinoPubApiResponse<KinoPubMediaItem>>;
  
  // Video streaming methods (from client.js)
  getStreamUrl(itemId: number, videoId?: number, seasonId?: number): Promise<{
    files: KinoPubFile[];
    subtitles: KinoPubSubtitle[];
    audios: KinoPubAudio[];
    duration?: number;
    title?: string;
  }>;
}

/**
 * API Error types for proper error handling
 */
export class KinoPubApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string
  ) {
    super(message);
    this.name = 'KinoPubApiError';
  }
}

export class KinoPubAuthError extends KinoPubApiError {
  constructor(message: string, errorCode?: string) {
    super(message, 401, errorCode);
    this.name = 'KinoPubAuthError';
  }
}

/**
 * HTTP Client configuration for kino.pub API
 */
export interface KinoPubApiConfig {
  apiUrl: string;
  oauthUrl: string;
  clientId: string;
  clientSecret: string;
  timeout: number;
  userAgent: string;
}