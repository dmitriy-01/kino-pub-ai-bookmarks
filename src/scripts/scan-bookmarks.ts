#!/usr/bin/env node

import { KinoPubClient } from '../services/kino-pub-client';
import { DatabaseService, BookmarkedItem } from '../services/database';
import { KinoPubMediaItem } from '../services/kino-pub-api';

/**
 * Scan bookmark folders and save items to database
 */
async function scanBookmarks(folderName: string = 'ai-recommendations'): Promise<void> {
  console.log(`🔍 Scanning "${folderName}" bookmark folder...`);
  
  const client = new KinoPubClient();
  const db = new DatabaseService();
  
  // Check authentication
  if (!client.isAuthenticated()) {
    console.error('❌ Not authenticated. Please run authentication first.');
    process.exit(1);
  }
  
  try {
    // Find or create the bookmark folder
    console.log(`📁 Looking for "${folderName}" bookmark folder...`);
    let folder = await client.findBookmarkFolderByName(folderName);
    
    if (!folder) {
      console.log(`📁 "${folderName}" folder not found. Creating it...`);
      folder = await client.findOrCreateBookmarkFolder(folderName);
      console.log(`✅ Created "${folderName}" folder with ID: ${folder.id}`);
    } else {
      console.log(`📁 Found "${folderName}" folder (ID: ${folder.id})`);
    }
    
    // Get items from the bookmark folder
    console.log('📡 Fetching bookmark folder contents...');
    const folderResponse = await client.getBookmarkFolder(folder.id);
    
    // Handle different response structures - items can be in data.items or directly in response.items
    const items = folderResponse.data?.items || (folderResponse as any).items || [];
    console.log(`📚 Found ${items.length} items in "${folderName}" folder`);
    
    let addedCount = 0;
    
    // Add items to database
    for (const item of items) {
      const bookmarkedItem: Omit<BookmarkedItem, 'id'> = {
        kinoPubId: item.id,
        title: item.title,
        type: determineContentType(item),
        year: item.year,
        poster: item.poster,
        folderId: folder.id,
        folderName: folderName,
        addedAt: new Date().toISOString() // API doesn't provide added date
      };
      
      await db.addBookmarkedItem(bookmarkedItem);
      addedCount++;
    }
    
    console.log(`💾 Saved ${addedCount} bookmarked items to database`);
    
    // Display summary
    const bookmarkedItems = await db.getBookmarkedItems(folder.id);
    
    if (bookmarkedItems.length > 0) {
      console.log(`\n📋 Items in "${folderName}" folder:`);
      bookmarkedItems.forEach((item, index) => {
        const typeIcon = item.type === 'movie' ? '🎬' : '📺';
        const yearStr = item.year ? ` (${item.year})` : '';
        console.log(`${index + 1}. ${typeIcon} ${item.title}${yearStr}`);
      });
    } else {
      console.log(`\n📋 No items found in "${folderName}" folder`);
    }
    
  } catch (error) {
    console.error('❌ Error scanning bookmarks:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

/**
 * Scan all bookmark folders
 */
async function scanAllBookmarks(): Promise<void> {
  console.log('🔍 Scanning all bookmark folders...');
  
  const client = new KinoPubClient();
  const db = new DatabaseService();
  
  // Check authentication
  if (!client.isAuthenticated()) {
    console.error('❌ Not authenticated. Please run authentication first.');
    process.exit(1);
  }
  
  try {
    // Get all bookmark folders
    console.log('📁 Fetching all bookmark folders...');
    const foldersResponse = await client.getBookmarkFolders();
    const folders = foldersResponse.data || (foldersResponse as any).items || [];
    
    console.log(`📁 Found ${folders.length} bookmark folders`);
    
    let totalItems = 0;
    
    for (const folder of folders) {
      console.log(`\n📂 Processing folder: "${folder.title}" (ID: ${folder.id})`);
      
      try {
        const folderResponse = await client.getBookmarkFolder(folder.id);
        const items = folderResponse.data?.items || (folderResponse as any).items || [];
        
        console.log(`  📚 Found ${items.length} items`);
        
        for (const item of items) {
          const bookmarkedItem: Omit<BookmarkedItem, 'id'> = {
            kinoPubId: item.id,
            title: item.title,
            type: determineContentType(item),
            year: item.year,
            poster: item.poster,
            folderId: folder.id,
            folderName: folder.title,
            addedAt: new Date().toISOString()
          };
          
          await db.addBookmarkedItem(bookmarkedItem);
          totalItems++;
        }
      } catch (error) {
        console.warn(`  ⚠️  Failed to process folder "${folder.title}":`, error);
      }
    }
    
    console.log(`\n✅ Processed ${totalItems} bookmarked items from ${folders.length} folders`);
    
  } catch (error) {
    console.error('❌ Error scanning all bookmarks:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

/**
 * Determine content type from KinoPub item
 */
function determineContentType(item: KinoPubMediaItem): 'movie' | 'serial' {
  if (item.type === 'movie' || (item as any).subtype === 'movie') {
    return 'movie';
  }
  return 'serial'; // Default to serial for TV shows
}

// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--all')) {
    scanAllBookmarks().catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
  } else {
    const folderName = args[0] || 'ai-recommendations';
    scanBookmarks(folderName).catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
  }
}

export { scanBookmarks, scanAllBookmarks };