import axios, { AxiosResponse, AxiosError } from 'axios';
import { AuthenticationService } from './auth';
import { getConfig } from '../config';
import {
  KinoPubApiResponse,
  KinoPubMediaItem,
  KinoPubWatchingItem,
  KinoPubWatchingSerial,
  KinoPubBookmarkFolder,
  KinoPubBookmarkFolderContent,
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
   * Only returns serials that the user is subscribed to (subscribed=1)
   */
  public async getWatchingSerials(): Promise<KinoPubApiResponse<KinoPubWatchingSerial[]>> {
    const response = await this.makeAuthenticatedRequest<any>('/watching/serials?subscribed=1');
    
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
  public async getBookmarkFolders(): Promise<KinoPubApiResponse<KinoPubBookmarkFolder[]>> {
    const response = await this.makeAuthenticatedRequest<any>('/bookmarks');
    
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
   * Get items in a specific bookmark folder
   */
  public async getBookmarkFolder(folderId: number): Promise<KinoPubApiResponse<KinoPubBookmarkFolderContent>> {
    return this.makeAuthenticatedRequest<KinoPubBookmarkFolderContent>(`/bookmarks/${folderId}`);
  }

  /**
   * Get all bookmarked items from all folders (convenience method)
   */
  public async getAllBookmarks(): Promise<KinoPubMediaItem[]> {
    try {
      // First get all folders
      const foldersResponse = await this.getBookmarkFolders();
      const folders = foldersResponse.data || [];
      
      if (folders.length === 0) {
        return [];
      }
      
      // Get items from all folders
      const allItems: KinoPubMediaItem[] = [];
      
      for (const folder of folders) {
        try {
          const folderResponse = await this.getBookmarkFolder(folder.id);
          if (folderResponse.data?.items) {
            allItems.push(...folderResponse.data.items);
          }
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
  public async addBookmark(itemId: number, folderId?: number): Promise<KinoPubApiResponse<any>> {
    const data: any = { item: itemId };
    if (folderId) {
      data.folder = folderId;
    }
    
    return this.makeAuthenticatedRequest<any>('/bookmarks/add', 'POST', data);
  }

  /**
   * Remove item from bookmarks
   */
  public async removeBookmark(itemId: number, folderId?: number): Promise<KinoPubApiResponse<any>> {
    const endpoint = folderId ? `/bookmarks/remove?item=${itemId}&folder=${folderId}` : `/bookmarks/remove?item=${itemId}`;
    return this.makeAuthenticatedRequest<any>(endpoint, 'POST');
  }

  /**
   * Find bookmark folder by name
   * Returns the folder if found, null if not found
   */
  public async findBookmarkFolderByName(name: string): Promise<KinoPubBookmarkFolder | null> {
    try {
      const foldersResponse = await this.getBookmarkFolders();
      // Handle both 'data' and 'items' response structures
      const folders = foldersResponse.data || (foldersResponse as any).items || [];
      
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
    return this.makeAuthenticatedRequest<KinoPubBookmarkFolder>('/bookmarks/create', 'POST', { title: name });
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