import User from './../../models/user.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { SignupArgs, LoginArgs, CompleteProfileArgs } from "../../utils/types.js"
import { generateToken } from "../../services/authServices.js"
import bcrypt from "bcryptjs"



export default {
  Query: {
    me: (_: unknown, __: unknown, context: Context) => {
      authCheck(context);

      // if user doesn't exist show an error of user not found
      if (!context.user) {
        throw new GraphQLError('User not found', {
          extensions: { code: 'USER_NOT_FOUND' },
        });
      }

      // return user data if exist
      return context.user;
    },
  },

  Mutation: {
    //SIGNUP MUTATION
      signup: async (_: unknown, { input }: SignupArgs) => {

          const { firstName, lastName, password, gender, agreeToTerms } = input

          //normalize email so we don't create duplicates with different casing
          const email = input.email.trim().toLowerCase()

      try {
        //user must accept the terms before we create an account
        if (!agreeToTerms) {
          throw new GraphQLError('You must agree to the terms to sign up', {
            extensions: { code: 'TERMS_NOT_ACCEPTED' },
          });
        }

        //find user by email in db
        const existUser = await User.findOne({ email });

        //check if user exists throw error of existing user with same email
        if (existUser) {
          throw new GraphQLError('User already exists', {
            extensions: { code: 'USER_ALREADY_EXISTS' },
          });
        }

        //hash user's password to make it hard to hack it
        const hashedPassword = await bcrypt.hash(password, 10);

        // create a user with hashed password and record when they agreed to the terms
        const user = new User({ firstName, lastName, email, password: hashedPassword, gender, agreedToTerms: true, agreedToTermsAt: new Date() });

        // save user to database
        await user.save();

        // generate token for the user with they id
        const token = generateToken(user.id);

        //return user object and user's token
        return { token, user };
      } catch (error: any) {
        if (error?.code === 11000) {
          throw new GraphQLError('User already exists', {
            extensions: { code: 'USER_ALREADY_EXISTS' },
          });
        }

        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while creating account', {
          extensions: { code: 'SIGNUP_FAILED' },
        });
      }
    },

    //LOGIN MUTATION
      login: async (_: unknown, { input }: LoginArgs) => {

          const { password } = input

          //normalize email the same way we do on signup
          const email = input.email.trim().toLowerCase()

      try {
        //find user by email, pull the password back in since it's select: false
        const user = await User.findOne({ email }).select('+password');

        //keep the message generic so we don't leak which part was wrong
        if (!user) {
          throw new GraphQLError('Invalid email or password', {
            extensions: { code: 'INVALID_CREDENTIALS' },
          });
        }

        //compare the plain password with the stored hash
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
          throw new GraphQLError('Invalid email or password', {
            extensions: { code: 'INVALID_CREDENTIALS' },
          });
        }

        // generate token for the user with they id
        const token = generateToken(user.id);

        //return user object and user's token
        return { token, user };
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while logging in', {
          extensions: { code: 'LOGIN_FAILED' },
        });
      }
    },

    //COMPLETE PROFILE MUTATION
      completeProfile: async (_: unknown, { input }: CompleteProfileArgs, context: Context) => {

          //make sure the user is logged in before updating profile
          authCheck(context);

          const { image, height, weight, religion } = input

      try {
        //grab the logged in user from context
        const user = context.user!;

        //only update the fields the user actually sent
        if (image !== undefined) user.set('image', image);
        if (height !== undefined) user.set('height', height);
        if (weight !== undefined) user.set('weight', weight);
        if (religion !== undefined) user.set('religion', religion);

        // save updated user to database
        await user.save();

        //return the updated user
        return user;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        //mongoose enum errors (bad gender/religion value) land here
        if (error?.name === 'ValidationError') {
          throw new GraphQLError('Invalid profile data', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        throw new GraphQLError('Unexpected error while updating profile', {
          extensions: { code: 'PROFILE_UPDATE_FAILED' },
        });
      }
    },

    //UPGRADE TO PREMIUM MUTATION
      upgradeToPremium: async (_: unknown, __: unknown, context: Context) => {

          //must be logged in to upgrade
          authCheck(context);

      try {
        //flip the logged in user's plan to premium
        const user = context.user!;

        user.set('plan', 'premium');

        // save updated user to database
        await user.save();

        //return the updated user
        return user;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while upgrading plan', {
          extensions: { code: 'UPGRADE_FAILED' },
        });
      }
    },
  },
};
