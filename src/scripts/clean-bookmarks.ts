#!/usr/bin/env node

import { KinoPubClient } from '../services/kino-pub-client';
import { DatabaseService } from '../services/database';

/**
 * Clean managed AI bookmark folders by removing ALL items
 * Only operates on tv-shows-ai and movies-ai folders for safety
 */
async function cleanBookmarks(folderNames?: string[]): Promise<void> {
  console.log('🧹 Starting managed bookmark cleanup process...');
  console.log('⚠️  This will remove ALL items from the specified managed folders');

  const client = new KinoPubClient();
  const db = new DatabaseService();

  // Check authentication
  if (!client.isAuthenticated()) {
    console.error('❌ Not authenticated. Please run authentication first.');
    process.exit(1);
  }

  try {

    // Define managed folders (only AI-managed folders for safety)
    const MANAGED_FOLDERS = ['tv-shows-ai', 'movies-ai'];
    
    // Determine which managed folders to clean
    let targetFolderNames: string[];
    if (folderNames && folderNames.length > 0) {
      // Filter provided folder names to only include managed folders
      targetFolderNames = folderNames.filter(name => 
        MANAGED_FOLDERS.some(managed => 
          managed.toLowerCase() === name.toLowerCase() ||
          name.toLowerCase().includes(managed.toLowerCase())
        )
      );
      
      if (targetFolderNames.length === 0) {
        console.log('⚠️  No managed folders specified. Only tv-shows-ai and movies-ai folders can be cleaned.');
        console.log('💡 Available managed folders: tv-shows-ai, movies-ai');
        return;
      }
      
      console.log(`🎯 Cleaning specified managed folders: ${targetFolderNames.join(', ')}`);
    } else {
      // Clean all managed folders by default
      targetFolderNames = MANAGED_FOLDERS;
      console.log(`🎯 Cleaning all managed folders: ${targetFolderNames.join(', ')}`);
    }

    // Get all bookmark folders
    console.log('📁 Loading bookmark folders...');
    const foldersResponse = await client.getBookmarkFolders();
    const allFolders = foldersResponse.items || [];
    
    // Find the managed folders that exist
    const foldersToClean = allFolders.filter((folder: any) => 
      targetFolderNames.some(targetName => 
        folder.title.toLowerCase() === targetName.toLowerCase() ||
        folder.title.toLowerCase().includes(targetName.toLowerCase())
      )
    );

    if (foldersToClean.length === 0) {
      console.log('⚠️  No managed folders found to clean.');
      console.log('💡 Managed folders are created automatically when using AI recommendations.');
      return;
    }

    console.log(`📁 Found ${foldersToClean.length} managed folders to clean`);

    let totalRemoved = 0;
    let totalChecked = 0;

    // Clean each folder
    for (const folder of foldersToClean) {
      try {
        console.log(`\n📁 Cleaning folder: "${folder.title}" (ID: ${folder.id})`);

        // Get current bookmarks in the folder
        const folderContent = await client.getBookmarkFolder(folder.id);
        // Handle different response structures - items can be in data.items or directly in response.items
        const currentBookmarks = folderContent.data?.items || (folderContent as any).items || [];
        
        console.log(`🔖 Found ${currentBookmarks.length} items in "${folder.title}" folder`);
        totalChecked += currentBookmarks.length;

        let removedFromFolder = 0;

        // Remove all items from the folder
        for (const bookmark of currentBookmarks) {
          try {
            console.log(`🗑️  Removing item: "${bookmark.title}" (ID: ${bookmark.id})`);
            await client.removeBookmark(bookmark.id, folder.id);
            removedFromFolder++;
            totalRemoved++;

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (error) {
            console.error(`❌ Failed to remove "${bookmark.title}":`, error);
          }
        }

        if (removedFromFolder > 0) {
          console.log(`✅ Removed ${removedFromFolder} items from "${folder.title}"`);
        } else {
          console.log(`✨ No items found in "${folder.title}"`);
        }

      } catch (error) {
        console.error(`❌ Error cleaning folder "${folder.title}":`, error);
      }
    }

    console.log(`\n🎉 Managed folder cleanup complete!`);
    console.log(`📊 Summary:`);
    console.log(`  • Processed ${totalChecked} bookmarked items across ${foldersToClean.length} managed folders`);
    console.log(`  • Removed ${totalRemoved} items`);
    console.log(`  • ${foldersToClean.length} managed folders are now empty`);

    if (totalRemoved > 0) {
      console.log('\n💡 Tips:');
      console.log('- Run bookmark scan scripts to update your local cache');
      console.log('- Your managed AI folders are now completely clean');
      console.log('- Use AI recommend scripts to populate them with fresh recommendations');
      console.log('- Personal bookmark folders are left untouched for safety');
    }

  } catch (error) {
    console.error('❌ Error in bookmark cleanup process:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}



// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🧹 Managed Bookmark Cleanup Script

SAFETY: This script only operates on AI-managed folders (tv-shows-ai, movies-ai)
to prevent accidental deletion from your personal bookmark folders.

⚠️  WARNING: This script removes ALL items from the specified folders!

Usage:
  npm run clean-bookmarks                    # Clean all managed AI folders
  npm run clean-bookmarks --movies          # Clean only movies-ai folder
  npm run clean-bookmarks --shows           # Clean only tv-shows-ai folder
  npm run clean-bookmarks movies-ai         # Clean only movies-ai folder
  npm run clean-bookmarks tv-shows-ai       # Clean only tv-shows-ai folder

Options:
  --movies     Clean only movies-ai folder (removes ALL items)
  --shows      Clean only tv-shows-ai folder (removes ALL items)
  --help, -h   Show this help message

Managed Folders:
  • tv-shows-ai    - AI-recommended TV shows
  • movies-ai      - AI-recommended movies

Examples:
  npm run clean-bookmarks                    # Remove ALL items from both AI folders
  npm run clean-bookmarks --movies          # Remove ALL items from movies-ai
  npm run clean-bookmarks --shows           # Remove ALL items from tv-shows-ai
  npm run clean-bookmarks movies-ai         # Remove ALL items from movies-ai
  npm run clean-bookmarks tv-shows-ai       # Remove ALL items from tv-shows-ai

Note: Personal bookmark folders are never touched for safety.
This script completely empties the specified managed folders.
    `);
    process.exit(0);
  }

  // Handle content type flags
  let targetFolders: string[] | undefined;
  
  if (args.includes('--movies')) {
    targetFolders = ['movies-ai'];
  } else if (args.includes('--shows') || args.includes('--serials')) {
    targetFolders = ['tv-shows-ai'];
  } else {
    // Filter out flags to get folder names
    const folderNames = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
    targetFolders = folderNames.length > 0 ? folderNames : undefined;
  }

  cleanBookmarks(targetFolders).catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { cleanBookmarks };