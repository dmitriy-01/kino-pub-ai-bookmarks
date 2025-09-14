import axios, { AxiosResponse, AxiosError } from 'axios';
import { AuthenticationService } from './auth';
import { getConfig } from '../config';
import {
  KinoPubApiResponse,
  KinoPubMediaItem,
  KinoPubBookmarkItem,
  KinoPubWatchingItem,
  KinoPubWatchingSerial,
  KinoPubBookmarkFolder,
  KinoPubBookmarkFolderContent,
  KinoPubBookmarkFoldersResponse,
  KinoPubBookmarkFolderResponse,
  KinoPubBookmarkActionResponse,
  KinoPubApiError,
  KinoPubAuthError,
  KinoPubApiClient
} from './kino-pub-api';

/**
 * Kino.pub API Client Implementation
 * Based on stremio.kino.pub client.js patterns
 */
export class KinoPubClient implements Partial<KinoPubApiClient> {
  private authService: AuthenticationService;
  private config = getConfig();
  private maxRetries = 3;
  private retryDelay = 2000; // 2 seconds base delay

  constructor() {
    this.authService = new AuthenticationService();
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }

  /**
   * Get currently watching items (simple test endpoint)
   */
  public async getWatching(): Promise<KinoPubApiResponse<KinoPubWatchingItem[]>> {
    return this.makeAuthenticatedRequest<KinoPubWatchingItem[]>('/watching');
  }

  /**
   * Get watching serials with detailed progress information
   * Returns all serials in the watching list
   */
  public async getWatchingSerials(): Promise<KinoPubApiResponse<KinoPubWatchingSerial[]>> {
    const response = await this.makeAuthenticatedRequest<any>('/watching/serials');
    
    // The API returns data in 'items' field for this endpoint
    if ((response as any).items) {
      return {
        ...response,
        data: (response as any).items
      };
    }
    
    return response;
  }

  /**
   * Get user's bookmark folders
   */
  public async getBookmarkFolders(): Promise<KinoPubBookmarkFoldersResponse> {
    const response = await this.makeAuthenticatedRequest<any>('/bookmarks');
    
    // API returns items in 'items' field
    return {
      status: response.status || 200,
      items: response.items || response.data || []
    };
  }

  /**
   * Get items in a specific bookmark folder
   */
  public async getBookmarkFolder(folderId: number, page: number = 1): Promise<KinoPubBookmarkFolderResponse> {
    const params = page > 1 ? `?page=${page}` : '';
    const response = await this.makeAuthenticatedRequest<any>(`/bookmarks/${folderId}${params}`);
    
    // API can return data in different structures
    if (response.data) {
      return {
        status: response.status || 200,
        data: response.data
      };
    } else {
      // Handle direct response structure
      return {
        status: response.status || 200,
        data: {
          id: folderId,
          title: (response as any).title || '',
          count: (response as any).count || 0,
          items: (response as any).items || [],
          pagination: (response as any).pagination
        }
      };
    }
  }

  /**
   * Get ALL items in a specific bookmark folder (handles pagination)
   */
  public async getAllBookmarkFolderItems(folderId: number): Promise<KinoPubBookmarkItem[]> {
    const allItems: KinoPubBookmarkItem[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const folderResponse = await this.getBookmarkFolder(folderId, currentPage);
      const items = folderResponse.data?.items || [];
      allItems.push(...items);

      // Check pagination info
      const pagination = folderResponse.data?.pagination;
      if (pagination && pagination.total > 1) {
        totalPages = pagination.total;
        currentPage++;
      } else {
        break; // No more pages
      }
    } while (currentPage <= totalPages);

    return allItems;
  }

  /**
   * Get all bookmarked items from all folders (convenience method)
   */
  public async getAllBookmarks(): Promise<KinoPubBookmarkItem[]> {
    try {
      // First get all folders
      const foldersResponse = await this.getBookmarkFolders();
      const folders = foldersResponse.items || [];
      
      if (folders.length === 0) {
        return [];
      }
      
      // Get items from all folders
      const allItems: KinoPubBookmarkItem[] = [];
      
      for (const folder of folders) {
        try {
          const items = await this.getAllBookmarkFolderItems(folder.id);
          allItems.push(...items);
        } catch (error) {
          console.warn(`Failed to get items from folder ${folder.title}:`, error);
        }
      }
      
      return allItems;
    } catch (error) {
      console.error('Failed to get bookmarks:', error);
      return [];
    }
  }

  /**
   * Add item to bookmarks folder
   */
  public async addBookmark(itemId: number, folderId?: number): Promise<KinoPubBookmarkActionResponse> {
    const data: any = { item: itemId };
    if (folderId) {
      data.folder = folderId;
    }
    
    return this.makeAuthenticatedRequest<KinoPubBookmarkActionResponse>('/bookmarks/add', 'POST', data);
  }

  /**
   * Remove item from bookmarks
   */
  public async removeBookmark(itemId: number, folderId?: number): Promise<KinoPubBookmarkActionResponse> {
    const data: any = { item: itemId };
    if (folderId) {
      data.folder = folderId;
    }
    
    return this.makeAuthenticatedRequest<KinoPubBookmarkActionResponse>('/bookmarks/remove-item', 'POST', data);
  }

  /**
   * Remove item from bookmarks using the remove-item endpoint
   * @param item - The item ID to remove
   * @param folder - Optional folder ID to remove from specific folder
   */
  public async removeBookmarkItem(item: number, folder?: number): Promise<KinoPubBookmarkActionResponse> {
    const data: any = { item };
    if (folder !== undefined) {
      data.folder = folder;
    }
    
    return this.makeAuthenticatedRequest<KinoPubBookmarkActionResponse>('/bookmarks/remove-item', 'POST', data);
  }

  /**
   * Find bookmark folder by name
   * Returns the folder if found, null if not found
   */
  public async findBookmarkFolderByName(name: string): Promise<KinoPubBookmarkFolder | null> {
    try {
      const foldersResponse = await this.getBookmarkFolders();
      const folders = foldersResponse.items || [];
      
      const folder = folders.find((f: KinoPubBookmarkFolder) => f.title.toLowerCase() === name.toLowerCase());
      return folder || null;
    } catch (error) {
      console.error(`Failed to search for bookmark folder "${name}":`, error);
      return null;
    }
  }

  /**
   * Create a new bookmark folder
   * Returns the created folder information
   */
  public async createBookmarkFolder(name: string): Promise<KinoPubApiResponse<KinoPubBookmarkFolder>> {
    return this.makeAuthenticatedRequest<any>('/bookmarks/create', 'POST', { title: name });
  }

  /**
   * Find bookmark folder by name, create if it doesn't exist
   * This is a convenience method that combines find and create operations
   */
  public async findOrCreateBookmarkFolder(name: string): Promise<KinoPubBookmarkFolder> {
    try {
      // First try to find the existing folder
      const existingFolder = await this.findBookmarkFolderByName(name);
      if (existingFolder) {
        console.log(`📁 Found existing bookmark folder: "${name}" (ID: ${existingFolder.id})`);
        return existingFolder;
      }

      // If not found, create a new folder
      console.log(`📁 Creating new bookmark folder: "${name}"`);
      const createResponse = await this.createBookmarkFolder(name);
      
      // Handle different response structures: 'data', 'item', 'folder'
      const createdFolder = createResponse.data || createResponse.item || (createResponse as any).folder;
      if (!createdFolder || !createdFolder.id) {
        throw new KinoPubApiError(`Failed to create bookmark folder "${name}" - no folder data in response`, 0);
      }

      console.log(`✅ Created bookmark folder: "${name}" (ID: ${createdFolder.id})`);
      return createdFolder;
    } catch (error) {
      console.error(`Failed to find or create bookmark folder "${name}":`, error);
      throw error;
    }
  }

  /**
   * Get items with pagination (content discovery)
   */
  public async getItems(
    type?: string,
    page: number = 1,
    perPage: number = 10
  ): Promise<KinoPubApiResponse<KinoPubMediaItem[]>> {
    const params = new URLSearchParams({
      page: page.toString(),
      perpage: perPage.toString(), // Note: API uses 'perpage' not 'perPage'
    });

    if (type) {
      params.append('type', type);
    }

    const response = await this.makeAuthenticatedRequest<any>(`/items?${params.toString()}`);
    
    // API returns items in 'items' field, not 'data'
    if (response.items) {
      return {
        ...response,
        data: response.items
      };
    }
    
    return response;
  }

  /**
   * Search for items
   */
  public async searchItems(
    query: string,
    type?: string
  ): Promise<KinoPubApiResponse<KinoPubMediaItem[]>> {
    const params = new URLSearchParams({
      q: query,
    });

    // API requires type parameter - default to serial if not specified
    const searchType = type || 'serial';
    params.append('type', searchType);

    const response = await this.makeAuthenticatedRequest<any>(`/items/search?${params.toString()}`);
    
    // API returns items in 'items' field, not 'data'
    if (response.items) {
      return {
        ...response,
        data: response.items
      };
    }
    
    return response;
  }

  /**
   * Search for content (alias for searchItems for better naming)
   */
  public async searchContent(
    query: string,
    type?: string
  ): Promise<KinoPubApiResponse<KinoPubMediaItem[]>> {
    return this.searchItems(query, type);
  }

  /**
   * Add item to a specific bookmark folder
   */
  public async addToBookmarkFolder(folderId: number, itemId: number): Promise<KinoPubApiResponse<any>> {
    return this.addBookmark(itemId, folderId);
  }

  /**
   * Get item by ID
   */
  public async getItemById(id: number): Promise<KinoPubApiResponse<KinoPubMediaItem>> {
    return this.makeAuthenticatedRequest<KinoPubMediaItem>(`/items/${id}`);
  }

  /**
   * Check if item is watched and get watching status
   */
  public async getWatchingStatus(itemId: number): Promise<KinoPubApiResponse<any>> {
    return this.makeAuthenticatedRequest<any>(`/watching?id=${itemId}`);
  }

  /**
   * Check if item is watched (helper method)
   * Returns true if item has been watched (fully or partially)
   */
  public async isItemWatched(itemId: number): Promise<{ isWatched: boolean; isFullyWatched: boolean; watchProgress?: any }> {
    try {
      const response = await this.getWatchingStatus(itemId);
      const item = response.item;
      
      if (!item) {
        return { isWatched: false, isFullyWatched: false };
      }

      let isWatched = false;
      let isFullyWatched = false;
      let totalEpisodes = 0;
      let watchedEpisodes = 0;

      // Check for serials (seasons/episodes)
      if (item.seasons && Array.isArray(item.seasons)) {
        for (const season of item.seasons) {
          if (season.episodes && Array.isArray(season.episodes)) {
            for (const episode of season.episodes) {
              totalEpisodes++;
              if (episode.status === 1) { // Fully watched
                watchedEpisodes++;
                isWatched = true;
              } else if (episode.status === 0) { // Started watching
                isWatched = true;
              }
            }
          }
        }
        isFullyWatched = totalEpisodes > 0 && watchedEpisodes === totalEpisodes;
      }
      
      // Check for movies/videos
      if (item.videos && Array.isArray(item.videos)) {
        for (const video of item.videos) {
          totalEpisodes++;
          if (video.status === 1) { // Fully watched
            watchedEpisodes++;
            isWatched = true;
          } else if (video.status === 0) { // Started watching
            isWatched = true;
          }
        }
        isFullyWatched = totalEpisodes > 0 && watchedEpisodes === totalEpisodes;
      }

      return {
        isWatched,
        isFullyWatched,
        watchProgress: {
          totalEpisodes,
          watchedEpisodes,
          type: item.type
        }
      };
    } catch (error) {
      // If API call fails, assume not watched
      return { isWatched: false, isFullyWatched: false };
    }
  }

  /**
   * Get all watching serials (API has hard limit, no pagination available)
   */
  public async getAllWatchingSerials(): Promise<KinoPubWatchingSerial[]> {
    const response = await this.getWatchingSerials();
    return response.data || [];
  }

  /**
   * Get all watching items (API has hard limit, no pagination available)
   */
  public async getAllWatchingItems(): Promise<KinoPubWatchingItem[]> {
    const response = await this.getWatching();
    return response.data || [];
  }

  /**
   * Make authenticated API request with retry logic
   */
  private async makeAuthenticatedRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    data?: any
  ): Promise<KinoPubApiResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Ensure we have a valid access token
        const accessToken = await this.authService.getAccessToken();

        // Make the API request
        const response: AxiosResponse<KinoPubApiResponse<T>> = await axios({
          method,
          url: `${this.config.kinoPubApi.apiUrl}${endpoint}`,
          data,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Kino.pub AI Bookmarks',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });

        // Validate response structure
        if (!response.data || typeof response.data !== 'object') {
          throw new KinoPubApiError('Invalid response format', response.status);
        }

        return response.data;

      } catch (error) {
        lastError = error as Error;

        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          const status = axiosError.response?.status;
          const errorData = axiosError.response?.data as any;

          // Handle authentication errors
          if (status === 401) {
            if (attempt < this.maxRetries) {
              console.log(`🔄 Authentication failed, refreshing token (attempt ${attempt}/${this.maxRetries})`);
              
              // Try to refresh the session
              const refreshed = await this.authService.refreshSession();
              if (refreshed) {
                continue; // Retry with new token
              }
            }
            
            throw new KinoPubAuthError(
              'Authentication failed. Please re-authenticate.',
              errorData?.error || 'UNAUTHORIZED'
            );
          }

          // Handle rate limiting
          if (status === 429) {
            if (attempt < this.maxRetries) {
              const delay = this.retryDelay * attempt;
              console.log(`⏱️  Rate limited, waiting ${delay}ms before retry (attempt ${attempt}/${this.maxRetries})`);
              await this.sleep(delay);
              continue;
            }
            
            throw new KinoPubApiError(
              'Rate limit exceeded. Please try again later.',
              status,
              'RATE_LIMITED'
            );
          }

          // Handle server errors (5xx)
          if (status && status >= 500) {
            if (attempt < this.maxRetries) {
              const delay = this.retryDelay * attempt;
              console.log(`🔧 Server error, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`);
              await this.sleep(delay);
              continue;
            }
            
            throw new KinoPubApiError(
              'Server error. Please try again later.',
              status,
              'SERVER_ERROR'
            );
          }

          // Handle other HTTP errors
          throw new KinoPubApiError(
            errorData?.error || axiosError.message || 'API request failed',
            status || 0,
            errorData?.error_code
          );
        }

        // Handle non-HTTP errors (network, timeout, etc.)
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * attempt;
          console.log(`🌐 Network error, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`);
          await this.sleep(delay);
          continue;
        }

        throw new KinoPubApiError(
          `Network error: ${(error as Error).message}`,
          0,
          'NETWORK_ERROR'
        );
      }
    }

    // This should never be reached, but just in case
    throw lastError || new KinoPubApiError('Unknown error occurred', 0);
  }

  /**
   * Utility function to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}