import Anthropic from '@anthropic-ai/sdk';
import { WatchedItem, BookmarkedItem } from './database';

export class AnthropicClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({
      apiKey: key,
    });
  }

  /**
   * Generate recommendations based on watched items with user preferences and existing bookmarks
   */
  async generateRecommendations(
    watchedItems: WatchedItem[],
    bookmarkedItems: BookmarkedItem[],
    contentType: 'movie' | 'serial' | 'both' = 'both'
  ): Promise<string[]> {
    const prompt = this.buildRecommendationPrompt(watchedItems, bookmarkedItems, contentType);

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-latest',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return this.parseRecommendations(content.text);
      }

      throw new Error('Unexpected response format from Anthropic API');
    } catch (error) {
      console.error('Error generating recommendations:', error);
      throw error;
    }
  }

  private buildRecommendationPrompt(
    watchedItems: WatchedItem[],
    bookmarkedItems: BookmarkedItem[],
    contentType: 'movie' | 'serial' | 'both'
  ): string {
    // Separate items by rating and notes
    const lovedItems = watchedItems.filter(item =>
      item.userRating && item.userRating >= 8
    );
    const likedItems = watchedItems.filter(item =>
      item.userRating && item.userRating >= 6 && item.userRating < 8
    );
    const dislikedItems = watchedItems.filter(item =>
      item.userRating && item.userRating < 6
    );
    
    // Separate unrated items by watch progress confidence
    const unratedItems = watchedItems.filter(item => !item.userRating);
    
    const getWatchProgress = (item: WatchedItem) => {
      if (item.fullyWatched) return 1.0;
      if (item.type === 'movie') return 1.0; // Movies in watching list are likely completed
      if (item.totalEpisodes && item.watchedEpisodes) {
        return item.watchedEpisodes / item.totalEpisodes;
      }
      return 0;
    };

    const highConfidenceItems = unratedItems.filter(item => {
      const progress = getWatchProgress(item);
      return progress >= 0.9; // 90%+ watched
    });

    const goodConfidenceItems = unratedItems.filter(item => {
      const progress = getWatchProgress(item);
      return progress >= 0.75 && progress < 0.9; // 75-89% watched
    });

    const mediumConfidenceItems = unratedItems.filter(item => {
      const progress = getWatchProgress(item);
      return progress >= 0.5 && progress < 0.75; // 50-74% watched
    });

    const lowConfidenceItems = unratedItems.filter(item => {
      const progress = getWatchProgress(item);
      return progress >= 0.25 && progress < 0.5; // 25-49% watched
    });

    const formatItem = (item: WatchedItem, includeProgress: boolean = false) => {
      const yearStr = item.year ? ` (${item.year})` : '';
      const ratingStr = item.userRating ? ` [Rating: ${item.userRating}/10]` : '';
      
      let progressStr = '';
      if (includeProgress && !item.fullyWatched) {
        const progress = getWatchProgress(item);
        const percentage = Math.round(progress * 100);
        progressStr = ` [${percentage}% watched]`;
      }
      
      return `${item.title}${yearStr}${ratingStr}${progressStr}`;
    };

    const bookmarkedTitles = bookmarkedItems.map(item => {
      const yearStr = item.year ? ` (${item.year})` : '';
      return `${item.title}${yearStr}`;
    });

    const contentTypeText = contentType === 'both' ? 'movies and TV shows' :
      contentType === 'movie' ? 'movies' : 'TV shows';

    let prompt = `Based on my viewing history and preferences, please recommend ${contentTypeText} I would enjoy.\n\n`;

    if (lovedItems.length > 0) {
      prompt += `CONTENT I LOVED (8-10/10):\n${lovedItems.map(item => formatItem(item)).join('\n')}\n\n`;
    }

    if (likedItems.length > 0) {
      prompt += `CONTENT I LIKED (6-7/10):\n${likedItems.map(item => formatItem(item)).join('\n')}\n\n`;
    }

    if (dislikedItems.length > 0) {
      prompt += `CONTENT I DISLIKED (1-5/10) - AVOID SIMILAR:\n${dislikedItems.map(item => formatItem(item)).join('\n')}\n\n`;
    }

    if (highConfidenceItems.length > 0) {
      prompt += `HIGHLY WATCHED CONTENT (90-100% completed) - Strong preference indicators:\n${highConfidenceItems.map(item => formatItem(item, true)).join('\n')}\n\n`;
    }

    if (goodConfidenceItems.length > 0) {
      prompt += `WELL WATCHED CONTENT (75-89% completed) - Good preference indicators:\n${goodConfidenceItems.map(item => formatItem(item, true)).join('\n')}\n\n`;
    }

    if (mediumConfidenceItems.length > 0) {
      prompt += `MODERATELY WATCHED CONTENT (50-74% completed) - Moderate preference indicators:\n${mediumConfidenceItems.map(item => formatItem(item, true)).join('\n')}\n\n`;
    }

    if (lowConfidenceItems.length > 0) {
      prompt += `PARTIALLY WATCHED CONTENT (25-49% completed) - Weak preference indicators:\n${lowConfidenceItems.map(item => formatItem(item, true)).join('\n')}\n\n`;
    }

    if (bookmarkedTitles.length > 0) {
      prompt += `ALREADY BOOKMARKED - DO NOT RECOMMEND THESE:\n${bookmarkedTitles.join('\n')}\n\n`;
    }

    // Create a comprehensive exclusion list
    const allWatchedTitles = watchedItems.map(item => {
      const yearStr = item.year ? ` (${item.year})` : '';
      return `${item.title}${yearStr}`;
    });

    const allExcludedTitles = [...allWatchedTitles, ...bookmarkedTitles];

    if (allExcludedTitles.length > 0) {
      prompt += `COMPLETE EXCLUSION LIST - NEVER RECOMMEND ANY OF THESE:\n${allExcludedTitles.join('\n')}\n\n`;
    }

    prompt += `Please recommend 8-12 ${contentTypeText} that I would likely enjoy based on my preferences. Consider:
1. My ratings to understand what I like/dislike
2. Patterns in genres, themes, and styles I enjoy
3. Weight preferences by watch completion percentage:
   - Highly watched content (90-100%) = strongest preference indicators
   - Well watched content (75-89%) = strong preference indicators  
   - Moderately watched content (50-74%) = moderate preference indicators
   - Partially watched content (25-49%) = weak preference indicators
4. Avoid content similar to what I disliked
5. NEVER recommend anything from the EXCLUSION LIST above
6. Include both popular and hidden gems
7. Mix of recent releases and classics
8. Focus on internationally popular content that would be available on streaming platforms

IMPORTANT RESTRICTIONS:
- DO NOT recommend any anime, animated series, or Japanese animation content
- Focus on live-action content only
- Provide titles in English only for consistency with search

Format your response as a simple list, one per line:
Title (Year)

Do not include explanations, just the list.`;

    return prompt;
  }

  private parseRecommendations(text: string): string[] {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.includes('(') && line.includes(')'))
      .slice(0, 12); // Allow up to 12 recommendations
  }
}