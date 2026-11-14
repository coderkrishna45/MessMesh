import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import dbConnect from './db';
import User from './models/User';
import bcrypt from 'bcryptjs';
import { checkDemoLimit } from '@/lib/demoLimits';
import { canUseDemoLogin } from '@/lib/accessPolicy';

const providers = [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Username / Email', type: 'text' },
      password: { label: 'Password', type: 'password' },
      demoRole: { label: 'Demo role', type: 'text' },
    },
    async authorize(credentials, request) {
      await dbConnect();

      if (credentials?.demoRole) {
        const role = credentials.demoRole;
        if (
          process.env.DEMO_MODE !== 'true' ||
          !['ADMIN', 'WARDEN', 'STUDENT'].includes(role)
        ) {
          throw new Error('Demo login is unavailable');
        }
        const forwarded =
          request?.headers?.['x-forwarded-for'] ||
          request?.headers?.get?.('x-forwarded-for') ||
          request?.headers?.['x-real-ip'] ||
          'unknown';
        const limit = await checkDemoLimit(`login:${String(forwarded).split(',')[0].trim()}`, 12);
        if (!limit.allowed) throw new Error('Too many demo login attempts. Try again shortly.');
        const demoUser = await User.findOne({
          role,
          isDemoAccount: true,
          active: { $ne: false },
        });
        if (!canUseDemoLogin(process.env, role, demoUser)) {
          throw new Error('This demo role is not initialized');
        }
        return {
          id: demoUser._id.toString(),
          name: demoUser.name,
          email: demoUser.email,
          role: demoUser.role,
          wing: demoUser.wing,
          cleanPlateScore: demoUser.cleanPlateScore,
          needsPasswordChange: demoUser.needsPasswordChange || false,
          authVersion: demoUser.authVersion || 0,
          isDemoAccount: true,
          isDemoData: demoUser.isDemoData || true,
        };
      }

      if (!credentials?.email || !credentials?.password) {
        throw new Error('Please enter username/email and password');
      }

      // Query by email OR roll number
      const user = await User.findOne({
        $or: [
          { email: credentials.email.toLowerCase().trim() },
          { rollNumber: credentials.email.trim() },
        ],
      });

      if (!user) {
        throw new Error('No user found with this email or roll number');
      }

      const isValid = await bcrypt.compare(credentials.password, user.password);
      if (!isValid) {
        throw new Error('Incorrect password');
      }
      if (user.active === false) {
        throw new Error('This account is inactive');
      }

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        wing: user.wing,
        cleanPlateScore: user.cleanPlateScore,
        needsPasswordChange: user.needsPasswordChange || false,
        authVersion: user.authVersion || 0,
        isDemoAccount: user.isDemoAccount || false,
        isDemoData: user.isDemoData || false,
      };
    },
  }),
];

// Only register Google when real credentials exist (avoids mock-id in production)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const authOptions = {
  providers,
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.wing = user.wing;
        token.cleanPlateScore = user.cleanPlateScore;
        token.needsPasswordChange = user.needsPasswordChange;
        token.authVersion = user.authVersion;
        token.isDemoAccount = user.isDemoAccount;
        token.isDemoData = user.isDemoData;
      }

      if (trigger === 'update' && session) {
        if (session.cleanPlateScore !== undefined) {
          token.cleanPlateScore = session.cleanPlateScore;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.wing = token.wing;
        session.user.cleanPlateScore = token.cleanPlateScore;
        session.user.needsPasswordChange = token.needsPasswordChange;
        session.user.authVersion = token.authVersion;
        session.user.isDemoAccount = token.isDemoAccount;
        session.user.isDemoData = token.isDemoData;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
export default authOptions;
