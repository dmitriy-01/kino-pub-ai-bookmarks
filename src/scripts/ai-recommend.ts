#!/usr/bin/env node

import { KinoPubClient } from '../services/kino-pub-client';
import { AnthropicClient } from '../services/anthropic-client';
import { DatabaseService, RecommendationItem, WatchedItem, NotInterestedItem } from '../services/database';

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
    // Load watched content from database (prioritize fully watched, but include rated items)
    console.log('📖 Loading watched content from database...');
    let watchedItems = await db.getWatchedItemsForAI();
    console.log(`📚 Loaded ${watchedItems.length} fully watched items`);
    
    // If we have no fully watched items, also check for rated items (even if partially watched)
    if (watchedItems.length === 0) {
      const allWatchedItems = await db.getWatchedItems();
      const ratedItems = allWatchedItems.filter(item => item.userRating);
      if (ratedItems.length > 0) {
        console.log(`📚 Found ${ratedItems.length} rated items to include in analysis`);
        watchedItems = ratedItems;
      }
    }

    // If no fully watched items, try to use partially watched content with different confidence levels
    if (watchedItems.length === 0) {
      console.log('📖 No fully watched content found. Analyzing partially watched content...');
      const partiallyWatched = await db.getWatchedItems();
      
      // Categorize items by watch progress confidence levels
      const getWatchProgress = (item: WatchedItem) => {
        if (item.type === 'movie') return 1.0; // Movies in watching list are likely completed
        if (item.totalEpisodes && item.watchedEpisodes) {
          return item.watchedEpisodes / item.totalEpisodes;
        }
        return 0;
      };

      const highConfidence = partiallyWatched.filter(item => {
        const progress = getWatchProgress(item);
        return progress >= 0.9; // 90%+ watched - very high confidence
      });

      const goodConfidence = partiallyWatched.filter(item => {
        const progress = getWatchProgress(item);
        return progress >= 0.75 && progress < 0.9; // 75-89% watched - good confidence
      });

      const mediumConfidence = partiallyWatched.filter(item => {
        const progress = getWatchProgress(item);
        return progress >= 0.5 && progress < 0.75; // 50-74% watched - medium confidence
      });

      const lowConfidence = partiallyWatched.filter(item => {
        const progress = getWatchProgress(item);
        return progress >= 0.25 && progress < 0.5; // 25-49% watched - low confidence
      });

      console.log(`📊 Watch progress analysis:`);
      console.log(`  🟢 High confidence (90-100%): ${highConfidence.length} items`);
      console.log(`  🟡 Good confidence (75-89%): ${goodConfidence.length} items`);
      console.log(`  🟠 Medium confidence (50-74%): ${mediumConfidence.length} items`);
      console.log(`  🔴 Low confidence (25-49%): ${lowConfidence.length} items`);

      // Use items in order of confidence, prioritizing higher confidence levels
      if (highConfidence.length > 0) {
        watchedItems = [...highConfidence, ...goodConfidence, ...mediumConfidence];
        console.log(`📺 Using ${watchedItems.length} items with 50%+ progress (prioritizing high confidence)`);
      } else if (goodConfidence.length > 0) {
        watchedItems = [...goodConfidence, ...mediumConfidence];
        console.log(`📺 Using ${watchedItems.length} items with 50%+ progress`);
      } else if (mediumConfidence.length > 0) {
        watchedItems = mediumConfidence;
        console.log(`📺 Using ${watchedItems.length} items with 50%+ progress`);
      } else if (lowConfidence.length > 0) {
        watchedItems = lowConfidence;
        console.log(`📺 Using ${watchedItems.length} items with 25%+ progress (lower confidence)`);
        console.log('⚠️  Recommendations may be less accurate due to limited watch progress');
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
    const allBookmarkedItems = await db.getBookmarkedItems();
    
    // Sync "not interested" items from bookmarks to local database
    console.log('🔄 Syncing "not interested" items to local database...');
    const syncedCount = await db.syncNotInterestedFromBookmarks(allBookmarkedItems);
    if (syncedCount > 0) {
      console.log(`✅ Synced ${syncedCount} new "not interested" items to local database`);
    }
    
    // Load "not interested" items from local database (faster and more reliable)
    const notInterestedItems = await db.getNotInterestedItems();
    
    // Filter out "not interested" items from regular bookmarks
    const bookmarkedItems = allBookmarkedItems.filter(item => 
      !item.folderName.toLowerCase().includes('not interested') && 
      !item.folderName.toLowerCase().includes('not-interested') &&
      !item.folderName.toLowerCase().includes('dislike')
    );
    
    console.log(`🔖 Loaded ${bookmarkedItems.length} regular bookmarks`);
    if (notInterestedItems.length > 0) {
      console.log(`🚫 Found ${notInterestedItems.length} items in "not interested" database - will exclude from recommendations`);
    }

    // Load ALL watched items (including partially watched) to exclude from recommendations
    console.log('📖 Loading all watched items to exclude from recommendations...');
    const allWatchedItems = await db.getWatchedItems();
    console.log(`📚 Loaded ${allWatchedItems.length} total watched items (including partial)`);

    // Generate AI recommendations
    console.log('🧠 Generating AI recommendations...');
    const anthropicClient = new AnthropicClient();

    const rawRecommendations = await anthropicClient.generateRecommendations(
      watchedItems,
      bookmarkedItems,
      contentType,
      notInterestedItems
    );
    console.log(`💡 Generated ${rawRecommendations.length} raw recommendations`);

    // Filter out any recommendations that match already watched (including partial), bookmarked, or "not interested" content
    const allWatchedTitles = allWatchedItems.map(item => item.title.toLowerCase());
    const bookmarkedTitles = bookmarkedItems.map(item => item.title.toLowerCase());
    const notInterestedTitles = notInterestedItems.map(item => item.title.toLowerCase());
    const allExcludedTitles = [...allWatchedTitles, ...bookmarkedTitles, ...notInterestedTitles];

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

    // Clean up already watched content from AI bookmark folders (including partially watched)
    await cleanupWatchedFromAIFolders(client, db, contentType);

    // Clean up "not interested" items from AI bookmark folders
    await cleanupNotInterestedFromAIFolders(client, db, notInterestedItems, contentType);

    // Get current AI folder contents to avoid duplicates
    console.log('\n📋 Loading current AI folder contents to avoid duplicates...');
    // Small delay to ensure any previous operations are reflected
    await new Promise(resolve => setTimeout(resolve, 1000));
    const currentAIFolderItems = await getCurrentAIFolderItems(client, contentType);
    console.log(`🔖 Found ${currentAIFolderItems.length} existing items in AI folders`);

    // Search for each recommendation on kino.pub and add to bookmarks
    console.log('\n🔍 Searching for recommendations on kino.pub...');
    let addedCount = 0;
    let notFoundCount = 0;
    let skippedCount = 0;

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

          // Check if item is anime (genre 25) and skip if so
          const genres = (bestMatch as any).genres || [];
          const isAnime = genres.some((genre: any) => genre.id === 25 || genre === 25);
          if (isAnime) {
            console.log(`🚫 "${bestMatch.title}" is anime - skipping (anime excluded from recommendations)`);
            continue;
          }

          // Check IMDB rating filters
          const imdbRating = (bestMatch as any).imdb_rating || (bestMatch as any).imdb?.rating;
          if (imdbRating) {
            const rating = parseFloat(imdbRating);
            const isMovie = bestMatch.type === 'movie' || (bestMatch as any).subtype === 'movie';
            const isSerial = bestMatch.type === 'serial' || (bestMatch as any).subtype === 'serial';
            
            if (isMovie && rating < 6.0) {
              console.log(`🚫 "${bestMatch.title}" has IMDB rating ${rating} (movies require ≥6.0) - skipping`);
              continue;
            }
            
            if (isSerial && rating < 7.0) {
              console.log(`🚫 "${bestMatch.title}" has IMDB rating ${rating} (TV shows require ≥7.0) - skipping`);
              continue;
            }
          }

          // Check if item is subscribed (from search results)
          const isSubscribed = (bestMatch as any).subscribed === true;
          if (isSubscribed) {
            console.log(`📺 "${bestMatch.title}" is subscribed - adding to database`);
            
            // Add to watched items database as subscribed (partially watched)
            const watchedItem: Omit<WatchedItem, 'id'> = {
              kinoPubId: bestMatch.id,
              title: bestMatch.title,
              type: bestMatch.type === 'movie' ? 'movie' : 'serial',
              year: bestMatch.year,
              fullyWatched: false, // Subscribed doesn't mean fully watched
              poster: bestMatch.poster,
              watchedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            
            await db.addWatchedItem(watchedItem);
            console.log(`✅ Added subscribed item "${bestMatch.title}" to watched database`);
            
            // Add to local arrays to prevent duplicates in the same run
            allWatchedItems.push(watchedItem as WatchedItem);
            
            // Update recommendation status
            const pendingRecs = await db.getRecommendations('pending');
            const matchingRec = pendingRecs.find(rec =>
              rec.title.toLowerCase().includes(title.toLowerCase()) ||
              title.toLowerCase().includes(rec.title.toLowerCase())
            );

            if (matchingRec) {
              await db.updateRecommendationStatus(matchingRec.id, 'rejected', bestMatch.id);
            }

            addedCount++;
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
            continue; // Skip to next recommendation
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

          // Check if it's already bookmarked in ANY folder or already watched
          const alreadyBookmarked = bookmarkedItems.some(bookmark => {
            if (bookmark.kinoPubId === bestMatch.id) {
              return true;
            }
            // Also check by title similarity
            const bookmarkTitle = bookmark.title.toLowerCase().trim();
            const bestMatchTitle = bestMatch.title.toLowerCase().trim();
            const cleanBookmarkTitle = bookmarkTitle.replace(/^[^/]*\/\s*/, '').trim();
            const cleanBestMatchTitle = bestMatchTitle.replace(/^[^/]*\/\s*/, '').trim();
            
            return cleanBookmarkTitle === cleanBestMatchTitle ||
                   bookmarkTitle.includes(cleanBestMatchTitle) ||
                   bestMatchTitle.includes(cleanBookmarkTitle);
          });

          const alreadyWatched = allWatchedItems.some(watched => {
            if (watched.kinoPubId === bestMatch.id) {
              return true;
            }
            // Also check by title similarity
            const watchedTitle = watched.title.toLowerCase().trim();
            const bestMatchTitle = bestMatch.title.toLowerCase().trim();
            const cleanWatchedTitle = watchedTitle.replace(/^[^/]*\/\s*/, '').trim();
            const cleanBestMatchTitle = bestMatchTitle.replace(/^[^/]*\/\s*/, '').trim();
            
            return cleanWatchedTitle === cleanBestMatchTitle ||
                   watchedTitle.includes(cleanBestMatchTitle) ||
                   bestMatchTitle.includes(cleanWatchedTitle);
          });

          // Check if it's already in AI folders (live check)
          const alreadyInAIFolder = currentAIFolderItems.some(item => {
            // Check by ID first
            if (item.id === bestMatch.id) {
              return true;
            }
            
            // Check by title similarity (in case of different IDs for same content)
            const itemTitle = item.title.toLowerCase().trim();
            const bestMatchTitle = bestMatch.title.toLowerCase().trim();
            
            // Remove common prefixes/suffixes and compare
            const cleanItemTitle = itemTitle.replace(/^[^/]*\/\s*/, '').trim();
            const cleanBestMatchTitle = bestMatchTitle.replace(/^[^/]*\/\s*/, '').trim();
            
            return cleanItemTitle === cleanBestMatchTitle || 
                   itemTitle.includes(cleanBestMatchTitle) || 
                   bestMatchTitle.includes(cleanItemTitle);
          });

          if (alreadyBookmarked) {
            console.log(`⏭️  ${bestMatch.title} is already bookmarked, skipping`);
            skippedCount++;
            continue;
          }

          if (alreadyWatched) {
            console.log(`⏭️  ${bestMatch.title} is already watched, skipping`);
            skippedCount++;
            continue;
          }

          if (alreadyInAIFolder) {
            console.log(`⏭️  ${bestMatch.title} is already in AI folders, skipping`);
            skippedCount++;
            continue;
          }

          // Check current watching status via API
          console.log(`🔍 Checking watching status for "${bestMatch.title}"...`);
          const watchStatus = await client.isItemWatched(bestMatch.id);
          
          if (watchStatus.isWatched) {
            console.log(`📺 "${bestMatch.title}" is being watched - adding to database instead of bookmarks`);
            
            // Add to watched items database
            const watchedItem: Omit<WatchedItem, 'id'> = {
              kinoPubId: bestMatch.id,
              title: bestMatch.title,
              type: bestMatch.type === 'movie' ? 'movie' : 'serial',
              year: bestMatch.year,
              totalEpisodes: watchStatus.watchProgress?.totalEpisodes,
              watchedEpisodes: watchStatus.watchProgress?.watchedEpisodes,
              fullyWatched: watchStatus.isFullyWatched,
              poster: bestMatch.poster,
              watchedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            
            await db.addWatchedItem(watchedItem);
            console.log(`✅ Added "${bestMatch.title}" to watched items database (${watchedItem.watchedEpisodes}/${watchedItem.totalEpisodes} episodes)`);
            
            // Add to local arrays to prevent duplicates in the same run
            allWatchedItems.push(watchedItem as WatchedItem);
            
            // Update recommendation status
            const pendingRecs = await db.getRecommendations('pending');
            const matchingRec = pendingRecs.find(rec =>
              rec.title.toLowerCase().includes(title.toLowerCase()) ||
              title.toLowerCase().includes(rec.title.toLowerCase())
            );

            if (matchingRec) {
              await db.updateRecommendationStatus(matchingRec.id, 'rejected', bestMatch.id);
            }
          } else {
            // Item is not watched, add to bookmark folder
            await client.addToBookmarkFolder(targetFolder.id, bestMatch.id);
            console.log(`✅ Added "${bestMatch.title}" to ${targetFolderName}`);

            // Add to currentAIFolderItems to prevent duplicates in the same run
            currentAIFolderItems.push(bestMatch);

            // Update recommendation status in database
            const pendingRecs = await db.getRecommendations('pending');
            const matchingRec = pendingRecs.find(rec =>
              rec.title.toLowerCase().includes(title.toLowerCase()) ||
              title.toLowerCase().includes(rec.title.toLowerCase())
            );

            if (matchingRec) {
              await db.updateRecommendationStatus(matchingRec.id, 'bookmarked', bestMatch.id);
            }
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
    console.log(`✅ Processed ${addedCount} new items (added to bookmarks or watched database)`);
    console.log(`⏭️  Skipped ${skippedCount} items (already bookmarked, watched, or in AI folders)`);
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
 * Clean up already watched content from AI bookmark folders (including partially watched)
 */
async function cleanupWatchedFromAIFolders(
  client: KinoPubClient,
  db: DatabaseService,
  contentType: 'movie' | 'serial' | 'both'
): Promise<void> {
  console.log('\n🧹 Cleaning up watched content from AI bookmark folders...');

  try {
    // Get all watched items (including partially watched to avoid recommending what's already being watched)
    const watchedItems = await db.getWatchedItems();
    const watchedKinoPubIds = new Set(watchedItems.map(item => item.kinoPubId));

    console.log(`📚 Found ${watchedItems.length} watched items (including partial) to check for removal`);

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
        // Handle different response structures - items can be in data.items or directly in response.items
        const currentBookmarks = folderContent.data?.items || (folderContent as any).items || [];

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
 * Get current items in AI folders to avoid duplicates
 */
async function getCurrentAIFolderItems(
  client: KinoPubClient,
  contentType: 'movie' | 'serial' | 'both'
): Promise<any[]> {
  const allItems: any[] = [];

  // Determine which folders to check based on content type
  const foldersToCheck: string[] = [];
  if (contentType === 'movie') {
    foldersToCheck.push('movies-ai');
  } else if (contentType === 'serial') {
    foldersToCheck.push('tv-shows-ai');
  } else {
    foldersToCheck.push('movies-ai', 'tv-shows-ai');
  }

  for (const folderName of foldersToCheck) {
    try {
      // Find the AI folder
      const aiFolder = await client.findBookmarkFolderByName(folderName);
      if (!aiFolder) {
        console.log(`📁 Folder "${folderName}" not found, skipping`);
        continue;
      }

      // Get current bookmarks in the AI folder
      const folderContent = await client.getBookmarkFolder(aiFolder.id);
      // Handle different response structures - items can be in data.items or directly in response.items
      const currentBookmarks = folderContent.data?.items || (folderContent as any).items || [];
      
      allItems.push(...currentBookmarks);
      console.log(`📁 Found ${currentBookmarks.length} items in "${folderName}" folder`);

    } catch (error) {
      console.error(`❌ Error loading folder "${folderName}":`, error);
    }
  }

  return allItems;
}

/**
 * Clean up "not interested" items from AI bookmark folders
 */
async function cleanupNotInterestedFromAIFolders(
  client: KinoPubClient,
  db: DatabaseService,
  notInterestedItems: any[],
  contentType: 'movie' | 'serial' | 'both'
): Promise<void> {
  if (notInterestedItems.length === 0) {
    return; // No "not interested" items to clean up
  }

  console.log('\n🚫 Cleaning up "not interested" items from AI bookmark folders...');

  try {
    const notInterestedKinoPubIds = new Set(notInterestedItems.map(item => item.kinoPubId));
    console.log(`🚫 Found ${notInterestedItems.length} "not interested" items to remove from AI folders`);

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
          console.log(`📁 Folder "${folderName}" not found, skipping "not interested" cleanup`);
          continue;
        }

        console.log(`📁 Cleaning "not interested" items from folder: "${folderName}" (ID: ${aiFolder.id})`);

        // Get current bookmarks in the AI folder
        const folderContent = await client.getBookmarkFolder(aiFolder.id);
        // Handle different response structures - items can be in data.items or directly in response.items
        const currentBookmarks = folderContent.data?.items || (folderContent as any).items || [];

        console.log(`🔖 Checking ${currentBookmarks.length} items in "${folderName}" folder for "not interested" matches`);

        let removedFromFolder = 0;

        // Check each bookmark against "not interested" items
        for (const bookmark of currentBookmarks) {
          let shouldRemove = false;
          let matchReason = '';

          // Check for exact ID match
          if (notInterestedKinoPubIds.has(bookmark.id)) {
            shouldRemove = true;
            matchReason = 'exact ID match';
          } else {
            // Check for title similarity (in case same content has different IDs)
            const bookmarkTitle = bookmark.title.toLowerCase().trim();
            for (const notInterestedItem of notInterestedItems) {
              const notInterestedTitle = notInterestedItem.title.toLowerCase().trim();
              
              // Check if titles are very similar (contains or partial match)
              if (bookmarkTitle.includes(notInterestedTitle) || notInterestedTitle.includes(bookmarkTitle)) {
                shouldRemove = true;
                matchReason = `title similarity with "${notInterestedItem.title}"`;
                break;
              }
              
              // Check if they're the same after removing common variations
              const cleanBookmarkTitle = bookmarkTitle.replace(/[:\-\s]+/g, '').toLowerCase();
              const cleanNotInterestedTitle = notInterestedTitle.replace(/[:\-\s]+/g, '').toLowerCase();
              
              if (cleanBookmarkTitle === cleanNotInterestedTitle) {
                shouldRemove = true;
                matchReason = `normalized title match with "${notInterestedItem.title}"`;
                break;
              }
            }
          }

          if (shouldRemove) {
            try {
              console.log(`🚫 Removing "not interested" item: "${bookmark.title}" from ${folderName} (${matchReason})`);
              await client.removeBookmark(bookmark.id, aiFolder.id);
              removedFromFolder++;
              totalRemoved++;

              // Small delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
              console.error(`❌ Failed to remove "not interested" item "${bookmark.title}" from ${folderName}:`, error);
            }
          }
        }

        if (removedFromFolder > 0) {
          console.log(`✅ Removed ${removedFromFolder} "not interested" items from "${folderName}"`);
        } else {
          console.log(`✅ No "not interested" items found in "${folderName}"`);
        }

      } catch (error) {
        console.error(`❌ Error cleaning "not interested" items from folder "${folderName}":`, error);
      }
    }

    if (totalRemoved > 0) {
      console.log(`🚫 "Not interested" cleanup complete: removed ${totalRemoved} items from AI folders`);
    } else {
      console.log(`🚫 "Not interested" cleanup complete: no items needed removal`);
    }

  } catch (error) {
    console.error('❌ Error during "not interested" AI folder cleanup:', error);
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