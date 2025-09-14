#!/usr/bin/env node

import { AuthenticationService } from '../services/auth';

/**
 * Simple authentication script for kino.pub
 */
async function authenticate(): Promise<void> {
  console.log('🔐 Kino.pub Authentication');
  console.log('==========================\n');

  const authService = new AuthenticationService();

  // Check if already authenticated
  if (authService.isAuthenticated()) {
    console.log('✅ You are already authenticated!');
    console.log('💡 You can now run AI recommendation commands:');
    console.log('   - npm run ai-recommend-shows');
    console.log('   - npm run ai-recommend-movies');
    console.log('   - npm run ai-recommend');
    console.log('\n🔍 To check authentication status: npm run auth-status');
    return;
  }

  console.log('🚀 Starting authentication process...\n');

  try {
    const success = await authService.authenticate();
    
    if (success) {
      console.log('\n🎉 Authentication successful!');
      console.log('\n✅ You can now use the AI recommendation system:');
      console.log('   - npm run ai-recommend-shows    # Get TV show recommendations');
      console.log('   - npm run ai-recommend-movies   # Get movie recommendations');
      console.log('   - npm run ai-recommend          # Get both movies and TV shows');
      console.log('\n🧹 Other useful commands:');
      console.log('   - npm run cleanup-not-interested # Clean up "not interested" items');
      console.log('   - npm run scan-bookmarks         # Sync bookmarks to local database');
      console.log('   - npm run rate-content           # Rate your watched content');
    } else {
      console.error('\n❌ Authentication failed!');
      console.error('Please check your internet connection and try again.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Authentication error:', error);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  authenticate().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { authenticate };