#!/usr/bin/env node

import { KinoPubClient } from '../services/kino-pub-client';
import { AnthropicClient } from '../services/anthropic-client';
import { DatabaseService, RecommendationItem } from '../services/database';

/**
 * Generate AI recommendations and add them to bookmarks
 */
async function aiRecommend(contentType: 'movie' | 'serial' | 'both' = 'both'): Promise<void> {
  console.log('🤖 Starting AI recommendation process...');

  const client = new KinoPubClient();
  const db = new DatabaseService();

  // Check authentication
  if (!client.isAuthenticated()) {
    console.error('❌ Not authenticated. Please run authentication first.');
    process.exit(1);
  }

  try {
    // Load watched content from database
    console.log('📖 Loading watched content from database...');
    let watchedItems = await db.getWatchedItemsForAI();
    console.log(`📚 Loaded ${watchedItems.length} fully watched items`);

    // If no fully watched items, try to use partially watched content with significant progress
    if (watchedItems.length === 0) {
      console.log('📖 No fully watched content found. Checking partially watched content...');
      const partiallyWatched = await db.getWatchedItems();
      
      // Consider items with >50% progress as "watched enough" for recommendations
      const significantProgress = partiallyWatched.filter(item => {
        if (item.type === 'movie') return true; // Movies in watching list are likely completed
        if (item.totalEpisodes && item.watchedEpisodes) {
          const progress = item.watchedEpisodes / item.totalEpisodes;
          return progress > 0.5; // More than 50% watched
        }
        return false;
      });
      
      if (significantProgress.length > 0) {
        console.log(`📺 Found ${significantProgress.length} items with significant progress (>50% watched)`);
        watchedItems = significantProgress;
      } else {
        console.log('⚠️  No watched content with significant progress found.');
        console.log('💡 Tip: Watch some shows to completion or use "npm run rate-content" to add preferences');
        process.exit(0);
      }
    }

    // Show preference statistics
    const ratedItems = watchedItems.filter(item => item.userRating);
    const unratedItems = watchedItems.filter(item => !item.userRating);

    console.log(`⭐ ${ratedItems.length} rated items, ${unratedItems.length} unrated items`);

    if (ratedItems.length === 0) {
      console.log('💡 Tip: Run "npm run rate-content" to add ratings for better recommendations');
    }

    // Load existing bookmarks from database
    console.log('📖 Loading existing bookmarks from database...');
    const bookmarkedItems = await db.getBookmarkedItems();
    console.log(`🔖 Loaded ${bookmarkedItems.length} existing bookmarks`);

    // Generate AI recommendations
    console.log('🧠 Generating AI recommendations...');
    const anthropicClient = new AnthropicClient();

    const rawRecommendations = await anthropicClient.generateRecommendations(
      watchedItems,
      bookmarkedItems,
      contentType
    );
    console.log(`💡 Generated ${rawRecommendations.length} raw recommendations`);

    // Filter out any recommendations that match already watched or bookmarked content
    const watchedTitles = watchedItems.map(item => item.title.toLowerCase());
    const bookmarkedTitles = bookmarkedItems.map(item => item.title.toLowerCase());
    const allExcludedTitles = [...watchedTitles, ...bookmarkedTitles];
    
    const recommendations = rawRecommendations.filter(rec => {
      const recTitle = parseRecommendation(rec).title.toLowerCase();
      
      // Check if recommendation matches any excluded title (partial match)
      const isExcluded = allExcludedTitles.some(excluded => {
        const excludedClean = excluded.split('/')[0].trim().toLowerCase(); // Take first part before /
        const recClean = recTitle.trim().toLowerCase();
        
        return excludedClean.includes(recClean) || recClean.includes(excludedClean);
      });
      
      if (isExcluded) {
        console.log(`🚫 Filtered out: ${rec} (matches watched/bookmarked content)`);
        return false;
      }
      
      return true;
    });
    
    console.log(`✅ Filtered to ${recommendations.length} unique recommendations`);

    if (recommendations.length === 0) {
      console.log('📋 No new recommendations after filtering');
      return;
    }

    // Display recommendations
    console.log('\n🎯 AI Recommendations:');
    recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });

    // Save recommendations to database
    console.log('\n💾 Saving recommendations to database...');
    const now = new Date().toISOString();

    for (const recommendation of recommendations) {
      const { title, year } = parseRecommendation(recommendation);
      const type = contentType === 'both' ? 'serial' : contentType; // Default to serial for 'both'

      const recommendationItem: Omit<RecommendationItem, 'id'> = {
        title,
        type,
        year,
        source: 'ai',
        reasoning: `Generated based on ${ratedItems.length} rated items`,
        status: 'pending',
        createdAt: now,
        updatedAt: now
      };

      await db.addRecommendation(recommendationItem);
    }

    // Find or create AI recommendations bookmark folder based on content type
    console.log('\n📁 Setting up AI recommendations bookmark folder...');
    let folderName: string;
    
    if (contentType === 'movie') {
      folderName = 'movies-ai';
    } else if (contentType === 'serial') {
      folderName = 'tv-shows-ai';
    } else {
      // For 'both', we'll need to determine per item, but default to tv-shows-ai
      folderName = 'tv-shows-ai';
    }
    
    const folder = await client.findOrCreateBookmarkFolder(folderName);
    console.log(`📁 Using folder: "${folderName}" (ID: ${folder.id})`);

    // Clean up already watched/rated content from AI bookmark folders
    await cleanupWatchedFromAIFolders(client, db, contentType);

    // Search for each recommendation on kino.pub and add to bookmarks
    console.log('\n🔍 Searching for recommendations on kino.pub...');
    let addedCount = 0;
    let notFoundCount = 0;

    for (const recommendation of recommendations) {
      try {
        const { title, searchTitles } = parseRecommendation(recommendation);
        console.log(`🔍 Searching for: ${title}`);

        // Try searching with different title variations
        let searchResults = null;
        
        for (const searchTitle of searchTitles) {
          console.log(`  🔍 Trying: "${searchTitle}"`);
          
          // Try both movie and serial types
          const typesToTry = contentType === 'both' ? ['serial', 'movie'] : [contentType];
          
          for (const typeToTry of typesToTry) {
            try {
              console.log(`    🎬 Searching as ${typeToTry}...`);
              searchResults = await client.searchContent(searchTitle, typeToTry);
              if (searchResults && searchResults.data && searchResults.data.length > 0) {
                console.log(`    ✅ Found ${searchResults.data.length} results as ${typeToTry}`);
                break; // Found results, stop searching
              }
            } catch (error) {
              console.log(`    ❌ Search failed for "${searchTitle}" as ${typeToTry}`);
            }
            
            // Small delay between searches
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          if (searchResults && searchResults.data && searchResults.data.length > 0) {
            break; // Found results, stop trying different titles
          }
        }

        if (searchResults && searchResults.data && searchResults.data.length > 0) {
          // Find the best match
          let bestMatch = searchResults.data[0];

          // If looking for specific content type, try to find a better match
          if (contentType !== 'both') {
            const typeMatch = searchResults.data.find(item => {
              if (contentType === 'movie') {
                return item.type === 'movie' || (item as any).subtype === 'movie';
              } else {
                return item.type === 'serial' || (item as any).subtype === 'serial';
              }
            });
            if (typeMatch) {
              bestMatch = typeMatch;
            }
          }

          // Determine the correct folder based on the actual content type
          let targetFolder = folder;
          let targetFolderName = folderName;
          
          if (contentType === 'both') {
            // Determine folder based on the found item's type
            if (bestMatch.type === 'movie' || (bestMatch as any).subtype === 'movie') {
              targetFolderName = 'movies-ai';
            } else {
              targetFolderName = 'tv-shows-ai';
            }
            
            // Get or create the appropriate folder if different from current
            if (targetFolderName !== folderName) {
              targetFolder = await client.findOrCreateBookmarkFolder(targetFolderName);
              console.log(`  📁 Using "${targetFolderName}" folder for ${bestMatch.type}`);
            }
          }
          
          // Check if it's already bookmarked in the target folder
          const alreadyBookmarked = bookmarkedItems.some(bookmark =>
            bookmark.kinoPubId === bestMatch.id && bookmark.folderId === targetFolder.id
          );

          if (alreadyBookmarked) {
            console.log(`⏭️  ${bestMatch.title} is already bookmarked in ${targetFolderName}, skipping`);
            continue;
          }

          // Add to appropriate bookmark folder
          await client.addToBookmarkFolder(targetFolder.id, bestMatch.id);
          console.log(`✅ Added "${bestMatch.title}" to ${targetFolderName}`);

          // Update recommendation status in database
          const pendingRecs = await db.getRecommendations('pending');
          const matchingRec = pendingRecs.find(rec =>
            rec.title.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(rec.title.toLowerCase())
          );

          if (matchingRec) {
            await db.updateRecommendationStatus(matchingRec.id, 'bookmarked', bestMatch.id);
          }

          addedCount++;

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.log(`❌ Could not find "${title}" on kino.pub`);
          notFoundCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing recommendation "${recommendation}":`, error);
        notFoundCount++;
      }
    }

    console.log(`\n🎉 Results:`);
    console.log(`✅ Added ${addedCount} new items to bookmarks`);
    console.log(`❌ Could not find ${notFoundCount} items`);

    if (addedCount > 0) {
      console.log('\n💡 Tips:');
      if (contentType === 'movie') {
        console.log('- Run "npm run scan-bookmarks movies-ai" to update your local cache');
      } else if (contentType === 'serial') {
        console.log('- Run "npm run scan-bookmarks tv-shows-ai" to update your local cache');
      } else {
        console.log('- Run "npm run scan-bookmarks movies-ai" and "npm run scan-bookmarks tv-shows-ai" to update your local cache');
      }
      console.log('- Check your kino.pub bookmarks to start watching!');
      console.log('- Already watched items are automatically removed from AI folders to keep recommendations fresh');
    }

  } catch (error) {
    console.error('❌ Error in AI recommendation process:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

/**
 * Clean up already watched or rated content from AI bookmark folders
 */
async function cleanupWatchedFromAIFolders(
  client: KinoPubClient, 
  db: DatabaseService, 
  contentType: 'movie' | 'serial' | 'both'
): Promise<void> {
  console.log('\n🧹 Cleaning up watched/rated content from AI bookmark folders...');

  try {
    // Get all watched items (both fully watched and rated items)
    const watchedItems = await db.getWatchedItems();
    const watchedKinoPubIds = new Set(watchedItems.map(item => item.kinoPubId));
    
    console.log(`📚 Found ${watchedItems.length} watched/rated items to check for removal`);

    // Determine which folders to clean based on content type
    const foldersToClean: string[] = [];
    if (contentType === 'movie') {
      foldersToClean.push('movies-ai');
    } else if (contentType === 'serial') {
      foldersToClean.push('tv-shows-ai');
    } else {
      foldersToClean.push('movies-ai', 'tv-shows-ai');
    }

    let totalRemoved = 0;

    for (const folderName of foldersToClean) {
      try {
        // Find the AI folder
        const aiFolder = await client.findBookmarkFolderByName(folderName);
        if (!aiFolder) {
          console.log(`📁 Folder "${folderName}" not found, skipping cleanup`);
          continue;
        }

        console.log(`📁 Cleaning folder: "${folderName}" (ID: ${aiFolder.id})`);

        // Get current bookmarks in the AI folder
        const folderContent = await client.getBookmarkFolder(aiFolder.id);
        const currentBookmarks = folderContent.data?.items || [];
        
        console.log(`🔖 Found ${currentBookmarks.length} items in "${folderName}" folder`);

        let removedFromFolder = 0;

        // Check each bookmark against watched items
        for (const bookmark of currentBookmarks) {
          if (watchedKinoPubIds.has(bookmark.id)) {
            try {
              console.log(`🗑️  Removing watched item: "${bookmark.title}" from ${folderName}`);
              await client.removeBookmark(bookmark.id, aiFolder.id);
              removedFromFolder++;
              totalRemoved++;

              // Small delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
              console.error(`❌ Failed to remove "${bookmark.title}" from ${folderName}:`, error);
            }
          }
        }

        console.log(`✅ Removed ${removedFromFolder} watched items from "${folderName}"`);

      } catch (error) {
        console.error(`❌ Error cleaning folder "${folderName}":`, error);
      }
    }

    console.log(`🧹 Cleanup complete: removed ${totalRemoved} watched items from AI folders`);

  } catch (error) {
    console.error('❌ Error during AI folder cleanup:', error);
  }
}

/**
 * Parse recommendation string to extract title and year
 */
function parseRecommendation(recommendation: string): { title: string; year?: number; searchTitles: string[] } {
  const yearMatch = recommendation.match(/\((\d{4})\)$/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const title = recommendation.replace(/\s*\(\d{4}\)\s*$/, '').trim();
  
  // Use English title for search
  const searchTitles: string[] = [title];
  
  return { title, year, searchTitles };
}

// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  let contentType: 'movie' | 'serial' | 'both' = 'both';

  if (args.includes('--movies')) {
    contentType = 'movie';
  } else if (args.includes('--shows') || args.includes('--serials')) {
    contentType = 'serial';
  }

  aiRecommend(contentType).catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { aiRecommend };