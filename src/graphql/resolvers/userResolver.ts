import User from './../../models/user.js';
import type { Context } from "../context.js"
import { authCheck } from './../../services/authServices.js';
import { GraphQLError } from 'graphql';
import type { SignupArgs, LoginArgs, CompleteProfileArgs, ChangePasswordArgs, RequestPasswordResetArgs, ResetPasswordArgs } from "../../utils/types.js"
import { sendMail, passwordResetEmail } from "../../services/mailService.js"
import crypto from "node:crypto"
import { generateToken } from "../../services/authServices.js"
import { assertValidEmail, assertValidPassword, assertValidName, assertInRange } from "../../utils/validation.js"
import { hit } from "../../middleware/rateLimit.js"
import { envConf } from "../../config/envConf.js"
import bcrypt from "bcryptjs"

//max length of an inline base64 avatar (~110KB of image data once decoded).
//the app targets ~20KB, so this is a safety net, not the normal case.
const MAX_IMAGE_CHARS = 150_000;

//a bcrypt hash of a value nobody will ever submit. Used to burn the same time
//on a missing account as on a real one, so response speed can't be used to
//discover which emails are registered.
const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

//how many failed logins one email may collect before we stop trying.
//This sits alongside the per-IP limit: that one stops a flood from one machine,
//this one stops a slow attack spread across many machines against one account.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

//password reset
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_WINDOW_MS = 60 * 60 * 1000;
const RESET_MAX_REQUESTS = 5;

//store only the hash, never the token itself
const hashResetToken = (token: string) =>
    crypto.createHash('sha256').update(token).digest('hex');



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

        //the app checks these too, but the app isn't a security boundary —
        //anyone can call this mutation directly
        assertValidEmail(email);
        assertValidPassword(password);
        assertValidName(firstName, 'First name');
        assertValidName(lastName, 'Last name');

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
        const token = generateToken(user.id, user.get('tokenVersion') ?? 0);

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
        //lock the account out after too many failed attempts, regardless of
        //which machine they come from
        const attempts = hit(`login:${email}`, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS);

        if (!attempts.allowed) {
          throw new GraphQLError('Too many failed attempts. Please try again later.', {
            extensions: { code: 'TOO_MANY_ATTEMPTS' },
          });
        }

        //find user by email, pull the password back in since it's select: false
        const user = await User.findOne({ email }).select('+password');

        //Always run a bcrypt compare, even when there's no such account. Without
        //this, a missing email answers noticeably faster than a wrong password,
        //which is enough to enumerate who has an account here — and for a health
        //app, "does this person use it" is itself sensitive.
        const isMatch = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

        //keep the message generic so we don't leak which part was wrong
        if (!user || !isMatch) {
          throw new GraphQLError('Invalid email or password', {
            extensions: { code: 'INVALID_CREDENTIALS' },
          });
        }

        // generate token for the user with they id
        const token = generateToken(user.id, user.get('tokenVersion') ?? 0);

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

    //LOGOUT MUTATION — retires every token this account has issued
    logout: async (_: unknown, __: unknown, context: Context) => {
      authCheck(context);

      try {
        const user = context.user!;

        //bumping the version is what actually invalidates the token. The app
        //also drops it from secure storage, but that alone would leave a copied
        //token working for the rest of its 7 days.
        user.set('tokenVersion', (user.get('tokenVersion') ?? 0) + 1);

        await user.save();

        return true;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while logging out', {
          extensions: { code: 'LOGOUT_FAILED' },
        });
      }
    },

    //CHANGE PASSWORD — requires the current one, so a stolen phone with an
    //unlocked session can't silently take the account over
    changePassword: async (_: unknown, { input }: ChangePasswordArgs, context: Context) => {
      authCheck(context);

      const { currentPassword, newPassword } = input

      try {
        assertValidPassword(newPassword);

        if (currentPassword === newPassword) {
          throw new GraphQLError('Please choose a different password', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        //context.user was loaded without the password, so fetch it again
        const user = await User.findById(context.user!.id).select('+password');

        if (!user) {
          throw new GraphQLError('User not found', {
            extensions: { code: 'USER_NOT_FOUND' },
          });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
          throw new GraphQLError('Current password is incorrect', {
            extensions: { code: 'INVALID_CREDENTIALS' },
          });
        }

        user.set('password', await bcrypt.hash(newPassword, 10));

        //changing a password must sign out every other device — that is the
        //whole point of changing it after a suspected compromise
        user.set('tokenVersion', (user.get('tokenVersion') ?? 0) + 1);

        await user.save();

        //hand back a fresh token so the device doing the change stays signed in
        const token = generateToken(user.id, user.get('tokenVersion'));

        return { token, user };
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        throw new GraphQLError('Unexpected error while changing password', {
          extensions: { code: 'PASSWORD_CHANGE_FAILED' },
        });
      }
    },

    //REQUEST A RESET CODE
    requestPasswordReset: async (_: unknown, { email: rawEmail }: RequestPasswordResetArgs) => {
      const email = rawEmail.trim().toLowerCase()

      try {
        //cap requests per address so this can't be used to spam someone's inbox
        const attempts = hit(`reset:${email}`, RESET_WINDOW_MS, RESET_MAX_REQUESTS);

        if (!attempts.allowed) {
          throw new GraphQLError('Too many reset requests. Please try again later.', {
            extensions: { code: 'TOO_MANY_ATTEMPTS' },
          });
        }

        const user = await User.findOne({ email });

        //ALWAYS return true, even when there's no such account. Saying "no user
        //with that email" would turn this into a way to find out who is
        //registered — and for a health app that is itself private information.
        if (!user) {
          return true;
        }

        //raw token goes to the user, only its hash is stored
        const token = crypto.randomBytes(32).toString('hex');

        user.set('passwordResetTokenHash', hashResetToken(token));
        user.set('passwordResetExpires', new Date(Date.now() + RESET_TOKEN_TTL_MS));

        await user.save();

        const mail = passwordResetEmail(token);

        await sendMail({ to: email, subject: mail.subject, body: mail.body });

        return true;
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        //mail not configured, or the provider is down
        if (error?.message === 'MAIL_NOT_CONFIGURED') {
          throw new GraphQLError('Password reset is not available yet. Please contact support.', {
            extensions: { code: 'RESET_UNAVAILABLE' },
          });
        }

        throw new GraphQLError('Unexpected error while requesting a reset', {
          extensions: { code: 'RESET_REQUEST_FAILED' },
        });
      }
    },

    //COMPLETE THE RESET WITH THE CODE FROM THE EMAIL
    resetPassword: async (_: unknown, { input }: ResetPasswordArgs) => {
      const { token, newPassword } = input
      const email = input.email.trim().toLowerCase()

      try {
        assertValidPassword(newPassword);

        const user = await User.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpires +password');

        const storedHash = user?.get('passwordResetTokenHash');
        const expires = user?.get('passwordResetExpires');

        const isValid =
          !!user &&
          !!storedHash &&
          !!expires &&
          expires.getTime() > Date.now() &&
          //constant-time compare so the code can't be guessed byte by byte
          crypto.timingSafeEqual(
            Buffer.from(hashResetToken(token), 'hex'),
            Buffer.from(storedHash, 'hex'),
          );

        if (!isValid) {
          throw new GraphQLError('That reset code is invalid or has expired', {
            extensions: { code: 'INVALID_RESET_TOKEN' },
          });
        }

        user.set('password', await bcrypt.hash(newPassword, 10));

        //single use — clear it so the same code can't be replayed
        user.set('passwordResetTokenHash', undefined);
        user.set('passwordResetExpires', undefined);

        //whoever reset the password gets the account; everyone else is signed out
        user.set('tokenVersion', (user.get('tokenVersion') ?? 0) + 1);

        await user.save();

        const authToken = generateToken(user.id, user.get('tokenVersion'));

        return { token: authToken, user };
      } catch (error: any) {
        if (error instanceof GraphQLError) {
          throw error;
        }

        //timingSafeEqual throws when the buffers differ in length, which just
        //means a malformed code was submitted
        throw new GraphQLError('That reset code is invalid or has expired', {
          extensions: { code: 'INVALID_RESET_TOKEN' },
        });
      }
    },

    //COMPLETE PROFILE MUTATION
      completeProfile: async (_: unknown, { input }: CompleteProfileArgs, context: Context) => {

          //make sure the user is logged in before updating profile
          authCheck(context);

          const { firstName, lastName, image, height, weight, religion } = input

      try {
        //grab the logged in user from context
        const user = context.user!;

        //names can be edited later, but they can't be blanked out
        if (firstName !== undefined && !firstName.trim()) {
          throw new GraphQLError('First name cannot be empty', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }
        if (lastName !== undefined && !lastName.trim()) {
          throw new GraphQLError('Last name cannot be empty', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        //we only store an image URL (the app uploads the photo to cloudinary
        //first) — reject anything that isn't an http(s) link so base64 blobs
        //can't bloat the database
        if (image !== undefined && image !== null && image !== '') {
          //we accept either a hosted URL (if we move to a CDN later) or a small
          //inline base64 image — the app downsizes avatars before sending
          const isUrl = /^https?:\/\/\S+$/i.test(image);
          const isDataImage = /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image);

          if (!isUrl && !isDataImage) {
            throw new GraphQLError('Image must be a URL or a base64 image', {
              extensions: { code: 'BAD_USER_INPUT' },
            });
          }

          //hard cap so a big photo can't bloat the database (~110KB of binary)
          if (isDataImage && image.length > MAX_IMAGE_CHARS) {
            throw new GraphQLError('Image is too large. Please choose a smaller photo.', {
              extensions: { code: 'IMAGE_TOO_LARGE' },
            });
          }
        }

        //bounds so a typo can't poison the BMI shown on the habits screen
        if (height !== undefined && height !== null) assertInRange(height, 30, 260, 'Height');
        if (weight !== undefined && weight !== null) assertInRange(weight, 2, 500, 'Weight');

        //only update the fields the user actually sent
        if (firstName !== undefined) user.set('firstName', firstName.trim());
        if (lastName !== undefined) user.set('lastName', lastName.trim());
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
        //THIS GRANTS A PAID PLAN FOR FREE. There is no payment step yet, so any
        //logged-in user could call it and unlock premium. It stays available for
        //testing, but has to be switched on deliberately — never in production
        //until a real payment check sits in front of it.
        if (!envConf.ALLOW_SELF_UPGRADE) {
          throw new GraphQLError('Upgrades are not available yet', {
            extensions: { code: 'UPGRADE_UNAVAILABLE' },
          });
        }

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
