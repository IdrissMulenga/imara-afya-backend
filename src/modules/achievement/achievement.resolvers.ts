import * as achievementService from './achievement.service.js';
import { withUser } from '../../shared/resolve.js';

export const achievementResolvers = {
  Query: {
    achievements: withUser((user) => achievementService.getAchievements(user)),
  },
};
