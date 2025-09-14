#!/usr/bin/env node

import { KinoPubClient } from '../services/kino-pub-client';
import { DatabaseService, NotInterestedItem } from '../services/database';

/**
 * Manage "not interested" items
 */
async function manageNotInterested(action?: string, searchQuery?: string): Promise<void> {
  const client = new KinoPubClient();
  const db = new DatabaseService();

  // Check authentication
  if (!client.isAuthenticated()) {
    console.error('❌ Not authenticated. Please run authentication first.');
    process.exit(1);
  }

  try {
    if (action === 'list') {
      await listNotInterestedItems(db);
    } else if (action === 'add' && searchQuery) {
      await addNotInterestedItem(client, db, searchQuery);
    } else if (action === 'remove' && searchQuery) {
      await removeNotInterestedItem(db, searchQuery);
    } else if (action === 'sync') {
      await syncNotInterestedItems(db);
    } else {
      showHelp();
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

/**
 * List all "not interested" items
 */
async function listNotInterestedItems(db: DatabaseService): Promise<void> {
  console.log('📋 "Not Interested" Items');
  console.log('========================\n');

  const items = await db.getNotInterestedItems();
  
  if (items.length === 0) {
    console.log('✅ No "not interested" items found.');
    console.log('💡 Use "npm run manage-not-interested add <search>" to add items');
    return;
  }

  console.log(`Found ${items.length} "not interested" items:\n`);
  
  items.forEach((item, index) => {
    console.log(`${index + 1}. 📺 ${item.title} (${item.year || 'Unknown year'})`);
    console.log(`   Type: ${item.type}`);
    console.log(`   Reason: ${item.reason || 'No reason provided'}`);
    console.log(`   Added: ${new Date(item.addedAt).toLocaleDateString()}`);
    console.log(`   ID: ${item.kinoPubId}\n`);
  });

  console.log('💡 Commands:');
  console.log('   npm run manage-not-interested add <search>    # Add item');
  console.log('   npm run manage-not-interested remove <title>  # Remove item');
  console.log('   npm run manage-not-interested sync            # Sync from bookmarks');
}

/**
 * Add an item to "not interested" list
 */
async function addNotInterestedItem(client: KinoPubClient, db: DatabaseService, searchQuery: string): Promise<void> {
  console.log(`🔍 Searching for: "${searchQuery}"`);

  try {
    // Search for the item
    const searchResults = await client.searchContent(searchQuery);
    
    if (!searchResults.data || searchResults.data.length === 0) {
      console.log('❌ No items found for your search.');
      return;
    }

    console.log(`\n✅ Found ${searchResults.data.length} results:`);
    searchResults.data.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title} (${item.year || 'Unknown year'}) - ${item.type}`);
    });

    // For now, add the first result (in a real implementation, you might want user selection)
    const selectedItem = searchResults.data[0];
    
    // Check if already in "not interested" list
    const isAlreadyNotInterested = await db.isNotInterested(selectedItem.id);
    if (isAlreadyNotInterested) {
      console.log(`⚠️  "${selectedItem.title}" is already in your "not interested" list.`);
      return;
    }

    // Add to "not interested" list
    const now = new Date().toISOString();
    const notInterestedItem: Omit<NotInterestedItem, 'id'> = {
      kinoPubId: selectedItem.id,
      title: selectedItem.title,
      type: selectedItem.type === 'movie' ? 'movie' : 'serial',
      year: selectedItem.year,
      poster: selectedItem.poster,
      reason: 'Manually added via manage script',
      addedAt: now,
      updatedAt: now
    };

    await db.addNotInterestedItem(notInterestedItem);
    console.log(`✅ Added "${selectedItem.title}" to "not interested" list.`);
    console.log('💡 Run "npm run cleanup-not-interested" to remove it from AI folders.');

  } catch (error) {
    console.error('❌ Error searching for item:', error);
  }
}

/**
 * Remove an item from "not interested" list
 */
async function removeNotInterestedItem(db: DatabaseService, titleQuery: string): Promise<void> {
  console.log(`🔍 Looking for items matching: "${titleQuery}"`);

  const allItems = await db.getNotInterestedItems();
  const matchingItems = allItems.filter(item => 
    item.title.toLowerCase().includes(titleQuery.toLowerCase())
  );

  if (matchingItems.length === 0) {
    console.log('❌ No matching items found in "not interested" list.');
    console.log('💡 Use "npm run manage-not-interested list" to see all items.');
    return;
  }

  if (matchingItems.length > 1) {
    console.log(`⚠️  Found ${matchingItems.length} matching items:`);
    matchingItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title} (${item.year || 'Unknown year'})`);
    });
    console.log('💡 Please be more specific in your search.');
    return;
  }

  // Remove the item
  const itemToRemove = matchingItems[0];
  await db.removeNotInterestedItem(itemToRemove.kinoPubId);
  console.log(`✅ Removed "${itemToRemove.title}" from "not interested" list.`);
}

/**
 * Sync "not interested" items from bookmark folders
 */
async function syncNotInterestedItems(db: DatabaseService): Promise<void> {
  console.log('🔄 Syncing "not interested" items from bookmark folders...');

  const bookmarkedItems = await db.getBookmarkedItems();
  const syncedCount = await db.syncNotInterestedFromBookmarks(bookmarkedItems);

  if (syncedCount > 0) {
    console.log(`✅ Synced ${syncedCount} new "not interested" items from bookmark folders.`);
  } else {
    console.log('✅ All "not interested" items are already synced.');
  }

  const totalItems = await db.getNotInterestedItems();
  console.log(`📊 Total "not interested" items: ${totalItems.length}`);
}

/**
 * Show help information
 */
function showHelp(): void {
  console.log(`
🚫 Manage "Not Interested" Items

USAGE:
  npm run manage-not-interested <command> [options]

COMMANDS:
  list                     List all "not interested" items
  add <search>            Add item to "not interested" list
  remove <title>          Remove item from "not interested" list  
  sync                    Sync from bookmark folders

EXAMPLES:
  npm run manage-not-interested list
  npm run manage-not-interested add "Breaking Bad"
  npm run manage-not-interested remove "The Office"
  npm run manage-not-interested sync

NOTES:
  - Items in "not interested" list will be excluded from AI recommendations
  - Use "npm run cleanup-not-interested" to remove them from AI folders
  - The system automatically syncs from bookmark folders during AI recommendations
`);
}

// Run the script if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const action = args[0];
  const query = args.slice(1).join(' ');

  manageNotInterested(action, query).catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { manageNotInterested };