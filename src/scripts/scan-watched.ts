#!/usr/bin/env node

import { KinoPubClient } from '../services/kino-pub-client';
import { DatabaseService, WatchedItem } from '../services/database';
import { KinoPubWatchingSerial } from '../services/kino-pub-api';

/**
 * Scan watched content (movies and TV shows) and save to database
 */
async function scanWatchedContent(): Promise<void> {
  console.log('🔍 Scanning watched content...');
  
  const client = new KinoPubClient();
  const db = new DatabaseService();
  
  // Check authentication
  if (!client.isAuthenticated()) {
    console.error('❌ Not authenticated. Please run authentication first.');
    process.exit(1);
  }
  
  try {
    let totalProcessed = 0;
    let totalFullyWatched = 0;

    // Scan TV shows/serials
    console.log('📡 Fetching watching serials from kino.pub...');
    const serialsResponse = await client.getWatchingSerials();
    
    if (serialsResponse.data && Array.isArray(serialsResponse.data)) {
      const serials = serialsResponse.data;
      console.log(`📺 Found ${serials.length} serials in watching list`);
      
      for (const serial of serials) {
        const total = typeof serial.total === 'string' ? parseInt(serial.total, 10) : serial.total;
        const watched = serial.watched;
        
        // Consider a show fully watched if watched episodes >= total episodes
        const isFullyWatched = watched >= total && total > 0;
        
        const watchedItem: Omit<WatchedItem, 'id'> = {
          kinoPubId: serial.id,
          title: serial.title,
          type: 'serial',
          year: extractYearFromTitle(serial.title),
          totalEpisodes: total,
          watchedEpisodes: watched,
          fullyWatched: isFullyWatched,
          poster: serial.posters?.medium || serial.posters?.small,
          watchedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        await db.addWatchedItem(watchedItem);
        totalProcessed++;
        
        if (isFullyWatched) {
          totalFullyWatched++;
        }
      }
    }

    // Scan movies from watching list (if available)
    console.log('📡 Fetching watching movies from kino.pub...');
    try {
      const moviesResponse = await client.getWatching();
      
      if (moviesResponse.data && Array.isArray(moviesResponse.data)) {
        const movies = moviesResponse.data.filter(watchingItem => 
          watchingItem.item.type === 'movie' || watchingItem.item.type === 'documovie'
        );
        
        console.log(`🎬 Found ${movies.length} movies in watching list`);
        
        for (const watchingItem of movies) {
          const movie = watchingItem.item;
          // For movies, we consider them fully watched if they appear in the watching list
          // (assuming user completed them)
          const watchedItem: Omit<WatchedItem, 'id'> = {
            kinoPubId: movie.id,
            title: movie.title,
            type: 'movie',
            year: movie.year || extractYearFromTitle(movie.title),
            fullyWatched: true, // Assume movies in watching list are completed
            poster: movie.poster,
            watchedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          await db.addWatchedItem(watchedItem);
          totalProcessed++;
          totalFullyWatched++;
        }
      }
    } catch (error) {
      console.log('⚠️  Could not fetch movies from watching list (this is normal for some accounts)');
    }
    
    console.log(`✅ Processed ${totalProcessed} items, ${totalFullyWatched} fully watched`);
    
    // Display summary
    const watchedItems = await db.getWatchedItems(undefined, true);
    
    if (watchedItems.length > 0) {
      console.log('\n📋 Recently added fully watched content:');
      watchedItems.slice(0, 10).forEach((item, index) => {
        const typeIcon = item.type === 'movie' ? '🎬' : '📺';
        const episodeInfo = item.type === 'serial' ? ` (${item.watchedEpisodes}/${item.totalEpisodes} episodes)` : '';
        const yearStr = item.year ? ` (${item.year})` : '';
        console.log(`${index + 1}. ${typeIcon} ${item.title}${yearStr}${episodeInfo}`);
      });
      
      if (watchedItems.length > 10) {
        console.log(`... and ${watchedItems.length - 10} more items`);
      }
    } else {
      console.log('\n📋 No fully watched content found');
    }

    console.log('\n💡 Tip: Use "npm run rate-content" to add ratings and notes for better AI recommendations');
    
  } catch (error) {
    console.error('❌ Error scanning watched content:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

/**
 * Extract year from title string (looks for patterns like "Title (2020)")
 */
function extractYearFromTitle(title: string): number | undefined {
  const yearMatch = title.match(/\((\d{4})\)/);
  return yearMatch ? parseInt(yearMatch[1], 10) : undefined;
}

// Run the script if called directly
if (require.main === module) {
  scanWatchedContent().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { scanWatchedContent };