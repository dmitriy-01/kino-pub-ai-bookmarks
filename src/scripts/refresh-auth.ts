#!/usr/bin/env node

import { AuthenticationService } from '../services/auth';

/**
 * Refresh authentication tokens
 */
async function refreshAuth(): Promise<void> {
  console.log('🔄 Refreshing authentication tokens...');

  const authService = new AuthenticationService();

  try {
    // Check current status
    const isAuthenticated = authService.isAuthenticated();
    console.log(`Current status: ${isAuthenticated ? 'AUTHENTICATED' : 'EXPIRED/NOT AUTHENTICATED'}`);

    if (isAuthenticated) {
      console.log('✅ Tokens are still valid, no refresh needed.');
      return;
    }

    // Try to refresh
    console.log('🔄 Attempting to refresh tokens...');
    const refreshed = await authService.refreshSession();

    if (refreshed) {
      console.log('✅ Tokens refreshed successfully!');
      
      // Verify the refresh worked
      const nowAuthenticated = authService.isAuthenticated();
      console.log(`New status: ${nowAuthenticated ? 'AUTHENTICATED' : 'STILL EXPIRED'}`);
      
      if (nowAuthenticated) {
        console.log('🎉 Authentication is now working!');
        console.log('\n💡 You can now run:');
        console.log('   - npm run ai-recommend-shows');
        console.log('   - npm run manage-not-interested sync');
        console.log('   - npm run cleanup-not-interested');
      }
    } else {
      console.log('❌ Token refresh failed.');
      console.log('💡 You need to re-authenticate: npm run authenticate');
    }

  } catch (error) {
    console.error('❌ Error during token refresh:', error);
    console.log('💡 You need to re-authenticate: npm run authenticate');
  }
}

// Run the script if called directly
if (require.main === module) {
  refreshAuth().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { refreshAuth };