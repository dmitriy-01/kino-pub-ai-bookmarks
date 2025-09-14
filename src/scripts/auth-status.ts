#!/usr/bin/env node

import { AuthenticationService } from '../services/auth';
import { KinoPubClient } from '../services/kino-pub-client';

/**
 * Check authentication status
 */
async function checkAuthStatus(): Promise<void> {
  console.log('🔍 Kino.pub Authentication Status');
  console.log('=================================\n');

  const authService = new AuthenticationService();
  const client = new KinoPubClient();

  const isAuthenticated = authService.isAuthenticated();

  if (isAuthenticated) {
    console.log('✅ Status: AUTHENTICATED');
    
    try {
      // Test API access
      console.log('🧪 Testing API access...');
      await client.getBookmarkFolders();
      console.log('✅ API Access: WORKING');
      
      console.log('\n🎯 Available commands:');
      console.log('   - npm run ai-recommend-shows    # Get TV show recommendations');
      console.log('   - npm run ai-recommend-movies   # Get movie recommendations');
      console.log('   - npm run ai-recommend          # Get both movies and TV shows');
      console.log('   - npm run cleanup-not-interested # Clean up "not interested" items');
      console.log('   - npm run scan-bookmarks         # Sync bookmarks to local database');
      console.log('   - npm run rate-content           # Rate your watched content');
      
    } catch (error) {
      console.log('❌ API Access: FAILED');
      console.log('🔄 Your authentication may have expired.');
      console.log('💡 Run "npm run authenticate" to re-authenticate.');
    }
  } else {
    console.log('❌ Status: NOT AUTHENTICATED');
    console.log('\n🔄 Attempting to refresh tokens...');
    
    try {
      const authService = new AuthenticationService();
      const refreshed = await authService.refreshSession();
      if (refreshed) {
        console.log('✅ Tokens refreshed successfully!');
        console.log('✅ Authentication Status: AUTHENTICATED (after refresh)');
        console.log('\n🎯 Available commands:');
        console.log('   - npm run ai-recommend-shows    # Get TV show recommendations');
        console.log('   - npm run ai-recommend-movies   # Get movie recommendations');
        console.log('   - npm run ai-recommend          # Get both movies and TV shows');
        console.log('   - npm run cleanup-not-interested # Clean up "not interested" items');
      } else {
        console.log('❌ Token refresh failed.');
        console.log('\n🔐 To authenticate, run:');
        console.log('   npm run authenticate');
        console.log('\n📖 This will:');
        console.log('   1. Show you a kino.pub URL to visit');
        console.log('   2. Give you a code to enter on the website');
        console.log('   3. Wait for you to authorize the application');
        console.log('   4. Save your authentication tokens locally');
      }
    } catch (error) {
      console.log('❌ Token refresh failed.');
      console.log('\n🔐 To authenticate, run:');
      console.log('   npm run authenticate');
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  checkAuthStatus().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { checkAuthStatus };