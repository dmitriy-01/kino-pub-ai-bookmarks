#!/usr/bin/env node

import { DatabaseService, WatchedItem } from '../services/database';
import * as readline from 'readline';

/**
 * Interactive script to rate and add notes to watched content
 */
async function rateContent(): Promise<void> {
  console.log('⭐ Content Rating Tool');
  console.log('Rate your watched content to improve AI recommendations!\n');
  
  const db = new DatabaseService();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  try {
    // Get unrated content first, then rated content
    const unratedItems = await db.getWatchedItems(undefined, true);
    const unrated = unratedItems.filter(item => !item.userRating);
    const rated = unratedItems.filter(item => item.userRating);
    
    console.log(`📊 Found ${unrated.length} unrated items and ${rated.length} rated items\n`);
    
    if (unrated.length === 0 && rated.length === 0) {
      console.log('📋 No watched content found. Run "npm run scan-watched" first.');
      return;
    }
    
    // Show menu
    console.log('What would you like to do?');
    console.log('1. Rate unrated content');
    console.log('2. Update existing ratings');
    console.log('3. View all ratings');
    console.log('4. Exit');
    
    const choice = await askQuestion(rl, '\nEnter your choice (1-4): ');
    
    switch (choice.trim()) {
      case '1':
        if (unrated.length > 0) {
          await rateItems(rl, db, unrated);
        } else {
          console.log('🎉 All your content is already rated!');
        }
        break;
      case '2':
        if (rated.length > 0) {
          await updateRatings(rl, db, rated);
        } else {
          console.log('📋 No rated content to update.');
        }
        break;
      case '3':
        await viewRatings(db);
        break;
      case '4':
        console.log('👋 Goodbye!');
        break;
      default:
        console.log('❌ Invalid choice');
    }
    
  } catch (error) {
    console.error('❌ Error in rating tool:', error);
  } finally {
    rl.close();
    db.close();
  }
}

/**
 * Rate unrated items
 */
async function rateItems(rl: readline.Interface, db: DatabaseService, items: WatchedItem[]): Promise<void> {
  console.log(`\n⭐ Rating ${items.length} unrated items...\n`);
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const typeIcon = item.type === 'movie' ? '🎬' : '📺';
    const yearStr = item.year ? ` (${item.year})` : '';
    
    console.log(`\n[${i + 1}/${items.length}] ${typeIcon} ${item.title}${yearStr}`);
    
    // Ask for rating
    const ratingStr = await askQuestion(rl, 'Rate 1-10 (or "s" to skip, "q" to quit): ');
    
    if (ratingStr.toLowerCase() === 'q') {
      console.log('👋 Quitting...');
      break;
    }
    
    if (ratingStr.toLowerCase() === 's') {
      console.log('⏭️  Skipped');
      continue;
    }
    
    const rating = parseInt(ratingStr.trim());
    if (isNaN(rating) || rating < 1 || rating > 10) {
      console.log('❌ Invalid rating, skipping...');
      continue;
    }
    
    // Ask for notes
    const notes = await askQuestion(rl, 'Notes (optional): ');
    const cleanNotes = notes.trim() || undefined;
    
    // Save to database
    await db.updateWatchedItemPreferences(item.kinoPubId, rating, cleanNotes);
    
    const notesStr = cleanNotes ? ` - "${cleanNotes}"` : '';
    console.log(`✅ Rated ${rating}/10${notesStr}`);
  }
}

/**
 * Update existing ratings
 */
async function updateRatings(rl: readline.Interface, db: DatabaseService, items: WatchedItem[]): Promise<void> {
  console.log(`\n📝 Updating ratings for ${items.length} items...\n`);
  
  // Show list of rated items
  console.log('Rated content:');
  items.forEach((item, index) => {
    const typeIcon = item.type === 'movie' ? '🎬' : '📺';
    const yearStr = item.year ? ` (${item.year})` : '';
    const notesStr = item.userNotes ? ` - "${item.userNotes}"` : '';
    console.log(`${index + 1}. ${typeIcon} ${item.title}${yearStr} [${item.userRating}/10]${notesStr}`);
  });
  
  const indexStr = await askQuestion(rl, '\nEnter item number to update (or "q" to quit): ');
  
  if (indexStr.toLowerCase() === 'q') {
    return;
  }
  
  const index = parseInt(indexStr.trim()) - 1;
  if (isNaN(index) || index < 0 || index >= items.length) {
    console.log('❌ Invalid item number');
    return;
  }
  
  const item = items[index];
  const typeIcon = item.type === 'movie' ? '🎬' : '📺';
  const yearStr = item.year ? ` (${item.year})` : '';
  
  console.log(`\nUpdating: ${typeIcon} ${item.title}${yearStr}`);
  console.log(`Current rating: ${item.userRating}/10`);
  console.log(`Current notes: ${item.userNotes || 'None'}`);
  
  // Ask for new rating
  const ratingStr = await askQuestion(rl, 'New rating 1-10 (or Enter to keep current): ');
  let newRating = item.userRating;
  
  if (ratingStr.trim()) {
    const rating = parseInt(ratingStr.trim());
    if (!isNaN(rating) && rating >= 1 && rating <= 10) {
      newRating = rating;
    } else {
      console.log('❌ Invalid rating, keeping current');
    }
  }
  
  // Ask for new notes
  const notesStr = await askQuestion(rl, 'New notes (or Enter to keep current): ');
  let newNotes = item.userNotes;
  
  if (notesStr.trim()) {
    newNotes = notesStr.trim();
  }
  
  // Save to database
  await db.updateWatchedItemPreferences(item.kinoPubId, newRating, newNotes);
  
  const notesDisplay = newNotes ? ` - "${newNotes}"` : '';
  console.log(`✅ Updated to ${newRating}/10${notesDisplay}`);
}

/**
 * View all ratings
 */
async function viewRatings(db: DatabaseService): Promise<void> {
  console.log('\n📊 All Ratings:\n');
  
  const items = await db.getWatchedItemsForAI();
  
  if (items.length === 0) {
    console.log('📋 No rated content found.');
    return;
  }
  
  // Group by rating
  const byRating: { [key: number]: WatchedItem[] } = {};
  const unrated: WatchedItem[] = [];
  
  items.forEach(item => {
    if (item.userRating) {
      if (!byRating[item.userRating]) {
        byRating[item.userRating] = [];
      }
      byRating[item.userRating].push(item);
    } else {
      unrated.push(item);
    }
  });
  
  // Display by rating (highest first)
  for (let rating = 10; rating >= 1; rating--) {
    if (byRating[rating] && byRating[rating].length > 0) {
      console.log(`⭐ ${rating}/10 (${byRating[rating].length} items):`);
      byRating[rating].forEach(item => {
        const typeIcon = item.type === 'movie' ? '🎬' : '📺';
        const yearStr = item.year ? ` (${item.year})` : '';
        const notesStr = item.userNotes ? ` - "${item.userNotes}"` : '';
        console.log(`  ${typeIcon} ${item.title}${yearStr}${notesStr}`);
      });
      console.log();
    }
  }
  
  if (unrated.length > 0) {
    console.log(`❓ Unrated (${unrated.length} items):`);
    unrated.slice(0, 5).forEach(item => {
      const typeIcon = item.type === 'movie' ? '🎬' : '📺';
      const yearStr = item.year ? ` (${item.year})` : '';
      console.log(`  ${typeIcon} ${item.title}${yearStr}`);
    });
    if (unrated.length > 5) {
      console.log(`  ... and ${unrated.length - 5} more`);
    }
  }
}

/**
 * Helper function to ask questions
 */
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Run the script if called directly
if (require.main === module) {
  rateContent().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { rateContent };