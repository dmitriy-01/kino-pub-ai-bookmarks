import sqlite3 from 'sqlite3';
import { join } from 'path';

export interface WatchedItem {
  id: number;
  kinoPubId: number;
  title: string;
  type: 'movie' | 'serial';
  year?: number;
  totalEpisodes?: number;
  watchedEpisodes?: number;
  fullyWatched: boolean;
  poster?: string;
  userRating?: number; // 1-10 scale
  userNotes?: string; // "too boring", "loved it", etc.
  watchedAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export interface BookmarkedItem {
  id: number;
  kinoPubId: number;
  title: string;
  type: 'movie' | 'serial';
  year?: number;
  poster?: string;
  folderId: number;
  folderName: string;
  addedAt: string; // ISO date string
}

export interface RecommendationItem {
  id: number;
  title: string;
  type: 'movie' | 'serial';
  year?: number;
  source: 'ai' | 'manual';
  reasoning?: string;
  kinoPubId?: number; // Set when found and added to bookmarks
  status: 'pending' | 'bookmarked' | 'rejected';
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export interface NotInterestedItem {
  id: number;
  kinoPubId: number;
  title: string;
  type: 'movie' | 'serial';
  year?: number;
  poster?: string;
  reason?: string; // Optional reason why not interested
  addedAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export class DatabaseService {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(process.cwd(), 'kino-pub-data.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.initializeDatabase();
  }

  /**
   * Initialize database tables
   */
  private initializeDatabase(): void {
    const createWatchedTable = `
      CREATE TABLE IF NOT EXISTS watched_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kino_pub_id INTEGER UNIQUE NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('movie', 'serial')),
        year INTEGER,
        total_episodes INTEGER,
        watched_episodes INTEGER,
        fully_watched BOOLEAN NOT NULL DEFAULT 0,
        poster TEXT,
        user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 10),
        user_notes TEXT,
        watched_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    const createBookmarkedTable = `
      CREATE TABLE IF NOT EXISTS bookmarked_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kino_pub_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('movie', 'serial')),
        year INTEGER,
        poster TEXT,
        folder_id INTEGER NOT NULL,
        folder_name TEXT NOT NULL,
        added_at TEXT NOT NULL,
        UNIQUE(kino_pub_id, folder_id)
      )
    `;

    const createRecommendationsTable = `
      CREATE TABLE IF NOT EXISTS recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('movie', 'serial')),
        year INTEGER,
        source TEXT NOT NULL CHECK (source IN ('ai', 'manual')),
        reasoning TEXT,
        kino_pub_id INTEGER,
        status TEXT NOT NULL CHECK (status IN ('pending', 'bookmarked', 'rejected')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    const createNotInterestedTable = `
      CREATE TABLE IF NOT EXISTS not_interested_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kino_pub_id INTEGER UNIQUE NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('movie', 'serial')),
        year INTEGER,
        poster TEXT,
        reason TEXT,
        added_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    // Create indexes for better performance
    const createIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_watched_kino_pub_id ON watched_items(kino_pub_id)',
      'CREATE INDEX IF NOT EXISTS idx_watched_type ON watched_items(type)',
      'CREATE INDEX IF NOT EXISTS idx_watched_fully_watched ON watched_items(fully_watched)',
      'CREATE INDEX IF NOT EXISTS idx_bookmarked_kino_pub_id ON bookmarked_items(kino_pub_id)',
      'CREATE INDEX IF NOT EXISTS idx_bookmarked_folder_id ON bookmarked_items(folder_id)',
      'CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status)',
      'CREATE INDEX IF NOT EXISTS idx_recommendations_source ON recommendations(source)',
      'CREATE INDEX IF NOT EXISTS idx_not_interested_kino_pub_id ON not_interested_items(kino_pub_id)',
      'CREATE INDEX IF NOT EXISTS idx_not_interested_type ON not_interested_items(type)'
    ];

    this.db.serialize(() => {
      this.db.run(createWatchedTable);
      this.db.run(createBookmarkedTable);
      this.db.run(createRecommendationsTable);
      this.db.run(createNotInterestedTable);
      
      createIndexes.forEach(indexSql => {
        this.db.run(indexSql);
      });
    });
  }

  /**
   * Add or update a watched item
   */
  async addWatchedItem(item: Omit<WatchedItem, 'id'>): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO watched_items 
        (kino_pub_id, title, type, year, total_episodes, watched_episodes, 
         fully_watched, poster, user_rating, user_notes, watched_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        item.kinoPubId, item.title, item.type, item.year,
        item.totalEpisodes, item.watchedEpisodes, item.fullyWatched,
        item.poster, item.userRating, item.userNotes,
        item.watchedAt, item.updatedAt
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  /**
   * Get all watched items
   */
  async getWatchedItems(type?: 'movie' | 'serial', fullyWatched?: boolean): Promise<WatchedItem[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM watched_items WHERE 1=1';
      const params: any[] = [];

      if (type) {
        sql += ' AND type = ?';
        params.push(type);
      }

      if (fullyWatched !== undefined) {
        sql += ' AND fully_watched = ?';
        params.push(fullyWatched ? 1 : 0);
      }

      sql += ' ORDER BY updated_at DESC';

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(this.mapWatchedItemFromDb));
      });
    });
  }

  /**
   * Update user rating and notes for a watched item
   */
  async updateWatchedItemPreferences(
    kinoPubId: number, 
    userRating?: number, 
    userNotes?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE watched_items 
        SET user_rating = ?, user_notes = ?, updated_at = ?
        WHERE kino_pub_id = ?
      `;
      
      this.db.run(sql, [userRating, userNotes, new Date().toISOString(), kinoPubId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Add or update a bookmarked item
   */
  async addBookmarkedItem(item: Omit<BookmarkedItem, 'id'>): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO bookmarked_items 
        (kino_pub_id, title, type, year, poster, folder_id, folder_name, added_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        item.kinoPubId, item.title, item.type, item.year,
        item.poster, item.folderId, item.folderName, item.addedAt
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  /**
   * Get all bookmarked items
   */
  async getBookmarkedItems(folderId?: number): Promise<BookmarkedItem[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM bookmarked_items WHERE 1=1';
      const params: any[] = [];

      if (folderId) {
        sql += ' AND folder_id = ?';
        params.push(folderId);
      }

      sql += ' ORDER BY added_at DESC';

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(this.mapBookmarkedItemFromDb));
      });
    });
  }

  /**
   * Add a recommendation
   */
  async addRecommendation(item: Omit<RecommendationItem, 'id'>): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO recommendations 
        (title, type, year, source, reasoning, kino_pub_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        item.title, item.type, item.year, item.source,
        item.reasoning, item.kinoPubId, item.status,
        item.createdAt, item.updatedAt
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  /**
   * Get recommendations
   */
  async getRecommendations(status?: string): Promise<RecommendationItem[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM recommendations WHERE 1=1';
      const params: any[] = [];

      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC';

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(this.mapRecommendationFromDb));
      });
    });
  }

  /**
   * Update recommendation status
   */
  async updateRecommendationStatus(id: number, status: string, kinoPubId?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE recommendations 
        SET status = ?, kino_pub_id = ?, updated_at = ?
        WHERE id = ?
      `;
      
      this.db.run(sql, [status, kinoPubId, new Date().toISOString(), id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get watched items with user preferences for AI recommendations
   */
  async getWatchedItemsForAI(): Promise<WatchedItem[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM watched_items 
        WHERE fully_watched = 1 
        ORDER BY 
          CASE WHEN user_rating IS NOT NULL THEN 0 ELSE 1 END,
          user_rating DESC,
          updated_at DESC
      `;

      this.db.all(sql, [], (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(this.mapWatchedItemFromDb));
      });
    });
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Map database row to WatchedItem
   */
  private mapWatchedItemFromDb(row: any): WatchedItem {
    return {
      id: row.id,
      kinoPubId: row.kino_pub_id,
      title: row.title,
      type: row.type,
      year: row.year,
      totalEpisodes: row.total_episodes,
      watchedEpisodes: row.watched_episodes,
      fullyWatched: Boolean(row.fully_watched),
      poster: row.poster,
      userRating: row.user_rating,
      userNotes: row.user_notes,
      watchedAt: row.watched_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map database row to BookmarkedItem
   */
  private mapBookmarkedItemFromDb(row: any): BookmarkedItem {
    return {
      id: row.id,
      kinoPubId: row.kino_pub_id,
      title: row.title,
      type: row.type,
      year: row.year,
      poster: row.poster,
      folderId: row.folder_id,
      folderName: row.folder_name,
      addedAt: row.added_at
    };
  }

  /**
   * Add or update a "not interested" item
   */
  async addNotInterestedItem(item: Omit<NotInterestedItem, 'id'>): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR REPLACE INTO not_interested_items 
        (kino_pub_id, title, type, year, poster, reason, added_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        item.kinoPubId, item.title, item.type, item.year,
        item.poster, item.reason, item.addedAt, item.updatedAt
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  /**
   * Get all "not interested" items
   */
  async getNotInterestedItems(type?: 'movie' | 'serial'): Promise<NotInterestedItem[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM not_interested_items WHERE 1=1';
      const params: any[] = [];

      if (type) {
        sql += ' AND type = ?';
        params.push(type);
      }

      sql += ' ORDER BY added_at DESC';

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows.map(this.mapNotInterestedItemFromDb));
      });
    });
  }

  /**
   * Remove a "not interested" item
   */
  async removeNotInterestedItem(kinoPubId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM not_interested_items WHERE kino_pub_id = ?';
      
      this.db.run(sql, [kinoPubId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Check if an item is in "not interested" list
   */
  async isNotInterested(kinoPubId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM not_interested_items WHERE kino_pub_id = ?';
      
      this.db.get(sql, [kinoPubId], (err, row: any) => {
        if (err) reject(err);
        else resolve(row.count > 0);
      });
    });
  }

  /**
   * Sync "not interested" items from bookmark folders
   */
  async syncNotInterestedFromBookmarks(bookmarkedItems: BookmarkedItem[]): Promise<number> {
    const notInterestedBookmarks = bookmarkedItems.filter(item => 
      item.folderName.toLowerCase().includes('not interested') || 
      item.folderName.toLowerCase().includes('not-interested') ||
      item.folderName.toLowerCase().includes('dislike')
    );

    let syncedCount = 0;
    const now = new Date().toISOString();

    for (const bookmark of notInterestedBookmarks) {
      const notInterestedItem: Omit<NotInterestedItem, 'id'> = {
        kinoPubId: bookmark.kinoPubId,
        title: bookmark.title,
        type: bookmark.type,
        year: bookmark.year,
        poster: bookmark.poster,
        reason: `From "${bookmark.folderName}" folder`,
        addedAt: bookmark.addedAt,
        updatedAt: now
      };

      try {
        await this.addNotInterestedItem(notInterestedItem);
        syncedCount++;
      } catch (error) {
        // Item might already exist, which is fine
        console.debug(`Item ${bookmark.title} already in not interested list`);
      }
    }

    return syncedCount;
  }

  /**
   * Map database row to RecommendationItem
   */
  private mapRecommendationFromDb(row: any): RecommendationItem {
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      year: row.year,
      source: row.source,
      reasoning: row.reasoning,
      kinoPubId: row.kino_pub_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Map database row to NotInterestedItem
   */
  private mapNotInterestedItemFromDb(row: any): NotInterestedItem {
    return {
      id: row.id,
      kinoPubId: row.kino_pub_id,
      title: row.title,
      type: row.type,
      year: row.year,
      poster: row.poster,
      reason: row.reason,
      addedAt: row.added_at,
      updatedAt: row.updated_at
    };
  }
}