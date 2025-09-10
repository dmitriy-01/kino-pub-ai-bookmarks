# Enhanced Kino.pub AI Bookmarks with SQLite Database

This enhanced version now uses SQLite database for better data management and supports both movies and TV shows with user preferences for improved AI recommendations.

## New Features

### 🗄️ SQLite Database Storage
- Replaces JSON files with a proper SQLite database (`kino-pub-data.db`)
- Better data integrity and querying capabilities
- Supports relationships and indexing for performance

### 🎬 Movies + TV Shows Support
- Now scans and manages both movies and TV shows
- Separate handling for different content types
- Content type filtering in recommendations

### ⭐ User Preferences & Ratings
- Rate content on a 1-10 scale
- Add personal notes (e.g., "too boring", "loved it", "great acting")
- AI uses your ratings and notes to generate better recommendations

### 🧠 Enhanced AI Recommendations
- Considers your ratings and preferences
- Separates loved content (8-10) from disliked content (1-5)
- Avoids recommending similar content to what you disliked
- More personalized and accurate suggestions

## Database Schema

### watched_items
- Stores all watched movies and TV shows
- Includes user ratings (1-10) and personal notes
- Tracks watch progress for TV shows

### bookmarked_items
- Stores bookmarked content from all folders
- Links to kino.pub folder structure

### recommendations
- Stores AI-generated recommendations
- Tracks status (pending, bookmarked, rejected)
- Includes reasoning for recommendations

## Available Commands

### Data Collection
```bash
# Scan watched content (movies + TV shows)
npm run scan-watched

# Scan specific bookmark folder
npm run scan-bookmarks [folder-name]

# Scan all bookmark folders
npm run scan-all-bookmarks
```

### Content Rating
```bash
# Interactive rating tool
npm run rate-content
```

### AI Recommendations
```bash
# Generate recommendations for both movies and shows
npm run ai-recommend

# Generate movie recommendations only
npm run ai-recommend-movies

# Generate TV show recommendations only
npm run ai-recommend-shows
```

## Workflow

1. **Initial Setup**
   ```bash
   npm run scan-watched        # Collect your viewing history
   npm run scan-all-bookmarks  # Import existing bookmarks
   ```

2. **Rate Your Content** (Optional but recommended)
   ```bash
   npm run rate-content
   ```
   - Rate items 1-10 based on how much you enjoyed them
   - Add notes to explain why you liked/disliked something
   - This dramatically improves AI recommendation quality

3. **Generate Recommendations**
   ```bash
   npm run ai-recommend        # For both movies and shows
   # or
   npm run ai-recommend-movies # Movies only
   npm run ai-recommend-shows  # TV shows only
   ```

4. **Check Results**
   - Recommendations are automatically added to your "ai-recommendations" bookmark folder on kino.pub
   - Run `npm run scan-bookmarks ai-recommendations` to update local cache

## Rating Guidelines

- **9-10**: Absolutely loved it, would watch again
- **7-8**: Really enjoyed it, would recommend to others
- **5-6**: It was okay, watchable but not memorable
- **3-4**: Didn't like it, had issues but finished it
- **1-2**: Hated it, couldn't finish or regret watching

## Notes Examples

Good notes help the AI understand your preferences:
- "Great character development"
- "Too slow paced"
- "Loved the humor"
- "Confusing plot"
- "Amazing cinematography"
- "Too violent for my taste"
- "Perfect ending"

## Database Location

The SQLite database is stored as `kino-pub-data.db` in your project root. You can:
- Back it up by copying this file
- View it with any SQLite browser tool
- Reset it by deleting the file (data will be lost)

## Migration from JSON

If you have existing JSON files (`watched-shows.json`, `ai-bookmarks.json`), the new system will ignore them and start fresh with the database. Your kino.pub account data remains unchanged and can be re-scanned at any time.