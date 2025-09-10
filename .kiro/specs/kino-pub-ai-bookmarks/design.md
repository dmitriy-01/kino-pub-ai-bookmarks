# Design Document

## Overview

The Kino.pub AI Bookmarks system provides three CLI scripts for TV show recommendation management. The system scans watch history for fully watched shows, tracks existing AI recommendations in bookmarks, and uses Anthropic AI to suggest new content based on viewing preferences.

## Architecture

Three independent CLI scripts using existing kino.pub API client:

```mermaid
graph TB
    A[scan-watched] --> B[KinoPubClient]
    C[scan-bookmarks] --> B
    D[ai-recommend] --> B
    D --> E[Anthropic API]
    
    B --> F[/v1/watching/serials]
    B --> G[/bookmarks API]
    
    A --> H[watched-shows.json]
    C --> I[ai-bookmarks.json]
    D --> J[tv-shows-ai folder]
```

## Components and Interfaces

### 1. Watch History Scanner
```typescript
interface WatchHistoryScanner {
  scanWatchedShows(): Promise<WatchedShow[]>;
  saveToJson(shows: WatchedShow[], filename: string): Promise<void>;
}
```

### 2. Bookmark Scanner  
```typescript
interface BookmarkScanner {
  findTvShowsAiFolder(): Promise<BookmarkFolder | null>;
  scanBookmarkFolder(folderId: number): Promise<BookmarkedShow[]>;
  saveToJson(shows: BookmarkedShow[], filename: string): Promise<void>;
}
```

### 3. AI Recommender
```typescript
interface AiRecommender {
  loadWatchedShows(): Promise<WatchedShow[]>;
  loadBookmarkedShows(): Promise<BookmarkedShow[]>;
  generateRecommendations(watched: WatchedShow[], bookmarked: BookmarkedShow[]): Promise<string[]>;
  addToBookmarks(recommendations: string[], folderId: number): Promise<void>;
}
```

## Data Models

### WatchedShow
```typescript
interface WatchedShow {
  id: number;
  title: string;
  year: number;
  rating?: number;
  genres: string[];
  fullyWatched: boolean;
}
```

### BookmarkedShow
```typescript
interface BookmarkedShow {
  id: number;
  title: string;
  year: number;
  addedDate: string;
}
```

### CLI Scripts
```typescript
// scan-watched: Get fully watched TV shows from /v1/watching/serials
// scan-bookmarks: Get items from "tv-shows-ai" bookmark folder  
// ai-recommend: Use Anthropic API to suggest and add new shows
```

## Error Handling

- API authentication failures: Use existing KinoPubClient error handling
- Missing bookmark folder: Create "tv-shows-ai" folder if not found
- Anthropic API errors: Log and exit gracefully
- File I/O errors: Validate JSON write operations

## Testing Strategy

- Test each CLI script independently
- Mock API responses for consistent testing
- Validate JSON file outputs
- Test Anthropic API integration with real token