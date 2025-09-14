#!/usr/bin/env node

import { KinoPubClient } from '../services/kino-pub-client';
import { DatabaseService, NotInterestedItem } from '../services/database';

/**
 * Clean up "not interested" items from AI recommendation folders
 */
async function cleanupNotInterested(): Promise<void> {
  console.log('🚫 Starting cleanup of "not interested" items from AI folders...');

  const client = new KinoPubClient();
  const db = new DatabaseService();

  // Check authentication
  if (!client.isAuthenticated()) {
    console.error('❌ Not authenticated. Please run authentication first.');
    process.exit(1);
  }

  try {
    // Sync "not interested" items from bookmarks to local database first
    console.log('📖 Loading and syncing bookmarks from database...');
    const allBookmarkedItems = await db.getBookmarkedItems();
    const syncedCount = await db.syncNotInterestedFromBookmarks(allBookmarkedItems);
    if (syncedCount > 0) {
      console.log(`✅ Synced ${syncedCount} new "not interested" items to local database`);
    }
    
    // Load "not interested" items from local database (faster and more reliable)
    const notInterestedItems = await db.getNotInterestedItems();
    
    if (notInterestedItems.length === 0) {
      console.log('✅ No "not interested" items found in database. Nothing to clean up.');
      return;
    }

    console.log(`🚫 Found ${notInterestedItems.length} "not interested" items to remove from AI folders`);
    
    // List the "not interested" items
    console.log('\n📋 "Not interested" items:');
    notInterestedItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title} (${item.year || 'Unknown year'}) - ${item.reason || 'No reason'} (ID: ${item.kinoPubId})`);
    });

    // Clean up from both AI folders
    const foldersToClean = ['movies-ai', 'tv-shows-ai'];
    const notInterestedKinoPubIds = new Set(notInterestedItems.map(item => item.kinoPubId));
    let totalRemoved = 0;

    for (const folderName of foldersToClean) {
      try {
        // Find the AI folder
        const aiFolder = await client.findBookmarkFolderByName(folderName);
        if (!aiFolder) {
          console.log(`\n📁 Folder "${folderName}" not found, skipping`);
          continue;
        }

        console.log(`\n📁 Cleaning folder: "${folderName}" (ID: ${aiFolder.id})`);

        // Try multiple approaches to get folder contents (API can be inconsistent)
        console.log(`📡 Fetching all items from "${folderName}" folder...`);
        
        // First try: Use the pagination-aware method
        let currentBookmarks = await client.getAllBookmarkFolderItems(aiFolder.id);
        
        // If we don't find the target items, try the original method as fallback
        const hasTargetItems = currentBookmarks.some((item: any) => {
          const title = item.title.toLowerCase();
          return title.includes('падение') || title.includes('убийц') || 
                 title.includes('fall') || title.includes('killing');
        });
        
        if (!hasTargetItems && currentBookmarks.length > 0) {
          console.log(`🔄 Target items not found in first attempt, trying alternative method...`);
          
          // Try the original single-page method
          const folderResponse = await client.getBookmarkFolder(aiFolder.id);
          const alternativeBookmarks = folderResponse.data?.items || (folderResponse as any).items || [];
          
          const hasTargetInAlternative = alternativeBookmarks.some((item: any) => {
            const title = item.title.toLowerCase();
            return title.includes('падение') || title.includes('убийц') || 
                   title.includes('fall') || title.includes('killing');
          });
          
          if (hasTargetInAlternative) {
            console.log(`✅ Found target items using alternative method`);
            currentBookmarks = alternativeBookmarks;
          }
        }

        console.log(`🔖 Found ${currentBookmarks.length} total items in "${folderName}" folder`);

        // Debug: Show all items and their IDs to find the target items
        if (currentBookmarks.length > 0) {
          console.log(`🔍 Debug - All items in ${folderName}:`);
          currentBookmarks.forEach((item: any, index: number) => {
            console.log(`   ${index + 1}. "${item.title}" (ID: ${item.id})`);
          });
        }

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
              
              // Debug: Show title comparison
              if (bookmarkTitle.includes('fall') || bookmarkTitle.includes('killing') || 
                  notInterestedTitle.includes('fall') || notInterestedTitle.includes('killing')) {
                console.log(`🔍 Comparing: "${bookmarkTitle}" vs "${notInterestedTitle}"`);
              }
              
              // Remove year from titles for comparison
              const bookmarkTitleNoYear = bookmarkTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim();
              const notInterestedTitleNoYear = notInterestedTitle.replace(/\s*\(\d{4}\)\s*$/, '').trim();
              
              // Check if titles are very similar (contains or partial match)
              if (bookmarkTitleNoYear.includes(notInterestedTitleNoYear) || notInterestedTitleNoYear.includes(bookmarkTitleNoYear)) {
                shouldRemove = true;
                matchReason = `title similarity with "${notInterestedItem.title}" (ignoring year)`;
                break;
              }
              
              // Check if they're the same after removing common variations
              const cleanBookmarkTitle = bookmarkTitleNoYear.replace(/[:\-\s]+/g, '').toLowerCase();
              const cleanNotInterestedTitle = notInterestedTitleNoYear.replace(/[:\-\s]+/g, '').toLowerCase();
              
              if (cleanBookmarkTitle === cleanNotInterestedTitle) {
                shouldRemove = true;
                matchReason = `normalized title match with "${notInterestedItem.title}" (ignoring year)`;
                break;
              }
            }
          }

          if (shouldRemove) {
            try {
              console.log(`🚫 Removing: "${bookmark.title}" (${matchReason})`);
              await client.removeBookmark(bookmark.id, aiFolder.id);
              removedFromFolder++;
              totalRemoved++;

              // Small delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
              console.error(`❌ Failed to remove "${bookmark.title}":`, error);
            }
          }
        }

        if (removedFromFolder > 0) {
          console.log(`✅ Removed ${removedFromFolder} items from "${folderName}"`);
        } else {
          console.log(`✅ No matching items found in "${folderName}"`);
        }

      } catch (error) {
        console.error(`❌ Error cleaning folder "${folderName}":`, error);
      }
    }

    console.log(`\n🎉 Cleanup complete!`);
    console.log(`✅ Removed ${totalRemoved} "not interested" items from AI folders`);
    
    if (totalRemoved > 0) {
      console.log('\n💡 Tips:');
      console.log('- Run "npm run scan-bookmarks movies-ai" and "npm run scan-bookmarks tv-shows-ai" to update your local cache');
      console.log('- The AI recommendation system will now avoid suggesting these items again');
    }

  } catch (error) {
    console.error('❌ Error in cleanup process:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run the script if called directly
if (require.main === module) {
  cleanupNotInterested().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { cleanupNotInterested };